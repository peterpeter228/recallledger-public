import {describe,it,expect,vi} from 'vitest';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createServer,request as httpRequest,type IncomingHttpHeaders,type IncomingMessage} from 'node:http';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {text} from 'node:stream/consumers';
import {buildApp} from '../../src/server/app.js';
import {loadPublicEvidence} from '../../src/server/public-evidence.js';
import {validatePublicEvidencePair,type PublicEvidence} from '../../src/domain/public-evidence.js';
import {createRecordedHandler} from '../../api/index.js';

// Structural export fixtures only. These invented identifiers never leave memory or a
// throwaway test directory, and are not Mainnet receipts or live verification evidence.
const verifiedAt='2026-10-26T10:30:00.000Z';
const checkedAt='2026-10-26T10:31:00.000Z';
interface SyntheticEntry {eventId:string;sequence:number;eventHash:string;textSha256:string;blobId:string;memoryId:string;jobId:string}
interface Pair {
 countExport:{schemaVersion:string;purpose:string;mode:string;manifestVersion:string;scopeId:string;namespace:string;ownerAddress:string;entries:SyntheticEntry[];expectedStateHash:string;verifiedCount:number;verifiedAt:string;verification:{exactSet:boolean;hashes:boolean}};
 restoreReport:{status:string;source:string;manifestVersion:string;count:number;stateHash:string;checkedAt:string};
}
function syntheticPair(count=10,purpose='teaching'):Pair{
 const scopeId='fixture:synthetic-public-evidence';
 const manifestVersion=`recallledger-${purpose}-v1-${encodeURIComponent(scopeId)}-n${count}`;
 const countExport={
  schemaVersion:'1',purpose,mode:'recorded_live',manifestVersion,scopeId,
  namespace:'fixture:synthetic-private-namespace',ownerAddress:'fixture:synthetic-private-owner',
  entries:Array.from({length:count},(_,index)=>({
   eventId:`fixture:synthetic-event-${index+1}`,sequence:index+1,
   eventHash:(index+1).toString(16).padStart(64,'0'),textSha256:(index+101).toString(16).padStart(64,'0'),
   blobId:`fixture:synthetic-blob-${index+1}`,memoryId:`fixture:synthetic-memory-${index+1}`,jobId:`fixture:synthetic-job-${index+1}`,
  })),
  expectedStateHash:'a'.repeat(64),verifiedCount:count,verifiedAt,verification:{exactSet:true,hashes:true},
 };
 const restoreReport={status:'verified',source:'walrus_relayer',manifestVersion,count,stateHash:countExport.expectedStateHash,checkedAt};
 return {countExport,restoreReport};
}
function resolved(pair:Pair){return validatePublicEvidencePair(pair.countExport,pair.restoreReport);}
function expectUnavailable(data:PublicEvidence,verification:'unverified'|'not_run'='unverified'){
 expect(data).toMatchObject({dataOrigin:'synthetic',mainnetMemoryCount:0,mode:'fixture',liveVerification:verification});
 for(const field of ['verifiedAt','manifestVersion','stateHash'])expect(data).not.toHaveProperty(field);
}
async function publicResponse(countExport?:unknown,restoreReport?:unknown){
 const app=buildApp({writesEnabled:false,publicEvidence:validatePublicEvidencePair(countExport,restoreReport)});
 try{
  const response=await app.inject('/api/evidence/public');
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.json().meta.dataOrigin).toBe('synthetic');
  return response.json().data as PublicEvidence;
 }finally{await app.close();}
}

