import {it,expect} from 'vitest';
import {buildApp} from '../../src/server/app';
import {compileDemoEvents,demoObservation} from '../../src/domain/demo';
import {manualRulePayload} from '../../src/web/operator-rule';
import type {MemoryEvent,TransactionObservation} from '../../contracts/domain-contracts';
// SYNTHETIC mainnet-shaped provider evidence only. Never a real Tatum result or mainnet receipt.
const source:TransactionObservation={...demoObservation('A'),observationId:'synthetic-live-shaped',dataOrigin:'recorded_live',chain:'sui:mainnet',transactionRef:'synthetic-not-real-digest',evidence:{network:'mainnet',transactionDigest:'synthetic-not-real-digest',status:'success',checkpoint:'1',timestampMs:1,sender:'DEMO_OWNER',balanceChanges:[{address:'DEMO_OWNER',coinType:'fixture:TEST_USDC',amountAtomic:'-12000000'}],gas:null,fetchedAt:'2026-10-28T00:00:00.000Z',provider:'tatum',transport:'grpc'}};
const event:MemoryEvent={...compileDemoEvents()[1]!,eventId:'synthetic-source-event',scopeId:'owner',sequence:1,previousEventHash:null,parentEventIds:[],evidenceKind:'mainnet_observed',payload:{observation:source}};
const fields={minAmountAtomic:'5000000',maxAmountAtomic:'20000000',validFrom:'2026-01-01T00:00:00.000Z',validUntil:'2027-01-01T00:00:00.000Z',classification:'expense' as const};
it('mainnet scope alone is not observation evidence; source must be durable, exact and not replaced on confirmation',async()=>{
 let history:MemoryEvent[]=[],built:MemoryEvent|undefined;
 const store:any={kind:'postgres',events:async()=>history,version:async()=>history.length,pendingOperation:async()=>null,lookup:async()=>null,enqueue:async(_s:any,_k:any,_h:any,_v:any,build:any)=>{built=build(history).event;return {operationId:'synthetic-only-operation'}}};
 const app=buildApp({store,operatorToken:'synthetic-only',secureCookies:false,writesEnabled:true});try{
 const login=await app.inject({method:'POST',url:'/api/session',headers:{origin:'http://localhost:5173'},payload:{token:'synthetic-only'}});const h={origin:'http://localhost:5173',cookie:String(login.headers['set-cookie']).split(';')[0]!,'x-csrf-token':login.json().data.csrfToken,'idempotency-key':'synthetic-source-key'};
 const proposal=async(body:any)=>(await app.inject({method:'POST',url:'/api/rules/propose',headers:h,payload:body})).json().data;
 const confirm=async(p:any,extra:any={})=>app.inject({method:'POST',url:'/api/rules/confirm',headers:h,payload:{ruleProposalId:p.ruleProposalId,expectedVersion:history.length,confirmed:true,...extra}});
 const noSource=await proposal({...manualRulePayload(source,fields),sourceObservationId:undefined});const denied=await confirm(noSource);expect(denied.statusCode).toBe(422);expect(denied.json().error.code).toBe('SOURCE_OBSERVATION_REQUIRED');
 const pending=await proposal(manualRulePayload(source,fields));expect((await confirm(pending)).statusCode).toBe(422);
 history=[event];
 for(const key of ['chain','walletRef','counterpartyRef','coinType','direction'] as const){const body=manualRulePayload(source,fields);(body.scope as any)[key]=key==='chain'?'sui:fixture':key==='direction'?'in':'different';const p=await proposal(body);const bad=await confirm(p);expect(bad.statusCode,bad.body).toBe(422);expect(bad.json().error.code).toBe('RULE_SOURCE_MISMATCH');}
 for(const unsafe of [{...source,complexity:'complex' as const},{...source,counterpartyRef:null},{...source,evidence:{...source.evidence!,status:'failed' as const}}]){history=[{...event,payload:{observation:unsafe}}];const proposed=await proposal(manualRulePayload(source,fields));const rejected=await confirm(proposed);expect(rejected.statusCode,rejected.body).toBe(422);expect(rejected.json().error.code).toBe('RULE_SOURCE_MISMATCH');}
 history=[event];
 const p=await proposal(manualRulePayload(source,fields));const ok=await confirm(p,{sourceObservationId:'attacker-replacement',observation:{dataOrigin:'live'}});expect(ok.statusCode,ok.body).toBe(202);expect(built!.evidenceKind).toBe('mainnet_observed');expect(built!.inputRef).toBe(source.transactionRef);expect(built!.parentEventIds).toEqual([event.eventId]);expect(built!.payload).not.toHaveProperty('sourceObservationId');expect(built!.payload).not.toHaveProperty('observation');
 }finally{await app.close()}
});
