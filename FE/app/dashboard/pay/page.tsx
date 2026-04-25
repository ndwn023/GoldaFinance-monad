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
    DEFI_PROTOCOLS,
    depositToProtocol,
    type DeFiProtocol,
} from '@/lib/services/defiProtocolService';
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
    ArrowRight,
    Coins,
} from 'lucide-react';

// ─── AI analysis ─────────────────────────────────────────────────────────────

interface DeFiRecommendation {
    protocolId: string;
    reason: string;
    confidence: number;
    action: 'ENTER' | 'WAIT';
}

async function analyzeDeFi(usdcBalance: number, xautBalance: number, wbtcBalance: number): Promise<DeFiRecommendation> {
    const genAI = new GoogleGenerativeAI(
        process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
    );
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    });

    const prompt = `You are a DeFi yield advisor. User balances on Monad mainnet:
- USDC: $${usdcBalance.toFixed(2)}
- XAUt0 (tokenised gold): ${xautBalance.toFixed(6)}
- WBTC: ${wbtcBalance.toFixed(8)}

Available DeFi protocols:
${DEFI_PROTOCOLS.map(p => `- ${p.name} (id: ${p.id}): APY ${p.apy}%, risk: ${p.risk}, deposit: ${p.depositAsset}, TVL: ${p.tvl}`).join('\n')}

Flow: user swaps USDC → target asset (XAUt0 or WBTC) via LiFi if needed, then deposits into the protocol vault.
If user already holds the target asset, they skip the swap.

Analyse risk-adjusted yield and recommend ONE protocol. Respond ONLY in valid JSON (no markdown):
{
  "protocolId": "<one of: kuru-xaut|neverland-xaut|ambient-wbtc|morpho-wbtc>",
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
        protocolId: DEFI_PROTOCOLS.find(p => p.id === rec.protocolId) ? rec.protocolId : DEFI_PROTOCOLS[0].id,
        reason: rec.reason ?? '',
        confidence: Math.min(95, Math.max(50, rec.confidence ?? 70)),
        action: rec.action === 'WAIT' ? 'WAIT' : 'ENTER',
    };
}

// ─── Style maps ──────────────────────────────────────────────────────────────

const RISK_STYLE = {
    low:    { cls: 'bg-info-soft text-[var(--info)]',       label: 'Low Risk' },
    medium: { cls: 'bg-warning-soft text-[var(--warning)]', label: 'Med Risk' },
    high:   { cls: 'bg-destructive/10 text-destructive',    label: 'High Risk' },
};

// ─── Per-protocol execution state ────────────────────────────────────────────

interface ExecState {
    phase: 'idle' | 'swapping' | 'depositing' | 'done' | 'error';
    step1Hash: string | null;
    step2Hash: string | null;
    error: string | null;
}

const IDLE_STATE: ExecState = { phase: 'idle', step1Hash: null, step2Hash: null, error: null };

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DeFiPage() {
    const router = useRouter();
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();

    const [usdcBalance, setUsdcBalance] = useState(0);
    const [xautBalance, setXautBalance] = useState(0);
    const [wbtcBalance, setWbtcBalance] = useState(0);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [amount, setAmount]         = useState('');
    const [useOwnToken, setUseOwnToken] = useState(false); // skip swap if user has token

    const [quote, setQuote]           = useState<Awaited<ReturnType<typeof getMonadSwapQuote>>>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);

    const [execState, setExecState]   = useState<ExecState>(IDLE_STATE);

    const [analyzing, setAnalyzing]   = useState(false);
    const [recommendation, setRecommendation] = useState<DeFiRecommendation | null>(null);
    const [autoRunning, setAutoRunning] = useState(false);

    const walletAddress = user?.wallet?.address;
    const activeWallet  = wallets.find(w => w.walletClientType === 'privy') || wallets[0];
    const selected      = DEFI_PROTOCOLS.find(p => p.id === selectedId) ?? null;
    const parsedAmount  = parseFloat(amount) || 0;

    const tokenBalance = (proto: DeFiProtocol) =>
        proto.depositAsset === 'XAUt0' ? xautBalance : wbtcBalance;

    // Redirect if not authed
    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }, [history]);

    // ---- Auth gate -----------------------------------------------------------
    useEffect(() => {
        if (ready && !authenticated) router.push('/');
    }, [ready, authenticated, router]);

    // Load balances
    const refreshBalances = useCallback(() => {
        if (!walletAddress) return;
        getUserBalances(walletAddress).then(b => {
            setUsdcBalance(b.usdc);
            setXautBalance(b.xaut);
            setWbtcBalance(b.wbtc);
        }).catch(() => {});
    }, [walletAddress]);

    useEffect(() => { refreshBalances(); }, [refreshBalances]);

    // When protocol changes, decide whether to default to "own token" mode
    useEffect(() => {
        if (!selected) return;
        const bal = tokenBalance(selected);
        setUseOwnToken(bal > 0.000001);
        setAmount('');
        setQuote(null);
        setExecState(IDLE_STATE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    // LiFi quote (only when swapping USDC → target)
    useEffect(() => {
        if (!selected || useOwnToken || parsedAmount <= 0 || !walletAddress) {
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
                    toToken:   selected.depositToken.address,
                    fromAmount,
                    fromAddress: walletAddress,
                });
                if (!cancelled) { setQuote(q); setQuoteLoading(false); }
            } catch {
                if (!cancelled) { setQuote(null); setQuoteLoading(false); }
            }
        }, 600);

        return () => { cancelled = true; clearTimeout(handle); setQuoteLoading(false); };
    }, [selected, useOwnToken, parsedAmount, walletAddress]);

    // Signer with chain switch
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

    // ── Main execution: swap (optional) + deposit ──────────────────────────
    const handleStakeAndDeposit = useCallback(async (proto: DeFiProtocol) => {
        if (parsedAmount <= 0) return;
        setExecState(IDLE_STATE);

        const signer = await getSigner();
        const owner  = walletAddress!;

        let acquiredAmount: bigint;
        let step1Hash: string | null = null;

        if (!useOwnToken) {
            // ── Step 1: Swap USDC → target asset via LiFi ─────────────────
            setExecState(s => ({ ...s, phase: 'swapping' }));

            const fromAmountRaw = ethers.parseUnits(parsedAmount.toFixed(6), 6).toString();
            const q = quote ?? await getMonadSwapQuote({
                fromToken:   MONAD_TOKENS.USDC.address,
                toToken:     proto.depositToken.address,
                fromAmount:  fromAmountRaw,
                fromAddress: owner,
            });
            if (!q) throw new Error('No LiFi quote available');

            const swapResult = await executeMonadSwap(signer, q);
            step1Hash = swapResult.txHash;

            addSwapRecord({
                id:              `defi-swap-${Date.now()}`,
                fromToken:       MONAD_TOKENS.USDC.address,
                fromTokenSymbol: 'USDC',
                toToken:         proto.depositToken.address,
                toTokenSymbol:   proto.depositToken.symbol,
                fromAmount:      fromAmountRaw,
                fromAmountHuman: parsedAmount,
                toAmount:        q.toAmount,
                toAmountHuman:   Number(ethers.formatUnits(q.toAmount, proto.depositToken.decimals)),
                txHash:          step1Hash,
                toolUsed:        `${proto.name} via LiFi`,
                timestamp:       Date.now(),
                status:          'completed',
            });

            acquiredAmount = BigInt(q.toAmount);
            setExecState(s => ({ ...s, phase: 'depositing', step1Hash }));
        } else {
            // User already holds the target asset — skip swap
            acquiredAmount = ethers.parseUnits(parsedAmount.toFixed(proto.depositToken.decimals), proto.depositToken.decimals);
            setExecState(s => ({ ...s, phase: 'depositing' }));
        }

        // ── Step 2: Deposit into protocol vault ────────────────────────────
        let step2Hash: string | null = null;

        if (proto.contractAddress) {
            const result = await depositToProtocol(signer, proto, acquiredAmount);
            step2Hash = result.txHash;
        }
        // If contractAddress is null, we skip the on-chain deposit.
        // The UI will show the website link so the user can do it manually.

        setExecState({ phase: 'done', step1Hash, step2Hash, error: null });
        refreshBalances();
    }, [getSigner, parsedAmount, quote, useOwnToken, walletAddress, refreshBalances]);

    const handleExecute = useCallback(async (proto: DeFiProtocol) => {
        try {
            await handleStakeAndDeposit(proto);
        } catch (err) {
            setExecState(s => ({
                ...s,
                phase: 'error',
                error: err instanceof Error ? err.message : 'Transaction failed',
            }));
        }
    }, [handleStakeAndDeposit]);

    // AI analysis
    const handleAnalyze = async () => {
        setAnalyzing(true);
        setRecommendation(null);
        try {
            const rec = await analyzeDeFi(usdcBalance, xautBalance, wbtcBalance);
            setRecommendation(rec);
            if (rec.action === 'ENTER') setSelectedId(rec.protocolId);
        } catch {
            const fallback = DEFI_PROTOCOLS[0];
            setRecommendation({ protocolId: fallback.id, reason: 'AI unavailable — showing highest APY.', confidence: 60, action: 'ENTER' });
            setSelectedId(fallback.id);
        } finally {
            setAnalyzing(false);
        }
    };

    // Auto: pick recommended (or highest APY), use 10% of USDC balance
    const handleAuto = async () => {
        if (!walletAddress || usdcBalance <= 0) return;
        setAutoRunning(true);
        try {
            const proto = recommendation?.action === 'ENTER'
                ? (DEFI_PROTOCOLS.find(p => p.id === recommendation.protocolId) ?? DEFI_PROTOCOLS[0])
                : DEFI_PROTOCOLS[0];

            const autoAmount = Math.max(1, Math.floor(usdcBalance * 0.1 * 100) / 100);
            setSelectedId(proto.id);
            setUseOwnToken(false);
            setAmount(autoAmount.toString());

            // Small delay so state settles, then execute
            await new Promise(r => setTimeout(r, 100));
            await handleExecute(proto);
        } catch (err) {
            setExecState(s => ({
                ...s,
                phase: 'error',
                error: err instanceof Error ? err.message : 'Auto failed',
            }));
        } finally {
            setAutoRunning(false);
        }
    };

    // ---- Loading state -------------------------------------------------------
    if (!ready || !authenticated) {
        return (
            <MobileLayout activeTab="pay">
                <DetailPageSkeleton cards={4} />
            </MobileLayout>
        );
    }

    const isExecuting = execState.phase === 'swapping' || execState.phase === 'depositing';

    return (
        <MobileLayout activeTab="pay">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="bg-background sticky top-0 z-40 px-4 pt-12 pb-3 border-b border-border">
                <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => router.push('/dashboard')} className="p-2 rounded-full bg-muted hover:bg-secondary transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold">DeFi Yield</h1>
                        {/* Balance row */}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                                USDC <span className="font-medium text-foreground">${usdcBalance.toFixed(2)}</span>
                            </span>
                            {xautBalance > 0.000001 && (
                                <span className="text-xs text-muted-foreground">
                                    XAUt0 <span className="font-medium text-foreground">{xautBalance.toFixed(4)}</span>
                                </span>
                            )}
                            {wbtcBalance > 0.000001 && (
                                <span className="text-xs text-muted-foreground">
                                    WBTC <span className="font-medium text-foreground">{wbtcBalance.toFixed(6)}</span>
                                </span>
                            )}
                        </div>
                    </div>
                    <StatusPill status={status} />
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

            {/* ============================================================
                BODY
                ============================================================ */}
            <div className="px-4 pb-5 space-y-4 animate-fade-in">
                {/* HEADLINE STATS — proper raised cards (not inside the hero) */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="ios-card-elev p-4">
                        <p className="section-label mb-1">Total Stacked</p>
                        <p className="text-title-1 font-num leading-tight">
                            ${formatUSD(totalStacked)}
                        </p>
                        <p className="text-footnote text-muted-foreground mt-1 truncate">
                            {history.length} stack{history.length === 1 ? '' : 's'}
                            {totalShares > 0 && ` · ${totalShares.toFixed(4)} sh`}
                        </p>
                    </div>
                    <div className="ios-card-elev p-4">
                        <p className="section-label mb-1">Next Stack</p>
                        <p className="text-title-1 font-num leading-tight">
                            {countdown}
                        </p>
                        <p className="text-footnote text-muted-foreground mt-1 truncate">
                            {settings.enabled
                                ? `${labelFor(settings.frequency)} · $${formatUSD(settings.amountPerStack)}`
                                : 'Auto-stacking is paused'}
                        </p>
                    </div>
                </div>

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
                                        ? `AI Pick: ${DEFI_PROTOCOLS.find(p => p.id === recommendation.protocolId)?.name}`
                                        : 'AI: Wait for better opportunity'}
                                </span>
                                <span className="text-xs text-muted-foreground">{recommendation.confidence}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{recommendation.reason}</p>
                        </div>
                    </div>
                )}

                {/* Protocol list */}
                <div className="space-y-2">
                    {DEFI_PROTOCOLS.map(proto => {
                        const risk        = RISK_STYLE[proto.risk];
                        const isSelected  = selectedId === proto.id;
                        const isRec       = recommendation?.protocolId === proto.id && recommendation.action === 'ENTER';
                        const tokenBal    = tokenBalance(proto);
                        const hasToken    = tokenBal > 0.000001;
                        const state       = isSelected ? execState : IDLE_STATE;

                        return (
                            <div key={proto.id} className={`ios-card overflow-hidden transition-all ${isSelected ? 'ring-2 ring-primary/40' : ''}`}>
                                {/* Protocol row */}
                                <button
                                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors text-left"
                                    onClick={() => {
                                        setSelectedId(isSelected ? null : proto.id);
                                        if (!isSelected) setExecState(IDLE_STATE);
                                    }}
                                >
                                    <span className="text-2xl">{proto.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold">{proto.name}</span>
                                            {isRec && (
                                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary text-white font-medium">AI</span>
                                            )}
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${risk.cls}`}>{risk.label}</span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-sm text-muted-foreground">{proto.depositAsset}</span>
                                            <span className="text-xs text-muted-foreground">TVL {proto.tvl}</span>
                                            {hasToken && (
                                                <span className="text-xs text-[var(--success)] font-medium">
                                                    Have {tokenBal.toFixed(4)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-lg font-bold text-[var(--success)]">{proto.apy}%</p>
                                        <p className="text-xs text-muted-foreground">APY</p>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                                </button>

                                {/* Expanded panel */}
                                {isSelected && (
                                    <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">
                                        <p className="text-xs text-muted-foreground leading-relaxed">{proto.desc}</p>

                                        {/* 2-step flow diagram */}
                                        <div className="flex items-center gap-2 text-xs">
                                            <div className={`flex-1 rounded-lg p-2 text-center font-medium ${!useOwnToken ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground line-through'}`}>
                                                Step 1<br />
                                                <span className="font-normal">USDC → {proto.depositAsset}</span><br />
                                                <span className="opacity-70">via LiFi</span>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                            <div className={`flex-1 rounded-lg p-2 text-center font-medium ${proto.contractAddress ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                Step 2<br />
                                                <span className="font-normal">{proto.depositAsset} → Vault</span><br />
                                                <span className="opacity-70">{proto.contractAddress ? 'on-chain' : 'via website'}</span>
                                            </div>
                                        </div>

                                        {/* Skip swap toggle (if user has token) */}
                                        {hasToken && (
                                            <div className="flex items-center gap-2 bg-muted rounded-xl p-3">
                                                <Coins className="w-4 h-4 text-[var(--success)] shrink-0" />
                                                <p className="text-xs flex-1">
                                                    You already have <strong>{tokenBal.toFixed(4)} {proto.depositAsset}</strong>
                                                </p>
                                                <button
                                                    onClick={() => { setUseOwnToken(!useOwnToken); setAmount(''); }}
                                                    className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                                                        useOwnToken
                                                            ? 'bg-primary text-white'
                                                            : 'bg-background border border-border'
                                                    }`}
                                                >
                                                    {useOwnToken ? 'Use my token' : 'Buy with USDC'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Amount input */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">
                                                {useOwnToken
                                                    ? `Amount (${proto.depositAsset})`
                                                    : 'Amount (USDC)'}
                                            </label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    placeholder="0.00"
                                                    value={amount}
                                                    onChange={e => { setAmount(e.target.value); setExecState(IDLE_STATE); }}
                                                    className="rounded-xl py-5 text-lg font-semibold flex-1"
                                                    disabled={isExecuting}
                                                />
                                                <button
                                                    onClick={() => setAmount(
                                                        useOwnToken
                                                            ? (tokenBal * 0.5).toFixed(6)
                                                            : (usdcBalance * 0.5).toFixed(2)
                                                    )}
                                                    className="px-3 py-2 rounded-xl bg-muted text-xs font-medium hover:bg-secondary transition-colors"
                                                >50%</button>
                                                <button
                                                    onClick={() => setAmount(
                                                        useOwnToken
                                                            ? tokenBal.toFixed(6)
                                                            : usdcBalance.toFixed(2)
                                                    )}
                                                    className="px-3 py-2 rounded-xl bg-muted text-xs font-medium hover:bg-secondary transition-colors"
                                                >Max</button>
                                            </div>
                                        </div>

                                        {/* LiFi quote preview (swap step only) */}
                                        {!useOwnToken && (
                                            <>
                                                {quoteLoading && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Loader2 className="w-4 h-4 animate-spin" /> Getting quote…
                                                    </div>
                                                )}
                                                {quote && !quoteLoading && (
                                                    <div className="bg-muted rounded-xl p-3 space-y-1 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Step 1 output</span>
                                                            <span className="font-semibold">
                                                                {Number(ethers.formatUnits(quote.toAmount, proto.depositToken.decimals)).toFixed(6)} {proto.depositAsset}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between text-xs text-muted-foreground">
                                                            <span>Via {quote.toolUsed}</span>
                                                            <span>Fee ${quote.feeUSD.toFixed(4)}</span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground pt-1 border-t border-border">
                                                            Step 2: {Number(ethers.formatUnits(quote.toAmount, proto.depositToken.decimals)).toFixed(6)} {proto.depositAsset} → {proto.name} vault
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Execution progress */}
                                        {state.phase !== 'idle' && state.phase !== 'error' && (
                                            <div className="space-y-1.5">
                                                <StepRow
                                                    n={1}
                                                    label={useOwnToken ? 'Skipped (using own token)' : 'Swap USDC → ' + proto.depositAsset}
                                                    done={state.step1Hash !== null || useOwnToken}
                                                    active={state.phase === 'swapping'}
                                                    hash={state.step1Hash}
                                                    skipped={useOwnToken}
                                                />
                                                <StepRow
                                                    n={2}
                                                    label={'Deposit ' + proto.depositAsset + ' → ' + proto.name}
                                                    done={state.step2Hash !== null || (state.phase === 'done' && !proto.contractAddress)}
                                                    active={state.phase === 'depositing'}
                                                    hash={state.step2Hash}
                                                    skipped={false}
                                                />
                                            </div>
                                        )}

                                        {/* Done state */}
                                        {state.phase === 'done' && (
                                            <div className="flex items-start gap-2 text-sm bg-success-soft text-[var(--success)] rounded-xl p-3">
                                                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                                                <div className="flex-1">
                                                    <p className="font-medium">
                                                        {proto.contractAddress ? 'Staked successfully!' : 'Swap complete!'}
                                                    </p>
                                                    {!proto.contractAddress && (
                                                        <a
                                                            href={proto.websiteUrl}
                                                            target="_blank" rel="noopener noreferrer"
                                                            className="text-xs flex items-center gap-1 mt-1 hover:underline"
                                                        >
                                                            Deposit {proto.depositAsset} at {proto.name}
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Error state */}
                                        {state.phase === 'error' && (
                                            <div className="flex items-start gap-2 text-sm bg-destructive/10 text-destructive rounded-xl p-3">
                                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                <p className="flex-1 break-all">{state.error}</p>
                                            </div>
                                        )}

                                        {/* Execute button */}
                                        <button
                                            onClick={() => handleExecute(proto)}
                                            disabled={
                                                parsedAmount <= 0 ||
                                                isExecuting ||
                                                (!useOwnToken && !quote && parsedAmount > 0) ||
                                                (!useOwnToken && parsedAmount > usdcBalance) ||
                                                (useOwnToken && parsedAmount > tokenBal)
                                            }
                                            className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-primary text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                                        >
                                            {isExecuting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {execState.phase === 'swapping' ? 'Swapping…' : 'Depositing…'}
                                                </>
                                            ) : !useOwnToken && !quote && parsedAmount > 0 ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Getting quote…</>
                                            ) : !useOwnToken && parsedAmount > usdcBalance ? (
                                                'Insufficient USDC'
                                            ) : useOwnToken && parsedAmount > tokenBal ? (
                                                `Insufficient ${proto.depositAsset}`
                                            ) : (
                                                <>
                                                    <TrendingUp className="w-4 h-4" />
                                                    {useOwnToken
                                                        ? `Deposit ${parsedAmount > 0 ? parsedAmount.toFixed(6) : '0'} ${proto.depositAsset}`
                                                        : `Swap + Stake $${parsedAmount > 0 ? parsedAmount.toFixed(2) : '0'} → ${proto.depositAsset}`}
                                                </>
                                            )}
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

// ─── Step progress row ────────────────────────────────────────────────────────

function StepRow({
    n, label, done, active, hash, skipped,
}: {
    n: number;
    label: string;
    done: boolean;
    active: boolean;
    hash: string | null;
    skipped: boolean;
}) {
    return (
        <div className={`flex items-center gap-2 text-xs ${skipped ? 'opacity-40' : ''}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px] ${
                done    ? 'bg-[var(--success)] text-white' :
                active  ? 'bg-primary text-white' :
                          'bg-muted text-muted-foreground'
            }`}>
                {done ? '✓' : active ? <Loader2 className="w-3 h-3 animate-spin" /> : n}
            </div>
            <span className={`flex-1 ${done ? 'text-[var(--success)]' : active ? 'text-foreground' : 'text-muted-foreground'}`}>
                {label}
            </span>
            {hash && (
                <a
                    href={`${EXPLORER_URL}/tx/${hash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                >
                    {hash.slice(0, 6)}…<ExternalLink className="w-2.5 h-2.5" />
                </a>
            )}
        </div>
    );
}
