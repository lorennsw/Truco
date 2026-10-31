import type { Card, Suit } from '@truco/shared';
import { cardLabel } from '@truco/shared';

const SUIT_COLOR: Record<Suit, string> = { espada: '#2b5f9e', basto: '#2f7d3b', oro: '#c48a0e', copa: '#b8322a' };
/** Colores de la ropa de las figuras: [túnica, detalle]. */
const ROBE: Record<Suit, [string, string]> = {
  espada: ['#2b5f9e', '#d6453b'],
  basto: ['#2f7d3b', '#f2c94c'],
  oro: ['#d6453b', '#f2c94c'],
  copa: ['#7a3fa0', '#f2c94c'],
};

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

/** El palo ubicado dentro de un dibujo: centro (x, y) y tamaño s. */
function Held({ suit, x, y, s, rotate = 0 }: { suit: Suit; x: number; y: number; s: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s / 100}) translate(-50 -50)`}>
      <SuitShape suit={suit} />
    </g>
  );
}

const SKIN = '#f1c9a5';
const INK = '#3a2414';

/** Sota: un paje de pie que sostiene el palo. */
function Sota({ suit }: { suit: Suit }) {
  const [robe, trim] = ROBE[suit];
  const tall = suit === 'espada' || suit === 'basto';
  return (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <rect x="40" y="108" width="8" height="30" fill={trim} />
      <rect x="52" y="108" width="8" height="30" fill={trim} />
      <path d="M36 140 h14 v5 h-16 z M50 140 h14 l2 5 h-16 z" fill={INK} />
      <path d="M36 56 H64 L72 112 H28 Z" fill={robe} />
      <path d="M30 100 H70" stroke={trim} strokeWidth="4" />
      <path d="M50 56 V112" stroke={trim} strokeWidth="2.5" />
      <path d="M36 58 Q24 76 30 92" fill="none" stroke={robe} strokeWidth="9" strokeLinecap="round" />
      <path d="M64 58 Q74 68 70 80" fill="none" stroke={robe} strokeWidth="9" strokeLinecap="round" />
      <circle cx="70" cy="80" r="4.5" fill={SKIN} />
      <rect x="45" y="48" width="10" height="9" fill={SKIN} />
      <circle cx="50" cy="40" r="11" fill={SKIN} />
      <path d="M38 40 Q38 26 50 26 Q62 26 62 40 Q58 33 50 33 Q42 33 38 40 Z" fill="#6b3a1a" />
      <ellipse cx="50" cy="27" rx="15" ry="5" fill={robe} />
      <path d="M58 24 q8 -8 12 -2" fill="none" stroke={trim} strokeWidth="2.5" />
      <circle cx="46" cy="41" r="1.2" fill={INK} stroke="none" />
      <circle cx="54" cy="41" r="1.2" fill={INK} stroke="none" />
      {tall ? <Held suit={suit} x={74} y={58} s={58} rotate={8} /> : <Held suit={suit} x={72} y={72} s={30} />}
    </g>
  );
}

/** Caballo: un jinete montado que levanta el palo. */
function Caballo({ suit }: { suit: Suit }) {
  const [robe, trim] = ROBE[suit];
  const tall = suit === 'espada' || suit === 'basto';
  return (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      {/* caballo */}
      <path d="M78 98 Q92 104 88 124" fill="none" stroke="#4a2c10" strokeWidth="5" strokeLinecap="round" />
      <rect x="28" y="108" width="7" height="32" rx="2" fill="#a0693a" />
      <rect x="38" y="108" width="7" height="30" rx="2" fill="#8a5a2b" />
      <rect x="62" y="108" width="7" height="30" rx="2" fill="#8a5a2b" />
      <rect x="71" y="108" width="7" height="32" rx="2" fill="#a0693a" />
      <ellipse cx="54" cy="102" rx="28" ry="14" fill="#a0693a" />
      <path d="M32 98 Q22 84 18 68 L12 72 Q8 66 14 60 L26 56 Q34 60 40 92 Z" fill="#a0693a" />
      <path d="M26 56 Q34 62 38 86" fill="none" stroke="#4a2c10" strokeWidth="4" />
      <circle cx="17" cy="63" r="1.5" fill={INK} stroke="none" />
      <path d="M46 92 h22 v10 h-22 z" fill={trim} />
      {/* jinete */}
      <path d="M52 92 L48 116" stroke={robe} strokeWidth="8" strokeLinecap="round" />
      <path d="M46 116 h8 v4 h-10 z" fill={INK} />
      <path d="M46 62 H64 L68 94 H44 Z" fill={robe} />
      <path d="M46 86 H66" stroke={trim} strokeWidth="3" />
      <path d="M64 66 Q72 56 70 46" fill="none" stroke={robe} strokeWidth="8" strokeLinecap="round" />
      <circle cx="70" cy="46" r="4" fill={SKIN} />
      <rect x="51" y="55" width="8" height="8" fill={SKIN} />
      <circle cx="55" cy="48" r="9" fill={SKIN} />
      <path d="M44 44 Q46 32 56 32 Q66 32 66 44 Z" fill={robe} />
      <path d="M44 44 H67" stroke={trim} strokeWidth="2.5" />
      <circle cx="58" cy="49" r="1.1" fill={INK} stroke="none" />
      {tall ? <Held suit={suit} x={74} y={26} s={48} rotate={14} /> : <Held suit={suit} x={74} y={36} s={26} />}
    </g>
  );
}

/** Rey: con corona, barba y manto, sostiene el palo. */
function Rey({ suit }: { suit: Suit }) {
  const [robe, trim] = ROBE[suit];
  const tall = suit === 'espada' || suit === 'basto';
  return (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M30 58 H70 L84 142 H16 Z" fill="#8f1d2c" />
      <path d="M38 58 H62 L72 142 H28 Z" fill={robe} />
      <rect x="16" y="132" width="68" height="10" fill="#fdf8ec" />
      {[22, 32, 42, 52, 62, 72].map((x) => (
        <path key={x} d={`M${x} 135 v4`} stroke={INK} strokeWidth="2" />
      ))}
      <path d="M50 64 V132" stroke={trim} strokeWidth="3" />
      <path d="M38 62 Q28 80 34 96" fill="none" stroke={robe} strokeWidth="9" strokeLinecap="round" />
      <path d="M62 62 Q74 72 70 86" fill="none" stroke={robe} strokeWidth="9" strokeLinecap="round" />
      <circle cx="70" cy="86" r="4.5" fill={SKIN} />
      <rect x="45" y="50" width="10" height="9" fill={SKIN} />
      <circle cx="50" cy="42" r="11" fill={SKIN} />
      <path d="M39 44 Q40 62 50 64 Q60 62 61 44 Q56 52 50 52 Q44 52 39 44 Z" fill="#d9d4c7" />
      <path d="M38 32 L40 20 L45 27 L50 17 L55 27 L60 20 L62 32 Z" fill="#f2c94c" />
      <circle cx="50" cy="22" r="1.8" fill="#d6453b" stroke="none" />
      <circle cx="46" cy="41" r="1.2" fill={INK} stroke="none" />
      <circle cx="54" cy="41" r="1.2" fill={INK} stroke="none" />
      {tall ? <Held suit={suit} x={76} y={64} s={58} rotate={6} /> : <Held suit={suit} x={72} y={78} s={30} />}
    </g>
  );
}

/** Posición (en % de la carta) de cada palo para las cartas del 2 al 7. */
const PIPS: Record<number, [number, number][]> = {
  2: [[50, 29], [50, 71]],
  3: [[50, 26], [50, 50], [50, 74]],
  4: [[37, 30], [63, 30], [37, 70], [63, 70]],
  5: [[37, 28], [63, 28], [50, 50], [37, 72], [63, 72]],
  6: [[37, 27], [63, 27], [37, 50], [63, 50], [37, 73], [63, 73]],
  7: [[37, 27], [63, 27], [50, 38.5], [37, 50], [63, 50], [37, 73], [63, 73]],
};
const PIP_SIZE: Record<number, number> = { 2: 32, 3: 28, 4: 27, 5: 25, 6: 24, 7: 22 };

function CardFace({ card }: { card: Card }) {
  const n = card.number;
  if (n === 1) {
    // El ancho: un solo palo grande, enmarcado.
    return (
      <svg viewBox="0 0 100 150" className="absolute inset-0 h-full w-full" aria-hidden>
        <ellipse cx="50" cy="75" rx="36" ry="52" fill="none" stroke={SUIT_COLOR[card.suit]} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        <Held suit={card.suit} x={50} y={75} s={card.suit === 'espada' || card.suit === 'basto' ? 84 : 60} />
      </svg>
    );
  }
  if (n >= 10) {
    const Figure = n === 10 ? Sota : n === 11 ? Caballo : Rey;
    return (
      <svg viewBox="0 0 100 150" className="absolute inset-x-[12%] inset-y-[11%] h-[78%] w-[76%]" aria-hidden>
        <Figure suit={card.suit} />
      </svg>
    );
  }
  // Espadas y bastos son finos y alargados: se dibujan un poco más grandes.
  const size = PIP_SIZE[n] * (card.suit === 'espada' || card.suit === 'basto' ? 1.2 : 1);
  return (
    <>
      {PIPS[n].map(([x, y], i) => (
        <SuitIcon
          key={i}
          suit={card.suit}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          // Tamaño relativo a la carta: el alto se divide por 1,5 porque la carta mide 1,5 veces su ancho.
          style={{ left: `${x}%`, top: `${y}%`, width: `${size}%`, height: `${size / 1.5}%` }}
        />
      ))}
    </>
  );
}

/** Anchos predefinidos. El alto sale de la proporción 2:3, así la carta nunca se deforma. */
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
  const color = SUIT_COLOR[card.suit];
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
      style={{ width: WIDTH[size], color, ...style }}
      className={`scard relative block shrink-0 select-none overflow-hidden p-0 text-left ${stateClass} ${className}`}
    >
      <span className="scard-frame" />
      <CardFace card={card} />
      <span className="scard-index left-[7%] top-[5%]">
        {card.number}
        <SuitIcon suit={card.suit} />
      </span>
      <span className="scard-index bottom-[5%] right-[7%] rotate-180">
        {card.number}
        <SuitIcon suit={card.suit} />
      </span>
    </Tag>
  );
}

export function CardBack({ size = 'sm', className = '', style }: { size?: CardSize; className?: string; style?: React.CSSProperties }) {
  return <div style={{ width: WIDTH[size], ...style }} className={`card-back aspect-[2/3] shrink-0 rounded-[9%/6%] ${className}`} aria-hidden />;
}
