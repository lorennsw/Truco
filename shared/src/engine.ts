// Motor del Truco Argentino: una máquina de estados pura y determinista.
// El servidor es la única autoridad: recibe acciones, las valida con `legalActions`
// y aplica `applyAction`. El cliente solo recibe vistas filtradas (`getPlayerView`).

import { Card, cardRank, createDeck, envidoPoints, florPoints, hasFlor, shuffle } from './cards';
import { RulesConfig, halfScore } from './rules';

export type Team = 0 | 1;
export type NumPlayers = 2 | 4 | 6;
/** 1 = sin truco (la mano vale 1), 2 = truco, 3 = retruco, 4 = vale cuatro. */
export type TrucoLevel = 1 | 2 | 3 | 4;
export type EnvidoKind = 'envido' | 'real' | 'falta';
export type FlorKind = 'flor' | 'contraflor' | 'contraflorResto';

export type Action =
  | { type: 'play'; cardId: string }
  | { type: 'truco' }
  | { type: 'envido'; kind: EnvidoKind }
  | { type: 'flor' }
  | { type: 'contraflor' }
  | { type: 'contraflorResto' }
  | { type: 'achico' }
  | { type: 'quiero' }
  | { type: 'noQuiero' }
  | { type: 'mazo' };

export type CallName =
  | 'truco' | 'retruco' | 'vale4'
  | 'envido' | 'real' | 'falta'
  | 'flor' | 'contraflor' | 'contraflorResto' | 'achico'
  | 'quiero' | 'noQuiero' | 'mazo';

export type ScoreReason =
  | 'mano' | 'trucoNoQuerido' | 'mazo' | 'mazoPenalty'
  | 'envido' | 'envidoNoQuerido' | 'flor' | 'florAchico' | 'contraflor' | 'contraflorNoQuerida';

export type HandEndReason = 'bazas' | 'noQuiero' | 'mazo';

export type GameEvent = { id: number } & (
  | { kind: 'newHand'; hand: number; mano: number }
  | { kind: 'call'; seat: number; call: CallName }
  | { kind: 'play'; seat: number; card: Card }
  | { kind: 'trick'; index: number; winnerTeam: Team | null; winnerSeat: number | null }
  | { kind: 'envidoResult'; winnerTeam: Team; winnerSeat: number; reveals: { seat: number; points: number }[] }
  | { kind: 'florResult'; winnerTeam: Team; reveals: { seat: number; points: number }[] }
  | { kind: 'score'; team: Team; points: number; reason: ScoreReason }
  | { kind: 'handEnd'; winnerTeam: Team; points: number; reason: HandEndReason }
  | { kind: 'gameOver'; winnerTeam: Team }
);
type NewEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'id'> : never) : never;

export interface TrickPlay { seat: number; card: Card }
export interface Trick {
  leader: number;
  plays: TrickPlay[];
  done: boolean;
  /** null = parda (empate entre equipos). */
  winnerTeam?: Team | null;
  winnerSeat?: number | null;
}
export interface BetCall<K> { kind: K; seat: number; team: Team }

export interface HandState {
  number: number;
  mano: number;
  initialHands: Card[][];
  hands: Card[][];
  tricks: Trick[];
  turn: number;
  truco: {
    /** Apuesta aceptada vigente. */
    level: TrucoLevel;
    /** Equipo que "tiene el quiero": el único que puede subir la apuesta. null = cualquiera. */
    holder: Team | null;
    /** Apuesta propuesta pendiente de respuesta. */
    pending: { level: 2 | 3 | 4; seat: number; team: Team } | null;
  };
  envido: { status: 'available' | 'pending' | 'done' | 'closed'; calls: BetCall<EnvidoKind>[] };
  flor: { status: 'none' | 'pending' | 'done'; calls: BetCall<FlorKind>[] };
  result: { winnerTeam: Team; points: number; reason: HandEndReason } | null;
}

export interface GameState {
  numPlayers: NumPlayers;
  rules: RulesConfig;
  score: [number, number];
  phase: 'playing' | 'handOver' | 'gameOver';
  winner: Team | null;
  hand: HandState;
  events: GameEvent[];
  eventSeq: number;
}

export interface CreateGameOptions {
  numPlayers: NumPlayers;
  rules: RulesConfig;
  /** Jugador mano de la primera mano (por defecto, al azar). */
  mano?: number;
  rng?: () => number;
  /** Manos forzadas (para pruebas). */
  hands?: Card[][];
}

