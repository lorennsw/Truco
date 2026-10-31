// Mesa de bodegón: tapa de madera con vetas, canto oscuro y, encima, la cerveza con dos vasos y el mazo.

/** Polígono de muchos lados, como una mesa redonda de madera tallada. */
const SIDES = 18;
const POLY = `polygon(${Array.from({ length: SIDES }, (_, i) => {
  const a = (i / SIDES) * Math.PI * 2 + Math.PI / SIDES;
  return `${(50 + 50 * Math.cos(a)).toFixed(2)}% ${(50 + 50 * Math.sin(a)).toFixed(2)}%`;
}).join(', ')})`;

export function BarTableSurface({ edge }: { edge: number }) {
  return (
    <>
      {/* Sombra en el piso */}
      <div
        className="absolute left-[4%] right-[4%] rounded-[50%] bg-black/60 blur-2xl"
        style={{ top: `calc(8% + ${edge * 2}px)`, bottom: `calc(-2% - ${edge * 2}px)` }}
        aria-hidden
      />
      {/* Canto de la mesa (da el espesor) */}
      <div className="table-edge absolute inset-0" style={{ clipPath: POLY, transform: `translateY(${edge}px)` }} aria-hidden />
      {/* Tapa con vetas */}
      <div className="table-top absolute inset-0" style={{ clipPath: POLY }} aria-hidden />
    </>
  );
}

function Bottle({ h }: { h: number }) {
  return (
    <svg viewBox="0 0 40 120" style={{ height: h }} className="drop-shadow-[0_6px_6px_rgba(0,0,0,0.45)]" aria-hidden>
      <defs>
        <linearGradient id="vidrio" x1="0" x2="1">
          <stop offset="0" stopColor="#3a1b07" />
          <stop offset="0.35" stopColor="#7a3d10" />
          <stop offset="0.6" stopColor="#5a2a0a" />
          <stop offset="1" stopColor="#2a1305" />
        </linearGradient>
      </defs>
      <rect x="15" y="2" width="10" height="7" rx="2" fill="#d9b25a" stroke="#8a6a20" strokeWidth="1" />
      <path d="M15.5 9 H24.5 V30 Q24.5 38 33 46 Q35 48 35 54 V110 Q35 117 28 117 H12 Q5 117 5 110 V54 Q5 48 7 46 Q15.5 38 15.5 30 Z" fill="url(#vidrio)" />
      <rect x="5" y="62" width="30" height="30" fill="#f4efe2" />
      <rect x="5" y="62" width="30" height="5" fill="#2f6fb0" />
      <rect x="5" y="87" width="30" height="5" fill="#2f6fb0" />
      <text x="20" y="80.5" textAnchor="middle" fontSize="7.2" fontWeight="800" fill="#1d3f6b" fontFamily="Georgia, serif">CERVEZA</text>
      <path d="M10 50 V108" stroke="rgba(255,240,210,0.35)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Glass({ h }: { h: number }) {
  return (
    <svg viewBox="0 0 40 56" style={{ height: h }} className="drop-shadow-[0_5px_5px_rgba(0,0,0,0.4)]" aria-hidden>
      <defs>
        <linearGradient id="birra" x1="0" x2="1">
          <stop offset="0" stopColor="#e7a92f" />
          <stop offset="0.5" stopColor="#f6cf6a" />
          <stop offset="1" stopColor="#d9962a" />
        </linearGradient>
      </defs>
      <path d="M4 6 L8 52 Q8 54 10 54 H30 Q32 54 32 52 L36 6 Z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
      <path d="M6 16 L9 51 H31 L34 16 Z" fill="url(#birra)" opacity="0.95" />
      <path d="M4.5 9 Q8 2 14 6 Q20 0 26 5 Q32 1 35.5 9 L34.6 17 H5.4 Z" fill="#fffaf0" />
      <circle cx="14" cy="34" r="0.9" fill="#fff6d8" />
      <circle cx="22" cy="42" r="0.7" fill="#fff6d8" />
      <circle cx="26" cy="28" r="0.8" fill="#fff6d8" />
      <path d="M10 20 L12.5 49" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Deck({ w }: { w: number }) {
  return (
    <div className="relative" style={{ width: w * 1.5, height: w * 1.1 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="card-back absolute left-1/2 top-1/2 rounded-[3px]"
          style={{ width: w, height: w * 1.5, transform: `translate(-50%, -50%) rotate(${78 + i * 3}deg) translate(${-i * 1.5}px, ${-i * 1.5}px)` }}
        />
      ))}
    </div>
  );
}

/** La cerveza con sus dos vasos, como en la mesa de un bar. */
export function BeerSet({ size }: { size: number }) {
  return (
    <div className="pointer-events-none flex items-end" style={{ gap: size * 0.18 }} aria-hidden>
      <Glass h={size * 1.15} />
      <Bottle h={size * 2.3} />
      <Glass h={size * 1.15} />
    </div>
  );
}

export function CardDeck({ size }: { size: number }) {
  return (
    <div className="pointer-events-none" aria-hidden>
      <Deck w={size * 0.95} />
    </div>
  );
}
