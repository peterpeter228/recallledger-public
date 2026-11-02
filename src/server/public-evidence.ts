import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validatePublicEvidencePair,type PublicEvidence} from '../domain/public-evidence.js';

/** Only these two public export names are eligible; never enumerate the evidence tree. */
export async function loadPublicEvidence(root=process.cwd()):Promise<PublicEvidence> {
 const readExport=async(name:'mainnet-manifest.json'|'restore-report.json'):Promise<unknown>=>{
  let text:string;
  try {text=await readFile(resolve(root,'evidence',name),'utf8');}
  catch(error) {return (error as NodeJS.ErrnoException).code==='ENOENT'?undefined:null;}
  try {return JSON.parse(text) as unknown;}
  catch {return null;}
 };
 const [count,restore]=await Promise.all([readExport('mainnet-manifest.json'),readExport('restore-report.json')]);
 return validatePublicEvidencePair(count,restore);
}
