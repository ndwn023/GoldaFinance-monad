'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { MobileLayout } from '@/components/mobile-layout';
import { WalletCard } from '@/components/wallet-card';
import { QuickActions } from '@/components/quick-actions';
import { DepositDialog } from '@/components/deposit-dialog';
import { WithdrawDialog } from '@/components/withdraw-dialog';
import { useGoldaVault } from '@/lib/hooks/useAureoContract';
import { useTransactionHistory, formatTransactionDate } from '@/lib/hooks/useTransactionHistory';
import type { SavingsAssetId } from '@/lib/types';
import {
    Bell,
    Settings,
    TrendingUp,
    Sparkles,
    ArrowUpRight,
    ArrowDownLeft,
    ChevronRight,
    Loader2,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    ExternalLink,
    Coins,
    Hourglass,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
    const { ready, authenticated, user } = usePrivy();
    const router = useRouter();

    const {
        balances,
        withdrawals,
        isLoading: contractLoading,
        error: contractError,
        isConnected,
        walletAddress,
        fetchBalances,
        deposit,
        requestWithdraw,
        claim,
        contractAddresses,
        explorerUrl,
    } = useGoldaVault();

    const {
        transactions,
        isLoading: txLoading,
        refetch: refetchTx,
    } = useTransactionHistory(walletAddress);

    const [isProcessing, setIsProcessing] = useState(false);
    const [notification, setNotification] = useState<{
        type: 'success' | 'error' | 'info';
        message: string;
    } | null>(null);
    const [selectedAsset, setSelectedAsset] = useState<SavingsAssetId>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('golda_asset') as SavingsAssetId) || 'XAUT';
        }
        return 'XAUT';
    });
    const [claimingId, setClaimingId] = useState<number | null>(null);

    useEffect(() => {
        if (ready && !authenticated) router.push('/');
    }, [ready, authenticated, router]);

    useEffect(() => {
        if (notification) {
            const t = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(t);
        }
    }, [notification]);

    const persistAsset = (asset: SavingsAssetId) => {
        setSelectedAsset(asset);
        if (typeof window !== 'undefined') localStorage.setItem('golda_asset', asset);
    };

    const handleDeposit = async (amount: number, asset: SavingsAssetId) => {
        setIsProcessing(true);
        persistAsset(asset);
        try {
            // Asset preference is persisted locally; the operator reads it off-chain
            // to route USDC via LiFi. The on-chain deposit is asset-agnostic.
            await fetch('/api/deposits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress,
                    amount,
                    asset,
                }),
            }).catch(() => null); // non-blocking

            const result = await deposit(amount);
            if (result.success) {
                setNotification({
                    type: 'success',
                    message: `Deposited $${amount.toFixed(2)} USDC. Routing into ${asset}.`,
                });
                await refetchTx();
            } else {
                setNotification({ type: 'error', message: result.error || 'Deposit failed' });
            }
        } catch (err) {
            console.error('Deposit error:', err);
            setNotification({ type: 'error', message: 'Deposit failed' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRequestWithdraw = async (shareAmount: number) => {
        setIsProcessing(true);
        try {
            const result = await requestWithdraw(shareAmount);
            if (result.success) {
                setNotification({
                    type: 'success',
                    message: `Requested withdraw of ${shareAmount.toFixed(4)} gUSDC`,
                });
                await refetchTx();
            } else {
                setNotification({ type: 'error', message: result.error || 'Withdraw failed' });
            }
        } catch (err) {
            console.error('Withdraw error:', err);
            setNotification({ type: 'error', message: 'Withdraw failed' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClaim = async (id: number) => {
        setClaimingId(id);
        try {
            const result = await claim(id);
            if (result.success) {
                setNotification({ type: 'success', message: `Claimed withdrawal #${id}` });
                await refetchTx();
            } else {
                setNotification({ type: 'error', message: result.error || 'Claim failed' });
            }
        } finally {
            setClaimingId(null);
        }
    };

    if (!ready || !authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-foreground mx-auto" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    const getTxIcon = (type: string) => {
        switch (type) {
            case 'deposit':
            case 'claim':
                return <ArrowDownLeft className="w-5 h-5 text-[var(--success)]" />;
            case 'withdraw_request':
                return <ArrowUpRight className="w-5 h-5 text-[var(--warning)]" />;
            case 'swap':
                return <Sparkles className="w-5 h-5 text-[var(--info)]" />;
            default:
                return <Sparkles className="w-5 h-5 text-[var(--accent)]" />;
        }
    };

    const getTxBg = (type: string) => {
        switch (type) {
            case 'deposit':
            case 'claim':
                return 'bg-success-soft';
            case 'withdraw_request':
                return 'bg-warning-soft';
            case 'swap':
                return 'bg-info-soft';
            default:
                return 'bg-destructive-soft';
        }
    };

    const pendingWithdrawals = withdrawals.filter(w => !w.settled);

    // Right rail (≥lg desktop only) — sticky vault NAV summary.
    const desktopRail = (
        <div className="space-y-4 stagger-in">
            <div className="ios-card-elev p-5">
                <p className="section-label mb-2">Vault NAV</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-large-title font-num">
                        ${balances.navUSDC.toFixed(2)}
                    </span>
                    <span className="chip chip-success">
                        <TrendingUp className="w-3 h-3" /> Live
                    </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                        <p className="section-label">Share Price</p>
                        <p className="text-title-3 font-num">
                            ${balances.sharePrice.toFixed(4)}
                        </p>
                    </div>
                    <div>
                        <p className="section-label">Your Shares</p>
                        <p className="text-title-3 font-num">
                            {balances.shares.toFixed(4)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="ios-card p-5">
                <p className="section-label mb-3">Network</p>
                <p className="text-headline">Monad Mainnet</p>
                <div className="mt-3 space-y-1 text-footnote text-muted-foreground font-mono break-all">
                    <p>Vault: {contractAddresses.GOLDA_VAULT}</p>
                    <p>USDC: {contractAddresses.USDC}</p>
                    {walletAddress && <p>You: {walletAddress}</p>}
                </div>
            </div>
        </div>
    );

    return (
        <MobileLayout activeTab="home" rail={desktopRail}>
            {/* Notification Toast */}
            {notification && (
                <div
                    className={`toast-ios ${
                        notification.type === 'success'
                            ? 'bg-[var(--success)] text-white'
                            : notification.type === 'error'
                              ? 'bg-[var(--destructive)] text-white'
                              : 'bg-foreground text-background'
                    }`}
                >
                    {notification.type === 'success' && (
                        <CheckCircle2 className="w-5 h-5" />
                    )}
                    {notification.type === 'error' && (
                        <AlertCircle className="w-5 h-5" />
                    )}
                    <p className="flex-1">{notification.message}</p>
                </div>
            )}

            {/* Header */}
            <div className="px-4 md:px-0 pt-12 md:pt-0 pb-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="section-label">Welcome back</p>
                        <h1 className="text-title-1">
                            {user?.email?.address?.split('@')[0] || 'User'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                fetchBalances();
                                refetchTx();
                            }}
                            disabled={contractLoading}
                            className="btn-haptic p-2.5 rounded-full bg-surface hover:bg-surface-2 transition-colors"
                            aria-label="Refresh"
                        >
                            <RefreshCw
                                className={`w-5 h-5 text-foreground ${contractLoading ? 'animate-spin' : ''}`}
                            />
                        </button>
                        <button
                            className="btn-haptic p-2.5 rounded-full bg-surface hover:bg-surface-2 transition-colors"
                            aria-label="Notifications"
                        >
                            <Bell className="w-5 h-5 text-foreground" />
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/profile')}
                            className="btn-haptic p-2.5 rounded-full bg-surface hover:bg-surface-2 transition-colors"
                            aria-label="Settings"
                        >
                            <Settings className="w-5 h-5 text-foreground" />
                        </button>
                    </div>
                </div>

                <WalletCard
                    usdcBalance={balances.usdc}
                    shares={balances.shares}
                    sharePrice={balances.sharePrice}
                    assetLabel={selectedAsset}
                    walletAddress={walletAddress}
                    variant="ink"
                />
            </div>

            <div className="px-4 md:px-0 space-y-6 animate-fade-in">
                {contractError && (
                    <div className="ios-card p-4 flex items-center gap-3 text-[var(--destructive)] bg-destructive-soft">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-subhead">{contractError}</p>
                    </div>
                )}

                {/* Asset selector */}
                <div className="ios-card-elev p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-headline">Savings Asset</h3>
                            <p className="text-footnote text-muted-foreground">
                                Operator routes your USDC into this asset
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {(
                            [
                                { id: 'XAUT', label: 'XAUt0', desc: 'Tether Gold' },
                                { id: 'WBTC', label: 'BTC', desc: 'Wrapped BTC' },
                            ] as const
                        ).map((opt) => {
                            const active = selectedAsset === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => persistAsset(opt.id)}
                                    className={`btn-haptic rounded-xl border p-3 text-left transition-colors ${
                                        active
                                            ? 'border-foreground bg-foreground text-background'
                                            : 'border-border hover:bg-surface'
                                    }`}
                                >
                                    <p className="text-subhead font-semibold">
                                        {opt.label}
                                    </p>
                                    <p
                                        className={`text-footnote ${
                                            active
                                                ? 'text-background/70'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {opt.desc}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="ios-card-elev p-4">
                    <QuickActions />
                </div>

                {/* Portfolio Summary — visible on mobile only (desktop uses rail) */}
                <div className="grid grid-cols-2 gap-3 lg:hidden">
                    <div className="ios-card p-4">
                        <p className="section-label mb-1">Vault Shares</p>
                        <p className="text-title-2 font-num">
                            {balances.shares.toFixed(4)}
                        </p>
                        <p className="text-footnote text-[var(--success)]">
                            ≈ ${balances.shareValueUSDC.toFixed(2)}
                        </p>
                    </div>
                    <div className="ios-card p-4">
                        <p className="section-label mb-1">USDC Balance</p>
                        <p className="text-title-2 font-num">
                            ${balances.usdc.toFixed(2)}
                        </p>
                        <p className="text-footnote text-muted-foreground">
                            Liquid cash
                        </p>
                    </div>
                </div>

                {/* Vault NAV & share price — mobile only (desktop uses rail) */}
                <div className="ios-card-elev p-4 lg:hidden">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-headline">Vault NAV</h3>
                        <span className="chip chip-success">
                            <TrendingUp className="w-3 h-3" /> Live
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="section-label">Total NAV</p>
                            <p className="text-title-3 font-num">
                                ${balances.navUSDC.toFixed(2)}
                            </p>
                        </div>
                        <div>
                            <p className="section-label">Share price</p>
                            <p className="text-title-3 font-num">
                                ${balances.sharePrice.toFixed(4)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Deposit / Withdraw buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <DepositDialog
                        onDeposit={handleDeposit}
                        usdcBalance={balances.usdc}
                        sharePrice={balances.sharePrice}
                        selectedAsset={selectedAsset}
                        onAssetChange={persistAsset}
                        isLoading={isProcessing}
                    >
                        <Button
                            disabled={isProcessing || !isConnected}
                            className="action-pill primary w-full !h-14"
                        >
                            <Coins className="w-5 h-5 mr-2" />
                            Deposit
                        </Button>
                    </DepositDialog>

                    <WithdrawDialog
                        shares={balances.shares}
                        sharePrice={balances.sharePrice}
                        onRequest={handleRequestWithdraw}
                        isLoading={isProcessing}
                    >
                        <Button
                            disabled={isProcessing || !isConnected || balances.shares <= 0}
                            variant="outline"
                            className="action-pill w-full !h-14"
                        >
                            <TrendingUp className="w-5 h-5 mr-2" />
                            Withdraw
                        </Button>
                    </WithdrawDialog>
                </div>

                {/* Pending withdrawals / claims */}
                {withdrawals.length > 0 && (
                    <div className="ios-list">
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div>
                                <h3 className="text-headline">Withdrawal Queue</h3>
                                <p className="text-footnote text-muted-foreground">
                                    {pendingWithdrawals.length} pending,{' '}
                                    {withdrawals.length - pendingWithdrawals.length} settled
                                </p>
                            </div>
                            <Hourglass className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="divide-y divide-border max-h-64 overflow-y-auto">
                            {withdrawals.map((w) => (
                                <div key={w.id} className="p-4 flex items-center gap-3">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                            w.settled
                                                ? 'bg-surface-2'
                                                : w.claimable
                                                  ? 'bg-success-soft'
                                                  : 'bg-warning-soft'
                                        }`}
                                    >
                                        {w.settled ? (
                                            <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                                        ) : w.claimable ? (
                                            <ArrowDownLeft className="w-5 h-5 text-[var(--success)]" />
                                        ) : (
                                            <Hourglass className="w-5 h-5 text-[var(--warning)]" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-headline">
                                            #{w.id} · ${w.usdcOwed.toFixed(2)} USDC
                                        </p>
                                        <p className="text-footnote text-muted-foreground">
                                            {w.settled
                                                ? 'Settled'
                                                : w.claimable
                                                  ? 'Ready to claim'
                                                  : 'Waiting for liquidity'}
                                        </p>
                                    </div>
                                    {!w.settled && (
                                        <Button
                                            onClick={() => handleClaim(w.id)}
                                            disabled={!w.claimable || claimingId === w.id}
                                            size="sm"
                                            className="rounded-full"
                                        >
                                            {claimingId === w.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                'Claim'
                                            )}
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Transactions */}
                <div className="ios-list">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <h3 className="text-headline">Recent Activity</h3>
                        <button
                            onClick={() => router.push('/dashboard/history')}
                            className="btn-haptic text-subhead font-semibold flex items-center gap-1 hover:opacity-70"
                        >
                            See All
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="divide-y divide-border">
                        {txLoading ? (
                            <div className="p-8 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-foreground mx-auto" />
                            </div>
                        ) : transactions.length > 0 ? (
                            transactions.slice(0, 4).map((tx) => {
                                const { time } = formatTransactionDate(tx.timestamp);
                                return (
                                    <div
                                        key={tx.id}
                                        className="p-4 flex items-center gap-3"
                                    >
                                        <div
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${getTxBg(tx.type)}`}
                                        >
                                            {getTxIcon(tx.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-headline truncate">
                                                {tx.description}
                                            </p>
                                            <p className="text-footnote text-muted-foreground">
                                                {time}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p
                                                className={`text-subhead font-semibold font-num ${
                                                    tx.type === 'deposit' ||
                                                    tx.type === 'claim'
                                                        ? 'text-[var(--success)]'
                                                        : 'text-foreground'
                                                }`}
                                            >
                                                ${tx.amount.toFixed(2)}
                                            </p>
                                            <a
                                                href={`${explorerUrl}/tx/${tx.txHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-caption text-muted-foreground hover:text-foreground flex items-center gap-1 justify-end"
                                            >
                                                View <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-8 text-center">
                                <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                <p className="text-subhead text-muted-foreground">
                                    No activity yet
                                </p>
                                <p className="text-footnote text-muted-foreground mt-1">
                                    Deposit USDC to get started!
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Contract info — mobile-only (desktop has it in rail) */}
                <div className="ios-card p-3 text-footnote text-muted-foreground space-y-1 lg:hidden">
                    <p className="font-medium text-foreground">Network: Monad Mainnet</p>
                    <p className="font-mono truncate">
                        Vault: {contractAddresses.GOLDA_VAULT}
                    </p>
                    <p className="font-mono truncate">
                        USDC: {contractAddresses.USDC}
                    </p>
                    <p className="font-mono truncate">
                        Wallet: {walletAddress || 'Not connected'}
                    </p>
                </div>
            </div>
        </MobileLayout>
    );
}