describe('recorded teaching evidence through the real public handler (synthetic fixtures)',()=>{
 it('keeps an absent export pair at zero without inventing recorded provenance',async()=>{
  const data=await publicResponse();
  expect(['not_run','unverified']).toContain(data.liveVerification);
  expectUnavailable(data,data.liveVerification as 'not_run'|'unverified');
 });
 it.each([10,11,12])('serves exactly N=%i and the original recorded provenance, not request time',async count=>{
  const pair=syntheticPair(count),data=await publicResponse(pair.countExport,pair.restoreReport);
  expect(data).toMatchObject({
   dataOrigin:'synthetic',mainnetMemoryCount:count,liveVerification:'verified',mode:'recorded_live',
   verifiedAt,manifestVersion:pair.countExport.manifestVersion,stateHash:'a'.repeat(64),
  });
  expect(typeof data.note).toBe('string');
  for(const field of ['entries','namespace','ownerAddress','verification','restoreReport'])expect(data).not.toHaveProperty(field);
  expect(JSON.stringify(data)).not.toContain('fixture:synthetic-private-');
 });
 it('preserves a historical recorded check without inventing a freshness TTL',async()=>{
  const pair=syntheticPair();
  pair.countExport.verifiedAt='2020-01-01T00:00:00.000Z';pair.restoreReport.checkedAt='2020-01-01T00:01:00.000Z';
  expect(await publicResponse(pair.countExport,pair.restoreReport)).toMatchObject({mainnetMemoryCount:10,liveVerification:'verified',mode:'recorded_live',verifiedAt:'2020-01-01T00:00:00.000Z'});
 });
 it('accepts restore completion at the count-verification instant',async()=>{
  const pair=syntheticPair();pair.restoreReport.checkedAt=verifiedAt;
  expect(await publicResponse(pair.countExport,pair.restoreReport)).toMatchObject({mainnetMemoryCount:10,liveVerification:'verified',verifiedAt});
 });
 it.each([
  ['count export only',(pair:Pair)=>[pair.countExport,undefined]],
  ['restore report only',(pair:Pair)=>[undefined,pair.restoreReport]],
  ['non-object count export',(pair:Pair)=>['not JSON evidence',pair.restoreReport]],
  ['non-object restore report',(pair:Pair)=>[pair.countExport,null]],
 ] as const)('rejects an incomplete pair: %s',async(_name,inputs)=>{
  const [countExport,restoreReport]=inputs(syntheticPair());
  expectUnavailable(await publicResponse(countExport,restoreReport));
 });
 const invalid:Array<[string,(pair:Pair)=>void]>=[
  ['verified count differs from the entry set',pair=>{pair.countExport.verifiedCount=11;}],
  ['restore count differs from the entry set',pair=>{pair.restoreReport.count=11;}],
  ['restored hash differs from the frozen state',pair=>{pair.restoreReport.stateHash='b'.repeat(64);}],
  ['restore manifest version differs',pair=>{pair.restoreReport.manifestVersion+='-other';}],
  ['manifest version does not bind its scope',pair=>{pair.countExport.scopeId='fixture:another-scope';}],
  ['manifest version does not bind its count',pair=>{pair.countExport.manifestVersion=pair.countExport.manifestVersion.replace('-n10','-n11');pair.restoreReport.manifestVersion=pair.countExport.manifestVersion;}],
  ['unsupported schema version',pair=>{pair.countExport.schemaVersion='2';}],
  ['non-teaching purpose',pair=>{pair.countExport.purpose='real-loop';}],
  ['non-recorded mode',pair=>{pair.countExport.mode='fixture';}],
  ['exact-set verification was not successful',pair=>{pair.countExport.verification.exactSet=false;}],
  ['hash verification was not successful',pair=>{pair.countExport.verification.hashes=false;}],
  ['missing verification flag',pair=>{Reflect.deleteProperty(pair.countExport.verification,'hashes');}],
  ['truthy verification flag is not true',pair=>{Object.assign(pair.countExport.verification,{exactSet:'true'});}],
  ['restore is only simulated',pair=>{pair.restoreReport.status='simulated';}],
  ['restore has the wrong source',pair=>{pair.restoreReport.source='ephemeral_session_events';}],
  ['count verification timestamp is invalid',pair=>{pair.countExport.verifiedAt='not-a-time';}],
  ['count verification calendar date is invalid',pair=>{pair.countExport.verifiedAt='2026-02-30T10:30:00.000Z';}],
  ['restore timestamp is invalid',pair=>{pair.restoreReport.checkedAt='not-a-time';}],
  ['restore predates count verification',pair=>{pair.restoreReport.checkedAt='2026-10-26T10:29:59.999Z';}],
  ['count verification timestamp is missing',pair=>{Reflect.deleteProperty(pair.countExport,'verifiedAt');}],
  ['restore timestamp is missing',pair=>{Reflect.deleteProperty(pair.restoreReport,'checkedAt');}],
  ['restore state hash is missing',pair=>{Reflect.deleteProperty(pair.restoreReport,'stateHash');}],
  ['entry sequence has a gap',pair=>{pair.countExport.entries[5]!.sequence=20;}],
  ['entry sequence is out of order',pair=>{[pair.countExport.entries[4],pair.countExport.entries[5]]=[pair.countExport.entries[5]!,pair.countExport.entries[4]!];}],
  ['event hash is malformed',pair=>{pair.countExport.entries[0]!.eventHash='not-a-hash';}],
  ['text hash is malformed',pair=>{pair.countExport.entries[0]!.textSha256='not-a-hash';}],
  ['state hash is malformed even when both exports agree',pair=>{pair.countExport.expectedStateHash='not-a-hash';pair.restoreReport.stateHash='not-a-hash';}],
  ...(['eventId','blobId','memoryId','jobId'] as const).map(field=>[
   `duplicate ${field}`,(pair:Pair)=>{pair.countExport.entries[1]![field]=pair.countExport.entries[0]![field];},
  ] as [string,(pair:Pair)=>void]),
 ];
 it.each(invalid)('serves zero/unverified for %s',async(_name,change)=>{
  const pair=syntheticPair();change(pair);
  expectUnavailable(await publicResponse(pair.countExport,pair.restoreReport));
 });
 it.each([9,13])('rejects a teaching export with N=%i even when the pair agrees',async count=>{
  const pair=syntheticPair(count);expectUnavailable(await publicResponse(pair.countExport,pair.restoreReport));
 });
 it('never promotes the real-loop four-event export to teaching count',async()=>{
  const pair=syntheticPair(4,'real-loop');expectUnavailable(await publicResponse(pair.countExport,pair.restoreReport));
 });
});

