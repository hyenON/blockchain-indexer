// << 인덱서 상태 머신 #1
export type IndexerStatus =
  | 'IDLE'
  | 'SYNCING'
  | 'BACKFILLING'
  | 'RECOVERING'
  | 'ERROR';

// << 블록 처리 상태 머신 #2
export type BlockStatus =
  | 'IDLE'
  | 'PROCESSING'
  | 'SAVED'
  | 'FAILED'
  | 'SKIPPED'
  | 'REORGED';

// << 도메인 엔티티

export interface Block {
  number: bigint;
  chainId: number;
  hash: string;
  parentHash: string;
  timestamp: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  baseFeePerGas: bigint | null;
  isReorged: boolean;
}

export interface Transaction {
  hash: string;
  chainId: number;
  blockNumber: bigint;
  blockHash: string;
  fromAddress: string;
  toAddress: string | null;
  value: bigint; // wei 단위
  gas: bigint;
  input: string;
  nonce: number;
  transactionIndex: number;
  status: string;
  logs: RawLog[]; // receipt 에서 함께 전달, 처리 중에만 사용
}

export interface TokenTransfer {
  chainId: number;
  txHash: string;
  blockNumber: bigint;
  contractAddress: string;
  fromAddress: string;
  toAddress: string;
  amount: bigint; // wei 단위
  logIndex: number;
}

export interface RawLog {
  chainId: number;
  txHash: string;
  blockNumber: bigint;
  contractAddress: string;
  topic0: string;
  topics: string[]; // 전체 topics (디코딩 시 사용), DB 저장 시엔 topic0 만 씀
  data: string;
  logIndex: number;
}

export interface SyncStatus {
  chainId: number;
  lastSyncedBlock: bigint;
  status: IndexerStatus;
  errorMessage?: string;
  updatedAt: Date;
}

export interface Chain {
  chainId: number;
  name: string;
  finalityDepth: number;
}

// << EventDecoder 반환 타입
export interface DecodeResult {
  tokenTransfers: TokenTransfer[];
  rawLogs: RawLog[];
}
