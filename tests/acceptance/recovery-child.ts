// Independent process; deterministic in-memory remote TEST DOUBLE. Not Walrus/network evidence.
import {MemoryAdapter,type MemoryClient} from '../../src/adapters/memory/index';
import {compileDemoEvents} from '../../src/domain/demo';
import {eventText,sha256Text,stateHash,replayEvents} from '../../src/domain';
const events=compileDemoEvents(),texts=events.map(eventText);
const manifest={namespace:'synthetic',ownerAddress:'synthetic-owner',entries:events.map((e,i)=>({eventId:e.eventId,blobId:'fake-blob-'+i,textSha256:sha256Text(texts[i]!)})),expectedStateHash:stateHash(replayEvents(events))};
let mode='ok';
const client={listMemories:async()=>({memories:events.map((_,i)=>({memory_id:'rebuilt-index-'+i,namespace_id:'synthetic',blob_id:'fake-blob-'+i})),has_more:false,snapshot_version:1,must_resync:false}),recall:async()=>({results:texts.map((text,i)=>({text:mode==='tamper'&&i===0?text+' ':text,blob_id:'fake-blob-'+i,distance:100-i})).filter((_,i)=>mode!=='missing'||i!==7).reverse()})} as unknown as MemoryClient;
const adapter=new MemoryAdapter(client,'synthetic-owner','synthetic');
const restored=await adapter.restore(manifest);
const rejected:Record<string,boolean>={};for(mode of ['missing','tamper']){try{await adapter.restore(manifest);rejected[mode]=false;}catch{rejected[mode]=true;}}
console.log(JSON.stringify({provider:'synthetic_fake_remote',databaseConfigured:!!process.env.DATABASE_URL,events:restored.events.length,hashesEqual:stateHash(restored.state)===manifest.expectedStateHash,payloadFreeManifest:manifest.entries.every(e=>Object.keys(e).sort().join(',')==='blobId,eventId,textSha256'),missingRejected:rejected.missing,tamperRejected:rejected.tamper,orderIndependent:stateHash(restored.state)===manifest.expectedStateHash,projectionHash:stateHash(restored.state),limitations:'Remote fixture bodies generated inside child process; no old DB or parent payload supplied. Does not prove Walrus retrieval.'}));
