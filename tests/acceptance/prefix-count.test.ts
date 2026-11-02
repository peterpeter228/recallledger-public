import {describe,it,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {eventIntegrity,eventText} from '../../src/domain';
import {DEMO_SCOPE} from '../../src/domain/demo';
import {prefixExpectation,withPrefixFixture,type CliResult,type PrefixFixture,type PrefixLocator} from '../fixtures/prefix-cli-fixture';

const eventIds=['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'];
const timeout=60000;
function successful(result:CliResult){expect(result.status,result.stderr).toBe(0);return JSON.parse(result.stdout);}
function rejected(result:CliResult,error?:string){expect(result.status,result.stdout||result.stderr).not.toBe(0);if(error)expect(result.stderr).toContain(error);}
function reconcile(fixture:PrefixFixture,apply=true){return fixture.run('verify-count',['--reconcile','--out',fixture.paths.reconciliation,...(apply?['--apply']:[])]);}
function freeze(fixture:PrefixFixture,purpose='teaching',out=fixture.paths.frozen){return fixture.run('freeze',['--purpose',purpose,'--reconciliation',fixture.paths.reconciliation,'--out',out]);}
function verifyCount(fixture:PrefixFixture,apply=true,manifest=fixture.paths.frozen){return fixture.run('verify-count',['--manifest',manifest,'--out',fixture.paths.count,'--events-out',fixture.paths.events,...(apply?['--apply']:[])]);}
function restore(fixture:PrefixFixture,apply=true,manifest=fixture.paths.frozen,out=fixture.paths.restore){return fixture.run('restore',[manifest,'--out',out,...(apply?['--apply']:[])]);}
async function freezePrefix(fixture:PrefixFixture,count=fixture.prefix.events.length,purpose:'teaching'|'real-loop'='teaching',out=fixture.paths.frozen){
 const report=successful(reconcile(fixture));
 const expected=prefixExpectation(count,purpose),remote=JSON.parse(await readFile(fixture.paths.remote,'utf8'));
 expect(report).toMatchObject({schemaVersion:'1',scopeId:DEMO_SCOPE,namespace:expected.manifest.namespace,complete:true,snapshotVersion:remote.snapshotVersion,unresolvedOperationIds:[]});
 expect(Number.isFinite(Date.parse(report.checkedAt))).toBe(true);
 expect(report.operationsHash).toMatch(/^[a-f0-9]{64}$/);expect(report.inventoryHash).toMatch(/^[a-f0-9]{64}$/);
 expect(report.operations).toEqual(expected.manifest.entries.map(entry=>({operationId:`fixture:synthetic-operation-${entry.eventId}`,jobId:entry.jobId,state:'done',noRemoteWriteVerified:false})));
 expect(report.remoteBlobIds).toEqual(expected.manifest.entries.map(entry=>entry.blobId).sort());
 const manifest=successful(freeze(fixture,purpose,out));expect(manifest).toEqual(expected.manifest);
 return manifest as PrefixLocator;
}
async function exportedPrefix(fixture:PrefixFixture){
 await freezePrefix(fixture);successful(verifyCount(fixture));successful(restore(fixture));
}

// Every case runs actual installed-tsx CLIs in fresh processes and a separate real PG schema.
// The provider is synthetic; these are not Walrus, chain, or live-write acceptance claims.
describe.skipIf(!process.env.TEST_DATABASE_URL)('prefix freeze/count/restore subprocess acceptance (synthetic provider)',()=>{
 it.each([10,11,12])('N=%i',async count=>{
  await withPrefixFixture({count},async fixture=>{
   const manifest=await freezePrefix(fixture);
   expect(manifest.entries.map(entry=>entry.eventId)).toEqual(eventIds.slice(0,count));
   expect(manifest.entries.map(entry=>entry.sequence)).toEqual(Array.from({length:count},(_,index)=>index+1));
   expect(JSON.parse(await readFile(fixture.paths.frozen,'utf8'))).toEqual(fixture.prefix.manifest);
   const verified=successful(verifyCount(fixture));
   expect(verified).toEqual({...fixture.prefix.manifest,schemaVersion:'1',purpose:'teaching',mode:'recorded_live',verifiedCount:count,verifiedAt:expect.any(String),verification:{exactSet:true,hashes:true}});
   expect(Number.isFinite(Date.parse(verified.verifiedAt))).toBe(true);
   expect(JSON.parse(await readFile(fixture.paths.count,'utf8'))).toEqual(verified);
   expect(JSON.parse(await readFile(fixture.paths.events,'utf8'))).toEqual({schemaVersion:'1',manifestVersion:manifest.manifestVersion,verifiedAt:verified.verifiedAt,entries:manifest.entries});
   const restored=successful(restore(fixture));
   expect(restored).toEqual({status:'verified',source:'walrus_relayer',manifestVersion:manifest.manifestVersion,count,stateHash:fixture.prefix.stateHash,checkedAt:expect.any(String)});
   expect(JSON.parse(await readFile(fixture.paths.restore,'utf8'))).toEqual(restored);
   const observed=await fixture.observations(),freshFactory=observed.filter(row=>row.kind==='factory').at(-1)!;
   expect(freshFactory).toMatchObject({databaseConfigured:false,testDatabaseConfigured:false,writesEnabled:false});
   const state=observed.filter(row=>row.kind==='restored').at(-1)!;
   expect(state.eventIds).toEqual(eventIds.slice(0,count));expect(state.stateHash).toBe(fixture.prefix.stateHash);expect(state.state).toEqual(fixture.prefix.state);
   expect(state.state).toMatchObject({scopeId:DEMO_SCOPE,memoryVersion:count,rules:{'rule-tools-v1':{status:'superseded'},'rule-tools-v2':{status:count===12?'revoked':'active'}},labels:{'fixture:tx-C':{classification:'reimbursement'}},refundLinks:[{eventId:'M10',refundObservationId:'fixture:tx-D',originalObservationId:'fixture:tx-B',coinType:'fixture:TEST_USDC',amountAtomic:'12000000'}]});
   expect(observed.some(row=>row.kind==='inventory'&&row.cursor!==null)).toBe(true);
   expect(observed.some(row=>row.kind==='status')).toBe(true);expect(observed.some(row=>row.kind==='receipt')).toBe(true);
   expect(observed.filter(row=>row.kind==='remember')).toEqual([]);
   expect((await fixture.pool.query('SELECT manifest_json FROM frozen_manifests')).rows.map(row=>row.manifest_json)).toEqual([manifest]);
  });
 },timeout);

 it('N<10',async()=>{
  await withPrefixFixture({count:9},async fixture=>{
   successful(reconcile(fixture));await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   rejected(freeze(fixture),'TEACHING_CONTIGUOUS_10_TO_12_REQUIRED');
   const input=await fixture.writeInput('nine-event-input.json',fixture.prefix.manifest);
   rejected(verifyCount(fixture,true,input),'TEACHING_CONTIGUOUS_10_TO_12_REQUIRED');
   expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT count(*)::int AS n FROM frozen_manifests')).rows[0].n).toBe(0);
  });
 },timeout);

 it('out-of-order',async()=>{
  await withPrefixFixture({count:10,transformEvents:events=>{
   events[5]!.previousEventHash=eventIntegrity(events[3]!).eventHash;
   for(let index=6;index<events.length;index++)events[index]!.previousEventHash=eventIntegrity(events[index-1]!).eventHash;
   return events;
  }},async fixture=>{
   await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   rejected(reconcile(fixture));expect(await fixture.evidenceBytes()).toEqual(before);
   const stored=await fixture.pool.query('SELECT canonical_json,event_hash,text_sha256 FROM events WHERE event_id=$1',['M06']);
   const event=JSON.parse(stored.rows[0].canonical_json),integrity=eventIntegrity(event);
   expect(stored.rows[0]).toMatchObject({event_hash:integrity.eventHash,text_sha256:integrity.textSha256});
   expect(event.previousEventHash).not.toBe(eventIntegrity(fixture.prefix.events[4]!).eventHash);
   const rows=await fixture.pool.query('SELECT event_hash,text_sha256 FROM events ORDER BY sequence');
   const broken=structuredClone(fixture.prefix.manifest);
   broken.entries=broken.entries.map((entry,index)=>({...entry,eventHash:rows.rows[index]!.event_hash,textSha256:rows.rows[index]!.text_sha256}));
   const input=await fixture.writeInput('broken-chain-input.json',broken);
   rejected(verifyCount(fixture,true,input));rejected(restore(fixture,true,input));
   expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT count(*)::int AS n FROM frozen_manifests')).rows[0].n).toBe(0);
  });
 },timeout);

 it('duplicate receipt',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   successful(reconcile(fixture));
   await fixture.pool.query("UPDATE memory_receipts SET receipt_json=jsonb_set(receipt_json,'{jobId}',to_jsonb($1::text)) WHERE event_id='M10'",[fixture.prefix.manifest.entries[8]!.jobId]);
   await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   rejected(freeze(fixture));
   const duplicate=structuredClone(fixture.prefix.manifest);duplicate.entries[9]!.jobId=duplicate.entries[8]!.jobId;
   const input=await fixture.writeInput('duplicate-receipt-input.json',duplicate);
   rejected(verifyCount(fixture,true,input),'DUPLICATE_MANIFEST_ENTRY');
   expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT count(*)::int AS n FROM frozen_manifests')).rows[0].n).toBe(0);
  });
 },timeout);

 it('wrong hash',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   await exportedPrefix(fixture);const before=await fixture.evidenceBytes();
   await fixture.updateRemote(remote=>{remote.memories.find(memory=>memory.blobId===fixture.prefix.manifest.entries[9]!.blobId)!.text+=' ';});
   rejected(reconcile(fixture),'MEMORY_READBACK_UNVERIFIED');
   rejected(freeze(fixture),'MEMORY_READBACK_UNVERIFIED');
   rejected(verifyCount(fixture),'MEMORY_READBACK_UNVERIFIED');
   rejected(restore(fixture),'RESTORE_MISSING_OR_CORRUPT_PAYLOAD');
   expect(await fixture.evidenceBytes()).toEqual(before);
  });
 },timeout);

 it('pending suffix',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   await exportedPrefix(fixture);const suffix=await fixture.addSuffix({state:'pending',jobState:'pending'}),before=await fixture.evidenceBytes();
   rejected(reconcile(fixture),'RECONCILIATION_UNRESOLVED_OPERATIONS');rejected(freeze(fixture));
   expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT operation_id,job_id,state FROM memory_outbox WHERE event_id=$1',[suffix.event.eventId])).rows).toEqual([{operation_id:suffix.operationId,job_id:suffix.jobId,state:'pending'}]);
   expect((await fixture.pool.query('SELECT last_allocated_sequence,last_durable_sequence FROM scopes')).rows).toEqual([{last_allocated_sequence:11,last_durable_sequence:10}]);
  });
 },timeout);

 it('unknown suffix remote blob',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   await exportedPrefix(fixture);
   const suffix=await fixture.addSuffix({state:'unknown',jobState:'not_found',remote:true,hiddenFromRecall:true}),before=await fixture.evidenceBytes();
   rejected(reconcile(fixture),'RECONCILIATION_UNRESOLVED_OPERATIONS');rejected(freeze(fixture));
   rejected(verifyCount(fixture),'RESTORE_METADATA_SET_MISMATCH');
   rejected(restore(fixture),'RESTORE_METADATA_SET_MISMATCH');
   expect(await fixture.evidenceBytes()).toEqual(before);
   const remote=JSON.parse(await readFile(fixture.paths.remote,'utf8'));
   expect(remote.memories.filter((memory:{namespace:string})=>memory.namespace===fixture.prefix.manifest.namespace)).toHaveLength(11);
   expect(remote.memories.find((memory:{blobId:string})=>memory.blobId===suffix.blobId)).toMatchObject({hiddenFromRecall:true});
   expect((await fixture.pool.query('SELECT state,job_id FROM memory_outbox WHERE event_id=$1',[suffix.event.eventId])).rows).toEqual([{state:'unknown',job_id:suffix.jobId}]);
  });
 },timeout);

 it('dry-run no evidence',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   const initial=await fixture.evidenceBytes(),plan=successful(reconcile(fixture,false));expect(plan.complete).toBe(true);
   expect(await fixture.evidenceBytes()).toEqual(initial);
   await freezePrefix(fixture);const before=await fixture.evidenceBytes();
   expect(successful(verifyCount(fixture,false)).verifiedCount).toBe(10);
   expect(successful(restore(fixture,false))).toMatchObject({count:10,stateHash:fixture.prefix.stateHash});
   expect(await fixture.evidenceBytes()).toEqual(before);
   for(const path of [fixture.paths.count,fixture.paths.events,fixture.paths.restore])await writeFile(path,'existing output must not change during dry-run\n');
   const existing=await fixture.evidenceBytes();successful(verifyCount(fixture,false));successful(restore(fixture,false));
   expect(await fixture.evidenceBytes()).toEqual(existing);
  });
 },timeout);

 it('apply export restore',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   const manifest=await freezePrefix(fixture),verified=successful(verifyCount(fixture));
   expect(JSON.parse(await readFile(fixture.paths.count,'utf8'))).toEqual(verified);
   const publicEvents=JSON.parse(await readFile(fixture.paths.events,'utf8'));
   expect(publicEvents.entries).toEqual(manifest.entries);
   for(const entry of publicEvents.entries)expect(Object.keys(entry).sort()).toEqual(['blobId','eventHash','eventId','jobId','memoryId','sequence','textSha256']);
   expect(await readFile(fixture.paths.events,'utf8')).not.toContain('payload');
   const report=successful(restore(fixture));expect(report).toMatchObject({count:10,stateHash:manifest.expectedStateHash,manifestVersion:manifest.manifestVersion});
   expect(JSON.parse(await readFile(fixture.paths.restore,'utf8'))).toEqual(report);
   const before=await fixture.evidenceBytes();
   // The public count export is not a frozen locator and cannot be used as restore input.
   rejected(restore(fixture,true,fixture.paths.count));expect(await fixture.evidenceBytes()).toEqual(before);
   const observed=await fixture.observations();expect(observed.filter(row=>row.kind==='remember')).toEqual([]);
   expect(observed.filter(row=>row.kind==='factory').at(-1)).toMatchObject({databaseConfigured:false,testDatabaseConfigured:false,writesEnabled:false});
  });
 },timeout);

 it('missing manifest',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes(),missing=join(fixture.cwd,'missing-frozen-manifest.json');
   rejected(verifyCount(fixture,true,missing));rejected(restore(fixture,true,missing));
   rejected(fixture.run('verify-count',['--out',fixture.paths.count,'--events-out',fixture.paths.events,'--apply']));
   rejected(fixture.run('restore',['--out',fixture.paths.restore,'--apply']));
   expect(await fixture.evidenceBytes()).toEqual(before);expect(await fixture.observations()).toEqual([]);
  });
 },timeout);

 it('stale inventory snapshot requires reconciliation again',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   successful(reconcile(fixture));await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   await fixture.updateRemote(remote=>{remote.snapshotVersion++;});
   rejected(freeze(fixture),'RECONCILIATION_STALE');expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT count(*)::int AS n FROM frozen_manifests')).rows[0].n).toBe(0);
  });
 },timeout);

 it('stale operation snapshot requires reconciliation again',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   successful(reconcile(fixture));await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   await fixture.pool.query("UPDATE memory_outbox SET operation_key=operation_key||':changed' WHERE event_id='M10'");
   rejected(freeze(fixture),'RECONCILIATION_STALE');expect(await fixture.evidenceBytes()).toEqual(before);
  });
 },timeout);

 it('snapshot-inconsistent pagination cannot produce reconciliation evidence',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   await fixture.updateRemote(remote=>{remote.inconsistentSnapshot=true;});
   rejected(reconcile(fixture),'MEMORY_SNAPSHOT_CHANGED');expect(await fixture.evidenceBytes()).toEqual(before);
  });
 },timeout);

 it('failed suffix without conclusive no-write evidence is never omitted',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   await freezePrefix(fixture);const suffix=await fixture.addSuffix({state:'failed',jobState:'failed'}),before=await fixture.evidenceBytes();
   rejected(reconcile(fixture),'RECONCILIATION_UNRESOLVED_OPERATIONS');rejected(freeze(fixture));
   expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT event_id,job_id,state FROM memory_outbox WHERE operation_id=$1',[suffix.operationId])).rows).toEqual([{event_id:'M11',job_id:suffix.jobId,state:'failed'}]);
   expect((await fixture.pool.query('SELECT last_allocated_sequence,last_durable_sequence FROM scopes')).rows).toEqual([{last_allocated_sequence:11,last_durable_sequence:10}]);
   await fixture.updateRemote(remote=>{remote.memories.push({memoryId:suffix.memoryId,blobId:suffix.blobId,jobId:suffix.jobId,namespace:fixture.prefix.manifest.namespace,owner:fixture.prefix.manifest.ownerAddress,text:eventText(suffix.event),hiddenFromRecall:true});remote.snapshotVersion++;});
   rejected(reconcile(fixture),'RECONCILIATION_UNRESOLVED_OPERATIONS');rejected(freeze(fixture));
   rejected(restore(fixture),'RESTORE_METADATA_SET_MISMATCH');expect(await fixture.evidenceBytes()).toEqual(before);
  });
 },timeout);

 it('reconciliation promotes only the same original completed suffix job',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   const suffix=await fixture.addSuffix({state:'unknown',jobState:'done',remote:true});
   const before=await fixture.evidenceBytes();successful(reconcile(fixture,false));expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT state FROM memory_outbox WHERE operation_id=$1',[suffix.operationId])).rows).toEqual([{state:'unknown'}]);
   const manifest=await freezePrefix(fixture,11);
   expect(manifest.entries.map(entry=>entry.eventId)).toEqual(eventIds.slice(0,11));
   expect(manifest.entries[10]).toMatchObject({eventId:'M11',jobId:suffix.jobId,blobId:suffix.blobId,memoryId:suffix.memoryId});
   expect((await fixture.pool.query('SELECT operation_id,job_id,state FROM memory_outbox WHERE event_id=$1',['M11'])).rows).toEqual([{operation_id:suffix.operationId,job_id:suffix.jobId,state:'done'}]);
   expect((await fixture.pool.query('SELECT last_durable_sequence FROM scopes')).rows).toEqual([{last_durable_sequence:11}]);
   expect(successful(verifyCount(fixture)).verifiedCount).toBe(11);expect(successful(restore(fixture)).stateHash).toBe(prefixExpectation(11).stateHash);
   expect((await fixture.observations()).filter(row=>row.kind==='remember')).toEqual([]);
  });
 },timeout);

 it('real-loop four-event proof cannot export a teaching count',async()=>{
  await withPrefixFixture({count:4},async fixture=>{
   const frozen=join(fixture.cwd,'evidence/real-frozen-manifest.json'),report=join(fixture.cwd,'evidence/real-restore-report.json');
   const manifest=await freezePrefix(fixture,4,'real-loop',frozen);
   expect(manifest).toEqual(prefixExpectation(4,'real-loop').manifest);
   const restored=successful(restore(fixture,true,frozen,report));expect(restored).toMatchObject({count:4,stateHash:prefixExpectation(4).stateHash});
   const reportBytes=await readFile(report),frozenBytes=await readFile(frozen);await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   rejected(verifyCount(fixture,true,frozen),'TEACHING_MANIFEST_REQUIRED_FOR_COUNT');
   expect(await fixture.evidenceBytes()).toEqual(before);expect(await readFile(report)).toEqual(reportBytes);expect(await readFile(frozen)).toEqual(frozenBytes);
  });
 },timeout);
});
