import type { MemoryReceipt } from '../../contracts/domain-contracts.js';
import type { LedgerStore } from './store.js';
export interface MemoryPort {
 submit(input:{text:string;namespace:string;operationKey:string}):Promise<{jobId:string}>;
 status(jobId:string,expected:{textSha256:string;namespace:string}):Promise<{state:string;receipt?:MemoryReceipt}>;
}
/** One bounded poll. A supervisor calls again; no request causes a remote write directly. */
export async function processOutboxOnce(store:LedgerStore,memory:MemoryPort,scope?:string):Promise<boolean>{
 if(store.kind!=='postgres')throw new Error('DURABLE_STORE_REQUIRED');const op=await store.claim(scope);if(!op)return false;
 try {
 if(!op.jobId){const accepted=await memory.submit({text:op.memoryText,namespace:op.namespace,operationKey:op.operationId});if(!accepted.jobId)throw new Error('MISSING_JOB_ID');await store.update(op,'accepted',accepted.jobId);return true;}
 const result=await memory.status(op.jobId,{textSha256:op.payloadHash,namespace:op.namespace});
 if(result.state==='done'){if(!result.receipt)throw new Error('MISSING_VERIFIED_RECEIPT');await store.complete(op,result.receipt);}
 else await store.update(op,['pending','running','uploaded','failed','blocked'].includes(result.state)?result.state:'unknown',undefined,result.state==='failed'?'REMOTE_JOB_FAILED':undefined);
 }catch(e){await store.update(op,'unknown',undefined,op.jobId?'JOB_STATUS_UNCERTAIN':'SUBMISSION_OUTCOME_UNKNOWN');}
 return true;
}
