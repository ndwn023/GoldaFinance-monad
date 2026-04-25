'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { MobileLayout } from '@/components/mobile-layout';
import { useAureoContract } from '@/lib/hooks/useAureoContract';
import { useAgentSettings } from '@/lib/hooks/useAgentSettings';
import { analyzeGoldMarket, chatWithAI, getMarketInsight, GoldMarketAnalysis } from '@/lib/services/aiService';
import { agentAutoSwap, LIFI_ASSET_MAP } from '@/lib/services/lifiService';
import type { SavingsAssetId } from '@/lib/types';
import { addSwapRecord } from '@/lib/services/swapHistory';
import { approveUSDCToLiFi, hasLiFiApproval, CHAIN_ID, RPC_URL, EXPLORER_URL } from '@/lib/services/contractService';
import { MONAD_MAINNET } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ethers } from 'ethers';
import {
    ArrowLeft,
    TrendingUp,
    TrendingDown,
    Zap,
    Clock,
    BarChart3,
    Sliders,
    Brain,
    Shield,
    Loader2,
    Send,
    Sparkles,
    MessageSquare,
    RefreshCw,
    AlertCircle,
    Power,
    Wifi,
    WifiOff,
    CloudOff,
    CheckCircle2,
    Save,
    Unlock,
    ArrowDownUp,
    ExternalLink,
} from 'lucide-react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface AnalysisHistory {
    id: string;
    analysis: GoldMarketAnalysis;
    timestamp: Date;
    executed: boolean;
    txHash?: string;
    swapOutput?: string;
}

const ASSET_OPTIONS: { id: SavingsAssetId; label: string; icon: string; desc: string }[] = [
    { id: 'XAUT', label: 'XAUt0', icon: '🥇', desc: 'Tether Gold — 1 token = 1 troy oz' },
    { id: 'WBTC', label: 'WBTC', icon: '₿', desc: 'Wrapped Bitcoin' },
];

