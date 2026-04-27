# Blockchain Indexer

이더리움 온체인 데이터를 수집·저장·조회하는 인덱서 서버.
지갑 주소 기반으로 ERC-20 거래내역, 토큰 잔액, 통계를 제공한다.

**Tech Stack:** TypeScript · NestJS · Prisma · PostgreSQL · Viem · Alchemy

---

## 아키텍처

Clean Architecture 기반. 의존성은 항상 안쪽(Domain)으로만 흐른다.

```
src/
├── domain/                   # 가장 안쪽 — 외부에 의존하지 않음
│   ├── types.ts              # 도메인 엔티티 (Block, Transaction, TokenTransfer ...)
│   └── repository.interface.ts  # DB 접근 계약서 (IRepository)
│
├── indexer/                  # Use Cases — 블록 처리 핵심 로직
│   ├── block-processor.ts    # 블록 저장 · 재시도 · reorg 감지
│   ├── block-listener.ts     # Viem watchBlocks 구독 (현재 비활성화)
│   ├── backfill-worker.ts    # 과거 블록 범위 소급 처리
│   ├── event-decoder.ts      # ERC-20 Transfer ABI 디코딩
│   ├── rate-limiter.ts       # 토큰 버킷 RPC 요청 제한
│   └── sync-status-manager.ts  # last_synced_block 추적
│
├── wallet/                   # Use Cases — 지갑 조회
│   ├── wallet.service.ts     # 거래내역 · 잔액 · 통계 조회
│   └── wallet-import.service.ts  # Alchemy로 과거 이력 수집
│
├── chain/                    # Use Cases — 체인 관리
│   └── chain.service.ts
│
├── backfill/                 # Use Cases — 백필 실행
│   └── backfill.service.ts
│
├── status/                   # Use Cases — 인덱서 상태 조회
│   └── status.service.ts
│
├── repository/               # Interface Adapters — DB 구현체
│   ├── repository.ts         # PrismaRepository (IRepository 구현)
│   └── prisma.service.ts
│
└── app.module.ts             # DI 조립 — 모든 의존성 연결
```

---

## 데이터 흐름

```
[과거 데이터]
POST /wallets/:address/import
  → Alchemy getAssetTransfers(address)
  → token_transfers 테이블 저장
  → GET /wallets/:address/* 로 조회 가능

[실시간 데이터] — 향후 구현 예정
Alchemy Webhook (주소별 알림)
  → POST /webhook/activity
  → BlockProcessor → DB 저장
```

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/chains` | 지원 체인 목록 |
| POST | `/chains` | 체인 추가 |
| POST | `/wallets/:address/import?chainId=1` | 지갑 과거 이력 import |
| GET | `/wallets/:address/transactions?chainId=1` | 거래내역 조회 |
| GET | `/wallets/:address/balances?chainId=1` | 토큰별 잔액 |
| GET | `/wallets/:address/stats?chainId=1` | 통계 (총 거래 수, 첫 블록, TOP 컨트랙트) |
| POST | `/backfill` | 블록 범위 소급 처리 |
| GET | `/status` | 전체 체인 인덱서 상태 |
| GET | `/status/:chainId` | 특정 체인 상태 |

---

## 로컬 실행

**사전 준비:**
- Docker Desktop
- Node.js 18+
- Alchemy API Key

**1. 환경 변수 설정**
```bash
cp .env.example .env  # ALCHEMY_API_KEY, RPC_URL, DATABASE_URL 입력
```

**2. PostgreSQL 실행**
```bash
docker compose up -d
```

**3. DB 테이블 생성**
```bash
npx prisma@6 migrate dev --name init
```

**4. 서버 실행**
```bash
npm run start:dev
```

**5. 지갑 데이터 import**
```bash
curl -X POST "http://localhost:3000/wallets/0xYOUR_ADDRESS/import?chainId=1"
```

---

## 테스트

```bash
# 전체 단위 테스트
npm test -- --no-coverage

# 특정 파일만
npm test -- --testPathPatterns=wallet.service --no-coverage
```

단위 테스트 39개 — FakeRepository 패턴으로 DB 없이 격리 실행.

---

## 문서

| 파일 | 내용 |
|------|------|
| [docs/learning-log.md](./docs/learning-log.md) | Java Spring → TypeScript 전환 학습 기록 (L-01 ~ L-13) |
| [docs/test-scenarios.md](./docs/test-scenarios.md) | TDD 시나리오 Given/When/Then (T-01 ~ T-WI3) |
| [docs/decisions.md](./docs/decisions.md) | 설계 결정 및 실수 수정 과정 (ADR-01 ~ ADR-03) |
