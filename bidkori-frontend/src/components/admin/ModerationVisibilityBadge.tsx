'use client';

type ModerationVisibilityBadgeProps = {
  isHidden: boolean | undefined;
  className?: string;
};

/** Text + color visibility badge for Admin lists/details. */
export default function ModerationVisibilityBadge({
  isHidden,
  className = '',
}: ModerationVisibilityBadgeProps) {
  const hidden = isHidden === true;
  const label = hidden ? 'Hidden' : 'Visible';
  return (
    <span
      className={[
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
        hidden
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
          : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
        className,
      ].join(' ')}
    >
      <span className="sr-only">Visibility: </span>
      {label}
    </span>
  );
}
