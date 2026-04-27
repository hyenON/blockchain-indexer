# 블록체인 인덱서 — 기술 학습 로그

> Java Spring 만 해온 개발자가 TypeScript + NestJS + Prisma 로 전환하면서
> "이게 뭐야?" 했던 것들을 기록.

---

## 목차

- [L-01. Repository 패턴 — JPA 랑 뭐가 달라?](#l-01-repository-패턴--jpa-랑-뭐가-달라)
- [L-02. `prisma generate` — 이게 Gradle 빌드야?](#l-02-prisma-generate--이게-gradle-빌드야)
- [L-03. 인터페이스를 왜 구현체보다 먼저 만들어?](#l-03-인터페이스를-왜-구현체보다-먼저-만들어)
- [L-04. bigint vs Decimal — 도메인 타입이랑 DB 타입이 왜 달라?](#l-04-bigint-vs-decimal--도메인-타입이랑-db-타입이-왜-달라)
- [L-05. TDD 빨간 불 → 초록 불 — 테스트가 설계 버그를 잡아줬다](#l-05-tdd-빨간-불--초록-불--테스트가-설계-버그를-잡아줬다)
- [L-06. FakeRepository 를 왜 쓰나 — DB 없이 테스트하는 이유](#l-06-fakerepository-를-왜-쓰나--db-없이-테스트하는-이유)
- [L-07. 지금 테스트는 실제 블록이 아니다 — 가짜 데이터로 테스트하는 이유](#l-07-지금-테스트는-실제-블록이-아니다--가짜-데이터로-테스트하는-이유)
- [L-08. Clean Architecture 레이어 — 의존성은 항상 안쪽으로](#l-08-clean-architecture-레이어--의존성은-항상-안쪽으로)
- [L-09. Service 는 왜 얇아야 하나 — 로직은 안쪽, 조합은 바깥쪽](#l-09-service-는-왜-얇아야-하나--로직은-안쪽-조합은-바깥쪽)

---

## L-01. Repository 패턴 — JPA 랑 뭐가 달라?

**질문:** Repository 면 이전 자바스프링에서 DTO 나 Domain 을 받아와서 처리하는 곳이었지?

**결론:** 맞다. 역할은 동일하다. 다만 차이가 있다.

### Spring JPA 방식

```java
// Spring 은 JpaRepository 를 상속하면 구현체를 자동으로 만들어줌
public interface BlockRepository extends JpaRepository<Block, Long> {
    Optional<Block> findByNumberAndChainId(Long number, Integer chainId);
}
```

- 인터페이스만 작성하면 Spring 이 `SimpleJpaRepository` 라는 구현체를 런타임에 자동 주입
- 개발자가 구현체를 직접 작성할 일이 없음

### Prisma (TypeScript) 방식

```typescript
// 인터페이스는 직접 정의
export interface IRepository {
  saveBlock(block: Block): Promise<void>;
  findBlock(blockNumber: bigint, chainId: number): Promise<Block | null>;
  ...
}

// 구현체도 직접 작성
@Injectable()
export class PrismaRepository implements IRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveBlock(block: Block) {
    await this.prisma.block.upsert({ ... });
  }
}
```

- Spring 처럼 자동 구현체가 없으므로 직접 구현
- 대신 Prisma 가 `this.prisma.block.upsert()` 같은 저수준 DB 접근을 제공

### 비교 요약

| 항목 | Spring JPA | Prisma (TypeScript) |
|---|---|---|
| 인터페이스 | 직접 작성 | 직접 작성 |
| 구현체 | Spring 이 자동 생성 | 개발자가 직접 작성 |
| DB 접근 방법 | JPA가 SQL 자동 생성 | Prisma Client 가 쿼리 실행 |
| 중복 방지 | `save()` 시 @Id 기준 merge | `upsert()` 에 where 조건 명시 |

**배운 점:**
- Spring 이 숨겨주던 구현체를 직접 작성하게 되면서 "Repository 가 실제로 뭘 하는지" 더 명확하게 보임
- Spring 의 편리함이 얼마나 많은 걸 자동화해주는지 역으로 깨닫게 됨

---

## L-02. `prisma generate` — 이게 Gradle 빌드야?

**질문:** `prisma generate` 가 뭔 과정이야? 자바스프링에서 어떤 과정인 거야? 그냥 패키지 설치 후 리그레이들이야?

**결론:** `npx prisma generate` = Gradle 빌드에서 JPA 가 `@Entity` 읽어서 쿼리 메서드 자동 생성하는 과정

### 흐름 비교

**Spring + JPA:**
```
@Entity 클래스 작성
       ↓
Gradle 빌드 (./gradlew build)
       ↓
JPA 가 @Entity 읽어서 자동으로 findById(), save() 등 생성
       ↓
Repository 에서 바로 사용 가능
```

**TypeScript + Prisma:**
```
schema.prisma 작성 (테이블 구조 정의)
       ↓
npx prisma generate
       ↓
Prisma 가 schema 읽어서 TypeScript 타입 + 쿼리 메서드 자동 생성
       ↓
코드에서 this.prisma.block.findUnique() 등 사용 가능
```

### 실제로 생성되는 것

`npx prisma generate` 실행 후 `node_modules/@prisma/client` 안에:

```typescript
// 자동 생성된 타입 (건드리면 안 됨, generate 할 때마다 덮어씌워짐)
export type Block = {
  number: bigint
  chainId: number
  hash: string
  ...
}
```

### 언제 다시 실행해야 하나?

| 상황 | 필요 여부 |
|---|---|
| `schema.prisma` 테이블/컬럼 수정 | ✅ 필요 |
| TypeScript 코드만 수정 | ❌ 불필요 |
| `npm install` 후 처음 세팅 | ✅ 필요 |

**배운 점:**
- Spring 은 빌드 시 자동으로 해주지만, Prisma 는 스키마 바꿀 때마다 명시적으로 실행해야 함
- 자동화 vs 명시적 실행의 트레이드오프 — Prisma 방식이 "지금 어떤 타입이 쓰이는지" 더 명확하게 드러냄

---

## L-03. 인터페이스를 왜 구현체보다 먼저 만들어?

**배경:** Clean Architecture 를 적용하면서 `IRepository` 인터페이스를 `PrismaRepository` 구현체보다 먼저 만들었다.

**질문:** 왜 구현체보다 인터페이스를 먼저?

**결론:** DIP (의존성 역전 원칙) 때문. Service 가 구현체를 직접 알면 나중에 DB 를 바꿀 때 Service 코드도 다 고쳐야 한다.

### 인터페이스 없는 구조 (나쁜 예)

```typescript
// Service 가 PrismaRepository 를 직접 알고 있음
class BlockProcessor {
  constructor(private readonly repo: PrismaRepository) {}  // ← 구현체 직접 의존

  async process(block: Block) {
    await this.repo.saveBlock(block);
  }
}
```

- DB 를 PostgreSQL → MongoDB 로 바꾸면? `BlockProcessor` 코드도 수정해야 함
- 테스트할 때? 실제 DB 없이는 테스트 불가

### 인터페이스 있는 구조 (좋은 예)

```typescript
// Service 는 인터페이스만 알고 있음
class BlockProcessor {
  constructor(private readonly repo: IRepository) {}  // ← 인터페이스에 의존

  async process(block: Block) {
    await this.repo.saveBlock(block);
  }
}

// 테스트할 때는 Fake 구현체로 교체
class FakeRepository implements IRepository {
  private blocks = new Map<string, Block>();

  async saveBlock(block: Block) {
    this.blocks.set(`${block.number}-${block.chainId}`, block);
  }
}
```

- DB 바꿔도 `BlockProcessor` 코드 변경 없음
- 테스트 시 `FakeRepository` 로 DB 없이 테스트 가능

### Spring 에서의 같은 개념

Spring 에서도 동일하게 사용:
```java
// Service 는 인터페이스에만 의존
private final BlockRepository blockRepository;  // 인터페이스

// 실제 구현체는 Spring 이 주입 (개발자가 new 하지 않음)
```

Spring 이 자동으로 해줘서 덜 와닿았을 뿐, 사실 같은 원칙.

**배운 점:**
- Spring 이 DI 를 자동화해줘서 DIP 를 "그냥 쓰고" 있었는데, 직접 인터페이스를 먼저 설계하니 원칙이 왜 존재하는지 체감됨
- 인터페이스 먼저 → 구현체는 나중 → 테스트는 Fake 로: 이 순서가 자연스럽게 Clean Architecture 가 됨

---

## L-04. bigint vs Decimal — 도메인 타입이랑 DB 타입이 왜 달라?

**배경:** 도메인 타입(`types.ts`)에서 `value: bigint` 로 정의했는데, Prisma 스키마에서는 `Decimal(78, 0)` 으로 저장한다.

**질문:** 왜 같은 타입을 안 써?

**결론:** 레이어마다 "최적의 타입"이 다르기 때문. 변환은 Repository 에서 한 번만.

### 왜 도메인에서 bigint 를 쓰냐

ETH 의 최소 단위는 **wei**. 1 ETH = 10^18 wei.

```
1,000,000,000,000,000,000 wei = 1 ETH
```

JavaScript 의 `number` 는 2^53 - 1 (약 9천조) 까지밖에 못 표현하므로 wei 단위 금액을 담을 수 없음.
`bigint` 는 크기 제한이 없어서 wei 단위 그대로 안전하게 다룰 수 있음.

```typescript
const weiAmount = 1_000_000_000_000_000_000n;  // bigint: 안전
const weiAmount2 = 1_000_000_000_000_000_000;   // number: 정밀도 손실 발생
```

### 왜 DB 에서 Decimal(78, 0) 을 쓰냐

PostgreSQL 의 `bigint` 는 최대 약 9.2 × 10^18 까지만 저장 가능.
그런데 ERC-20 토큰 중 소수점 18자리 + 발행량이 많은 토큰은 이 범위를 초과할 수 있음.
`Decimal(78, 0)` 은 소수점 없는 78자리 정수까지 저장 가능 → wei 단위 어떤 금액도 안전.

### 변환은 Repository 에서만

```typescript
// 저장 시: bigint → Decimal
value: new Prisma.Decimal(tx.value.toString())

// 조회 시: Decimal → bigint
value: BigInt(row.value.toString())
```

`toString()` 을 경유하는 이유: `bigint` 와 `Decimal` 은 직접 형변환이 안 되고, 문자열을 중간 매개체로 사용.

### 레이어별 타입 정리

| 레이어 | 타입 | 이유 |
|---|---|---|
| 도메인 (`types.ts`) | `bigint` | 정밀도 손실 없이 wei 계산 |
| DB (`schema.prisma`) | `Decimal(78,0)` | PostgreSQL bigint 범위 초과 대비 |
| Repository | 변환 담당 | `bigint ↔ Decimal` 변환 책임 |

**배운 점:**
- "왜 타입이 레이어마다 다르냐" 의 답은 "각 레이어가 최적화하는 목적이 다르기 때문"
- 변환 책임을 Repository 한 곳에 몰아두면, 도메인 코드는 bigint 만 알고 DB 코드는 Decimal 만 알면 됨
- 이게 Clean Architecture 에서 레이어를 분리하는 실질적인 이유 중 하나

---

## L-05. TDD 빨간 불 → 초록 불 — 테스트가 설계 버그를 잡아줬다

**배경:** `EventDecoder` 테스트를 돌렸을 때 T-05 (Transfer 디코딩) 가 실패했다.

**원인:** `RawLog` 타입에 `topic0` 만 있었는데, ERC-20 Transfer 이벤트는 topics 가 3개 필요했다.

```
Transfer 이벤트 topics 구조:
topics[0] = Transfer 이벤트 시그니처 (고정값)
topics[1] = from 주소 (indexed → topics 에 들어감)
topics[2] = to 주소   (indexed → topics 에 들어감)
data      = amount    (non-indexed → data 에 들어감)
```

`indexed` 파라미터는 `data` 가 아닌 `topics` 배열에 들어간다. `from`, `to` 가 indexed 라서 topics 가 3개가 됨.

**코드에서 발생한 문제:**

```typescript
// 기존 — topic0 만 넘겨서 디코딩 실패
topics: [log.topic0 as `0x${string}`]

// 수정 — 전체 topics 배열을 넘겨야 함
topics: log.topics as [`0x${string}`, ...`0x${string}`[]]
```

**해결:** `RawLog` 타입에 `topics: string[]` 필드 추가. DB 저장 시엔 `topic0` 만 쓰고, 디코딩 시엔 전체 `topics` 사용.

**TDD 가 없었다면?**
코드만 짰다면 이 버그는 실제 이더리움 블록을 처리할 때까지 발견 못 했을 거다. 테스트가 설계 단계의 실수를 먼저 잡아줬다.

**배운 점:**
- 테스트는 "코드가 맞는지" 확인하는 게 아니라 "설계가 맞는지" 확인하는 도구
- 빨간 불이 뜨면 "실패"가 아니라 "설계에서 놓친 게 있다는 신호"
- 초록 불로 만드는 과정이 설계를 완성하는 과정

---

## L-06. FakeRepository 를 왜 쓰나 — DB 없이 테스트하는 이유

**질문:** 테스트에서 실제 PostgreSQL 을 쓰면 안 되나?

**결론:** 쓸 수 있지만, 단위 테스트에서는 쓰지 않는다. 이유가 있다.

### 실제 DB 를 쓰면 생기는 문제

| 문제 | 설명 |
|---|---|
| 속도 | DB 연결, 쿼리 실행 시간 → 테스트 1개에 수백 ms |
| 환경 의존 | DB 가 없는 환경 (CI 서버, 팀원 로컬) 에서 테스트 불가 |
| 격리 안 됨 | 이전 테스트가 저장한 데이터가 다음 테스트에 영향 |
| 느린 피드백 | 코드 바꿀 때마다 DB 띄우고 기다려야 함 |

### FakeRepository 가 해결하는 것

```typescript
// FakeRepository — 메모리 Map 으로 DB 흉내
class FakeRepository implements IRepository {
  blocks = new Map<string, Block>();

  async saveBlock(block: Block): Promise<void> {
    // DB 대신 메모리에 저장
    this.blocks.set(`${block.number}-${block.chainId}`, block);
  }
}
```

- DB 없이 즉시 실행 → 테스트 전체가 0.3초 안에 끝남
- `beforeEach` 에서 `new FakeRepository()` 하면 매 테스트마다 깨끗하게 초기화
- 어떤 환경에서도 동일하게 동작

### IRepository 인터페이스가 핵심

FakeRepository 가 동작하는 이유는 `BlockProcessor` 가 `IRepository` 인터페이스에만 의존하기 때문.

```typescript
// BlockProcessor 는 IRepository 만 알고 있음
constructor(private readonly repo: IRepository) {}

// 테스트: FakeRepository 주입
processor = new BlockProcessor(fakeRepo, ...)

// 프로덕션: PrismaRepository 주입
processor = new BlockProcessor(prismaRepo, ...)
```

인터페이스 덕분에 테스트용 Fake 와 실제 구현체를 자유롭게 교체 가능.

**배운 점:**
- 단위 테스트 = "이 클래스의 로직만" 검증. DB 는 다른 테스트(통합 테스트) 에서 검증
- FakeRepository 를 만드는 수고가 아깝게 느껴질 수 있지만, 빠른 피드백 루프가 개발 속도를 높임
- 인터페이스 분리 (DIP) 가 테스트를 가능하게 만드는 실질적인 이유

---

## L-07. 지금 테스트는 실제 블록이 아니다 — 가짜 데이터로 테스트하는 이유

**질문:** 지금 테스트가 실제 이더리움 블록에서 가져오고 있는 건가?

**결론:** 아니다. 지금까지 한 테스트는 전부 가짜 데이터다.

### 지금까지 한 것

```typescript
// 우리가 직접 만든 가짜 블록 — 이더리움이랑 연결 없음
function makeBlock(): Block {
  return {
    number: 100n,    // 임의로 넣은 숫자
    hash: '0xaaa',  // 임의로 넣은 값
    ...
  };
}
```

- 이더리움 RPC 연결 없음
- PostgreSQL 연결 없음
- 전부 메모리에서만 실행

### 실제 블록이 들어오는 시점

```
지금까지 (단위 테스트):
가짜 블록 → BlockProcessor → FakeRepository (메모리)

나중에 (실제 실행):
Viem watchBlocks → 진짜 이더리움 블록 감지
        ↓
BlockListener → BlockProcessor.process(진짜 블록, 진짜 트랜잭션)
        ↓
PrismaRepository → 실제 PostgreSQL 저장
```

실제 연결이 되려면:
1. `BlockListener` 구현 (Viem watchBlocks 연결)
2. Docker 로 PostgreSQL 실행
3. `.env` 에 RPC URL, DATABASE_URL 설정
4. `npm run start:dev` 로 실행

### 왜 이렇게 단계를 나누나

실제 블록부터 테스트하면:
- 네트워크 상태에 따라 테스트 결과가 달라짐
- 이더리움 RPC 가 느리면 테스트도 느려짐
- 어떤 블록 데이터가 들어올지 예측 불가 → 기대값 설정 어려움

가짜 데이터로 먼저 로직을 검증하고, 실제 연결은 통합 테스트에서 따로 검증하는 게 맞다.

**배운 점:**
- 단위 테스트 → 로직 검증 (가짜 데이터)
- 통합 테스트 → 실제 DB + 실제 데이터 흐름 검증
- E2E 테스트 → 실제 API 호출까지 전체 흐름 검증
- 레이어를 나눠서 테스트하면 어디서 버그가 났는지 빠르게 찾을 수 있음

---

## L-08. Clean Architecture 레이어 — 의존성은 항상 안쪽으로

**배경:** Service, Controller, Repository 를 다 만들고 나서 "이게 왜 이렇게 나뉘어 있지?" 를 그림으로 정리해봤다.

### 레이어 구조 (안 → 바깥)

```
┌─────────────────────────────────────────────────────┐
│              Frameworks & Drivers                    │
│   NestJS / Prisma / Viem / PostgreSQL               │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │           Interface Adapters                  │  │
│  │  Controllers          PrismaRepository        │  │
│  │                                               │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │           Use Cases                     │ │  │
│  │  │  WalletService / ChainService /         │ │  │
│  │  │  BackfillService / StatusService        │ │  │
│  │  │  BlockProcessor / BlockListener /       │ │  │
│  │  │  BackfillWorker / EventDecoder          │ │  │
│  │  │                                         │ │  │
│  │  │  ┌───────────────────────────────────┐ │ │  │
│  │  │  │           Domain                  │ │ │  │
│  │  │  │  types.ts / IRepository           │ │ │  │
│  │  │  └───────────────────────────────────┘ │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 핵심 규칙 — 의존성 방향

- **바깥 레이어는 안쪽 레이어를 알 수 있다**
- **안쪽 레이어는 바깥 레이어를 절대 모른다**

```
Controller → WalletService → IRepository ← PrismaRepository
                                ↑
                          안쪽(도메인)이
                          바깥(Prisma)을
                          모르는 이유
```

`IRepository` 인터페이스가 핵심. 도메인과 Use Cases 는 인터페이스만 알고, 실제 DB 구현(`PrismaRepository`)은 바깥 레이어에 있다.

### Spring 과 비교

Spring 에서도 같은 구조다. Controller → Service → Repository 흐름이 동일하고, `@Repository` 를 인터페이스로 쓰는 것도 같은 이유. 차이는 Spring 이 자동으로 많은 걸 해줘서 레이어 경계가 덜 보였을 뿐.

**배운 점:**
- 레이어를 나누는 이유는 "변경 전파를 막기 위해서"
- DB 를 바꾸면 PrismaRepository 만 고치면 되고, 비즈니스 로직(Service)은 건드리지 않아도 됨
- 이 구조가 테스트를 쉽게 만드는 이유이기도 함 — 안쪽 레이어는 바깥 없이 혼자 테스트 가능

---

## L-09. Service 는 왜 얇아야 하나 — 로직은 안쪽, 조합은 바깥쪽

**배경:** BackfillService, StatusService 를 만들었을 때 코드가 너무 짧아서 "이게 맞나?" 싶었다.

```typescript
// BackfillService — 전체 코드
async startBackfill(startBlock: bigint, endBlock: bigint): Promise<void> {
  if (startBlock > endBlock) throw new Error(...);
  await this.backfillWorker.run(startBlock, endBlock);
}

// StatusService — 전체 코드
async getAllStatus(): Promise<SyncStatus[]> {
  return this.repo.findAllSyncStatus();
}
```

**결론:** 맞다. Service 가 얇은 게 정상이다.

### 역할 분리

| 레이어 | 역할 | 예시 |
|---|---|---|
| Domain | 핵심 규칙, 타입 정의 | `Block`, `Transaction`, `IRepository` |
| Use Cases (Service/Indexer) | 흐름 조합, 유효성 검사 | `startBlock > endBlock` 체크 |
| Interface Adapters (Controller) | HTTP 요청/응답 변환 | `@Param`, `@Body` 파싱 |
| Frameworks (Prisma) | 실제 DB 접근 | `prisma.block.upsert()` |

Service 가 해야 하는 건 **"어떤 순서로 무엇을 호출할지"** 결정하는 것.
복잡한 계산은 Domain 에, 실제 IO는 Repository 에 위임하면 Service 는 자연스럽게 얇아진다.

### 두꺼운 Service 가 나쁜 이유

```typescript
// 나쁜 예 — Service 가 SQL 쿼리까지 알고 있음
async getTransactions(address: string) {
  const rows = await this.prisma.transaction.findMany({
    where: { OR: [{ fromAddress: address }, { toAddress: address }] },
    orderBy: { blockNumber: 'desc' },
  });
  return rows.map(row => ({ ...row, value: BigInt(row.value.toString()) }));
}
```

이러면 DB 를 바꿀 때 Service 코드도 고쳐야 하고, 테스트할 때도 Prisma 를 같이 세팅해야 한다.

**배운 점:**
- Service 코드가 짧으면 "설계를 잘 한 것"
- 로직이 Service 에 몰리기 시작하면 "어느 레이어에 있어야 하지?" 를 먼저 물어봐야 함
- Spring 에서 `@Service` 가 비대해지는 게 이 원칙을 어길 때 생기는 현상
