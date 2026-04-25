'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { MobileLayout } from '@/components/mobile-layout';
import { Input } from '@/components/ui/input';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    getMonadSwapQuote,
    executeMonadSwap,
    MONAD_TOKENS,
    MONAD_CHAIN_ID,
} from '@/lib/services/lifiService';
import { addSwapRecord } from '@/lib/services/swapHistory';
import { getUserBalances } from '@/lib/services/contractService';
import { EXPLORER_URL, CHAIN_ID, RPC_URL } from '@/lib/services/contractService';
import { MONAD_MAINNET } from '@/lib/types';
import {
    ArrowLeft,
    Zap,
    Brain,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ExternalLink,
    ChevronRight,
    Sparkles,
    TrendingUp,
} from 'lucide-react';

// ─── Protocol definitions ─────────────────────────────────────────────────────

interface Protocol {
    id: string;
    name: string;
    icon: string;
    apy: number;
    risk: 'low' | 'medium' | 'high';
    assets: string[];
    desc: string;
    tvl: string;
    toToken: string;         // token address to swap USDC into
    toSymbol: string;        // human label
    toDecimals: number;
}

const PROTOCOLS: Protocol[] = [
    {
        id: 'kuru',
        name: 'Kuru Exchange',
        icon: '⚡',
        apy: 22.5,
        risk: 'high',
        assets: ['XAUt0', 'WBTC'],
        desc: 'Monad-native order-book DEX. Market-make on gold & BTC pairs.',
        tvl: '$12.1M',
        toToken: MONAD_TOKENS.XAUt0.address,
        toSymbol: 'XAUt0',
        toDecimals: 6,
    },
    {
        id: 'neverland',
        name: 'Neverland Finance',
        icon: '🌿',
        apy: 18.5,
        risk: 'medium',
        assets: ['XAUt0'],
        desc: 'Gold-backed yield farming native to Monad. Earn yield on tokenised gold.',
        tvl: '$3.2M',
        toToken: MONAD_TOKENS.XAUt0.address,
        toSymbol: 'XAUt0',
        toDecimals: 6,
    },
    {
        id: 'ambient',
        name: 'Ambient Finance',
        icon: '💧',
        apy: 14.7,
        risk: 'medium',
        assets: ['WBTC', 'XAUt0'],
        desc: 'Concentrated liquidity AMM on Monad. Provide BTC/gold liquidity.',
        tvl: '$8.6M',
        toToken: MONAD_TOKENS.WBTC.address,
        toSymbol: 'WBTC',
        toDecimals: 8,
    },
    {
        id: 'morpho',
        name: 'Morpho Blue',
        icon: '🦋',
        apy: 12.3,
        risk: 'low',
        assets: ['WBTC'],
        desc: 'Peer-to-peer lending protocol. Supply WBTC, earn optimised lending yield.',
        tvl: '$8.9M',
        toToken: MONAD_TOKENS.WBTC.address,
        toSymbol: 'WBTC',
        toDecimals: 8,
    },
];

const RISK_STYLE = {
    low:    { cls: 'bg-info-soft text-[var(--info)]',       label: 'Low Risk' },
    medium: { cls: 'bg-warning-soft text-[var(--warning)]', label: 'Med Risk' },
    high:   { cls: 'bg-success-soft text-[var(--success)]', label: 'High Risk' },
};

// ─── AI analysis ─────────────────────────────────────────────────────────────

interface DeFiRecommendation {
    protocolId: string;
    reason: string;
    confidence: number;
    action: 'ENTER' | 'WAIT';
}

