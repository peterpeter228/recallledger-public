import {createMemoryAdapter} from '../src/adapters/memory';
import {stateHash} from '../src/domain';
import {cliArguments,publishEvidence,readJson,reportCliError,requiredMemoryConfig} from './cli-evidence';
import {parseFrozenManifest} from './frozen-manifest';

try{
 const {options,flags,positionals}=cliArguments(process.argv.slice(2),['--out'],['--apply'],true);
 if(positionals.length!==1)throw Error('BLOCKED: FROZEN_MANIFEST_REQUIRED; no remote request performed');
 const {manifest,purpose}=parseFrozenManifest(readJson(positionals[0]!)),config=requiredMemoryConfig();
 if(config.namespace!==manifest.namespace||config.ownerAddress!==manifest.ownerAddress)throw Error('RESTORE_SCOPE_MISMATCH');
 // This entrypoint deliberately has no database import, projection, or answer file.
 const result=await createMemoryAdapter({...config,writesEnabled:false}).restore(manifest);
 const report={status:result.status,source:result.source,manifestVersion:manifest.manifestVersion,count:result.events.length,stateHash:stateHash(result.state),checkedAt:new Date().toISOString()};
 if(report.count!==manifest.entries.length||report.stateHash!==manifest.expectedStateHash||result.events.some(event=>event.scopeId!==manifest.scopeId))throw Error('RESTORE_STATE_HASH_MISMATCH');
 if(flags.has('--apply'))publishEvidence([{path:options.get('--out')??(purpose==='teaching'?'evidence/restore-report.json':'evidence/real-restore-report.json'),value:report}]);
 console.log(JSON.stringify(report,null,2));
}catch(error){reportCliError(error);}