const MAX_EVENTS = 80;
export const TRUCO_CALL: Record<2 | 3 | 4, CallName> = { 2: 'truco', 3: 'retruco', 4: 'vale4' };

// ───────────────────────── Utilidades ─────────────────────────

export const teamOf = (seat: number): Team => (seat % 2) as Team;
export const otherTeam = (t: Team): Team => (t === 0 ? 1 : 0);

/** Asientos ordenados desde la mano en sentido de juego. */
export function seatsFromMano(numPlayers: number, mano: number): number[] {
  return Array.from({ length: numPlayers }, (_, i) => (mano + i) % numPlayers);
}

/** El estado es JSON puro: una copia profunda simple alcanza. */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function emit(state: GameState, ev: NewEvent) {
  state.eventSeq += 1;
  state.events.push({ ...ev, id: state.eventSeq } as GameEvent);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

function currentTrick(h: HandState): Trick {
  return h.tricks[h.tricks.length - 1];
}

function hasPlayedInTrick(t: Trick | undefined, seat: number) {
  return !!t && t.plays.some((p) => p.seat === seat);
}

export function isFirstRound(h: HandState) {
  return h.tricks.length === 1;
}

export type PendingBet = 'flor' | 'envido' | 'truco' | null;

/** Apuesta que debe responderse primero: flor > envido > truco. */
export function pendingBet(h: HandState): PendingBet {
  if (h.flor.status === 'pending') return 'flor';
  if (h.envido.status === 'pending') return 'envido';
  if (h.truco.pending) return 'truco';
  return null;
}

/** Equipo que debe responder la apuesta pendiente (o null si no hay). */
export function respondingTeam(h: HandState): Team | null {
  const bet = pendingBet(h);
  if (bet === 'flor') return otherTeam(h.flor.calls[h.flor.calls.length - 1].team);
  if (bet === 'envido') return otherTeam(h.envido.calls[h.envido.calls.length - 1].team);
  if (bet === 'truco') return otherTeam(h.truco.pending!.team);
  return null;
}

function envidoOpen(h: HandState, rules: RulesConfig): boolean {
  void rules;
  return isFirstRound(h) && h.envido.status === 'available' && h.flor.status === 'none';
}

function canSingFlor(state: GameState, seat: number): boolean {
  const h = state.hand;
  return (
    state.rules.flor &&
    isFirstRound(h) &&
    h.flor.status === 'none' &&
    hasFlor(h.initialHands[seat]) &&
    !hasPlayedInTrick(h.tricks[0], seat)
  );
}

function teamHasFlor(h: HandState, team: Team): boolean {
  return h.initialHands.some((cards, seat) => teamOf(seat) === team && hasFlor(cards));
}

/** Combinaciones legales de envido después de una secuencia de cantos. */
export function envidoRaises(calls: EnvidoKind[], rules: RulesConfig): EnvidoKind[] {
  const envidos = calls.filter((c) => c === 'envido').length;
  const hasReal = calls.includes('real');
  const hasFalta = calls.includes('falta');
  const out: EnvidoKind[] = [];
  if (hasFalta) return out;
  if (!hasReal && envidos < (rules.envidoEnvido ? 2 : 1)) out.push('envido');
  if (!hasReal) out.push('real');
  out.push('falta');
  return out;
}

/** Valor de la falta (envido o contraflor al resto) para el equipo ganador. */
export function faltaValue(state: GameState, winner: Team): number {
  const target = state.rules.targetScore;
  const leader = Math.max(state.score[0], state.score[1]);
  const toWinGame = target - state.score[winner];
  switch (state.rules.faltaEnvido) {
    case 'partidoCompleto':
      return toWinGame;
    case 'faltaLider':
      return target - leader;
    case 'buenasMalas': {
      const half = halfScore(state.rules);
      if (half !== null && leader < half) return toWinGame;
      return target - leader;
    }
  }
}

/** Puntos de un envido querido. */
export function envidoAcceptedValue(state: GameState, calls: EnvidoKind[], winner: Team): number {
  if (calls.includes('falta')) {
    // La falta reemplaza a lo acumulado: vale la falta.
    return faltaValue(state, winner);
  }
  return calls.reduce((acc, c) => acc + (c === 'envido' ? 2 : 3), 0);
}

/** Puntos de un envido no querido: lo acumulado antes del último canto (mínimo 1). */
export function envidoRejectedValue(calls: EnvidoKind[]): number {
  if (calls.length <= 1) return 1;
  return calls.slice(0, -1).reduce((acc, c) => acc + (c === 'envido' ? 2 : c === 'real' ? 3 : 0), 0);
}

/**
 * Ganador de una comparación de tantos (envido o flor). Empate: gana el más cercano a la mano.
 */
export function compareTantos(
  numPlayers: number,
  mano: number,
  valueOf: (seat: number) => number | null,
): { winnerTeam: Team; winnerSeat: number; reveals: { seat: number; points: number }[] } {
  const order = seatsFromMano(numPlayers, mano);
  const reveals: { seat: number; points: number }[] = [];
  let best = -1;
  let winnerSeat = order[0];
  for (const seat of order) {
    const v = valueOf(seat);
    if (v === null) continue;
    reveals.push({ seat, points: v });
    if (v > best) {
      best = v;
      winnerSeat = seat;
    }
  }
  return { winnerTeam: teamOf(winnerSeat), winnerSeat, reveals };
}

/**
 * Determina el ganador de la mano según las bazas resueltas (null = parda).
 * - Gana quien gana dos bazas.
 * - Parda en primera: define la segunda; si también es parda, la tercera; si las tres son pardas, gana la mano.
 * - Gana primera y parda en segunda (o tercera): gana quien ganó la primera.
 */
export function handWinner(results: (Team | null)[], manoTeam: Team): Team | undefined {
  const wins = [0, 0];
  for (const r of results) if (r !== null) wins[r]++;
  if (wins[0] >= 2) return 0;
  if (wins[1] >= 2) return 1;
  if (results.length < 2) return undefined;
  const [r1, r2, r3] = results;
  if (r1 === null) {
    if (r2 !== null) return r2;
    if (results.length === 3) return r3 ?? manoTeam;
    return undefined;
  }
  if (r2 === null) return r1;
  if (results.length === 3) return r3 === null ? r1 : r3;
  return undefined;
}

// ───────────────────────── Creación ─────────────────────────

function dealHand(numPlayers: number, rng: () => number, forced?: Card[][]): Card[][] {
  if (forced) return forced.map((h) => h.slice());
  const deck = shuffle(createDeck(), rng);
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  for (let r = 0; r < 3; r++) for (let s = 0; s < numPlayers; s++) hands[s].push(deck.pop()!);
  return hands;
}

function newHand(number: number, mano: number, hands: Card[][]): HandState {
  return {
    number,
    mano,
    initialHands: hands.map((h) => h.slice()),
    hands,
    tricks: [{ leader: mano, plays: [], done: false }],
    turn: mano,
    truco: { level: 1, holder: null, pending: null },
    envido: { status: 'available', calls: [] },
    flor: { status: 'none', calls: [] },
    result: null,
  };
}

export function createGame(opts: CreateGameOptions): GameState {
  const rng = opts.rng ?? Math.random;
  const mano = opts.mano ?? Math.floor(rng() * opts.numPlayers);
  const state: GameState = {
    numPlayers: opts.numPlayers,
    rules: opts.rules,
    score: [0, 0],
    phase: 'playing',
    winner: null,
    hand: newHand(1, mano, dealHand(opts.numPlayers, rng, opts.hands)),
    events: [],
    eventSeq: 0,
  };
  emit(state, { kind: 'newHand', hand: 1, mano });
  return state;
}

/** Reparte la mano siguiente. La mano rota al jugador de la derecha (siguiente asiento). */
export function startNextHand(prev: GameState, rng: () => number = Math.random, forcedHands?: Card[][]): GameState {
  if (prev.phase !== 'handOver') return prev;
  const state = clone(prev);
  const mano = (state.hand.mano + 1) % state.numPlayers;
  state.hand = newHand(state.hand.number + 1, mano, dealHand(state.numPlayers, rng, forcedHands));
  state.phase = 'playing';
  emit(state, { kind: 'newHand', hand: state.hand.number, mano });
  return state;
}

// ───────────────────────── Acciones legales ─────────────────────────

export function legalActions(state: GameState, seat: number): Action[] {
  if (state.phase !== 'playing' || seat < 0 || seat >= state.numPlayers) return [];
  const h = state.hand;
  const team = teamOf(seat);
  const bet = pendingBet(h);
  const out: Action[] = [];

  if (bet) {
    if (respondingTeam(h) !== team) return [];
    if (bet === 'flor') {
      const last = h.flor.calls[h.flor.calls.length - 1].kind;
      if (last === 'flor') {
        if (state.rules.contraflor) out.push({ type: 'contraflor' }, { type: 'contraflorResto' });
        out.push({ type: 'achico' });
      } else if (last === 'contraflor') {
        out.push({ type: 'quiero' }, { type: 'noQuiero' }, { type: 'contraflorResto' });
      } else {
        out.push({ type: 'quiero' }, { type: 'noQuiero' });
      }
      return out;
    }
    if (bet === 'envido') {
      out.push({ type: 'quiero' }, { type: 'noQuiero' });
      for (const kind of envidoRaises(h.envido.calls.map((c) => c.kind), state.rules)) out.push({ type: 'envido', kind });
      if (canSingFlor(state, seat)) out.push({ type: 'flor' });
      return out;
    }
    // Truco pendiente.
    out.push({ type: 'quiero' }, { type: 'noQuiero' });
    if (h.truco.pending!.level < 4) out.push({ type: 'truco' });
    // "El envido está primero": se puede responder al truco (no al retruco) con envido.
    if (h.truco.pending!.level === 2 && envidoOpen(h, state.rules)) {
      for (const kind of envidoRaises([], state.rules)) out.push({ type: 'envido', kind });
    }
    if (canSingFlor(state, seat)) out.push({ type: 'flor' });
    out.push({ type: 'mazo' });
    return out;
  }

  if (h.turn !== seat) return [];
  for (const card of h.hands[seat]) out.push({ type: 'play', cardId: card.id });
  if (h.truco.level < 4 && (h.truco.holder === null || h.truco.holder === team)) out.push({ type: 'truco' });
  if (envidoOpen(h, state.rules) && h.truco.level === 1) {
    for (const kind of envidoRaises([], state.rules)) out.push({ type: 'envido', kind });
  }
  if (canSingFlor(state, seat)) out.push({ type: 'flor' });
  out.push({ type: 'mazo' });
  return out;
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'play') return a.cardId === (b as typeof a).cardId;
  if (a.type === 'envido') return a.kind === (b as typeof a).kind;
  return true;
}

