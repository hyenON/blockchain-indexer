// BackfillWorker 단위 테스트
// 특정 블록 범위를 순서대로 처리하는지 검증
// Viem 클라이언트와 BlockProcessor 를 Stub 으로 교체해서 격리
import { BackfillWorker } from './backfill-worker';
import { BlockProcessor } from './block-processor';
import { Block } from '../domain/types';

// << BlockProcessor Stub — 호출된 블록 번호 기록
class StubBlockProcessor {
  processedBlocks: bigint[] = [];

  async process(block: Block, transactions: Transaction[]): Promise<void> {
    this.processedBlocks.push(block.number);
  }
}

// << Viem 클라이언트 Stub — getBlock 호출 시 번호에 맞는 가짜 블록 반환
function makeViemClientStub() {
  return {
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
      number: blockNumber,
      hash: `0xblock${blockNumber}` as `0x${string}`,
      parentHash: `0xparent${blockNumber}` as `0x${string}`,
      timestamp: 1700000000n,
      gasUsed: 21000n,
      gasLimit: 30000000n,
      baseFeePerGas: 1000000000n,
      transactions: [],
    }),
    getTransactionReceipt: async () => ({ status: 'success', logs: [] }),
  };
}

describe('BackfillWorker', () => {
  let worker: BackfillWorker;
  let stubProcessor: StubBlockProcessor;

  beforeEach(() => {
    stubProcessor = new StubBlockProcessor();
    worker = new BackfillWorker(
      stubProcessor as unknown as BlockProcessor,
      makeViemClientStub() as any,
      1,
    );
  });

  it('startBlock ~ endBlock 범위의 블록을 순서대로 처리한다', async () => {
    // given
    const startBlock = 100n;
    const endBlock = 103n;

    // when
    await worker.run(startBlock, endBlock);

    // then — 100, 101, 102, 103 순서대로 처리
    expect(stubProcessor.processedBlocks).toEqual([100n, 101n, 102n, 103n]);
  });

  it('startBlock 과 endBlock 이 같으면 블록 1개만 처리한다', async () => {
    // given
    await worker.run(200n, 200n);

    // then
    expect(stubProcessor.processedBlocks).toHaveLength(1);
    expect(stubProcessor.processedBlocks[0]).toBe(200n);
  });

  it('실행 중 pause() 호출 시 처리를 멈춘다', async () => {
    // given — 3번째 블록 처리 직후 worker.pause() 를 호출하는 stub
    const processedBlocks: bigint[] = [];
    let callCount = 0;
    const pausingProcessor = {
      async process(block: Block) {
        processedBlocks.push(block.number);
        callCount++;
        if (callCount === 3) worker.pause(); // 3번째 처리 후 즉시 pause
      },
    };

    worker = new BackfillWorker(
      pausingProcessor as unknown as BlockProcessor,
      makeViemClientStub() as any,
      1,
    );

    // when
    await worker.run(100n, 110n);

    // then — 3개만 처리되고 멈춰야 함
    expect(processedBlocks.length).toBeLessThan(11);
    expect(processedBlocks.length).toBeGreaterThanOrEqual(3);
  });
});
