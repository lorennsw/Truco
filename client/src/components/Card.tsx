import type { Card, Suit } from '@truco/shared';
import { cardLabel } from '@truco/shared';

/** Dibujo del palo en coordenadas 0–100, para usar dentro de cualquier <svg>. */
function SuitShape({ suit }: { suit: Suit }) {
  switch (suit) {
    case 'oro':
      return (
        <g>
          <circle cx="50" cy="50" r="42" fill="#f2c94c" stroke="#9a6a05" strokeWidth="5" />
          <circle cx="50" cy="50" r="28" fill="none" stroke="#9a6a05" strokeWidth="3" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={50 + Math.cos(a) * 30} y1={50 + Math.sin(a) * 30} x2={50 + Math.cos(a) * 39} y2={50 + Math.sin(a) * 39} stroke="#9a6a05" strokeWidth="3" />;
          })}
          <circle cx="50" cy="50" r="10" fill="#d69e1a" stroke="#9a6a05" strokeWidth="3" />
        </g>
      );
    case 'copa':
      return (
        <g>
          <path d="M22 12 H78 Q80 52 50 60 Q20 52 22 12 Z" fill="#d6453b" stroke="#7a1a14" strokeWidth="4" strokeLinejoin="round" />
          <path d="M28 20 H72" stroke="#f6c453" strokeWidth="5" />
          <rect x="44" y="59" width="12" height="18" fill="#f2c94c" stroke="#7a1a14" strokeWidth="3" />
          <ellipse cx="50" cy="84" rx="22" ry="8" fill="#d6453b" stroke="#7a1a14" strokeWidth="4" />
        </g>
      );
    case 'espada':
      return (
        <g>
          <path d="M50 2 L58 14 L57 64 H43 L42 14 Z" fill="#c9d6e3" stroke="#23466e" strokeWidth="3.5" strokeLinejoin="round" />
          <line x1="50" y1="12" x2="50" y2="60" stroke="#23466e" strokeWidth="2" />
          <rect x="26" y="63" width="48" height="8" rx="4" fill="#2b5f9e" stroke="#163557" strokeWidth="3" />
          <rect x="45" y="71" width="10" height="17" fill="#8a5a2b" stroke="#4a2c10" strokeWidth="3" />
          <circle cx="50" cy="92" r="6" fill="#2b5f9e" stroke="#163557" strokeWidth="3" />
        </g>
      );
    case 'basto':
      return (
        <g>
          <path d="M40 96 L33 70 Q28 40 42 16 Q50 4 62 8 Q74 14 70 30 Q66 50 56 70 L52 96 Z" fill="#8a5a2b" stroke="#3f250c" strokeWidth="4" strokeLinejoin="round" />
          <circle cx="48" cy="28" r="5" fill="#3f8f3b" stroke="#1f4d1d" strokeWidth="2.5" />
          <circle cx="60" cy="42" r="4.5" fill="#3f8f3b" stroke="#1f4d1d" strokeWidth="2.5" />
          <circle cx="44" cy="56" r="4.5" fill="#3f8f3b" stroke="#1f4d1d" strokeWidth="2.5" />
          <path d="M55 18 Q62 16 64 24" stroke="#c7955c" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

export function SuitIcon({ suit, className = '', style }: { suit: Suit; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <SuitShape suit={suit} />
    </svg>
  );
}

// Las caras y el dorso son las imágenes de la baraja (client/public/cartas), recortadas del PDF para imprimir.
const IMG = `${import.meta.env.BASE_URL}cartas/`;
export const cardImage = (card: Card) => `${IMG}${card.number}-${card.suit}.webp`;
export const CARD_BACK_IMAGE = `${IMG}dorso.webp`;

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'fluid';
const WIDTH: Record<CardSize, string> = {
  xs: '34px',
  sm: '46px',
  md: '62px',
  lg: 'clamp(76px, 22vw, 112px)',
  fluid: '100%',
};

export type CardState = 'playable' | 'selected' | 'idle' | 'winner' | 'static';

export function SpanishCard({
  card,
  size = 'md',
  state = 'static',
  onClick,
  className = '',
  style,
}: {
  card: Card;
  size?: CardSize;
  state?: CardState;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const interactive = !!onClick;
  const Tag = interactive ? 'button' : 'div';
  const stateClass = { playable: 'scard-playable', selected: 'scard-playable scard-selected', idle: 'scard-idle', winner: 'scard-winner', static: '' }[state];
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      disabled={interactive ? state === 'idle' : undefined}
      aria-label={cardLabel(card)}
      aria-pressed={interactive && state === 'selected' ? true : undefined}
      title={cardLabel(card)}
      style={{ width: WIDTH[size], ...style }}
      className={`scard relative block shrink-0 select-none overflow-hidden p-0 text-left ${stateClass} ${className}`}
    >
      <img src={cardImage(card)} alt="" draggable={false} className="pointer-events-none block h-full w-full" />
    </Tag>
  );
}

export function CardBack({ size = 'sm', className = '', style }: { size?: CardSize; className?: string; style?: React.CSSProperties }) {
  return <div style={{ width: WIDTH[size], ...style }} className={`card-back scard shrink-0 ${className}`} aria-hidden />;
}
