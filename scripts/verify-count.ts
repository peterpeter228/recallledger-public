import {Pool} from 'pg';
import {createMemoryAdapter} from '../src/adapters/memory';
import {stateHash} from '../src/domain';
import {cliArguments,evidenceDestinations,EvidencePublication,publishEvidence,readJson,reportCliError,requiredDatabaseUrl,requiredMemoryConfig} from './cli-evidence';
import {parseFrozenManifest} from './frozen-manifest';
import {applyReconciliation,lockLedger,requireExactInventory,requireSameInventory,verifyOriginalJobs} from './write-reconciliation';

try{
 const {options,flags}=cliArguments(process.argv.slice(2),['--manifest','--out','--events-out'],['--reconcile','--apply']);
 const reconcile=flags.has('--reconcile'),apply=flags.has('--apply'),manifestPath=options.get('--manifest');
 if(reconcile===Boolean(manifestPath)||reconcile&&options.has('--events-out'))throw Error('EXACTLY_ONE_VERIFICATION_MODE_REQUIRED');
 if(reconcile){
  const databaseUrl=requiredDatabaseUrl(),config=requiredMemoryConfig();
  const pool=new Pool({connectionString:databaseUrl});
  try{
   const client=await pool.connect();let publication:EvidencePublication|undefined;let committed=false;
   try{
    await client.query('BEGIN');const snapshot=await lockLedger(client,process.env.OPERATOR_SCOPE??'demo-recallledger');
    if(snapshot.scope.namespace!==config.namespace||snapshot.scope.memory_account_id!==config.ownerAddress)throw Error('SCOPE_CONFIGURATION_MISMATCH');
    const verified=await verifyOriginalJobs(snapshot,createMemoryAdapter(config));
    if(apply){
     publication=new EvidencePublication([{path:options.get('--out')??'evidence/write-reconciliation.json',value:verified.report}]);
     await applyReconciliation(client,snapshot,verified.snapshot);
     publication.publish();await client.query('COMMIT');committed=true;
    }else await client.query('ROLLBACK');
    console.log(JSON.stringify(verified.report,null,2));
   }catch(error){if(!committed){try{await client.query('ROLLBACK');}finally{publication?.rollback();}}throw error;}
   finally{publication?.discard();client.release();}
  }finally{await pool.end();}
 }else{
  if(!manifestPath)throw Error('FROZEN_MANIFEST_REQUIRED');
  const {manifest,purpose}=parseFrozenManifest(readJson(manifestPath));
  if(purpose!=='teaching')throw Error('TEACHING_MANIFEST_REQUIRED_FOR_COUNT');
  const [countPath,eventsPath]=evidenceDestinations([options.get('--out')??'evidence/mainnet-manifest.json',options.get('--events-out')??'evidence/events-public.json']);
  const config=requiredMemoryConfig();
  if(config.namespace!==manifest.namespace||config.ownerAddress!==manifest.ownerAddress)throw Error('RESTORE_SCOPE_MISMATCH');
  const memory=createMemoryAdapter(config),inventory=await memory.inventory();
  requireExactInventory(inventory,manifest.namespace,manifest.entries.map(entry=>entry.blobId));
  for(const entry of manifest.entries){
   const status=await memory.status(entry.jobId,{namespace:manifest.namespace,textSha256:entry.textSha256}),receipt=status.receipt;
   if(status.state!=='done'||!receipt)throw Error('VERIFIED_DONE_RECEIPT_REQUIRED');
   if(receipt.blobId!==entry.blobId||receipt.memoryId!==entry.memoryId||receipt.jobId!==entry.jobId||receipt.textSha256!==entry.textSha256||receipt.namespace!==manifest.namespace||receipt.ownerAddress!==manifest.ownerAddress)throw Error('RECEIPT_MISMATCH');
  }
  const restored=await memory.restore(manifest),after=await memory.inventory();requireSameInventory(inventory,after,manifest.namespace);
  const restoredHash=stateHash(restored.state);
  if(restored.events.length!==manifest.entries.length||restoredHash!==manifest.expectedStateHash||restored.events.some(event=>event.scopeId!==manifest.scopeId))throw Error('RESTORE_STATE_HASH_MISMATCH');
  const verifiedAt=new Date().toISOString();
  const count={...manifest,schemaVersion:'1' as const,purpose:'teaching' as const,mode:'recorded_live' as const,verifiedCount:manifest.entries.length,verifiedAt,verification:{exactSet:true,hashes:true}};
  const events={schemaVersion:'1' as const,manifestVersion:manifest.manifestVersion,verifiedAt,entries:manifest.entries};
  if(apply)publishEvidence([{path:countPath!,value:count},{path:eventsPath!,value:events}]);
  console.log(JSON.stringify(count,null,2));
 }
}catch(error){reportCliError(error);}
