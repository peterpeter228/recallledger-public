import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {MemoryEvent,MemoryReceipt} from '../contracts/domain-contracts';
import type {MemoryAdapter,MemoryInventory} from '../src/adapters/memory';
import {canonicalize,eventIntegrity,eventText,hashCanonical,replayEvents,stateHash,validateEvent} from '../src/domain';
import {manifestVersion,parseFrozenManifest,type ManifestPurpose} from './frozen-manifest';

const identity=z.string().min(1),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const reconciliationSchema=z.object({
 schemaVersion:z.literal('1'),scopeId:identity,namespace:identity,checkedAt:z.iso.datetime(),snapshotVersion:z.number().int().nonnegative(),complete:z.literal(true),
 operations:z.array(z.object({operationId:identity,jobId:identity,state:z.literal('done'),noRemoteWriteVerified:z.literal(false)}).strict()),
 remoteBlobIds:z.array(identity),unresolvedOperationIds:z.array(identity).length(0),operationsHash:hash,inventoryHash:hash,
}).strict();
export type WriteReconciliation=z.infer<typeof reconciliationSchema>;
interface ScopeRow {id:string;memory_account_id:string;namespace:string;last_allocated_sequence:number;last_durable_sequence:number;frozen_version:string|null}
interface EventRow {event_id:string;scope_id:string;sequence:number;canonical_json:string;event_hash:string;text_sha256:string;durable_status:'pending'|'done'}
interface OutboxRow {operation_id:string;event_id:string;scope_id:string;operation_key:string;payload_hash:string;namespace:string;memory_text:string;job_id:string|null;state:string;attempts:number;next_attempt_at:Date|null;lease_until:Date|null;lease_token:string|null;last_error:string|null}
export interface LedgerSnapshot {scope:ScopeRow;events:EventRow[];operations:OutboxRow[];receipts:Map<string,MemoryReceipt>}
export interface ScopeVerification {snapshot:LedgerSnapshot;report:WriteReconciliation}

