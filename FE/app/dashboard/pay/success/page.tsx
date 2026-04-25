'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle, Share2, Copy, Check, ExternalLink } from 'lucide-react';
import { useState, Suspense } from 'react';
import { EXPLORER_URL } from '@/lib/services/contractService';

function SuccessContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [copied, setCopied] = useState(false);

    const amount = searchParams.get('amount') || '0';
    const recipient = searchParams.get('to') || '';
    const txHash = searchParams.get('tx') || '';

    const tokenName = 'USDC';
    const amountDisplay = `$${parseFloat(amount).toFixed(2)}`;

    const copyTxHash = async () => {
        if (txHash) {
            await navigator.clipboard.writeText(txHash);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const explorerUrl = `${EXPLORER_URL}/tx/${txHash}`;

    const shareReceipt = async () => {
        const text = `I just sent ${amountDisplay} on GoldaFinance! 🪙\n\nView transaction: ${explorerUrl}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'GoldaFinance Payment Receipt',
                    text,
                    url: explorerUrl,
                });
            } catch {
                await navigator.clipboard.writeText(text);
            }
        } else {
            await navigator.clipboard.writeText(text);
        }
    };

    return (
        <div className="mobile-container bg-background min-h-screen flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                {/* Success Animation */}
                <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-full bg-success-soft flex items-center justify-center animate-fade-in">
                        <CheckCircle className="w-14 h-14 text-[var(--success)]" />
                    </div>
                    <div
                        className="absolute inset-0 w-24 h-24 rounded-full pulse-ring"
                        style={{ background: 'rgba(22, 163, 74, 0.3)' }}
                    />
                </div>

                <h1 className="text-large-title mb-2">Payment Sent!</h1>
                <p className="text-callout text-muted-foreground mb-8">
                    Your {tokenName} has been successfully transferred
                </p>

                {/* Amount */}
                <div className="ios-card-elev p-6 w-full max-w-sm mb-6">
                    <p className="text-caption uppercase tracking-wider text-muted-foreground mb-2">
                        Amount Sent
                    </p>
                    <p className="text-display font-num text-foreground">
                        ${parseFloat(amount).toFixed(2)}
                    </p>
                    <p className="text-footnote text-muted-foreground mt-1">
                        {tokenName}
                    </p>
                </div>

                {/* Details */}
                <div className="bg-muted rounded-2xl p-4 w-full max-w-sm space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">To</span>
                        <span className="font-mono">
                            {recipient.slice(0, 8)}...{recipient.slice(-6)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Network</span>
                        <span>Monad Mainnet</span>
                    </div>
                    {txHash && (
                        <div className="flex justify-between text-sm items-center">
                            <span className="text-muted-foreground">Transaction</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={copyTxHash}
                                    className="btn-haptic flex items-center gap-1 text-foreground hover:underline"
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    <span className="font-mono">
                                        {txHash.slice(0, 6)}...{txHash.slice(-4)}
                                    </span>
                                </button>
                                <a
                                    href={explorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 hover:bg-background rounded"
                                >
                                    <ExternalLink className="w-4 h-4 text-foreground" />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-6 space-y-3">
                <Button
                    onClick={() => router.push('/dashboard')}
                    className="action-pill primary w-full !h-14"
                >
                    Back to Home
                </Button>
                {txHash && (
                    <>
                        <Button
                            onClick={shareReceipt}
                            variant="outline"
                            className="action-pill w-full !h-14"
                        >
                            <Share2 className="w-5 h-5 mr-2" />
                            Share Receipt
                        </Button>
                        <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                        >
                            <Button
                                variant="ghost"
                                className="w-full !h-14 rounded-full text-muted-foreground hover:bg-surface"
                            >
                                <ExternalLink className="w-5 h-5 mr-2" />
                                View on Explorer
                            </Button>
                        </a>
                    </>
                )}
            </div>
        </div>
    );
}

export default function PaySuccessPage() {
    return (
        <Suspense fallback={
            <div className="mobile-container bg-background min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-foreground border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        }>
            <SuccessContent />
        </Suspense>
    );
}
