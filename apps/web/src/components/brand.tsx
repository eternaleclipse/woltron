import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * The fetch orb — Woltron's signature shape. A sci-fi take on a tennis ball: chrome shell fading to
 * black, with the two seams as black channels carrying cyan light.
 * Keep in sync with `orb()` in assets/scripts/robodog.py (same 40×40 geometry).
 */
export function TennisBall({ size = 40, className, spin }: { size?: number; className?: string; spin?: boolean }) {
  const id = useId().replace(/:/g, '');
  const seams = ['M6.5 6.8 C13 12 13 28 6.5 33.2', 'M33.5 6.8 C27 12 27 28 33.5 33.2'];
  return (
    <motion.svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
      animate={spin ? { rotate: 360 } : undefined}
      transition={spin ? { duration: 1.2, repeat: Infinity, ease: 'linear' } : undefined}
    >
      <defs>
        <radialGradient id={`${id}s`} cx="0.34" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.3" stopColor="#e6eaee" />
          <stop offset="0.62" stopColor="#9aa4af" />
          <stop offset="0.88" stopColor="#2d333c" />
          <stop offset="1" stopColor="#14181d" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <circle cx="20" cy="20" r="19" />
        </clipPath>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#${id}s)`} />
      <g clipPath={`url(#${id}c)`} fill="none" strokeLinecap="round">
        {seams.map((d) => (
          <g key={d}>
            <path d={d} stroke="#22d3ee" strokeOpacity="0.22" strokeWidth="7.5" />
            <path d={d} stroke="#0d1014" strokeWidth="4.2" />
            <path d={d} stroke="#22d3ee" strokeWidth="2" />
            <path d={d} stroke="#cffafe" strokeWidth="0.7" />
          </g>
        ))}
      </g>
      <ellipse cx="13.5" cy="10.5" rx="6" ry="3.2" fill="#fff" fillOpacity="0.55" transform="rotate(-35 13.5 10.5)" />
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="#0b0e12" strokeOpacity="0.55" strokeWidth="1.1" />
    </motion.svg>
  );
}

/** Wordmark: "w" + ball + "ltron". */
export function Wordmark({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center font-display font-extrabold leading-none tracking-[-0.04em] text-ink', className)} style={{ fontSize: size }}>
      w
      <TennisBall size={size * 0.78} className="mx-[0.02em] translate-y-[0.06em]" />
      ltron
    </span>
  );
}

/** A dog bone glyph for pack weights. */
export function Bone({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 32 16" className={cn('h-4 w-8', className)} aria-hidden>
      <g fill={filled ? 'var(--biscuit)' : 'var(--surface-3)'}>
        <circle cx="5.5" cy="5" r="4" />
        <circle cx="5.5" cy="11" r="4" />
        <circle cx="26.5" cy="5" r="4" />
        <circle cx="26.5" cy="11" r="4" />
        <rect x="5" y="4.6" width="22" height="6.8" rx="2" />
      </g>
    </svg>
  );
}
