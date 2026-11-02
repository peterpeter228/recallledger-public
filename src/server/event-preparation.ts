import type {MemoryEvent,TransactionObservation} from '../../contracts/domain-contracts.js';
import {canonicalize,classifyObservation,currentDecision,emptyState,eventIntegrity,eventText,hashCanonical,replayEvents,validateEvent} from '../domain/index.js';
import {DEMO_EVALUATED_AT} from '../domain/demo.js';
import {ApiError} from './errors.js';
import type {PreparedEvent} from './store.js';

export interface PreparationSession {
 scope:string;
 drafts:Map<string,TransactionObservation>;
 proposals:Map<string,{kind:string;payload:Record<string,unknown>;version:number;expires:number}>;
 previews:Map<string,{observationId:string;evaluatedAt:string;version:number;inputHash:string;expires:number}>;
}
export interface PrepareMemoryEventInput {
 kind:MemoryEvent['kind'];body:Record<string,unknown>;history:MemoryEvent[];demo:boolean;
 revokedRuleId?:string;eventId?:string;recordedAt?:string;now?:number;
 resolvedPayload?:Readonly<Record<string,unknown>>;
}

function fields(value:unknown):Record<string,unknown> {
 if(value===undefined)return {};
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new ApiError('INVALID_INPUT');
 return Object.fromEntries(Object.entries(value));
}

function draftObservation(session:PreparationSession,id:unknown):TransactionObservation {
 const observation=typeof id==='string'?session.drafts.get(id):undefined;
 if(!observation)throw new ApiError('OBSERVATION_NOT_FOUND',404);
 return observation;
}

/** Resolve authoritative drafts and proposals before enqueue, without history-dependent work. */
export function resolveMemoryEventPayload(session:PreparationSession,input:Pick<PrepareMemoryEventInput,'kind'|'body'|'revokedRuleId'|'now'>):Readonly<Record<string,unknown>> {
 const {kind,body}=input,now=input.now??Date.now();
 let payload:Record<string,unknown>=body.payload?structuredClone(fields(body.payload)):Object.fromEntries(Object.entries(body).filter(([key])=>!['confirmed','expectedVersion'].includes(key)));
 if(kind==='observation_recorded'){
  const imported=draftObservation(session,payload.observationId??payload.observationDraftId??fields(payload.observation).observationId);
  if(imported.evidence?.status==='failed')throw new ApiError('TRANSACTION_FAILED',422);
  payload={observation:imported};
 }
 for(const [eventKind,proposalField,proposalKind] of [['rule_confirmed','ruleProposalId','rules'],['correction_confirmed','correctionProposalId','corrections']] as const){
  if(kind===eventKind&&payload[proposalField]){
   const id=payload[proposalField],proposal=typeof id==='string'?session.proposals.get(id):undefined;
   if(!proposal||proposal.kind!==proposalKind||proposal.expires<now||proposal.version!==body.expectedVersion)throw new ApiError('PROPOSAL_STALE',409);
   payload=structuredClone(proposal.payload);
  }
 }
 if(kind==='rule_revoked')payload={ruleVersionId:input.revokedRuleId??payload.ruleVersionId,reason:payload.reason};
 return payload;
}

/** One authoritative history-dependent event builder; the resolved payload is never mutated. */
export function prepareMemoryEvent(session:PreparationSession,input:PrepareMemoryEventInput):PreparedEvent {
 const {kind,history,demo}=input,now=input.now??Date.now();
 let payload=structuredClone(input.resolvedPayload??resolveMemoryEventPayload(session,input));
 const state=history.length?replayEvents(history):emptyState(session.scope),eventId=input.eventId??crypto.randomUUID();
 let ruleSource:TransactionObservation|undefined,ruleSourceEvent:string|undefined;
 if(kind==='rule_confirmed'){
  const rule=fields(payload.rule),scope=fields(rule.scope),sourceId=payload.sourceObservationId;
  if(scope.chain==='sui:mainnet'||sourceId){
   ruleSource=typeof sourceId==='string'?state.observations[sourceId]:undefined;
   if(!ruleSource)throw new ApiError('SOURCE_OBSERVATION_REQUIRED',422);
   const source=ruleSource;
   if(source.complexity!=='simple'||!source.counterpartyRef||source.evidence?.status==='failed'||!(['chain','walletRef','counterpartyRef','coinType','direction'] as const).every(key=>scope[key]===source[key]))throw new ApiError('RULE_SOURCE_MISMATCH',422);
   if(scope.chain==='sui:mainnet'&&(ruleSource.dataOrigin==='synthetic'||!ruleSource.evidence))throw new ApiError('RULE_SOURCE_MISMATCH',422);
   ruleSourceEvent=history.find(event=>fields(event.payload.observation).observationId===sourceId)?.eventId;
   if(!ruleSourceEvent)throw new ApiError('SOURCE_OBSERVATION_REQUIRED',422);
  }
  payload={rule:{...rule,status:'active',userConfirmed:true,confirmationEventId:eventId}};
 }
 if(kind==='decision_recorded'){
  const o=draftObservation(session,payload.observationId??fields(payload.observation).observationId??fields(payload.decision).observationId),id=o.observationId;
  let at=DEMO_EVALUATED_AT;
  if(!demo||payload.previewToken){
   const preview=typeof payload.previewToken==='string'?session.previews.get(payload.previewToken):undefined;
   if(!preview||preview.expires<now||preview.version!==history.length||preview.observationId!==id||preview.inputHash!==hashCanonical(o))throw new ApiError('PREVIEW_STALE',409);
   at=demo?preview.evaluatedAt:new Date(now).toISOString();
   if(!demo&&hashCanonical({...classifyObservation(state,o,at),evaluatedAt:preview.evaluatedAt})!==hashCanonical(classifyObservation(state,o,preview.evaluatedAt)))throw new ApiError('PREVIEW_STALE',409);
  }
  payload={observation:o,decision:(state.labels[id]||state.decisions[id]||state.refundLinks.some(link=>link.refundObservationId===id))?currentDecision(state,id):classifyObservation(state,o,at)};
 }
 const recordedAt=input.recordedAt??new Date(now).toISOString(),confirmed=kind.endsWith('_confirmed')||kind==='rule_revoked';
 const payloadObservation=fields(payload.observation),knownObservation=typeof payload.observationId==='string'?state.observations[payload.observationId]:undefined,knownRefund=typeof payload.refundObservationId==='string'?state.observations[payload.refundObservationId]:undefined;
 const event=validateEvent({schemaVersion:'1.0',eventId,scopeId:session.scope,sequence:history.length+1,kind,eventTime:demo?DEMO_EVALUATED_AT:recordedAt,recordedAt,inputRef:ruleSource?.transactionRef??payload.observationId??payloadObservation.transactionRef??null,evidenceKind:!demo&&((ruleSource&&ruleSource.dataOrigin!=='synthetic')||payloadObservation.dataOrigin==='live'||knownObservation?.dataOrigin==='live'||knownRefund?.dataOrigin==='live')?'mainnet_observed':'synthetic',payload,parentEventIds:[...new Set([...(history.length?[history.at(-1)!.eventId]:[]),...(ruleSourceEvent?[ruleSourceEvent]:[])])],previousEventHash:history.length?eventIntegrity(history.at(-1)!).eventHash:null,author:confirmed?'user':'system',confirmation:confirmed?'user_confirmed':'not_applicable'}) as MemoryEvent;
 replayEvents([...history,event]);
 return {event,canonicalJson:canonicalize(event),...eventIntegrity(event),memoryText:eventText(event)};
}
