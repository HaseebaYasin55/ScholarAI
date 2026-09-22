/**
 * ScholarAI brand mark — a deep-ink tile with a minimal, white graduation
 * cap. It reads as academic, scholarly, optimistic and on-track — the
 * product's core promise. The cap drifts very gently via `.scholarai-cap`
 * (disabled for prefers-reduced-motion).
 */

export function LogoMark({
  className = "h-8 w-8",
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${className}`}
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
        <defs>
          <linearGradient
            id="scholarai-tile"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0" stopColor="#2e4a5c" />
            <stop offset="1" stopColor="#243c4c" />
          </linearGradient>
        </defs>
        {/* tile */}
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          rx="9"
          fill="url(#scholarai-tile)"
        />
        {/* graduation cap */}
        <g className="scholarai-cap">
          {/* head band */}
          <path
            d="M9.1 16.7c0 6.1 13.8 6.1 13.8 0"
            stroke="#ffffff"
            strokeWidth="2.1"
            strokeLinecap="round"
            fill="none"
          />
          {/* cap board */}
          <path
            d="M16 11.9L23.3 16.3L16 20.7L8.7 16.3Z"
            fill="#ffffff"
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* center knot */}
          <circle cx="16" cy="11.4" r="1.9" fill="#ffffff" />
          {/* tassel */}
          <path
            d="M23.3 16.3c1.9 0.4 2.9 2 3.1 4.3"
            stroke="#ffffff"
            strokeWidth="1.9"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="26.2" cy="21.2" r="1.15" fill="#ffffff" />
        </g>
      </svg>
    </span>
  );
}

export default function Logo({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-9 w-9 rounded-xl" />
      {!compact && (
        <span className="text-[17px] font-bold tracking-tight text-gray-900">
          Scholar
          <span className="text-primary">AI</span>
        </span>
      )}
    </div>
  );
}