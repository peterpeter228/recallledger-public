// Offline synthetic fixture and compile-only include probe for @mysten/sui@2.37.0.
// No client is constructed and no provider request is executed here.
import type {SuiClientTypes} from '@mysten/sui/client';
import type {SuiGrpcClient} from '@mysten/sui/grpc';
import {bcs} from '@mysten/sui/bcs';
import {fromBase64,normalizeStructTag,normalizeSuiAddress} from '@mysten/sui/utils';

type IncludedTransaction=SuiClientTypes.TransactionResult<{effects:true;transaction:true;balanceChanges:true;objectTypes:true}>;
export const sdkInclude={effects:true,transaction:true,balanceChanges:true,objectTypes:true} as const satisfies SuiClientTypes.TransactionInclude;
export const sdkWallet=normalizeSuiAddress('0x1');
export const sdkRecipient=normalizeSuiAddress('0x3');
export const sdkCoinType=normalizeStructTag('0x4::coin::USDC');
export const sdkObjectId=normalizeSuiAddress('0x10');
export const sdkDigest='11111111111111111111111111111111';
// The published serialized type is EnumInputShape (no declared $kind), while
// grpc conversion adds $kind at runtime. Check that runtime-shaped value by
// structural assignment, without casts or dropping its enum metadata.
const serializedTransaction={
 version:2 as const,sender:sdkWallet,expiration:{$kind:'None',None:true as const},
 gasData:{budget:'1000000',price:'1',owner:sdkWallet,payment:[]},
 inputs:[
  {$kind:'Object',Object:{$kind:'ImmOrOwnedObject',ImmOrOwnedObject:{objectId:sdkObjectId,version:'1',digest:sdkDigest}}},
  {$kind:'Pure',Pure:{bytes:bcs.Address.serialize(sdkRecipient).toBase64()}},
 ],
 commands:[{$kind:'TransferObjects',TransferObjects:{objects:[{$kind:'Input',Input:0}],address:{$kind:'Input',Input:1}}}],
};
serializedTransaction satisfies SuiClientTypes.TransactionData;
export const sdkTransferFixture={
 $kind:'Transaction',
 Transaction:{
  digest:sdkDigest,signatures:[],epoch:'1',checkpoint:'1',timestampMs:1793016000000,
  status:{success:true,error:null},
  effects:{
   bcs:null,version:2,status:{success:true,error:null},transactionDigest:sdkDigest,
   gasUsed:{computationCost:'1',storageCost:'2',storageRebate:'0',nonRefundableStorageFee:'0'},
   gasObject:null,eventsDigest:null,dependencies:[],lamportVersion:'2',unchangedConsensusObjects:[],auxiliaryDataDigest:null,
   changedObjects:[{objectId:sdkObjectId,inputState:'Exists',inputVersion:'1',inputDigest:sdkDigest,inputOwner:{$kind:'AddressOwner',AddressOwner:sdkWallet},outputState:'ObjectWrite',outputVersion:'2',outputDigest:sdkDigest,outputOwner:{$kind:'AddressOwner',AddressOwner:sdkRecipient},idOperation:'None'}],
  },
  transaction:serializedTransaction,
  objectTypes:{[sdkObjectId]:normalizeStructTag(`0x2::coin::Coin<${sdkCoinType}>`)},
  balanceChanges:[{address:sdkWallet,coinType:sdkCoinType,amount:'-12000000'},{address:sdkRecipient,coinType:sdkCoinType,amount:'12000000'},{address:sdkWallet,coinType:'0x2::sui::SUI',amount:'-3'}],
  events:undefined,bcs:undefined,
 },
} satisfies IncludedTransaction;

const failedStatus={success:false,error:{$kind:'Unknown',Unknown:null,message:'Synthetic failed transaction'}} as const satisfies SuiClientTypes.ExecutionStatus;
export const sdkFailedFixture={
 $kind:'FailedTransaction',
 FailedTransaction:{...sdkTransferFixture.Transaction,status:failedStatus,effects:{...sdkTransferFixture.Transaction.effects,status:failedStatus}},
} satisfies IncludedTransaction;

export async function compileIncludeProbe(client:SuiGrpcClient,digest:string):Promise<IncludedTransaction>{
 const result=await client.getTransaction({digest,include:sdkInclude});
 const tx=result.$kind==='Transaction'?result.Transaction:result.FailedTransaction;
 const data:SuiClientTypes.TransactionData=tx.transaction;
 const types:Record<string,string>=tx.objectTypes;
 const recipient=bcs.Address.parse(fromBase64(sdkTransferFixture.Transaction.transaction.inputs[1]!.Pure!.bytes));
 void data.commands;void data.inputs;void types;void recipient;
 return result;
}