async function analyzeDeFi(usdcBalance: number): Promise<DeFiRecommendation> {
    const genAI = new GoogleGenerativeAI(
        process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
    );
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    });

    const prompt = `You are a DeFi yield advisor. The user has $${usdcBalance.toFixed(2)} USDC on Monad mainnet and wants to maximise yield while keeping exposure to BTC or tokenised gold (XAUt0).

Available protocols:
${PROTOCOLS.map(p => `- ${p.name} (id: ${p.id}): APY ${p.apy}%, risk: ${p.risk}, assets: ${p.assets.join('/')}, TVL: ${p.tvl}`).join('\n')}

Analyse risk-adjusted yield and recommend ONE protocol. Respond ONLY in valid JSON (no markdown):
{
  "protocolId": "<one of: kuru|neverland|ambient|morpho>",
  "reason": "<1-2 sentence explanation>",
  "confidence": <50-95>,
  "action": "ENTER" or "WAIT"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in AI response');
    const rec = JSON.parse(match[0]) as DeFiRecommendation;
    return {
        protocolId: PROTOCOLS.find(p => p.id === rec.protocolId) ? rec.protocolId : PROTOCOLS[0].id,
        reason: rec.reason ?? '',
        confidence: Math.min(95, Math.max(50, rec.confidence ?? 70)),
        action: rec.action === 'WAIT' ? 'WAIT' : 'ENTER',
    };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DeFiPage() {
    const router = useRouter();
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();

    const [usdcBalance, setUsdcBalance] = useState(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<Awaited<ReturnType<typeof getMonadSwapQuote>>>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [txError, setTxError] = useState<string | null>(null);

    const [analyzing, setAnalyzing] = useState(false);
    const [recommendation, setRecommendation] = useState<DeFiRecommendation | null>(null);
    const [autoRunning, setAutoRunning] = useState(false);

    const walletAddress = user?.wallet?.address;
    const activeWallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0];

    const selected = PROTOCOLS.find(p => p.id === selectedId) ?? null;
    const parsedAmount = parseFloat(amount) || 0;

    // Redirect if not authed
    useEffect(() => {
        if (ready && !authenticated) router.push('/');
    }, [ready, authenticated, router]);

    // Load USDC balance
    useEffect(() => {
        if (!walletAddress) return;
        getUserBalances(walletAddress).then(b => setUsdcBalance(b.usdc)).catch(() => {});
    }, [walletAddress]);

    // Get LiFi quote when amount + protocol change
    useEffect(() => {
        if (!selected || parsedAmount <= 0 || !walletAddress) {
            setQuote(null);
            return;
        }
        let cancelled = false;
        setQuoteLoading(true);

        const handle = setTimeout(async () => {
            try {
                const fromAmount = ethers.parseUnits(parsedAmount.toFixed(6), 6).toString();
                const q = await getMonadSwapQuote({
                    fromToken: MONAD_TOKENS.USDC.address,
                    toToken: selected.toToken,
                    fromAmount,
                    fromAddress: walletAddress,
                });
                if (!cancelled) { setQuote(q); setQuoteLoading(false); }
            } catch {
                if (!cancelled) { setQuote(null); setQuoteLoading(false); }
            }
        }, 600);

        return () => { cancelled = true; clearTimeout(handle); setQuoteLoading(false); };
    }, [selected, parsedAmount, walletAddress]);

    // Get signer with chain switch
    const getSigner = useCallback(async (): Promise<ethers.Signer> => {
        if (!activeWallet) throw new Error('No wallet connected');
        const provider = await activeWallet.getEthereumProvider();
        const chainIdHex = `0x${CHAIN_ID.toString(16)}`;
        try {
            const cur = await provider.request({ method: 'eth_chainId' });
            if (cur !== chainIdHex) {
                await provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: chainIdHex }],
                }).catch(async (e: { code?: number }) => {
                    if (e?.code === 4902) {
                        await provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: chainIdHex,
                                chainName: MONAD_MAINNET.name,
                                nativeCurrency: MONAD_MAINNET.nativeCurrency,
                                rpcUrls: [RPC_URL],
                                blockExplorerUrls: [EXPLORER_URL],
                            }],
                        });
                    }
                });
            }
        } catch { /* ignore */ }
        return new ethers.BrowserProvider(provider).getSigner();
    }, [activeWallet]);

    // Execute stake (swap USDC → protocol asset via LiFi)
    const handleStake = useCallback(async (proto: Protocol, q: typeof quote) => {
        if (!q || parsedAmount <= 0) return;
        setExecuting(true);
        setTxError(null);
        setTxHash(null);
        try {
            const signer = await getSigner();
            const result = await executeMonadSwap(signer, q);
            setTxHash(result.txHash);

            addSwapRecord({
                id: `defi-${Date.now()}`,
                fromToken: MONAD_TOKENS.USDC.address,
                fromTokenSymbol: 'USDC',
                toToken: proto.toToken,
                toTokenSymbol: proto.toSymbol,
                fromAmount: ethers.parseUnits(parsedAmount.toFixed(6), 6).toString(),
                fromAmountHuman: parsedAmount,
                toAmount: q.toAmount,
                toAmountHuman: Number(ethers.formatUnits(q.toAmount, proto.toDecimals)),
                txHash: result.txHash,
                toolUsed: `${proto.name} via LiFi`,
                timestamp: Date.now(),
                status: 'completed',
            });

            // Refresh balance
            if (walletAddress) getUserBalances(walletAddress).then(b => setUsdcBalance(b.usdc)).catch(() => {});
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Transaction failed');
        } finally {
            setExecuting(false);
        }
    }, [getSigner, parsedAmount, walletAddress]);

    // AI analysis
    const handleAnalyze = async () => {
        setAnalyzing(true);
        setRecommendation(null);
        try {
            const rec = await analyzeDeFi(usdcBalance);
            setRecommendation(rec);
            // Auto-select recommended protocol
            if (rec.action === 'ENTER') setSelectedId(rec.protocolId);
        } catch {
            setRecommendation({
                protocolId: 'kuru',
                reason: 'AI unavailable. Showing highest APY option.',
                confidence: 60,
                action: 'ENTER',
            });
            setSelectedId('kuru');
        } finally {
            setAnalyzing(false);
        }
    };

    // Auto execute — pick recommended (or highest APY) with 10% of balance
    const handleAuto = async () => {
        if (!walletAddress || usdcBalance <= 0) return;
        setAutoRunning(true);
        setTxError(null);

        try {
            // Pick protocol
            const proto = recommendation?.action === 'ENTER'
                ? (PROTOCOLS.find(p => p.id === recommendation.protocolId) ?? PROTOCOLS[0])
                : PROTOCOLS[0];

            const autoAmount = Math.max(1, Math.floor(usdcBalance * 0.1 * 100) / 100);
            const fromAmount = ethers.parseUnits(autoAmount.toFixed(6), 6).toString();

            const q = await getMonadSwapQuote({
                fromToken: MONAD_TOKENS.USDC.address,
                toToken: proto.toToken,
                fromAmount,
                fromAddress: walletAddress,
            });

            if (!q) throw new Error('Could not get quote');

            setSelectedId(proto.id);
            setAmount(autoAmount.toString());
            setQuote(q);

            await handleStake(proto, q);
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Auto failed');
        } finally {
            setAutoRunning(false);
        }
    };

    if (!ready || !authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-foreground" />
            </div>
        );
    }

    return (
        <MobileLayout activeTab="pay">
            {/* Header */}
            <div className="bg-background sticky top-0 z-40 px-4 pt-12 pb-3 border-b border-border">
                <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => router.push('/dashboard')} className="p-2 rounded-full bg-muted hover:bg-secondary transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold">DeFi Yield</h1>
                        <p className="text-xs text-muted-foreground">
                            Balance: <span className="font-medium text-foreground">${usdcBalance.toFixed(2)} USDC</span>
                        </p>
                    </div>
                </div>

                {/* Action bar */}
                <div className="flex gap-2">
                    <button
                        onClick={handleAnalyze}
                        disabled={analyzing || autoRunning}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted hover:bg-secondary text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {analyzing
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                            : <><Brain className="w-4 h-4" /> Analyze</>}
                    </button>
                    <button
                        onClick={handleAuto}
                        disabled={autoRunning || analyzing || usdcBalance <= 0}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold transition-colors disabled:opacity-50 active:scale-[0.98]"
                    >
                        {autoRunning
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
                            : <><Zap className="w-4 h-4" /> Auto</>}
                    </button>
                </div>
            </div>

            <div className="px-4 py-4 space-y-4 pb-28">

                {/* AI Recommendation banner */}
                {recommendation && (
                    <div className={`ios-card p-4 flex gap-3 border ${
                        recommendation.action === 'ENTER'
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-warning/30 bg-warning-soft'
                    }`}>
                        <Sparkles className={`w-5 h-5 mt-0.5 shrink-0 ${recommendation.action === 'ENTER' ? 'text-primary' : 'text-[var(--warning)]'}`} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-sm font-semibold ${recommendation.action === 'ENTER' ? 'text-primary' : 'text-[var(--warning)]'}`}>
                                    {recommendation.action === 'ENTER'
                                        ? `AI: Enter ${PROTOCOLS.find(p => p.id === recommendation.protocolId)?.name}`
                                        : 'AI: Wait for better opportunity'}
                                </span>
                                <span className="text-xs text-muted-foreground">{recommendation.confidence}% confident</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{recommendation.reason}</p>
                        </div>
                    </div>
                )}

                {/* Protocol list */}
                <div className="space-y-2">
                    {PROTOCOLS.map(proto => {
                        const risk = RISK_STYLE[proto.risk];
                        const isSelected = selectedId === proto.id;
                        const isRecommended = recommendation?.protocolId === proto.id && recommendation.action === 'ENTER';

                        return (
                            <div key={proto.id} className={`ios-card overflow-hidden transition-all ${isSelected ? 'ring-2 ring-primary/40' : ''}`}>
                                {/* Protocol row */}
                                <button
                                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors text-left"
                                    onClick={() => setSelectedId(isSelected ? null : proto.id)}
                                >
                                    <span className="text-2xl">{proto.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold">{proto.name}</span>
                                            {isRecommended && (
                                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary text-white font-medium">AI Pick</span>
                                            )}
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${risk.cls}`}>{risk.label}</span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-sm text-muted-foreground">{proto.assets.join(' · ')}</span>
                                            <span className="text-xs text-muted-foreground">TVL {proto.tvl}</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-lg font-bold text-[var(--success)]">{proto.apy}%</p>
                                        <p className="text-xs text-muted-foreground">APY</p>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                                </button>

                                {/* Expanded stake panel */}
                                {isSelected && (
                                    <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                                        <p className="text-xs text-muted-foreground leading-relaxed">{proto.desc}</p>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Amount (USDC)</label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    placeholder="0.00"
                                                    value={amount}
                                                    onChange={e => { setAmount(e.target.value); setTxHash(null); setTxError(null); }}
                                                    className="rounded-xl py-5 text-lg font-semibold flex-1"
                                                    disabled={executing}
                                                />
                                                <button
                                                    onClick={() => setAmount((usdcBalance * 0.5).toFixed(2))}
                                                    className="px-3 py-2 rounded-xl bg-muted text-xs font-medium hover:bg-secondary transition-colors"
                                                >50%</button>
                                                <button
                                                    onClick={() => setAmount(usdcBalance.toFixed(2))}
                                                    className="px-3 py-2 rounded-xl bg-muted text-xs font-medium hover:bg-secondary transition-colors"
                                                >Max</button>
                                            </div>
                                        </div>

                                        {/* Quote preview */}
                                        {quoteLoading && (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Getting quote…
                                            </div>
                                        )}
                                        {quote && !quoteLoading && (
                                            <div className="bg-muted rounded-xl p-3 space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">You receive</span>
                                                    <span className="font-semibold">
                                                        {Number(ethers.formatUnits(quote.toAmount, proto.toDecimals)).toFixed(6)} {proto.toSymbol}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-xs text-muted-foreground">
                                                    <span>Via {quote.toolUsed}</span>
                                                    <span>Fee ${quote.feeUSD.toFixed(4)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Tx result */}
                                        {txHash && (
                                            <div className="flex items-center gap-2 text-sm bg-success-soft text-[var(--success)] rounded-xl p-3">
                                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium">Staked successfully</span>
                                                    <a
                                                        href={`${EXPLORER_URL}/tx/${txHash}`}
                                                        target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-xs mt-0.5 hover:underline"
                                                    >
                                                        {txHash.slice(0, 10)}…{txHash.slice(-6)}
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                        {txError && (
                                            <div className="flex items-start gap-2 text-sm bg-destructive-soft text-[var(--destructive)] rounded-xl p-3">
                                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                <p className="flex-1 break-all">{txError}</p>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => { if (quote) handleStake(proto, quote); }}
                                            disabled={!quote || parsedAmount <= 0 || executing || parsedAmount > usdcBalance}
                                            className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-primary text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                                        >
                                            {executing
                                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Staking…</>
                                                : parsedAmount > usdcBalance
                                                    ? 'Insufficient USDC'
                                                    : !quote && parsedAmount > 0
                                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting quote…</>
                                                        : <><TrendingUp className="w-4 h-4" /> Stake ${parsedAmount > 0 ? parsedAmount.toFixed(2) : '0.00'} → {proto.toSymbol}</>}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

            </div>
        </MobileLayout>
    );
}