export default function AgentPage() {
    const router = useRouter();
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();
    const { balances, isLoading: contractLoading, getSigner: vaultGetSigner } = useAureoContract();
    
    // Server-side Agent Settings
    const { 
        settings: serverSettings, 
        status: agentStatus,
        isLoading: settingsLoading,
        isSaving,
        updateSettings,
        refreshStatus 
    } = useAgentSettings();

    // Local Agent Settings (synced with server)
    const [minConfidence, setMinConfidence] = useState(70);
    const [autoExecute, setAutoExecute] = useState(false);
    const [riskLevel, setRiskLevel] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
    const [maxAmountPerTrade, setMaxAmountPerTrade] = useState(100);
    const [agentEnabled, setAgentEnabled] = useState(false);
    const [targetAsset, setTargetAsset] = useState<SavingsAssetId>('XAUT');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // LiFi approval state
    const [lifiApproved, setLifiApproved] = useState(false);
    const [checkingApproval, setCheckingApproval] = useState(true);
    const [approving, setApproving] = useState(false);

    // AI State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [currentAnalysis, setCurrentAnalysis] = useState<GoldMarketAnalysis | null>(null);
    const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistory[]>([]);
    const [marketInsight, setMarketInsight] = useState<string>('');
    const [goldPrice, setGoldPrice] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    // Fetch gold price from Pyth on mount
    useEffect(() => {
        let cancelled = false;
        fetch('/api/price')
            .then(r => r.json())
            .then(data => {
                if (!cancelled && data?.success && data.price?.currentPrice) {
                    setGoldPrice(data.price.currentPrice);
                }
            })
            .catch(console.error);
        return () => { cancelled = true; };
    }, []);

    // Chat State
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatting, setIsChatting] = useState(false);
    const [showChat, setShowChat] = useState(false);
    
    // Sync local state with server settings
    useEffect(() => {
        if (serverSettings) {
            setMinConfidence(serverSettings.minConfidence);
            setAutoExecute(serverSettings.autoExecute);
            setRiskLevel(serverSettings.riskLevel);
            setMaxAmountPerTrade(serverSettings.maxAmountPerTrade);
            setAgentEnabled(serverSettings.enabled);
            setTargetAsset(serverSettings.targetAsset);
        }
    }, [serverSettings]);

    // Check LiFi approval status
    useEffect(() => {
        if (!user?.wallet?.address) {
            setCheckingApproval(false);
            return;
        }
        hasLiFiApproval(user.wallet.address).then(approved => {
            setLifiApproved(approved);
            setCheckingApproval(false);
        }).catch(() => {
            setLifiApproved(false);
            setCheckingApproval(false);
        });
    }, [user?.wallet?.address]);
    
    // Track unsaved changes
    useEffect(() => {
        if (serverSettings) {
            const hasChanges = 
                minConfidence !== serverSettings.minConfidence ||
                autoExecute !== serverSettings.autoExecute ||
                riskLevel !== serverSettings.riskLevel ||
                maxAmountPerTrade !== serverSettings.maxAmountPerTrade ||
                agentEnabled !== serverSettings.enabled ||
                targetAsset !== serverSettings.targetAsset;
            setHasUnsavedChanges(hasChanges);
        }
    }, [minConfidence, autoExecute, riskLevel, maxAmountPerTrade, agentEnabled, targetAsset, serverSettings]);
    
    // Save settings to server
    const saveSettings = useCallback(async () => {
        try {
            await updateSettings({
                minConfidence,
                autoExecute,
                riskLevel,
                maxAmountPerTrade,
                enabled: agentEnabled,
                targetAsset,
            });
            setHasUnsavedChanges(false);
            setError(null);
        } catch (err) {
            setError('Failed to save agent settings');
        }
    }, [updateSettings, minConfidence, autoExecute, riskLevel, maxAmountPerTrade, agentEnabled, targetAsset]);

    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);

    // Fetch market insight on load
    useEffect(() => {
        if (goldPrice > 0) {
            getMarketInsight(goldPrice)
                .then(setMarketInsight)
                .catch(console.error);
        }
    }, [goldPrice]);

    // Get signer for LiFi swaps
    const getSigner = useCallback(async (): Promise<ethers.Signer> => {
        const activeWallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0];
        if (!activeWallet) throw new Error('No wallet connected');
        const provider = await activeWallet.getEthereumProvider();
        const chainIdHex = `0x${CHAIN_ID.toString(16)}`;

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
                                chainName: MONAD_MAINNET.name,
                                nativeCurrency: MONAD_MAINNET.nativeCurrency,
                                rpcUrls: [RPC_URL],
                                blockExplorerUrls: [EXPLORER_URL],
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
    }, [wallets]);

    // Grant infinite USDC approval to LiFi Diamond (one-time signature)
    const handleApproveLiFi = useCallback(async () => {
        setApproving(true);
        setError(null);
        try {
            const signer = await getSigner();
            const result = await approveUSDCToLiFi(signer);
            setLifiApproved(true);
            console.log('[Agent] LiFi approval tx:', result.txHash);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Approval failed';
            setError(msg);
        } finally {
            setApproving(false);
        }
    }, [getSigner]);

    const runAnalysis = useCallback(async () => {
        if (balances.usdc <= 0) {
            setError('You need USDC to run analysis');
            return;
        }

        setIsAnalyzing(true);
        setError(null);

        try {
            const analysis = await analyzeGoldMarket(balances.usdc, riskLevel);
            setCurrentAnalysis(analysis);

            const historyEntry: AnalysisHistory = {
                id: Date.now().toString(),
                analysis,
                timestamp: new Date(),
                executed: false,
            };
            setAnalysisHistory(prev => [historyEntry, ...prev.slice(0, 9)]);

            // Auto-execute if enabled and conditions met
            if (autoExecute && analysis.action === 'BUY' && analysis.confidence >= minConfidence) {
                await executeRecommendation(analysis);
            }
        } catch (err) {
            console.error('Analysis error:', err);
            setError('Failed to run AI analysis. Please check your API key.');
        } finally {
            setIsAnalyzing(false);
        }
    }, [balances.usdc, riskLevel, autoExecute, minConfidence]);

    const executeRecommendation = useCallback(async (analysis: GoldMarketAnalysis) => {
        if (analysis.action !== 'BUY' || balances.usdc <= 0) return;

        try {
            const tradeAmount = Math.min(balances.usdc, maxAmountPerTrade);
            
            if (!lifiApproved) {
                setError('Grant LiFi approval first — click "Unlock Auto-Swap" below');
                return;
            }

            // Execute LiFi swap: USDC -> target asset
            const signer = await getSigner();
            const result = await agentAutoSwap({
                signer,
                usdcAmount: tradeAmount,
                targetAsset,
            });

            // Record in local swap history
            addSwapRecord({
                id: `agent-swap-${Date.now()}`,
                fromToken: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
                fromTokenSymbol: 'USDC',
                toToken: targetInfo.address,
                toTokenSymbol: result.toSymbol,
                fromAmount: String(Math.round(tradeAmount * 1e6)),
                fromAmountHuman: tradeAmount,
                toAmount: String(Math.round(result.estimatedOutput * 10 ** targetInfo.decimals)),
                toAmountHuman: result.estimatedOutput,
                txHash: result.txHash,
                toolUsed: 'LiFi Agent',
                timestamp: Date.now(),
                status: 'completed',
            });

            // Update history to mark as executed
            setAnalysisHistory(prev =>
                prev.map(h =>
                    h.analysis === analysis ? { 
                        ...h, 
                        executed: true, 
                        txHash: result.txHash,
                        swapOutput: `${result.estimatedOutput.toFixed(6)} ${result.toSymbol}`,
                    } : h
                )
            );
            setError(null);
        } catch (err) {
            console.error('Execution error:', err);
            const msg = err instanceof Error ? err.message : 'Failed to execute swap';
            setError(msg);
        }
    }, [balances.usdc, maxAmountPerTrade, lifiApproved, targetAsset, getSigner]);

    const sendChatMessage = async () => {
        if (!chatInput.trim()) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: chatInput.trim(),
            timestamp: new Date(),
        };

        setChatMessages(prev => [...prev, userMessage]);
        setChatInput('');
        setIsChatting(true);

        try {
            const response = await chatWithAI(
                userMessage.content,
                goldPrice,
                balances.shares,
                balances.usdc
            );

            const assistantMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response,
                timestamp: new Date(),
            };

            setChatMessages(prev => [...prev, assistantMessage]);
        } catch (err) {
            console.error('Chat error:', err);
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "I'm having trouble responding right now. Please try again.",
                timestamp: new Date(),
            };
            setChatMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsChatting(false);
        }
    };

    if (!ready || !authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-foreground" />
            </div>
        );
    }

    const stats = {
        totalAnalyses: analysisHistory.length,
        buyRecommendations: analysisHistory.filter(h => h.analysis.action === 'BUY').length,
        avgConfidence: analysisHistory.length > 0
            ? analysisHistory.reduce((sum, h) => sum + h.analysis.confidence, 0) / analysisHistory.length
            : 0,
        executedTrades: analysisHistory.filter(h => h.executed).length,
    };

    const targetInfo = LIFI_ASSET_MAP[targetAsset];

    return (
        <MobileLayout activeTab="agent">
            {/* Header */}
            <div className="bg-background px-4 pt-12 pb-6">
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="p-2 rounded-full bg-muted hover:bg-secondary transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold">AI Agent</h1>
                        <p className="text-sm text-muted-foreground">Powered by Gemini Flash + LiFi</p>
                    </div>
                    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full ${
                        agentEnabled && autoExecute && lifiApproved
                            ? 'bg-success-soft'
                            : 'bg-warning-soft'
                    }`}>
                        <div className={`w-2 h-2 rounded-full animate-pulse ${
                            agentEnabled && autoExecute && lifiApproved ? 'bg-[var(--success)] hover:opacity-90' : 'bg-[var(--warning)] hover:opacity-90'
                        }`} />
                        <span className={`text-xs font-medium ${
                            agentEnabled && autoExecute && lifiApproved
                                ? 'text-[var(--success)] dark:text-[var(--success)]'
                                : 'text-[var(--warning)] dark:text-[var(--warning)]'
                        }`}>
                            {agentEnabled && autoExecute && lifiApproved ? 'Active' : 'Setup'}
                        </span>
                    </div>
                </div>

                {/* Market Insight Banner */}
                {marketInsight && (
                    <div className="ios-card p-4 mb-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-[var(--warning)]" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-muted-foreground mb-1">AI Market Insight</p>
                                <p className="text-sm">{marketInsight}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats Overview */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="ios-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-4 h-4 text-foreground" />
                            <span className="text-xs text-muted-foreground">Gold Price</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">${goldPrice.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground mt-1">via Pyth Oracle</p>
                    </div>
                    <div className="ios-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Brain className="w-4 h-4 text-[var(--info)]" />
                            <span className="text-xs text-muted-foreground">Analyses</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{stats.totalAnalyses}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats.executedTrades} auto-swaps
                        </p>
                    </div>
                </div>
            </div>

            <div className="px-4 space-y-6">
                {/* ============================================ */}
                {/* LiFi Approval — One-Time Unlock              */}
                {/* ============================================ */}
                <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
                    lifiApproved
                        ? 'border-[var(--success)]/50 bg-success-soft dark:bg-success-soft'
                        : 'border-border/50 bg-warning-soft dark:bg-warning-soft'
                }`}>
                    <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                lifiApproved
                                    ? 'bg-success-soft'
                                    : 'bg-warning-soft'
                            }`}>
                                {lifiApproved ? (
                                    <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
                                ) : (
                                    <Unlock className="w-5 h-5 text-[var(--warning)]" />
                                )}
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm">
                                    {lifiApproved ? 'Auto-Swap Unlocked' : 'Unlock Auto-Swap'}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    {lifiApproved
                                        ? 'USDC approved to LiFi — agent can swap anytime'
                                        : 'One signature to let agent swap USDC via LiFi'}
                                </p>
                            </div>
                        </div>
                        {!lifiApproved && (
                            <Button
                                onClick={handleApproveLiFi}
                                disabled={approving || checkingApproval}
                                size="sm"
                                className="rounded-xl bg-[var(--warning)] hover:opacity-90"
                            >
                                {approving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Unlock className="w-4 h-4 mr-1" />
                                        Approve
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                    {!lifiApproved && !checkingApproval && (
                        <div className="px-4 pb-4">
                            <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 text-xs text-muted-foreground">
                                <p className="font-medium text-foreground mb-1">How it works:</p>
                                <ul className="space-y-1 list-disc list-inside">
                                    <li>Sign 1 approval tx — USDC to LiFi Diamond</li>
                                    <li>Agent can then swap USDC to {targetInfo?.symbol ?? 'target asset'} automatically</li>
                                    <li>No more manual signatures needed for each swap</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Current Analysis */}
                <div className="ios-card overflow-hidden">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center">
                                <Brain className="w-5 h-5 text-foreground" />
                            </div>
                            <div>
                                <h3 className="font-semibold">AI Analysis</h3>
                                <p className="text-xs text-muted-foreground">Run market analysis</p>
                            </div>
                        </div>
                        <Button
                            onClick={runAnalysis}
                            disabled={isAnalyzing || contractLoading || balances.usdc <= 0}
                            size="sm"
                            className="rounded-xl"
                        >
                            {isAnalyzing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <Zap className="w-4 h-4 mr-1" />
                                    Analyze
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Analysis Result */}
                    {currentAnalysis && (
                        <div className="p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${currentAnalysis.action === 'BUY'
                                            ? 'bg-success-soft'
                                            : currentAnalysis.action === 'SELL'
                                                ? 'bg-destructive-soft'
                                                : 'bg-warning-soft'
                                        }`}>
                                        {currentAnalysis.action === 'BUY' ? (
                                            <TrendingUp className="w-6 h-6 text-[var(--success)]" />
                                        ) : currentAnalysis.action === 'SELL' ? (
                                            <TrendingDown className="w-6 h-6 text-[var(--destructive)]" />
                                        ) : (
                                            <Clock className="w-6 h-6 text-[var(--warning)]" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{currentAnalysis.action}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {currentAnalysis.confidence}% confidence
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-muted-foreground">Risk</p>
                                    <span className={`text-sm font-medium px-2 py-1 rounded-full ${currentAnalysis.riskLevel === 'low'
                                            ? 'bg-success-soft text-[var(--success)] dark:bg-[var(--success)] hover:opacity-90/20 dark:text-[var(--success)]'
                                            : currentAnalysis.riskLevel === 'high'
                                                ? 'bg-destructive-soft text-[var(--destructive)] dark:bg-[var(--destructive)] hover:opacity-90/20 dark:text-[var(--destructive)]'
                                                : 'bg-warning-soft text-[var(--warning)] dark:bg-[var(--warning)] hover:opacity-90/20 dark:text-[var(--warning)]'
                                        }`}>
                                        {currentAnalysis.riskLevel}
                                    </span>
                                </div>
                            </div>

                            <p className="text-sm text-muted-foreground">{currentAnalysis.reasoning}</p>

                            <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                                <span className="text-muted-foreground">Target Price</span>
                                <span className="font-medium">${currentAnalysis.priceTarget.toFixed(2)}</span>
                            </div>

                            {currentAnalysis.action === 'BUY' && currentAnalysis.confidence >= minConfidence && (
                                <Button
                                    onClick={() => executeRecommendation(currentAnalysis)}
                                    disabled={contractLoading || balances.usdc <= 0 || !lifiApproved}
                                    className="w-full bg-[var(--success)] hover:opacity-90"
                                >
                                    <ArrowDownUp className="w-4 h-4 mr-2" />
                                    {lifiApproved
                                        ? `Swap $${Math.min(balances.usdc, maxAmountPerTrade).toFixed(2)} USDC → ${targetInfo?.symbol ?? 'Asset'}`
                                        : 'Unlock Auto-Swap First'}
                                </Button>
                            )}
                        </div>
                    )}

                    {/* No Analysis Yet */}
                    {!currentAnalysis && !isAnalyzing && (
                        <div className="p-8 text-center">
                            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                            <p className="text-muted-foreground">Click Analyze to get AI recommendations</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                USDC Balance: ${balances.usdc.toFixed(2)}
                            </p>
                        </div>
                    )}

                    {/* Loading State */}
                    {isAnalyzing && (
                        <div className="p-8 text-center">
                            <Loader2 className="w-12 h-12 text-foreground mx-auto mb-3 animate-spin" />
                            <p className="text-muted-foreground">Analyzing market conditions...</p>
                            <p className="text-xs text-muted-foreground mt-1">Using Gemini Flash AI</p>
                        </div>
                    )}
                </div>

                {/* Error Display */}
                {error && (
                    <div className="flex items-center gap-3 p-4 bg-destructive-soft rounded-xl text-[var(--destructive)] dark:text-[var(--destructive)]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {/* Auto-Agent (Works Offline) */}
                <div className={`rounded-2xl border-2 overflow-hidden transition-all ${agentEnabled && autoExecute && lifiApproved ? 'border-[var(--success)] bg-success-soft dark:bg-success-soft' : 'border-border bg-card'}`}>
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${agentEnabled && autoExecute && lifiApproved ? 'bg-success-soft' : 'bg-surface'}`}>
                                <Power className={`w-5 h-5 ${agentEnabled && autoExecute && lifiApproved ? 'text-[var(--success)]' : 'text-foreground'}`} />
                            </div>
                            <div>
                                <h3 className="font-semibold flex items-center gap-2">
                                    Auto-Agent
                                    {agentEnabled && autoExecute && lifiApproved && (
                                        <span className="flex items-center gap-1 text-xs font-normal text-[var(--success)] dark:text-[var(--success)]">
                                            <Wifi className="w-3 h-3" />
                                            Auto-Swap Active
                                        </span>
                                    )}
                                </h3>
                                <p className="text-xs text-muted-foreground">AI swaps for you 24/7</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                const newEnabled = !agentEnabled;
                                setAgentEnabled(newEnabled);
                                if (newEnabled) setAutoExecute(true);
                            }}
                            className={`w-12 h-7 rounded-full p-1 transition-colors ${agentEnabled ? 'bg-[var(--success)] hover:opacity-90' : 'bg-muted'}`}
                        >
                            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${agentEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {agentEnabled && (
                        <div className="p-4 space-y-4 bg-success-soft/40">
                            {/* How it works */}
                            <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 text-xs text-muted-foreground">
                                <p className="font-medium text-foreground mb-1">How Auto-Agent Works:</p>
                                <ul className="space-y-1 list-disc list-inside">
                                    <li>AI monitors gold market every 5 minutes</li>
                                    <li>Automatically swaps USDC to your target asset via LiFi</li>
                                    <li>Works even when you close the app</li>
                                    <li>Requires one-time LiFi approval (unlock above)</li>
                                </ul>
                            </div>

                            {/* Target Asset Selector */}
                            <div>
                                <p className="font-medium text-sm mb-2">Target Asset</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {ASSET_OPTIONS.map((asset) => (
                                        <button
                                            key={asset.id}
                                            onClick={() => setTargetAsset(asset.id)}
                                            className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-colors ${
                                                targetAsset === asset.id
                                                    ? 'bg-primary text-white'
                                                    : 'bg-muted text-foreground hover:bg-secondary'
                                            }`}
                                        >
                                            <span className="text-base">{asset.icon}</span>
                                            <div className="mt-0.5">{asset.label}</div>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1.5">
                                    {ASSET_OPTIONS.find(a => a.id === targetAsset)?.desc}
                                </p>
                            </div>

                            {/* Auto Execute Toggle */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-sm">Auto Execute Swaps</p>
                                    <p className="text-xs text-muted-foreground">Automatically swap when confident</p>
                                </div>
                                <button
                                    onClick={() => setAutoExecute(!autoExecute)}
                                    className={`w-12 h-7 rounded-full p-1 transition-colors ${autoExecute ? 'bg-primary' : 'bg-muted'}`}
                                >
                                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${autoExecute ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {/* Max Amount per Trade */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-medium text-sm">Max Amount Per Trade</p>
                                    <span className="text-sm font-bold text-foreground">${maxAmountPerTrade}</span>
                                </div>
                                <input
                                    type="range"
                                    min="10"
                                    max="1000"
                                    step="10"
                                    value={maxAmountPerTrade}
                                    onChange={(e) => setMaxAmountPerTrade(parseInt(e.target.value))}
                                    className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                    <span>$10</span>
                                    <span>$1000</span>
                                </div>
                            </div>

                            {/* Minimum Confidence */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-medium text-sm">Minimum Confidence</p>
                                    <span className="text-sm font-bold text-foreground">{minConfidence}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="50"
                                    max="95"
                                    value={minConfidence}
                                    onChange={(e) => setMinConfidence(parseInt(e.target.value))}
                                    className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                                />
                            </div>

                            {/* Risk Level */}
                            <div>
                                <p className="font-medium text-sm mb-2">Risk Level</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['conservative', 'moderate', 'aggressive'] as const).map((level) => (
                                        <button
                                            key={level}
                                            onClick={() => setRiskLevel(level)}
                                            className={`py-2 px-3 rounded-xl text-xs font-medium capitalize transition-colors ${riskLevel === level
                                                ? 'bg-primary text-white'
                                                : 'bg-muted text-foreground hover:bg-secondary'
                                                }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Save Button */}
                            {hasUnsavedChanges && (
                                <Button
                                    onClick={saveSettings}
                                    disabled={isSaving}
                                    className="w-full bg-[var(--success)] hover:opacity-90"
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    Save & Activate Auto-Agent
                                </Button>
                            )}

                            {/* Status */}
                            {!hasUnsavedChanges && autoExecute && (
                                <div className="space-y-2">
                                    {lifiApproved ? (
                                        <div className="flex items-center gap-2 text-sm text-[var(--success)] dark:text-[var(--success)]">
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Auto-Agent active — swaps USDC to {targetInfo?.symbol}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-sm text-[var(--warning)] dark:text-[var(--warning)]">
                                            <AlertCircle className="w-4 h-4" />
                                            <span>Grant LiFi approval to enable auto-swaps</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Agent Settings (when Auto-Agent is off) */}
                {!agentEnabled && (
                    <div className="ios-card overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center">
                                <Sliders className="w-5 h-5 text-foreground" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Manual Settings</h3>
                                <p className="text-xs text-muted-foreground">For manual analysis mode</p>
                            </div>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Target Asset Selector */}
                            <div>
                                <p className="font-medium text-sm mb-2">Target Asset</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {ASSET_OPTIONS.map((asset) => (
                                        <button
                                            key={asset.id}
                                            onClick={() => setTargetAsset(asset.id)}
                                            className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-colors ${
                                                targetAsset === asset.id
                                                    ? 'bg-primary text-white'
                                                    : 'bg-muted text-foreground hover:bg-secondary'
                                            }`}
                                        >
                                            <span className="text-base">{asset.icon}</span>
                                            <div className="mt-0.5">{asset.label}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Minimum Confidence */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-medium text-sm">Minimum Confidence</p>
                                    <span className="text-sm font-bold text-foreground">{minConfidence}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="50"
                                    max="95"
                                    value={minConfidence}
                                    onChange={(e) => setMinConfidence(parseInt(e.target.value))}
                                    className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                                />
                            </div>

                            {/* Risk Level */}
                            <div>
                                <p className="font-medium text-sm mb-2">Risk Level</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['conservative', 'moderate', 'aggressive'] as const).map((level) => (
                                        <button
                                            key={level}
                                            onClick={() => setRiskLevel(level)}
                                            className={`py-2 px-3 rounded-xl text-xs font-medium capitalize transition-colors ${riskLevel === level
                                                ? 'bg-primary text-white'
                                                : 'bg-muted text-foreground hover:bg-secondary'
                                                }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Save Button for manual mode */}
                            {hasUnsavedChanges && (
                                <Button
                                    onClick={saveSettings}
                                    disabled={isSaving}
                                    className="w-full"
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    Save Settings
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* AI Chat */}
                <div className="ios-card overflow-hidden">
                    <button
                        onClick={() => setShowChat(!showChat)}
                        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-info-soft flex items-center justify-center">
                                <MessageSquare className="w-5 h-5 text-[var(--info)]" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-semibold">Chat with AI</h3>
                                <p className="text-xs text-muted-foreground">Ask about gold market</p>
                            </div>
                        </div>
                        <RefreshCw className={`w-5 h-5 text-muted-foreground transition-transform ${showChat ? 'rotate-180' : ''}`} />
                    </button>

                    {showChat && (
                        <div className="border-t border-border">
                            {/* Chat Messages */}
                            <div className="h-64 overflow-y-auto p-4 space-y-3">
                                {chatMessages.length === 0 && (
                                    <div className="text-center py-8">
                                        <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            Ask me anything about gold investing!
                                        </p>
                                    </div>
                                )}
                                {chatMessages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user'
                                                ? 'bg-primary text-white rounded-br-md'
                                                : 'bg-muted rounded-bl-md'
                                            }`}>
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                                {isChatting && (
                                    <div className="flex justify-start">
                                        <div className="bg-muted p-3 rounded-2xl rounded-bl-md">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Chat Input */}
                            <div className="p-4 border-t border-border flex gap-2">
                                <Input
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                                    placeholder="Ask about gold..."
                                    className="flex-1 rounded-xl"
                                    disabled={isChatting}
                                />
                                <Button
                                    onClick={sendChatMessage}
                                    disabled={!chatInput.trim() || isChatting}
                                    size="icon"
                                    className="rounded-xl"
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Analysis History */}
                {analysisHistory.length > 0 && (
                    <div className="ios-card overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center">
                                <Clock className="w-5 h-5 text-[var(--warning)]" />
                            </div>
                            <h3 className="font-semibold">Recent Analyses</h3>
                        </div>

                        <div className="divide-y divide-border max-h-80 overflow-y-auto">
                            {analysisHistory.slice(0, 5).map((entry) => (
                                <div key={entry.id} className="p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${entry.analysis.action === 'BUY'
                                                    ? 'bg-success-soft text-[var(--success)] dark:bg-[var(--success)] hover:opacity-90/20 dark:text-[var(--success)]'
                                                    : 'bg-warning-soft text-[var(--warning)] dark:bg-[var(--warning)] hover:opacity-90/20 dark:text-[var(--warning)]'
                                                }`}>
                                                {entry.analysis.action}
                                            </span>
                                            <span className="text-sm text-muted-foreground">
                                                {entry.analysis.confidence}%
                                            </span>
                                            {entry.executed && (
                                                <span className="flex items-center gap-1 text-xs text-[var(--success)]">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Swapped {entry.swapOutput}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {entry.timestamp.toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{entry.analysis.reasoning}</p>
                                    {entry.txHash && (
                                        <a
                                            href={`https://monadscan.com/tx/${entry.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-[var(--info)] hover:underline flex items-center gap-1 mt-1"
                                        >
                                            View tx <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Gemini + LiFi Info */}
                <div className="bg-info-soft rounded-2xl p-4 border border-border">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-sm">Gemini Flash + LiFi</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                                AI analysis by Google&apos;s Gemini 2.5 Flash. Swaps executed via LiFi protocol on Monad. One approval, autonomous trading.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </MobileLayout>
    );
}
