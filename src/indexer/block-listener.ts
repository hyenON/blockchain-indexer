// 블록 구독 — Viem watchBlocks 로 실시간 블록 감지 후 BlockProcessor 에 위임
// 시퀀스 다이어그램 #1 의 시작점 (체인 → BlockListener → BlockProcessor)
// Viem 블록/트랜잭션 타입 → 도메인 타입 변환도 여기서 담당
import { Injectable } from '@nestjs/common';
import { Block, RawLog, Transaction } from '../domain/types';
import { BlockProcessor } from './block-processor';

// << Viem 클라이언트 최소 인터페이스 — 테스트 시 Stub 으로 교체 가능하도록
export interface IViemClient {
  watchBlocks(options: { includeTransactions: boolean; onBlock: (block: any) => Promise<void> | void }): () => void;
  getTransactionReceipt(params: { hash: `0x${string}` }): Promise<{ status: string; logs: any[] }>;
}

@Injectable()
export class BlockListener {
  private unwatch: (() => void) | null = null;

  constructor(
    private readonly blockProcessor: BlockProcessor,
    private readonly viemClient: IViemClient,
    private readonly chainId: number,
  ) {}

  // << 블록 구독 시작 — 인덱서 시작 시 호출 (IDLE → SYNCING)
  start(): void {
    this.unwatch = this.viemClient.watchBlocks({
      includeTransactions: true,
      onBlock: (block) => this.onBlock(block),
    });
  }

  // << 블록 구독 중지
  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
  }

  // << watchBlocks 콜백 — Viem 블록을 도메인 타입으로 변환 후 BlockProcessor 에 위임
  // 테스트에서 직접 호출 가능하도록 public 으로 열어둠
  async onBlock(viemBlock: any): Promise<void> {
    const block = this.mapBlock(viemBlock);
    const transactions = await this.mapTransactions(viemBlock.transactions ?? [], viemBlock);
    await this.blockProcessor.process(block, transactions);
  }

  // << Viem 블록 → 도메인 Block 변환
  private mapBlock(viemBlock: any): Block {
    return {
      number: viemBlock.number,
      chainId: this.chainId,
      hash: viemBlock.hash,
      parentHash: viemBlock.parentHash,
      timestamp: viemBlock.timestamp,
      gasUsed: viemBlock.gasUsed,
      gasLimit: viemBlock.gasLimit,
      baseFeePerGas: viemBlock.baseFeePerGas ?? null,
      isReorged: false,
    };
  }

  // << Viem 트랜잭션 배열 → 도메인 Transaction 배열 변환
  // 각 트랜잭션마다 receipt 를 조회해서 logs 포함
  private async mapTransactions(viemTxs: any[], viemBlock: any): Promise<Transaction[]> {
    return Promise.all(
      viemTxs.map(async (tx) => {
        const receipt = await this.viemClient.getTransactionReceipt({ hash: tx.hash });
        const logs = this.mapLogs(receipt.logs, tx.hash, viemBlock.number);

        return {
          hash: tx.hash,
          chainId: this.chainId,
          blockNumber: viemBlock.number,
          blockHash: viemBlock.hash,
          fromAddress: tx.from,
          toAddress: tx.to ?? null,
          value: tx.value ?? 0n,
          gas: tx.gas,
          input: tx.input,
          nonce: tx.nonce,
          transactionIndex: tx.transactionIndex,
          status: receipt.status,
          logs,
        };
      }),
    );
  }

  // << Viem receipt logs → 도메인 RawLog 배열 변환
  private mapLogs(viemLogs: any[], txHash: string, blockNumber: bigint): RawLog[] {
    return viemLogs.map((log) => ({
      chainId: this.chainId,
      txHash,
      blockNumber,
      contractAddress: log.address,
      topic0: log.topics[0] ?? '',
      topics: log.topics,
      data: log.data,
      logIndex: log.logIndex,
    }));
  }
}
