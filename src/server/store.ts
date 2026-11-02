import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { MemoryEvent, MemoryReceipt } from '../../contracts/domain-contracts.js';
import { ApiError } from './errors.js';
export interface PreparedEvent {event:MemoryEvent;canonicalJson:string;eventHash:string;textSha256:string;memoryText:string}
export interface Operation {operationId:string;eventId:string;scopeId:string;operationKey:string;namespace:string;memoryText:string;payloadHash:string;jobId:string|null;state:string;attempts:number;leaseToken?:string;}
export interface MutationResult {operationId:string;eventIds:string[];durableVersion:number;pendingSequence:number;state:string}
export interface LedgerStore {
 readonly kind:'postgres'|'ephemeral-synthetic';
 events(scope:string):Promise<MemoryEvent[]>;
 lookup(scope:string,key:string,hash:string):Promise<MutationResult|null>;
 version(scope:string):Promise<number>;
 enqueue(scope:string,key:string,requestHash:string,expectedVersion:number,build:(events:MemoryEvent[])=>PreparedEvent):Promise<MutationResult>;
 operation(scope:string,id:string):Promise<Operation|null>;
 operationByKey(scope:string,key:string):Promise<Operation|null>;
 pendingOperation(scope:string):Promise<Operation|null>;
 claim(scope?:string):Promise<Operation|null>;
 update(op:Operation,state:string,jobId?:string,error?:string):Promise<void>;
 complete(op:Operation,receipt:MemoryReceipt):Promise<void>;
}
function mapOp(r:any):Operation {return {operationId:r.operation_id,eventId:r.event_id,scopeId:r.scope_id,operationKey:r.operation_key,namespace:r.namespace,memoryText:r.memory_text,payloadHash:r.payload_hash,jobId:r.job_id,state:r.state,attempts:r.attempts,leaseToken:r.lease_token};}
export class PostgresStore implements LedgerStore {
 readonly kind='postgres' as const;
 constructor(readonly pool:Pool,private limits={ownerLimit:40,scopeLimit:20}){if(!Number.isInteger(limits.ownerLimit)||limits.ownerLimit<1||limits.ownerLimit>40||!Number.isInteger(limits.scopeLimit)||limits.scopeLimit<1||limits.scopeLimit>20)throw new Error('INVALID_WRITE_LIMITS');}
 async lookup(scope:string,key:string,hash:string){const r=await this.pool.query('SELECT request_hash,response_json FROM request_idempotency WHERE scope_id=$1 AND operation_key=$2',[scope,key]);if(!r.rowCount)return null;if(r.rows[0].request_hash!==hash)throw new ApiError('IDEMPOTENCY_CONFLICT',409);return r.rows[0].response_json as MutationResult;}
 async ensureScope(id:string,owner:string,namespace:string){await this.pool.query('INSERT INTO scopes(id,memory_account_id,namespace) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,owner,namespace]);const r=await this.pool.query('SELECT * FROM scopes WHERE id=$1',[id]);if(r.rows[0].memory_account_id!==owner||r.rows[0].namespace!==namespace)throw new Error('SCOPE_CONFIGURATION_MISMATCH');}
 async events(scope:string){const r=await this.pool.query("SELECT canonical_json FROM events WHERE scope_id=$1 AND durable_status='done' ORDER BY sequence",[scope]);return r.rows.map(r=>JSON.parse(r.canonical_json) as MemoryEvent);}
 async version(scope:string){const r=await this.pool.query('SELECT last_durable_sequence FROM scopes WHERE id=$1',[scope]);if(!r.rowCount)throw new ApiError('SCOPE_NOT_FOUND',404);return r.rows[0].last_durable_sequence as number;}
 private async tx<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async enqueue(scope:string,key:string,hash:string,expected:number,build:(events:MemoryEvent[])=>PreparedEvent){return this.tx(async c=>{
 const sr=await c.query('SELECT * FROM scopes WHERE id=$1 FOR UPDATE',[scope]);if(!sr.rowCount)throw new ApiError('SCOPE_NOT_FOUND',404);const s=sr.rows[0];await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[s.memory_account_id]);
 const prior=await c.query('SELECT * FROM request_idempotency WHERE scope_id=$1 AND operation_key=$2',[scope,key]);if(prior.rowCount){if(prior.rows[0].request_hash!==hash)throw new ApiError('IDEMPOTENCY_CONFLICT',409);return prior.rows[0].response_json as MutationResult;}
 if(s.frozen_version)throw new ApiError('SCOPE_FROZEN',409);
 const budget=await c.query('SELECT count(*)::int AS n FROM memory_outbox o JOIN scopes s ON s.id=o.scope_id WHERE s.memory_account_id=$1',[s.memory_account_id]);if(budget.rows[0].n>=this.limits.ownerLimit)throw new ApiError('OWNER_WRITE_BUDGET_EXCEEDED',409);
 const scopedBudget=await c.query('SELECT count(*)::int AS n FROM memory_outbox WHERE scope_id=$1',[scope]);if(scopedBudget.rows[0].n>=this.limits.scopeLimit)throw new ApiError('SCOPE_WRITE_BUDGET_EXCEEDED',409);
 const pending=await c.query("SELECT operation_id FROM memory_outbox WHERE scope_id=$1 AND state<>'done'",[scope]);if(pending.rowCount)throw new ApiError('MEMORY_PENDING',409,{operationId:pending.rows[0].operation_id});
 if(s.last_durable_sequence!==expected)throw new ApiError('VERSION_CONFLICT',409,{currentVersion:s.last_durable_sequence});
 const history=await c.query('SELECT canonical_json FROM events WHERE scope_id=$1 ORDER BY sequence',[scope]);const p=build(history.rows.map(r=>JSON.parse(r.canonical_json)));
 if(p.event.scopeId!==scope||p.event.sequence!==s.last_allocated_sequence+1)throw new Error('INVALID_EVENT_ALLOCATION');const id=randomUUID();
 await c.query('INSERT INTO events(event_id,scope_id,sequence,canonical_json,event_hash,text_sha256) VALUES($1,$2,$3,$4,$5,$6)',[p.event.eventId,scope,p.event.sequence,p.canonicalJson,p.eventHash,p.textSha256]);
 await c.query("INSERT INTO memory_outbox(operation_id,event_id,scope_id,operation_key,payload_hash,namespace,memory_text,state) VALUES($1,$2,$3,$4,$5,$6,$7,'prepared')",[id,p.event.eventId,scope,key,p.textSha256,s.namespace,p.memoryText]);
 await c.query('UPDATE scopes SET last_allocated_sequence=$2 WHERE id=$1',[scope,p.event.sequence]);
 const response={operationId:id,eventIds:[p.event.eventId],durableVersion:s.last_durable_sequence,pendingSequence:p.event.sequence,state:'prepared'};
 await c.query('INSERT INTO request_idempotency VALUES($1,$2,$3,$4,202)',[scope,key,hash,response]);return response;
 });}
 async operationByKey(scope:string,key:string){const r=await this.pool.query('SELECT * FROM memory_outbox WHERE scope_id=$1 AND operation_key=$2',[scope,key]);return r.rowCount?mapOp(r.rows[0]):null;}
 async pendingOperation(scope:string){const r=await this.pool.query("SELECT * FROM memory_outbox WHERE scope_id=$1 AND state<>'done' LIMIT 1",[scope]);return r.rowCount?mapOp(r.rows[0]):null;}
 async operation(scope:string,id:string){const r=await this.pool.query('SELECT * FROM memory_outbox WHERE scope_id=$1 AND operation_id=$2',[scope,id]);return r.rowCount?mapOp(r.rows[0]):null;}
 async claim(scope?:string){return this.tx(async c=>{
 await c.query("UPDATE memory_outbox SET state='blocked',lease_until=NULL,lease_token=NULL,last_error='POLL_ATTEMPT_LIMIT_REQUIRES_RECONCILIATION' WHERE attempts>=60 AND state IN ('prepared','accepted','pending','running','uploaded','retry_wait','unknown') AND (lease_until IS NULL OR lease_until<now()) AND ($1::text IS NULL OR scope_id=$1)",[scope??null]);
 // A crashed submitting call without a saved job is uncertain; never blindly resubmit.
 await c.query("UPDATE memory_outbox SET state='unknown',lease_until=NULL,lease_token=NULL,last_error='SUBMISSION_OUTCOME_UNKNOWN' WHERE state='submitting' AND job_id IS NULL AND lease_until<now() AND ($1::text IS NULL OR scope_id=$1)",[scope??null]);
 const r=await c.query("SELECT o.* FROM memory_outbox o JOIN scopes s ON s.id=o.scope_id JOIN events e ON e.event_id=o.event_id WHERE o.state IN ('prepared','accepted','pending','running','uploaded','retry_wait','unknown') AND (o.state<>'unknown' OR o.job_id IS NOT NULL) AND (o.next_attempt_at IS NULL OR o.next_attempt_at<=now()) AND (o.lease_until IS NULL OR o.lease_until<now()) AND e.sequence=s.last_durable_sequence+1 AND ($1::text IS NULL OR o.scope_id=$1) ORDER BY e.sequence FOR UPDATE OF o SKIP LOCKED LIMIT 1",[scope??null]);if(!r.rowCount)return null;const token=randomUUID();const u=await c.query("UPDATE memory_outbox SET lease_until=now()+interval '60 seconds',lease_token=$2,attempts=attempts+1,state=CASE WHEN job_id IS NULL THEN 'submitting' ELSE state END WHERE operation_id=$1 RETURNING *",[r.rows[0].operation_id,token]);return mapOp(u.rows[0]);
 });}
 async update(op:Operation,state:string,jobId?:string,error?:string){const r=await this.pool.query("UPDATE memory_outbox SET state=$3,job_id=COALESCE($4,job_id),last_error=$5,lease_until=NULL,lease_token=NULL,next_attempt_at=now()+LEAST(60,POWER(2,LEAST(attempts,6))) * interval '1 second' WHERE operation_id=$1 AND lease_token=$2",[op.operationId,op.leaseToken,state,jobId??null,error??null]);if(!r.rowCount)throw new Error('LEASE_LOST');}
 async complete(op:Operation,receipt:MemoryReceipt){await this.tx(async c=>{const s=await c.query('SELECT * FROM scopes WHERE id=$1 FOR UPDATE',[op.scopeId]);const o=await c.query('SELECT * FROM memory_outbox WHERE operation_id=$1 FOR UPDATE',[op.operationId]);if(!o.rowCount||o.rows[0].lease_token!==op.leaseToken)throw new Error('LEASE_LOST');
 const e=await c.query('SELECT sequence FROM events WHERE event_id=$1',[op.eventId]);
 if(receipt.status!=='done'||receipt.textSha256!==op.payloadHash||receipt.jobId!==op.jobId||receipt.namespace!==s.rows[0].namespace||receipt.ownerAddress!==s.rows[0].memory_account_id||!receipt.blobId||!receipt.memoryId)throw new Error('RECEIPT_MISMATCH');
 if(e.rows[0].sequence!==s.rows[0].last_durable_sequence+1)throw new Error('NONCONTIGUOUS_COMPLETION');
 await c.query('INSERT INTO memory_receipts VALUES($1,$2)',[op.eventId,receipt]);await c.query("UPDATE events SET durable_status='done' WHERE event_id=$1",[op.eventId]);await c.query("UPDATE memory_outbox SET state='done',lease_until=NULL,lease_token=NULL WHERE operation_id=$1",[op.operationId]);await c.query('UPDATE scopes SET last_durable_sequence=$2 WHERE id=$1',[op.scopeId,e.rows[0].sequence]);});}
}