async function withEvidenceDirectory(run:(root:string,evidenceDirectory:string)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'recallledger-recorded-evidence-test-'));
 try{const evidenceDirectory=join(root,'evidence');await mkdir(evidenceDirectory);await run(root,evidenceDirectory);}
 finally{await rm(root,{recursive:true,force:true});}
}
describe('whitelisted recorded-export loading in throwaway directories',()=>{
 it('loads no evidence as zero without a mandatory artifact import',async()=>{
  await withEvidenceDirectory(async root=>{
   const data=await loadPublicEvidence(root);expect(['not_run','unverified']).toContain(data.liveVerification);
   expectUnavailable(data,data.liveVerification as 'not_run'|'unverified');
  });
 });
 it('loads only the validated public provenance from the named JSON pair',async()=>{
  await withEvidenceDirectory(async(root,directory)=>{
   const pair=syntheticPair(12);
   await writeFile(join(directory,'mainnet-manifest.json'),JSON.stringify(pair.countExport));
   await writeFile(join(directory,'restore-report.json'),JSON.stringify(pair.restoreReport));
   await writeFile(join(directory,'mainnet-events.json'),'private synthetic event payload not for public bundling');
   const data=await loadPublicEvidence(root);
   expect(data).toMatchObject({dataOrigin:'synthetic',mainnetMemoryCount:12,liveVerification:'verified',mode:'recorded_live',verifiedAt,manifestVersion:pair.countExport.manifestVersion,stateHash:'a'.repeat(64)});
   expect(Object.keys(data).sort()).toEqual(['dataOrigin','mainnetMemoryCount','liveVerification','mode','note','verifiedAt','manifestVersion','stateHash'].sort());
  });
 });
 it.each(['mainnet-manifest.json','restore-report.json'])('does not trust %s without its counterpart',async file=>{
  await withEvidenceDirectory(async(root,directory)=>{
   const pair=syntheticPair();await writeFile(join(directory,file),JSON.stringify(file==='mainnet-manifest.json'?pair.countExport:pair.restoreReport));
   expectUnavailable(await loadPublicEvidence(root));
  });
 });
 it.each(['mainnet-manifest.json','restore-report.json'])('returns zero for malformed JSON in %s',async file=>{
  await withEvidenceDirectory(async(root,directory)=>{
   const pair=syntheticPair();await writeFile(join(directory,'mainnet-manifest.json'),JSON.stringify(pair.countExport));
   await writeFile(join(directory,'restore-report.json'),JSON.stringify(pair.restoreReport));await writeFile(join(directory,file),'{broken-json');
   expectUnavailable(await loadPublicEvidence(root));
  });
 });
 it('does not retain a previously valid count when the next loaded pair mismatches',async()=>{
  await withEvidenceDirectory(async(root,directory)=>{
   const pair=syntheticPair();await writeFile(join(directory,'mainnet-manifest.json'),JSON.stringify(pair.countExport));
   await writeFile(join(directory,'restore-report.json'),JSON.stringify(pair.restoreReport));
   expect((await loadPublicEvidence(root)).mainnetMemoryCount).toBe(10);
   pair.restoreReport.count=11;await writeFile(join(directory,'restore-report.json'),JSON.stringify(pair.restoreReport));
   expectUnavailable(await loadPublicEvidence(root));
  });
 });
});

