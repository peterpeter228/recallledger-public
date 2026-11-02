import {describe,it,expect} from 'vitest';
import {buildApp} from '../../src/server/app.js';
import {compileDemoEvents} from '../../src/domain/demo.js';
const origin='http://localhost:5173';
describe('HTTP synthetic sandbox and authorization',()=>{
 it('constructs all twelve events with pending gating and isolated no-remote sessions',async()=>{
 const app=buildApp({secureCookies:false});const start=await app.inject({method:'POST',url:'/api/demo/session',headers:{origin}});expect(start.statusCode).toBe(200);const cookie=start.headers['set-cookie']!.toString().split(';')[0];const csrf=start.json().data.csrfToken;const headers={origin,cookie,'x-csrf-token':csrf};const events=compileDemoEvents();const ids:Record<string,string>={};
 for(const [i,event] of events.entries()){let payload=structuredClone(event.payload) as any;
 if(event.kind==='observation_recorded')payload={observationId:payload.observation.observationId};if(event.kind==='decision_recorded')payload={observationId:payload.observation.observationId};if(event.kind==='correction_confirmed')payload.correctsEventId=ids[payload.correctsEventId];
 const body={kind:event.kind,payload,expectedVersion:i,confirmed:true};const h={...headers,'idempotency-key':'mutation-'+i};const prepared=await app.inject({method:'POST',url:'/api/demo/events/prepare',headers:h,payload:body});expect(prepared.statusCode,prepared.body).toBe(202);const op=prepared.json().data;ids[event.eventId]=op.eventIds[0];expect(op.state).toBe('pending');
 const before=await app.inject({url:'/api/demo/session',headers:{cookie}});expect(before.json().data.memoryVersion).toBe(i);
 const duplicate=await app.inject({method:'POST',url:'/api/demo/events/prepare',headers:h,payload:body});expect(duplicate.json().data.operationId).toBe(op.operationId);
 const blocked=await app.inject({method:'POST',url:'/api/demo/events/prepare',headers:{...h,'idempotency-key':'other-key-'+i},payload:body});expect(blocked.json().error.code).toBe('MEMORY_PENDING');
 const done=await app.inject({method:'POST',url:'/api/demo/operations/'+op.operationId+'/complete',headers});expect(done.statusCode,done.body).toBe(200);expect(done.json().data.durableVersion).toBe(0);expect(done.json().data.memoryVersion).toBe(i+1);
 if([5,6,9].includes(i))expect(done.json().data.summary.assets[0].toolsSpendAtomic).toBe(({5:'49000000',6:'24000000',9:'12000000'} as any)[i]);
 }
 const frozen=await app.inject('/api/demo');expect(frozen.json().data.events[0].eventId).toBe('M01');
 const other=await app.inject({method:'POST',url:'/api/demo/session',headers:{origin}});expect(other.json().data.events).toHaveLength(0);await app.close();
 });
 it('rejects public writes, CSRF, forged chain facts and origin',async()=>{const app=buildApp({secureCookies:false});expect((await app.inject({method:'POST',url:'/api/labels/confirm',payload:{}})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/api/demo/session',headers:{origin:'https://evil.example'}})).statusCode).toBe(403);
 const s=await app.inject({method:'POST',url:'/api/demo/session',headers:{origin}});const cookie=s.headers['set-cookie']!.toString().split(';')[0];const b={kind:'observation_recorded',payload:{observation:{observationId:'fake',amountAtomic:'1',dataOrigin:'live'}},confirmed:true,expectedVersion:0};const h={cookie,origin,'idempotency-key':'forged-key'};expect((await app.inject({method:'POST',url:'/api/demo/events/prepare',headers:h,payload:b})).statusCode).toBe(403);const denied=await app.inject({method:'POST',url:'/api/demo/events/prepare',headers:{...h,'x-csrf-token':s.json().data.csrfToken},payload:b});expect(denied.json().error.code).toBe('OBSERVATION_NOT_FOUND');await app.close();});
});
