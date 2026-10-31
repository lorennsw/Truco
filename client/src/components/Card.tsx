import type { Card, Suit } from '@truco/shared';
import { cardLabel } from '@truco/shared';

const SUIT_COLOR: Record<Suit, string> = { espada: '#2b5f9e', basto: '#2f7d3b', oro: '#c48a0e', copa: '#b8322a' };

export function SuitIcon({ suit, className = '' }: { suit: Suit; className?: string }) {
  switch (suit) {
    case 'oro':
      return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden>
          <circle cx="50" cy="50" r="42" fill="#f2c94c" stroke="#9a6a05" strokeWidth="5" />
          <circle cx="50" cy="50" r="28" fill="none" stroke="#9a6a05" strokeWidth="3" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={50 + Math.cos(a) * 30} y1={50 + Math.sin(a) * 30} x2={50 + Math.cos(a) * 39} y2={50 + Math.sin(a) * 39} stroke="#9a6a05" strokeWidth="3" />;
          })}
          <circle cx="50" cy="50" r="10" fill="#d69e1a" stroke="#9a6a05" strokeWidth="3" />
        </svg>
      );
    case 'copa':
      return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden>
          <path d="M22 12 H78 Q80 52 50 60 Q20 52 22 12 Z" fill="#d6453b" stroke="#7a1a14" strokeWidth="4" strokeLinejoin="round" />
          <path d="M28 20 H72" stroke="#f6c453" strokeWidth="5" />
          <rect x="44" y="59" width="12" height="18" fill="#f2c94c" stroke="#7a1a14" strokeWidth="3" />
          <ellipse cx="50" cy="84" rx="22" ry="8" fill="#d6453b" stroke="#7a1a14" strokeWidth="4" />
        </svg>
      );
    case 'espada':
      return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden>
          <path d="M50 4 L58 16 L57 64 H43 L42 16 Z" fill="#c9d6e3" stroke="#23466e" strokeWidth="3.5" strokeLinejoin="round" />
          <line x1="50" y1="14" x2="50" y2="60" stroke="#23466e" strokeWidth="2" />
          <rect x="26" y="63" width="48" height="8" rx="4" fill="#2b5f9e" stroke="#163557" strokeWidth="3" />
          <rect x="45" y="71" width="10" height="17" fill="#8a5a2b" stroke="#4a2c10" strokeWidth="3" />
          <circle cx="50" cy="92" r="6" fill="#2b5f9e" stroke="#163557" strokeWidth="3" />
        </svg>
      );
    case 'basto':
      return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden>
          <path d="M40 94 L33 70 Q28 40 42 18 Q50 6 62 10 Q74 16 70 32 Q66 50 56 70 L52 94 Z" fill="#8a5a2b" stroke="#3f250c" strokeWidth="4" strokeLinejoin="round" />
          <circle cx="48" cy="30" r="5" fill="#3f8f3b" stroke="#1f4d1d" strokeWidth="2.5" />
          <circle cx="60" cy="44" r="4.5" fill="#3f8f3b" stroke="#1f4d1d" strokeWidth="2.5" />
          <circle cx="44" cy="58" r="4.5" fill="#3f8f3b" stroke="#1f4d1d" strokeWidth="2.5" />
          <path d="M55 20 Q62 18 64 26" stroke="#c7955c" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      );
  }
}

const FIGURE: Record<number, string> = { 10: 'SOTA', 11: 'CABALLO', 12: 'REY' };

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';
const SIZES: Record<CardSize, { box: string; corner: string; icon: string; fig: string }> = {
  xs: { box: 'w-9 h-[3.4rem] rounded-md', corner: 'text-[10px]', icon: 'w-5 h-5', fig: 'hidden' },
  sm: { box: 'w-12 h-[4.5rem] rounded-md', corner: 'text-xs', icon: 'w-7 h-7', fig: 'hidden' },
  md: { box: 'w-16 h-24 rounded-lg', corner: 'text-sm', icon: 'w-9 h-9', fig: 'text-[7px]' },
  lg: { box: 'w-[5.2rem] h-[7.8rem] sm:w-24 sm:h-36 rounded-xl', corner: 'text-base sm:text-lg', icon: 'w-11 h-11 sm:w-14 sm:h-14', fig: 'text-[8px] sm:text-[9px]' },
};

export function SpanishCard({
  card,
  size = 'md',
  onClick,
  playable,
  dim,
  highlight,
  className = '',
  style,
}: {
  card: Card;
  size?: CardSize;
  onClick?: () => void;
  playable?: boolean;
  dim?: boolean;
  highlight?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const s = SIZES[size];
  const color = SUIT_COLOR[card.suit];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={onClick ? !playable : undefined}
      aria-label={cardLabel(card)}
      title={cardLabel(card)}
      style={{ borderColor: color, ...style }}
      className={[
        'relative shrink-0 select-none border-2 bg-cream text-left shadow-[0_6px_14px_rgba(0,0,0,0.45)] transition duration-150',
        s.box,
        playable ? 'cursor-pointer hover:-translate-y-3 hover:shadow-[0_14px_24px_rgba(0,0,0,0.5)] focus-visible:-translate-y-3 focus-visible:outline-3 focus-visible:outline-gold' : '',
        onClick && !playable ? 'cursor-not-allowed' : '',
        dim ? 'opacity-55 saturate-50' : '',
        highlight ? 'ring-4 ring-gold' : '',
        className,
      ].join(' ')}
    >
      <span className="pointer-events-none absolute inset-[3px] rounded-[inherit] border border-black/10" />
      <span className={`absolute left-1 top-0.5 font-extrabold leading-none ${s.corner}`} style={{ color }}>
        {card.number}
      </span>
      <span className={`absolute bottom-0.5 right-1 rotate-180 font-extrabold leading-none ${s.corner}`} style={{ color }}>
        {card.number}
      </span>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <SuitIcon suit={card.suit} className={s.icon} />
        {FIGURE[card.number] && (
          <span className={`font-bold tracking-wider ${s.fig}`} style={{ color }}>
            {FIGURE[card.number]}
          </span>
        )}
      </span>
    </Tag>
  );
}

export function CardBack({ size = 'sm', className = '', style }: { size?: CardSize; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={style}
      className={`card-back shrink-0 border-2 border-cream/90 shadow-[0_4px_10px_rgba(0,0,0,0.45)] ${SIZES[size].box} ${className}`}
      aria-hidden
    />
  );
}
