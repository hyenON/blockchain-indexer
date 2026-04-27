// ChainService 단위 테스트
// IRepository FakeRepository 로 교체해서 실제 DB 없이 격리
import { ChainService } from './chain.service';
import { IRepository } from '../domain/repository.interface';
import { Chain } from '../domain/types';

// << FakeRepository — ChainService 가 사용하는 메서드만 구현
class FakeRepository implements Partial<IRepository> {
  private chains: Chain[] = [];

  seed(chains: Chain[]) {
    this.chains = [...chains];
  }

  async findAllChains(): Promise<Chain[]> {
    return [...this.chains];
  }

  async findChain(chainId: number): Promise<Chain | null> {
    return this.chains.find((c) => c.chainId === chainId) ?? null;
  }

  async saveChain(chain: Chain): Promise<void> {
    const idx = this.chains.findIndex((c) => c.chainId === chain.chainId);
    if (idx >= 0) {
      this.chains[idx] = chain; // upsert
    } else {
      this.chains.push(chain);
    }
  }
}

describe('ChainService', () => {
  let service: ChainService;
  let fakeRepo: FakeRepository;

  beforeEach(() => {
    fakeRepo = new FakeRepository();
    service = new ChainService(fakeRepo as unknown as IRepository);
  });

  describe('getAllChains', () => {
    it('저장된 체인 목록을 전부 반환한다', async () => {
      // given
      fakeRepo.seed([
        { chainId: 1, name: 'Ethereum', finalityDepth: 12 },
        { chainId: 8453, name: 'Base', finalityDepth: 6 },
      ]);

      // when
      const result = await service.getAllChains();

      // then
      expect(result).toHaveLength(2);
      expect(result[0].chainId).toBe(1);
      expect(result[1].chainId).toBe(8453);
    });

    it('체인이 없으면 빈 배열을 반환한다', async () => {
      // given
      fakeRepo.seed([]);

      // when
      const result = await service.getAllChains();

      // then
      expect(result).toEqual([]);
    });
  });

  describe('addChain', () => {
    it('새 체인을 저장하고 반환한다', async () => {
      // given
      fakeRepo.seed([]);

      // when
      const chain = await service.addChain(1, 'Ethereum', 12);

      // then
      expect(chain.chainId).toBe(1);
      expect(chain.name).toBe('Ethereum');
      expect(chain.finalityDepth).toBe(12);

      const all = await service.getAllChains();
      expect(all).toHaveLength(1);
    });

    it('같은 chainId 로 다시 추가하면 upsert 된다', async () => {
      // given
      fakeRepo.seed([{ chainId: 1, name: 'Ethereum', finalityDepth: 12 }]);

      // when
      await service.addChain(1, 'Ethereum Mainnet', 20);

      // then — 중복 없이 1건만 존재
      const all = await service.getAllChains();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Ethereum Mainnet');
      expect(all[0].finalityDepth).toBe(20);
    });
  });
});
