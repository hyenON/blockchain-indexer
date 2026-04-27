// 지갑 과거 거래내역 import — Alchemy getAssetTransfers 로 주소별 전체 ERC-20 이력 수집
// watchBlocks 는 미래 블록만 감지하므로, 과거 데이터는 이 서비스로 채움
import { Injectable, Inject } from '@nestjs/common';
import type { IRepository } from '../domain/repository.interface';
import { TokenTransfer } from '../domain/types';

// << Alchemy getAssetTransfers 응답 단건 타입
export interface AlchemyTransfer {
  blockNum: string;       // hex 블록 번호 ("0x64")
  hash: string;           // tx hash
  from: string;
  to: string | null;
  category: 'external' | 'internal' | 'erc20' | 'erc721' | 'erc1155';
  rawContract: {
    value: string | null; // hex 금액 ("0x3E8")
    address: string | null; // 컨트랙트 주소
    decimal: string | null; // hex 소수점 ("0x12")
  };
  logIndex: number;
}

// << Alchemy 클라이언트 최소 인터페이스 — 테스트 시 Stub 으로 교체
export interface IAlchemyClient {
  getAssetTransfers(params: {
    fromAddress?: string;
    toAddress?: string;
    category: string[];
  }): Promise<{ transfers: AlchemyTransfer[] }>;
}

@Injectable()
export class WalletImportService {
  constructor(
    private readonly alchemyClient: IAlchemyClient,
    @Inject('IRepository') private readonly repo: IRepository,
    private readonly chainId: number,
  ) {}

  // << 주소의 ERC-20 전송 이력 전체를 Alchemy 에서 가져와 DB 에 저장
  async importHistory(address: string): Promise<{ imported: number }> {
    // 보낸 것 + 받은 것 동시 조회
    const [sent, received] = await Promise.all([
      this.alchemyClient.getAssetTransfers({
        fromAddress: address,
        category: ['erc20'],
      }),
      this.alchemyClient.getAssetTransfers({
        toAddress: address,
        category: ['erc20'],
      }),
    ]);

    const all = [...sent.transfers, ...received.transfers];
    const tokenTransfers = all.map((t) => this.mapTransfer(t));

    if (tokenTransfers.length > 0) {
      await this.repo.saveTokenTransfers(tokenTransfers);
    }

    return { imported: tokenTransfers.length };
  }

  // << Alchemy transfer → 도메인 TokenTransfer 변환
  private mapTransfer(t: AlchemyTransfer): TokenTransfer {
    return {
      chainId: this.chainId,
      txHash: t.hash,
      blockNumber: BigInt(t.blockNum),
      contractAddress: t.rawContract.address ?? '',
      fromAddress: t.from,
      toAddress: t.to ?? '',
      amount: t.rawContract.value ? BigInt(t.rawContract.value) : 0n,
      logIndex: t.logIndex ?? 0,
    };
  }
}
