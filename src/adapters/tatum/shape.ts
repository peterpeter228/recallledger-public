import type {SuiClientTypes} from '@mysten/sui/client';
import {bcs} from '@mysten/sui/bcs';
import {fromBase64,isValidStructTag,isValidSuiAddress,isValidTransactionDigest,normalizeStructTag,normalizeSuiAddress,toBase64} from '@mysten/sui/utils';
import type {ChainTransactionEvidence} from '../../../contracts/domain-contracts';

// Server-internal same-result data. Only evidence/proof may leave the adapter boundary.
export interface TransactionEnvelope {
 evidence:ChainTransactionEvidence;
 transaction:SuiClientTypes.TransactionData;
 objectTypes:Record<string,string>;
}
export type SimpleTransferFailureReason=
 | 'transaction_failed' | 'invalid_wallet' | 'invalid_coin_type' | 'sui_not_supported'
 | 'transaction_data_invalid' | 'transaction_digest_mismatch' | 'sender_mismatch'
 | 'unsupported_command_count' | 'unsupported_command' | 'transfer_objects_invalid'
 | 'object_types_unavailable' | 'object_argument_not_input' | 'object_input_index_invalid'
 | 'object_input_not_owned' | 'object_reference_invalid' | 'duplicate_object'
 | 'object_type_missing' | 'object_type_mismatch'
 | 'recipient_argument_not_input' | 'recipient_input_index_invalid' | 'recipient_not_pure'
 | 'recipient_bytes_invalid' | 'recipient_is_sender';
export type SimpleTransferProof=
 | {ok:true;digest:string;wallet:string;coinType:string;recipient:string}
 | {ok:false;reason:SimpleTransferFailureReason};

// Serialized declarations omit $kind; gRPC adds it. Accept either, never conflicting variants.
function hasVariant(value:object,kind:string):boolean {
 if(!Object.hasOwn(value,kind))return false;
 if('$kind' in value&&value.$kind!==kind)return false;
 return Object.keys(value).every(key=>key===kind||key==='$kind');
}
function address(value:unknown):string|null {
 if(typeof value!=='string'||!value)return null;
 const normalized=normalizeSuiAddress(value);
 return isValidSuiAddress(normalized)?normalized:null;
}
function structTag(value:unknown):string|null {
 if(typeof value!=='string'||!isValidStructTag(value))return null;
 return normalizeStructTag(value);
}
function validVersion(value:unknown):boolean {
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0;
 return typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(value)&&BigInt(value)<=18446744073709551615n;
}
function validIndex(value:unknown,inputs:unknown[]):value is number {
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<inputs.length;
}

export function proveSimpleTransfer({evidence,transaction,objectTypes}:TransactionEnvelope,wallet:string,coinType:string):SimpleTransferProof {
 if(evidence.status!=='success')return {ok:false,reason:'transaction_failed'};
 const sender=address(wallet);
 if(!sender)return {ok:false,reason:'invalid_wallet'};
 const asset=structTag(coinType);
 if(!asset)return {ok:false,reason:'invalid_coin_type'};
 if(asset===normalizeStructTag('0x2::sui::SUI'))return {ok:false,reason:'sui_not_supported'};
 if(typeof transaction!=='object'||transaction===null||transaction.version!==2||!Array.isArray(transaction.commands)||!Array.isArray(transaction.inputs))return {ok:false,reason:'transaction_data_invalid'};
 if(transaction.digest!=null&&transaction.digest!==evidence.transactionDigest)return {ok:false,reason:'transaction_digest_mismatch'};
 if(address(transaction.sender)!==sender||evidence.sender!==sender)return {ok:false,reason:'sender_mismatch'};
 if(transaction.commands.length!==1)return {ok:false,reason:'unsupported_command_count'};
 const command=transaction.commands[0];
 if(typeof command!=='object'||command===null||!('TransferObjects' in command)||!hasVariant(command,'TransferObjects'))return {ok:false,reason:'unsupported_command'};
 const transfer=command.TransferObjects;
 if(typeof transfer!=='object'||transfer===null||!Array.isArray(transfer.objects)||transfer.objects.length===0||Object.keys(transfer).some(key=>key!=='objects'&&key!=='address'))return {ok:false,reason:'transfer_objects_invalid'};
 if(typeof objectTypes!=='object'||objectTypes===null||Array.isArray(objectTypes))return {ok:false,reason:'object_types_unavailable'};
 const expectedObjectType=normalizeStructTag(`0x2::coin::Coin<${asset}>`);
 const objects=new Set<string>();
 for(const argument of transfer.objects){
  if(typeof argument!=='object'||argument===null||!('Input' in argument)||!hasVariant(argument,'Input'))return {ok:false,reason:'object_argument_not_input'};
  const index=argument.Input;
  if(!validIndex(index,transaction.inputs))return {ok:false,reason:'object_input_index_invalid'};
  const input=transaction.inputs[index];
  const object=typeof input==='object'&&input!==null&&'Object' in input&&hasVariant(input,'Object')?input.Object:undefined;
  const owned=typeof object==='object'&&object!==null&&'ImmOrOwnedObject' in object&&hasVariant(object,'ImmOrOwnedObject')?object.ImmOrOwnedObject:undefined;
  if(typeof owned!=='object'||owned===null)return {ok:false,reason:'object_input_not_owned'};
  const objectId=address(owned.objectId);
  if(!objectId||!validVersion(owned.version)||typeof owned.digest!=='string'||!isValidTransactionDigest(owned.digest)||Object.keys(owned).some(key=>key!=='objectId'&&key!=='version'&&key!=='digest'))return {ok:false,reason:'object_reference_invalid'};
  if(objects.has(objectId))return {ok:false,reason:'duplicate_object'};
  objects.add(objectId);
  if(!Object.hasOwn(objectTypes,objectId))return {ok:false,reason:'object_type_missing'};
  if(structTag(objectTypes[objectId])!==expectedObjectType)return {ok:false,reason:'object_type_mismatch'};
 }
 if(typeof transfer.address!=='object'||transfer.address===null||!('Input' in transfer.address)||!hasVariant(transfer.address,'Input'))return {ok:false,reason:'recipient_argument_not_input'};
 const recipientIndex=transfer.address.Input;
 if(!validIndex(recipientIndex,transaction.inputs))return {ok:false,reason:'recipient_input_index_invalid'};
 const recipientInput=transaction.inputs[recipientIndex];
 const pure=typeof recipientInput==='object'&&recipientInput!==null&&'Pure' in recipientInput&&hasVariant(recipientInput,'Pure')?recipientInput.Pure:undefined;
 if(typeof pure!=='object'||pure===null)return {ok:false,reason:'recipient_not_pure'};
 let recipient:string;
 try{
  if(typeof pure.bytes!=='string'||Object.keys(pure).some(key=>key!=='bytes'))return {ok:false,reason:'recipient_bytes_invalid'};
  const bytes=fromBase64(pure.bytes);
  if(bytes.length!==32||toBase64(bytes)!==pure.bytes)return {ok:false,reason:'recipient_bytes_invalid'};
  recipient=bcs.Address.parse(bytes);
 }catch{return {ok:false,reason:'recipient_bytes_invalid'};}
 if(recipient===sender)return {ok:false,reason:'recipient_is_sender'};
 return {ok:true,digest:evidence.transactionDigest,wallet:sender,coinType:asset,recipient};
}
