// Frases de los bots: comentan lo que hacen para darle vida a la mesa.
// Se mandan como mensajes del chat de la mesa (los ven todos) y en la mesa aparecen en la nube del bot.

import { Action, GameState, cardRank, teamOf } from '@truco/shared';

const LINES = {
  truco: ['A ver si te animás', '¿Querés o no querés?', 'Esta mano es nuestra', 'Vamos que hay con qué', 'No me mires así'],
  retruco: ['No me asustás', 'Subila, que me gusta', '¡Ahora sí se pone lindo!', 'Te veo y te subo'],
  valeCuatro: ['¡Todo o nada!', 'Me la juego entera', 'Vamos a ver quién tiene más'],
  envido: ['Tengo unos puntitos…', 'A ver qué tenés', 'Mmm… me la juego', 'Algo tengo, eh'],
  realEnvido: ['Estos puntos no te van a gustar', 'Real, y no es chiste'],
  faltaEnvido: ['¡Por todo!', 'A matar o morir'],
  flor: ['¡Con flor no se juega!', 'Florcita para la mesa'],
  quiero: ['Quiero, vamos', 'Dale nomás', 'A ver esas cartas', 'Acepto, ¿qué tanto?'],
  noQuiero: ['Esta vez no', 'Andá nomás', 'Me guardo para la próxima', 'Ni loco'],
  mazo: ['Me voy, no hay caso', 'Esta no es mi mano'],
  strong: ['¡Tomá!', '¿Y esta?', 'Para que aprendas', 'Esta no la esperabas'],
  partner: ['Te la dejo, compañero', 'Tuya, compañero'],
};

const pick = (list: string[], rng: () => number) => list[Math.floor(rng() * list.length)];

/** Frase para la acción que acaba de hacer el bot (o null si esta vez se queda callado). */
export function botLine(before: GameState, seat: number, action: Action, rng: () => number = Math.random): string | null {
  const h = before.hand;
  switch (action.type) {
    case 'truco': {
      const level = h.truco.pending ? h.truco.pending.level + 1 : h.truco.level + 1;
      const list = level >= 4 ? LINES.valeCuatro : level === 3 ? LINES.retruco : LINES.truco;
      return rng() < 0.6 ? pick(list, rng) : null;
    }
    case 'envido': {
      const list = action.kind === 'falta' ? LINES.faltaEnvido : action.kind === 'real' ? LINES.realEnvido : LINES.envido;
      return rng() < 0.5 ? pick(list, rng) : null;
    }
    case 'flor':
      return rng() < 0.5 ? pick(LINES.flor, rng) : null;
    case 'quiero':
      return rng() < 0.35 ? pick(LINES.quiero, rng) : null;
    case 'noQuiero':
      return rng() < 0.35 ? pick(LINES.noQuiero, rng) : null;
    case 'mazo':
      return rng() < 0.6 ? pick(LINES.mazo, rng) : null;
    case 'play': {
      const card = h.hands[seat].find((c) => c.id === action.cardId);
      if (!card) return null;
      const trick = h.tricks[h.tricks.length - 1];
      const best = trick.plays.reduce<{ seat: number; rank: number } | null>(
        (acc, p) => (!acc || cardRank(p.card) > acc.rank ? { seat: p.seat, rank: cardRank(p.card) } : acc),
        null,
      );
      // Mata con una carta brava (ancho de espada o de basto, siete de espada o de oro).
      if (cardRank(card) >= 11 && best && cardRank(card) > best.rank) return rng() < 0.45 ? pick(LINES.strong, rng) : null;
      if (best && teamOf(best.seat) === teamOf(seat) && cardRank(card) < best.rank && before.numPlayers > 2) return rng() < 0.15 ? pick(LINES.partner, rng) : null;
      return null;
    }
    default:
      return null;
  }
}
