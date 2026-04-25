'use client';

import {
    ArrowUpRight,
    Plus,
    Send,
    ArrowDownUp,
    ArrowLeftRight,
} from 'lucide-react';
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
    onSend?: () => void;
}

export function QuickActions({ onDeposit, onWithdraw, onSend }: QuickActionsProps) {
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
            id: 'send',
            label: 'Send',
            icon: Send,
            tone: 'text-foreground',
            chip: 'bg-surface-2',
            onClick: onSend || (() => router.push('/dashboard/pay?mode=send')),
        },
        {
            id: 'swap',
            label: 'Swap',
            icon: ArrowDownUp,
            tone: 'text-white',
            chip: 'bg-foreground',
            path: '/dashboard/swap',
        },
        {
            id: 'bridge',
            label: 'Bridge',
            icon: ArrowLeftRight,
            tone: 'text-white',
            chip: 'bg-foreground',
            path: '/dashboard/bridge',
        },
        {
            id: 'withdraw',
            label: 'Withdraw',
            icon: ArrowUpRight,
            tone: 'text-white',
            chip: 'bg-[var(--red-500)]',
            onClick: onWithdraw,
        },
    ];

    const handleClick = (action: QuickAction) => {
        if (action.onClick) action.onClick();
        else if (action.path) router.push(action.path);
    };

    return (
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {actions.map((action) => {
                const Icon = action.icon;
                return (
                    <button
                        key={action.id}
                        onClick={() => handleClick(action)}
                        className="quick-action-item btn-haptic"
                    >
                        <span
                            className={`quick-action-icon ${action.chip}`}
                        >
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
