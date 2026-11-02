import {describe,it,expect} from 'vitest';
import type {SuiClientTypes} from '@mysten/sui/client';
import {bcs} from '@mysten/sui/bcs';
import {normalizeStructTag,normalizeSuiAddress,toBase64} from '@mysten/sui/utils';
import {normalizeTransaction,observationFromEvidence,proveSimpleTransfer,type IncludedTransaction,type SimpleTransferFailureReason,type TransactionEnvelope} from '../../src/adapters/tatum';
import {classifyObservation,emptyState,hashCanonical,reduceEvent,validateObservation,type LedgerState} from '../../src/domain';
import type {MemoryEvent,PolicyRule,TransactionObservation} from '../../contracts/domain-contracts';
import {sdkTransferFixture,sdkFailedFixture,sdkWallet,sdkRecipient,sdkCoinType,sdkObjectId,sdkDigest} from '../../evidence/g0/tatum-proof-probe';


// Synthetic data checked against the installed SDK, never recorded/live evidence.
const positive=sdkTransferFixture satisfies IncludedTransaction;
const failed=sdkFailedFixture satisfies IncludedTransaction;
const data=positive.Transaction.transaction;
const evaluatedAt='2026-10-26T12:00:00.000Z';
const otherCoin=normalizeStructTag('0x5::coin::USDC');
const sui=normalizeStructTag('0x2::sui::SUI');
type TransferCommand=Extract<SuiClientTypes.TransactionData['commands'][number],{TransferObjects:unknown}>['TransferObjects'];
function fixture(patch:Partial<SuiClientTypes.TransactionData>={},objectTypes:Record<string,string>=positive.Transaction.objectTypes){
 return {$kind:'Transaction',Transaction:{...positive.Transaction,transaction:{...structuredClone(data),...patch},objectTypes}} satisfies IncludedTransaction;
}
function envelope(result:IncludedTransaction):TransactionEnvelope {
 const evidence=normalizeTransaction(result,sdkDigest);
 const tx=result.$kind==='Transaction'?result.Transaction:result.FailedTransaction;
 return {evidence,transaction:tx.transaction,objectTypes:tx.objectTypes};
}
function observation(input:TransactionEnvelope,coinType=sdkCoinType){
 const proof=proveSimpleTransfer(input,sdkWallet,coinType);
 return observationFromEvidence(input.evidence,sdkWallet,sdkCoinType,{observationId:'synthetic-sdk-transfer',simpleTransferProof:proof});
}
function next(state:LedgerState,kind:MemoryEvent['kind'],payload:Record<string,unknown>):MemoryEvent {
 const confirmed=kind.endsWith('_confirmed');
 return {schemaVersion:'1.0',eventId:'shape-'+(state.memoryVersion+1),scopeId:state.scopeId,sequence:state.memoryVersion+1,kind,eventTime:evaluatedAt,recordedAt:evaluatedAt,inputRef:null,evidenceKind:'mainnet_observed',payload,parentEventIds:[],previousEventHash:state.events.length?hashCanonical(state.events.at(-1)):null,author:confirmed?'user':'system',confirmation:confirmed?'user_confirmed':'not_applicable'};
}
function rule(eventId:string):PolicyRule {
 return {ruleFamilyId:'shape-tools',ruleVersionId:'shape-tools-v1',revision:1,status:'active',userConfirmed:true,confirmationEventId:eventId,supersedesRuleVersionId:null,classification:'expense',category:'tools',scope:{chain:'sui:mainnet',walletRef:sdkWallet,counterpartyRef:sdkRecipient,coinType:sdkCoinType,direction:'out',minAmountAtomic:'5000000',maxAmountAtomic:'30000000',validFrom:'2026-10-26T00:00:00.000Z',validUntil:'2026-11-25T00:00:00.000Z'}};
}
function recorded(o:TransactionObservation){const state=emptyState();return reduceEvent(state,next(state,'observation_recorded',{observation:o}));}
function confirmedRule(state:LedgerState){const event=next(state,'rule_confirmed',{});event.payload={rule:rule(event.eventId)};return reduceEvent(state,event);}
function objectArgument(argument:TransferCommand['objects'][number]){
 return fixture({commands:[{TransferObjects:{objects:[argument],address:{Input:1}}}]});
}
function recipientArgument(argument:TransferCommand['address']){
 return fixture({commands:[{TransferObjects:{objects:[{Input:0}],address:argument}}]});
}
function objectInput(input:SuiClientTypes.TransactionData['inputs'][number]){return fixture({inputs:[input,data.inputs[1]!]});}
function recipientInput(input:SuiClientTypes.TransactionData['inputs'][number]){return fixture({inputs:[data.inputs[0]!,input]});}
function multipleRecipients(){
 const objectId=normalizeSuiAddress('0x11'),recipient=normalizeSuiAddress('0x6');
 const result=fixture({inputs:[...data.inputs,{Object:{ImmOrOwnedObject:{objectId,version:'1',digest:sdkDigest}}},{Pure:{bytes:bcs.Address.serialize(recipient).toBase64()}}],commands:[{TransferObjects:{objects:[{Input:0}],address:{Input:1}}},{TransferObjects:{objects:[{Input:2}],address:{Input:3}}}]},{...positive.Transaction.objectTypes,[objectId]:normalizeStructTag(`0x2::coin::Coin<${sdkCoinType}>`)});
 result.Transaction.balanceChanges=[{address:sdkWallet,coinType:sdkCoinType,amount:'-12000000'},{address:sdkRecipient,coinType:sdkCoinType,amount:'6000000'},{address:recipient,coinType:sdkCoinType,amount:'6000000'}];
 return result;
}
const negatives:Array<{name:string;result:()=>IncludedTransaction;reason:SimpleTransferFailureReason;coinType?:string}>=[
 {name:'extra MoveCall',result:()=>fixture({commands:[...data.commands,{MoveCall:{package:normalizeSuiAddress('0x2'),module:'coin',function:'value',typeArguments:[sdkCoinType],arguments:[{Input:0}]}}]}),reason:'unsupported_command_count'},
 {name:'multiple decoded recipients',result:multipleRecipients,reason:'unsupported_command_count'},
 {name:'SUI selection',result:()=>positive,coinType:sui,reason:'sui_not_supported'},
 {name:'failed execution',result:()=>failed,reason:'transaction_failed'},
 {name:'wrong sender',result:()=>fixture({sender:normalizeSuiAddress('0x9')}),reason:'sender_mismatch'},
 {name:'wrong configured full type',result:()=>positive,coinType:otherCoin,reason:'object_type_mismatch'},
 {name:'wrong object full type',result:()=>fixture({},{[sdkObjectId]:normalizeStructTag(`0x2::coin::Coin<${otherCoin}>`)}),reason:'object_type_mismatch'},
 {name:'bare coin type is not Coin<T>',result:()=>fixture({},{[sdkObjectId]:sdkCoinType}),reason:'object_type_mismatch'},
 {name:'SUI object is not selected non-SUI coin',result:()=>fixture({},{[sdkObjectId]:normalizeStructTag(`0x2::coin::Coin<${sui}>`)}),reason:'object_type_mismatch'},
 {name:'missing type binding',result:()=>fixture({},{}),reason:'object_type_missing'},
 {name:'absent included objectTypes at runtime',result:()=>{const result=fixture();Reflect.deleteProperty(result.Transaction,'objectTypes');return result;},reason:'object_types_unavailable'},
 {name:'unresolved object input',result:()=>objectInput({UnresolvedObject:{objectId:sdkObjectId}}),reason:'object_input_not_owned'},
 {name:'shared object input',result:()=>objectInput({Object:{SharedObject:{objectId:sdkObjectId,initialSharedVersion:'1',mutable:true}}}),reason:'object_input_not_owned'},
 {name:'receiving object input',result:()=>objectInput({Object:{Receiving:{objectId:sdkObjectId,version:'1',digest:sdkDigest}}}),reason:'object_input_not_owned'},
 {name:'object result argument',result:()=>objectArgument({Result:0}),reason:'object_argument_not_input'},
 {name:'object nested-result argument',result:()=>objectArgument({NestedResult:[0,0]}),reason:'object_argument_not_input'},
 {name:'gas coin argument',result:()=>objectArgument({GasCoin:true}),reason:'object_argument_not_input'},
 {name:'object out-of-range index',result:()=>objectArgument({Input:999}),reason:'object_input_index_invalid'},
 {name:'object negative index',result:()=>objectArgument({Input:-1}),reason:'object_input_index_invalid'},
 {name:'object fractional index',result:()=>objectArgument({Input:0.5}),reason:'object_input_index_invalid'},
 {name:'object NaN index',result:()=>objectArgument({Input:NaN}),reason:'object_input_index_invalid'},
 {name:'object unsafe integer index',result:()=>objectArgument({Input:Number.MAX_SAFE_INTEGER+1}),reason:'object_input_index_invalid'},
 {name:'invalid object ID',result:()=>objectInput({Object:{ImmOrOwnedObject:{objectId:'0xz',version:'1',digest:sdkDigest}}}),reason:'object_reference_invalid'},
 {name:'invalid object version',result:()=>objectInput({Object:{ImmOrOwnedObject:{objectId:sdkObjectId,version:'-1',digest:sdkDigest}}}),reason:'object_reference_invalid'},
 {name:'invalid object digest',result:()=>objectInput({Object:{ImmOrOwnedObject:{objectId:sdkObjectId,version:'1',digest:'not-a-digest'}}}),reason:'object_reference_invalid'},
 {name:'duplicate coin object',result:()=>fixture({commands:[{TransferObjects:{objects:[{Input:0},{Input:0}],address:{Input:1}}}]}),reason:'duplicate_object'},
 {name:'empty object transfer',result:()=>fixture({commands:[{TransferObjects:{objects:[],address:{Input:1}}}]}),reason:'transfer_objects_invalid'},
 {name:'recipient result argument',result:()=>recipientArgument({Result:0}),reason:'recipient_argument_not_input'},
 {name:'recipient gas argument',result:()=>recipientArgument({GasCoin:true}),reason:'recipient_argument_not_input'},
 {name:'recipient nested-result argument',result:()=>recipientArgument({NestedResult:[0,0]}),reason:'recipient_argument_not_input'},
 {name:'recipient out-of-range index',result:()=>recipientArgument({Input:999}),reason:'recipient_input_index_invalid'},
 {name:'recipient negative index',result:()=>recipientArgument({Input:-1}),reason:'recipient_input_index_invalid'},
 {name:'recipient fractional index',result:()=>recipientArgument({Input:1.5}),reason:'recipient_input_index_invalid'},
 {name:'unresolved recipient',result:()=>recipientInput({UnresolvedPure:{value:sdkRecipient}}),reason:'recipient_not_pure'},
 {name:'recipient points at an object',result:()=>recipientArgument({Input:0}),reason:'recipient_not_pure'},
 {name:'text recipient instead of BCS bytes',result:()=>recipientInput({Pure:{bytes:sdkRecipient}}),reason:'recipient_bytes_invalid'},
 {name:'empty recipient bytes',result:()=>recipientInput({Pure:{bytes:''}}),reason:'recipient_bytes_invalid'},
 {name:'truncated recipient bytes',result:()=>recipientInput({Pure:{bytes:toBase64(new Uint8Array(31))}}),reason:'recipient_bytes_invalid'},
 {name:'recipient bytes with trailing data',result:()=>recipientInput({Pure:{bytes:toBase64(new Uint8Array(33))}}),reason:'recipient_bytes_invalid'},
 {name:'noncanonical recipient base64',result:()=>recipientInput({Pure:{bytes:data.inputs[1]!.Pure!.bytes+'\n'}}),reason:'recipient_bytes_invalid'},
 {name:'self recipient',result:()=>recipientInput({Pure:{bytes:bcs.Address.serialize(sdkWallet).toBase64()}}),reason:'recipient_is_sender'},
 {name:'no command',result:()=>fixture({commands:[]}),reason:'unsupported_command_count'},
 {name:'single MoveCall instead of transfer',result:()=>fixture({commands:[{MoveCall:{package:normalizeSuiAddress('0x2'),module:'coin',function:'value',typeArguments:[sdkCoinType],arguments:[{Input:0}]}}]}),reason:'unsupported_command'},
];

