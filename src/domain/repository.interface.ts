// DB 접근 계약서 — Service 는 이 인터페이스만 알고, 실제 구현은 PrismaRepository 가 담당
import {
  Block,
  Chain,
  IndexerStatus,
  RawLog,
  SyncStatus,
  TokenTransfer,
  Transaction,
} from './types';

// << 블록 저장/조회
export interface IRepository {
  saveBlock(block: Block): Promise<void>;
  saveTransactions(transactions: Transaction[]): Promise<void>;
  saveTokenTransfers(tokenTransfers: TokenTransfer[]): Promise<void>;
  saveLogs(logs: RawLog[]): Promise<void>;

  findBlock(blockNumber: bigint, chainId: number): Promise<Block | null>;
  markReorged(blockNumber: bigint, chainId: number): Promise<void>;

  // << 지갑 조회 (시퀀스 다이어그램 #2)
  findTransactionsByAddress(address: string, chainId: number): Promise<Transaction[]>;
  findTokenTransfers(address: string, chainId: number): Promise<TokenTransfer[]>;
  getTopContracts(address: string, chainId: number): Promise<{ contractAddress: string; count: number }[]>;
  getFirstTransaction(address: string, chainId: number): Promise<Transaction | null>;

  // << sync_status 관리
  getSyncStatus(chainId: number): Promise<SyncStatus | null>;
  findAllSyncStatus(): Promise<SyncStatus[]>;
  updateSyncStatus(chainId: number, lastSyncedBlock: bigint, status: IndexerStatus, errorMessage?: string): Promise<void>;

  // << 체인 정보
  findChain(chainId: number): Promise<Chain | null>;
  findAllChains(): Promise<Chain[]>;
  saveChain(chain: Chain): Promise<void>;
}
