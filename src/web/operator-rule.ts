import type {TransactionObservation,Classification} from '../../contracts/domain-contracts';
import {scopeSchema} from '../domain/schema';
export interface RuleFields {minAmountAtomic:string;maxAmountAtomic:string;validFrom:string;validUntil:string;classification:Classification}
/** Scope identities come from the selected facts; the user explicitly chooses every bound. */
export function manualRulePayload(o:TransactionObservation,fields:RuleFields){
 if(o.complexity!=='simple'||!o.counterpartyRef||o.direction==='neutral'||o.evidence?.status==='failed')throw Error('Verified simple transfer identity is required; complex or unknown facts cannot create a reusable rule.');
 if(!['expense','internal_transfer','reimbursement','income'].includes(fields.classification))throw Error('Choose a supported reusable purpose.');
 const scope=scopeSchema.parse({chain:o.chain,walletRef:o.walletRef,counterpartyRef:o.counterpartyRef,coinType:o.coinType,direction:o.direction,minAmountAtomic:fields.minAmountAtomic,maxAmountAtomic:fields.maxAmountAtomic,validFrom:fields.validFrom,validUntil:fields.validUntil||null});
 return {sourceObservationId:o.observationId,scope,classification:fields.classification,category:fields.classification==='expense'?'tools':null};
}
