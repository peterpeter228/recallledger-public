import type {MemoryEvent} from '../../contracts/domain-contracts.js';
import type {LedgerStore,MutationResult,PreparedEvent} from './store.js';
import {ApiError} from './errors.js';
/** Explicitly ephemeral synthetic sandbox. NOT a durability or production database substitute. */
export class SandboxStore implements LedgerStore {
 readonly kind='ephemeral-synthetic' as const;
 private pending=new Map<string,{event:MemoryEvent,result:MutationResult}>();
 private histories=new Map<string,MemoryEvent[]>();private keys=new Map<string,{hash:string;result:MutationResult}>();
 async lookup(scope:string,key:string,hash:string){const p=this.keys.get(scope+'\0'+key);if(!p)return null;if(p.hash!==hash)throw new ApiError('IDEMPOTENCY_CONFLICT',409);return p.result;}
 async events(scope:string){return structuredClone(this.histories.get(scope)??[]);}
 async version(scope:string){return (this.histories.get(scope)??[]).length;}
 async enqueue(scope:string,key:string,hash:string,expected:number,build:(events:MemoryEvent[])=>PreparedEvent){
 const k=scope+'\0'+key;const prior=this.keys.get(k);if(prior){if(prior.hash!==hash)throw new ApiError('IDEMPOTENCY_CONFLICT',409);return prior.result;}
 if(this.pending.has(scope))throw new ApiError('MEMORY_PENDING',409,{operationId:this.pending.get(scope)!.result.operationId});
 const history=this.histories.get(scope)??[];if(history.length!==expected)throw new ApiError('VERSION_CONFLICT',409,{currentVersion:history.length});
 const p=build(structuredClone(history));if(p.event.evidenceKind!=='synthetic')throw new ApiError('SANDBOX_SYNTHETIC_ONLY');
 const result={operationId:'simulation:'+crypto.randomUUID(),eventIds:[p.event.eventId],durableVersion:0,pendingSequence:p.event.sequence,state:'pending',simulationVersion:history.length};this.keys.set(k,{hash,result});this.pending.set(scope,{event:p.event,result});return result;
 }
 async operationByKey(scope:string,key:string){const p=this.keys.get(scope+'\0'+key);return p?this.operation(scope,p.result.operationId):null;}
 async pendingOperation(scope:string){const p=this.pending.get(scope);return p?this.operation(scope,p.result.operationId):null;}
 async operation(scope:string,id:string){const p=this.pending.get(scope);return p?.result.operationId===id?{...p.result,scopeId:scope,eventId:p.event.eventId,operationKey:'simulation',namespace:'simulation',memoryText:'',payloadHash:'',jobId:null,attempts:0}:null;}
 async completeSimulation(scope:string,id:string){const p=this.pending.get(scope);if(!p||p.result.operationId!==id)throw new ApiError('OPERATION_NOT_FOUND',404);const h=this.histories.get(scope)??[];h.push(p.event);this.histories.set(scope,h);p.result.state='simulated';this.pending.delete(scope);return {...p.result,simulationVersion:h.length};} async claim(){return null;}
 async update():Promise<void>{throw new Error('SANDBOX_HAS_NO_REMOTE_JOBS');}async complete():Promise<void>{throw new Error('SANDBOX_HAS_NO_REMOTE_RECEIPTS');}
 delete(scope:string){this.histories.delete(scope);this.pending.delete(scope);for(const k of this.keys.keys())if(k.startsWith(scope+'\0'))this.keys.delete(k);}
}
