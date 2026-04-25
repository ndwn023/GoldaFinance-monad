'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { MobileLayout } from '@/components/mobile-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeftRight,
  Loader2,
  AlertCircle,
  Zap,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ArrowLeft,
} from 'lucide-react';
import {
  MONAD_TOKENS,
  MONAD_CHAIN_ID,
  getBridgeToMonadQuote,
  checkSwapStatus,
  waitForSwapCompletion,
  buildLifiSwapLink,
  type SwapQuote,
  type SwapStatus,
} from '@/lib/services/lifiService';
import { ethers } from 'ethers';

// ============================================
// Source chains for bridging to Monad
// ============================================

const SOURCE_CHAINS = [
  {
    id: 1,
    name: 'Ethereum',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    nativeSymbol: 'ETH',
    nativeAddress: '0x0000000000000000000000000000000000000000',
  },
  {
    id: 8453,
    name: 'Base',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    nativeSymbol: 'ETH',
    nativeAddress: '0x0000000000000000000000000000000000000000',
  },
  {
    id: 42161,
    name: 'Arbitrum',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    nativeSymbol: 'ETH',
    nativeAddress: '0x0000000000000000000000000000000000000000',
  },
  {
    id: 10,
    name: 'Optimism',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf61653d6cA1e10',
    nativeSymbol: 'ETH',
    nativeAddress: '0x0000000000000000000000000000000000000000',
  },
  {
    id: 137,
    name: 'Polygon',
    usdc: '0x3c499c542cEF6E62749D28b7E24b4a7b2D8C62E4',
    nativeSymbol: 'MATIC',
    nativeAddress: '0x0000000000000000000000000000000000000000',
  },
];

const DEST_TOKENS = [
  { symbol: 'USDC',  address: MONAD_TOKENS.USDC.address,  decimals: 6,  label: 'USDC on Monad' },
  { symbol: 'WBTC',  address: MONAD_TOKENS.WBTC.address,  decimals: 8,  label: 'WBTC on Monad' },
  { symbol: 'XAUt0', address: MONAD_TOKENS.XAUt0.address, decimals: 6,  label: 'XAUt0 on Monad' },
  { symbol: 'WETH',  address: MONAD_TOKENS.WETH.address,  decimals: 18, label: 'WETH on Monad' },
  { symbol: 'MON',   address: MONAD_TOKENS.MON.address,   decimals: 18, label: 'MON on Monad' },
];

function getDestTokenDecimals(address: string): number {
  const t = DEST_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return t?.decimals ?? 18;
}

function getDestTokenSymbol(address: string): string {
  const t = DEST_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return t?.label ?? address.slice(0, 6) + '...';
}

