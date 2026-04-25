'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { MobileLayout } from '@/components/mobile-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowDownUp,
  Loader2,
  AlertCircle,
  Zap,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import {
  MONAD_TOKENS,
  MONAD_CHAIN_ID,
  getMonadSwapQuote,
  executeMonadSwap,
  checkSwapStatus,
  buildLifiSwapLink,
  type SwapQuote,
  type SwapStatus,
  type MonadTokenSymbol,
} from '@/lib/services/lifiService';
import { addSwapRecord } from '@/lib/services/swapHistory';
import { ethers } from 'ethers';

// ============================================
// Token selector items
// ============================================

interface TokenOption {
  symbol: string;
  address: string;
  decimals: number;
  label: string;
}

const SWAP_TOKENS: TokenOption[] = [
  { symbol: 'USDC',  address: MONAD_TOKENS.USDC.address,  decimals: 6,  label: 'USDC' },
  { symbol: 'WBTC',  address: MONAD_TOKENS.WBTC.address,  decimals: 8,  label: 'WBTC' },
  { symbol: 'XAUt0', address: MONAD_TOKENS.XAUt0.address, decimals: 6,  label: 'XAUt0' },
  { symbol: 'WETH',  address: MONAD_TOKENS.WETH.address,  decimals: 18, label: 'WETH' },
  { symbol: 'wstETH',address: MONAD_TOKENS.wstETH.address,decimals: 18, label: 'wstETH' },
  { symbol: 'cbBTC', address: MONAD_TOKENS.cbBTC.address,  decimals: 8,  label: 'cbBTC' },
  { symbol: 'USDT0', address: MONAD_TOKENS.USDT0.address, decimals: 6,  label: 'USDT0' },
  { symbol: 'MON',   address: MONAD_TOKENS.MON.address,   decimals: 18, label: 'MON' },
  { symbol: 'WMON',  address: MONAD_TOKENS.WMON.address,  decimals: 18, label: 'WMON' },
  { symbol: 'weETH', address: MONAD_TOKENS.weETH.address, decimals: 18, label: 'weETH' },
  { symbol: 'AUSD',  address: MONAD_TOKENS.AUSD.address,  decimals: 6,  label: 'AUSD' },
  { symbol: 'USD1',  address: MONAD_TOKENS.USD1.address,  decimals: 6,  label: 'USD1' },
];

function getTokenDecimals(address: string): number {
  const t = SWAP_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return t?.decimals ?? 18;
}

function getTokenSymbol(address: string): string {
  const t = SWAP_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return t?.label ?? address.slice(0, 6) + '...';
}

