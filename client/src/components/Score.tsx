import { useEffect, useRef, useState } from 'react';
import { halfScore } from '@truco/shared';
import type { RulesConfig, Team } from '@truco/shared';
import { teamName } from '../texts';

const LS_KEY = 'truco.anotador';

/** Pequeño desvío determinista para que los palitos parezcan dibujados a mano. */
const jitter = (seed: number) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1) * 1.4;

// Orden tradicional de los fósforos: izquierda, arriba, derecha, abajo y la diagonal que cierra el cuadrado.
const STICKS: [number, number, number, number][] = [
  [6, 5, 6, 27],
  [5, 6, 27, 6],
  [26, 5, 26, 27],
  [5, 26, 27, 26],
  [8, 24, 24, 8],
];

/** Un cuadrado de fósforos (5 puntos). Los palitos desde `animateFrom` (los recién sumados) se dibujan animados. */
function Square({ filled, group, animateFrom }: { filled: number; group: number; animateFrom: number }) {
  return (
    <svg viewBox="0 0 32 32" className="h-[30px] w-[30px]" aria-hidden>
      {STICKS.slice(0, filled).map(([x1, y1, x2, y2], i) => {
        const index = group * 5 + i;
        const isNew = index >= animateFrom;
        return (
          <line
            key={i}
            x1={x1 + jitter(index)}
            y1={y1 + jitter(index + 0.3)}
            x2={x2 - jitter(index + 0.6)}
            y2={y2 - jitter(index + 0.9)}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className={isNew ? 'anim-stroke' : ''}
            style={isNew ? { animationDelay: `${(index - animateFrom) * 90}ms` } : undefined}
          />
        );
      })}
    </svg>
  );
}

/** Columna de un equipo: los cuadrados de fósforos de arriba hacia abajo, con la línea de malas y buenas. */
function Tally({ points, target, animateFrom }: { points: number; target: number; animateFrom: number }) {
  const groups = target / 5;
  const half = target >= 24 ? groups / 2 : null;
  return (
    <div className="flex flex-col items-center gap-1">
      {Array.from({ length: groups }, (_, g) => (
        <div key={g} className="flex flex-col items-center">
          {half !== null && g === half && <span className="my-1 h-px w-16 bg-pen/25" />}
          <Square filled={Math.max(0, Math.min(5, points - g * 5))} group={g} animateFrom={animateFrom} />
        </div>
      ))}
    </div>
  );
}

const puntos = (n: number) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;

function Chevron({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 12" className={`h-3 w-6 transition-transform duration-200 ${up ? '' : 'rotate-180'}`} aria-hidden>
      <path d="M3 10 L12 3 L21 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Anotador de papel. Plegado muestra solo los puntos; desplegado, los fósforos de cada equipo.
 * Siempre refleja el puntaje real de la partida.
 */
export function ScoreBoard({ score, rules, mySeat }: { score: [number, number]; rules: RulesConfig; mySeat: number | null; compact?: boolean }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === 'abierto';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, open ? 'abierto' : 'cerrado');
    } catch {
      /* almacenamiento no disponible */
    }
  }, [open]);

  // Los palitos nuevos (desde el puntaje anterior) se dibujan con animación.
  const prev = useRef<[number, number]>(score);
  const animateFrom: [number, number] = [prev.current[0], prev.current[1]];
  useEffect(() => {
    prev.current = score;
  }, [score]);

  const order: Team[] = mySeat !== null && mySeat % 2 === 1 ? [1, 0] : [0, 1];
  const half = halfScore(rules);
  const status = (team: Team) => (half === null ? null : score[team] >= half ? 'buenas' : 'malas');
  const columns = (render: (team: Team) => React.ReactNode, divider = 'my-1.5') => (
    <div className="grid grid-cols-[1fr_1px_1fr]">
      {render(order[0])}
      <span className={`bg-pen/35 ${divider}`} />
      {render(order[1])}
    </div>
  );

  return (
    // El espacio reservado en la barra es el del papel plegado; desplegado, crece hacia abajo por encima de la mesa.
    <div className="relative h-[60px] w-[188px] shrink-0 sm:w-[212px]">
      <div className="paper absolute right-0 top-0 z-30 w-full overflow-hidden rounded-[6px] font-hand" aria-label="Anotador">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Esconder el anotador' : 'Ver el anotador'}
          className="block w-full text-left"
        >
          {columns((team) => (
            <div key={team} className="flex flex-col items-center px-2 pt-1.5 leading-none">
              <span className="text-[19px] font-bold">{teamName(team, mySeat)}</span>
              {!open && (
                <span key={score[team]} className="anim-bump mt-0.5 text-[18px] font-medium tabular-nums">
                  {puntos(score[team])}
                </span>
              )}
            </div>
          ))}
          {!open && (
            <span className="flex justify-center pb-0.5 text-pen/70">
              <Chevron up={false} />
            </span>
          )}
        </button>

        {/* Fósforos: se despliegan con una transición de altura */}
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="pb-1 pt-2">
              {columns(
                (team) => (
                  <div key={team} className="flex flex-col items-center gap-1">
                    <Tally points={score[team]} target={rules.targetScore} animateFrom={open ? animateFrom[team] : score[team]} />
                    {status(team) && <span className="text-[14px] text-pen/55">{status(team)}</span>}
                  </div>
                ),
                '',
              )}
            </div>
            <div className="border-t border-pen/15">
              {columns((team) => (
                <span key={team} className="py-1 text-center text-[19px] font-bold tabular-nums">
                  <span key={score[team]} className="anim-bump">
                    {puntos(score[team])}
                  </span>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Esconder el anotador"
              className="flex w-full justify-center pb-1 pt-0.5 text-pen/70 hover:text-pen"
            >
              <Chevron up />
            </button>
            <div className="pb-1.5 text-center text-[13px] text-pen/45">a {rules.targetScore} puntos</div>
          </div>
        </div>
      </div>
    </div>
  );
}
