'use client';

import { useState } from 'react';
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
import { TrendingUp, AlertCircle, Loader2, ArrowDown, Info } from 'lucide-react';

interface WithdrawDialogProps {
  children: React.ReactNode;
  shares: number;
  sharePrice: number;
  onRequest: (shareAmount: number) => void;
  isLoading?: boolean;
}

export function WithdrawDialog({
  children,
  shares,
  sharePrice,
  onRequest,
  isLoading = false,
}: WithdrawDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const parsedAmount = parseFloat(amount) || 0;
  const usdcToReceive = parsedAmount * sharePrice;
  const isValidAmount = parsedAmount > 0 && parsedAmount <= shares;

  const quickPercentages = [25, 50, 75, 100];

  const handleRequest = async () => {
    if (!isValidAmount) return;
    setIsProcessing(true);
    try {
      await onRequest(parsedAmount);
      setOpen(false);
      setAmount('');
    } catch (err) {
      console.error('Withdraw error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxAmount = () => setAmount(shares.toString());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-2xl border-border bg-card">
        <DialogHeader className="text-left">
          <div className="w-14 h-14 rounded-2xl bg-warning-soft flex items-center justify-center mb-4">
            <TrendingUp className="w-7 h-7 text-[var(--warning)]" />
          </div>
          <DialogTitle className="text-xl">Request Withdraw</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Burn gUSDC shares to queue a USDC claim. The operator will unwind positions, then you can claim once the vault is liquid.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="bg-muted rounded-2xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-muted-foreground">Your gUSDC</div>
                <div className="text-2xl font-bold mt-1">{shares.toFixed(4)}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  ≈ ${(shares * sharePrice).toFixed(2)} USDC
                </div>
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
            <label className="text-sm font-medium">Amount (gUSDC)</label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0.0000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pr-20 py-6 text-2xl font-semibold rounded-xl"
                step="0.0001"
                disabled={isProcessing || isLoading}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                gUSDC
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quick select</label>
            <div className="grid grid-cols-4 gap-2">
              {quickPercentages.map((pct) => {
                const pctAmount = (shares * pct) / 100;
                return (
                  <Button
                    key={pct}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(pctAmount.toFixed(4))}
                    disabled={shares === 0 || isProcessing || isLoading}
                    className={`btn-haptic font-medium rounded-xl py-5 ${
                      amount === pctAmount.toFixed(4)
                        ? 'border-foreground bg-foreground text-background hover:bg-foreground'
                        : 'border-border hover:bg-surface'
                    }`}
                  >
                    {pct}%
                  </Button>
                );
              })}
            </div>
          </div>

          {parsedAmount > 0 && (
            <>
              <div className="bg-muted rounded-2xl p-4 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">gUSDC to burn</span>
                  <span className="font-medium">{parsedAmount.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Share price</span>
                  <span className="font-medium">${sharePrice.toFixed(4)}</span>
                </div>

                <div className="flex justify-center py-2">
                  <ArrowDown className="w-5 h-5 text-muted-foreground" />
                </div>

                <div className="border-t border-border pt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Queued USDC claim</span>
                    <span className="font-bold text-xl text-[var(--success)]">
                      ${usdcToReceive.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {parsedAmount > shares && (
                <div className="flex items-center gap-2 text-[var(--destructive)] text-sm bg-destructive-soft p-4 rounded-xl">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-medium">Insufficient Shares</p>
                    <p className="text-[var(--destructive)]">You only have {shares.toFixed(4)} gUSDC.</p>
                  </div>
                </div>
              )}

              {isValidAmount && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed bg-info-soft p-3 rounded-xl">
                  <Info className="w-4 h-4 shrink-0 text-[var(--info)] mt-0.5" />
                  <span>
                    Your shares are burned immediately and a claim is queued. Once the vault has enough liquid USDC (after the operator unwinds), you can claim from the Withdrawals list.
                  </span>
                </div>
              )}
            </>
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
            onClick={handleRequest}
            disabled={!isValidAmount || isProcessing || isLoading}
            className="action-pill primary w-full sm:w-auto !h-12"
          >
            {isProcessing || isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Request Withdraw'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
