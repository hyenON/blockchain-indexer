// 과거 블록 소급 처리 — POST /backfill 호출 시 startBlock ~ endBlock 범위를 순서대로 처리
// BlockListener(실시간) 와 다른 진입점이지만 같은 BlockProcessor.process() 를 사용
// 실시간 backlog 발생 시 pause() 로 일시 중단 가능 (flow-diagram.md 동시성 고려 참고)
import { Injectable } from '@nestjs/common';
import { Block, RawLog, Transaction } from '../domain/types';
import { BlockProcessor } from './block-processor';
import { IViemClient } from './block-listener';

@Injectable()
export class BackfillWorker {
  private paused = false;

  constructor(
    private readonly blockProcessor: BlockProcessor,
    private readonly viemClient: IViemClient & {
      getBlock(params: { blockNumber: bigint }): Promise<any>;
    },
    private readonly chainId: number,
  ) {}

  // << 백필 실행 — startBlock 부터 endBlock 까지 순서대로 처리
  async run(startBlock: bigint, endBlock: bigint): Promise<void> {
    this.paused = false;

    for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
      // 실시간 backlog 감지 시 pause() 가 호출되면 중단
      if (this.paused) break;

      const viemBlock = await this.viemClient.getBlock({ blockNumber });
      const block = this.mapBlock(viemBlock);
      const transactions = await this.mapTransactions(viemBlock.transactions ?? [], viemBlock);

      await this.blockProcessor.process(block, transactions);
    }
  }

  // << 실시간 블록이 밀릴 때 백필 일시 중단 (RateLimiter 우선순위 연동)
  pause(): void {
    this.paused = true;
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

  // << Viem 트랜잭션 → 도메인 Transaction 변환 (receipt 포함)
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

  // << Viem receipt logs → 도메인 RawLog 변환
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
