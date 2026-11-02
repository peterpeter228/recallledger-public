/** Synthetic provider only; all integrity, status, inventory and restore behavior is real. */
import {appendFileSync,readFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {MemoryAdapter,type MemoryClient,type RestoreManifest} from '../../src/adapters/memory/index.ts';
import {stateHash} from '../../src/domain';
import type {FixtureObservation,SyntheticMemoryData} from './prefix-cli-fixture';
export * from '../../src/adapters/memory/index.ts';

const testRoot=join(tmpdir(),'recallledger-prefix-tests');
function testPath(name:string){
 const path=process.env[name];
 if(!path||!resolve(path).startsWith(testRoot+sep))throw Error('SYNTHETIC_MEMORY_PATH_NOT_ISOLATED');
 return path;
}
const fixturePath=testPath('RECALLLEDGER_TEST_MEMORY_FIXTURE');
const auditPath=testPath('RECALLLEDGER_TEST_MEMORY_AUDIT');
function data(){return JSON.parse(readFileSync(fixturePath,'utf8')) as SyntheticMemoryData;}
function observe(observation:FixtureObservation){appendFileSync(auditPath,JSON.stringify(observation)+'\n');}

class ObservedMemoryAdapter extends MemoryAdapter {
 override async restore(manifest:RestoreManifest){
  const result=await super.restore(manifest);
  // This is output observation, not an input projection or an expected-state answer file.
  observe({kind:'restored',eventIds:result.events.map(event=>event.eventId),stateHash:stateHash(result.state),state:result.state});
  return result;
 }
}
export function createMemoryAdapter(config:{key:string;accountId:string;namespace:string;ownerAddress:string;writesEnabled?:boolean}){
 observe({kind:'factory',databaseConfigured:!!process.env.DATABASE_URL,testDatabaseConfigured:!!process.env.TEST_DATABASE_URL,writesEnabled:config.writesEnabled===true});
 const client={
  async remember(){observe({kind:'remember'});throw Error('SYNTHETIC_REMOTE_WRITES_FORBIDDEN');},
  async getRememberStatus(jobId:string){
   const job=data().jobs[jobId];observe({kind:'status',jobId,state:job?.state??'not_found'});
   return {job_id:jobId,status:job?.state??'not_found',...(job?.state==='done'?{blob_id:job.blobId}:{})};
  },
  async waitForRememberJob(jobId:string){
   const job=data().jobs[jobId];observe({kind:'receipt',jobId});
   if(!job||job.state!=='done')throw Error('SYNTHETIC_JOB_NOT_DONE');
   return {job_id:jobId,id:job.memoryId,blob_id:job.blobId,owner:job.owner,namespace:job.namespace};
  },
  async listMemories(input:{namespace?:string;cursor?:string;limit?:number}={}){
   const remote=data();
   const rows=remote.memories.filter(memory=>!input.namespace||memory.namespace===input.namespace);
   const offset=input.cursor?Number(input.cursor):0;
   if(!Number.isSafeInteger(offset)||offset<0)throw Error('SYNTHETIC_CURSOR_INVALID');
   const size=Math.min(input.limit??100,remote.pageSize),end=offset+size,hasMore=end<rows.length;
   const snapshot=remote.snapshotVersion+(remote.inconsistentSnapshot&&offset>0?1:0);
   observe({kind:'inventory',namespace:input.namespace??null,cursor:input.cursor??null,snapshotVersion:snapshot});
   return {memories:rows.slice(offset,end).map(memory=>({memory_id:memory.memoryId,namespace_id:memory.namespace,blob_id:memory.blobId,created_at:'2026-10-26T12:00:00.000Z'})),snapshot_version:snapshot,must_resync:remote.mustResync??false,deleted:[],has_more:hasMore,next_cursor:hasMore?String(end):null};
  },
  async recall(input:{namespace?:string}){
   const remote=data();observe({kind:'recall',namespace:input.namespace??null});
   return {results:remote.memories.filter(memory=>(!input.namespace||memory.namespace===input.namespace)&&!memory.hiddenFromRecall).map((memory,index)=>({text:memory.text,blob_id:memory.blobId,memory_id:memory.memoryId,distance:100-index})),meta:{truncated:remote.truncatedRecall??false},dropped_count:0};
  }
 } as unknown as MemoryClient;
 return new ObservedMemoryAdapter(client,config.ownerAddress,config.namespace,config.writesEnabled===true);
}