export default function BridgePage() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();

  const [sourceChain, setSourceChain] = useState(SOURCE_CHAINS[0]);
  const [fromToken, setFromToken] = useState<string>(SOURCE_CHAINS[0].usdc);
  const [toToken, setToToken] = useState<string>(MONAD_TOKENS.USDC.address);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [showDestSelector, setShowDestSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = user?.wallet?.address;
  const parsedAmount = parseFloat(amount) || 0;
  const toDecimals = getDestTokenDecimals(toToken);

  useEffect(() => {
    if (ready && !authenticated) router.push('/');
  }, [ready, authenticated, router]);

  // Update from token when source chain changes
  useEffect(() => {
    setFromToken(sourceChain.usdc);
  }, [sourceChain]);

  // Fetch bridge quote
  useEffect(() => {
    if (parsedAmount <= 0 || !walletAddress) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);

    const handle = setTimeout(async () => {
      try {
        const q = await getBridgeToMonadQuote({
          fromChainId: sourceChain.id,
          fromToken,
          toToken,
          fromAmount: ethers.parseUnits(parsedAmount.toString(), 6).toString(),
          fromAddress: walletAddress,
        });

        if (!cancelled) {
          setQuote(q);
          setQuoteLoading(false);
        }
      } catch (err) {
        console.warn('[Bridge] quote failed:', err);
        if (!cancelled) {
          setQuote(null);
          setQuoteLoading(false);
        }
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      setQuoteLoading(false);
    };
  }, [parsedAmount, sourceChain.id, fromToken, toToken, walletAddress]);

  const toAmountFormatted = quote
    ? Number(ethers.formatUnits(quote.toAmount, toDecimals)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      })
    : '0';

  const toAmountMinFormatted = quote
    ? Number(ethers.formatUnits(quote.toAmountMin, toDecimals)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      })
    : '0';

  if (!ready || !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-foreground" />
      </div>
    );
  }

  return (
    <MobileLayout activeTab="home">
      <div className="px-4 pt-12 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Bridge to Monad</h1>
            <p className="text-xs text-muted-foreground">Cross-chain via LiFi</p>
          </div>
        </div>

        {/* Source chain selector */}
        <div className="ios-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">From</span>
            <button
              onClick={() => setShowSourceSelector(!showSourceSelector)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted border border-border hover:bg-secondary transition-colors text-sm font-medium"
            >
              {sourceChain.name}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {showSourceSelector && (
            <div className="grid grid-cols-3 gap-1.5">
              {SOURCE_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setSourceChain(chain);
                    setShowSourceSelector(false);
                    setQuote(null);
                  }}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                    sourceChain.id === chain.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted border border-border hover:bg-secondary'
                  }`}
                >
                  {chain.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">USDC</span>
          </div>

          <div className="relative">
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setQuote(null);
                setError(null);
              }}
              className="py-5 text-2xl font-semibold rounded-xl"
            />
          </div>
        </div>

        {/* Bridge arrow */}
        <div className="flex justify-center -my-2 relative z-10">
          <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5 text-foreground" />
          </div>
        </div>

        {/* Destination on Monad */}
        <div className="ios-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">To (on Monad)</span>
            <button
              onClick={() => setShowDestSelector(!showDestSelector)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted border border-border hover:bg-secondary transition-colors text-sm font-medium"
            >
              {getDestTokenSymbol(toToken).split(' on ')[0]}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {showDestSelector && (
            <div className="grid grid-cols-3 gap-1.5">
              {DEST_TOKENS.map((t) => (
                <button
                  key={t.address}
                  onClick={() => {
                    setToToken(t.address);
                    setShowDestSelector(false);
                    setQuote(null);
                  }}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                    toToken === t.address
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted border border-border hover:bg-secondary'
                  }`}
                >
                  {t.symbol}
                </button>
              ))}
            </div>
          )}

          <div className="py-2">
            <p className="text-2xl font-semibold">
              {quoteLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground inline" />
              ) : quote ? (
                `${toAmountFormatted} ${getDestTokenSymbol(toToken).split(' on ')[0]}`
              ) : (
                <span className="text-muted-foreground">0.00</span>
              )}
            </p>
          </div>
        </div>

        {/* Quote details */}
        {quote && (
          <div className="mt-4 bg-info-soft border border-border/50 dark:border-border/30 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-[var(--info)] mt-0.5 shrink-0" />
              <div className="space-y-2 text-sm w-full">
                <p className="font-medium text-foreground">Route via {quote.toolUsed}</p>
                <div className="space-y-1 text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Min received:</span>
                    <span className="font-medium text-foreground">
                      {toAmountMinFormatted} {getDestTokenSymbol(toToken).split(' on ')[0]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. fees:</span>
                    <span className="font-medium text-foreground">${quote.feeUSD.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gas:</span>
                    <span className="font-medium text-foreground">${quote.gasUSD.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. duration:</span>
                    <span className="font-medium text-foreground">
                      {quote.durationSeconds > 60
                        ? `${Math.ceil(quote.durationSeconds / 60)} min`
                        : `${quote.durationSeconds}s`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Slippage:</span>
                    <span className="font-medium text-foreground">{(quote.slippage * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-center gap-2 text-[var(--destructive)] text-sm bg-destructive-soft p-4 rounded-xl">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Info box */}
        <div className="mt-4 bg-muted rounded-2xl p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How bridging works</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Get a quote from LiFi for the best bridge route</li>
            <li>Approve USDC on the source chain</li>
            <li>Sign the bridge transaction</li>
            <li>Wait for confirmation (typically 1-15 min)</li>
            <li>Receive tokens on Monad</li>
          </ol>
        </div>

        {/* Action buttons */}
        <div className="mt-6 space-y-3">
          <a
            href={parsedAmount > 0
              ? buildLifiSwapLink({
                  fromChainId: sourceChain.id,
                  toChainId: MONAD_CHAIN_ID,
                  fromToken,
                  toToken,
                  fromAmount: ethers.parseUnits(parsedAmount.toString(), 6).toString(),
                })
              : '#'
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              className="action-pill primary w-full !h-14"
              disabled={parsedAmount <= 0}
            >
              <ArrowLeftRight className="w-5 h-5 mr-2" />
              Bridge via Jumper Exchange
            </Button>
          </a>

          <p className="text-xs text-center text-muted-foreground">
            Bridging is executed through Jumper Exchange (LiFi) for the best route.
            You&apos;ll sign the transaction in your wallet on the source chain.
          </p>
        </div>
      </div>
    </MobileLayout>
  );
}
