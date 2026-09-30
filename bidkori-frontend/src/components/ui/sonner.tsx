'use client';

import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-[#0E131F] group-[.toaster]:text-zinc-100 group-[.toaster]:border-zinc-800 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-2xl',
          description: 'group-[.toast]:text-zinc-400',
          actionButton:
            'group-[.toast]:bg-amber-500 group-[.toast]:text-zinc-950 font-semibold',
          cancelButton:
            'group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-300',
        },
      }}
      {...props}
    />
  );
};

export { toast };
