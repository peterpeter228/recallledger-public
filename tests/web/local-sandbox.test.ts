import {afterEach,describe,it,expect,vi} from 'vitest';
import type {MemoryEvent,TransactionObservation,ClassificationDecision,PolicyRule} from '../../contracts/domain-contracts.js';
import type {LedgerState} from '../../src/domain/ledger.js';
import {compileDemoEvents,demoObservation,DEMO_COIN} from '../../src/domain/demo.js';
import {createLocalSandbox} from '../../src/web/local-sandbox.js';
import {buildApp} from '../../src/server/app.js';
import {api,ApiResponseError} from '../../src/web/api.js';

interface LocalClient {request<T=unknown>(path:string,body?:unknown,csrf?:string,idempotencyKey?:string):Promise<T>}
interface Snapshot {
 scopeId:string;memoryVersion:number;durableVersion:number;stateHash:string;events:MemoryEvent[];projection:LedgerState;
 pendingOperation:{operationId:string;state:string}|null;
 decisions:Record<string,ClassificationDecision|null>;
 summary:{assets:Array<{coinType:string;toolsSpendAtomic:string;unknownAtomic:string}>;needsContextRefs:string[];refundLinks:Array<{refundObservationId:string;originalObservationId:string;amountAtomic:string;status:string}>};
}
interface Session {client:LocalClient;csrf:string}
interface Operation {operationId:string;eventIds:string[];state:string;durableVersion:number}
interface Preview {decision:ClassificationDecision;inputHash:string;previewToken:string}
interface Replay {decision:ClassificationDecision;inputHash:string;memoryEventsAdded:number}
async function start(client:LocalClient=createLocalSandbox()):Promise<Session>{
 const snapshot=await client.request<Snapshot&{csrfToken:string}>('/demo/session',{});
 expect(snapshot.events).toEqual([]);expect(snapshot.memoryVersion).toBe(0);expect(snapshot.durableVersion).toBe(0);
 return {client,csrf:snapshot.csrfToken};
}
function tools(snapshot:Snapshot){
 const asset=snapshot.summary.assets.find(asset=>asset.coinType===DEMO_COIN);expect(asset).toBeDefined();
 return asset!.toolsSpendAtomic;
}
async function apply(session:Session,kind:MemoryEvent['kind'],payload:Record<string,unknown>,key?:string):Promise<Snapshot>{
 const before=await session.client.request<Snapshot>('/demo/session');
 const operation=await session.client.request<Operation>('/demo/events/prepare',{kind,payload,confirmed:true,expectedVersion:before.memoryVersion},session.csrf,key??`synthetic-event-${before.memoryVersion+1}`);
 expect(operation.state).toBe('pending');expect(operation.durableVersion).toBe(0);
 const pending=await session.client.request<Snapshot>('/demo/memory/timeline');
 expect(pending.memoryVersion).toBe(before.memoryVersion);expect(pending.events).toEqual(before.events);
 expect(pending.stateHash).toBe(before.stateHash);expect(pending.summary).toEqual(before.summary);
 expect(pending.pendingOperation).toMatchObject({operationId:operation.operationId,state:'pending'});
 const after=await session.client.request<Snapshot>(`/demo/operations/${operation.operationId}/complete`,{},session.csrf);
 expect(after.memoryVersion).toBe(before.memoryVersion+1);expect(after.durableVersion).toBe(0);expect(after.pendingOperation).toBeNull();
 expect(after.events.at(-1)?.eventId).toBe(operation.eventIds[0]);
 return after;
}
async function seedThrough(session:Session,count:number){
 const ids:Record<string,string>={};let snapshot=await session.client.request<Snapshot>('/demo/session');
 for(const event of compileDemoEvents().slice(0,count)){
  let payload=structuredClone(event.payload);
  if(event.kind==='observation_recorded'||event.kind==='decision_recorded')payload={observationId:(payload.observation as TransactionObservation).observationId};
  if(event.kind==='correction_confirmed')payload.correctsEventId=ids[String(payload.correctsEventId)];
  snapshot=await apply(session,event.kind,payload);ids[event.eventId]=snapshot.events.at(-1)!.eventId;
 }
 return {snapshot,ids};
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('browser-local ephemeral sandbox through its consumer request interface',()=>{
 it('completes all twelve real domain changes, keeps pending inactive, and reports only a simulated restore',async()=>{
  const session=await start();const {snapshot}=await seedThrough(session,12);
  expect(snapshot.memoryVersion).toBe(12);expect(snapshot.events).toHaveLength(12);expect(snapshot.projection.memoryVersion).toBe(12);
  expect(new Set(snapshot.events.map(event=>event.eventId)).size).toBe(12);
  expect(snapshot.events.every(event=>event.scopeId===snapshot.scopeId&&event.evidenceKind==='synthetic')).toBe(true);
  expect(snapshot.projection.rules['rule-tools-v1']?.status).toBe('superseded');
  expect(snapshot.projection.rules['rule-tools-v2']?.status).toBe('revoked');
  expect(snapshot.decisions['fixture:tx-C']?.classification).toBe('reimbursement');
  expect(snapshot.decisions['fixture:tx-D']?.classification).toBe('refund');
  expect(snapshot.decisions['fixture:tx-E']?.classification).toBe('needs_context');
  expect(tools(snapshot)).toBe('12000000');
  expect(snapshot.summary.assets.find(asset=>asset.coinType===DEMO_COIN)?.unknownAtomic).toBe('25000000');
  expect(snapshot.summary.refundLinks).toMatchObject([{refundObservationId:'fixture:tx-D',originalObservationId:'fixture:tx-B',amountAtomic:'12000000',status:'active'}]);
  const restored=await session.client.request('/demo/memory/restore-check',{},session.csrf);
  expect(restored).toMatchObject({status:'simulated',expectedCount:12,restoredCount:12,stateHash:snapshot.stateHash,remoteRestoreVerified:false});
 });
 it('reuses an idempotent pending/completed operation and rejects conflicting, concurrent, or stale mutations',async()=>{
  const session=await start(),payload={...structuredClone(compileDemoEvents()[0]!.payload),budgetAtomic:'65000000'};
  const body={kind:'preference_confirmed',payload,confirmed:true,expectedVersion:0},key='synthetic-stable-request';
  const operation=await session.client.request<Operation>('/demo/events/prepare',body,session.csrf,key);
  expect(await session.client.request('/demo/events/prepare',body,session.csrf,key)).toMatchObject({operationId:operation.operationId,state:'pending'});
  expect(await session.client.request(`/demo/operation-keys/${key}`)).toMatchObject({found:true,operation:{operationId:operation.operationId,state:'pending'}});
  expect(await session.client.request(`/demo/operations/${operation.operationId}`)).toMatchObject({operationId:operation.operationId,state:'pending'});
  await expect(session.client.request('/demo/events/prepare',{...body,payload:{...payload,budgetAtomic:'70000000'}},session.csrf,key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT',status:409});
  await expect(session.client.request('/demo/events/prepare',body,session.csrf,'synthetic-concurrent-request')).rejects.toMatchObject({code:'MEMORY_PENDING',status:409});
  const pending=await session.client.request<Snapshot>('/demo/session');expect(pending.memoryVersion).toBe(0);expect(pending.projection.preferences).toEqual([]);
  await session.client.request(`/demo/operations/${operation.operationId}/complete`,{},session.csrf);
  const retried=await session.client.request<Operation>('/demo/events/prepare',body,session.csrf,key);
  expect(retried.operationId).toBe(operation.operationId);expect(retried.state).toBe('simulated');
  await expect(session.client.request('/demo/events/prepare',body,session.csrf,'synthetic-stale-request')).rejects.toMatchObject({code:'VERSION_CONFLICT',status:409});
  const after=await session.client.request<Snapshot>('/demo/session');expect(after.memoryVersion).toBe(1);expect(after.events).toHaveLength(1);
  expect(after.projection.preferences[0]?.budgetAtomic).toBe('65000000');expect(after.pendingOperation).toBeNull();
 });
 it.each([
  ['explicit confirmation',{confirmed:false},'synthetic-validation-key',undefined,'SCOPE_NOT_CONFIRMED',400],
  ['valid expected version',{expectedVersion:-1},'synthetic-validation-key',undefined,'EXPECTED_VERSION_REQUIRED',400],
  ['stable idempotency key',{},'short',undefined,'IDEMPOTENCY_KEY_REQUIRED',400],
  ['session CSRF',{},'synthetic-validation-key','fixture:wrong-csrf','CSRF_REJECTED',403],
 ] as const)('requires %s before preparing a local change',async(_name,overrides,key,csrf,code,status)=>{
  const session=await start();
  const body={kind:'preference_confirmed',payload:compileDemoEvents()[0]!.payload,confirmed:true,expectedVersion:0,...overrides};
  await expect(session.client.request('/demo/events/prepare',body,csrf??session.csrf,key)).rejects.toMatchObject({code,status});
  const unchanged=await session.client.request<Snapshot>('/demo/session');expect(unchanged.memoryVersion).toBe(0);expect(unchanged.pendingOperation).toBeNull();
 });
 it('uses authoritative synthetic observation drafts instead of accepting forged chain facts',async()=>{
  const session=await start();
  await expect(session.client.request('/demo/events/prepare',{
   kind:'observation_recorded',payload:{observation:{observationId:'fixture:unknown-live-observation',dataOrigin:'live',amountAtomic:'999999999'}},confirmed:true,expectedVersion:0,
  },session.csrf,'synthetic-forged-observation')).rejects.toMatchObject({code:'OBSERVATION_NOT_FOUND',status:404});
  const after=await apply(session,'observation_recorded',{observation:{...demoObservation('A'),dataOrigin:'live',amountAtomic:'999999999'}});
  expect(after.projection.observations['fixture:tx-A']).toMatchObject({dataOrigin:'synthetic',chain:'sui:fixture',amountAtomic:'12000000',evidence:null});
  expect(after.events[0]?.evidenceKind).toBe('synthetic');
 });
 it('applies the edited correction, not a canned teaching answer, and binds it to the actual target event',async()=>{
  const session=await start(),{snapshot:before,ids}=await seedThrough(session,6);
  expect(tools(before)).toBe('49000000');expect(before.decisions['fixture:tx-C']?.classification).toBe('expense');
  const payload={observationId:'fixture:tx-C',classification:'internal_transfer',category:null,correctsEventId:ids.M06,reason:'Synthetic test user identifies an internal transfer.'};
  await expect(session.client.request('/demo/events/prepare',{
   kind:'correction_confirmed',payload:{...payload,correctsEventId:ids.M05},confirmed:true,expectedVersion:6,
  },session.csrf,'synthetic-wrong-correction-target')).rejects.toMatchObject({status:400});
  const unchanged=await session.client.request<Snapshot>('/demo/session');expect(unchanged.stateHash).toBe(before.stateHash);expect(unchanged.pendingOperation).toBeNull();
  const after=await apply(session,'correction_confirmed',payload);
  expect(after.decisions['fixture:tx-C']?.classification).toBe('internal_transfer');expect(tools(after)).toBe('24000000');
  expect(after.events.at(-1)?.payload).toMatchObject(payload);expect(after.events[5]?.payload.decision).toMatchObject({classification:'expense'});
 });
 it('honors an edited narrower scope and rejects an invalid or widening replacement without activating it',async()=>{
  const session=await start(),{snapshot:before}=await seedThrough(session,7);
  const previewBefore=await session.client.request<Preview>('/demo/classify',{observationId:'fixture:tx-F-preview',memoryMode:'on'},session.csrf);
  expect(previewBefore.decision.classification).toBe('expense');
  const template=structuredClone(compileDemoEvents()[7]!.payload.rule) as PolicyRule;
  for(const scope of [{...template.scope,minAmountAtomic:'21000000',maxAmountAtomic:'20000000'},{...template.scope,maxAmountAtomic:'31000000'}]){
   await expect(session.client.request('/demo/events/prepare',{
    kind:'rule_confirmed',payload:{rule:{...template,scope}},confirmed:true,expectedVersion:7,
   },session.csrf,`synthetic-invalid-scope-${scope.maxAmountAtomic}`)).rejects.toMatchObject({status:400});
   const rejected=await session.client.request<Snapshot>('/demo/session');expect(rejected.stateHash).toBe(before.stateHash);expect(rejected.pendingOperation).toBeNull();
  }
  const after=await apply(session,'rule_confirmed',{rule:{...template,scope:{...template.scope,maxAmountAtomic:'10000000'}}});
  expect(after.projection.rules['rule-tools-v1']?.status).toBe('superseded');
  expect(after.projection.rules['rule-tools-v2']).toMatchObject({status:'active',scope:{minAmountAtomic:'5000000',maxAmountAtomic:'10000000'}});
  const previewAfter=await session.client.request<Preview>('/demo/classify',{observationId:'fixture:tx-F-preview',memoryMode:'on'},session.csrf);
  expect(previewAfter.inputHash).toBe(previewBefore.inputHash);expect(previewAfter.decision.classification).toBe('needs_context');
  expect(previewAfter.decision.reasonCodes).toContain('amount_above_maximum');
 });
 it('applies the edited refund target and amount, while rejecting over-cap and duplicate links',async()=>{
  const session=await start(),{snapshot:before}=await seedThrough(session,9);
  expect(tools(before)).toBe('24000000');expect(before.decisions['fixture:tx-D']?.classification).toBe('needs_context');
  const payload={refundObservationId:'fixture:tx-D',originalObservationId:'fixture:tx-A',coinType:DEMO_COIN,amountAtomic:'5000000'};
  await expect(session.client.request('/demo/events/prepare',{
   kind:'refund_link_confirmed',payload:{...payload,amountAtomic:'13000000'},confirmed:true,expectedVersion:9,
  },session.csrf,'synthetic-over-cap-refund')).rejects.toMatchObject({status:400});
  const unchanged=await session.client.request<Snapshot>('/demo/session');expect(unchanged.stateHash).toBe(before.stateHash);expect(unchanged.pendingOperation).toBeNull();
  const after=await apply(session,'refund_link_confirmed',payload);
  expect(tools(after)).toBe('19000000');expect(after.decisions['fixture:tx-D']?.classification).toBe('refund');
  expect(after.summary.refundLinks).toMatchObject([{...payload,status:'active'}]);expect(after.events.at(-1)?.payload).toEqual(payload);
  await expect(session.client.request('/demo/events/prepare',{
   kind:'refund_link_confirmed',payload,confirmed:true,expectedVersion:10,
  },session.csrf,'synthetic-duplicate-refund')).rejects.toMatchObject({status:400});
  const retained=await session.client.request<Snapshot>('/demo/session');expect(retained.stateHash).toBe(after.stateHash);expect(tools(retained)).toBe('19000000');expect(retained.pendingOperation).toBeNull();
 });
 it('isolates histories, pending operations, CSRF, and idempotency keys between tabs and loses state on reload',async()=>{
  const first=await start(),second=await start(),payload=compileDemoEvents()[0]!.payload;
  const body={kind:'preference_confirmed',payload,confirmed:true,expectedVersion:0},key='synthetic-same-key-two-tabs';
  const firstOperation=await first.client.request<Operation>('/demo/events/prepare',body,first.csrf,key);
  await expect(second.client.request(`/demo/operations/${firstOperation.operationId}`)).rejects.toMatchObject({code:'OPERATION_NOT_FOUND',status:404});
  await expect(second.client.request('/demo/events/prepare',body,first.csrf,key)).rejects.toMatchObject({code:'CSRF_REJECTED',status:403});
  const secondOperation=await second.client.request<Operation>('/demo/events/prepare',body,second.csrf,key);
  expect(secondOperation.operationId).not.toBe(firstOperation.operationId);
  const firstDone=await first.client.request<Snapshot>(`/demo/operations/${firstOperation.operationId}/complete`,{},first.csrf);
  const secondPending=await second.client.request<Snapshot>('/demo/session');
  expect(firstDone.scopeId).not.toBe(secondPending.scopeId);expect(firstDone.memoryVersion).toBe(1);expect(secondPending.memoryVersion).toBe(0);
  expect(secondPending.pendingOperation).toMatchObject({operationId:secondOperation.operationId,state:'pending'});
  await expect(second.client.request(`/demo/operations/${firstOperation.operationId}/complete`,{},second.csrf)).rejects.toMatchObject({code:'OPERATION_NOT_FOUND',status:404});
  const secondDone=await second.client.request<Snapshot>(`/demo/operations/${secondOperation.operationId}/complete`,{},second.csrf);expect(secondDone.memoryVersion).toBe(1);
  const reloaded=createLocalSandbox();await expect(reloaded.request('/demo/session')).rejects.toMatchObject({code:'UNAUTHORIZED',status:401});
  const fresh=await start(reloaded),freshSnapshot=await fresh.client.request<Snapshot>('/demo/session');
  expect(freshSnapshot.scopeId).not.toBe(firstDone.scopeId);expect(freshSnapshot.scopeId).not.toBe(secondDone.scopeId);expect(freshSnapshot.events).toEqual([]);expect(freshSnapshot.pendingOperation).toBeNull();
 });
 it('keeps frozen fixed-input off/on comparisons independent of edited local history and adds no events',async()=>{
  const session=await start(),frozenBefore=await session.client.request<Snapshot>('/demo');
  const {ids}=await seedThrough(session,6);
  const edited=await apply(session,'correction_confirmed',{observationId:'fixture:tx-C',classification:'internal_transfer',category:null,correctsEventId:ids.M06,reason:'Synthetic local edit must not rewrite frozen comparisons.'});
  expect(edited.decisions['fixture:tx-C']?.classification).toBe('internal_transfer');
  const comparisons=[['B',4,'expense'],['B',8,'expense'],['B',12,'needs_context'],['E',4,'expense'],['E',8,'needs_context'],['E',12,'needs_context']] as const;
  for(const [inputId,asOfSequence,classification] of comparisons){
   const off=await session.client.request<Replay>('/demo/replay',{inputId,asOfSequence,memoryMode:'off'});
   const on=await session.client.request<Replay>('/demo/replay',{inputId,asOfSequence,memoryMode:'on'});
   expect(off.inputHash).toBe(on.inputHash);expect(off.inputHash).toMatch(/^[a-f0-9]{64}$/);
   expect(off.decision.classification).toBe('needs_context');expect(on.decision.classification).toBe(classification);
   expect(off.memoryEventsAdded).toBe(0);expect(on.memoryEventsAdded).toBe(0);
  }
  const frozenAfter=await session.client.request<Snapshot>('/demo');expect(frozenAfter.stateHash).toBe(frozenBefore.stateHash);expect(frozenAfter.events.map(event=>event.eventId)).toEqual(['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12']);
  expect(frozenAfter.decisions['fixture:tx-C']?.classification).toBe('reimbursement');
  const retained=await session.client.request<Snapshot>('/demo/session');expect(retained.stateHash).toBe(edited.stateHash);expect(retained.memoryVersion).toBe(7);
 });
});

it('uses local state with fresh HTTP instances, preserves real HTTP safety/errors, and never falls back after a local failure',async()=>{
 const httpPaths:string[]=[];
 // The transport boundary invokes a fresh real Fastify handler on every HTTP call;
 // it is not an echo server and provides no server-session affinity for demo state.
 const fetcher=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
  const path=String(input);httpPaths.push(path);const app=buildApp({writesEnabled:false});
  try{
   const headers=Object.fromEntries(new Headers(init?.headers).entries());
   const response=await app.inject({method:init?.method==='POST'?'POST':'GET',url:path,headers:{...headers,origin:'http://localhost:5173'},payload:init?.body===undefined?undefined:String(init.body)});
   return new Response(response.body,{status:response.statusCode,headers:{'content-type':String(response.headers['content-type']??'application/json')}});
  }finally{await app.close();}
 });
 vi.stubGlobal('fetch',fetcher);
 const session=await start({request:api});const {snapshot}=await seedThrough(session,6);
 expect(snapshot.decisions['fixture:tx-C']?.classification).toBe('expense');expect(tools(snapshot)).toBe('49000000');expect(httpPaths).toEqual([]);
 const health=await api('/health');expect(health).toMatchObject({operatorEnabled:false,writesEnabled:false,persistence:'not_configured'});
 const denied=api('/session',{});await expect(denied).rejects.toBeInstanceOf(ApiResponseError);
 await expect(denied).rejects.toMatchObject({code:'UNAUTHORIZED',status:401});
 const pathsBeforeLocalFailure=[...httpPaths];
 await expect(api('/demo/events/prepare',{kind:'preference_confirmed',payload:compileDemoEvents()[0]!.payload,confirmed:true,expectedVersion:0},session.csrf,'synthetic-api-stale-version')).rejects.toMatchObject({code:'VERSION_CONFLICT',status:409});
 await expect(api('/demo/not-a-route',{},session.csrf)).rejects.toMatchObject({code:'NOT_FOUND',status:404});
 expect(httpPaths).toEqual(pathsBeforeLocalFailure);
 const retained=await api<Snapshot>('/demo/session');expect(retained.stateHash).toBe(snapshot.stateHash);expect(retained.memoryVersion).toBe(6);
 expect(httpPaths).toEqual(['/api/health','/api/session']);
});
