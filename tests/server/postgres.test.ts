import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {Pool} from 'pg';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {PostgresStore} from '../../src/server/store.js';
import {processOutboxOnce} from '../../src/server/outbox.js';
import {compileDemoEvents} from '../../src/domain/demo.js';
import {canonicalize,eventIntegrity,eventText} from '../../src/domain/index.js';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('REAL PostgreSQL transaction/lease/restart invariants',()=>{
 const pool=new Pool({connectionString:url});const store=new PostgresStore(pool);const event=compileDemoEvents()[0];const build=()=>({event,canonicalJson:canonicalize(event),...eventIntegrity(event),memoryText:eventText(event)});
 beforeAll(async()=>{await pool.query(await readFile('migrations/001_initial.sql','utf8'));await pool.query('TRUNCATE scopes CASCADE');await store.ensureScope(event.scopeId,'owner','namespace');});afterAll(()=>pool.end());
 it('serializes concurrent confirmation and preserves uncertain job across new store instance',async()=>{
 const outcomes=await Promise.allSettled([store.enqueue(event.scopeId,'key-a','hash-a',0,build),store.enqueue(event.scopeId,'key-b','hash-b',0,build)]);expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);const winner=outcomes.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<any>;const op=await store.operation(event.scopeId,winner.value.operationId);expect(await store.version(event.scopeId)).toBe(0);expect(await store.events(event.scopeId)).toHaveLength(0);
 await expect(store.enqueue(event.scopeId,op!.operationKey,'other-hash',0,build)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 expect(await store.claim('unrelated-scope')).toBeNull();expect((await store.operation(event.scopeId,op!.operationId))!.state).toBe('prepared');
 const claimed=await store.claim(event.scopeId);expect(claimed!.state).toBe('submitting');expect(await store.claim()).toBeNull();
 // Crash after submit intent but before accepted response: lease expires. New worker must not submit again.
 await pool.query("UPDATE memory_outbox SET lease_until=now()-interval '1 second' WHERE operation_id=$1",[op!.operationId]);const restarted=new PostgresStore(pool);expect(await restarted.claim()).toBeNull();expect((await restarted.operation(event.scopeId,op!.operationId))!.state).toBe('unknown');
 // Operator reconciliation has obtained the original accepted job id. Resume polling only.
 await pool.query("UPDATE memory_outbox SET job_id='original-job',state='accepted',next_attempt_at=NULL WHERE operation_id=$1",[op!.operationId]);let submits=0,polls=0;
 await processOutboxOnce(restarted,{submit:async()=>{submits++;throw Error('must not submit');},status:async()=>{polls++;return {state:'done',receipt:{memoryId:'test-memory',jobId:'original-job',blobId:'test-blob',ownerAddress:'owner',namespace:'namespace',status:'done',textSha256:op!.payloadHash,verifiedAt:new Date().toISOString(),blobObjectId:null,endEpoch:null,expiresAt:null}};}});
 expect(submits).toBe(0);expect(polls).toBe(1);expect(await restarted.version(event.scopeId)).toBe(1);expect(await restarted.events(event.scopeId)).toHaveLength(1);
 const duplicate=await restarted.enqueue(event.scopeId,op!.operationKey,op!.operationKey==='key-a'?'hash-a':'hash-b',0,build);expect(duplicate.operationId).toBe(op!.operationId);
 await expect(pool.query("UPDATE events SET canonical_json='{}' WHERE event_id=$1",[event.eventId])).rejects.toThrow('event payload is immutable');
 });
 it('reads committed durable state from a fresh Node process with no shared projection',()=>{
 const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {Pool} from 'pg';import {PostgresStore} from './src/server/store.ts';const p=new Pool({connectionString:process.env.TEST_DATABASE_URL});const s=new PostgresStore(p);console.log(JSON.stringify({version:await s.version('demo-recallledger'),events:(await s.events('demo-recallledger')).length}));await p.end();`],{encoding:'utf8',env:process.env});
 expect(JSON.parse(output.trim())).toEqual({version:1,events:1});
 });

 it('enforces configured write caps without accepting another pending event',async()=>{
 const limited=new PostgresStore(pool,{ownerLimit:1,scopeLimit:1});
 await expect(limited.enqueue(event.scopeId,'over-budget','budget-hash',1,build)).rejects.toMatchObject({code:'OWNER_WRITE_BUDGET_EXCEEDED'});
 expect(await store.version(event.scopeId)).toBe(1);
 });

 it('blocks at bounded polling attempts, preserving original job and prefix',async()=>{
 const second=compileDemoEvents()[1]!;const queued=await store.enqueue(event.scopeId,'bounded-poll-key','bounded-hash',1,()=>({event:second,canonicalJson:canonicalize(second),...eventIntegrity(second),memoryText:eventText(second)}));
 await pool.query("UPDATE memory_outbox SET job_id='bounded-original-job',state='pending',attempts=60,next_attempt_at=NULL WHERE operation_id=$1",[queued.operationId]);
 expect(await store.claim()).toBeNull();const blocked=await store.operation(event.scopeId,queued.operationId);expect(blocked!.state).toBe('blocked');expect(blocked!.jobId).toBe('bounded-original-job');expect(await store.version(event.scopeId)).toBe(1);
 });

 it('recovers original completed operation by stable key and never crosses scopes',async()=>{
 const op=await store.operationByKey(event.scopeId,'key-a')??await store.operationByKey(event.scopeId,'key-b');
 expect(op?.state).toBe('done');expect(op?.jobId).toBe('original-job');
 expect(await store.operationByKey('unrelated-scope',op!.operationKey)).toBeNull();
 expect(await store.operationByKey(event.scopeId,'not-submitted')).toBeNull();
 });

});
