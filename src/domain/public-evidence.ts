import {z} from 'zod';
import {frozenManifestSchema,parseFrozenManifest} from '../../scripts/frozen-manifest.js';

export interface PublicEvidence {
 dataOrigin:'synthetic';
 mainnetMemoryCount:number;
 liveVerification:'verified'|'not_run'|'unverified';
 mode:'recorded_live'|'fixture';
 note:string;
 verifiedAt?:string;
 manifestVersion?:string;
 stateHash?:string;
}

const recordedTime=z.string().datetime({offset:true});
const countExportSchema=frozenManifestSchema.extend({
 schemaVersion:z.literal('1'),purpose:z.literal('teaching'),mode:z.literal('recorded_live'),
 verifiedCount:z.number().int().min(10).max(12),verifiedAt:recordedTime,
 verification:z.object({exactSet:z.literal(true),hashes:z.literal(true)}).strict(),
}).strict();
const restoreExportSchema=z.object({
 status:z.literal('verified'),source:z.literal('walrus_relayer'),manifestVersion:z.string().min(1),
 count:z.number().int().min(10).max(12),stateHash:z.string().regex(/^[a-f0-9]{64}$/),checkedAt:recordedTime,
}).strict();

/** Validate only recorded proofs. This never queries storage or asserts current availability. */
export function validatePublicEvidencePair(countExport?:unknown,restoreExport?:unknown):PublicEvidence {
 if(countExport===undefined&&restoreExport===undefined)return {
  dataOrigin:'synthetic',mainnetMemoryCount:0,liveVerification:'not_run',mode:'fixture',
  note:'Synthetic teaching scenario. No recorded Mainnet storage verification is bundled.',
 };
 const unverified:PublicEvidence={dataOrigin:'synthetic',mainnetMemoryCount:0,liveVerification:'unverified',mode:'fixture',note:'Recorded storage evidence is missing, invalid, or inconsistent. No Mainnet memories are verified by this view.'};
 const countResult=countExportSchema.safeParse(countExport),restoreResult=restoreExportSchema.safeParse(restoreExport);
 if(!countResult.success||!restoreResult.success)return unverified;
 const count=countResult.data,restore=restoreResult.data;
 try {
  const {schemaVersion:_schemaVersion,purpose:_purpose,mode:_mode,verifiedCount:_verifiedCount,verifiedAt:_verifiedAt,verification:_verification,...locator}=count;
  const {manifest,purpose}=parseFrozenManifest(locator);
  if(purpose!=='teaching'||count.verifiedCount!==manifest.entries.length||restore.count!==count.verifiedCount||restore.manifestVersion!==manifest.manifestVersion||restore.stateHash!==manifest.expectedStateHash||Date.parse(restore.checkedAt)<Date.parse(count.verifiedAt))return unverified;
  return {dataOrigin:'synthetic',mainnetMemoryCount:count.verifiedCount,liveVerification:'verified',mode:'recorded_live',verifiedAt:count.verifiedAt,manifestVersion:manifest.manifestVersion,stateHash:restore.stateHash,note:'Recorded Mainnet storage verification of synthetic teaching memories. This historical check is not a live availability or retention guarantee, and does not verify the synthetic transactions.'};
 } catch {
  return unverified;
 }
}
