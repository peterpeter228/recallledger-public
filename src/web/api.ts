import type {MemoryEvent,TransactionObservation,PolicyRule,ClassificationDecision} from '../../contracts/domain-contracts';
import {createLocalSandbox} from './local-sandbox';
import {ApiError} from '../server/errors';
const localSandbox=createLocalSandbox();
export type Snapshot={scopeId?:string;events:MemoryEvent[]; observations?:TransactionObservation[]|Record<string,TransactionObservation>; state?:Projection; projection?:Projection; summary?:{assets:{coinType:string;toolsSpendAtomic:string;unknownAtomic:string;budgetAtomic:string|null;budgetWarning:boolean}[];needsContextRefs:string[]}; decisions?:Record<string,ClassificationDecision>; csrfToken?:string;memoryVersion?:number;stateHash?:string;pendingOperation?:{operationId:string;state?:string};mode?:string};
export type Projection={memoryVersion:number;observations:Record<string,TransactionObservation>;rules:Record<string,PolicyRule>;labels:Record<string,ClassificationDecision>;decisions:Record<string,ClassificationDecision>;refundLinks:{refundObservationId:string;originalObservationId:string}[];preferences:{budgetAtomic:string}[]};
export class ApiResponseError extends Error {constructor(public code:string,public status:number,message:string){super(`${code}: ${message}`)}}
export async function api<T=any>(path:string,body?:unknown,csrf?:string,idempotencyKey?:string):Promise<T>{
 if(path==='/demo'||path.startsWith('/demo/')){
  try {return await localSandbox.request<T>(path,body,csrf,csrf?idempotencyKey??crypto.randomUUID():undefined);}
  catch(error){if(error instanceof ApiError)throw new ApiResponseError(error.code,error.status,error.message);throw error;}
 }
 const r=await fetch('/api'+path,{credentials:'same-origin',method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf,'Idempotency-Key':idempotencyKey??crypto.randomUUID()}: {})},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new ApiResponseError(j.error?.code??String(r.status),r.status,j.error?.message??'Request failed. Please reload the current state.');return j.data;
}
export const label=(v:string)=>v.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
export function amount(v:string,decimals:number|null=6){if(decimals===null)return v+' atomic';const n=BigInt(v),scale=10n**BigInt(decimals);return (n/scale).toString()+'.'+(n%scale).toString().padStart(decimals,'0').slice(0,Math.max(2,decimals)).replace(/0+$/,'').padEnd(2,'0');}
export const title=(o:TransactionObservation)=>'Transfer '+o.observationId.split('-').at(-1);
export const stepTitles=['Set your Tools budget','Inspect transfer A','Explain transfer A','Teach a reusable rule','Apply context to transfer B','Review transfer C','Correct this transfer','Narrow the matching range','Inspect incoming transfer D','Link an explicit refund','Review the next transfer','Stop using this rule'];
