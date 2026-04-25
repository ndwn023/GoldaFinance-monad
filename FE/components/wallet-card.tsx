'use client';

import { Eye, EyeOff, Copy, Check, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface WalletCardProps {
    usdcBalance: number;
    shares: number;
    sharePrice: number;
    assetLabel?: string;
    walletAddress?: string;
    /**
     * Visual variant.
     * - `ink`  (default): editorial near-black gradient with red highlight.
     * - `red`: brand-accent red gradient — use for hero/CTA contexts.
     * - `gold`: legacy gold gradient — kept for asset-detail screens.
     */
    variant?: 'ink' | 'red' | 'gold';
}

export function WalletCard({
    usdcBalance,
    shares,
    sharePrice,
    assetLabel = 'XAUt0',
    walletAddress,
    variant = 'ink',
}: WalletCardProps) {
    const [showBalance, setShowBalance] = useState(true);
    const [copied, setCopied] = useState(false);

    const shareValue = shares * sharePrice;

    const copyAddress = async () => {
        if (!walletAddress) return;
        await navigator.clipboard.writeText(walletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatAddress = (address: string) =>
        `${address.slice(0, 6)}…${address.slice(-4)}`;

    const formatMoney = (n: number) =>
        n.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    return (
        <div className={`vault-card ${variant} text-white`}>
            {/* Decorative concentric rings */}
            <div
                className="pointer-events-none absolute -top-6 -right-6 w-40 h-40 opacity-15"
                aria-hidden
            >
                <svg viewBox="0 0 200 200" fill="none">
                    <circle cx="100" cy="100" r="80" stroke="currentColor" />
                    <circle cx="100" cy="100" r="60" stroke="currentColor" />
                    <circle cx="100" cy="100" r="40" stroke="currentColor" />
                </svg>
            </div>

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="section-label !text-white/80">
                        Golda Vault
                    </span>
                </div>
                <button
                    onClick={() => setShowBalance(!showBalance)}
                    className="btn-haptic p-2 rounded-full bg-white/10 hover:bg-white/20"
                    aria-label={showBalance ? 'Hide balance' : 'Show balance'}
                >
                    {showBalance ? (
                        <Eye className="w-4 h-4" />
                    ) : (
                        <EyeOff className="w-4 h-4" />
                    )}
                </button>
            </div>

            {/* Savings value */}
            <div className="relative z-10">
                <p className="text-caption uppercase tracking-wider text-white/65 mb-1">
                    Savings Value
                </p>
                <p className="text-large-title md:text-display font-num">
                    {showBalance ? `$${formatMoney(shareValue)}` : '••••••'}
                </p>
                <p className="text-footnote text-white/70 mt-1">
                    {showBalance
                        ? `${shares.toFixed(4)} gUSDC`
                        : '••••'}
                    {' · backed by '}
                    {assetLabel}
                </p>
            </div>

            {/* USDC balance */}
            <div className="relative z-10">
                <p className="text-caption uppercase tracking-wider text-white/65 mb-1">
                    USDC Balance
                </p>
                <div className="flex items-baseline gap-2">
                    <span className="text-title-2 font-num">
                        {showBalance ? formatMoney(usdcBalance) : '••••'}
                    </span>
                    <span className="text-footnote font-medium text-white/80">
                        USDC
                    </span>
                </div>
            </div>

            {walletAddress && (
                <div className="relative z-10 flex items-center justify-between pt-3 border-t border-white/15">
                    <div>
                        <p className="text-caption uppercase tracking-wider text-white/65">
                            Wallet
                        </p>
                        <p className="font-mono text-footnote">
                            {formatAddress(walletAddress)}
                        </p>
                    </div>
                    <button
                        onClick={copyAddress}
                        className="btn-haptic p-2 rounded-lg bg-white/10 hover:bg-white/20"
                        aria-label="Copy wallet address"
                    >
                        {copied ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <Copy className="w-4 h-4" />
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
