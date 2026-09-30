import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 select-none',
  {
    variants: {
      variant: {
        default:
          'border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 dark:border-amber-400/30 dark:bg-amber-400/10',
        live: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/15',
        warning:
          'border border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300',
        destructive:
          'border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400 dark:border-rose-500/30 dark:bg-rose-500/15',
        secondary:
          'border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300',
        outline:
          'border border-zinc-300 text-zinc-800 dark:border-zinc-700 dark:text-zinc-300',
        info: 'border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
