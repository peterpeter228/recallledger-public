import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
import {loadPublicEvidence} from '../src/server/public-evidence.js';

const root=resolve(import.meta.dirname,'..');
const evidence=await loadPublicEvidence(root);
await writeFile(resolve(root,'src/server/generated/public-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const result=await build({absWorkingDir:root,entryPoints:['api/index.ts'],outfile:'dist/api/index.js',bundle:true,platform:'node',format:'esm',packages:'external',target:'node24',metafile:true,write:false});
const forbiddenInput=Object.keys(result.metafile.inputs).find(path=>/(?:^|\/)src\/(?:adapters\/|server\/(?:main|store)\.ts$)/.test(path));
const forbiddenImport=Object.values(result.metafile.outputs).flatMap(output=>output.imports).find(entry=>/^(?:pg(?:\/|$)|@mysten(?:-incubation)?\/|@grpc\/|@protobuf-ts\/)/.test(entry.path));
if(forbiddenInput||forbiddenImport)throw Error('RECORDED_FUNCTION_MUST_NOT_IMPORT_OPERATOR_OR_PROVIDER_MODULES');
for(const output of result.outputFiles){await mkdir(dirname(output.path),{recursive:true});await writeFile(output.path,output.contents);}
