import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  CONTRACT_ABIS,
} from '@/lib/services/contractService';

const LOG_RPC        = process.env.MONAD_LOG_RPC_URL || 'https://rpc.monad.xyz';
const LOG_CHUNK_SIZE = 99;     // public Monad RPC: max 100-block range per eth_getLogs
const BLOCK_RANGE    = 2_000;  // ~33 min of Monad history at ~1 s/block

async function queryFilterChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  fromBlock: number,
  toBlock: number
): Promise<ethers.Log[]> {
  const all: ethers.Log[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);
    try {
      const logs = await contract.queryFilter(filter, start, end);
      all.push(...logs);
    } catch (err) {
      console.warn(`[TxAPI] chunk ${start}-${end} skipped:`, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  return all;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  const { walletAddress } = await params;

  const provider = new ethers.JsonRpcProvider(LOG_RPC, 143, { staticNetwork: true });
  const vault = new ethers.Contract(
    CONTRACT_ADDRESSES.GOLDA_VAULT,
    CONTRACT_ABIS.GOLDA_VAULT,
    provider
  );

  // If the RPC is down / unreachable, return empty list instead of 500
  let currentBlock: number;
  try {
    currentBlock = await provider.getBlockNumber();
  } catch (e) {
    console.error('[TxAPI] getBlockNumber failed — returning empty list:', e);
    return NextResponse.json(
      { success: true, transactions: [] },
      { headers: { 'Cache-Control': 's-maxage=10' } }
    );
  }

  const fromBlock = Math.max(0, currentBlock - BLOCK_RANGE);

  // Run all 3 event queries in parallel (3× faster than sequential)
  const [depositResult, withdrawResult, claimResult] = await Promise.allSettled([
    queryFilterChunked(vault, vault.filters.Deposit(walletAddress),             fromBlock, currentBlock),
    queryFilterChunked(vault, vault.filters.WithdrawRequested(walletAddress),   fromBlock, currentBlock),
    queryFilterChunked(vault, vault.filters.WithdrawClaimed(null, walletAddress), fromBlock, currentBlock),
  ]);

  const depositLogs  = depositResult.status  === 'fulfilled' ? depositResult.value  : [];
  const withdrawLogs = withdrawResult.status === 'fulfilled' ? withdrawResult.value : [];
  const claimLogs    = claimResult.status    === 'fulfilled' ? claimResult.value    : [];
  const allLogs      = [...depositLogs, ...withdrawLogs, ...claimLogs];

  // Collect unique block numbers, then fetch all block timestamps in parallel
  // (avoids a sequential getBlock() call per event)
  const blockNums = [...new Set(allLogs.map((l) => l.blockNumber))];
  const blockTimestamps = new Map<number, number>();

  await Promise.allSettled(
    blockNums.map(async (bn) => {
      try {
        const block = await provider.getBlock(bn);
        blockTimestamps.set(bn, block?.timestamp ?? Math.floor(Date.now() / 1000));
      } catch {
        blockTimestamps.set(bn, Math.floor(Date.now() / 1000));
      }
    })
  );

  const ts = (bn: number) =>
    new Date((blockTimestamps.get(bn) ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  // Build response rows
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

  for (const ev of depositLogs) {
    const log = ev as ethers.EventLog;
    if (!log.args) continue;
    transactions.push({
      id:          `deposit-${ev.transactionHash}`,
      type:        'deposit',
      amount:      Number(ethers.formatUnits(log.args.usdcIn  ?? 0, 6)),
      shares:      Number(ethers.formatUnits(log.args.sharesOut ?? 0, 18)),
      timestamp:   ts(ev.blockNumber),
      txHash:      ev.transactionHash,
      blockNumber: ev.blockNumber,
    });
  }

  for (const ev of withdrawLogs) {
    const log = ev as ethers.EventLog;
    if (!log.args) continue;
    transactions.push({
      id:          `wreq-${ev.transactionHash}`,
      type:        'withdraw_request',
      amount:      Number(ethers.formatUnits(log.args.usdcOwed ?? 0, 6)),
      shares:      Number(ethers.formatUnits(log.args.shares   ?? 0, 18)),
      withdrawalId: Number(log.args.id ?? 0),
      timestamp:   ts(ev.blockNumber),
      txHash:      ev.transactionHash,
      blockNumber: ev.blockNumber,
    });
  }

  for (const ev of claimLogs) {
    const log = ev as ethers.EventLog;
    if (!log.args) continue;
    transactions.push({
      id:          `claim-${ev.transactionHash}`,
      type:        'claim',
      amount:      Number(ethers.formatUnits(log.args.usdc ?? 0, 6)),
      withdrawalId: Number(log.args.id ?? 0),
      timestamp:   ts(ev.blockNumber),
      txHash:      ev.transactionHash,
      blockNumber: ev.blockNumber,
    });
  }

  transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json(
    { success: true, transactions: transactions.slice(0, 100) },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } }
  );
}
