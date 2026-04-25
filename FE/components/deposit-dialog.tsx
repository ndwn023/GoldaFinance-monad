'use client';

import { useState, useEffect } from 'react';
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
import { Sparkles, Wallet, Loader2, AlertCircle, Zap } from 'lucide-react';
import type { SavingsAssetId } from '@/lib/types';
import {
  getDepositQuotePreview,
  type DepositQuotePreview,
} from '@/lib/services/lifiService';

interface DepositDialogProps {
  children: React.ReactNode;
  onDeposit: (amount: number, asset: SavingsAssetId) => void;
  usdcBalance?: number;
  sharePrice?: number;
  selectedAsset?: SavingsAssetId;
  onAssetChange?: (asset: SavingsAssetId) => void;
  isLoading?: boolean;
}

const ASSET_OPTIONS: { id: SavingsAssetId; label: string; desc: string }[] = [
  { id: 'XAUT', label: 'XAUt0', desc: 'Tether Gold' },
  { id: 'WBTC', label: 'BTC', desc: 'Wrapped BTC' },
];

export function DepositDialog({
  children,
  onDeposit,
  usdcBalance = 0,
  sharePrice = 1,
  selectedAsset = 'XAUT',
  onAssetChange,
  isLoading = false,
}: DepositDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState<SavingsAssetId>(selectedAsset);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lifiQuote, setLifiQuote] = useState<DepositQuotePreview | null>(null);
  const [lifiLoading, setLifiLoading] = useState(false);

  const quickAmounts = [1, 5, 10, 25];
  const parsedAmount = parseFloat(amount) || 0;
  const hasEnoughBalance = parsedAmount <= usdcBalance;
  const meetsMin = parsedAmount >= 1; // MIN_DEPOSIT = 1 USDC
  const isValidAmount = parsedAmount > 0 && hasEnoughBalance && meetsMin;
  const estimatedShares = sharePrice > 0 ? parsedAmount / sharePrice : 0;

  // Fetch a LiFi preview quote when amount/asset stabilizes. We debounce
  // by 500ms so we don't hammer the LiFi API on every keystroke.
  useEffect(() => {
    if (!isValidAmount) {
      setLifiQuote(null);
      return;
    }
    let cancelled = false;
    setLifiLoading(true);
    const handle = setTimeout(async () => {
      const q = await getDepositQuotePreview(parsedAmount, asset);
      if (!cancelled) {
        setLifiQuote(q);
        setLifiLoading(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(handle);
      setLifiLoading(false);
    };
  }, [parsedAmount, asset, isValidAmount]);

  const handleDeposit = async () => {
    if (!isValidAmount) return;

    setIsProcessing(true);
    try {
      await onDeposit(parsedAmount, asset);
      setOpen(false);
      setAmount('');
    } catch (err) {
      console.error('Deposit error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxAmount = () => setAmount(usdcBalance.toFixed(2));

  const handlePickAsset = (next: SavingsAssetId) => {
    setAsset(next);
    onAssetChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-2xl border-border bg-card">
        <DialogHeader className="text-left">
          <div className="w-14 h-14 rounded-2xl bg-success-soft flex items-center justify-center mb-4">
            <Wallet className="w-7 h-7 text-[var(--success)]" />
          </div>
          <DialogTitle className="text-xl">Deposit to Golda Vault</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Deposit USDC and receive gUSDC shares. The operator will route your funds into your chosen savings asset via LiFi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Asset selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Savings asset</label>
            <div className="grid grid-cols-2 gap-2">
              {ASSET_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handlePickAsset(opt.id)}
                  disabled={isProcessing || isLoading}
                  className={`btn-haptic rounded-xl border p-3 text-left transition-colors ${
                    asset === opt.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border hover:bg-surface'
                  }`}
                >
                  <p className="text-subhead font-semibold">{opt.label}</p>
                  <p
                    className={`text-footnote ${
                      asset === opt.id
                        ? 'text-background/70'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Available Balance */}
          <div className="bg-muted rounded-2xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-muted-foreground">Available USDC</div>
                <div className="text-2xl font-bold mt-1">${usdcBalance.toFixed(2)}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMaxAmount}
                className="rounded-xl"
              >
                Max
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (USDC)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
                $
              </span>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10 py-6 text-2xl font-semibold rounded-xl"
                disabled={isProcessing || isLoading}
              />
            </div>
            <p className="text-xs text-muted-foreground">Minimum deposit: 1 USDC</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quick select</label>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((quick) => (
                <Button
                  key={quick}
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(quick.toString())}
                  disabled={quick > usdcBalance || isProcessing || isLoading}
                  className={`btn-haptic font-medium rounded-xl py-5 ${
                    amount === quick.toString()
                      ? 'border-foreground bg-foreground text-background hover:bg-foreground'
                      : 'border-border hover:bg-surface'
                  } ${quick > usdcBalance ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  ${quick}
                </Button>
              ))}
            </div>
          </div>

          {parsedAmount > 0 && !hasEnoughBalance && (
            <div className="flex items-center gap-2 text-[var(--destructive)] text-sm bg-destructive-soft p-4 rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Insufficient Balance</p>
                <p className="text-[var(--destructive)]">You only have ${usdcBalance.toFixed(2)} USDC.</p>
              </div>
            </div>
          )}

          {parsedAmount > 0 && !meetsMin && hasEnoughBalance && (
            <div className="flex items-center gap-2 text-[var(--warning)] text-sm bg-warning-soft p-4 rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>Minimum deposit is 1 USDC.</p>
            </div>
          )}

          {isValidAmount && (
            <div className="bg-warning-soft border border-border/50 dark:border-border/30 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[var(--warning)] mt-0.5 shrink-0" />
                <div className="space-y-2 text-sm w-full">
                  <p className="font-medium text-foreground">Transaction Preview</p>
                  <div className="space-y-1 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>You deposit:</span>
                      <span className="font-medium text-foreground">${parsedAmount.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. gUSDC shares:</span>
                      <span className="font-medium text-[var(--warning)]">{estimatedShares.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Savings asset:</span>
                      <span className="font-medium text-foreground">{asset}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Zap className="w-3.5 h-3.5 text-[var(--info)]" />
                      <span className="font-medium text-foreground">LiFi route preview</span>
                      {lifiLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                    </div>
                    {lifiQuote ? (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>You will get ~</span>
                          <span className="font-medium text-foreground">
                            {lifiQuote.estimatedAmount.toFixed(6)} {lifiQuote.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Price:</span>
                          <span className="font-medium text-foreground">
                            ${lifiQuote.pricePerUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {lifiQuote.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Route via:</span>
                          <span className="font-medium text-foreground">{lifiQuote.toolUsed}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Est. fees:</span>
                          <span className="font-medium text-foreground">${lifiQuote.feeUSD.toFixed(2)}</span>
                        </div>
                      </div>
                    ) : !lifiLoading ? (
                      <p className="text-xs text-muted-foreground">
                        Routing preview unavailable. Operator will still execute the swap.
                      </p>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/50">
                    If USDC allowance is insufficient, an approve tx will run first, then the deposit.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setAmount('');
            }}
            disabled={isProcessing || isLoading}
            className="w-full sm:w-auto rounded-xl py-5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeposit}
            disabled={!isValidAmount || isProcessing || isLoading}
            className="action-pill primary w-full sm:w-auto !h-12"
          >
            {isProcessing || isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Deposit USDC'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
