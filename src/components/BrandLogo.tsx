interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md';
  tone?: 'light' | 'dark';
  showWordmark?: boolean;
}

export function BrandLogo({
  size = 'sm',
  tone = 'light',
  showWordmark = true,
}: BrandLogoProps) {
  const iconDims =
    size === 'md'
      ? 'w-10 h-10 rounded-xl'
      : size === 'xs'
        ? 'w-7 h-7 rounded-lg'
        : 'w-8 h-8 rounded-lg';
  const textClass =
    size === 'md'
      ? 'text-2xl font-bold tracking-tight font-display whitespace-nowrap shrink-0'
      : size === 'xs'
        ? 'text-base font-bold tracking-tight font-display whitespace-nowrap shrink-0'
        : 'text-lg font-bold tracking-tight font-display whitespace-nowrap shrink-0';
  const colorClass = tone === 'light' ? 'text-white' : 'text-[#0B3B24]';

  return (
    <span className="inline-flex items-center gap-2.5 shrink-0">
      <span
        className={`${iconDims} overflow-hidden bg-[#0B3B24] ring-1 ${
          tone === 'light' ? 'ring-white/15' : 'ring-emerald-950/10'
        } inline-flex items-center justify-center shrink-0`}
      >
        <svg
          viewBox="0 0 64 64"
          fill="none"
          className="w-full h-full"
          role="img"
          aria-label="Logo de MoneyFlow"
        >
          <rect width="64" height="64" rx="16" fill="#0B3B24" />
          <path
            d="M14 39C20 39 22 25 30 25C38 25 39 39 47 39C49.5 39 51 37.5 52.5 35.5"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M14 27C20 27 23 19 31 19C39 19 41 31 50 31"
            stroke="#34D399"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <circle cx="50" cy="31" r="3.5" fill="#34D399" />
        </svg>
      </span>
      {showWordmark && <span className={`${textClass} ${colorClass}`}>MoneyFlow</span>}
    </span>
  );
}
