'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { MobileLayout } from '@/components/mobile-layout';
import {
    ArrowLeft,
    Shield,
    Bell,
    HelpCircle,
    LogOut,
    ChevronRight,
    Copy,
    Check,
    Moon,
    Sun,
    ExternalLink,
    Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProfilePage() {
    const router = useRouter();
    const { ready, authenticated, user, logout } = usePrivy();
    const [copied, setCopied] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });

    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);



    const toggleDarkMode = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        document.documentElement.classList.toggle('dark', newMode);
        localStorage.setItem('theme', newMode ? 'dark' : 'light');
    };

    const copyAddress = async () => {
        if (user?.wallet?.address) {
            await navigator.clipboard.writeText(user.wallet.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleLogout = async () => {
        await logout();
        router.push('/');
    };

    if (!ready || !authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-foreground" />
            </div>
        );
    }

    const menuItems = [
        {
            id: 'security',
            icon: Shield,
            label: 'Security',
            description: 'Password & 2FA',
            color: 'text-[var(--info)]',
            bgColor: 'bg-info-soft',
        },
        {
            id: 'notifications',
            icon: Bell,
            label: 'Notifications',
            description: 'Push & email alerts',
            color: 'text-[var(--warning)]',
            bgColor: 'bg-warning-soft',
        },
        {
            id: 'help',
            icon: HelpCircle,
            label: 'Help & Support',
            description: 'FAQ & contact us',
            color: 'text-[var(--success)]',
            bgColor: 'bg-success-soft',
        },
    ];

    return (
        <MobileLayout activeTab="profile">
            {/* Header */}
            <div className="px-4 md:px-0 pt-12 md:pt-0 pb-8">
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="btn-haptic p-2 rounded-full bg-surface hover:bg-surface-2 transition-colors"
                        aria-label="Back"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-title-1">Profile</h1>
                </div>

                {/* Profile Card */}
                <div className="ios-card-elev p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 rounded-full bg-foreground text-background flex items-center justify-center text-title-2 font-bold font-display">
                            {user?.email?.address?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-title-3">
                                {user?.email?.address?.split('@')[0] || 'User'}
                            </h2>
                            <p className="text-footnote text-muted-foreground">
                                {user?.email?.address || 'No email'}
                            </p>
                        </div>
                    </div>

                    {/* Wallet Address */}
                    <div className="bg-muted rounded-xl p-4">
                        <p className="text-caption uppercase tracking-wider text-muted-foreground mb-1">
                            Wallet Address
                        </p>
                        <div className="flex items-center justify-between">
                            <p className="font-mono text-subhead">
                                {user?.wallet?.address
                                    ? `${user.wallet.address.slice(0, 10)}…${user.wallet.address.slice(-8)}`
                                    : 'Not connected'}
                            </p>
                            <button
                                onClick={copyAddress}
                                className="btn-haptic p-2 rounded-lg bg-background hover:bg-surface transition-colors"
                                aria-label="Copy address"
                            >
                                {copied ? (
                                    <Check className="w-4 h-4 text-[var(--success)]" />
                                ) : (
                                    <Copy className="w-4 h-4 text-muted-foreground" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4 space-y-4">
                {/* Theme Toggle */}
                <div className="ios-card overflow-hidden">
                    <button
                        onClick={toggleDarkMode}
                        className="w-full p-4 flex items-center justify-between"
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-info-soft' : 'bg-warning-soft'
                                }`}>
                                {isDarkMode ? (
                                    <Moon className="w-5 h-5 text-[var(--info)]" />
                                ) : (
                                    <Sun className="w-5 h-5 text-[var(--warning)]" />
                                )}
                            </div>
                            <div className="text-left">
                                <p className="font-medium">Appearance</p>
                                <p className="text-sm text-muted-foreground">
                                    {isDarkMode ? 'Dark mode' : 'Light mode'}
                                </p>
                            </div>
                        </div>
                        <div
                            className={`ios-switch ${isDarkMode ? 'on' : ''}`}
                            role="switch"
                            aria-checked={isDarkMode}
                        >
                            <div className="ios-switch-thumb" />
                        </div>
                    </button>
                </div>

                {/* Menu Items */}
                <div className="ios-card overflow-hidden divide-y divide-border">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                className="w-full p-4 flex items-center justify-between hover:bg-muted transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.bgColor}`}>
                                        <Icon className={`w-5 h-5 ${item.color}`} />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium">{item.label}</p>
                                        <p className="text-sm text-muted-foreground">{item.description}</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground" />
                            </button>
                        );
                    })}
                </div>

                {/* Explorer Link */}
                <a
                    href={`https://testnet.monadscan.com/address/${user?.wallet?.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 ios-card hover:bg-muted transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-info-soft">
                            <ExternalLink className="w-5 h-5 text-[var(--info)]" />
                        </div>
                        <div>
                            <p className="font-medium">View on Explorer</p>
                            <p className="text-sm text-muted-foreground">Monad Mainnet</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </a>

                {/* Logout Button */}
                <Button
                    onClick={handleLogout}
                    variant="outline"
                    className="action-pill w-full !h-14 text-[var(--destructive)] hover:bg-destructive-soft"
                >
                    <LogOut className="w-5 h-5 mr-2" />
                    Log Out
                </Button>

                {/* Version */}
                <p className="text-center text-footnote text-muted-foreground py-4">
                    GoldaFinance v1.0.0 · Built on Monad
                </p>
            </div>
        </MobileLayout>
    );
}
