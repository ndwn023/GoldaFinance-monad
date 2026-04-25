import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  CONTRACT_ABIS,
} from '@/lib/services/contractService';

// Always use the public Monad RPC for event-log queries.
// NEXT_PUBLIC_RPC_URL may be an Alchemy free-tier endpoint that limits
// eth_getLogs to a 10-block range — completely unusable for history scanning.
// The public RPC supports up to 100-block ranges and has no API-key rate limits.
const LOG_RPC = process.env.MONAD_LOG_RPC_URL || 'https://rpc.monad.xyz';
const LOG_CHUNK_SIZE = 99;    // stays within the 100-block public-RPC limit
const BLOCK_RANGE     = 2_000; // ~33 min of Monad history (~1 s/block)

async function queryFilterChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  fromBlock: number,
  toBlock: number
): Promise<ethers.Log[]> {
  const allLogs: ethers.Log[] = [];

  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);
    try {
      const logs = await contract.queryFilter(filter, start, end);
      allLogs.push(...logs);
    } catch (err) {
      console.warn(`[TxAPI] chunk ${start}-${end} failed:`, err);
    }
    await new Promise((r) => setTimeout(r, 20));
  }

  return allLogs;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;
    // Use the public Monad RPC — 100-block range, no key, no rate-limit issues
    const provider = new ethers.JsonRpcProvider(LOG_RPC, 143, { staticNetwork: true });
    const vault = new ethers.Contract(
      CONTRACT_ADDRESSES.GOLDA_VAULT,
      CONTRACT_ABIS.GOLDA_VAULT,
      provider
    );

    const transactions: Array<{
      id: string;
      type: 'deposit' | 'withdraw_request' | 'claim';
      amount: number;
      shares?: number;
      withdrawalId?: number;
      timestamp: string;
      txHash: string;
      blockNumber: number;
    }> = [];

    const currentBlock = await provider.getBlockNumber();
    const fromBlock    = Math.max(0, currentBlock - BLOCK_RANGE);

    // Fetch all three event types sequentially to respect rate limits
    try {
      const depositFilter = vault.filters.Deposit(walletAddress);
      const depositEvents = await queryFilterChunked(vault, depositFilter, fromBlock, currentBlock);
      for (const ev of depositEvents) {
        const log = ev as ethers.EventLog;
        if (!log.args) continue;
        const block = await ev.getBlock();
        const usdcIn = Number(ethers.formatUnits(log.args.usdcIn ?? 0, 6));
        const shares = Number(ethers.formatUnits(log.args.sharesOut ?? 0, 18));
        transactions.push({
          id: `deposit-${ev.transactionHash}`,
          type: 'deposit',
          amount: usdcIn,
          shares,
          timestamp: new Date(block.timestamp * 1000).toISOString(),
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
        });
      }
    } catch (e) {
      console.error('[TxAPI] Deposit events error:', e);
    }

    try {
      const withdrawFilter = vault.filters.WithdrawRequested(walletAddress);
      const withdrawEvents = await queryFilterChunked(vault, withdrawFilter, fromBlock, currentBlock);
      for (const ev of withdrawEvents) {
        const log = ev as ethers.EventLog;
        if (!log.args) continue;
        const block = await ev.getBlock();
        const shares = Number(ethers.formatUnits(log.args.shares ?? 0, 18));
        const owed = Number(ethers.formatUnits(log.args.usdcOwed ?? 0, 6));
        const id = Number(log.args.id ?? 0);
        transactions.push({
          id: `wreq-${ev.transactionHash}`,
          type: 'withdraw_request',
          amount: owed,
          shares,
          withdrawalId: id,
          timestamp: new Date(block.timestamp * 1000).toISOString(),
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
        });
      }
    } catch (e) {
      console.error('[TxAPI] WithdrawRequested events error:', e);
    }

    try {
      const claimFilter = vault.filters.WithdrawClaimed(null, walletAddress);
      const claimEvents = await queryFilterChunked(vault, claimFilter, fromBlock, currentBlock);
      for (const ev of claimEvents) {
        const log = ev as ethers.EventLog;
        if (!log.args) continue;
        const block = await ev.getBlock();
        const paid = Number(ethers.formatUnits(log.args.usdc ?? 0, 6));
        const id = Number(log.args.id ?? 0);
        transactions.push({
          id: `claim-${ev.transactionHash}`,
          type: 'claim',
          amount: paid,
          withdrawalId: id,
          timestamp: new Date(block.timestamp * 1000).toISOString(),
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
        });
      }
    } catch (e) {
      console.error('[TxAPI] WithdrawClaimed events error:', e);
    }

    transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json(
      { success: true, transactions: transactions.slice(0, 100) },
      { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (error) {
    console.error('[TxAPI] Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