describe('synthetic published-SDK structural transfer proof',()=>{
 it('normalizes → proves → observes → needs context → confirmed tools rule, and is explicitly labelable',()=>{
  const input=envelope(positive),proof=proveSimpleTransfer(input,sdkWallet,sdkCoinType);
  expect(proof).toEqual({ok:true,digest:sdkDigest,wallet:sdkWallet,coinType:sdkCoinType,recipient:sdkRecipient});
  const o=observation(input);
  expect(validateObservation(o)).toMatchObject({complexity:'simple',direction:'out',amountAtomic:'12000000',counterpartyRef:sdkRecipient,decimals:null});
  expect(classifyObservation(emptyState(),o,evaluatedAt)).toMatchObject({classification:'needs_context',category:null,basis:'needs_context'});
  const state=recorded(o);
  expect(classifyObservation(state,o,evaluatedAt).classification).toBe('needs_context');
  const labeled=reduceEvent(state,next(state,'label_confirmed',{observationId:o.observationId,classification:'expense',category:'tools'}));
  expect(labeled.labels[o.observationId]).toMatchObject({classification:'expense',category:'tools',basis:'user_label'});
  const ruled=confirmedRule(state);
  expect(classifyObservation(ruled,o,evaluatedAt)).toMatchObject({classification:'expense',category:'tools',basis:'confirmed_rule'});
  const unconfirmed=structuredClone(ruled);unconfirmed.rules['shape-tools-v1']!.userConfirmed=false;
  expect(classifyObservation(unconfirmed,o,evaluatedAt).classification).toBe('needs_context');
  const event=next(state,'rule_confirmed',{});event.payload={rule:{...rule(event.eventId),userConfirmed:false}};
  expect(()=>reduceEvent(state,event)).toThrow('Rule not confirmed');
  expect(()=>validateObservation({...o,transaction:input.transaction})).toThrow();
  expect(()=>validateObservation({...o,objectTypes:input.objectTypes})).toThrow();
  expect(Object.keys(o.evidence!)).not.toContain('transaction');
 });
 it('supports several distinct exact-type owned coins sent by the sole command to the same recipient',()=>{
  const objectId=normalizeSuiAddress('0x11');
  const result=fixture({inputs:[...data.inputs,{Object:{ImmOrOwnedObject:{objectId,version:1,digest:sdkDigest}}}],commands:[{TransferObjects:{objects:[{Input:0},{Input:2}],address:{Input:1}}}]},{...positive.Transaction.objectTypes,[objectId]:normalizeStructTag(`0x2::coin::Coin<${sdkCoinType}>`)});
  expect(observation(envelope(result))).toMatchObject({complexity:'simple',counterpartyRef:sdkRecipient,decimals:null});
 });
 it.each(negatives)('$name fails closed with a stable reason and cannot be labelled',({result,reason,coinType})=>{
  const input=envelope(result());
  expect(proveSimpleTransfer(input,sdkWallet,coinType??sdkCoinType)).toEqual({ok:false,reason});
  const o=observation(input,coinType);
  expect(o).toMatchObject({complexity:'complex',counterpartyRef:null,decimals:null});
  const state=recorded(o);
  expect(classifyObservation(confirmedRule(state),o,evaluatedAt).classification).toBe('needs_context');
  expect(()=>reduceEvent(state,next(state,'label_confirmed',{observationId:o.observationId,classification:'expense',category:'tools'}))).toThrow('Invalid transaction cannot be labeled');
 });
 it('rejects malformed/missing serialized data and conflicting enum metadata',()=>{
  const input=envelope(positive);Reflect.deleteProperty(input,'transaction');
  expect(proveSimpleTransfer(input,sdkWallet,sdkCoinType)).toEqual({ok:false,reason:'transaction_data_invalid'});
  const conflicting=fixture();Reflect.set(conflicting.Transaction.transaction.commands[0]!,'$kind','MoveCall');
  expect(proveSimpleTransfer(envelope(conflicting),sdkWallet,sdkCoinType)).toEqual({ok:false,reason:'unsupported_command'});
  const wrongDigest=fixture({digest:'different'});
  expect(proveSimpleTransfer(envelope(wrongDigest),sdkWallet,sdkCoinType)).toEqual({ok:false,reason:'transaction_digest_mismatch'});
  expect(proveSimpleTransfer(envelope(positive),'0xz',sdkCoinType)).toEqual({ok:false,reason:'invalid_wallet'});
  expect(proveSimpleTransfer(envelope(positive),sdkWallet,'not-a-type')).toEqual({ok:false,reason:'invalid_coin_type'});
 });
 it('keeps downstream balance/status/proof-identity checks and timestamp requirements',()=>{
  const input=envelope(positive),proof=proveSimpleTransfer(input,sdkWallet,sdkCoinType);
  if(!proof.ok)throw Error('Positive synthetic fixture must be provable');
  const observe=(evidence=input.evidence,simpleTransferProof=proof)=>observationFromEvidence(evidence,sdkWallet,sdkCoinType,{observationId:'synthetic-consistency',simpleTransferProof});
  for(const change of [{digest:'other'},{wallet:normalizeSuiAddress('0x9')},{coinType:otherCoin},{recipient:normalizeSuiAddress('0x6')}])expect(observe(input.evidence,{...proof,...change}).complexity).toBe('complex');
  expect(observe({...input.evidence,status:'failed'}).complexity).toBe('complex');
  expect(observe({...input.evidence,sender:normalizeSuiAddress('0x9')}).complexity).toBe('complex');
  expect(observe({...input.evidence,balanceChanges:input.evidence.balanceChanges.map(b=>b.address===sdkRecipient?{...b,amountAtomic:'11999999'}:b)}).complexity).toBe('complex');
  expect(observe({...input.evidence,balanceChanges:[...input.evidence.balanceChanges,{address:sdkWallet,coinType:otherCoin,amountAtomic:'-1'}]}).complexity).toBe('complex');
  expect(observe({...input.evidence,balanceChanges:[...input.evidence.balanceChanges,{address:sdkWallet,coinType:normalizeStructTag('0x9::sui::SUI'),amountAtomic:'-1'}]}).complexity).toBe('complex');
  expect(observe({...input.evidence,balanceChanges:input.evidence.balanceChanges.map(b=>b.coinType===sdkCoinType?{...b,amountAtomic:(-BigInt(b.amountAtomic)).toString()}:b)}).complexity).toBe('complex');
  expect(()=>observe({...input.evidence,timestampMs:null})).toThrow('TRANSACTION_TIME_UNAVAILABLE');
 });
 it('normalization rejects digest/status disagreement before an envelope may be consumed',()=>{
  expect(()=>normalizeTransaction(positive,'wrong-digest')).toThrow('DIGEST_MISMATCH');
  const wrongEffects={$kind:'Transaction',Transaction:{...positive.Transaction,effects:{...positive.Transaction.effects,transactionDigest:'different'}}} satisfies IncludedTransaction;
  expect(()=>normalizeTransaction(wrongEffects,sdkDigest)).toThrow('DIGEST_MISMATCH');
  const inconsistent={$kind:'Transaction',Transaction:{...positive.Transaction,effects:failed.FailedTransaction.effects}} satisfies IncludedTransaction;
  expect(()=>normalizeTransaction(inconsistent,sdkDigest)).toThrow('STATUS_MISMATCH');
  const wrongBranch={$kind:'FailedTransaction',FailedTransaction:positive.Transaction} satisfies IncludedTransaction;
  expect(()=>normalizeTransaction(wrongBranch,sdkDigest)).toThrow('STATUS_MISMATCH');
 });
});
