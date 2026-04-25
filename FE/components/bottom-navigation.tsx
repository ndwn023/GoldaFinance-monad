'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Home, Clock, Brain, User, Sparkles } from 'lucide-react';

type ActiveTab = 'home' | 'history' | 'pay' | 'agent' | 'profile';

interface NavProps {
    activeTab: ActiveTab;
}

// Single-word labels keep every tab on one line in the floating tab bar.
// The FAB icon (Sparkles) + brain icon already mark Stack/Swap as the AI
// agents; the page hero spells out the full "Stack Agent" / "Swap Agent"
// title once the user lands there.
const NAV_ITEMS = [
    { id: 'home',    label: 'Home',    icon: Home,     path: '/dashboard' },
    { id: 'history', label: 'History', icon: Clock,    path: '/dashboard/history' },
    { id: 'pay',     label: 'Stack',   icon: Sparkles, path: '/dashboard/pay', isCenter: true },
    { id: 'agent',   label: 'Swap',    icon: Brain,    path: '/dashboard/agent' },
    { id: 'profile', label: 'Profile', icon: User,     path: '/dashboard/profile' },
] as const;

// =============================================================
// Mobile bottom tab bar (iOS-style, shown only <md)
// =============================================================

export function BottomNavigation({ activeTab }: NavProps) {
    const router = useRouter();

    return (
        <nav className="ios-tab-bar" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isCenter = 'isCenter' in item && item.isCenter;

                if (isCenter) {
                    return (
                        <div key={item.id} className="ios-fab">
                            <button
                                onClick={() => router.push(item.path)}
                                className="ios-fab-btn btn-haptic"
                                aria-label={item.label}
                            >
                                <Icon strokeWidth={2.6} />
                            </button>
                            <span className="ios-tab-label">{item.label}</span>
                        </div>
                    );
                }

                return (
                    <button
                        key={item.id}
                        onClick={() => router.push(item.path)}
                        className={`ios-tab-item btn-haptic ${isActive ? 'active' : ''}`}
                        aria-label={item.label}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        <Icon
                            className="size-6"
                            strokeWidth={isActive ? 2.4 : 1.9}
                            fill={isActive ? 'currentColor' : 'none'}
                            fillOpacity={isActive ? 0.12 : 0}
                        />
                        <span className="ios-tab-label">{item.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}

// =============================================================
// Desktop top nav strip (shown only ≥md)
// =============================================================

export function DesktopNavigation({ activeTab }: NavProps) {
    const router = useRouter();

    return (
        <nav className="desk-nav" aria-label="Primary">
            <button
                onClick={() => router.push('/')}
                className="flex items-center gap-3 btn-haptic"
                aria-label="GoldaFinance home"
            >
                <Image
                    src="/Icon.png"
                    alt=""
                    width={60}
                    height={32}
                    priority
                    className="h-8 w-auto select-none"
                />
                <span className="text-title-3">GoldaFinance</span>
            </button>

            <div className="desk-nav-links">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => router.push(item.path)}
                            className={`desk-nav-link btn-haptic ${isActive ? 'active' : ''}`}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <Icon
                                className="size-4"
                                strokeWidth={isActive ? 2.4 : 1.9}
                            />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
