// 지갑 조회 서비스 — 시퀀스 다이어그램 #2
// IRepository 를 통해 DB 에서 트랜잭션/토큰전송 조회 후 가공해서 반환
import { Injectable, Inject } from '@nestjs/common';
import type { IRepository } from '../domain/repository.interface';
import { Transaction, TokenTransfer } from '../domain/types';

export interface WalletStats {
  totalTxCount: number;
  firstSeenBlock: bigint | null;
  topContracts: { contractAddress: string; count: number }[];
}

export interface TokenBalance {
  contractAddress: string;
  balance: bigint;
}

@Injectable()
export class WalletService {
  constructor(@Inject('IRepository') private readonly repo: IRepository) {}

  // << API003 — 지갑 거래내역 조회 (최신 블록 순)
  async getTransactions(address: string, chainId: number): Promise<Transaction[]> {
    const txs = await this.repo.findTransactionsByAddress(address, chainId);
    return txs.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));
  }

  // << API005 — 지갑 통계 (token_transfers 기반 — transactions 테이블은 block scan 시 채워짐)
  async getStats(address: string, chainId: number): Promise<WalletStats> {
    const [transfers, topContracts] = await Promise.all([
      this.repo.findTokenTransfers(address, chainId),
      this.repo.getTopContracts(address, chainId),
    ]);

    const uniqueTxCount = new Set(transfers.map((t) => t.txHash)).size;
    const firstSeenBlock =
      transfers.length > 0
        ? transfers.reduce(
            (min, t) => (t.blockNumber < min ? t.blockNumber : min),
            transfers[0].blockNumber,
          )
        : null;

    return {
      totalTxCount: uniqueTxCount,
      firstSeenBlock,
      topContracts,
    };
  }

  // << API004 — 컨트랙트별 순 잔액 (받은 금액 - 보낸 금액)
  async getBalances(address: string, chainId: number): Promise<TokenBalance[]> {
    const transfers = await this.repo.findTokenTransfers(address, chainId);

    const balanceMap = new Map<string, bigint>();
    for (const t of transfers) {
      const prev = balanceMap.get(t.contractAddress) ?? 0n;
      const isIncoming = t.toAddress.toLowerCase() === address.toLowerCase();
      balanceMap.set(t.contractAddress, isIncoming ? prev + t.amount : prev - t.amount);
    }

    return [...balanceMap.entries()].map(([contractAddress, balance]) => ({
      contractAddress,
      balance,
    }));
  }
}
