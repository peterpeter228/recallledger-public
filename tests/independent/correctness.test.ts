import {describe,it,expect,vi} from 'vitest';
import {buildApp} from '../../src/server/app';
import {compileDemoEvents} from '../../src/domain/demo';
const origin='http://localhost:5173';
async function setup(){
 const app=buildApp({secureCookies:false});
 const start=await app.inject({method:'POST',url:'/api/demo/session',headers:{origin}});
 const headers={origin,cookie:start.headers['set-cookie']!.toString().split(';')[0]!,'x-csrf-token':start.json().data.csrfToken};
 let version=0;
 const post=(url:string,payload:unknown,key='independent-'+Math.random())=>app.inject({method:'POST',url:'/api/demo/'+url,headers:{...headers,'idempotency-key':key},payload:payload as any});
 async function save(kind:string,payload:unknown){const p=await post('events/prepare',{kind,payload,expectedVersion:version,confirmed:true});expect(p.statusCode,p.body).toBe(202);const done=await post('operations/'+p.json().data.operationId+'/complete',{});expect(done.statusCode,done.body).toBe(200);version++;return done.json().data;}
 return {app,post,save,get version(){return version;}};
}
describe('independent HTTP business-invariant regressions',()=>{
 it('P1 imported unclassified transaction must use current rules and preserve its preview on record',async()=>{
  const s=await setup();try{
   for(const event of compileDemoEvents().slice(0,4)){const p=event.kind==='observation_recorded'?{observationId:'fixture:tx-A'}:event.payload;await s.save(event.kind,p);}
   await s.save('observation_recorded',{observationId:'fixture:tx-B'});
   const preview=await s.post('classify',{observationId:'fixture:tx-B'});expect(preview.statusCode).toBe(200);
   const result=await s.save('decision_recorded',{observationId:'fixture:tx-B',previewToken:preview.json().data.previewToken});
   expect({preview:preview.json().data.decision.classification,saved:result.projection.decisions['fixture:tx-B'].classification}).toEqual({preview:'expense',saved:'expense'});
  }finally{await s.app.close();}
 });
 it('P1 retry of accepted proposal confirmation must remain idempotent after proposal expiry',async()=>{
  const s=await setup();try{
   const proposed=await s.post('rules/propose',{rule:(compileDemoEvents()[3]!.payload as any).rule});expect(proposed.statusCode,proposed.body).toBe(200);
   const body={ruleProposalId:proposed.json().data.ruleProposalId,expectedVersion:0,confirmed:true};
   const first=await s.post('rules/confirm',body,'independent-retry-key');expect(first.statusCode,first.body).toBe(202);
   const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+360000);
   const retry=await s.post('rules/confirm',body,'independent-retry-key');
   expect({status:retry.statusCode,operation:retry.json().data?.operationId}).toEqual({status:202,operation:first.json().data.operationId});
  }finally{vi.restoreAllMocks();await s.app.close();}
 });
});

// Injected operator dependencies below are test doubles, never real provider results.
it('operator defaults classification to current time, not the frozen demonstration time',async()=>{
 const {buildDemo,demoObservation}=await import('../../src/domain/demo');
 const {hashCanonical,replayEvents}=await import('../../src/domain');
 const events=structuredClone(buildDemo(4).events);
 const observation:any={...demoObservation('B'),chain:'sui:mainnet',dataOrigin:'live',transactionRef:'test-digest',evidence:{network:'mainnet',transactionDigest:'test-digest',status:'success',checkpoint:null,timestampMs:1793016000000,sender:'DEMO_OWNER',balanceChanges:[{address:'DEMO_OWNER',coinType:'fixture:TEST_USDC',amountAtomic:'-12000000'}],gas:null,fetchedAt:'2026-10-26T10:00:00.000Z',provider:'tatum',transport:'grpc'}};
 // Only the rule is needed; turn it into a first mainnet rule event in this injected store.
 const ruleEvent:any=events[3];ruleEvent.sequence=1;ruleEvent.previousEventHash=null;ruleEvent.parentEventIds=[];ruleEvent.evidenceKind='mainnet_observed';ruleEvent.payload.rule.scope.chain='sui:mainnet';
 const history=[ruleEvent];replayEvents(history);
 const store:any={kind:'postgres',pendingOperation:async()=>null,events:async()=>history,version:async()=>1};
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-12-01T12:00:00.000Z'));
 const app=buildApp({secureCookies:false,operatorToken:'local-test-only',operatorScope:ruleEvent.scopeId,store,inspect:async()=>observation});
 try{
 const start=await app.inject({method:'POST',url:'/api/session',headers:{origin},payload:{token:'local-test-only'}});expect(start.statusCode,start.body).toBe(200);
 const headers={origin,cookie:start.headers['set-cookie']!.toString().split(';')[0]!,'x-csrf-token':start.json().data.csrfToken};
 const inspected=await app.inject({method:'POST',url:'/api/transactions/inspect',headers,payload:{digest:'test-digest',walletAddress:'DEMO_OWNER'}});expect(inspected.statusCode).toBe(200);
 const preview=await app.inject({method:'POST',url:'/api/classify',headers,payload:{observationId:observation.observationId}});expect(preview.statusCode,preview.body).toBe(200);
 expect(preview.json().data.decision.classification).toBe('needs_context');
 expect(preview.json().data.decision.reasonCodes).toContain('rule_expired');
 }finally{await app.close();vi.useRealTimers();}
});
it('fresh operator session can review persisted observations without querying chain provider again',async()=>{
 const history=compileDemoEvents();
 const store:any={kind:'postgres',pendingOperation:async()=>null,events:async()=>history,version:async()=>history.length};
 const app=buildApp({secureCookies:false,operatorToken:'local-test-only',operatorScope:history[0]!.scopeId,store});
 try{
 const start=await app.inject({method:'POST',url:'/api/session',headers:{origin},payload:{token:'local-test-only'}});expect(start.statusCode,start.body).toBe(200);
 const headers={origin,cookie:start.headers['set-cookie']!.toString().split(';')[0]!,'x-csrf-token':start.json().data.csrfToken};
 const preview=await app.inject({method:'POST',url:'/api/classify',headers,payload:{observationId:'fixture:tx-B'}});
 expect(preview.statusCode,preview.body).toBe(200);
 expect(preview.json().data.decision.classification).toBe('expense');
 expect(preview.json().data.decision.memoryVersion).toBe(4);
 }finally{await app.close();}
});
it('refund follows corrected expense category once and stops offsetting when refund itself is relabeled',async()=>{
 const {buildDemo}=await import('../../src/domain/demo');const {reduceEvent,hashCanonical,summarize}=await import('../../src/domain');
 let state=buildDemo(10).state;
 function label(id:string,classification:string,category:string|null){const last=state.events.at(-1)!;state=reduceEvent(state,{...last,eventId:'independent-'+(state.memoryVersion+1),sequence:state.memoryVersion+1,kind:'label_confirmed',payload:{observationId:id,classification,category},previousEventHash:hashCanonical(last),parentEventIds:[last.eventId]});}
 label('fixture:tx-B','expense','travel');expect(summarize(state).assets[0]!.toolsSpendAtomic).toBe('12000000');
 label('fixture:tx-B','expense','tools');expect(summarize(state).assets[0]!.toolsSpendAtomic).toBe('12000000');
 label('fixture:tx-D','income',null);expect(summarize(state).assets[0]!.toolsSpendAtomic).toBe('24000000');
});
