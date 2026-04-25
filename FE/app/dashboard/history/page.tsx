'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { MobileLayout } from '@/components/mobile-layout';
import { useTransactionHistory, formatTransactionDate, Transaction } from '@/lib/hooks/useTransactionHistory';
import { EXPLORER_URL } from '@/lib/services/contractService';
import {
    ArrowLeft,
    ArrowUpRight,
    ArrowDownLeft,
    Sparkles,
    Search,
    Calendar,
    Loader2,
    ExternalLink,
    RefreshCw,
    CheckCircle2,
    Hourglass,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

type FilterType = 'all' | 'deposit' | 'withdraw_request' | 'claim' | 'swap';

export default function HistoryPage() {
    const router = useRouter();
    const { ready, authenticated, user } = usePrivy();
    const [filter, setFilter] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const walletAddress = user?.wallet?.address;
    const { transactions, isLoading, error, refetch } = useTransactionHistory(walletAddress);

    useEffect(() => {
        if (ready && !authenticated) router.push('/');
    }, [ready, authenticated, router]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(tx => {
            if (filter !== 'all') {
                if (tx.type !== filter) return false;
            }
            if (searchQuery) {
                const s = searchQuery.toLowerCase();
                return (
                    tx.description.toLowerCase().includes(s) ||
                    tx.txHash.toLowerCase().includes(s)
                );
            }
            return true;
        });
    }, [transactions, filter, searchQuery]);

    const groupedTransactions = useMemo(() => {
        const groups: Record<string, Transaction[]> = {};
        filteredTransactions.forEach(tx => {
            const { date } = formatTransactionDate(tx.timestamp);
            if (!groups[date]) groups[date] = [];
            groups[date].push(tx);
        });
        return groups;
    }, [filteredTransactions]);

    if (!ready || !authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-foreground" />
            </div>
        );
    }

    const getIcon = (type: Transaction['type']) => {
        switch (type) {
            case 'deposit':
            case 'claim':
                return <ArrowDownLeft className="w-5 h-5 text-[var(--success)]" />;
            case 'withdraw_request':
                return <Hourglass className="w-5 h-5 text-[var(--warning)]" />;
            case 'swap':
                return <Sparkles className="w-5 h-5 text-[var(--info)]" />;
            default:
                return <Sparkles className="w-5 h-5 text-[var(--warning)]" />;
        }
    };

    const getBg = (type: Transaction['type']) => {
        switch (type) {
            case 'deposit':
            case 'claim':
                return 'bg-success-soft';
            case 'withdraw_request':
                return 'bg-warning-soft';
            case 'swap':
                return 'bg-info-soft';
            default:
                return 'bg-warning-soft';
        }
    };

    const amountDisplay = (tx: Transaction) => {
        const isInflow = tx.type === 'deposit' || tx.type === 'claim';
        const sign = isInflow ? '+' : '-';
        const primary = `${sign}$${tx.amount.toFixed(2)} USDC`;
        let secondary = '';
        if (tx.type === 'deposit') {
            secondary = tx.shares ? `+${tx.shares.toFixed(4)} gUSDC` : 'Deposited';
        } else if (tx.type === 'withdraw_request') {
            secondary = tx.shares ? `-${tx.shares.toFixed(4)} gUSDC` : 'Queued';
        } else if (tx.type === 'claim') {
            secondary = `Claim #${tx.withdrawalId ?? ''}`;
        } else if (tx.type === 'swap') {
            secondary = 'Auto-Swap';
        } else {
            secondary = 'Sent';
        }
        return { primary, secondary, isInflow };
    };

    const explorerBaseUrl = `${EXPLORER_URL}/tx/`;

    return (
        <MobileLayout activeTab="history">
            <div className="bg-background sticky top-0 z-40 px-4 pt-12 pb-4 border-b border-border">
                <div className="flex items-center gap-4 mb-4">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="p-2 rounded-full bg-muted hover:bg-secondary transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-xl font-semibold flex-1">Transaction History</h1>
                    <button
                        onClick={refetch}
                        disabled={isLoading}
                        className="p-2 rounded-full bg-muted hover:bg-secondary transition-colors"
                    >
                        <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search transactions..."
                        className="pl-10 py-5 rounded-xl"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'deposit', label: 'Deposits' },
                        { id: 'withdraw_request', label: 'Withdraws' },
                        { id: 'claim', label: 'Claims' },
                        { id: 'swap', label: 'Swaps' },
                    ].map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id as FilterType)}
                            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                filter === f.id
                                    ? 'bg-primary text-white'
                                    : 'bg-muted text-foreground hover:bg-secondary'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading && transactions.length === 0 && (
                <div className="flex items-center justify-center py-20">
                    <div className="text-center space-y-4">
                        <Loader2 className="w-10 h-10 animate-spin text-foreground mx-auto" />
                        <p className="text-muted-foreground">Loading transactions from Monad...</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="px-4 py-4">
                    <div className="bg-destructive-soft rounded-xl p-4 text-[var(--destructive)] dark:text-[var(--destructive)] text-center">
                        {error}
                        <button onClick={refetch} className="block mx-auto mt-2 underline">
                            Try again
                        </button>
                    </div>
                </div>
            )}

            <div className="px-4 py-4 space-y-6">
                {Object.entries(groupedTransactions).map(([date, txs]) => (
                    <div key={date}>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {date}
                        </h3>
                        <div className="ios-card overflow-hidden divide-y divide-border">
                            {txs.map((tx) => {
                                const { time } = formatTransactionDate(tx.timestamp);
                                const disp = amountDisplay(tx);

                                return (
                                    <div key={tx.id} className="p-4 flex items-center gap-3">
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${getBg(tx.type)}`}>
                                            {getIcon(tx.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-foreground truncate">{tx.description}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>{time}</span>
                                                <a
                                                    href={`${explorerBaseUrl}${tx.txHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 hover:text-foreground"
                                                >
                                                    <span className="font-mono">{tx.txHash.slice(0, 6)}...{tx.txHash.slice(-4)}</span>
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-semibold ${disp.isInflow ? 'text-[var(--success)]' : 'text-foreground'}`}>
                                                {disp.primary}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{disp.secondary}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {!isLoading && filteredTransactions.length === 0 && (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto bg-muted rounded-2xl flex items-center justify-center mb-4">
                            <Search className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground font-medium">No transactions found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {transactions.length === 0
                                ? 'Deposit USDC to start earning on Golda Vault'
                                : 'Try adjusting your filters'}
                        </p>
                    </div>
                )}
            </div>
        </MobileLayout>
    );
}
