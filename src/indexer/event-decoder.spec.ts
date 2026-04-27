// EventDecoder 단위 테스트
// DB / 외부 I/O 없음 — 순수 로직만 검증
import { EventDecoder } from './event-decoder';
import { RawLog, Transaction } from '../domain/types';

// << 테스트용 데이터 생성 헬퍼
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// from/to 주소는 32바이트 패딩 형태로 topics 에 들어감
const FROM_TOPIC = '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TO_TOPIC   = '0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function makeLog(overrides: Partial<RawLog> = {}): RawLog {
  return {
    chainId: 1,
    txHash: '0xabc',
    blockNumber: 100n,
    contractAddress: '0xTokenContract',
    topic0: TRANSFER_TOPIC,
    topics: [TRANSFER_TOPIC, FROM_TOPIC, TO_TOPIC], // Transfer 이벤트는 topics 3개
    data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000', // 1 ETH in wei
    logIndex: 0,
    ...overrides,
  };
}

function makeTransaction(logs: RawLog[]): Transaction {
  return {
    hash: '0xabc',
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
    logs,
  };
}

describe('EventDecoder', () => {
  let decoder: EventDecoder;

  beforeEach(() => {
    decoder = new EventDecoder();
  });

  // T-05: Transfer 이벤트 있을 때 token_transfers 에 저장
  it('T-05: Transfer topic 이 있는 로그는 tokenTransfers 로 분류된다', () => {
    // given
    const transferLog = makeLog();
    const tx = makeTransaction([transferLog]);

    // when
    const result = decoder.decodeEvents([tx]);

    // then
    expect(result.tokenTransfers).toHaveLength(1);
    expect(result.rawLogs).toHaveLength(0);
  });

  // T-11: ABI 디코딩 실패 시 logs 테이블로 fallback
  it('T-11: Transfer topic 이지만 data 가 잘못됐으면 rawLogs 로 fallback 된다', () => {
    // given — Transfer topic 이지만 data 가 깨진 값
    const brokenLog = makeLog({ data: '0xinvaliddata' });
    const tx = makeTransaction([brokenLog]);

    // when
    const result = decoder.decodeEvents([tx]);

    // then
    expect(result.rawLogs).toHaveLength(1);
    expect(result.tokenTransfers).toHaveLength(0);
  });

  it('Transfer 가 아닌 topic 은 바로 rawLogs 로 간다', () => {
    // given — 다른 이벤트 topic
    const otherLog = makeLog({ topic0: '0x000000000000000000000000000000000000000000000000000000000000dead' });
    const tx = makeTransaction([otherLog]);

    // when
    const result = decoder.decodeEvents([tx]);

    // then
    expect(result.rawLogs).toHaveLength(1);
    expect(result.tokenTransfers).toHaveLength(0);
  });

  it('트랜잭션이 없으면 둘 다 빈 배열이다', () => {
    // given
    const result = decoder.decodeEvents([]);

    // then
    expect(result.tokenTransfers).toHaveLength(0);
    expect(result.rawLogs).toHaveLength(0);
  });

  it('로그가 없는 트랜잭션은 결과에 영향 없다', () => {
    // given
    const tx = makeTransaction([]);

    // when
    const result = decoder.decodeEvents([tx]);

    // then
    expect(result.tokenTransfers).toHaveLength(0);
    expect(result.rawLogs).toHaveLength(0);
  });
});
