import {Pool} from 'pg';
import {createMemoryAdapter} from '../src/adapters/memory';
import {hashCanonical} from '../src/domain';
import {cliArguments,EvidencePublication,readJson,reportCliError,requiredDatabaseUrl,requiredMemoryConfig} from './cli-evidence';
import {requireCount,type ManifestPurpose} from './frozen-manifest';
import {frozenLocator,lockLedger,reconciliationSchema,verifyOriginalJobs} from './write-reconciliation';

try{
 const {options}=cliArguments(process.argv.slice(2),['--purpose','--reconciliation','--out'],[]);
 const purposeValue=options.get('--purpose')??'teaching';
 if(purposeValue!=='teaching'&&purposeValue!=='real-loop')throw Error('INVALID_MANIFEST_PURPOSE');
 const purpose:ManifestPurpose=purposeValue,reconciliationPath=options.get('--reconciliation');
 if(!reconciliationPath)throw Error('RECONCILIATION_REQUIRED');
 const reconciliation=reconciliationSchema.parse(readJson(reconciliationPath));
 const databaseUrl=requiredDatabaseUrl(),config=requiredMemoryConfig();
 const scopeId=process.env.OPERATOR_SCOPE??'demo-recallledger';
 if(reconciliation.scopeId!==scopeId||reconciliation.namespace!==config.namespace)throw Error('RECONCILIATION_SCOPE_MISMATCH');
 const path=options.get('--out')??(purpose==='teaching'?'evidence/frozen-manifest.json':'evidence/real-frozen-manifest.json');
 const pool=new Pool({connectionString:databaseUrl});
 try{
  const client=await pool.connect();let publication:EvidencePublication|undefined;let committed=false;
  try{
   await client.query('BEGIN');const snapshot=await lockLedger(client,scopeId);
   if(snapshot.scope.namespace!==config.namespace||snapshot.scope.memory_account_id!==config.ownerAddress)throw Error('SCOPE_CONFIGURATION_MISMATCH');
   const memory=createMemoryAdapter(config);const verified=await verifyOriginalJobs(snapshot,memory,reconciliation);
   if(verified.report.operationsHash!==reconciliation.operationsHash)throw Error('RECONCILIATION_STALE');
   requireCount(purpose,snapshot.events.length);const manifest=frozenLocator(snapshot,purpose),manifestHash=hashCanonical(manifest);
   if(snapshot.scope.frozen_version&&snapshot.scope.frozen_version!==manifest.manifestVersion)throw Error('SCOPE_ALREADY_FROZEN');
   const existing=await client.query<{manifest_hash:string}>('SELECT manifest_hash FROM frozen_manifests WHERE manifest_version=$1',[manifest.manifestVersion]);
   if(existing.rowCount&&existing.rows[0]!.manifest_hash!==manifestHash)throw Error('FROZEN_MANIFEST_CONFLICT');
   // Stage before any DB mutation. Publishing while the transaction is open lets
   // a local write/rename failure roll back the freeze rather than strand it.
   publication=new EvidencePublication([{path,value:manifest}]);
   await client.query('INSERT INTO frozen_manifests(manifest_version,manifest_json,manifest_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[manifest.manifestVersion,manifest,manifestHash]);
   const saved=await client.query<{manifest_hash:string}>('SELECT manifest_hash FROM frozen_manifests WHERE manifest_version=$1',[manifest.manifestVersion]);
   if(saved.rows[0]?.manifest_hash!==manifestHash)throw Error('FROZEN_MANIFEST_CONFLICT');
   await client.query('UPDATE scopes SET frozen_version=$2 WHERE id=$1',[scopeId,manifest.manifestVersion]);
   publication.publish();await client.query('COMMIT');committed=true;
   console.log(JSON.stringify(manifest,null,2));
  }catch(error){
   if(!committed){try{await client.query('ROLLBACK');}finally{publication?.rollback();}}
   throw error;
  }finally{publication?.discard();client.release();}
 }finally{await pool.end();}
}catch(error){reportCliError(error);}
