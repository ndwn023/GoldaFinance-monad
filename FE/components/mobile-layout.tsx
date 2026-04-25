'use client';

import { ReactNode } from 'react';
import { BottomNavigation, DesktopNavigation } from './bottom-navigation';

type ActiveTab = 'home' | 'history' | 'pay' | 'agent' | 'profile';

interface MobileLayoutProps {
    children: ReactNode;
    /** Optional sidebar shown on the right rail at ≥1024px (golden-ratio split). */
    rail?: ReactNode;
    activeTab?: ActiveTab;
    showNav?: boolean;
}

/**
 * Mobile-first shell:
 * - <md (mobile): 480px column with bottom iOS tab bar.
 * - md..lg (tablet): wider centered column, top desk-nav, no bottom bar.
 * - ≥lg (desktop): 1.618 : 1 golden-ratio grid (main + sticky right rail).
 *
 * Existing routes can pass children only and behave exactly like before.
 * Pages that want to use the desktop rail can pass a `rail` node.
 */
export function MobileLayout({
    children,
    rail,
    activeTab = 'home',
    showNav = true,
}: MobileLayoutProps) {
    return (
        <>
            {/* Mobile (<md) column — preserves existing route behavior */}
            <div className="mobile-container md:hidden">
                <main className="pb-24">{children}</main>
                {showNav && <BottomNavigation activeTab={activeTab} />}
            </div>

            {/* Tablet + Desktop (≥md) shell */}
            <div className="shell hidden md:block">
                {showNav && <DesktopNavigation activeTab={activeTab} />}
                <div className="shell-content">
                    {rail ? (
                        <div className="shell-grid">
                            <main className="shell-main">{children}</main>
                            <aside className="shell-rail" aria-label="Sidebar">
                                {rail}
                            </aside>
                        </div>
                    ) : (
                        <main className="shell-main mx-auto max-w-[720px]">
                            {children}
                        </main>
                    )}
                </div>
            </div>
        </>
    );
}
