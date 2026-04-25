'use client';

import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import {
    Sparkles,
    Shield,
    Zap,
    ChevronRight,
    Wallet,
    ArrowRight,
    Bitcoin,
} from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
    const { login, authenticated, ready } = usePrivy();
    const router = useRouter();

    useEffect(() => {
        if (ready && authenticated) {
            router.push('/dashboard');
        }
    }, [ready, authenticated, router]);

    const features = [
        {
            icon: Shield,
            title: 'Inflation-proof Savings',
            description:
                'Gold and BTC-backed positions hedge against USD inflation',
        },
        {
            icon: Sparkles,
            title: 'LiFi + Yield Routing',
            description:
                'USDC auto-swapped into XAUt0 or BTC and supplied to Euler',
        },
        {
            icon: Zap,
            title: 'One Vault, One Click',
            description:
                'Deposit USDC, get gUSDC shares, claim anytime',
        },
    ];

    return (
        <div
            className="min-h-screen"
            style={{ background: 'var(--gradient-hero-bg)' }}
        >
            {/* Header — fixed pill on mobile, sticky strip on desktop */}
            <header className="sticky top-0 z-50 backdrop-blur-lg bg-background/70 border-b border-border">
                <div className="mx-auto max-w-[var(--content-desktop)] px-4 md:px-8 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span
                            className="golda-mark"
                            style={
                                {
                                    ['--mark-w' as string]: '52px',
                                    ['--mark-h' as string]: '32px',
                                } as React.CSSProperties
                            }
                        />
                        <span className="text-title-3">GoldaFinance</span>
                    </div>
                    <Button
                        onClick={login}
                        size="sm"
                        className="action-pill primary !h-10 !px-5"
                    >
                        Login
                    </Button>
                </div>
            </header>

            {/* Hero */}
            <section className="mx-auto max-w-[var(--content-desktop)] px-4 md:px-8 pt-10 md:pt-16 pb-10">
                <div className="lg:grid lg:grid-cols-[minmax(0,1.618fr)_minmax(280px,1fr)] lg:gap-12 lg:items-center">
                    <div>
                        <span className="chip chip-destructive mb-5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Inflation-proof USDC Savings
                        </span>

                        <h1 className="text-large-title md:text-display lg:text-hero leading-[0.96] mb-5">
                            Save in{' '}
                            <span className="bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
                                Gold
                            </span>{' '}
                            or{' '}
                            <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--red-700)] bg-clip-text text-transparent">
                                BTC
                            </span>
                            <br />
                            Deposit in{' '}
                            <span className="bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">
                                USDC
                            </span>
                        </h1>

                        <p className="text-body md:text-callout text-muted-foreground max-w-[60ch] mb-8 leading-relaxed">
                            GoldaFinance routes your USDC into XAUt0 or BTC on
                            Monad and earns DeFi yield on top — one vault, one click.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 mb-10">
                            <Button
                                onClick={login}
                                size="lg"
                                className="action-pill primary !h-14 !px-7 sm:flex-none"
                            >
                                Get Started
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                            <Button
                                variant="outline"
                                size="lg"
                                className="action-pill !h-14 !px-7 sm:flex-none"
                            >
                                Learn More
                            </Button>
                        </div>
                    </div>

                    {/* Mock vault preview — golden-ratio aspect, prominent on desktop */}
                    <div className="relative rounded-3xl p-5 md:p-8 overflow-hidden ios-card-elev">
                        <div
                            className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-25 blur-3xl"
                            style={{ background: 'var(--gradient-red)' }}
                        />
                        <div
                            className="pointer-events-none absolute -bottom-10 -left-10 w-44 h-44 rounded-full opacity-20 blur-3xl"
                            style={{ background: 'var(--gradient-gold)' }}
                        />

                        <div className="relative vault-card ink !min-h-0">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                <span className="section-label !text-white/80">
                                    Golda Vault
                                </span>
                            </div>
                            <p className="text-caption text-white/65 mt-3">
                                Savings Value
                            </p>
                            <p className="text-large-title font-num">$160.42</p>
                            <p className="text-footnote text-white/70">
                                backed by XAUt0
                            </p>
                        </div>

                        <div className="relative grid grid-cols-4 gap-2 mt-5">
                            {['Top Up', 'Withdraw', 'Claim', 'More'].map((label) => (
                                <div
                                    key={label}
                                    className="flex flex-col items-center gap-1.5"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-surface-2" />
                                    <span className="text-[10px] text-muted-foreground font-semibold">
                                        {label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="mx-auto max-w-[var(--content-desktop)] px-4 md:px-8 py-10">
                <h2 className="text-title-1 md:text-large-title mb-6">
                    Why GoldaFinance?
                </h2>

                <div className="grid gap-3 md:grid-cols-3">
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <div
                                key={feature.title}
                                className="ios-card p-4 md:p-5 flex md:flex-col gap-4 md:gap-5 items-start hover:shadow-md transition-shadow"
                            >
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-foreground text-background">
                                    <Icon className="w-6 h-6" strokeWidth={2} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-headline">{feature.title}</h3>
                                    <p className="text-footnote text-muted-foreground mt-1">
                                        {feature.description}
                                    </p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground md:hidden" />
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Supported Assets */}
            <section className="mx-auto max-w-[var(--content-desktop)] px-4 md:px-8 py-10">
                <h2 className="text-title-1 md:text-large-title mb-6">
                    Pick your savings asset
                </h2>
                <div className="grid grid-cols-2 gap-3 md:gap-5 md:max-w-[480px]">
                    {[
                        {
                            id: 'XAUT',
                            label: 'XAUt0',
                            desc: 'Tether Gold',
                            icon: '🥇',
                        },
                        {
                            id: 'BTC',
                            label: 'BTC',
                            desc: 'Wrapped BTC',
                            icon: <Bitcoin className="w-6 h-6" />,
                        },
                    ].map((a) => (
                        <div
                            key={a.id}
                            className="ios-card p-4 md:p-5 text-center"
                        >
                            <div className="text-2xl md:text-3xl mb-1">
                                {typeof a.icon === 'string' ? (
                                    a.icon
                                ) : (
                                    <span className="inline-flex items-center justify-center">
                                        {a.icon}
                                    </span>
                                )}
                            </div>
                            <p className="text-headline">{a.label}</p>
                            <p className="text-footnote text-muted-foreground">
                                {a.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* How It Works */}
            <section className="mx-auto max-w-[var(--content-desktop)] px-4 md:px-8 py-10">
                <h2 className="text-title-1 md:text-large-title mb-6">
                    How It Works
                </h2>

                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        {
                            step: 1,
                            title: 'Deposit USDC',
                            desc: 'Mint gUSDC vault shares at the current NAV',
                        },
                        {
                            step: 2,
                            title: 'Vault routes via LiFi',
                            desc: 'Operator swaps USDC into XAUt0 / BTC + supplies to Euler',
                        },
                        {
                            step: 3,
                            title: 'Request → Claim',
                            desc: 'Burn shares, claim USDC once the vault is liquid',
                        },
                    ].map((item) => (
                        <div
                            key={item.step}
                            className="ios-card p-5 flex gap-4 items-start"
                        >
                            <div className="w-10 h-10 rounded-xl bg-foreground text-background font-bold flex items-center justify-center shrink-0 font-num">
                                {item.step}
                            </div>
                            <div className="pt-1">
                                <h3 className="text-headline">{item.title}</h3>
                                <p className="text-footnote text-muted-foreground mt-1">
                                    {item.desc}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA Section */}
            <section className="mx-auto max-w-[var(--content-desktop)] px-4 md:px-8 py-10 pb-16">
                <div className="vault-card red text-center !min-h-0 !py-10">
                    <Wallet className="w-12 h-12 text-white mx-auto mb-4" />
                    <h2 className="text-title-1 md:text-large-title text-white mb-2">
                        Ready to Save Smarter?
                    </h2>
                    <p className="text-callout text-white/85 mb-6 max-w-md mx-auto">
                        Join GoldaFinance and keep up with inflation
                    </p>
                    <Button
                        onClick={login}
                        size="lg"
                        className="action-pill !h-14 !px-7 bg-white text-foreground hover:bg-white/90"
                    >
                        Create Account
                        <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                </div>
            </section>

            {/* Footer */}
            <footer className="mx-auto max-w-[var(--content-desktop)] px-4 md:px-8 py-6 border-t border-border text-center">
                <p className="text-footnote text-muted-foreground">
                    © 2026 GoldaFinance. Built on Monad.
                </p>
            </footer>
        </div>
    );
}
