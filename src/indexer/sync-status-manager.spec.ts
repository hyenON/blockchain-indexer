// SyncStatusManager 단위 테스트
// FakeRepository 로 DB 없이 격리해서 테스트
import { SyncStatusManager } from './sync-status-manager';
import { IRepository } from '../domain/repository.interface';
import { Block, Chain, IndexerStatus, RawLog, SyncStatus, TokenTransfer, Transaction } from '../domain/types';

// << FakeRepository — DB 없이 메모리로 동작하는 테스트용 구현체
class FakeRepository implements IRepository {
  private syncStatusStore = new Map<number, SyncStatus>();

  async getSyncStatus(chainId: number): Promise<SyncStatus | null> {
    return this.syncStatusStore.get(chainId) ?? null;
  }

  async updateSyncStatus(chainId: number, lastSyncedBlock: bigint, status: IndexerStatus, errorMessage?: string): Promise<void> {
    this.syncStatusStore.set(chainId, {
      chainId,
      lastSyncedBlock,
      status,
      errorMessage,
      updatedAt: new Date(),
    });
  }

  // 나머지 메서드는 이 테스트에서 안 쓰임
  async saveBlock(): Promise<void> {}
  async saveTransactions(): Promise<void> {}
  async saveTokenTransfers(): Promise<void> {}
  async saveLogs(): Promise<void> {}
  async findBlock(): Promise<null> { return null; }
  async markReorged(): Promise<void> {}
  async findTransactionsByAddress(): Promise<Transaction[]> { return []; }
  async findTokenTransfers(): Promise<TokenTransfer[]> { return []; }
  async getTopContracts(): Promise<{ contractAddress: string; count: number }[]> { return []; }
  async getFirstTransaction(): Promise<null> { return null; }
  async findChain(): Promise<null> { return null; }
}

describe('SyncStatusManager', () => {
  let manager: SyncStatusManager;
  let fakeRepo: FakeRepository;

  beforeEach(() => {
    fakeRepo = new FakeRepository();
    manager = new SyncStatusManager(fakeRepo);
  });

  // T-14/T-15: 재시작 시 last_synced_block 기준으로 이어서 시작
  it('updateLastSyncedBlock 호출 시 sync_status 에 블록 번호가 저장된다', async () => {
    // given
    const chainId = 1;
    const blockNumber = 500n;

    // when
    await manager.updateLastSyncedBlock(chainId, blockNumber);

    // then
    const status = await fakeRepo.getSyncStatus(chainId);
    expect(status?.lastSyncedBlock).toBe(500n);
    expect(status?.status).toBe('SYNCING');
  });

  it('getCurrentStatus 는 저장된 sync_status 를 반환한다', async () => {
    // given
    await manager.updateLastSyncedBlock(1, 100n);

    // when
    const status = await manager.getCurrentStatus(1);

    // then
    expect(status?.lastSyncedBlock).toBe(100n);
  });

  it('sync_status 가 없으면 getCurrentStatus 는 null 을 반환한다', async () => {
    // given — 아무것도 저장 안 된 상태

    // when
    const status = await manager.getCurrentStatus(999);

    // then
    expect(status).toBeNull();
  });

  it('recordError 호출 시 status 가 ERROR 로 바뀌고 에러 메시지가 저장된다', async () => {
    // given
    await manager.updateLastSyncedBlock(1, 100n);

    // when
    await manager.recordError(1, 'RPC 연결 끊김');

    // then
    const status = await fakeRepo.getSyncStatus(1);
    expect(status?.status).toBe('ERROR');
    expect(status?.errorMessage).toBe('RPC 연결 끊김');
  });
});
