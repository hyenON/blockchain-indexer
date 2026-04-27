// StatusService 단위 테스트
// IRepository 를 FakeRepository 로 교체해서 실제 DB 없이 격리
import { StatusService } from './status.service';
import { IRepository } from '../domain/repository.interface';
import { SyncStatus } from '../domain/types';

// << FakeRepository — StatusService 가 사용하는 메서드만 구현
class FakeRepository implements Partial<IRepository> {
  private statuses: SyncStatus[] = [];

  seed(statuses: SyncStatus[]) {
    this.statuses = [...statuses];
  }

  async findAllSyncStatus(): Promise<SyncStatus[]> {
    return [...this.statuses];
  }

  async getSyncStatus(chainId: number): Promise<SyncStatus | null> {
    return this.statuses.find((s) => s.chainId === chainId) ?? null;
  }
}

// << 헬퍼 — 최소 SyncStatus 생성
function makeStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    chainId: 1,
    lastSyncedBlock: 100n,
    status: 'SYNCING',
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('StatusService', () => {
  let service: StatusService;
  let fakeRepo: FakeRepository;

  beforeEach(() => {
    fakeRepo = new FakeRepository();
    service = new StatusService(fakeRepo as unknown as IRepository);
  });

  describe('getAllStatus', () => {
    it('모든 체인의 sync_status 를 반환한다', async () => {
      // given
      fakeRepo.seed([
        makeStatus({ chainId: 1, lastSyncedBlock: 100n }),
        makeStatus({ chainId: 8453, lastSyncedBlock: 200n }),
      ]);

      // when
      const result = await service.getAllStatus();

      // then
      expect(result).toHaveLength(2);
      expect(result[0].chainId).toBe(1);
      expect(result[1].chainId).toBe(8453);
    });

    it('등록된 체인이 없으면 빈 배열을 반환한다', async () => {
      // given
      fakeRepo.seed([]);

      // when
      const result = await service.getAllStatus();

      // then
      expect(result).toEqual([]);
    });
  });

  describe('getStatusByChainId', () => {
    it('해당 chainId 의 sync_status 를 반환한다', async () => {
      // given
      fakeRepo.seed([makeStatus({ chainId: 1, lastSyncedBlock: 500n, status: 'SYNCING' })]);

      // when
      const result = await service.getStatusByChainId(1);

      // then
      expect(result).not.toBeNull();
      expect(result!.lastSyncedBlock).toBe(500n);
      expect(result!.status).toBe('SYNCING');
    });

    it('존재하지 않는 chainId 는 null 을 반환한다', async () => {
      // given
      fakeRepo.seed([]);

      // when
      const result = await service.getStatusByChainId(999);

      // then
      expect(result).toBeNull();
    });
  });
});
