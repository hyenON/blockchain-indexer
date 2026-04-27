// BlockProcessor 단위 테스트 — T-01, T-02, T-03, T-04, T-13
// FakeRepository + RateLimiter 로 DB/RPC 없이 격리
import { BlockProcessor } from './block-processor';
import { EventDecoder } from './event-decoder';
import { RateLimiter } from './rate-limiter';
import { SyncStatusManager } from './sync-status-manager';
import { IRepository } from '../domain/repository.interface';
import { Block, IndexerStatus, RawLog, SyncStatus, TokenTransfer, Transaction } from '../domain/types';

// << FakeRepository — 메모리 기반, upsert 동작 포함
class FakeRepository implements IRepository {
  blocks = new Map<string, Block>();       // key: `${number}-${chainId}`
  transactions: Transaction[] = [];
  tokenTransfers: TokenTransfer[] = [];
  rawLogs: RawLog[] = [];
  private syncStatusStore = new Map<number, SyncStatus>();

  async saveBlock(block: Block): Promise<void> {
    // upsert: 같은 키면 덮어씀 → T-02 중복 블록 시나리오
    this.blocks.set(`${block.number}-${block.chainId}`, block);
  }

  async saveTransactions(txs: Transaction[]): Promise<void> {
    this.transactions.push(...txs);
  }

  async saveTokenTransfers(transfers: TokenTransfer[]): Promise<void> {
    this.tokenTransfers.push(...transfers);
  }

  async saveLogs(logs: RawLog[]): Promise<void> {
    this.rawLogs.push(...logs);
  }

  async findBlock(blockNumber: bigint, chainId: number): Promise<Block | null> {
    return this.blocks.get(`${blockNumber}-${chainId}`) ?? null;
  }

  async markReorged(blockNumber: bigint, chainId: number): Promise<void> {
    const block = this.blocks.get(`${blockNumber}-${chainId}`);
    if (block) this.blocks.set(`${blockNumber}-${chainId}`, { ...block, isReorged: true });
  }

  async getSyncStatus(chainId: number): Promise<SyncStatus | null> {
    return this.syncStatusStore.get(chainId) ?? null;
  }

  async updateSyncStatus(chainId: number, lastSyncedBlock: bigint, status: IndexerStatus, errorMessage?: string): Promise<void> {
    this.syncStatusStore.set(chainId, { chainId, lastSyncedBlock, status, errorMessage, updatedAt: new Date() });
  }

  async findTransactionsByAddress(): Promise<Transaction[]> { return []; }
  async findTokenTransfers(): Promise<TokenTransfer[]> { return []; }
  async getTopContracts(): Promise<{ contractAddress: string; count: number }[]> { return []; }
  async getFirstTransaction(): Promise<null> { return null; }
  async findChain(): Promise<null> { return null; }
}

// << T-13 용 — saveBlock 이 항상 에러를 던지는 Fake
class AlwaysFailRepository extends FakeRepository {
  async saveBlock(): Promise<void> {
    throw new Error('DB 연결 실패');
  }
}

// << 테스트 헬퍼
function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    number: 100n,
    chainId: 1,
    hash: '0xaaa',
    parentHash: '0xbbb',
    timestamp: 1700000000n,
    gasUsed: 21000n,
    gasLimit: 30000000n,
    baseFeePerGas: 1000000000n,
    isReorged: false,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    hash: '0xtx1',
    chainId: 1,
    blockNumber: 100n,
    blockHash: '0xaaa',
    fromAddress: '0xFrom',
    toAddress: '0xTo',
    value: 0n,
    gas: 21000n,
    input: '0x',
    nonce: 0,
    transactionIndex: 0,
    status: 'success',
    logs: [],
    ...overrides,
  };
}

describe('BlockProcessor', () => {
  let processor: BlockProcessor;
  let fakeRepo: FakeRepository;

  beforeEach(() => {
    fakeRepo = new FakeRepository();
    const rateLimiter = new RateLimiter();
    const eventDecoder = new EventDecoder();
    const syncStatusManager = new SyncStatusManager(fakeRepo);
    processor = new BlockProcessor(fakeRepo, rateLimiter, eventDecoder, syncStatusManager);
  });

  // T-01: 새 블록 → blocks 테이블에 저장
  it('T-01: 새 블록이 들어오면 blocks 에 저장된다', async () => {
    // given
    const block = makeBlock({ number: 100n, hash: '0xaaa' });

    // when
    await processor.process(block, []);

    // then
    const saved = await fakeRepo.findBlock(100n, 1);
    expect(saved).toBeDefined();
    expect(saved?.hash).toBe('0xaaa');
  });

  // T-02: 같은 블록 두 번 → 1건만 저장
  it('T-02: 같은 블록이 두 번 들어와도 1건만 저장된다', async () => {
    // given
    const block = makeBlock({ number: 100n });

    // when
    await processor.process(block, []);
    await processor.process(block, []);

    // then
    expect(fakeRepo.blocks.size).toBe(1);
  });

  // T-03: 트랜잭션 100건 → 전부 저장
  it('T-03: 트랜잭션 100건이 있으면 전부 저장된다', async () => {
    // given
    const block = makeBlock();
    const transactions = Array.from({ length: 100 }, (_, i) =>
      makeTransaction({ hash: `0xtx${i}`, transactionIndex: i }),
    );

    // when
    await processor.process(block, transactions);

    // then
    expect(fakeRepo.transactions).toHaveLength(100);
  });

  // T-04: 빈 블록 → blocks 저장, transactions 0건
  it('T-04: 트랜잭션 없는 빈 블록도 blocks 에는 저장된다', async () => {
    // given
    const block = makeBlock();

    // when
    await processor.process(block, []);

    // then
    expect(fakeRepo.blocks.size).toBe(1);
    expect(fakeRepo.transactions).toHaveLength(0);
  });

  // T-13: 3회 연속 실패 → 블록 skip
  it('T-13: saveBlock 이 3회 연속 실패하면 블록을 skip 한다', async () => {
    // given — 항상 실패하는 Repository
    const failRepo = new AlwaysFailRepository();
    const syncManager = new SyncStatusManager(failRepo);
    const failProcessor = new BlockProcessor(failRepo, new RateLimiter(), new EventDecoder(), syncManager);
    const block = makeBlock();

    // when — 에러가 throw 되지 않고 skip 처리되어야 함
    await expect(failProcessor.process(block, [])).resolves.not.toThrow();

    // then — sync_status 에 ERROR 기록
    const status = await failRepo.getSyncStatus(1);
    expect(status?.status).toBe('ERROR');
  });
});
