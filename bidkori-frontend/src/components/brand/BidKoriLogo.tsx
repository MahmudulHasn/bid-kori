import Image from 'next/image';

type BidKoriLogoProps = {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  priority?: boolean;
};

const dimensions = {
  sm: { full: { width: 110, height: 30, className: 'h-7 w-auto' }, icon: { size: 28, className: 'h-7 w-7' } },
  md: { full: { width: 135, height: 36, className: 'h-9 w-auto' }, icon: { size: 36, className: 'h-9 w-9' } },
  lg: { full: { width: 160, height: 44, className: 'h-11 w-auto' }, icon: { size: 44, className: 'h-11 w-11' } },
  xl: { full: { width: 200, height: 54, className: 'h-14 w-auto' }, icon: { size: 56, className: 'h-14 w-14' } },
} as const;

export default function BidKoriLogo({
  variant = 'full',
  size = 'md',
  className = '',
  priority = false,
}: BidKoriLogoProps) {
  const dim = dimensions[size];

  if (variant === 'icon') {
    return (
      <Image
        src="/bidkori-icon.png"
        alt="BidKori"
        width={dim.icon.size}
        height={dim.icon.size}
        className={`object-contain transition-transform duration-200 ${dim.icon.className} ${className}`}
        priority={priority}
      />
    );
  }

  return (
    <span className={`inline-flex items-center ${className}`}>
      {/* Light mode: dark charcoal 'Bid' with orange 'Kori' */}
      <Image
        src="/bidkori-logo-light.png"
        alt="BidKori"
        width={dim.full.width}
        height={dim.full.height}
        className={`object-contain dark:hidden ${dim.full.className}`}
        priority={priority}
      />
      {/* Dark mode: crisp white 'Bid' with orange 'Kori' */}
      <Image
        src="/bidkori-logo-dark.png"
        alt="BidKori"
        width={dim.full.width}
        height={dim.full.height}
        className={`hidden object-contain dark:block ${dim.full.className}`}
        priority={priority}
      />
    </span>
  );
}
