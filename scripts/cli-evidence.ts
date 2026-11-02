import {randomUUID} from 'node:crypto';
import {closeSync,constants,copyFileSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,realpathSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {basename,dirname,join,resolve} from 'node:path';

export function cliArguments(values:string[],valueFlags:readonly string[],booleanFlags:readonly string[],allowPositionals=false){
 const options=new Map<string,string>();const flags=new Set<string>();const positionals:string[]=[];
 for(let index=0;index<values.length;index++){
  const argument=values[index]!;if(argument==='--')continue;
  if(booleanFlags.includes(argument)){if(flags.has(argument))throw Error('DUPLICATE_CLI_ARGUMENT');flags.add(argument);continue;}
  if(valueFlags.includes(argument)){
   const value=values[++index];if(!value||value.startsWith('--')||options.has(argument))throw Error('INVALID_CLI_ARGUMENT');
   options.set(argument,value);continue;
  }
  if(argument.startsWith('-')||!allowPositionals)throw Error('INVALID_CLI_ARGUMENT');
  positionals.push(argument);
 }
 return {options,flags,positionals};
}
export function requiredMemoryConfig(){
 const key=process.env.MEMWAL_PRIVATE_KEY,accountId=process.env.MEMWAL_ACCOUNT_ID,namespace=process.env.MEMWAL_NAMESPACE,ownerAddress=process.env.MEMWAL_OWNER_ADDRESS;
 if([key,accountId,namespace,ownerAddress].some(value=>!value?.trim()))throw Error('BLOCKED: REQUIRED_MEMORY_CONFIGURATION; no remote request performed');
 return {key:key!,accountId:accountId!,namespace:namespace!,ownerAddress:ownerAddress!,writesEnabled:false as const};
}
export function requiredDatabaseUrl(){
 const value=process.env.DATABASE_URL;if(!value?.trim())throw Error('BLOCKED: DEDICATED_DATABASE_REQUIRED; no remote request performed');return value;
}
export function readJson(path:string):unknown{return JSON.parse(readFileSync(path,'utf8'));}
export function reportCliError(error:unknown){
 const message=error instanceof Error?error.message:'';
 // Provider/SQL errors can contain request or payload details. Only print our semantic codes.
 const semantic=/^(?:BLOCKED: )?[A-Z][A-Z0-9_]*(?=$|[;:])/.exec(message)?.[0];
 const systemCode=typeof error==='object'&&error!==null&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:undefined;
 console.error(semantic??systemCode??'CLI_VALIDATION_OR_PROVIDER_FAILED');process.exitCode=2;
}

export function evidenceDestinations(paths:string[]){
 const resolved=paths.map(value=>{
  const absolute=resolve(value);let directory=dirname(absolute),suffix=basename(absolute);
  while(!existsSync(directory)){suffix=join(basename(directory),suffix);directory=dirname(directory);}
  return resolve(realpathSync(directory),suffix);
 });
 const identities=resolved.map(path=>{if(!existsSync(path))return path;const stat=lstatSync(path);if(!stat.isFile())throw Error('EVIDENCE_OUTPUT_NOT_REGULAR_FILE');return `${stat.dev}:${stat.ino}`;});
 if(new Set(resolved).size!==paths.length||new Set(identities).size!==paths.length)throw Error('EVIDENCE_OUTPUT_PATH_CONFLICT');
 return resolved;
}

interface StagedFile {path:string;temporary:string;backup?:string;published:boolean}
/** Stages every output first; each rename publishes a whole file, never a partially written JSON. */
export class EvidencePublication {
 private files:StagedFile[]=[];
 private retainBackups=false;
 constructor(outputs:Array<{path:string;value:unknown}>){
  const destinations=evidenceDestinations(outputs.map(output=>output.path));
  try{
   for(const [index,output] of outputs.entries()){
    const path=destinations[index]!,directory=dirname(path);mkdirSync(directory,{recursive:true});
    const file:StagedFile={path,temporary:resolve(directory,`.recallledger-${randomUUID()}.tmp`),published:false};this.files.push(file);
    if(existsSync(path)){
     if(!lstatSync(path).isFile())throw Error('EVIDENCE_OUTPUT_NOT_REGULAR_FILE');
     file.backup=resolve(directory,`.recallledger-${randomUUID()}.previous`);copyFileSync(path,file.backup,constants.COPYFILE_EXCL);
     const backup=openSync(file.backup,'r');try{fsyncSync(backup);}finally{closeSync(backup);}
    }
    const descriptor=openSync(file.temporary,'wx',0o600);
    try{writeFileSync(descriptor,JSON.stringify(output.value,null,2)+'\n');fsyncSync(descriptor);}finally{closeSync(descriptor);}
   }
  }catch(error){this.discard();throw error;}
 }
 publish(){
  try{
   for(const file of this.files){renameSync(file.temporary,file.path);file.published=true;}
   for(const directory of new Set(this.files.map(file=>dirname(file.path)))){const descriptor=openSync(directory,'r');try{fsyncSync(descriptor);}finally{closeSync(descriptor);}}
  }
  catch(error){this.rollback();throw error;}
 }
 rollback(){
  try{
   for(const file of [...this.files].reverse()){
    if(!file.published)continue;
    if(file.backup){renameSync(file.backup,file.path);file.backup=undefined;}else unlinkSync(file.path);
    file.published=false;
   }
  }catch{this.retainBackups=true;throw Error('EVIDENCE_ROLLBACK_FAILED');}
 }
 discard(){
  for(const file of this.files)for(const path of [file.temporary,...(this.retainBackups?[]:[file.backup])])if(path&&existsSync(path))unlinkSync(path);
 }
}
export function publishEvidence(outputs:Array<{path:string;value:unknown}>){
 const publication=new EvidencePublication(outputs);try{publication.publish();}finally{publication.discard();}
}
