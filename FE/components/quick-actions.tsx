'use client';

import { ArrowUpRight, Plus, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface QuickAction {
    id: string;
    label: string;
    icon: React.ElementType;
    /** Tailwind text-color utility for the icon (e.g. `text-foreground`). */
    tone: string;
    /** Tailwind background-color utility for the icon disc. */
    chip: string;
    path?: string;
    onClick?: () => void;
}

interface QuickActionsProps {
    onDeposit?: () => void;
    onWithdraw?: () => void;
    onStack?: () => void;
}

// Swap & Bridge live on their own dedicated pages and inside the Swap Agent
// flow, so the dashboard quick actions stay focused on the three vault
// primitives: Top Up → Stack → Withdraw.
export function QuickActions({ onDeposit, onWithdraw, onStack }: QuickActionsProps) {
    const router = useRouter();

    const actions: QuickAction[] = [
        {
            id: 'deposit',
            label: 'Top Up',
            icon: Plus,
            tone: 'text-foreground',
            chip: 'bg-surface-2',
            onClick: onDeposit,
        },
        {
            id: 'stack',
            label: 'Stack',
            icon: Sparkles,
            tone: 'text-white',
            chip: 'bg-[var(--electric-purple)]',
            onClick: onStack || (() => router.push('/dashboard/pay')),
        },
        {
            id: 'withdraw',
            label: 'Withdraw',
            icon: ArrowUpRight,
            tone: 'text-white',
            chip: 'bg-[var(--accent)]',
            onClick: onWithdraw,
        },
    ];

    const handleClick = (action: QuickAction) => {
        if (action.onClick) action.onClick();
        else if (action.path) router.push(action.path);
    };

    return (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {actions.map((action) => {
                const Icon = action.icon;
                return (
                    <button
                        key={action.id}
                        onClick={() => handleClick(action)}
                        className="quick-action-item btn-haptic"
                    >
                        <span className={`quick-action-icon ${action.chip}`}>
                            <Icon
                                className={`w-5 h-5 ${action.tone}`}
                                strokeWidth={2}
                            />
                        </span>
                        <span className="quick-action-label">{action.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