describe('read-only handler safety',()=>{
 it('keeps operator and writes disabled and never invokes supplied provider boundaries',async()=>{
  const inspect=vi.fn(async()=>{throw Error('provider must not be invoked');});
  const propose=vi.fn(async()=>{throw Error('provider must not be invoked');});
  const restoreCheck=vi.fn(async()=>{throw Error('provider must not be invoked');});
  const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('no external requests permitted'));
  const app=buildApp({writesEnabled:false,publicEvidence:resolved(syntheticPair()),inspect,propose,restoreCheck});
  try{
   const health=await app.inject('/api/health');expect(health.statusCode).toBe(200);
   expect(health.json().data).toMatchObject({status:'ok',operatorEnabled:false,writesEnabled:false,persistence:'not_configured'});
   expect((await app.inject('/api/evidence/public')).json().data.mainnetMemoryCount).toBe(10);
   for(const url of ['/api/session','/api/transactions/inspect','/api/corrections/propose','/api/labels/confirm','/api/memory/restore-check']){
    const denied=await app.inject({method:'POST',url,headers:{origin:'http://localhost:5173'},payload:{token:'fixture:not-an-operator-token',confirmed:true,expectedVersion:0}});
    expect(denied.statusCode,url).toBe(401);expect(denied.json().error.code,url).toBe('UNAUTHORIZED');
   }
   expect(inspect).not.toHaveBeenCalled();expect(propose).not.toHaveBeenCalled();expect(restoreCheck).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
  }finally{await app.close();fetcher.mockRestore();}
 });
});

type NativeResponse={status:number;headers:IncomingHttpHeaders;body:string;json:()=>any};
async function withNativeHandler(evidence:PublicEvidence|undefined,run:(call:(path:string,body?:unknown)=>Promise<NativeResponse>)=>Promise<void>){
 const handler=createRecordedHandler(evidence);
 const server=createServer((request,response)=>{void Promise.resolve(handler(request,response)).catch(error=>response.destroy(error));});
 const listening=once(server,'listening');server.listen(0,'127.0.0.1');await listening;
 const port=(server.address() as AddressInfo).port;
 const call=async(path:string,body?:unknown):Promise<NativeResponse>=>{
  const request=httpRequest({host:'127.0.0.1',port,path,method:body===undefined?'GET':'POST',headers:{origin:'http://localhost:5173',...(body===undefined?{}:{'content-type':'application/json'})}});
  const responseReady=once(request,'response');request.end(body===undefined?undefined:JSON.stringify(body));
  const [response]=await responseReady as [IncomingMessage];const bodyText=await text(response);
  return {status:response.statusCode??0,headers:response.headers,body:bodyText,json:()=>JSON.parse(bodyText)};
 };
 try{await run(call);}finally{const closed=once(server,'close');server.closeAllConnections();server.close();await closed;}
}
describe('native Node request/response recorded handler bridge',()=>{
 it('serves an absent pair as JSON zero, not a fabricated recorded count',async()=>{
  await withNativeHandler(validatePublicEvidencePair(undefined,undefined),async call=>{
   const response=await call('/api/evidence/public');expect(response.status).toBe(200);expect(response.headers['content-type']).toContain('application/json');
   const data=response.json().data;expect(['not_run','unverified']).toContain(data.liveVerification);expectUnavailable(data,data.liveVerification);
  });
 });
 it('serves a matching N=11 pair through actual native requests with exact recorded fields',async()=>{
  const pair=syntheticPair(11);
  await withNativeHandler(resolved(pair),async call=>{
   const response=await call('/api/evidence/public');expect(response.status).toBe(200);
   expect(response.json().data).toMatchObject({dataOrigin:'synthetic',mainnetMemoryCount:11,liveVerification:'verified',mode:'recorded_live',verifiedAt,manifestVersion:pair.countExport.manifestVersion,stateHash:'a'.repeat(64)});
  });
 });
 it.each(['count','hash'])('serves a mismatched %s as zero/unverified through the native bridge',async field=>{
  const pair=syntheticPair();if(field==='count')pair.restoreReport.count=12;else pair.restoreReport.stateHash='b'.repeat(64);
  await withNativeHandler(resolved(pair),async call=>{const response=await call('/api/evidence/public');expect(response.status).toBe(200);expectUnavailable(response.json().data);});
 });
 it('keeps operator routes dark and API misses JSON rather than SPA HTML',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('no provider requests permitted'));
  try{
   await withNativeHandler(undefined,async call=>{
    const health=await call('/api/health');expect(health.status).toBe(200);
    expect(health.json().data).toMatchObject({status:'ok',operatorEnabled:false,writesEnabled:false,persistence:'not_configured'});
    for(const path of ['/api/session','/api/transactions/inspect','/api/rules/confirm','/api/memory/restore-check']){
     const denied=await call(path,{});expect(denied.status,path).toBe(401);expect(denied.json().error.code,path).toBe('UNAUTHORIZED');
    }
    const missing=await call('/api/does-not-exist');expect(missing.status).toBe(404);expect(missing.headers['content-type']).toContain('application/json');expect(missing.body).not.toMatch(/<!doctype|<html/i);
   });
   expect(fetcher).not.toHaveBeenCalled();
  }finally{fetcher.mockRestore();}
 });
});
