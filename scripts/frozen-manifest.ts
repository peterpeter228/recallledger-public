import {z} from 'zod';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const identity=z.string().min(1);
export const frozenManifestSchema=z.object({
 manifestVersion:identity,scopeId:identity,namespace:identity,ownerAddress:identity,
 entries:z.array(z.object({eventId:identity,sequence:z.number().int().positive(),eventHash:hash,blobId:identity,textSha256:hash,memoryId:identity,jobId:identity}).strict()),
 expectedStateHash:hash,
}).strict();
export type FrozenManifest=z.infer<typeof frozenManifestSchema>;
export type ManifestPurpose='teaching'|'real-loop';
export function manifestVersion(purpose:ManifestPurpose,scopeId:string,count:number){
 return `recallledger-${purpose}-v1-${encodeURIComponent(scopeId)}-n${count}`;
}
export function requireCount(purpose:ManifestPurpose,count:number){
 if(purpose==='teaching'&&(count<10||count>12))throw Error('TEACHING_CONTIGUOUS_10_TO_12_REQUIRED');
 if(purpose==='real-loop'&&count!==4)throw Error('REAL_LOOP_EXACT_FOUR_REQUIRED');
}
export function parseFrozenManifest(value:unknown){
 const manifest=frozenManifestSchema.parse(value);
 const purpose:ManifestPurpose=manifest.manifestVersion.startsWith('recallledger-real-loop-v1-')?'real-loop':'teaching';
 requireCount(purpose,manifest.entries.length);
 if(manifest.manifestVersion!==manifestVersion(purpose,manifest.scopeId,manifest.entries.length))throw Error('MANIFEST_VERSION_SCOPE_OR_PURPOSE_MISMATCH');
 for(const field of ['eventId','blobId','memoryId','jobId'] as const){
  if(new Set(manifest.entries.map(entry=>entry[field])).size!==manifest.entries.length)throw Error('DUPLICATE_MANIFEST_ENTRY');
 }
 if(manifest.entries.some((entry,index)=>entry.sequence!==index+1))throw Error('MANIFEST_NONCONTIGUOUS_SEQUENCE');
 return {manifest,purpose};
}