export async function lockLedger(client:PoolClient,scopeId:string):Promise<LedgerSnapshot>{
 const scopeResult=await client.query<ScopeRow>('SELECT * FROM scopes WHERE id=$1 FOR UPDATE',[scopeId]);
 if(!scopeResult.rowCount)throw Error('SCOPE_NOT_FOUND');const scope=scopeResult.rows[0]!;
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[scope.memory_account_id]);
 const events=await client.query<EventRow>('SELECT * FROM events WHERE scope_id=$1 ORDER BY sequence FOR UPDATE',[scopeId]);
 const operations=await client.query<OutboxRow>('SELECT * FROM memory_outbox WHERE scope_id=$1 ORDER BY operation_id FOR UPDATE',[scopeId]);
 const receipts=await client.query<{event_id:string;receipt_json:MemoryReceipt}>('SELECT r.* FROM memory_receipts r JOIN events e USING(event_id) WHERE e.scope_id=$1 FOR UPDATE OF r',[scopeId]);
 const snapshot={scope,events:events.rows,operations:operations.rows,receipts:new Map(receipts.rows.map(row=>[row.event_id,row.receipt_json]))};
 validateLedger(snapshot);return snapshot;
}
function receiptIdentity(receipt:MemoryReceipt){return {memoryId:receipt.memoryId,jobId:receipt.jobId,blobId:receipt.blobId,ownerAddress:receipt.ownerAddress,namespace:receipt.namespace,status:receipt.status,textSha256:receipt.textSha256};}
function validateReceipt(receipt:MemoryReceipt,scope:ScopeRow,event:EventRow,operation:OutboxRow){
 if(!receipt||['blobId','memoryId','jobId','verifiedAt'].some(field=>typeof receipt[field as keyof MemoryReceipt]!=='string'||!receipt[field as keyof MemoryReceipt])||!Number.isFinite(Date.parse(receipt.verifiedAt)))throw Error('RECEIPT_IDENTITY_INVALID');
 if(receipt.status!=='done'||receipt.jobId!==operation.job_id||receipt.textSha256!==event.text_sha256||receipt.namespace!==scope.namespace||receipt.ownerAddress!==scope.memory_account_id)throw Error('RECEIPT_MISMATCH');
}
function validateLedger(snapshot:LedgerSnapshot){
 const {scope,events,operations,receipts}=snapshot;
 if(events.length!==scope.last_allocated_sequence||events.length!==operations.length)throw Error('ALLOCATED_OPERATION_SET_MISMATCH');
 const byEvent=new Map(operations.map(operation=>[operation.event_id,operation]));
 if(byEvent.size!==operations.length)throw Error('DUPLICATE_OPERATION_IDENTITY');
 const eventIds=new Set(events.map(event=>event.event_id));
 if(operations.some(operation=>!eventIds.has(operation.event_id)))throw Error('ALLOCATED_OPERATION_SET_MISMATCH');
 const jobIds=operations.map(operation=>operation.job_id).filter((job):job is string=>job!==null);
 if(jobIds.some(job=>!job)||new Set(jobIds).size!==jobIds.length)throw Error('DUPLICATE_RECEIPT_IDENTITY');
 const parsed:MemoryEvent[]=[];let durable=0;
 for(const [index,row] of events.entries()){
  const operation=byEvent.get(row.event_id)!;const event=validateEvent(JSON.parse(row.canonical_json));const integrity=eventIntegrity(event);
  if(row.sequence!==index+1||event.sequence!==row.sequence||event.eventId!==row.event_id||event.scopeId!==scope.id||row.scope_id!==scope.id||row.event_hash!==integrity.eventHash||row.text_sha256!==integrity.textSha256||row.canonical_json!==canonicalize(event)||operation.scope_id!==scope.id||operation.namespace!==scope.namespace||operation.payload_hash!==integrity.textSha256||operation.memory_text!==eventText(event)||!operation.operation_id||!operation.operation_key)throw Error('EVENT_INTEGRITY_MISMATCH');
  if(operation.lease_token||(operation.lease_until&&operation.lease_until.getTime()>Date.now()))throw Error('WRITE_QUIESCENCE_REQUIRED');
  const receipt=receipts.get(row.event_id);if(receipt)validateReceipt(receipt,scope,row,operation);
  if(row.durable_status==='done'){
   if(operation.state!=='done'||!receipt||durable!==index)throw Error('DURABLE_OPERATION_MISMATCH');durable++;
  }else if(operation.state==='done')throw Error('DURABLE_OPERATION_MISMATCH');
  parsed.push(event);
 }
 if(durable!==scope.last_durable_sequence)throw Error('DURABLE_SEQUENCE_MISMATCH');
 replayEvents(parsed);
 for(const field of ['blobId','memoryId','jobId'] as const){
  const values=[...receipts.values()].map(receipt=>receipt[field]);if(new Set(values).size!==values.length)throw Error('DUPLICATE_RECEIPT_IDENTITY');
 }
}
export function operationsHash(snapshot:LedgerSnapshot){
 const {scope,events,operations,receipts}=snapshot;
 return hashCanonical({scope:{id:scope.id,ownerAddress:scope.memory_account_id,namespace:scope.namespace,lastAllocatedSequence:scope.last_allocated_sequence,lastDurableSequence:scope.last_durable_sequence},events,
  operations:operations.map(operation=>({...operation,next_attempt_at:operation.next_attempt_at?.toISOString()??null,lease_until:operation.lease_until?.toISOString()??null})),
  receipts:events.map(event=>({eventId:event.event_id,receipt:receipts.get(event.event_id)??null})),
 });
}
export function namespaceInventory(inventory:MemoryInventory,namespace:string){return inventory.memories.filter(memory=>memory.namespace_id===namespace).sort((left,right)=>left.blob_id.localeCompare(right.blob_id)||left.memory_id.localeCompare(right.memory_id));}
export function inventoryHash(inventory:MemoryInventory,namespace:string){return hashCanonical(namespaceInventory(inventory,namespace));}
export function requireSameInventory(before:MemoryInventory,after:MemoryInventory,namespace:string){
 if(before.snapshotVersion!==after.snapshotVersion||inventoryHash(before,namespace)!==inventoryHash(after,namespace))throw Error('MEMORY_SNAPSHOT_CHANGED');
}
export function requireExactInventory(inventory:MemoryInventory,namespace:string,blobIds:string[]){
 const rows=namespaceInventory(inventory,namespace),expected=new Set(blobIds);
 if(expected.size!==blobIds.length||rows.length!==expected.size||new Set(rows.map(row=>row.blob_id)).size!==rows.length||rows.some(row=>!expected.has(row.blob_id)))throw Error('RESTORE_METADATA_SET_MISMATCH');
}
function reportFor(snapshot:LedgerSnapshot,inventory:MemoryInventory):WriteReconciliation{
 return {schemaVersion:'1',scopeId:snapshot.scope.id,namespace:snapshot.scope.namespace,checkedAt:new Date().toISOString(),snapshotVersion:inventory.snapshotVersion,complete:true,
  operations:snapshot.operations.map(operation=>({operationId:operation.operation_id,jobId:operation.job_id!,state:'done',noRemoteWriteVerified:false})),
  remoteBlobIds:namespaceInventory(inventory,snapshot.scope.namespace).map(memory=>memory.blob_id),unresolvedOperationIds:[],operationsHash:operationsHash(snapshot),inventoryHash:inventoryHash(inventory,snapshot.scope.namespace)};
}
export function requireReconciliation(report:WriteReconciliation,snapshot:LedgerSnapshot,inventory:MemoryInventory){
 const current=reportFor(snapshot,inventory);
 if(report.scopeId!==current.scopeId||report.namespace!==current.namespace||report.snapshotVersion!==current.snapshotVersion||report.operationsHash!==current.operationsHash||report.inventoryHash!==current.inventoryHash||canonicalize(report.operations)!==canonicalize(current.operations)||canonicalize(report.remoteBlobIds)!==canonicalize(current.remoteBlobIds))throw Error('RECONCILIATION_STALE');
}
/** Never resubmits or invents a cancellation. Every resolution uses the original saved job. */
export async function verifyOriginalJobs(snapshot:LedgerSnapshot,memory:MemoryAdapter,reconciliation?:WriteReconciliation):Promise<ScopeVerification>{
 const inventory=await memory.inventory();if(reconciliation)requireReconciliation(reconciliation,snapshot,inventory);
 const verified:LedgerSnapshot={scope:{...snapshot.scope},events:snapshot.events.map(event=>({...event})),operations:snapshot.operations.map(operation=>({...operation})),receipts:new Map(snapshot.receipts)};
 const byEvent=new Map(verified.operations.map(operation=>[operation.event_id,operation]));const unresolved:string[]=[];
 for(const event of verified.events){
  const operation=byEvent.get(event.event_id)!;if(!operation.job_id){unresolved.push(operation.operation_id);continue;}
  let status;
  try{status=await memory.status(operation.job_id,{namespace:verified.scope.namespace,textSha256:event.text_sha256});}
  catch(error){if(error instanceof Error&&error.message==='JOB_NOT_FOUND_OUTCOME_UNKNOWN'){unresolved.push(operation.operation_id);continue;}throw error;}
  // SDK 0.1.9 exposes no conclusive pre-upload/no-write proof. A failed job,
  // missing metadata, or an absent recall hit therefore cannot clear a suffix.
  if(status.state!=='done'||!status.receipt){unresolved.push(operation.operation_id);continue;}
  validateReceipt(status.receipt,verified.scope,event,operation);
  const existing=verified.receipts.get(event.event_id);
  if(existing&&canonicalize(receiptIdentity(existing))!==canonicalize(receiptIdentity(status.receipt)))throw Error('RECEIPT_MISMATCH');
  if(!existing)verified.receipts.set(event.event_id,status.receipt);
  event.durable_status='done';
  if(operation.state!=='done')Object.assign(operation,{state:'done',lease_until:null,lease_token:null,next_attempt_at:null,last_error:null});
 }
 const after=await memory.inventory();requireSameInventory(inventory,after,verified.scope.namespace);
 if(unresolved.length)throw Error('RECONCILIATION_UNRESOLVED_OPERATIONS');
 verified.scope.last_durable_sequence=verified.events.length;validateLedger(verified);
 requireExactInventory(after,verified.scope.namespace,verified.events.map(event=>verified.receipts.get(event.event_id)!.blobId));
 return {snapshot:verified,report:reportFor(verified,after)};
}
export async function applyReconciliation(client:PoolClient,before:LedgerSnapshot,after:LedgerSnapshot){
 for(const event of after.events){
  if(!before.receipts.has(event.event_id))await client.query('INSERT INTO memory_receipts(event_id,receipt_json) VALUES($1,$2)',[event.event_id,after.receipts.get(event.event_id)]);
  if(before.events.find(row=>row.event_id===event.event_id)!.durable_status!=='done')await client.query("UPDATE events SET durable_status='done' WHERE event_id=$1",[event.event_id]);
 }
 for(const operation of after.operations)if(before.operations.find(row=>row.operation_id===operation.operation_id)!.state!=='done')await client.query("UPDATE memory_outbox SET state='done',lease_until=NULL,lease_token=NULL,next_attempt_at=NULL,last_error=NULL WHERE operation_id=$1 AND job_id=$2",[operation.operation_id,operation.job_id]);
 if(before.scope.last_durable_sequence!==after.scope.last_durable_sequence)await client.query('UPDATE scopes SET last_durable_sequence=$2 WHERE id=$1',[after.scope.id,after.scope.last_durable_sequence]);
}
export function frozenLocator(snapshot:LedgerSnapshot,purpose:ManifestPurpose){
 const events=snapshot.events.map(row=>validateEvent(JSON.parse(row.canonical_json)));
 const manifest={manifestVersion:manifestVersion(purpose,snapshot.scope.id,events.length),scopeId:snapshot.scope.id,namespace:snapshot.scope.namespace,ownerAddress:snapshot.scope.memory_account_id,
  entries:snapshot.events.map(event=>{const receipt=snapshot.receipts.get(event.event_id)!;return {eventId:event.event_id,sequence:event.sequence,eventHash:event.event_hash,blobId:receipt.blobId,textSha256:event.text_sha256,memoryId:receipt.memoryId,jobId:receipt.jobId};}),expectedStateHash:stateHash(replayEvents(events))};
 return parseFrozenManifest(manifest).manifest;
}
