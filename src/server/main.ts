import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {Pool} from 'pg';
import {buildApp} from './app.js';
import {PostgresStore} from './store.js';
import {processOutboxOnce} from './outbox.js';
import {createMemoryAdapter} from '../adapters/memory/index.js';
import {createTatumAdapter,observationFromEvidence,proveSimpleTransfer} from '../adapters/tatum/index.js';
import {ModelAdapter,createStructuredModelProvider} from '../adapters/model/index.js';
import {ApiError} from './errors.js';
import {hashCanonical} from '../domain/index.js';
const port=Number(process.env.PORT??3000),production=process.env.NODE_ENV==='production';
const origin=process.env.APP_BASE_URL??process.env.APP_ORIGIN??`http://localhost:${port}`;
let pool:Pool|undefined,store:PostgresStore|undefined;
if(process.env.DATABASE_URL){pool=new Pool({connectionString:process.env.DATABASE_URL});store=new PostgresStore(pool,{ownerLimit:Number(process.env.OWNER_MEMORY_INVENTORY_LIMIT??40),scopeLimit:Number(process.env.MAINNET_MEMORY_WRITE_LIMIT??20)});
 // Migrations are explicit deployment steps. Never silently migrate or create credentials on startup.
 if(process.env.MEMWAL_OWNER_ADDRESS&&process.env.MEMWAL_NAMESPACE)await store.ensureScope(process.env.OPERATOR_SCOPE??'demo-recallledger',process.env.MEMWAL_OWNER_ADDRESS,process.env.MEMWAL_NAMESPACE);
}
const writesEnabled=process.env.ALLOW_MAINNET_MEMORY_WRITES==='true'&&process.env.MEMWAL_OWNER_HISTORY_CONFIRMED==='true';
const memory=process.env.MEMWAL_PRIVATE_KEY&&process.env.MEMWAL_ACCOUNT_ID&&process.env.MEMWAL_NAMESPACE&&process.env.MEMWAL_OWNER_ADDRESS?createMemoryAdapter({key:process.env.MEMWAL_PRIVATE_KEY,accountId:process.env.MEMWAL_ACCOUNT_ID,namespace:process.env.MEMWAL_NAMESPACE,ownerAddress:process.env.MEMWAL_OWNER_ADDRESS,writesEnabled}):undefined;
const tatum=process.env.TATUM_API_KEY?createTatumAdapter(process.env.TATUM_API_KEY):undefined;
const model=new ModelAdapter(process.env.LLM_BASE_URL&&process.env.LLM_API_KEY&&process.env.LLM_MODEL?createStructuredModelProvider({endpoint:process.env.LLM_BASE_URL,apiKey:process.env.LLM_API_KEY,model:process.env.LLM_MODEL}):undefined);
const app=buildApp({origin,secureCookies:production,store,operatorScope:process.env.OPERATOR_SCOPE??'demo-recallledger',operatorToken:store?(process.env.OPERATOR_BOOTSTRAP_SECRET??process.env.OPERATOR_TOKEN):undefined,writesEnabled:!!memory&&writesEnabled,
 inspect:tatum?async(digest,wallet)=>{const envelope=await tatum.getTransaction(digest);const coin=process.env.OBSERVATION_COIN_TYPE;if(!coin)throw new ApiError('ASSET_CONFIGURATION_REQUIRED',503);const proof=proveSimpleTransfer(envelope,wallet,coin);return observationFromEvidence(envelope.evidence,wallet,coin,{observationId:hashCanonical({digest,wallet,coin}),decimals:null,simpleTransferProof:proof});}:undefined,
 propose:async(observation,text)=>{const result=await model.propose(observation,text);if(result.mode!=='model')throw new ApiError('MODEL_UNAVAILABLE',503);return {...result.proposal,scope:'single_transaction',requiresConfirmation:true};},
 restoreCheck:memory&&pool?async(version)=>{const r=await pool!.query('SELECT manifest_json FROM frozen_manifests WHERE manifest_version=$1',[version]);if(!r.rowCount)throw new ApiError('MANIFEST_NOT_FOUND',404);return memory.restore(r.rows[0].manifest_json);}:undefined
});
let active:Promise<unknown>|undefined;
const timer=store&&memory&&writesEnabled?setInterval(()=>{if(active)return;active=processOutboxOnce(store!,{status:(id,expected)=>memory.status(id,expected),submit:async input=>{if(!writesEnabled)throw Error('MEMORY_WRITES_DISABLED');const inventory=await memory.listAll();if(inventory.length>=Number(process.env.OWNER_MEMORY_INVENTORY_LIMIT??40))throw Error('OWNER_WRITE_BUDGET_EXCEEDED');return memory.submit(input);}}).catch(()=>{console.error('Outbox poll failed; inspect durable operation state');}).finally(()=>{active=undefined;});},2000):undefined;
app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await active;});
const root=resolve('dist/web');const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
app.get('/*',async(req,reply)=>{if(req.url.startsWith('/api/'))return reply.code(404).send({error:{code:'NOT_FOUND'}});let path:string;try{path=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]!));}catch{return reply.code(400).send('Bad path');}if(path!==root&&!path.startsWith(root+sep))return reply.code(403).send('Forbidden');try{if(!(await stat(path)).isFile())path=resolve(root,'index.html');}catch{path=resolve(root,'index.html');}try{reply.header('Content-Type',types[extname(path)]??'application/octet-stream').header('X-Content-Type-Options','nosniff');return await readFile(path);}catch{return reply.code(503).send({error:{code:'WEB_BUILD_REQUIRED',message:'Run pnpm build:web or use Vite on port 5173.'}});}});
app.addHook('onClose',async()=>{await pool?.end();});
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close();});
await app.listen({host:process.env.HOST??'127.0.0.1',port});
console.log(`RecallLedger listening on ${port}; public synthetic sandbox; remote writes ${writesEnabled&&memory?'explicitly enabled':'disabled'}`);
