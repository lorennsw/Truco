import type { Action, CallName, PlayerView, ScoreReason, Team } from '@truco/shared';

export const CALL_TEXT: Record<CallName, string> = {
  truco: '¡Truco!',
  retruco: '¡Quiero retruco!',
  vale4: '¡Quiero vale cuatro!',
  envido: 'Envido',
  real: 'Real envido',
  falta: '¡Falta envido!',
  flor: '¡Flor!',
  contraflor: '¡Contraflor!',
  contraflorResto: '¡Contraflor al resto!',
  achico: 'Con flor me achico',
  quiero: '¡Quiero!',
  noQuiero: 'No quiero',
  mazo: 'Me voy al mazo',
};

export const SCORE_REASON: Record<ScoreReason, string> = {
  mano: 'la mano',
  trucoNoQuerido: 'truco no querido',
  mazo: 'mazo',
  mazoPenalty: 'mazo en primera',
  envido: 'envido',
  envidoNoQuerido: 'envido no querido',
  flor: 'flor',
  florAchico: 'flor (achicada)',
  contraflor: 'contraflor',
  contraflorNoQuerida: 'contraflor no querida',
};

export function teamName(team: Team, mySeat: number | null) {
  if (mySeat === null) return team === 0 ? 'Equipo 1' : 'Equipo 2';
  return team === mySeat % 2 ? 'Nosotros' : 'Ellos';
}

/** Etiqueta del botón para una acción, según el estado de la mano. */
export function actionLabel(a: Action, g: PlayerView): string {
  switch (a.type) {
    case 'play':
      return 'Jugar';
    case 'truco': {
      const p = g.truco.pending;
      if (p) return p.level === 2 ? 'Quiero retruco' : 'Quiero vale cuatro';
      return ['', '', 'Truco', 'Retruco', 'Vale cuatro'][g.truco.level + 1];
    }
    case 'envido':
      return a.kind === 'envido' ? 'Envido' : a.kind === 'real' ? 'Real envido' : 'Falta envido';
    case 'flor':
      return 'Flor';
    case 'contraflor':
      return 'Contraflor';
    case 'contraflorResto':
      return 'Contraflor al resto';
    case 'achico':
      return 'Con flor me achico';
    case 'quiero':
      return 'Quiero';
    case 'noQuiero':
      return 'No quiero';
    case 'mazo':
      return 'Irse al mazo';
  }
}

/** Descripción de la apuesta pendiente, p. ej. "Envido + Real envido". */
export function pendingText(g: PlayerView): string {
  if (g.pending === 'flor') return g.flor.calls.map((c) => CALL_TEXT[c.kind].replace(/[¡!]/g, '')).join(' → ');
  if (g.pending === 'envido') return g.envido.calls.map((c) => CALL_TEXT[c.kind].replace(/[¡!]/g, '')).join(' + ');
  if (g.pending === 'truco') return ['', '', 'Truco', 'Retruco', 'Vale cuatro'][g.truco.pending!.level];
  return '';
}
