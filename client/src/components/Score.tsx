import { halfScore } from '@truco/shared';
import type { RulesConfig, Team } from '@truco/shared';
import { teamName } from '../texts';

/** Barra de progreso hacia el objetivo, en tramos de 5 puntos (como los fósforos), con la línea de malas/buenas. */
function Progress({ points, target, team }: { points: number; target: number; team: Team }) {
  const groups = target / 5;
  const half = target >= 24 ? groups / 2 : null;
  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: groups }, (_, i) => {
        const fill = Math.max(0, Math.min(5, points - i * 5)) / 5;
        return (
          <span key={i} className={`relative h-1.5 w-3 overflow-hidden rounded-full bg-ivory/10 sm:w-4 ${half !== null && i === half ? 'ml-1.5' : ''}`}>
            <span
              className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${team === 0 ? 'bg-team0' : 'bg-team1'}`}
              style={{ width: `${fill * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}

function TeamRow({ team, score, rules, mySeat }: { team: Team; score: number; rules: RulesConfig; mySeat: number | null }) {
  const half = halfScore(rules);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3">
      <span className={`h-2 w-2 rounded-full ${team === 0 ? 'bg-team0' : 'bg-team1'}`} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold text-ivory/90">{teamName(team, mySeat)}</span>
          {half !== null && <span className="text-[10px] font-semibold uppercase tracking-wider text-ivory/40">{score >= half ? 'buenas' : 'malas'}</span>}
        </div>
        <Progress points={score} target={rules.targetScore} team={team} />
      </div>
      {/* La key reinicia la animación cada vez que cambia el puntaje. */}
      <span key={score} className="anim-bump min-w-[2ch] text-right text-2xl font-extrabold tabular-nums leading-none text-ivory">
        {score}
      </span>
    </div>
  );
}

export function ScoreBoard({ score, rules, mySeat, compact }: { score: [number, number]; rules: RulesConfig; mySeat: number | null; compact?: boolean }) {
  const order: Team[] = mySeat !== null && mySeat % 2 === 1 ? [1, 0] : [0, 1];
  if (compact) {
    return (
      <div className="panel flex items-center gap-3 rounded-[var(--radius-lg)] px-3 py-1.5" aria-label="Marcador">
        {order.map((team, i) => (
          <div key={team} className="flex items-center gap-1.5">
            {i === 1 && <span className="mr-1.5 h-5 w-px bg-ivory/10" />}
            <span className={`h-2 w-2 rounded-full ${team === 0 ? 'bg-team0' : 'bg-team1'}`} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ivory/60">{teamName(team, mySeat).slice(0, 8)}</span>
            <span key={score[team]} className="anim-bump text-lg font-extrabold tabular-nums leading-none">
              {score[team]}
            </span>
          </div>
        ))}
        <span className="text-[10px] font-semibold text-ivory/40">/{rules.targetScore}</span>
      </div>
    );
  }
  return (
    <div className="panel flex items-center gap-4 rounded-[var(--radius-lg)] px-4 py-2" aria-label="Marcador">
      {order.map((team, i) => (
        <div key={team} className="flex items-center gap-4">
          {i === 1 && <span className="h-8 w-px bg-ivory/10" />}
          <div className="w-44">
            <TeamRow team={team} score={score[team]} rules={rules} mySeat={mySeat} />
          </div>
        </div>
      ))}
    </div>
  );
}
