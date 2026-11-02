import {Pool} from 'pg';
import {setTimeout as delay} from 'node:timers/promises';
import {compileDemoEvents,DEMO_SCOPE} from '../src/domain/demo';
import {eventIntegrity,canonicalize,eventText,replayEvents} from '../src/domain';
import {PostgresStore} from '../src/server/store';
import {processOutboxOnce} from '../src/server/outbox';
import {createMemoryAdapter} from '../src/adapters/memory';
import {cliArguments,reportCliError,requiredDatabaseUrl,requiredMemoryConfig} from './cli-evidence';

try{
 const {flags}=cliArguments(process.argv.slice(2),[],['--apply']);
 const scope=process.env.OPERATOR_SCOPE??DEMO_SCOPE,events=structuredClone(compileDemoEvents());
 for(let index=0;index<events.length;index++){
  events[index]!.scopeId=scope;events[index]!.previousEventHash=index?eventIntegrity(events[index-1]!).eventHash:null;
 }
 replayEvents(events);
 if(!flags.has('--apply')){
  console.log(JSON.stringify({mode:'dry_run',dataOrigin:'synthetic',eventCount:events.length,events:events.map(event=>({sequence:event.sequence,kind:event.kind,...eventIntegrity(event)})),mainnetWritesPerformed:0,notice:'Plan only, not mainnet memory receipts. Reuses stable event IDs, payloads and operation keys.'},null,2));
 }else{
  const databaseUrl=requiredDatabaseUrl(),config=requiredMemoryConfig();
  if(process.env.ALLOW_MAINNET_MEMORY_WRITES!=='true'||process.env.MEMWAL_OWNER_HISTORY_CONFIRMED!=='true')throw Error('BLOCKED: EXPLICIT_WRITE_APPROVAL_REQUIRED; no remote request performed');
  const scopeLimit=Number(process.env.MAINNET_MEMORY_WRITE_LIMIT??20),ownerLimit=Number(process.env.OWNER_MEMORY_INVENTORY_LIMIT??40);
  if(!Number.isInteger(scopeLimit)||scopeLimit<12||scopeLimit>20||!Number.isInteger(ownerLimit)||ownerLimit<1||ownerLimit>40)throw Error('INVALID_SEED_BUDGET');
  const pool=new Pool({connectionString:databaseUrl});
  try{
   const store=new PostgresStore(pool,{scopeLimit,ownerLimit}),memory=createMemoryAdapter({...config,writesEnabled:true});
   await store.ensureScope(scope,config.ownerAddress,config.namespace);
   for(const event of events){
    const integrity=eventIntegrity(event);
    const result=await store.enqueue(scope,`seed:${scope}:${event.eventId}`,integrity.eventHash,event.sequence-1,()=>({event,canonicalJson:canonicalize(event),...integrity,memoryText:eventText(event)}));
    let done=false;
    for(let attempt=0;attempt<30;attempt++){
     const operation=await store.operation(scope,result.operationId);
     if(!operation)throw Error('ORIGINAL_OPERATION_MISSING');
     if(operation.state==='done'){done=true;break;}
     if(['unknown','failed','blocked'].includes(operation.state))throw Error('ORIGINAL_OPERATION_RECONCILIATION_REQUIRED');
     await processOutboxOnce(store,{status:(jobId,expected)=>memory.status(jobId,expected),submit:async input=>{
      if((await memory.listAll()).length>=ownerLimit)throw Error('OWNER_INVENTORY_LIMIT');
      return memory.submit(input);
     }},scope);
     // Observe the last bounded poll as well; never allocate the next event first.
     if((await store.operation(scope,result.operationId))?.state==='done'){done=true;break;}
     await delay(2000);
    }
    if(!done)throw Error('ORIGINAL_JOB_PENDING_RECONCILIATION_REQUIRED');
    console.log(`${event.eventId}: verified durable`);
   }
  }finally{await pool.end();}
 }
}catch(error){reportCliError(error);}
