import {z} from 'zod';
import type {MemoryEvent} from '../../contracts/domain-contracts.js';
import {buildDemo,demoObservation,DEMO_EVALUATED_AT,replayDemo} from '../domain/demo.js';
import {classifyObservation,currentDecision,emptyState,hashCanonical,replayEvents,scopeSchema,stateHash,summarize} from '../domain/index.js';
import {prepareMemoryEvent,resolveMemoryEventPayload,type PreparationSession} from '../server/event-preparation.js';
import {ApiError} from '../server/errors.js';
import {SandboxStore} from '../server/sandbox-store.js';

const inputIds=['A','B','C','D','E','F-preview'];
const bodySchema=z.record(z.string(),z.unknown());
const mutationPaths:Record<string,MemoryEvent['kind']>={
 'preferences/confirm':'preference_confirmed','observations/import':'observation_recorded',
 'labels/confirm':'label_confirmed','rules/confirm':'rule_confirmed','decisions/record':'decision_recorded',
 'corrections/confirm':'correction_confirmed','refunds/link':'refund_link_confirmed',
};
interface LocalSession extends PreparationSession {csrf:string;expires:number}

/** One in-memory teaching session per adapter/tab; no HTTP, credentials, or persistence. */
export function createLocalSandbox(){
 const store=new SandboxStore();
 let session:LocalSession|undefined;
 const requireSession=(csrf?:string,write=false)=>{
  if(!session||session.expires<Date.now())throw new ApiError('UNAUTHORIZED',401);
  if(write&&csrf!==session.csrf)throw new ApiError('CSRF_REJECTED',403);
  return session;
 };
 const observation=(s:LocalSession,id:unknown)=>{
  const value=typeof id==='string'?s.drafts.get(id):undefined;
  if(!value)throw new ApiError('OBSERVATION_NOT_FOUND',404);
  return value;
 };
 const snapshot=async(s:LocalSession)=>{
  const events=await store.events(s.scope),projection=events.length?replayEvents(events):emptyState(s.scope),pending=await store.pendingOperation(s.scope);
  return {scopeId:s.scope,pendingOperation:pending?{operationId:pending.operationId,state:pending.state,eventId:pending.eventId}:null,events,observations:[...s.drafts.values()],projection,summary:summarize(projection),decisions:Object.fromEntries([...s.drafts.keys()].map(id=>[id,projection.observations[id]?currentDecision(projection,id):null])),stateHash:stateHash(projection),memoryVersion:events.length,durableVersion:0,mode:'ephemeral-synthetic'};
 };
 const route=async(path:string,body:unknown,csrf?:string,idempotencyKey?:string):Promise<unknown>=>{
  const write=body!==undefined;
  if(path==='/demo'&&!write){
   const demo=buildDemo();
   return {...demo,projection:demo.state,decisions:Object.fromEntries(inputIds.map(id=>{const o=demoObservation(id);return [o.observationId,demo.state.observations[o.observationId]?currentDecision(demo.state,o.observationId):null]})),observations:inputIds.map(demoObservation),mode:'frozen-synthetic',memoryVersion:12,durableVersion:0};
  }
  if(path==='/demo/replay'&&write){
   const input=bodySchema.parse(body);
   return replayDemo(z.string().parse(input.inputId),z.number().parse(input.asOfSequence),z.enum(['on','off']).parse(input.memoryMode));
  }
  if(path==='/demo/session'&&write){
   if(session)store.delete(session.scope);
   session={scope:'sandbox:'+crypto.randomUUID(),csrf:crypto.randomUUID(),expires:Date.now()+3600000,drafts:new Map(),proposals:new Map(),previews:new Map()};
   for(const id of inputIds){const o=demoObservation(id);session.drafts.set(o.observationId,o);}
   return {...await snapshot(session),csrfToken:session.csrf};
  }
  if(!path.startsWith('/demo/'))throw new ApiError('NOT_FOUND',404);
  const s=requireSession(csrf,write),suffix=path.slice('/demo/'.length);
  if(suffix==='session'&&!write)return {...await snapshot(s),csrfToken:s.csrf};
  if(suffix==='memory/timeline'&&!write)return snapshot(s);
  const keyMatch=/^operation-keys\/([^/]+)$/.exec(suffix);
  if(keyMatch&&!write){
   const key=decodeURIComponent(keyMatch[1]!);
   if(key.length<8||key.length>200)throw new ApiError('INVALID_INPUT');
   const operation=await store.operationByKey(s.scope,key);
   return {found:!!operation,operation:operation?{operationId:operation.operationId,state:operation.state,jobId:operation.jobId}:null};
  }
  const operationMatch=/^operations\/([^/]+)(\/complete)?$/.exec(suffix);
  if(operationMatch){
   const id=decodeURIComponent(operationMatch[1]!);
   if(operationMatch[2]&&write)return {...await store.completeSimulation(s.scope,id),...await snapshot(s)};
   if(!operationMatch[2]&&!write){const operation=await store.operation(s.scope,id);if(!operation)throw new ApiError('OPERATION_NOT_FOUND',404);return {operationId:operation.operationId,state:operation.state,jobId:operation.jobId};}
  }
  if(!write)throw new ApiError('NOT_FOUND',404);
  const input=bodySchema.parse(body);
  if(suffix==='transactions/inspect'){
   const o=demoObservation(z.string().parse(input.inputId));s.drafts.set(o.observationId,o);
   return {observationDraftId:o.observationId,observation:o};
  }
  if(suffix==='classify'){
   const o=observation(s,input.observationId),events=await store.events(s.scope),state=events.length?replayEvents(events):emptyState(s.scope),at=input.evaluatedAt??DEMO_EVALUATED_AT;
   if(typeof at!=='string'||Number.isNaN(Date.parse(at)))throw new ApiError('INVALID_INPUT');
   const decision=(state.labels[o.observationId]||state.decisions[o.observationId]||state.refundLinks.some(link=>link.refundObservationId===o.observationId))?currentDecision(state,o.observationId):classifyObservation(input.memoryMode==='off'?emptyState(s.scope):state,o,at);
   const previewToken=crypto.randomUUID();
   s.previews.set(previewToken,{observationId:o.observationId,evaluatedAt:at,version:events.length,inputHash:hashCanonical(o),expires:input.memoryMode==='off'?0:Date.now()+300000});
   return {decision,previewToken,inputHash:hashCanonical(o)};
  }
  if(suffix==='rules/propose'||suffix==='corrections/propose'){
   if(s.proposals.size>=100)throw new ApiError('PROPOSAL_CAPACITY',429);
   const type=suffix==='rules/propose'?'rules':'corrections',version=await store.version(s.scope);
   let payload:Record<string,unknown>;
   if(type==='rules'){
    if(input.text&&!input.scope)throw new ApiError('MODEL_UNAVAILABLE',503);
    payload={sourceObservationId:input.sourceObservationId,rule:input.rule??{scope:scopeSchema.parse(input.scope),classification:input.classification,category:input.category??null,ruleFamilyId:input.ruleFamilyId??crypto.randomUUID(),ruleVersionId:crypto.randomUUID(),revision:input.revision??1,supersedesRuleVersionId:input.supersedesRuleVersionId??null}};
   }else{
    observation(s,input.observationId);
    if(input.text)throw new ApiError('MODEL_UNAVAILABLE',503);
    payload={observationId:input.observationId,classification:input.classification,category:input.category??null,correctsEventId:input.correctsEventId,reason:input.reason};
   }
   const id=crypto.randomUUID(),expires=Date.now()+300000;
   s.proposals.set(id,{kind:type,payload,version,expires});
   return {[type==='rules'?'ruleProposalId':'correctionProposalId']:id,payload,expectedVersion:version,expiresAt:new Date(expires).toISOString()};
  }
  if(suffix==='memory/restore-check'){
   const snap=await snapshot(s);
   return {status:'simulated',source:'ephemeral_session_events',stateHash:snap.stateHash,expectedCount:snap.events.length,restoredCount:snap.events.length,remoteRestoreVerified:false,note:'Local replay only; not Walrus cold restore.'};
  }
  const revoke=/^rules\/([^/]+)\/revoke$/.exec(suffix);
  const kind=suffix==='events/prepare'?input.kind:revoke?'rule_revoked':mutationPaths[suffix];
  if(!kind)throw new ApiError('NOT_FOUND',404);
  if(typeof idempotencyKey!=='string'||idempotencyKey.length<8||idempotencyKey.length>200)throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
  const expected=input.expectedVersion;
  if(typeof expected!=='number'||!Number.isInteger(expected)||expected<0)throw new ApiError('EXPECTED_VERSION_REQUIRED');
  if(input.confirmed!==true)throw new ApiError('SCOPE_NOT_CONFIRMED');
  const requestHash=hashCanonical({route:'/api'+path,body:input}),prior=await store.lookup(s.scope,idempotencyKey,requestHash);
  if(prior)return prior;
  const eventKind=z.enum(['preference_confirmed','observation_recorded','label_confirmed','rule_confirmed','decision_recorded','correction_confirmed','refund_link_confirmed','rule_revoked']).parse(kind);
  const revokedRuleId=revoke?decodeURIComponent(revoke[1]!):undefined;
  const resolvedPayload=resolveMemoryEventPayload(s,{kind:eventKind,body:input,revokedRuleId});
  return store.enqueue(s.scope,idempotencyKey,requestHash,expected,history=>prepareMemoryEvent(s,{kind:eventKind,body:input,history,demo:true,revokedRuleId,resolvedPayload}));
 };
 return {async request<T=unknown>(path:string,body?:unknown,csrf?:string,idempotencyKey?:string):Promise<T>{
  try {
   const input:unknown=body===undefined?undefined:JSON.parse(JSON.stringify(body));
   // Like the HTTP JSON client, the requested response type belongs to its caller.
   const response=structuredClone(await route(path,input,csrf,idempotencyKey)) as T;
   return response;
  }catch(error){
   if(error instanceof ApiError)throw error;
   throw new ApiError(error instanceof Error&&error.name==='ZodError'?'INVALID_INPUT':'REQUEST_FAILED');
  }
 }};
}
