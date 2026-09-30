'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 hover:shadow-lg hover:shadow-amber-500/30',
        primary:
          'bg-amber-500 text-zinc-950 font-bold hover:bg-amber-400 shadow-md shadow-amber-500/15',
        secondary:
          'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800/80 dark:hover:border-zinc-700',
        outline:
          'border border-zinc-300 bg-transparent text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800/60 dark:hover:border-zinc-600',
        ghost:
          'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white',
        destructive:
          'bg-rose-600 text-white shadow-xs hover:bg-rose-500 dark:bg-rose-600/90 dark:hover:bg-rose-600',
        subtle:
          'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800',
        link: 'text-amber-600 underline-offset-4 hover:underline dark:text-amber-400',
      },
      size: {
        default: 'h-10 px-4 py-2',
        xs: 'h-7 rounded-lg px-2 text-xs',
        sm: 'h-8.5 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-xl px-6 text-base font-bold',
        xl: 'h-14 rounded-2xl px-8 text-base font-bold',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-xs': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      loadingText,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-current" />
            <span>{loadingText || children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';
