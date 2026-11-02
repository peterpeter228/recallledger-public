import { sha256 } from '@noble/hashes/sha2.js';
import type { MemoryEvent } from '../../contracts/domain-contracts';
import jcs from 'canonicalize';
// Reject values outside I-JSON before delegating canonical serialization to RFC8785 library.
function validateJson(value:unknown):void {
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='string'){for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('Invalid Unicode surrogate');}else if(n>=0xdc00&&n<=0xdfff)throw Error('Invalid Unicode surrogate');}return;}
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Non-finite JSON number');return;}
 if(Array.isArray(value)){for(const v of value)validateJson(v);return;}
 if(typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){for(const [k,v]of Object.entries(value)){validateJson(k);validateJson(v);}return;}
 throw Error('Not an I-JSON value');
}
export function canonicalize(value:unknown):string {validateJson(value);const result=jcs(value);if(typeof result!=='string')throw Error('Not an I-JSON value');return result;}
export function sha256Text(value:string):string{return Array.from(sha256(new TextEncoder().encode(value)),b=>b.toString(16).padStart(2,'0')).join('');}
export const hashCanonical=(value:unknown)=>sha256Text(canonicalize(value));
export const eventText=(event:MemoryEvent)=>'RecallLedger event v1\n'+canonicalize(event);
export const eventIntegrity=(event:MemoryEvent)=>({eventId:event.eventId,eventHash:hashCanonical(event),textSha256:sha256Text(eventText(event))});
