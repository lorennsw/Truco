// Configuración de reglas por sala. Todas las variantes regionales se centralizan acá.
// Las decisiones de reglamento están documentadas en docs/REGLAS.md.

export type TargetScore = 15 | 24 | 30;

/**
 * Cómo se valúa la Falta Envido (y la Contraflor al resto):
 * - buenasMalas: tradicional. Si quien va ganando está "en malas" (menos de la mitad
 *   del objetivo) la falta gana el partido; si está "en buenas" vale lo que le falta
 *   al que va ganando. En partidas a 15 no hay malas/buenas y vale lo que le falta al líder.
 * - faltaLider: siempre vale lo que le falta al que va ganando para llegar al objetivo.
 * - partidoCompleto: quien gana la falta gana el partido.
 */
export type FaltaEnvidoMode = 'buenasMalas' | 'faltaLider' | 'partidoCompleto';

export interface RulesConfig {
  /** Puntos para ganar el partido. */
  targetScore: TargetScore;
  /** Se juega con flor. */
  flor: boolean;
  /** Con flor activada: se permiten Contraflor y Contraflor al resto. */
  contraflor: boolean;
  /** Se permite "Envido Envido" (dos envidos seguidos). */
  envidoEnvido: boolean;
  faltaEnvido: FaltaEnvidoMode;
  /** Irse al mazo en primera, sin que se haya cantado envido/flor, da 1 punto extra al rival. */
  mazoPenaltyFirstRound: boolean;
  /** Segundos por jugada (0 = sin límite). Al vencer, el sistema juega automáticamente. */
  turnTimeSec: 0 | 30 | 45 | 60 | 90;
}

export const DEFAULT_RULES: RulesConfig = {
  targetScore: 30,
  flor: false,
  contraflor: true,
  envidoEnvido: true,
  faltaEnvido: 'buenasMalas',
  mazoPenaltyFirstRound: true,
  turnTimeSec: 60,
};

const TARGETS: TargetScore[] = [15, 24, 30];
const FALTA_MODES: FaltaEnvidoMode[] = ['buenasMalas', 'faltaLider', 'partidoCompleto'];
const TURN_TIMES: RulesConfig['turnTimeSec'][] = [0, 30, 45, 60, 90];

/** Normaliza la configuración que llega del cliente (nunca confiar en el input). */
export function sanitizeRules(input: unknown): RulesConfig {
  const r = (typeof input === 'object' && input !== null ? input : {}) as Partial<Record<keyof RulesConfig, unknown>>;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    targetScore: TARGETS.includes(r.targetScore as TargetScore) ? (r.targetScore as TargetScore) : DEFAULT_RULES.targetScore,
    flor: bool(r.flor, DEFAULT_RULES.flor),
    contraflor: bool(r.contraflor, DEFAULT_RULES.contraflor),
    envidoEnvido: bool(r.envidoEnvido, DEFAULT_RULES.envidoEnvido),
    faltaEnvido: FALTA_MODES.includes(r.faltaEnvido as FaltaEnvidoMode) ? (r.faltaEnvido as FaltaEnvidoMode) : DEFAULT_RULES.faltaEnvido,
    mazoPenaltyFirstRound: bool(r.mazoPenaltyFirstRound, DEFAULT_RULES.mazoPenaltyFirstRound),
    turnTimeSec: TURN_TIMES.includes(r.turnTimeSec as RulesConfig['turnTimeSec'])
      ? (r.turnTimeSec as RulesConfig['turnTimeSec'])
      : DEFAULT_RULES.turnTimeSec,
  };
}

/** Puntos de las "malas": la mitad del objetivo (no aplica a 15). */
export function halfScore(rules: RulesConfig): number | null {
  return rules.targetScore >= 24 ? rules.targetScore / 2 : null;
}

/** Resumen legible del reglamento activo, para mostrar antes y durante la partida. */
export function describeRules(r: RulesConfig): { label: string; value: string }[] {
  const falta: Record<FaltaEnvidoMode, string> = {
    buenasMalas: r.targetScore >= 24 ? 'En malas gana el partido; en buenas, lo que le falta al líder' : 'Lo que le falta al que va ganando',
    faltaLider: 'Lo que le falta al que va ganando',
    partidoCompleto: 'Gana el partido',
  };
  return [
    { label: 'Partida a', value: `${r.targetScore} puntos${halfScore(r) ? ` (malas y buenas de ${halfScore(r)})` : ''}` },
    { label: 'Flor', value: r.flor ? (r.contraflor ? 'Sí, con contraflor y contraflor al resto' : 'Sí, sin contraflor') : 'No' },
    { label: 'Envido envido', value: r.envidoEnvido ? 'Permitido' : 'No permitido' },
    { label: 'Falta envido', value: falta[r.faltaEnvido] },
    { label: 'Empates de envido y flor', value: 'Gana el que es mano (o el más cercano a la mano)' },
    { label: 'Tres bazas empardadas', value: 'Gana el equipo del jugador mano' },
    { label: 'Irse al mazo en primera', value: r.mazoPenaltyFirstRound ? 'Si no se cantó envido, el rival suma 1 punto extra' : 'Sin penalidad extra' },
    { label: 'Tiempo por jugada', value: r.turnTimeSec ? `${r.turnTimeSec} segundos` : 'Sin límite' },
  ];
}
