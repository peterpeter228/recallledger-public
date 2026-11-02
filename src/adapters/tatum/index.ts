import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { SuiClientTypes } from '@mysten/sui/client';
import { normalizeSuiAddress, normalizeStructTag, isValidTransactionDigest } from '@mysten/sui/utils';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { ChannelCredentials } from '@grpc/grpc-js';
import type { ChainTransactionEvidence,TransactionObservation } from '../../../contracts/domain-contracts';
import { evidenceSchema } from '../../domain/schema';
import type {SimpleTransferProof,TransactionEnvelope} from './shape';
export {proveSimpleTransfer} from './shape';
export type {SimpleTransferProof,SimpleTransferFailureReason,TransactionEnvelope} from './shape';
export type IncludedTransaction=SuiClientTypes.TransactionResult<{effects:true;transaction:true;balanceChanges:true;objectTypes:true}>;
export function normalizeTransaction(result:IncludedTransaction,digest:string):ChainTransactionEvidence {
 const tx=result.$kind==='Transaction'?result.Transaction:result.FailedTransaction;
 if(tx.digest!==digest||tx.effects.transactionDigest!==digest)throw Error('DIGEST_MISMATCH');
 if(tx.status.success!==(result.$kind==='Transaction')||tx.effects.status.success!==tx.status.success)throw Error('STATUS_MISMATCH');
 return evidenceSchema.parse({network:'mainnet',transactionDigest:tx.digest,status:tx.status.success?'success':'failed',checkpoint:tx.checkpoint,timestampMs:tx.timestampMs,sender:tx.transaction.sender?normalizeSuiAddress(tx.transaction.sender):null,balanceChanges:tx.balanceChanges.map(e=>({address:normalizeSuiAddress(e.address),coinType:normalizeStructTag(e.coinType),amountAtomic:e.amount})),gas:tx.effects.gasUsed,fetchedAt:new Date().toISOString(),provider:'tatum',transport:'grpc'});
}
export function observationFromEvidence(e:ChainTransactionEvidence,wallet:string,coinType:string,options:{observationId:string;decimals?:number|null;simpleTransferProof?:SimpleTransferProof}):TransactionObservation{
 wallet=normalizeSuiAddress(wallet);coinType=normalizeStructTag(coinType);
 const sums=new Map<string,bigint>();for(const b of e.balanceChanges){const key=b.address+'|'+b.coinType;sums.set(key,(sums.get(key)??0n)+BigInt(b.amountAtomic));}
 const amount=sums.get(wallet+'|'+coinType);if(amount===undefined)throw Error('WALLET_ASSET_NOT_AFFECTED');
 const other=e.balanceChanges.filter(b=>b.address!==wallet&&b.coinType===coinType&&BigInt(b.amountAtomic)!==0n);
 const suiType=normalizeStructTag('0x2::sui::SUI');
 const walletAssets=new Set(e.balanceChanges.filter(b=>b.address===wallet&&BigInt(b.amountAtomic)!==0n&&b.coinType!==suiType).map(b=>b.coinType));
 const sui=coinType===suiType;
 // Net balances alone never establish payment intent or PTB transfer semantics.
 const proof=options.simpleTransferProof;
 const simpleTransferVerified=proof?.ok===true&&proof.digest===e.transactionDigest&&proof.wallet===wallet&&e.sender===wallet&&proof.coinType===coinType&&proof.recipient===other[0]?.address;
 const simple=simpleTransferVerified&&e.status==='success'&&!sui&&amount<0n&&walletAssets.size===1&&other.length===1&&BigInt(other[0]!.amountAtomic)===-amount;
 if(e.timestampMs===null)throw Error('TRANSACTION_TIME_UNAVAILABLE');
 return {observationId:options.observationId,dataOrigin:'live',chain:'sui:mainnet',transactionRef:e.transactionDigest,walletRef:wallet,counterpartyRef:simple?other[0]!.address:null,coinType,decimals:options.decimals??null,direction:amount<0n?'out':amount>0n?'in':'neutral',amountAtomic:(amount<0n?-amount:amount).toString(),eventTime:new Date(e.timestampMs).toISOString(),complexity:simple?'simple':'complex',evidence:e};
}
export function providerError(error:unknown):string{
 const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';
 if(['16','UNAUTHENTICATED','7','PERMISSION_DENIED'].includes(code))return 'provider_auth_failed';
 if(['8','RESOURCE_EXHAUSTED'].includes(code))return 'provider_rate_limited';
 if(['5','NOT_FOUND'].includes(code))return 'transaction_not_found';
 return 'provider_unavailable';
}
export function createTatumAdapter(apiKey:string){
 if(!apiKey)throw Error('provider_not_configured');
 const transport=new GrpcTransport({host:'sui-mainnet-grpc.gateway.tatum.io:443',channelCredentials:ChannelCredentials.createSsl(),meta:{'x-api-key':apiKey},timeout:10000});
 const client=new SuiGrpcClient({network:'mainnet',transport});
 return {async getTransaction(digest:string):Promise<TransactionEnvelope>{
  if(!isValidTransactionDigest(digest))throw Error('INVALID_DIGEST');
  let result:IncludedTransaction;
  try{result=await client.getTransaction({digest,include:{effects:true,transaction:true,balanceChanges:true,objectTypes:true},signal:AbortSignal.timeout(10000)});}catch(error){throw Error(providerError(error));}
  const evidence=normalizeTransaction(result,digest);
  const tx=result.$kind==='Transaction'?result.Transaction:result.FailedTransaction;
  return {evidence,transaction:tx.transaction,objectTypes:tx.objectTypes};
 }};
}
