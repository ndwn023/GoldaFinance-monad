'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { ethers } from 'ethers';

// ============================================
// Token selector items
// ============================================

interface TokenOption {
  symbol: MonadTokenSymbol | string;
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
];

function getTokenDecimals(address: string): number {
  const t = SWAP_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return t?.decimals ?? 18;
}

function getTokenSymbol(address: string): string {
  const t = SWAP_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return t?.label ?? address.slice(0, 6) + '...';
}

// ============================================
// Props
// ============================================

interface SwapDialogProps {
  children: React.ReactNode;
  defaultFromToken?: string;
  defaultToToken?: string;
  signerGetter?: () => Promise<ethers.Signer>;
  walletAddress?: string;
}

// ============================================
// Component
// ============================================

export function SwapDialog({
  children,
  defaultFromToken = MONAD_TOKENS.USDC.address,
  defaultToToken = MONAD_TOKENS.WBTC.address,
  signerGetter,
  walletAddress,
}: SwapDialogProps) {
  const [open, setOpen] = useState(false);
  const [fromToken, setFromToken] = useState<string>(defaultFromToken);
  const [toToken, setToToken] = useState<string>(defaultToToken);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [swapStatus, setSwapStatus] = useState<SwapStatus | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showFromSelector, setShowFromSelector] = useState(false);
  const [showToSelector, setShowToSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount) || 0;
  const fromDecimals = getTokenDecimals(fromToken);
  const toDecimals = getTokenDecimals(toToken);

  // Fetch quote when amount/token changes
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

  const handleSwapTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setQuote(null);
  };

  const handleExecuteSwap = useCallback(async () => {
    if (!quote || !signerGetter) return;

    setExecuting(true);
    setError(null);
    setSwapStatus(null);

    try {
      const signer = await signerGetter();
      const result = await executeMonadSwap(signer, quote);

      setTxHash(result.txHash);
      setSwapStatus({ status: 'PENDING', txHash: result.txHash });

      // Poll status for same-chain swaps (should be near-instant)
      const finalStatus = await checkSwapStatus({
        txHash: result.txHash,
        fromChainId: MONAD_CHAIN_ID,
        toChainId: MONAD_CHAIN_ID,
      });

      setSwapStatus(finalStatus);

      if (finalStatus.status === 'DONE') {
        // Success — keep dialog open briefly to show success
        setTimeout(() => {
          setAmount('');
          setQuote(null);
          setTxHash(null);
          setSwapStatus(null);
        }, 3000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      setError(msg);
      setSwapStatus({ status: 'FAILED', txHash: txHash ?? undefined });
    } finally {
      setExecuting(false);
    }
  }, [quote, signerGetter, txHash]);

  const explorerUrl = txHash
    ? `https://monadscan.com/tx/${txHash}`
    : null;

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

  const isSwapReady = quote && parsedAmount > 0 && !executing && !swapStatus?.status?.startsWith('DONE');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-2xl border-border bg-card">
        <DialogHeader className="text-left">
          <div className="w-14 h-14 rounded-2xl bg-info-soft flex items-center justify-center mb-4">
            <ArrowDownUp className="w-7 h-7 text-[var(--info)]" />
          </div>
          <DialogTitle className="text-xl">Swap on Monad</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Swap tokens on Monad via LiFi. Best route aggregated across DEXs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* From token + amount */}
          <div className="bg-muted rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">From</span>
              <button
                onClick={() => setShowFromSelector(!showFromSelector)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border hover:bg-secondary transition-colors text-sm font-medium"
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
                        : 'bg-card border border-border hover:bg-secondary'
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
                className="py-4 text-xl font-semibold rounded-xl"
                disabled={executing}
              />
            </div>
          </div>

          {/* Swap direction button */}
          <div className="flex justify-center">
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
          <div className="bg-muted rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">To</span>
              <button
                onClick={() => setShowToSelector(!showToSelector)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border hover:bg-secondary transition-colors text-sm font-medium"
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
                        : 'bg-card border border-border hover:bg-secondary'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <div className="py-2">
              <p className="text-xl font-semibold">
                {quoteLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground inline" />
                ) : quote ? (
                  `${toAmountFormatted} ${getTokenSymbol(toToken)}`
                ) : (
                  '0.00'
                )}
              </p>
            </div>
          </div>

          {/* Quote details */}
          {quote && (
            <div className="bg-info-soft border border-border/50 dark:border-border/30 rounded-2xl p-4">
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
            <div className="flex items-center gap-2 text-[var(--destructive)] text-sm bg-destructive-soft p-4 rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Success status */}
          {swapStatus?.status === 'DONE' && txHash && (
            <div className="flex items-center gap-2 text-[var(--success)] text-sm bg-success-soft p-4 rounded-xl">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Swap completed!</p>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--success)] dark:text-[var(--success)] hover:underline flex items-center gap-1"
                  >
                    View on MonadScan <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Pending status */}
          {swapStatus?.status === 'PENDING' && txHash && (
            <div className="flex items-center gap-2 text-[var(--warning)] text-sm bg-warning-soft p-4 rounded-xl">
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Swap pending...</p>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--warning)] dark:text-[var(--warning)] hover:underline flex items-center gap-1"
                  >
                    View on MonadScan <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Failed status */}
          {swapStatus?.status === 'FAILED' && (
            <div className="flex items-center gap-2 text-[var(--destructive)] text-sm bg-destructive-soft p-4 rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="font-medium">Swap failed. Please try again.</p>
            </div>
          )}

          {/* Open in Jumper link */}
          {parsedAmount > 0 && (
            <a
              href={buildLifiSwapLink({
                fromToken,
                toToken,
                fromAmount: ethers.parseUnits(parsedAmount.toString(), fromDecimals).toString(),
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 justify-center"
            >
              Open in Jumper Exchange <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setAmount('');
              setQuote(null);
              setError(null);
              setTxHash(null);
              setSwapStatus(null);
            }}
            disabled={executing}
            className="w-full sm:w-auto rounded-xl py-5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExecuteSwap}
            disabled={!isSwapReady || !signerGetter || !walletAddress}
            className="action-pill primary w-full sm:w-auto !h-12"
          >
            {executing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Swapping...
              </>
            ) : !walletAddress ? (
              'Connect Wallet'
            ) : !quote ? (
              parsedAmount > 0 ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Getting quote...
                </>
              ) : (
                'Enter amount'
              )
            ) : (
              `Swap ${getTokenSymbol(fromToken)} → ${getTokenSymbol(toToken)}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
