import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/** The tennis ball — Woltron's signature shape. Felt + two seam curves. */
export function TennisBall({ size = 40, className, spin }: { size?: number; className?: string; spin?: boolean }) {
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
      <circle cx="20" cy="20" r="19" fill="var(--ball)" />
      <circle cx="20" cy="20" r="19" fill="url(#ball-shade)" />
      <circle cx="20" cy="20" r="18.4" fill="none" stroke="#2b1a33" strokeOpacity="0.28" strokeWidth="1.2" />
      <path d="M6.5 6.8 C13 12 13 28 6.5 33.2" stroke="#fff" strokeOpacity="0.85" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M33.5 6.8 C27 12 27 28 33.5 33.2" stroke="#fff" strokeOpacity="0.85" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <defs>
        <radialGradient id="ball-shade" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#4d5a00" stopOpacity="0.28" />
        </radialGradient>
      </defs>
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
