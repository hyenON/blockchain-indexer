// BackfillService 단위 테스트
// BackfillWorker 를 Stub 으로 교체해서 실제 RPC 없이 격리
import { BackfillService } from './backfill.service';
import { BackfillWorker } from '../indexer/backfill-worker';

// << BackfillWorker Stub — run() 호출 여부와 인자만 기록
class StubBackfillWorker {
  calls: { startBlock: bigint; endBlock: bigint }[] = [];
  paused = false;

  async run(startBlock: bigint, endBlock: bigint): Promise<void> {
    this.calls.push({ startBlock, endBlock });
  }

  pause(): void {
    this.paused = true;
  }
}

describe('BackfillService', () => {
  let service: BackfillService;
  let stubWorker: StubBackfillWorker;

  beforeEach(() => {
    stubWorker = new StubBackfillWorker();
    service = new BackfillService(stubWorker as unknown as BackfillWorker);
  });

  it('startBlock ~ endBlock 범위로 BackfillWorker.run() 을 호출한다', async () => {
    // when
    await service.startBackfill(100n, 200n);

    // then
    expect(stubWorker.calls).toHaveLength(1);
    expect(stubWorker.calls[0].startBlock).toBe(100n);
    expect(stubWorker.calls[0].endBlock).toBe(200n);
  });

  it('startBlock 이 endBlock 보다 크면 에러를 던진다', async () => {
    // when / then
    await expect(service.startBackfill(200n, 100n)).rejects.toThrow();
  });
});
