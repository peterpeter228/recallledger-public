/** SYNTHETIC TEST ONLY. Loopback harness, fake providers, no external network writes. */
import {createRequire} from 'node:module';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {buildApp} from '../../src/server/app.ts';
import {PostgresStore} from '../../src/server/store.ts';
import {processOutboxOnce} from '../../src/server/outbox.ts';
import {demoObservation} from '../../src/domain/demo.ts';
const root=process.cwd();
const require=createRequire(root+'/package.json');const {Pool}=require('pg');
for(const name of ['MEMWAL_PRIVATE_KEY','TATUM_API_KEY','LLM_API_KEY','DATABASE_URL'])if(process.env[name])throw Error('Refuse real-provider configuration in synthetic harness: '+name);
if(!process.env.UI_TEST_DATABASE_URL?.startsWith('postgres://agent@127.0.0.1:55434/'))throw Error('Only isolated loopback test DB permitted');
if(!process.env.UI_TEST_DATABASE_URL)throw Error('Synthetic UI test database required');
const pool=new Pool({connectionString:process.env.UI_TEST_DATABASE_URL});await pool.query(await readFile(root+'/migrations/001_initial.sql','utf8'));
const scope='synthetic-ui-browser-20261030',owner='SYNTHETIC-QA-NOT-MAINNET',namespace='synthetic-ui';
const store=new PostgresStore(pool);await store.ensureScope(scope,owner,namespace);
let fault='none';const requests:any[]=[];
const app=buildApp({origin:'http://127.0.0.1:3100',secureCookies:false,store,operatorScope:scope,operatorToken:'synthetic-fixture-only',writesEnabled:true,inspect:async(digest)=>demoObservation(digest)});
app.addHook('onRequest',async(r,reply)=>{if(r.method==='POST'&&['/api/observations/import','/api/labels/confirm','/api/corrections/confirm'].includes(r.url)){requests.push({at:new Date().toISOString(),path:r.url,key:r.headers['idempotency-key'],fault});if(fault==='conflict'||fault==='rate'){const f=fault;fault='none';return reply.code(f==='rate'?429:409).send({error:{code:f==='rate'?'RATE_LIMITED':'VERSION_CONFLICT',message:'SYNTHETIC fault injection',retryable:true}});}}});
app.addHook('onSend',async(r,reply,payload)=>{if(r.url==='/api/health'&&typeof payload==='string'){const body=JSON.parse(payload);body.data.remoteWrites='synthetic-fixture-only';body.data.mainnetMemories=0;return JSON.stringify(body);}if(r.method==='POST'&&r.url==='/api/observations/import'&&reply.statusCode===202&&fault==='drop'){fault='none';reply.raw.destroy();return payload;}return payload;});
app.addHook('onRequest',async(r,reply)=>{if(r.url.startsWith('/__synthetic/')&&r.method==='POST'&&r.headers.origin!=='http://127.0.0.1:3100')return reply.code(403).send({synthetic:true,error:'ORIGIN_REJECTED'});});
app.post('/__synthetic/fault',async r=>{fault=(r.body as any).mode;return {synthetic:true,fault}});
app.get('/__synthetic/status',async()=>({synthetic:true,requests,version:await store.version(scope),pending:await store.pendingOperation(scope),events:(await store.events(scope)).length}));
app.post('/__synthetic/complete',async()=>{
 const pending=await store.pendingOperation(scope);if(!pending)return{synthetic:true,pending:null};
 const adapter={submit:async()=>({jobId:'synthetic-job-'+pending.operationId}),status:async(jobId:string,expected:any)=>({state:'done',receipt:{memoryId:'synthetic-memory-'+pending.operationId,jobId,blobId:'synthetic-blob-not-chain',ownerAddress:owner,namespace,status:'done' as const,textSha256:expected.textSha256,verifiedAt:new Date().toISOString(),blobObjectId:null,endEpoch:null,expiresAt:null}})};
 for(let i=0;i<2;i++){await pool.query('UPDATE memory_outbox SET next_attempt_at=NULL WHERE scope_id=$1',[scope]);await processOutboxOnce(store,adapter,scope);}
 return{synthetic:true,mainnetMemories:0,version:await store.version(scope),pending:await store.pendingOperation(scope)};
});
app.get('/*',async(req,reply)=>{let path=resolve(root+'/dist/web','.'+req.url.split('?')[0]);if(!path.startsWith(root+'/dist/web'+sep))path=root+'/dist/web/index.html';try{if(!(await stat(path)).isFile())path=root+'/dist/web/index.html'}catch{path=root+'/dist/web/index.html'}let body=await readFile(path);if(extname(path)==='.html')body=Buffer.from(body.toString().replace('<body>','<body><aside style="background:#5a1237;color:white;padding:10px;font:bold 16px sans-serif">SYNTHETIC QA HARNESS · local PostgreSQL / fake providers / mainnet memories 0<br>Fixture token: synthetic-fixture-only · digest: A, B, C or F-preview · wallet: synthetic-wallet<br><button id="fixture-complete">Complete pending SYNTHETIC job</button> <button id="fixture-status">Read SYNTHETIC status</button><pre id="fixture-output"></pre></aside><script>document.getElementById("fixture-complete").onclick=async()=>{const r=await fetch("/__synthetic/complete",{method:"POST"});document.getElementById("fixture-output").textContent=JSON.stringify(await r.json());};document.getElementById("fixture-status").onclick=async()=>{const r=await fetch("/__synthetic/status");document.getElementById("fixture-output").textContent=JSON.stringify(await r.json());};</script>'));reply.type(({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'} as any)[extname(path)]??'application/octet-stream');return body});
app.addHook('onClose',async()=>{await pool.end()});
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close()});
await app.listen({host:'127.0.0.1',port:3100});console.log('SYNTHETIC UI QA http://127.0.0.1:3100');
