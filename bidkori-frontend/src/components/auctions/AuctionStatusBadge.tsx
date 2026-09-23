'use client';

import { Ban, CheckCircle2, Clock, Flame, Loader2 } from 'lucide-react';

export type AuctionState = 'LIVE' | 'ACTIVE' | 'UPCOMING' | 'FINALIZING' | 'CLOSED' | 'CANCELLED' | string;

export default function AuctionStatusBadge({
  state,
  size = 'md',
  className = '',
}: {
  state: AuctionState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const normState = String(state || 'CLOSED').toUpperCase();

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  }[size];

  switch (normState) {
    case 'LIVE':
    case 'ACTIVE':
      return (
        <span
          className={`inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-950/80 font-semibold tracking-wide text-emerald-300 shadow-xs backdrop-blur-md ${sizeClasses} ${className}`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <Flame className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden />
          <span>Live</span>
        </span>
      );

    case 'UPCOMING':
      return (
        <span
          className={`inline-flex items-center rounded-full border border-sky-500/30 bg-sky-950/80 font-semibold tracking-wide text-sky-300 shadow-xs backdrop-blur-md ${sizeClasses} ${className}`}
        >
          <Clock className="h-3 w-3 shrink-0 text-sky-400" aria-hidden />
          <span>Upcoming</span>
        </span>
      );

    case 'FINALIZING':
      return (
        <span
          className={`inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/80 font-semibold tracking-wide text-amber-300 shadow-xs backdrop-blur-md ${sizeClasses} ${className}`}
        >
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-400" aria-hidden />
          <span>Finalizing</span>
        </span>
      );

    case 'CANCELLED':
      return (
        <span
          className={`inline-flex items-center rounded-full border border-rose-500/30 bg-rose-950/80 font-semibold tracking-wide text-rose-300 shadow-xs backdrop-blur-md ${sizeClasses} ${className}`}
        >
          <Ban className="h-3 w-3 shrink-0 text-rose-400" aria-hidden />
          <span>Cancelled</span>
        </span>
      );

    case 'CLOSED':
    default:
      return (
        <span
          className={`inline-flex items-center rounded-full border border-zinc-700/50 bg-zinc-900/85 font-semibold tracking-wide text-zinc-300 shadow-xs backdrop-blur-md ${sizeClasses} ${className}`}
        >
          <CheckCircle2 className="h-3 w-3 shrink-0 text-zinc-400" aria-hidden />
          <span>Closed</span>
        </span>
      );
  }
}
