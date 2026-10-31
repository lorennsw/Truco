// Baraja española de 40 cartas (sin ochos, nueves ni comodines).

export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export type CardNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  id: string;
  suit: Suit;
  number: CardNumber;
}

export const SUITS: Suit[] = ['espada', 'basto', 'oro', 'copa'];
export const NUMBERS: CardNumber[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export function makeCard(number: CardNumber, suit: Suit): Card {
  return { id: `${number}-${suit}`, number, suit };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const n of NUMBERS) deck.push(makeCard(n, suit));
  return deck;
}

/** Fisher–Yates. `rng` devuelve un número en [0, 1). */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Jerarquía del truco: valor más alto = carta más fuerte (14 escalones).
 *  14 ancho de espadas · 13 ancho de bastos · 12 siete de espadas · 11 siete de oros
 *  10 treses · 9 doses · 8 ancho de copas/oros · 7 doces · 6 onces · 5 dieces
 *  4 siete de copas/bastos · 3 seises · 2 cincos · 1 cuatros
 */
export function cardRank(card: Pick<Card, 'number' | 'suit'>): number {
  const { number: n, suit: s } = card;
  if (n === 1 && s === 'espada') return 14;
  if (n === 1 && s === 'basto') return 13;
  if (n === 7 && s === 'espada') return 12;
  if (n === 7 && s === 'oro') return 11;
  switch (n) {
    case 3: return 10;
    case 2: return 9;
    case 1: return 8;
    case 12: return 7;
    case 11: return 6;
    case 10: return 5;
    case 7: return 4;
    case 6: return 3;
    case 5: return 2;
    case 4: return 1;
  }
}

/** Valor de una carta para el envido: las figuras (10, 11, 12) valen 0. */
export function envidoValue(card: Pick<Card, 'number'>): number {
  return card.number >= 10 ? 0 : card.number;
}

/**
 * Puntos de envido de una mano de tres cartas.
 * - Dos o más cartas del mismo palo: 20 + las dos de mayor valor de ese palo.
 * - Si no: el valor de envido más alto (las figuras valen 0).
 */
export function envidoPoints(cards: Card[]): number {
  let best = 0;
  for (const suit of SUITS) {
    const values = cards.filter((c) => c.suit === suit).map(envidoValue).sort((a, b) => b - a);
    if (values.length >= 2) best = Math.max(best, 20 + values[0] + values[1]);
  }
  if (best > 0) return best;
  return Math.max(0, ...cards.map(envidoValue));
}

/** Hay flor cuando las tres cartas son del mismo palo. */
export function hasFlor(cards: Card[]): boolean {
  return cards.length === 3 && cards.every((c) => c.suit === cards[0].suit);
}

/** Puntos de flor: 20 + la suma de las tres cartas (figuras valen 0). */
export function florPoints(cards: Card[]): number {
  if (!hasFlor(cards)) return 0;
  return 20 + cards.reduce((acc, c) => acc + envidoValue(c), 0);
}

const SUIT_PLURAL: Record<Suit, string> = { espada: 'espadas', basto: 'bastos', oro: 'oros', copa: 'copas' };
const NUMBER_LABEL: Partial<Record<CardNumber, string>> = { 1: 'Ancho', 10: 'Sota', 11: 'Caballo', 12: 'Rey' };

/** "Ancho de espadas", "7 de oros", "Rey de copas"... */
export function cardLabel(card: Pick<Card, 'number' | 'suit'>): string {
  return `${NUMBER_LABEL[card.number] ?? card.number} de ${SUIT_PLURAL[card.suit]}`;
}