export function isLegal(state: GameState, seat: number, action: Action): boolean {
  return legalActions(state, seat).some((a) => sameAction(a, action));
}

// ───────────────────────── Aplicación de acciones ─────────────────────────

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string };

export function applyAction(prev: GameState, seat: number, action: Action): ApplyResult {
  if (prev.phase !== 'playing') return { ok: false, error: 'La mano no está en juego.' };
  if (!isLegal(prev, seat, action)) return { ok: false, error: 'Jugada no permitida en este momento.' };
  const state = clone(prev);
  const h = state.hand;
  const team = teamOf(seat);

  switch (action.type) {
    case 'play':
      playCard(state, seat, action.cardId);
      break;

    case 'truco': {
      const p = h.truco.pending;
      if (p) {
        // "Quiero retruco": acepta la apuesta pendiente y sube.
        h.truco.level = p.level;
        h.truco.holder = team;
        closeEnvido(h);
      }
      const level = (p ? p.level + 1 : h.truco.level + 1) as 2 | 3 | 4;
      h.truco.pending = { level, seat, team };
      emit(state, { kind: 'call', seat, call: TRUCO_CALL[level] });
      break;
    }

    case 'envido':
      h.envido.status = 'pending';
      h.envido.calls.push({ kind: action.kind, seat, team });
      emit(state, { kind: 'call', seat, call: action.kind });
      break;

    case 'flor':
      singFlor(state, seat);
      break;

    case 'contraflor':
    case 'contraflorResto':
      h.flor.calls.push({ kind: action.type, seat, team });
      emit(state, { kind: 'call', seat, call: action.type });
      break;

    case 'achico': {
      emit(state, { kind: 'call', seat, call: 'achico' });
      h.flor.status = 'done';
      addScore(state, otherTeam(team), 4, 'florAchico');
      break;
    }

    case 'quiero':
      emit(state, { kind: 'call', seat, call: 'quiero' });
      accept(state, team);
      break;

    case 'noQuiero':
      emit(state, { kind: 'call', seat, call: 'noQuiero' });
      reject(state);
      break;

    case 'mazo': {
      emit(state, { kind: 'call', seat, call: 'mazo' });
      const rival = otherTeam(team);
      const penalty =
        state.rules.mazoPenaltyFirstRound && isFirstRound(h) && h.envido.status === 'available' && h.flor.status === 'none';
      if (penalty) addScore(state, rival, 1, 'mazoPenalty');
      if (state.phase === 'playing') endHand(state, rival, h.truco.level, 'mazo');
      break;
    }
  }
  return { ok: true, state };
}

