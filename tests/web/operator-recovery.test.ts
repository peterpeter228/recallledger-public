import {it,expect,vi,afterEach} from 'vitest';
import {api,ApiResponseError} from '../../src/web/api';
import {buildApp} from '../../src/server/app';
afterEach(()=>vi.unstubAllGlobals());
it('uses an explicitly supplied idempotency key unchanged and preserves typed rate-limit errors',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{operationId:'synthetic-op'}})});vi.stubGlobal('fetch',fetcher);
 await api('/labels/confirm',{confirmed:true},'synthetic-csrf','stable-original-request');
 expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toBe('stable-original-request');
 fetcher.mockResolvedValue({ok:false,status:429,json:async()=>({error:{code:'RATE_LIMITED',message:'RATE_LIMITED'}})});
 await expect(api('/labels/confirm',{},'synthetic-csrf','stable-original-request')).rejects.toMatchObject({code:'RATE_LIMITED',status:429});
 expect(fetcher).toHaveBeenCalledTimes(2); // No automatic retry.
});
it('recovers pending or already-done operation by key only in the authenticated scope, without payload disclosure',async()=>{
 let state='pending';const seen:string[]=[];const store:any={kind:'postgres',events:async()=>[],version:async()=>0,pendingOperation:async()=>state==='done'?null:{operationId:'synthetic-op',state,eventId:'synthetic-event'},operationByKey:async(scope:string,key:string)=>{seen.push(scope);return key==='original-key'?{operationId:'synthetic-op',state,jobId:'synthetic-job',memoryText:'PRIVATE_PAYLOAD_NOT_FOR_RESPONSE',operationKey:key}:null}};
 const app=buildApp({store,operatorToken:'synthetic-fixture-token',operatorScope:'scope-a',secureCookies:false});
 try{expect((await app.inject('/api/operation-keys/original-key')).statusCode).toBe(401);
 const login=await app.inject({method:'POST',url:'/api/session',headers:{origin:'http://localhost:5173'},payload:{token:'synthetic-fixture-token'}});expect(login.json().data.pendingOperation.operationId).toBe('synthetic-op');
 const headers={cookie:String(login.headers['set-cookie']).split(';')[0]!};
 const pending=await app.inject({url:'/api/operation-keys/original-key',headers});expect(pending.json().data.operation.state).toBe('pending');expect(pending.body).not.toContain('PRIVATE_PAYLOAD');
 state='done';const done=await app.inject({url:'/api/operation-keys/original-key',headers});expect(done.json().data.operation.state).toBe('done');
 expect((await app.inject({url:'/api/operation-keys/missing-key',headers})).json().data).toEqual({found:false,operation:null});expect(seen).toEqual(['scope-a','scope-a','scope-a']);
 }finally{await app.close()}
});
