// Mesa de bodegón: tapa de madera con vetas, canto oscuro y, encima, el mazo.

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

function Deck({ w }: { w: number }) {
  return (
    <div className="relative" style={{ width: w * 1.5, height: w * 1.1 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="card-back absolute left-1/2 top-1/2 rounded-[6%/4%]"
          style={{ width: w, height: (w * 520) / 336, transform: `translate(-50%, -50%) rotate(${78 + i * 3}deg) translate(${-i * 1.5}px, ${-i * 1.5}px)` }}
        />
      ))}
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
