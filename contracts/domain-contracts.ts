/** RecallLedger project contracts, design v1.0 (2026-10-26).
 * This file is not a third-party SDK declaration or a completed implementation.
 * Add runtime validation, tests and adapters before accepting external data.
 */
export type AtomicAmount = string;
export type Classification =
  | 'needs_context' | 'expense' | 'internal_transfer'
  | 'reimbursement' | 'refund' | 'income';
export type DataOrigin = 'synthetic' | 'live' | 'recorded_live';
export type EventKind =
  | 'preference_confirmed' | 'observation_recorded' | 'label_confirmed'
  | 'rule_confirmed' | 'decision_recorded' | 'correction_confirmed'
  | 'refund_link_confirmed' | 'rule_revoked';

export interface ChainTransactionEvidence {
  network: 'mainnet';
  transactionDigest: string;
  status: 'success' | 'failed';
  checkpoint: string | null;
  timestampMs: number | null;
  sender: string | null;
  // Signed net changes from chain evidence; do not use these as rule amounts directly.
  balanceChanges: Array<{ address: string; coinType: string; amountAtomic: string }>;
  gas: null | {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
    nonRefundableStorageFee: string;
  };
  fetchedAt: string;
  provider: 'tatum';
  transport: 'grpc';
}

export interface TransactionObservation {
  observationId: string;
  dataOrigin: DataOrigin;
  chain: 'sui:mainnet' | 'sui:fixture';
  transactionRef: string;
  walletRef: string;
  counterpartyRef: string | null;
  coinType: string;
  decimals: number | null;
  direction: 'in' | 'out' | 'neutral';
  amountAtomic: AtomicAmount; // Non-negative absolute magnitude; direction carries the sign.
  eventTime: string;
  complexity: 'simple' | 'complex';
  evidence: ChainTransactionEvidence | null;
}

export interface RuleScope {
  chain: 'sui:mainnet' | 'sui:fixture';
  walletRef: string;
  counterpartyRef: string;
  coinType: string;
  direction: 'in' | 'out';
  minAmountAtomic: AtomicAmount;
  maxAmountAtomic: AtomicAmount;
  validFrom: string;
  validUntil: string | null;
}

export interface PolicyRule {
  ruleFamilyId: string;
  ruleVersionId: string;
  revision: number;
  status: 'proposed' | 'active' | 'superseded' | 'revoked';
  scope: RuleScope;
  classification: Exclude<Classification, 'needs_context' | 'refund'>;
  category: string | null;
  confirmationEventId: string;
  supersedesRuleVersionId: string | null;
  userConfirmed: boolean;
}

export interface MemoryEvent {
  schemaVersion: '1.0';
  eventId: string;
  scopeId: string;
  sequence: number;
  kind: EventKind;
  eventTime: string;
  recordedAt: string;
  inputRef: string | null;
  evidenceKind: 'synthetic' | 'mainnet_observed';
  payload: Record<string, unknown>;
  parentEventIds: string[];
  previousEventHash: string | null;
  author: 'user' | 'system';
  confirmation: 'user_confirmed' | 'not_applicable';
}

export interface MemoryReceipt {
  memoryId: string;
  jobId: string;
  blobId: string;
  ownerAddress: string;
  namespace: string;
  status: 'done';
  textSha256: string;
  verifiedAt: string;
  blobObjectId: string | null;
  endEpoch: string | null;
  expiresAt: string | null;
}

export interface EventIntegrity {
  eventId: string;
  eventHash: string; // SHA256(UTF8(JCS(event)))
  textSha256: string; // SHA256(UTF8('RecallLedger event v1\n' + JCS(event)))
}

export interface ClassificationDecision {
  observationId: string;
  classification: Classification;
  category: string | null;
  basis: 'user_label' | 'confirmed_rule' | 'needs_context';
  matchedRuleVersionIds: string[];
  matchedEventIds: string[];
  memoryVersion: number;
  evaluatedAt: string;
  reasonCodes: string[];
  dataOrigin: DataOrigin;
}

export interface OutboxOperation {
  operationId: string;
  eventId: string;
  operationKey: string;
  payloadHash: string;
  jobId: string | null;
  state: 'prepared' | 'submitting' | 'accepted' | 'pending' | 'running'
    | 'uploaded' | 'done' | 'retry_wait' | 'failed' | 'blocked' | 'unknown';
  attempts: number;
  nextAttemptAt: string | null;
}

export interface RestoreReport {
  manifestVersion: string;
  expectedCount: number;
  restoredCount: number;
  missingEventIds: string[];
  unexpectedEventIds: string[];
  missingBlobIds: string[];
  unexpectedBlobIds: string[];
  hashMismatchEventIds: string[];
  payloadHashesMatch: boolean;
  stateHash: string | null;
  expectedStateHash: string;
  status: 'verified' | 'incomplete' | 'failed';
  source: 'walrus_relayer';
  checkedAt: string;
}
