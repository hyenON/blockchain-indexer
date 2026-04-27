// WalletImportService 단위 테스트
// Alchemy 클라이언트를 Stub 으로 교체해서 실제 API 호출 없이 격리
// IRepository FakeRepository 로 DB 격리
import { WalletImportService, IAlchemyClient, AlchemyTransfer } from './wallet-import.service';
import { IRepository } from '../domain/repository.interface';
import { TokenTransfer } from '../domain/types';

// << FakeRepository — saveTokenTransfers 만 구현 (upsert 흉내)
class FakeRepository implements Partial<IRepository> {
  tokenTransfers: TokenTransfer[] = [];

  async saveTokenTransfers(transfers: TokenTransfer[]): Promise<void> {
    for (const t of transfers) {
      const idx = this.tokenTransfers.findIndex(
        (e) => e.txHash === t.txHash && e.logIndex === t.logIndex,
      );
      if (idx >= 0) {
        this.tokenTransfers[idx] = t; // upsert
      } else {
        this.tokenTransfers.push(t);
      }
    }
  }
}

// << Alchemy 클라이언트 Stub — 미리 세팅한 transfer 목록 반환
class StubAlchemyClient implements IAlchemyClient {
  private transfers: AlchemyTransfer[] = [];

  setTransfers(transfers: AlchemyTransfer[]) {
    this.transfers = transfers;
  }

  async getAssetTransfers(params: {
    fromAddress?: string;
    toAddress?: string;
    category: string[];
  }): Promise<{ transfers: AlchemyTransfer[] }> {
    const result = this.transfers.filter((t) => {
      if (params.fromAddress) return t.from.toLowerCase() === params.fromAddress.toLowerCase();
      if (params.toAddress) return t.to?.toLowerCase() === params.toAddress.toLowerCase();
      return false;
    });
    return { transfers: result };
  }
}

// << 헬퍼 — 최소 AlchemyTransfer 생성 (ERC-20)
function makeAlchemyTransfer(overrides: Partial<AlchemyTransfer> = {}): AlchemyTransfer {
  return {
    blockNum: '0x64',     // 100
    hash: '0xhash1',
    from: '0xFrom',
    to: '0xTo',
    category: 'erc20',
    rawContract: {
      value: '0x3E8',    // 1000n
      address: '0xToken',
      decimal: '0x12',   // 18
    },
    logIndex: 0,
    ...overrides,
  };
}

describe('WalletImportService', () => {
  let service: WalletImportService;
  let stubAlchemy: StubAlchemyClient;
  let fakeRepo: FakeRepository;

  beforeEach(() => {
    stubAlchemy = new StubAlchemyClient();
    fakeRepo = new FakeRepository();
    service = new WalletImportService(stubAlchemy, fakeRepo as unknown as IRepository, 1);
  });

  // T-WI1
  it('ERC-20 transfer 를 조회해서 DB 에 저장한다', async () => {
    // given
    const address = '0xAlice';
    stubAlchemy.setTransfers([
      makeAlchemyTransfer({ hash: '0xtx1', from: address, to: '0xBob', logIndex: 0 }),
      makeAlchemyTransfer({ hash: '0xtx2', from: '0xBob', to: address, logIndex: 1 }),
    ]);

    // when
    const result = await service.importHistory(address);

    // then
    expect(result.imported).toBe(2);
    expect(fakeRepo.tokenTransfers).toHaveLength(2);
    expect(fakeRepo.tokenTransfers[0].txHash).toBe('0xtx1');
    expect(fakeRepo.tokenTransfers[0].amount).toBe(1000n); // 0x3E8
    expect(fakeRepo.tokenTransfers[0].contractAddress).toBe('0xToken');
  });

  // T-WI2
  it('같은 트랜잭션을 두 번 import 해도 중복 저장되지 않는다', async () => {
    // given
    const address = '0xAlice';
    stubAlchemy.setTransfers([
      makeAlchemyTransfer({ hash: '0xtx1', from: address, logIndex: 0 }),
    ]);

    // when — 두 번 import
    await service.importHistory(address);
    await service.importHistory(address);

    // then — 1건만 존재
    expect(fakeRepo.tokenTransfers).toHaveLength(1);
  });

  // T-WI3
  it('거래 내역이 없는 주소는 0 을 반환한다', async () => {
    // given
    stubAlchemy.setTransfers([]);

    // when
    const result = await service.importHistory('0xUnknown');

    // then
    expect(result.imported).toBe(0);
    expect(fakeRepo.tokenTransfers).toHaveLength(0);
  });
});
