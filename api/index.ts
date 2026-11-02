import type {IncomingMessage,ServerResponse} from 'node:http';
import {finished} from 'node:stream/promises';
import {buildApp} from '../src/server/app.js';
import type {PublicEvidence} from '../src/domain/public-evidence.js';
import bundledPublicEvidence from '../src/server/generated/public-evidence.json' with {type:'json'};

// The build step writes only the validator's sanitized PublicEvidence result here.
const bundledEvidence=bundledPublicEvidence as PublicEvidence;

export function createRecordedHandler(publicEvidence:PublicEvidence=bundledEvidence){
 const app=buildApp({publicEvidence,writesEnabled:false,operatorToken:undefined,operatorScope:undefined,store:undefined,inspect:undefined,propose:undefined,restoreCheck:undefined,secureCookies:true});
 const ready=app.ready();
 return async function recordedHandler(request:IncomingMessage,response:ServerResponse):Promise<void>{
  await ready;
  const completion=finished(response,{cleanup:true});
  // Fastify's native serverless bridge: ready first; never listen on a port.
  app.server.emit('request',request,response);
  await completion;
 };
}

export default createRecordedHandler();