export default function SwapPage() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();

  const [fromToken, setFromToken] = useState<string>(MONAD_TOKENS.USDC.address);
  const [toToken, setToToken] = useState<string>(MONAD_TOKENS.WBTC.address);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [swapStatus, setSwapStatus] = useState<SwapStatus | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showFromSelector, setShowFromSelector] = useState(false);
  const [showToSelector, setShowToSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = user?.wallet?.address;
  const activeWallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0];

  const parsedAmount = parseFloat(amount) || 0;
  const fromDecimals = getTokenDecimals(fromToken);
  const toDecimals = getTokenDecimals(toToken);

  useEffect(() => {
    if (ready && !authenticated) router.push('/');
  }, [ready, authenticated, router]);

  // Fetch quote
  useEffect(() => {
    if (parsedAmount <= 0 || !walletAddress) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);

    const handle = setTimeout(async () => {
      try {
        const fromAmountWei = ethers.parseUnits(
          parsedAmount.toString(),
          fromDecimals
        ).toString();

        const q = await getMonadSwapQuote({
          fromToken,
          toToken,
          fromAmount: fromAmountWei,
          fromAddress: walletAddress,
        });

        if (!cancelled) {
          setQuote(q);
          setQuoteLoading(false);
        }
      } catch (err) {
        console.warn('[Swap] quote failed:', err);
        if (!cancelled) {
          setQuote(null);
          setQuoteLoading(false);
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      setQuoteLoading(false);
    };
  }, [parsedAmount, fromToken, toToken, walletAddress, fromDecimals]);

  const getSigner = useCallback(async (): Promise<ethers.Signer> => {
    if (!activeWallet) throw new Error('No wallet connected');
    const provider = await activeWallet.getEthereumProvider();
    const chainIdHex = `0x${MONAD_CHAIN_ID.toString(16)}`;

    try {
      const currentChainId = await provider.request({ method: 'eth_chainId' });
      if (currentChainId !== chainIdHex) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
        } catch (switchError: unknown) {
          const code = (switchError as { code?: number })?.code;
          if (code === 4902) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainIdHex,
                chainName: 'Monad',
                nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
                rpcUrls: ['https://rpc.monad.xyz'],
                blockExplorerUrls: ['https://monadscan.com'],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }
    } catch (err) {
      console.warn('Chain switch warning:', err);
    }

    return new ethers.BrowserProvider(provider).getSigner();
  }, [activeWallet]);

  const handleSwapTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setQuote(null);
  };

  const handleExecuteSwap = useCallback(async () => {
    if (!quote) return;

    setExecuting(true);
    setError(null);
    setSwapStatus(null);

    try {
      const signer = await getSigner();
      const result = await executeMonadSwap(signer, quote);

      setTxHash(result.txHash);
      setSwapStatus({ status: 'PENDING', txHash: result.txHash });

      // Record the swap in local history
      addSwapRecord({
        id: `swap-${Date.now()}`,
        fromToken: fromToken,
        fromTokenSymbol: getTokenSymbol(fromToken),
        toToken: toToken,
        toTokenSymbol: getTokenSymbol(toToken),
        fromAmount: ethers.parseUnits(parsedAmount.toString(), fromDecimals).toString(),
        fromAmountHuman: parsedAmount,
        toAmount: quote.toAmount,
        toAmountHuman: Number(ethers.formatUnits(quote.toAmount, toDecimals)),
        txHash: result.txHash,
        toolUsed: quote.toolUsed,
        timestamp: Date.now(),
        status: 'completed',
      });

      // Poll status
      const finalStatus = await checkSwapStatus({
        txHash: result.txHash,
        fromChainId: MONAD_CHAIN_ID,
        toChainId: MONAD_CHAIN_ID,
      });

      setSwapStatus(finalStatus);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      setError(msg);
      setSwapStatus({ status: 'FAILED' });
    } finally {
      setExecuting(false);
    }
  }, [quote, getSigner]);

  const explorerUrl = txHash ? `https://monadscan.com/tx/${txHash}` : null;

  const toAmountFormatted = quote
    ? Number(ethers.formatUnits(quote.toAmount, toDecimals)).toLocaleString(undefined, {
        maximumFractionDigits: 8,
      })
    : '0';

  const toAmountMinFormatted = quote
    ? Number(ethers.formatUnits(quote.toAmountMin, toDecimals)).toLocaleString(undefined, {
        maximumFractionDigits: 8,
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
            <h1 className="text-xl font-bold">Swap on Monad</h1>
            <p className="text-xs text-muted-foreground">Powered by LiFi</p>
          </div>
        </div>

        {/* From token + amount */}
        <div className="ios-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">From</span>
            <button
              onClick={() => setShowFromSelector(!showFromSelector)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted border border-border hover:bg-secondary transition-colors text-sm font-medium"
            >
              {getTokenSymbol(fromToken)}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {showFromSelector && (
            <div className="grid grid-cols-4 gap-1.5">
              {SWAP_TOKENS.filter((t) => t.address !== toToken).map((t) => (
                <button
                  key={t.address}
                  onClick={() => {
                    setFromToken(t.address);
                    setShowFromSelector(false);
                    setQuote(null);
                  }}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                    fromToken === t.address
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted border border-border hover:bg-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

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
              disabled={executing}
            />
          </div>
        </div>

        {/* Swap direction */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={handleSwapTokens}
            disabled={executing}
            className="btn-haptic w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-surface-2 transition-colors"
            aria-label="Swap direction"
          >
            <ArrowDownUp className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* To token */}
        <div className="ios-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">To (estimated)</span>
            <button
              onClick={() => setShowToSelector(!showToSelector)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted border border-border hover:bg-secondary transition-colors text-sm font-medium"
            >
              {getTokenSymbol(toToken)}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {showToSelector && (
            <div className="grid grid-cols-4 gap-1.5">
              {SWAP_TOKENS.filter((t) => t.address !== fromToken).map((t) => (
                <button
                  key={t.address}
                  onClick={() => {
                    setToToken(t.address);
                    setShowToSelector(false);
                    setQuote(null);
                  }}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                    toToken === t.address
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted border border-border hover:bg-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="py-2">
            <p className="text-2xl font-semibold">
              {quoteLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground inline" />
              ) : quote ? (
                `${toAmountFormatted} ${getTokenSymbol(toToken)}`
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
                      {toAmountMinFormatted} {getTokenSymbol(toToken)}
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

        {/* Success */}
        {swapStatus?.status === 'DONE' && txHash && (
          <div className="mt-4 flex items-center gap-2 text-[var(--success)] text-sm bg-success-soft p-4 rounded-xl">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Swap completed!</p>
              <a
                href={explorerUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--success)] dark:text-[var(--success)] hover:underline flex items-center gap-1"
              >
                View on MonadScan <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Pending */}
        {swapStatus?.status === 'PENDING' && txHash && (
          <div className="mt-4 flex items-center gap-2 text-[var(--warning)] text-sm bg-warning-soft p-4 rounded-xl">
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Swap pending...</p>
              <a
                href={explorerUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--warning)] dark:text-[var(--warning)] hover:underline flex items-center gap-1"
              >
                View on MonadScan <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Failed */}
        {swapStatus?.status === 'FAILED' && (
          <div className="mt-4 flex items-center gap-2 text-[var(--destructive)] text-sm bg-destructive-soft p-4 rounded-xl">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="font-medium">Swap failed. Please try again.</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 space-y-3">
          <Button
            onClick={handleExecuteSwap}
            disabled={!quote || parsedAmount <= 0 || executing || !walletAddress}
            className="action-pill primary w-full !h-14"
          >
            {executing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Swapping...
              </>
            ) : !walletAddress ? (
              'Connect Wallet'
            ) : !quote && parsedAmount > 0 ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Getting quote...
              </>
            ) : parsedAmount <= 0 ? (
              'Enter amount'
            ) : (
              <>
                <ArrowDownUp className="w-5 h-5 mr-2" />
                Swap {getTokenSymbol(fromToken)} → {getTokenSymbol(toToken)}
              </>
            )}
          </Button>

          {parsedAmount > 0 && (
            <a
              href={buildLifiSwapLink({
                fromToken,
                toToken,
                fromAmount: ethers.parseUnits(parsedAmount.toString(), fromDecimals).toString(),
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                className="action-pill w-full !h-12"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in Jumper Exchange
              </Button>
            </a>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