function closeEnvido(h: HandState) {
  if (h.envido.status === 'available') h.envido.status = 'closed';
}

function playCard(state: GameState, seat: number, cardId: string) {
  const h = state.hand;
  const idx = h.hands[seat].findIndex((c) => c.id === cardId);
  const [card] = h.hands[seat].splice(idx, 1);
  const trick = currentTrick(h);
  trick.plays.push({ seat, card });
  emit(state, { kind: 'play', seat, card });

  if (trick.plays.length < state.numPlayers) {
    h.turn = (seat + 1) % state.numPlayers;
    return;
  }

  // Resolver la baza.
  const best = Math.max(...trick.plays.map((p) => cardRank(p.card)));
  const top = trick.plays.filter((p) => cardRank(p.card) === best);
  const teams = new Set(top.map((p) => teamOf(p.seat)));
  trick.done = true;
  if (teams.size === 1) {
    trick.winnerTeam = teamOf(top[0].seat);
    trick.winnerSeat = top[0].seat;
  } else {
    trick.winnerTeam = null;
    trick.winnerSeat = null;
  }
  emit(state, { kind: 'trick', index: h.tricks.length - 1, winnerTeam: trick.winnerTeam, winnerSeat: trick.winnerSeat });
  if (isFirstRound(h)) closeEnvido(h);

  const winner = handWinner(h.tricks.map((t) => t.winnerTeam!), teamOf(h.mano));
  if (winner !== undefined) {
    endHand(state, winner, h.truco.level, 'bazas');
    return;
  }
  // La próxima baza la abre quien ganó; si fue parda, quien abrió la baza empardada.
  const leader = trick.winnerSeat ?? trick.leader;
  h.tricks.push({ leader, plays: [], done: false });
  h.turn = leader;
}

