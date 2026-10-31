// Jugador automático sencillo. Se usa para completar mesas con bots y para jugar
// por un jugador desconectado o cuando vence el tiempo de la jugada.
// Solo usa información que el jugador tendría: sus cartas y la mesa.

import { Card, cardRank, envidoPoints, florPoints, hasFlor } from './cards';
import { Action, GameState, legalActions, pendingBet, teamOf } from './engine';

function find<T extends Action['type']>(legal: Action[], type: T, kind?: string) {
  return legal.find((a) => a.type === type && (kind === undefined || (a as { kind?: string }).kind === kind));
}

function strength(cards: Card[]): number {
  if (!cards.length) return 0;
  const ranks = cards.map(cardRank).sort((a, b) => b - a);
  // Pondera la mejor carta: 0 (malísima) a ~1 (muy buena).
  return (ranks[0] * 0.6 + (ranks[1] ?? ranks[0]) * 0.4) / 14;
}

export function chooseBotAction(state: GameState, seat: number, rng: () => number = Math.random): Action | null {
  const legal = legalActions(state, seat);
  if (!legal.length) return null;
  const h = state.hand;
  const team = teamOf(seat);
  const initial = h.initialHands[seat];
  const envido = envidoPoints(initial);
  const myCards = h.hands[seat];
  const tricksWon = h.tricks.filter((t) => t.done && t.winnerTeam === team).length;
  const tricksLost = h.tricks.filter((t) => t.done && t.winnerTeam !== null && t.winnerTeam !== team).length;
  const power = strength(myCards) + tricksWon * 0.25 - tricksLost * 0.25;
  const bluff = rng() < 0.12;

  const bet = pendingBet(h);
  if (bet === 'flor') {
    const flor = hasFlor(initial) ? florPoints(initial) : 0;
    if (find(legal, 'achico')) {
      if (flor >= 34 && find(legal, 'contraflor')) return { type: 'contraflor' };
      return { type: 'achico' };
    }
    if (flor >= 35 && find(legal, 'contraflorResto')) return { type: 'contraflorResto' };
    return flor >= 31 ? { type: 'quiero' } : { type: 'noQuiero' };
  }
  if (bet === 'envido') {
    if (find(legal, 'flor')) return { type: 'flor' };
    if (envido >= 32 && find(legal, 'envido', 'real')) return { type: 'envido', kind: 'real' };
    if (envido >= 33 && find(legal, 'envido', 'falta')) return { type: 'envido', kind: 'falta' };
    return envido >= 27 || (envido >= 24 && bluff) ? { type: 'quiero' } : { type: 'noQuiero' };
  }
  if (bet === 'truco') {
    if (find(legal, 'flor')) return { type: 'flor' };
    if (find(legal, 'envido', 'envido') && envido >= 27) return { type: 'envido', kind: envido >= 31 ? 'real' : 'envido' };
    const level = h.truco.pending!.level;
    if (power > 0.82 + level * 0.02 && find(legal, 'truco')) return { type: 'truco' };
    if (power > 0.5 + level * 0.06 || bluff) return { type: 'quiero' };
    return { type: 'noQuiero' };
  }

  // Es mi turno.
  if (find(legal, 'flor')) return { type: 'flor' };
  if (find(legal, 'envido', 'envido')) {
    if (envido >= 31 && rng() < 0.6) return { type: 'envido', kind: 'real' };
    if (envido >= 27 || (bluff && envido >= 23)) return { type: 'envido', kind: 'envido' };
  }
  if (find(legal, 'truco') && (power > 0.85 || (bluff && rng() < 0.4)) && h.tricks.length > 1) return { type: 'truco' };

  const plays = myCards.filter((c) => find(legal, 'play') && legal.some((a) => a.type === 'play' && a.cardId === c.id));
  if (!plays.length) return legal[0];
  const sorted = plays.slice().sort((a, b) => cardRank(a) - cardRank(b));
  const trick = h.tricks[h.tricks.length - 1];
  if (!trick.plays.length) {
    // Abro la baza: en primera, una carta media; después, la más alta.
    const pick = h.tricks.length === 1 && sorted.length === 3 ? sorted[1] : sorted[sorted.length - 1];
    return { type: 'play', cardId: pick.id };
  }
  const bestRank = Math.max(...trick.plays.map((p) => cardRank(p.card)));
  const bestPlays = trick.plays.filter((p) => cardRank(p.card) === bestRank);
  const partnerWinning = bestPlays.every((p) => teamOf(p.seat) === team);
  if (partnerWinning) return { type: 'play', cardId: sorted[0].id };
  const winner = sorted.find((c) => cardRank(c) > bestRank);
  if (winner) return { type: 'play', cardId: winner.id };
  const tie = sorted.find((c) => cardRank(c) === bestRank);
  if (tie && tricksWon > 0) return { type: 'play', cardId: tie.id };
  return { type: 'play', cardId: sorted[0].id };
}
