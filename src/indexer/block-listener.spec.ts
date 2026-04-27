// BlockListener 단위 테스트
// Viem 클라이언트를 Stub 으로 교체해서 실제 RPC 연결 없이 테스트
// onBlock() 메서드를 직접 호출해서 BlockProcessor 가 올바르게 호출되는지 검증
import { BlockListener } from './block-listener';
import { BlockProcessor } from './block-processor';
import { Block, Transaction } from '../domain/types';

// << BlockProcessor Stub — process() 호출 여부와 인자만 기록
class StubBlockProcessor {
  calls: { block: Block; transactions: Transaction[] }[] = [];

  async process(block: Block, transactions: Transaction[]): Promise<void> {
    this.calls.push({ block, transactions });
  }
}

// << Viem 클라이언트 Stub — 실제 RPC 호출 없이 동작
function makeViemClientStub(receipts: Record<string, { logs: any[] }> = {}) {
  return {
    getTransactionReceipt: async ({ hash }: { hash: string }) => ({
      status: 'success',
      logs: receipts[hash]?.logs ?? [],
    }),
  };
}

// << Viem 블록 형태 (watchBlocks 에서 오는 원본 데이터)
function makeViemBlock(overrides: any = {}) {
  return {
    number: 100n,
    hash: '0xaaa' as `0x${string}`,
    parentHash: '0xbbb' as `0x${string}`,
    timestamp: 1700000000n,
    gasUsed: 21000n,
    gasLimit: 30000000n,
    baseFeePerGas: 1000000000n,
    transactions: [] as any[],
    ...overrides,
  };
}

describe('BlockListener', () => {
  let listener: BlockListener;
  let stubProcessor: StubBlockProcessor;

  beforeEach(() => {
    stubProcessor = new StubBlockProcessor();
    const viemClient = makeViemClientStub();
    listener = new BlockListener(stubProcessor as unknown as BlockProcessor, viemClient as any, 1);
  });

  it('onBlock 호출 시 BlockProcessor.process 가 호출된다', async () => {
    // given
    const viemBlock = makeViemBlock({ number: 100n, hash: '0xaaa' });

    // when
    await listener.onBlock(viemBlock);

    // then
    expect(stubProcessor.calls).toHaveLength(1);
    expect(stubProcessor.calls[0].block.number).toBe(100n);
    expect(stubProcessor.calls[0].block.hash).toBe('0xaaa');
  });

  it('트랜잭션이 있는 블록은 receipt 를 조회해서 logs 와 함께 전달된다', async () => {
    // given
    const viemClient = makeViemClientStub({
      '0xtx1': { logs: [{ address: '0xContract', topics: ['0xdeadbeef'], data: '0x', logIndex: 0 }] },
    });
    listener = new BlockListener(stubProcessor as unknown as BlockProcessor, viemClient as any, 1);

    const viemBlock = makeViemBlock({
      transactions: [
        {
          hash: '0xtx1' as `0x${string}`,
          from: '0xFrom' as `0x${string}`,
          to: '0xTo' as `0x${string}`,
          value: 0n,
          gas: 21000n,
          input: '0x' as `0x${string}`,
          nonce: 0,
          transactionIndex: 0,
        },
      ],
    });

    // when
    await listener.onBlock(viemBlock);

    // then
    const passedTx = stubProcessor.calls[0].transactions[0];
    expect(passedTx.hash).toBe('0xtx1');
    expect(passedTx.logs).toHaveLength(1);
  });

  it('트랜잭션 없는 빈 블록도 process 가 호출된다', async () => {
    // given
    const viemBlock = makeViemBlock({ transactions: [] });

    // when
    await listener.onBlock(viemBlock);

    // then
    expect(stubProcessor.calls).toHaveLength(1);
    expect(stubProcessor.calls[0].transactions).toHaveLength(0);
  });
});
