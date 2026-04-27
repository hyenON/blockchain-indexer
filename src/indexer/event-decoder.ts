// ERC-20 Transfer 이벤트를 ABI 디코딩하는 클래스
// raw 로그(16진수 덩어리) → from/to/amount 로 변환
// 디코딩 실패 시 raw 그대로 logs 테이블로 fallback (T-11)
import { Injectable } from '@nestjs/common';
import { decodeEventLog } from 'viem';
import { DecodeResult, RawLog, TokenTransfer, Transaction } from '../domain/types';

// << ERC-20 Transfer 이벤트 ABI
// Transfer(address indexed from, address indexed to, uint256 value)
const ERC20_TRANSFER_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

// Transfer 이벤트의 topic[0] — keccak256("Transfer(address,address,uint256)")
// 이 값이 일치하는 로그만 Transfer 로 간주
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

@Injectable()
export class EventDecoder {
  // 시퀀스 다이어그램 #1 의 decodeEvents(transactions) 호출에 대응
  // 모든 트랜잭션의 로그를 순회해서 Transfer 이면 디코딩, 아니면 raw 저장
  decodeEvents(transactions: Transaction[]): DecodeResult {
    const tokenTransfers: TokenTransfer[] = [];
    const rawLogs: RawLog[] = [];

    for (const tx of transactions) {
      for (const log of tx.logs) {
        // topic[0] 이 Transfer 시그니처와 다르면 바로 raw 저장
        if (log.topic0 !== TRANSFER_TOPIC) {
          rawLogs.push(log);
          continue;
        }

        try {
          const decoded = this.decodeTransferLog(log);
          tokenTransfers.push(decoded);
        } catch {
          // T-11: ABI 디코딩 실패 시 raw 로 fallback
          rawLogs.push(log);
        }
      }
    }

    return { tokenTransfers, rawLogs };
  }

  // << 단일 로그 디코딩 (Viem decodeEventLog 사용)
  private decodeTransferLog(log: RawLog): TokenTransfer {
    const decoded = decodeEventLog({
      abi: ERC20_TRANSFER_ABI,
      // topics[0]=이벤트 시그니처, topics[1]=from(indexed), topics[2]=to(indexed)
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      data: log.data as `0x${string}`,
    });

    // viem 이 디코딩한 결과에서 from, to, value 꺼내기
    const args = decoded.args as { from: string; to: string; value: bigint };

    return {
      chainId: log.chainId,
      txHash: log.txHash,
      blockNumber: log.blockNumber,
      contractAddress: log.contractAddress,
      fromAddress: args.from,
      toAddress: args.to,
      amount: args.value, // wei 단위 bigint
      logIndex: log.logIndex,
    };
  }
}
