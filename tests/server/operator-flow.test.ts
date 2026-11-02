import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {buildApp} from '../../src/server/app';
import {PostgresStore} from '../../src/server/store';
import {processOutboxOnce} from '../../src/server/outbox';
import {demoObservation} from '../../src/domain/demo';
import {manualRulePayload} from '../../src/web/operator-rule';
import {stateHash,replayEvents} from '../../src/domain';
const url=process.env.TEST_DATABASE_URL;
// Actual PG and HTTP contracts; every provider input and memory receipt is SYNTHETIC, no external calls.
describe.skipIf(!url)('protected operator learning slice · actual PG / synthetic providers',()=>{
 const schema='operator_'+randomUUID().replaceAll('-',''),scope='synthetic-operator';let pool:Pool,store:PostgresStore,app:ReturnType<typeof buildApp>,headers:Record<string,string>;
 const admin=new Pool({connectionString:url});
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);const u=new URL(url!);u.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:u.toString()});await pool.query(await readFile('migrations/001_initial.sql','utf8'));store=new PostgresStore(pool);await store.ensureScope(scope,'synthetic-owner','synthetic-namespace');app=buildApp({store,operatorScope:scope,operatorToken:'synthetic-only-token',secureCookies:false,writesEnabled:true,inspect:async id=>demoObservation(id)});await login();});
 afterAll(async()=>{await app?.close();await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 async function login(){const r=await app.inject({method:'POST',url:'/api/session',headers:{origin:'http://localhost:5173'},payload:{token:'synthetic-only-token'}});expect(r.statusCode).toBe(200);headers={origin:'http://localhost:5173',cookie:String(r.headers['set-cookie']).split(';')[0]!,'x-csrf-token':r.json().data.csrfToken};return r.json().data;}
 async function post(path:string,body:any){return app.inject({method:'POST',url:'/api'+path,headers:{...headers,'idempotency-key':randomUUID()},payload:body});}
 async function inspect(id:string){const r=await post('/transactions/inspect',{digest:id,walletAddress:'synthetic-wallet'});expect(r.statusCode,r.body).toBe(200);return r.json().data.observation;}
 async function mutate(path:string,payload:any){const r=await post(path,{...payload,confirmed:true,expectedVersion:await store.version(scope)});expect(r.statusCode,r.body).toBe(202);return r.json().data;}
 async function complete(){const adapter={submit:async()=>({jobId:'synthetic-job-'+randomUUID()}),status:async(jobId:string,e:any)=>({state:'done',receipt:{status:'done' as const,jobId,blobId:'synthetic-blob-'+jobId,memoryId:'synthetic-memory-'+jobId,ownerAddress:'synthetic-owner',namespace:e.namespace,textSha256:e.textSha256,verifiedAt:new Date().toISOString(),blobObjectId:null,endEpoch:null,expiresAt:null}})};await processOutboxOnce(store,adapter,scope);await pool.query('UPDATE memory_outbox SET next_attempt_at=NULL WHERE scope_id=$1',[scope]);await processOutboxOnce(store,adapter,scope);expect(await store.pendingOperation(scope)).toBeNull();}
 const fields={minAmountAtomic:'5000000',maxAmountAtomic:'20000000',validFrom:'2026-01-01T00:00:00.000Z',validUntil:'2027-01-01T00:00:00.000Z',classification:'expense' as const};let ruleId:string;
 it('requires durable source and explicit confirmation, then keeps pending rule inactive until completed',async()=>{
 const a=await inspect('A');await mutate('/observations/import',{observationId:a.observationId});
 const p=await post('/rules/propose',manualRulePayload(a,fields));expect(p.statusCode).toBe(200);
 const early=await post('/rules/confirm',{ruleProposalId:p.json().data.ruleProposalId,expectedVersion:0,confirmed:true});expect(early.statusCode).toBe(409);await complete();
 const proposal=await post('/rules/propose',manualRulePayload(a,fields));ruleId=proposal.json().data.payload.rule.ruleVersionId;
 const noConfirm=await post('/rules/confirm',{ruleProposalId:proposal.json().data.ruleProposalId,expectedVersion:1,confirmed:false});expect(noConfirm.statusCode).toBe(400);
 await mutate('/rules/confirm',{ruleProposalId:proposal.json().data.ruleProposalId});await inspect('B');const pending=await post('/classify',{observationId:'fixture:tx-B'});expect(pending.json().data.decision.classification).toBe('needs_context');await complete();
 const session=await login();expect(session.projection.rules[ruleId].status).toBe('active');expect(session.events[1].evidenceKind).toBe('synthetic');expect(session.events[1].parentEventIds).toContain(session.events[0].eventId);
 });
 it('classifies new exact input with durable rule, preserves fixed-input hash and rejects stale preview',async()=>{
 await inspect('B');const on=(await post('/classify',{observationId:'fixture:tx-B',memoryMode:'on'})).json().data;const off=(await post('/classify',{observationId:'fixture:tx-B',memoryMode:'off'})).json().data;expect(on.inputHash).toBe(off.inputHash);expect(on.decision.classification).toBe('expense');expect(off.decision.classification).toBe('needs_context');
 const bad=await post('/decisions/record',{observationId:'fixture:tx-B',previewToken:'missing',expectedVersion:2,confirmed:true});expect(bad.statusCode).toBe(409);
 await mutate('/decisions/record',{observationId:'fixture:tx-B',previewToken:on.previewToken});await complete();
 await inspect('C');const outside=(await post('/classify',{observationId:'fixture:tx-C'})).json().data;expect(outside.decision.classification).toBe('needs_context');expect(outside.decision.reasonCodes).toContain('amount_above_maximum');
 const stale=await post('/decisions/record',{observationId:'fixture:tx-C',previewToken:on.previewToken,expectedVersion:3,confirmed:true});expect(stale.statusCode).toBe(409);
 });
 it('explicit correction updates one historical input; revoke changes new inputs only; new session restores same hash',async()=>{
 const before=await login(),target=before.events.find((e:any)=>e.kind==='decision_recorded');
 const p=await post('/corrections/propose',{observationId:'fixture:tx-B',correctsEventId:target.eventId,classification:'reimbursement',category:null,reason:'Synthetic user corrects this transfer only.'});await mutate('/corrections/confirm',{correctionProposalId:p.json().data.correctionProposalId});await complete();
 await inspect('F-preview');const old=(await post('/classify',{observationId:'fixture:tx-F-preview'})).json().data;expect(old.decision.classification).toBe('expense');await mutate('/rules/'+ruleId+'/revoke',{reason:'Synthetic explicit revocation'});await complete();
 const stale=await post('/decisions/record',{observationId:'fixture:tx-F-preview',previewToken:old.previewToken,expectedVersion:5,confirmed:true});expect(stale.statusCode).toBe(409);
 const future=(await post('/classify',{observationId:'fixture:tx-F-preview'})).json().data;expect(future.decision.classification).toBe('needs_context');
 const restored=await login();expect(restored.projection.rules[ruleId].status).toBe('revoked');expect(restored.projection.decisions['fixture:tx-B'].classification).toBe('expense');expect(restored.projection.labels['fixture:tx-B'].classification).toBe('reimbursement');expect(restored.stateHash).toBe(stateHash(replayEvents(await store.events(scope))));
 const check=await post('/memory/restore-check',{manifestVersion:'not-configured'});expect(check.statusCode).toBe(503);expect(await store.version(scope)).toBe(5);
 });
});
