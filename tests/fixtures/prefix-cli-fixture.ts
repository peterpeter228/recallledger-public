/** Synthetic test ports only. No provider calls, signing, or live evidence. */
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {Pool} from 'pg';
import type {MemoryEvent,OutboxOperation} from '../../contracts/domain-contracts';
import {canonicalize,eventIntegrity,eventText,replayEvents,stateHash,type LedgerState} from '../../src/domain';
import {compileDemoEvents,DEMO_SCOPE} from '../../src/domain/demo';

export const WP3_TEST_ROOT=join(tmpdir(),'recallledger-prefix-tests');
export const SYNTHETIC_OWNER='fixture:synthetic-owner';
export const SYNTHETIC_NAMESPACE='fixture:synthetic-namespace';
const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
const tsxLoader=join(repositoryRoot,'node_modules/tsx/dist/loader.mjs');
const fixtureLoader=join(repositoryRoot,'tests/fixtures/prefix-memory-loader.mjs');
type Purpose='teaching'|'real-loop';
type Script='seed'|'freeze'|'verify-count'|'restore';
export type SyntheticJobState='pending'|'running'|'uploaded'|'done'|'failed'|'not_found';
export interface SyntheticMemory {
 memoryId:string;blobId:string;jobId:string;namespace:string;owner:string;text:string;hiddenFromRecall?:boolean;
}
export interface SyntheticJob {
 state:SyntheticJobState;memoryId:string;blobId:string;namespace:string;owner:string;
}
export interface SyntheticMemoryData {
 snapshotVersion:number;pageSize:number;memories:SyntheticMemory[];jobs:Record<string,SyntheticJob>;
 inconsistentSnapshot?:boolean;mustResync?:boolean;truncatedRecall?:boolean;
}
export interface FixtureObservation {kind:string;[key:string]:unknown}
export interface CliResult {status:number;stdout:string;stderr:string}
export interface PrefixFixtureOptions {
 count:number;databaseUrl?:string;transformEvents?:(events:MemoryEvent[])=>MemoryEvent[];
}
export interface SuffixOptions {
 state:Exclude<OutboxOperation['state'],'done'>;jobState:SyntheticJobState;remote?:boolean;saveJob?:boolean;hiddenFromRecall?:boolean;
}
export interface SyntheticIdentity {operationId:string;jobId:string;blobId:string;memoryId:string}
export interface PrefixLocator {
 manifestVersion:string;scopeId:string;namespace:string;ownerAddress:string;
 entries:Array<{eventId:string;sequence:number;eventHash:string;textSha256:string;blobId:string;memoryId:string;jobId:string}>;
 expectedStateHash:string;
}
export interface PrefixExpectation {events:MemoryEvent[];state:LedgerState;stateHash:string;manifest:PrefixLocator}
export interface FixturePaths {reconciliation:string;frozen:string;count:string;events:string;restore:string;remote:string;audit:string}
export interface EvidenceBytes {path:string;bytes:Buffer|null}
export interface PrefixFixture {
 cwd:string;schema:string;pool:Pool;connection:string;paths:FixturePaths;prefix:PrefixExpectation;
 run(script:Script,args?:string[],config?:{database?:boolean;configured?:boolean}):CliResult;
 updateRemote(update:(data:SyntheticMemoryData)=>void):Promise<void>;
 addSuffix(options:SuffixOptions):Promise<SyntheticIdentity&{event:MemoryEvent}>;
 seedExistingEvidence():Promise<void>;
 evidenceBytes():Promise<EvidenceBytes[]>;
 observations():Promise<FixtureObservation[]>;
 writeInput(name:string,value:unknown):Promise<string>;
 dispose():Promise<void>;
}

