// WalletService 단위 테스트
// IRepository 를 FakeRepository 로 교체해서 실제 DB 연결 없이 격리
// T-06, T-07 + 통계/잔액 시나리오
import { WalletService } from './wallet.service';
import { IRepository } from '../domain/repository.interface';
import { Transaction, TokenTransfer } from '../domain/types';

// << FakeRepository — WalletService 가 사용하는 메서드만 구현
class FakeRepository implements Partial<IRepository> {
  private transactions: Transaction[] = [];
  private tokenTransfers: TokenTransfer[] = [];

  seed(txs: Transaction[], transfers: TokenTransfer[] = []) {
    this.transactions = txs;
    this.tokenTransfers = transfers;
  }

  async findTransactionsByAddress(address: string, chainId: number): Promise<Transaction[]> {
    return this.transactions.filter(
      (tx) =>
        tx.chainId === chainId &&
        (tx.fromAddress.toLowerCase() === address.toLowerCase() ||
          tx.toAddress?.toLowerCase() === address.toLowerCase()),
    );
  }

  async findTokenTransfers(address: string, chainId: number): Promise<TokenTransfer[]> {
    return this.tokenTransfers.filter(
      (t) =>
        t.chainId === chainId &&
        (t.fromAddress.toLowerCase() === address.toLowerCase() ||
          t.toAddress.toLowerCase() === address.toLowerCase()),
    );
  }

  async getTopContracts(
    address: string,
    chainId: number,
  ): Promise<{ contractAddress: string; count: number }[]> {
    const map = new Map<string, number>();
    this.tokenTransfers
      .filter(
        (t) =>
          t.chainId === chainId &&
          (t.fromAddress.toLowerCase() === address.toLowerCase() ||
            t.toAddress.toLowerCase() === address.toLowerCase()),
      )
      .forEach((t) => map.set(t.contractAddress, (map.get(t.contractAddress) ?? 0) + 1));
    return [...map.entries()]
      .map(([contractAddress, count]) => ({ contractAddress, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getFirstTransaction(address: string, chainId: number): Promise<Transaction | null> {
    const txs = await this.findTransactionsByAddress(address, chainId);
    if (txs.length === 0) return null;
    return txs.reduce((min, tx) => (tx.blockNumber < min.blockNumber ? tx : min));
  }
}

// << 헬퍼 — 최소 Transaction 생성
function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    hash: '0xhash',
    chainId: 1,
    blockNumber: 100n,
    blockHash: '0xblock',
    fromAddress: '0xFrom',
    toAddress: '0xTo',
    value: 0n,
    gas: 21000n,
    input: '0x',
    nonce: 0,
    transactionIndex: 0,
    status: 'success',
    logs: [],
    ...overrides,
  };
}

// << 헬퍼 — 최소 TokenTransfer 생성
function makeTransfer(overrides: Partial<TokenTransfer> = {}): TokenTransfer {
  return {
    chainId: 1,
    txHash: '0xhash',
    blockNumber: 100n,
    contractAddress: '0xToken',
    fromAddress: '0xFrom',
    toAddress: '0xTo',
    amount: 1000n,
    logIndex: 0,
    ...overrides,
  };
}

describe('WalletService', () => {
  let service: WalletService;
  let fakeRepo: FakeRepository;

  beforeEach(() => {
    fakeRepo = new FakeRepository();
    service = new WalletService(fakeRepo as unknown as IRepository);
  });

  // T-06
  describe('getTransactions', () => {
    it('해당 주소가 from 또는 to 인 트랜잭션을 반환한다', async () => {
      // given
      const address = '0xAlice';
      fakeRepo.seed([
        makeTx({ hash: '0xtx1', fromAddress: address, blockNumber: 100n }),
        makeTx({ hash: '0xtx2', toAddress: address, blockNumber: 200n }),
        makeTx({ hash: '0xtx3', fromAddress: '0xOther', toAddress: '0xOther', blockNumber: 300n }),
      ]);

      // when
      const result = await service.getTransactions(address, 1);

      // then — 0xOther 는 제외, 최신 블록 순 정렬
      expect(result).toHaveLength(2);
      expect(result[0].hash).toBe('0xtx2'); // blockNumber 200
      expect(result[1].hash).toBe('0xtx1'); // blockNumber 100
    });

    // T-07
    it('거래 내역이 없는 주소는 빈 배열을 반환한다', async () => {
      // given
      fakeRepo.seed([]);

      // when
      const result = await service.getTransactions('0xUnknown', 1);

      // then
      expect(result).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('총 거래 수, 처음 등장한 블록, 상위 컨트랙트를 반환한다', async () => {
      // given
      const address = '0xAlice';
      fakeRepo.seed(
        [
          makeTx({ hash: '0xtx1', fromAddress: address, blockNumber: 100n }),
          makeTx({ hash: '0xtx2', toAddress: address, blockNumber: 50n }),
        ],
        [
          makeTransfer({ toAddress: address, contractAddress: '0xTokenA', blockNumber: 100n }),
          makeTransfer({ toAddress: address, contractAddress: '0xTokenA', blockNumber: 101n }),
          makeTransfer({ toAddress: address, contractAddress: '0xTokenB', blockNumber: 102n }),
        ],
      );

      // when
      const stats = await service.getStats(address, 1);

      // then
      expect(stats.totalTxCount).toBe(2);
      expect(stats.firstSeenBlock).toBe(50n); // 가장 빠른 블록
      expect(stats.topContracts[0].contractAddress).toBe('0xTokenA'); // 2회로 1위
      expect(stats.topContracts[0].count).toBe(2);
    });

    it('거래가 없는 주소는 기본값을 반환한다', async () => {
      // given
      fakeRepo.seed([]);

      // when
      const stats = await service.getStats('0xUnknown', 1);

      // then
      expect(stats.totalTxCount).toBe(0);
      expect(stats.firstSeenBlock).toBeNull();
      expect(stats.topContracts).toEqual([]);
    });
  });

  describe('getBalances', () => {
    it('받은 transfer 금액 - 보낸 금액으로 컨트랙트별 순 잔액을 계산한다', async () => {
      // given
      const address = '0xAlice';
      fakeRepo.seed([], [
        makeTransfer({ toAddress: address, contractAddress: '0xTokenA', amount: 1000n }),
        makeTransfer({ toAddress: address, contractAddress: '0xTokenA', amount: 500n }),
        makeTransfer({ fromAddress: address, contractAddress: '0xTokenA', amount: 200n }),
      ]);

      // when
      const balances = await service.getBalances(address, 1);

      // then — 1000 + 500 - 200 = 1300
      expect(balances).toHaveLength(1);
      expect(balances[0].contractAddress).toBe('0xTokenA');
      expect(balances[0].balance).toBe(1300n);
    });

    it('토큰 전송이 없으면 빈 배열을 반환한다', async () => {
      // given
      fakeRepo.seed([]);

      // when
      const balances = await service.getBalances('0xUnknown', 1);

      // then
      expect(balances).toEqual([]);
    });
  });
});
