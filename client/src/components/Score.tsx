import { halfScore } from '@truco/shared';
import type { RulesConfig, Team } from '@truco/shared';
import { teamName } from '../texts';

/** Un "cuadrado" de fósforos: 1 a 5 palitos (cuatro lados y la diagonal). */
function Fosforo({ n }: { n: number }) {
  const sticks = [
    'M4 4 L24 4',
    'M24 4 L24 24',
    'M24 24 L4 24',
    'M4 24 L4 4',
    'M4 24 L24 4',
  ];
  return (
    <svg viewBox="0 0 28 28" className="h-5 w-5 sm:h-6 sm:w-6">
      {sticks.map((d, i) => (
        <g key={i} opacity={i < n ? 1 : 0.12}>
          <path d={d} stroke="#f3e2b3" strokeWidth="2.6" strokeLinecap="round" />
          {i < n && <circle cx={Number(d.split(' ')[0].slice(1))} cy={Number(d.split(' ')[1])} r="2" fill="#d63a2f" />}
        </g>
      ))}
    </svg>
  );
}

function Tally({ points, target }: { points: number; target: number }) {
  const groups = target / 5;
  const half = target >= 24 ? groups / 2 : null;
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {Array.from({ length: groups }, (_, i) => (
        <span key={i} className="flex items-center">
          {half !== null && i === half && <span className="mx-1 h-5 w-px bg-white/30" />}
          <Fosforo n={Math.max(0, Math.min(5, points - i * 5))} />
        </span>
      ))}
    </div>
  );
}

export function ScoreBoard({ score, rules, mySeat, compact }: { score: [number, number]; rules: RulesConfig; mySeat: number | null; compact?: boolean }) {
  const half = halfScore(rules);
  const order: Team[] = mySeat !== null && mySeat % 2 === 1 ? [1, 0] : [0, 1];
  return (
    <div className="panel flex flex-col gap-1.5 rounded-2xl px-3 py-2 shadow-xl">
      {order.map((team) => (
        <div key={team} className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${team === 0 ? 'bg-team0' : 'bg-team1'}`} />
          <span className="w-20 truncate text-xs font-semibold uppercase tracking-wide text-white/80">{teamName(team, mySeat)}</span>
          <span className="w-7 text-right text-xl font-black tabular-nums">{score[team]}</span>
          {!compact && <Tally points={score[team]} target={rules.targetScore} />}
          {half !== null && (
            <span className="hidden text-[10px] uppercase text-white/50 sm:inline">{score[team] >= half ? 'buenas' : 'malas'}</span>
          )}
        </div>
      ))}
    </div>
  );
}