function identity(event:MemoryEvent):SyntheticIdentity{
 return {operationId:`fixture:synthetic-operation-${event.eventId}`,jobId:`fixture:synthetic-job-${event.eventId}`,blobId:`fixture:synthetic-blob-${event.eventId}`,memoryId:`fixture:synthetic-memory-${event.eventId}`};
}
export function prefixExpectation(count:number,purpose:Purpose='teaching'):PrefixExpectation{
 if(!Number.isInteger(count)||count<0||count>12)throw Error('TEST_PREFIX_COUNT_INVALID');
 const events=compileDemoEvents().slice(0,count),state=replayEvents(events);
 const manifest:PrefixLocator={manifestVersion:`recallledger-${purpose}-v1-${encodeURIComponent(DEMO_SCOPE)}-n${count}`,scopeId:DEMO_SCOPE,namespace:SYNTHETIC_NAMESPACE,ownerAddress:SYNTHETIC_OWNER,entries:events.map(event=>{const {operationId,...locators}=identity(event),{eventHash,textSha256}=eventIntegrity(event);return {eventId:event.eventId,sequence:event.sequence,eventHash,textSha256,...locators};}),expectedStateHash:stateHash(state)};
 return {events,state,stateHash:stateHash(state),manifest};
}
function databaseConnection(value:string|undefined){
 if(!value)throw Error('TEST_DATABASE_URL_REQUIRED');
 const url=new URL(value);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55432'||url.pathname!=='/postgres')throw Error('WP3_TEST_DATABASE_MUST_BE_LOCAL_PORT_55432');
 url.searchParams.delete('options');
 return url;
}
async function bytes(path:string){
 try{return await readFile(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}

/** Creates one throwaway PG schema and one directory strictly inside WP3_TEST_ROOT. */
export async function createPrefixFixture(options:PrefixFixtureOptions):Promise<PrefixFixture>{
 const baseUrl=databaseConnection(options.databaseUrl??process.env.TEST_DATABASE_URL);
 const prefix=prefixExpectation(options.count);
 const events=options.transformEvents?.(structuredClone(prefix.events))??structuredClone(prefix.events);
 const schema='wp3_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:baseUrl.toString()});
 let pool:Pool|undefined,cwd:string|undefined,createdSchema=false,disposed=false;
 async function dispose(){
  if(disposed)return;disposed=true;
  try{await pool?.end();if(createdSchema)await admin.query(`DROP SCHEMA ${schema} CASCADE`);}finally{await admin.end();if(cwd)await rm(cwd,{recursive:true,force:true});}
 }
 try{
  await mkdir(WP3_TEST_ROOT,{recursive:true});
  cwd=await mkdtemp(join(WP3_TEST_ROOT,'prefix-cli-'));
  const directory=cwd;
  await admin.query(`CREATE SCHEMA ${schema}`);createdSchema=true;
  const scopedUrl=new URL(baseUrl);scopedUrl.searchParams.set('options',`-c search_path=${schema}`);
  const connection=scopedUrl.toString();
  pool=new Pool({connectionString:connection});const database=pool;
  await database.query(await readFile(join(repositoryRoot,'migrations/001_initial.sql'),'utf8'));
  await database.query('INSERT INTO scopes(id,memory_account_id,namespace) VALUES($1,$2,$3)',[DEMO_SCOPE,SYNTHETIC_OWNER,SYNTHETIC_NAMESPACE]);
  const evidence=join(directory,'evidence');
  const paths={reconciliation:join(evidence,'write-reconciliation.json'),frozen:join(evidence,'frozen-manifest.json'),count:join(evidence,'mainnet-manifest.json'),events:join(evidence,'events-public.json'),restore:join(evidence,'restore-report.json'),remote:join(directory,'synthetic-remote.json'),audit:join(directory,'synthetic-observations.jsonl')};
  const outputs=[paths.reconciliation,paths.frozen,paths.count,paths.events,paths.restore];
  const remote:SyntheticMemoryData={snapshotVersion:7,pageSize:4,memories:[],jobs:{}};
  function addRemote(event:MemoryEvent,jobState:SyntheticJobState,includeMemory:boolean,hiddenFromRecall=false){
   const ids=identity(event);
   remote.jobs[ids.jobId]={state:jobState,memoryId:ids.memoryId,blobId:ids.blobId,namespace:SYNTHETIC_NAMESPACE,owner:SYNTHETIC_OWNER};
   if(includeMemory)remote.memories.push({...ids,namespace:SYNTHETIC_NAMESPACE,owner:SYNTHETIC_OWNER,text:eventText(event),hiddenFromRecall});
  }
  async function insert(event:MemoryEvent,done:boolean,state:OutboxOperation['state'],jobId:string|null){
   const ids=identity(event),integrity=eventIntegrity(event),operationKey=`seed:${DEMO_SCOPE}:${event.eventId}`;
   await database.query('INSERT INTO events(event_id,scope_id,sequence,canonical_json,event_hash,text_sha256,durable_status) VALUES($1,$2,$3,$4,$5,$6,$7)',[event.eventId,event.scopeId,event.sequence,canonicalize(event),integrity.eventHash,integrity.textSha256,done?'done':'pending']);
   await database.query('INSERT INTO memory_outbox(operation_id,event_id,scope_id,operation_key,payload_hash,namespace,memory_text,job_id,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[ids.operationId,event.eventId,event.scopeId,operationKey,integrity.textSha256,SYNTHETIC_NAMESPACE,eventText(event),jobId,state]);
   await database.query('INSERT INTO request_idempotency(scope_id,operation_key,request_hash,response_json,status) VALUES($1,$2,$3,$4,202)',[event.scopeId,operationKey,integrity.eventHash,{operationId:ids.operationId,eventIds:[event.eventId],durableVersion:event.sequence-1,pendingSequence:event.sequence,state:'prepared'}]);
   if(done)await database.query('INSERT INTO memory_receipts(event_id,receipt_json) VALUES($1,$2)',[event.eventId,{memoryId:ids.memoryId,blobId:ids.blobId,jobId:ids.jobId,ownerAddress:SYNTHETIC_OWNER,namespace:SYNTHETIC_NAMESPACE,status:'done',textSha256:integrity.textSha256,verifiedAt:'2026-10-26T12:00:00.000Z',blobObjectId:null,endEpoch:null,expiresAt:null}]);
  }
  // Physical insertion and recall order deliberately differ from the event-chain order.
  for(const event of [...events].reverse()){await insert(event,true,'done',identity(event).jobId);addRemote(event,'done',true);}
  await database.query('UPDATE scopes SET last_allocated_sequence=$2,last_durable_sequence=$2 WHERE id=$1',[DEMO_SCOPE,options.count]);
  await writeFile(paths.remote,JSON.stringify(remote,null,2)+'\n');
  let allocatedCount=options.count;
  function run(script:Script,args:string[]=[],config:{database?:boolean;configured?:boolean}={}):CliResult{
   const environment:NodeJS.ProcessEnv={PATH:process.env.PATH??'/usr/bin:/bin',HOME:directory,TMPDIR:directory,LANG:'C.UTF-8',TZ:'UTC',RECALLLEDGER_TEST_MEMORY_FIXTURE:paths.remote,RECALLLEDGER_TEST_MEMORY_AUDIT:paths.audit};
   const needsDatabase=config.database??(script==='seed'||script==='freeze'||args.includes('--reconcile'));
   if(needsDatabase)environment.DATABASE_URL=connection;
   if(config.configured!==false)Object.assign(environment,{MEMWAL_PRIVATE_KEY:'fixture:synthetic-not-a-signing-key',MEMWAL_ACCOUNT_ID:'fixture:synthetic-account',MEMWAL_NAMESPACE:SYNTHETIC_NAMESPACE,MEMWAL_OWNER_ADDRESS:SYNTHETIC_OWNER,OPERATOR_SCOPE:DEMO_SCOPE});
   const result=spawnSync(process.execPath,['--import',tsxLoader,'--import',fixtureLoader,join(repositoryRoot,'scripts',script+'.ts'),...args],{cwd:directory,encoding:'utf8',env:environment,timeout:30000,maxBuffer:4*1024*1024});
   if(result.error)throw result.error;
   if(result.status===null)throw Error(`TEST_CLI_TERMINATED_BY_SIGNAL:${result.signal}`);
   return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }
  async function updateRemote(update:(data:SyntheticMemoryData)=>void){
   const data=JSON.parse(await readFile(paths.remote,'utf8')) as SyntheticMemoryData;
   update(data);await writeFile(paths.remote,JSON.stringify(data,null,2)+'\n');
  }
  async function addSuffix(suffix:SuffixOptions){
   const event=compileDemoEvents()[allocatedCount];if(!event)throw Error('TEST_SUFFIX_UNAVAILABLE');
   const ids=identity(event);
   await insert(event,false,suffix.state,suffix.saveJob===false?null:ids.jobId);
   await database.query('UPDATE scopes SET last_allocated_sequence=$2 WHERE id=$1',[DEMO_SCOPE,event.sequence]);
   await updateRemote(data=>{
    data.jobs[ids.jobId]={state:suffix.jobState,memoryId:ids.memoryId,blobId:ids.blobId,namespace:SYNTHETIC_NAMESPACE,owner:SYNTHETIC_OWNER};
    if(suffix.remote){data.memories.push({...ids,namespace:SYNTHETIC_NAMESPACE,owner:SYNTHETIC_OWNER,text:eventText(event),hiddenFromRecall:suffix.hiddenFromRecall});data.snapshotVersion++;}
   });
   allocatedCount++;return {event,...ids};
  }
  async function seedExistingEvidence(){
   await mkdir(evidence,{recursive:true});
   for(const path of [paths.frozen,paths.count,paths.events,paths.restore])await writeFile(path,`Existing test evidence must survive failure: ${path.slice(evidence.length+1)}\n`);
  }
  async function evidenceBytes(){return Promise.all(outputs.map(async path=>({path,bytes:await bytes(path)})));}
  async function observations():Promise<FixtureObservation[]>{
   const text=await bytes(paths.audit);return text?text.toString('utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line) as FixtureObservation):[];
  }
  async function writeInput(name:string,value:unknown){
   const path=resolve(directory,name);
   if(!path.startsWith(directory+sep))throw Error('TEST_INPUT_MUST_STAY_IN_FIXTURE_DIRECTORY');
   await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');return path;
  }
  return {cwd:directory,schema,pool:database,connection,paths,prefix,run,updateRemote,addSuffix,seedExistingEvidence,evidenceBytes,observations,writeInput,dispose};
 }catch(error){await dispose();throw error;}
}
export async function withPrefixFixture<T>(options:PrefixFixtureOptions,use:(fixture:PrefixFixture)=>Promise<T>):Promise<T>{
 const fixture=await createPrefixFixture(options);try{return await use(fixture);}finally{await fixture.dispose();}
}