function singFlor(state: GameState, seat: number) {
  const h = state.hand;
  const team = teamOf(seat);
  // La flor anula el envido.
  if (h.envido.status === 'pending' || h.envido.status === 'available') h.envido.status = 'closed';
  h.flor.calls.push({ kind: 'flor', seat, team });
  emit(state, { kind: 'call', seat, call: 'flor' });

  const rival = otherTeam(team);
  if (!teamHasFlor(h, rival)) {
    // Nadie del otro equipo tiene flor: 3 puntos por cada flor del equipo.
    const flores = h.initialHands.filter((c, s) => teamOf(s) === team && hasFlor(c)).length;
    h.flor.status = 'done';
    emit(state, {
      kind: 'florResult',
      winnerTeam: team,
      reveals: h.initialHands.flatMap((c, s) => (teamOf(s) === team && hasFlor(c) ? [{ seat: s, points: florPoints(c) }] : [])),
    });
    addScore(state, team, 3 * flores, 'flor');
  } else {
    h.flor.status = 'pending';
  }
}

function resolveFlorComparison(state: GameState) {
  const h = state.hand;
  return compareTantos(state.numPlayers, h.mano, (s) => (hasFlor(h.initialHands[s]) ? florPoints(h.initialHands[s]) : null));
}

function accept(state: GameState, team: Team) {
  const h = state.hand;
  const bet = pendingBet(h);
  if (bet === 'flor') {
    const last = h.flor.calls[h.flor.calls.length - 1].kind;
    const res = resolveFlorComparison(state);
    h.flor.status = 'done';
    emit(state, { kind: 'florResult', winnerTeam: res.winnerTeam, reveals: res.reveals });
    const pts = last === 'contraflorResto' ? faltaValue(state, res.winnerTeam) : 6;
    addScore(state, res.winnerTeam, pts, 'contraflor');
    return;
  }
  if (bet === 'envido') {
    const res = compareTantos(state.numPlayers, h.mano, (s) => envidoPoints(h.initialHands[s]));
    h.envido.status = 'done';
    emit(state, { kind: 'envidoResult', winnerTeam: res.winnerTeam, winnerSeat: res.winnerSeat, reveals: res.reveals });
    addScore(state, res.winnerTeam, envidoAcceptedValue(state, h.envido.calls.map((c) => c.kind), res.winnerTeam), 'envido');
    return;
  }
  if (bet === 'truco') {
    h.truco.level = h.truco.pending!.level;
    h.truco.holder = team;
    h.truco.pending = null;
    closeEnvido(h);
  }
}

