import { useState } from 'react';
import { motion, type TargetAndTransition } from 'motion/react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/prefs';

export type MascotState = 'idle' | 'happy' | 'sniffing' | 'sleeping' | 'eating' | 'sad';

// Remember which PNGs are missing so we don't flash a broken image on every mount.
const missing = new Set<string>();

const MOTION: Record<MascotState, TargetAndTransition> = {
  idle: { y: [0, -3, 0], rotate: [0, -2, 0, 1.5, 0], transition: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' } },
  happy: { y: [0, -10, 0, -5, 0], rotate: [0, -4, 3, 0], transition: { duration: 1.1, repeat: Infinity, repeatDelay: 0.9, ease: 'easeOut' } },
  sniffing: { x: [0, -3, 3, -2, 2, 0], rotate: [0, -3, 3, 0], transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } },
  sleeping: { scale: [1, 1.025, 1], y: [0, 1, 0], transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' } },
  eating: { y: [0, 2, 0, 2, 0], rotate: [0, 1.5, -1.5, 0], transition: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' } },
  sad: { rotate: [-3, -5, -3], y: [2, 3, 2], transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' } },
};

export function Mascot({
  state = 'idle',
  size = 120,
  className,
  label,
  still,
}: {
  state?: MascotState;
  size?: number;
  className?: string;
  label?: string;
  /** Disable idle motion (e.g. in dense lists). */
  still?: boolean;
}) {
  const reduce = useReducedMotion();
  const src = `/mascot/${state}.png`;
  const [failed, setFailed] = useState(() => missing.has(src));
  const animate = reduce || still ? undefined : MOTION[state];
  return (
    <motion.div
      role="img"
      aria-label={label ?? `Woltron the dog, ${state}`}
      className={cn('relative inline-block shrink-0 select-none', className)}
      style={{ width: size, height: size, transformOrigin: '50% 85%' }}
      animate={animate}
    >
      {!failed ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className="size-full object-contain drop-shadow-[0_8px_14px_rgb(43_26_51_/_0.18)]"
          onError={() => {
            missing.add(src);
            setFailed(true);
          }}
        />
      ) : (
        <DogFace state={state} />
      )}
      {state === 'sleeping' && !reduce && <Zzz />}
      {state === 'sniffing' && !reduce && <SniffPuffs />}
    </motion.div>
  );
}

function Zzz() {
  return (
    <div className="pointer-events-none absolute -right-1 top-0 font-display font-bold text-ink-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ fontSize: 12 + i * 4, right: i * 8, top: -i * 10 }}
          animate={{ opacity: [0, 1, 0], y: [6, -8], x: [0, 4] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
        >
          z
        </motion.span>
      ))}
    </div>
  );
}

function SniffPuffs() {
  return (
    <div className="pointer-events-none absolute bottom-[22%] left-[-6%]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute block size-2 rounded-full bg-ink-3/50"
          animate={{ opacity: [0, 0.8, 0], x: [0, -14 - i * 4], y: [0, -4 + i * 4], scale: [0.6, 1.2] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.25 }}
        />
      ))}
    </div>
  );
}

/**
 * Inline vector placeholder used until the illustrated PNGs land (or if they fail to load).
 * A round caramel pup with floppy ears; expression changes per state.
 */
function DogFace({ state }: { state: MascotState }) {
  const closed = state === 'happy' || state === 'sleeping' || state === 'eating';
  const tongue = state === 'happy' || state === 'idle' || state === 'eating';
  const sad = state === 'sad';
  const earRot = sad ? 18 : state === 'happy' ? -8 : 0;
  return (
    <svg viewBox="0 0 120 120" className="size-full drop-shadow-[0_8px_14px_rgb(43_26_51_/_0.18)]" aria-hidden>
      {/* ears */}
      <g style={{ transformOrigin: '30px 40px', transform: `rotate(${earRot}deg)` }}>
        <path d="M22 30 C6 34 4 66 14 78 C22 86 32 74 34 58 C35 46 32 30 22 30Z" fill="#7a4a2e" />
      </g>
      <g style={{ transformOrigin: '90px 40px', transform: `rotate(${-earRot}deg)` }}>
        <path d="M98 30 C114 34 116 66 106 78 C98 86 88 74 86 58 C85 46 88 30 98 30Z" fill="#7a4a2e" />
      </g>
      {/* head */}
      <ellipse cx="60" cy="62" rx="38" ry="36" fill="#e9a463" />
      <path d="M60 26 C52 26 48 34 50 44 C54 40 66 40 70 44 C72 34 68 26 60 26Z" fill="#fff4e6" opacity="0.9" />
      {/* muzzle */}
      <ellipse cx="60" cy="78" rx="22" ry="17" fill="#fff4e6" />
      {/* eyes */}
      {closed ? (
        <g stroke="#2b1a33" strokeWidth="3.5" strokeLinecap="round" fill="none">
          {state === 'sleeping' ? (
            <>
              <path d="M38 58 q6 4 12 0" />
              <path d="M70 58 q6 4 12 0" />
            </>
          ) : (
            <>
              <path d="M38 60 q6 -7 12 0" />
              <path d="M70 60 q6 -7 12 0" />
            </>
          )}
        </g>
      ) : (
        <g fill="#2b1a33">
          <ellipse cx="44" cy="58" rx="5.5" ry={state === 'sniffing' ? 4.5 : 6.5} />
          <ellipse cx="76" cy="58" rx="5.5" ry={state === 'sniffing' ? 4.5 : 6.5} />
          <circle cx="46" cy="55.5" r="1.8" fill="#fff" />
          <circle cx="78" cy="55.5" r="1.8" fill="#fff" />
        </g>
      )}
      {sad && (
        <g stroke="#7a4a2e" strokeWidth="3" strokeLinecap="round">
          <path d="M37 47 l12 -4" />
          <path d="M83 47 l-12 -4" />
        </g>
      )}
      {/* cheeks */}
      {(state === 'happy' || state === 'eating') && (
        <g fill="#ff6f91" opacity="0.45">
          <ellipse cx="34" cy="72" rx="6" ry="4" />
          <ellipse cx="86" cy="72" rx="6" ry="4" />
        </g>
      )}
      {/* nose */}
      <path d="M52 70 C52 65 68 65 68 70 C68 75 62 78 60 78 C58 78 52 75 52 70Z" fill="#2b1a33" />
      <ellipse cx="57" cy="68.5" rx="2.5" ry="1.4" fill="#fff" opacity="0.6" />
      {/* mouth */}
      <path d={sad ? 'M50 90 q10 -6 20 0' : 'M50 84 q5 6 10 0 q5 6 10 0'} stroke="#2b1a33" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {tongue && <path d="M55 87 C55 97 65 97 65 87Z" fill="#ff6f91" />}
      {state === 'eating' && <ellipse cx="60" cy="104" rx="16" ry="5" fill="#cadb72" stroke="#2b1a33" strokeWidth="2" />}
    </svg>
  );
}
