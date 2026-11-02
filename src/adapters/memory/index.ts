import { MemWal, type MemorySummary } from '@mysten-incubation/memwal';
import type { MemoryReceipt, MemoryEvent } from '../../../contracts/domain-contracts';
import { sha256Text, validateEvent, replayEvents, stateHash, eventText, eventIntegrity, hashCanonical } from '../../domain/index';
export interface MemorySubmit { text:string; namespace:string; operationKey:string }
export interface ExpectedMemory { textSha256:string; namespace:string }
export interface MemoryStatus {state:'pending'|'running'|'uploaded'|'done'|'failed';receipt?:MemoryReceipt}
export interface MemoryInventory {snapshotVersion:number;memories:MemorySummary[]}
export interface MemoryPort {
 submit(input:MemorySubmit):Promise<{jobId:string}>;
 status(jobId:string,expected?:ExpectedMemory):Promise<MemoryStatus>;
}
export type MemoryClient=Pick<MemWal,'remember'|'getRememberStatus'|'waitForRememberJob'|'listMemories'|'recall'>;
export class MemoryAdapter implements MemoryPort {
 constructor(private client:MemoryClient,private owner:string,private namespace:string,private writesEnabled=false){}
 async submit(input:MemorySubmit){
  if(!this.writesEnabled)throw Error('MEMORY_WRITES_DISABLED');
  if(input.namespace!==this.namespace||!input.operationKey||!input.text)throw Error('INVALID_MEMORY_REQUEST');
  const result=await this.client.remember(input.text,input.namespace,{idempotencyKey:input.operationKey});
  if(!result.job_id)throw Error('UNKNOWN_SUBMISSION_OUTCOME');
  return {jobId:result.job_id};
 }
 async status(jobId:string,expected?:ExpectedMemory):Promise<MemoryStatus>{
  const status=await this.client.getRememberStatus(jobId);
  if(status.job_id!==jobId)throw Error('JOB_ID_MISMATCH');
  if(status.status==='not_found')throw Error('JOB_NOT_FOUND_OUTCOME_UNKNOWN');
  if(status.owner!==undefined&&status.owner!==this.owner||status.namespace!==undefined&&status.namespace!==this.namespace)throw Error('MEMORY_RECEIPT_MISMATCH');
  if(!['pending','running','uploaded','done','failed'].includes(status.status))throw Error('INVALID_MEMORY_JOB_STATUS');
  if(status.status!=='done')return {state:status.status};
  if(!expected||expected.namespace!==this.namespace)throw Error('EXPECTED_MEMORY_REQUIRED');
  const result=await this.client.waitForRememberJob(jobId,{timeoutMs:5000});
  if((result.job_id&&result.job_id!==jobId)||result.owner!==this.owner||result.namespace!==this.namespace||!result.blob_id||!result.id||(status.blob_id!==undefined&&status.blob_id!==result.blob_id))throw Error('MEMORY_RECEIPT_MISMATCH');
  const hits=await this.client.recall({query:'RecallLedger event v1',namespace:this.namespace,limit:100});
  if(!Array.isArray(hits.results)||hits.meta?.truncated||hits.dropped_count)throw Error('MEMORY_READBACK_UNVERIFIED');
  const matching=hits.results.filter(h=>h.blob_id===result.blob_id);
  if(!matching.length||matching.some(h=>typeof h.text!=='string'||sha256Text(h.text)!==expected.textSha256))throw Error('MEMORY_READBACK_UNVERIFIED');
  return {state:'done',receipt:{memoryId:result.id,jobId,blobId:result.blob_id,ownerAddress:result.owner,namespace:result.namespace,status:'done',textSha256:expected.textSha256,verifiedAt:new Date().toISOString(),blobObjectId:null,endEpoch:null,expiresAt:null}};
 }
 async listAll(namespace?:string){return (await this.inventory(namespace)).memories;}
 async inventory(namespace?:string):Promise<MemoryInventory>{
  let cursor:string|undefined;let snapshot:number|undefined;const seen=new Set<string>(),memoryIds=new Set<string>();
  const rows:MemorySummary[]=[];
  for(let pageNumber=0;pageNumber<21;pageNumber++){
   const page=await this.client.listMemories({...(namespace?{namespace}:{}),...(cursor?{cursor}:{}),limit:100});
   if(!Number.isSafeInteger(page.snapshot_version)||page.snapshot_version<0||!Array.isArray(page.memories)||typeof page.has_more!=='boolean'||typeof page.must_resync!=='boolean')throw Error('INVALID_MEMORY_INVENTORY');
   if(page.must_resync||(snapshot!==undefined&&snapshot!==page.snapshot_version))throw Error('MEMORY_SNAPSHOT_CHANGED');
   for(const row of page.memories){
    if(!row||typeof row.memory_id!=='string'||!row.memory_id||typeof row.namespace_id!=='string'||!row.namespace_id||typeof row.blob_id!=='string'||!row.blob_id||memoryIds.has(row.memory_id))throw Error('INVALID_MEMORY_INVENTORY');
    memoryIds.add(row.memory_id);
   }
   snapshot=page.snapshot_version;rows.push(...page.memories);
   if(rows.length>40)throw Error('OWNER_INVENTORY_LIMIT');
   if(!page.has_more)return {snapshotVersion:snapshot,memories:rows};
   if(typeof page.next_cursor!=='string'||!page.next_cursor||seen.has(page.next_cursor))throw Error('NON_ADVANCING_MEMORY_CURSOR');
   cursor=page.next_cursor;seen.add(cursor);
  }
  throw Error('MEMORY_PAGE_LIMIT');
 }
 async restore(manifest:RestoreManifest){
  if(manifest.namespace!==this.namespace||manifest.ownerAddress!==this.owner)throw Error('RESTORE_SCOPE_MISMATCH');
  const inventory=await this.inventory();const rows=inventory.memories.filter(r=>r.namespace_id===this.namespace);
  const expected=new Map(manifest.entries.map(e=>[e.blobId,e]));
  if(expected.size!==manifest.entries.length||new Set(manifest.entries.map(e=>e.eventId)).size!==manifest.entries.length)throw Error('DUPLICATE_MANIFEST_ENTRY');
  for(const field of ['memoryId','jobId'] as const){const ids=manifest.entries.flatMap(entry=>entry[field]===undefined?[]:[entry[field]!]);if(new Set(ids).size!==ids.length)throw Error('DUPLICATE_MANIFEST_ENTRY');}
  if(rows.length!==expected.size||new Set(rows.map(r=>r.blob_id)).size!==rows.length||rows.some(r=>!expected.has(r.blob_id)))throw Error('RESTORE_METADATA_SET_MISMATCH');
  const hits=await this.client.recall({query:'RecallLedger event v1',namespace:this.namespace,limit:100});
  if(hits.meta?.truncated||hits.dropped_count)throw Error('RESTORE_INCOMPLETE');
  const texts=new Map<string,string>();
  for(const hit of hits.results){
   if(!expected.has(hit.blob_id))throw Error('RESTORE_UNEXPECTED_BLOB');
   if(texts.has(hit.blob_id)&&texts.get(hit.blob_id)!==hit.text)throw Error('RESTORE_CONFLICTING_BLOB');
   texts.set(hit.blob_id,hit.text);
  }
  const events:MemoryEvent[]=[];
  for(const entry of manifest.entries){
   const text=texts.get(entry.blobId);
   if(!text||sha256Text(text)!==entry.textSha256||!text.startsWith('RecallLedger event v1\n'))throw Error('RESTORE_MISSING_OR_CORRUPT_PAYLOAD');
   const event=validateEvent(JSON.parse(text.slice('RecallLedger event v1\n'.length)));
   if(event.eventId!==entry.eventId||event.sequence!==events.length+1||(manifest.scopeId!==undefined&&event.scopeId!==manifest.scopeId)||(entry.eventHash!==undefined&&eventIntegrity(event).eventHash!==entry.eventHash)||(entry.sequence!==undefined&&event.sequence!==entry.sequence)||eventText(event)!==text)throw Error('RESTORE_EVENT_MISMATCH');
   events.push(event);
  }
  const state=replayEvents(events);if(stateHash(state)!==manifest.expectedStateHash)throw Error('RESTORE_STATE_HASH_MISMATCH');
  const after=await this.inventory();
  const fingerprint=(value:MemoryInventory)=>hashCanonical(value.memories.filter(row=>row.namespace_id===this.namespace).sort((left,right)=>left.blob_id.localeCompare(right.blob_id)||left.memory_id.localeCompare(right.memory_id)));
  if(after.snapshotVersion!==inventory.snapshotVersion||fingerprint(after)!==fingerprint(inventory))throw Error('MEMORY_SNAPSHOT_CHANGED');
  return {events,state,status:'verified' as const,source:'walrus_relayer' as const,observedMemoryIds:rows.map(r=>r.memory_id)};
 }
}
export interface RestoreManifest { scopeId?:string;namespace:string;ownerAddress:string;entries:Array<{eventId:string;blobId:string;textSha256:string;eventHash?:string;sequence?:number;memoryId?:string;jobId?:string}>;expectedStateHash:string }
/** Call only with server-injected credentials; this module never discovers secrets. */
export function createMemoryAdapter(config:{key:string;accountId:string;namespace:string;ownerAddress:string;writesEnabled?:boolean}){
 if([config.key,config.accountId,config.namespace,config.ownerAddress].some(value=>typeof value!=='string'||!value.trim()))throw Error('REQUIRED_MEMORY_CONFIGURATION');
 const client=MemWal.create({key:config.key,accountId:config.accountId,namespace:config.namespace,serverUrl:'https://relayer.memory.walrus.xyz',requestTimeoutMs:30000,recallTimeoutMs:15000,preflightTimeoutMs:5000});
 return new MemoryAdapter(client,config.ownerAddress,config.namespace,config.writesEnabled===true);
}