function reject(state: GameState) {
  const h = state.hand;
  const bet = pendingBet(h);
  if (bet === 'flor') {
    const calls = h.flor.calls;
    const last = calls[calls.length - 1];
    const pts = last.kind === 'contraflorResto' && calls.some((c) => c.kind === 'contraflor') ? 6 : 4;
    h.flor.status = 'done';
    addScore(state, last.team, pts, 'contraflorNoQuerida');
    return;
  }
  if (bet === 'envido') {
    const calls = h.envido.calls;
    h.envido.status = 'done';
    addScore(state, calls[calls.length - 1].team, envidoRejectedValue(calls.map((c) => c.kind)), 'envidoNoQuerido');
    return;
  }
  if (bet === 'truco') {
    const caller = h.truco.pending!.team;
    endHand(state, caller, h.truco.level, 'noQuiero');
  }
}

function addScore(state: GameState, team: Team, points: number, reason: ScoreReason) {
  if (points <= 0 || state.phase === 'gameOver') return;
  const target = state.rules.targetScore;
  state.score[team] = Math.min(target, state.score[team] + points);
  emit(state, { kind: 'score', team, points, reason });
  if (state.score[team] >= target) {
    state.phase = 'gameOver';
    state.winner = team;
    emit(state, { kind: 'gameOver', winnerTeam: team });
  }
}

function endHand(state: GameState, winnerTeam: Team, points: number, reason: HandEndReason) {
  const h = state.hand;
  h.result = { winnerTeam, points, reason };
  h.truco.pending = null;
  emit(state, { kind: 'handEnd', winnerTeam, points, reason });
  const scoreReason: ScoreReason = reason === 'bazas' ? 'mano' : reason === 'noQuiero' ? 'trucoNoQuerido' : 'mazo';
  addScore(state, winnerTeam, points, scoreReason);
  if (state.phase === 'playing') state.phase = 'handOver';
}

// ───────────────────────── Vista por jugador ─────────────────────────

export interface PlayerView {
  numPlayers: NumPlayers;
  rules: RulesConfig;
  score: [number, number];
  phase: GameState['phase'];
  winner: Team | null;
  seat: number | null;
  myHand: Card[];
  myEnvido: number | null;
  myFlor: number | null;
  cardsLeft: number[];
  handNumber: number;
  mano: number;
  turn: number;
  tricks: Trick[];
  truco: HandState['truco'];
  envido: HandState['envido'];
  flor: HandState['flor'];
  pending: PendingBet;
  respondingTeam: Team | null;
  result: HandState['result'];
  legal: Action[];
  events: GameEvent[];
}

/** Vista filtrada: nadie ve las cartas en mano de los demás. */
export function getPlayerView(state: GameState, seat: number | null): PlayerView {
  const h = state.hand;
  const mine = seat !== null ? h.hands[seat] : [];
  const initial = seat !== null ? h.initialHands[seat] : [];
  return {
    numPlayers: state.numPlayers,
    rules: state.rules,
    score: state.score,
    phase: state.phase,
    winner: state.winner,
    seat,
    myHand: mine,
    myEnvido: seat !== null ? envidoPoints(initial) : null,
    myFlor: seat !== null && state.rules.flor && hasFlor(initial) ? florPoints(initial) : null,
    cardsLeft: h.hands.map((x) => x.length),
    handNumber: h.number,
    mano: h.mano,
    turn: h.turn,
    tricks: h.tricks,
    truco: h.truco,
    envido: h.envido,
    flor: h.flor,
    pending: pendingBet(h),
    respondingTeam: respondingTeam(h),
    result: h.result,
    legal: seat !== null ? legalActions(state, seat) : [],
    events: state.events,
  };
}
