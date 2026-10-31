import { describe, expect, it } from 'vitest';
import {
  Action,
  Card,
  CardNumber,
  DEFAULT_RULES,
  GameState,
  RulesConfig,
  Suit,
  applyAction,
  cardRank,
  chooseBotAction,
  createDeck,
  createGame,
  envidoPoints,
  envidoRaises,
  envidoRejectedValue,
  florPoints,
  handWinner,
  hasFlor,
  isLegal,
  legalActions,
  makeCard,
  startNextHand,
} from '../src';

const SUIT: Record<string, Suit> = { e: 'espada', b: 'basto', o: 'oro', c: 'copa' };
/** c('1e') = ancho de espadas, c('12c') = rey de copas */
const c = (s: string): Card => makeCard(Number(s.slice(0, -1)) as CardNumber, SUIT[s.slice(-1)]);
const hand = (...xs: string[]) => xs.map(c);

const rules = (r: Partial<RulesConfig> = {}): RulesConfig => ({ ...DEFAULT_RULES, turnTimeSec: 0, ...r });

function game(hands: Card[][], r: Partial<RulesConfig> = {}, mano = 0): GameState {
  return createGame({ numPlayers: hands.length as 2 | 4 | 6, rules: rules(r), mano, hands });
}

function act(state: GameState, seat: number, action: Action): GameState {
  const res = applyAction(state, seat, action);
  if (!res.ok) throw new Error(`${JSON.stringify(action)} (asiento ${seat}): ${res.error}`);
  return res.state;
}
const play = (s: GameState, seat: number, card: string) => act(s, seat, { type: 'play', cardId: c(card).id });

describe('baraja y jerarquía', () => {
  it('tiene 40 cartas sin 8, 9 ni comodines', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
    expect(deck.some((x) => (x.number as number) === 8 || (x.number as number) === 9)).toBe(false);
    expect(new Set(deck.map((x) => x.id)).size).toBe(40);
  });

  it('respeta el orden de fuerza tradicional', () => {
    const order = [
      ['1e'], ['1b'], ['7e'], ['7o'], ['3e', '3b', '3o', '3c'], ['2e', '2b', '2o', '2c'], ['1o', '1c'],
      ['12e', '12b', '12o', '12c'], ['11e', '11b', '11o', '11c'], ['10e', '10b', '10o', '10c'],
      ['7c', '7b'], ['6e', '6b', '6o', '6c'], ['5e', '5b', '5o', '5c'], ['4e', '4b', '4o', '4c'],
    ];
    for (let i = 0; i < order.length; i++) {
      const ranks = order[i].map((x) => cardRank(c(x)));
      expect(new Set(ranks).size).toBe(1); // mismo escalón
      if (i > 0) expect(cardRank(c(order[i - 1][0]))).toBeGreaterThan(ranks[0]);
    }
  });
});

describe('cálculo de envido y flor', () => {
  it('dos del mismo palo: 20 + valores, figuras valen 0', () => {
    expect(envidoPoints(hand('7e', '6e', '1b'))).toBe(33);
    expect(envidoPoints(hand('12o', '5o', '3c'))).toBe(25);
    expect(envidoPoints(hand('10c', '11c', '4b'))).toBe(20);
  });
  it('sin palo repetido: cuenta la carta más alta para el envido', () => {
    expect(envidoPoints(hand('7e', '3b', '12o'))).toBe(7);
    expect(envidoPoints(hand('10e', '11b', '12o'))).toBe(0);
  });
  it('tres del mismo palo: para el envido valen las dos mejores; para la flor, las tres', () => {
    const h = hand('7o', '6o', '5o');
    expect(envidoPoints(h)).toBe(33);
    expect(hasFlor(h)).toBe(true);
    expect(florPoints(h)).toBe(38);
    expect(florPoints(hand('12c', '11c', '10c'))).toBe(20);
  });
});

describe('resultado de la mano por bazas', () => {
  it('gana quien gana dos bazas', () => {
    expect(handWinner([0, 0], 1)).toBe(0);
    expect(handWinner([1, 0, 1], 0)).toBe(1);
  });
  it('parda en primera: define la segunda', () => {
    expect(handWinner([null, 1], 0)).toBe(1);
  });
  it('gana primera y empata segunda o tercera: gana quien hizo primera', () => {
    expect(handWinner([0, null], 1)).toBe(0);
    expect(handWinner([1, 0, null], 0)).toBe(1);
  });
  it('dos pardas: define la tercera; tres pardas: gana la mano', () => {
    expect(handWinner([null, null], 0)).toBeUndefined();
    expect(handWinner([null, null, 1], 0)).toBe(1);
    expect(handWinner([null, null, null], 1)).toBe(1);
  });
  it('mano sin definir tras una baza', () => {
    expect(handWinner([0], 0)).toBeUndefined();
    expect(handWinner([0, 1], 0)).toBeUndefined();
  });
});

describe('flujo de juego 1 vs 1', () => {
  const H = [hand('1e', '4c', '5c'), hand('3o', '2b', '6e')];

  it('solo juega el que tiene el turno', () => {
    const g = game(H);
    expect(isLegal(g, 1, { type: 'play', cardId: c('3o').id })).toBe(false);
    expect(applyAction(g, 1, { type: 'play', cardId: c('3o').id }).ok).toBe(false);
  });

  it('juega tres bazas y suma 1 punto sin truco', () => {
    let g = game(H);
    g = play(g, 0, '1e'); // gana 0
    g = play(g, 1, '6e');
    expect(g.hand.turn).toBe(0); // abre quien ganó
    g = play(g, 0, '4c');
    g = play(g, 1, '3o'); // gana 1
    expect(g.hand.turn).toBe(1);
    g = play(g, 1, '2b');
    g = play(g, 0, '5c'); // gana 1
    expect(g.phase).toBe('handOver');
    expect(g.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'bazas' });
    expect(g.score).toEqual([0, 1]);
  });

  it('la mano rota al siguiente jugador', () => {
    let g = game(H);
    g = act(g, 0, { type: 'mazo' });
    g = startNextHand(g);
    expect(g.hand.mano).toBe(1);
    expect(g.hand.turn).toBe(1);
    expect(g.hand.number).toBe(2);
  });

  it('truco querido vale 2, retruco no querido da 2 al que cantó truco', () => {
    let g = game(H);
    g = act(g, 0, { type: 'truco' });
    expect(legalActions(g, 0)).toEqual([]); // nadie juega con apuesta pendiente
    g = act(g, 1, { type: 'quiero' });
    expect(g.hand.truco.level).toBe(2);
    expect(g.hand.truco.holder).toBe(1);
    // El que cantó truco no puede retrucar: el quiero lo tiene el rival.
    expect(isLegal(g, 0, { type: 'truco' })).toBe(false);
    g = play(g, 0, '1e');
    g = act(g, 1, { type: 'truco' }); // retruco
    expect(g.hand.truco.pending?.level).toBe(3);
    g = act(g, 0, { type: 'noQuiero' });
    expect(g.score).toEqual([0, 2]);
    expect(g.hand.result?.reason).toBe('noQuiero');
  });

  it('quiero retruco y vale cuatro: escalan hasta 4', () => {
    let g = game(H);
    g = act(g, 0, { type: 'truco' });
    g = act(g, 1, { type: 'truco' }); // quiero retruco
    expect(g.hand.truco.level).toBe(2);
    g = act(g, 0, { type: 'truco' }); // quiero vale cuatro
    expect(g.hand.truco.level).toBe(3);
    expect(g.hand.truco.pending?.level).toBe(4);
    expect(isLegal(g, 1, { type: 'truco' })).toBe(false); // no hay más que vale cuatro
    g = act(g, 1, { type: 'quiero' });
    g = play(g, 0, '1e');
    g = play(g, 1, '6e');
    g = play(g, 0, '4c');
    g = play(g, 1, '3o');
    g = play(g, 1, '2b');
    g = play(g, 0, '5c');
    expect(g.score).toEqual([0, 4]);
  });

  it('truco no querido da 1 punto', () => {
    let g = game(H);
    g = act(g, 0, { type: 'truco' });
    g = act(g, 1, { type: 'noQuiero' });
    expect(g.score).toEqual([1, 0]);
  });

  it('no se puede cantar truco fuera de turno', () => {
    const g = game(H);
    expect(isLegal(g, 1, { type: 'truco' })).toBe(false);
  });
});

describe('envido', () => {
  // Jugador 0 (mano): 33 de envido. Jugador 1: 27.
  const H = [hand('7e', '6e', '4c'), hand('7o', '12o', '5b')];

  it('envido querido: 2 puntos al de mayor tanto', () => {
    let g = game(H);
    g = act(g, 0, { type: 'envido', kind: 'envido' });
    g = act(g, 1, { type: 'quiero' });
    expect(g.score).toEqual([2, 0]);
    expect(g.hand.envido.status).toBe('done');
    const ev = g.events.find((e) => e.kind === 'envidoResult');
    expect(ev && ev.kind === 'envidoResult' && ev.reveals).toEqual([
      { seat: 0, points: 33 },
      { seat: 1, points: 27 },
    ]);
  });

  it('cadenas legales y valores acumulados', () => {
    expect(envidoRaises(['envido'], rules())).toEqual(['envido', 'real', 'falta']);
    expect(envidoRaises(['envido', 'envido'], rules())).toEqual(['real', 'falta']);
    expect(envidoRaises(['envido'], rules({ envidoEnvido: false }))).toEqual(['real', 'falta']);
    expect(envidoRaises(['real'], rules())).toEqual(['falta']);
    expect(envidoRaises(['falta'], rules())).toEqual([]);
    expect(envidoRejectedValue(['envido'])).toBe(1);
    expect(envidoRejectedValue(['envido', 'envido'])).toBe(2);
    expect(envidoRejectedValue(['envido', 'real'])).toBe(2);
    expect(envidoRejectedValue(['envido', 'envido', 'real'])).toBe(4);
    expect(envidoRejectedValue(['envido', 'real', 'falta'])).toBe(5);
    expect(envidoRejectedValue(['real'])).toBe(1);
  });

  it('envido + real envido querido = 5; no querido = 2 al que cantó real', () => {
    let g = game(H);
    g = act(g, 0, { type: 'envido', kind: 'envido' });
    g = act(g, 1, { type: 'envido', kind: 'real' });
    const accepted = act(g, 0, { type: 'quiero' });
    expect(accepted.score).toEqual([5, 0]);
    const rejected = act(g, 0, { type: 'noQuiero' });
    expect(rejected.score).toEqual([0, 2]);
  });

  it('empate de envido: gana la mano', () => {
    let g = game([hand('7e', '6e', '4c'), hand('7o', '6o', '5b')], {}, 1);
    g = act(g, 1, { type: 'envido', kind: 'envido' });
    g = act(g, 0, { type: 'quiero' });
    expect(g.score).toEqual([0, 2]); // el asiento 1 es mano
  });

  it('falta envido en malas (a 30) gana el partido', () => {
    let g = game(H);
    g.score = [10, 12];
    g = act(g, 0, { type: 'envido', kind: 'falta' });
    g = act(g, 1, { type: 'quiero' });
    expect(g.score[0]).toBe(30);
    expect(g.phase).toBe('gameOver');
    expect(g.winner).toBe(0);
  });

  it('falta envido en buenas vale lo que le falta al que va ganando', () => {
    let g = game(H);
    g.score = [5, 20];
    g = act(g, 0, { type: 'envido', kind: 'falta' });
    g = act(g, 1, { type: 'quiero' });
    expect(g.score).toEqual([15, 20]);
  });

  it('falta envido a 15 puntos vale lo que le falta al líder', () => {
    let g = game(H, { targetScore: 15 });
    g.score = [3, 4];
    g = act(g, 0, { type: 'envido', kind: 'falta' });
    g = act(g, 1, { type: 'quiero' });
    expect(g.score).toEqual([14, 4]);
  });

  it('el envido solo se canta en primera', () => {
    let g = game(H);
    g = play(g, 0, '4c');
    expect(isLegal(g, 1, { type: 'envido', kind: 'envido' })).toBe(true); // el pie todavía no jugó
    g = play(g, 1, '5b');
    expect(legalActions(g, g.hand.turn).some((a) => a.type === 'envido')).toBe(false);
  });

  it('"el envido está primero": se responde el truco con envido y luego sigue el truco', () => {
    let g = game(H);
    g = act(g, 0, { type: 'truco' });
    g = act(g, 1, { type: 'envido', kind: 'envido' });
    expect(legalActions(g, 0).some((a) => a.type === 'play')).toBe(false);
    g = act(g, 0, { type: 'quiero' }); // quiere el envido
    expect(g.score).toEqual([2, 0]);
    expect(g.hand.truco.pending?.level).toBe(2); // el truco sigue pendiente
    expect(legalActions(g, 1).map((a) => a.type)).toContain('quiero');
    g = act(g, 1, { type: 'quiero' });
    expect(g.hand.truco.level).toBe(2);
  });

  it('con truco querido ya no se puede cantar envido', () => {
    let g = game(H);
    g = act(g, 0, { type: 'truco' });
    g = act(g, 1, { type: 'quiero' });
    expect(isLegal(g, 0, { type: 'envido', kind: 'envido' })).toBe(false);
  });

  it('contra el retruco no hay envido', () => {
    let g = game(H);
    g = act(g, 0, { type: 'truco' });
    g = act(g, 1, { type: 'truco' });
    expect(legalActions(g, 0).some((a) => a.type === 'envido')).toBe(false);
  });
});

describe('flor', () => {
  it('flor sin flor rival: 3 puntos automáticos y anula el envido', () => {
    let g = game([hand('7e', '6e', '4e'), hand('7o', '12o', '5b')], { flor: true });
    expect(isLegal(g, 1, { type: 'flor' })).toBe(false);
    g = act(g, 0, { type: 'flor' });
    expect(g.score).toEqual([3, 0]);
    expect(g.hand.envido.status).toBe('closed');
    expect(legalActions(g, 0).some((a) => a.type === 'envido')).toBe(false);
  });

  it('flor desactivada: no se canta', () => {
    const g = game([hand('7e', '6e', '4e'), hand('7o', '12o', '5b')], { flor: false });
    expect(isLegal(g, 0, { type: 'flor' })).toBe(false);
  });

  it('se puede responder un envido con flor', () => {
    let g = game([hand('7o', '12o', '5b'), hand('7e', '6e', '4e')], { flor: true });
    g = act(g, 0, { type: 'envido', kind: 'envido' });
    g = act(g, 1, { type: 'flor' });
    expect(g.score).toEqual([0, 3]);
    expect(g.hand.envido.status).toBe('closed');
  });

  it('contraflor querida: 6 puntos al de mejor flor', () => {
    let g = game([hand('7e', '6e', '4e'), hand('1o', '2o', '3o')], { flor: true });
    g = act(g, 0, { type: 'flor' });
    expect(legalActions(g, 1).map((a) => a.type)).toEqual(['contraflor', 'contraflorResto', 'achico']);
    g = act(g, 1, { type: 'contraflor' });
    g = act(g, 0, { type: 'quiero' });
    expect(g.score).toEqual([6, 0]); // 37 contra 26
  });

  it('con flor me achico: 4 puntos para el que cantó flor', () => {
    let g = game([hand('7e', '6e', '4e'), hand('1o', '2o', '3o')], { flor: true });
    g = act(g, 0, { type: 'flor' });
    g = act(g, 1, { type: 'achico' });
    expect(g.score).toEqual([4, 0]);
  });

  it('contraflor no querida: 4 para quien la cantó', () => {
    let g = game([hand('7e', '6e', '4e'), hand('1o', '2o', '3o')], { flor: true });
    g = act(g, 0, { type: 'flor' });
    g = act(g, 1, { type: 'contraflor' });
    g = act(g, 0, { type: 'noQuiero' });
    expect(g.score).toEqual([0, 4]);
  });
});

describe('mazo', () => {
  const H = [hand('1e', '4c', '5c'), hand('3o', '2b', '6e')];
  it('irse al mazo en primera sin envido da 1 extra (configurable)', () => {
    expect(act(game(H), 0, { type: 'mazo' }).score).toEqual([0, 2]);
    expect(act(game(H, { mazoPenaltyFirstRound: false }), 0, { type: 'mazo' }).score).toEqual([0, 1]);
  });
  it('irse al mazo con truco querido da los puntos del truco', () => {
    let g = game(H);
    g = act(g, 0, { type: 'truco' });
    g = act(g, 1, { type: 'quiero' });
    g = act(g, 0, { type: 'mazo' });
    expect(g.score).toEqual([0, 2]);
  });
});

describe('2 vs 2 y 3 vs 3', () => {
  it('2 vs 2: compañeros enfrentados (0-2 y 1-3) y el turno pasa en orden', () => {
    let g = game([hand('4e', '5e', '6e'), hand('4b', '5b', '6b'), hand('1e', '5o', '6o'), hand('4c', '5c', '6c')], {}, 0);
    g = play(g, 0, '4e');
    expect(g.hand.turn).toBe(1);
    g = play(g, 1, '6b');
    g = play(g, 2, '1e');
    g = play(g, 3, '4c');
    const t = g.hand.tricks[0];
    expect(t.winnerTeam).toBe(0);
    expect(t.winnerSeat).toBe(2);
    expect(g.hand.turn).toBe(2); // abre el que ganó la baza
  });

  it('empate dentro del mismo equipo no es parda', () => {
    let g = game([hand('3e', '5e', '6e'), hand('4b', '5b', '6b'), hand('3o', '5o', '6o'), hand('4c', '5c', '6c')], {}, 0);
    g = play(g, 0, '3e');
    g = play(g, 1, '4b');
    g = play(g, 2, '3o');
    g = play(g, 3, '4c');
    expect(g.hand.tricks[0].winnerTeam).toBe(0);
    expect(g.hand.tricks[0].winnerSeat).toBe(0);
  });

  it('parda entre equipos: abre la siguiente quien abrió la empardada', () => {
    let g = game([hand('3e', '5e', '6e'), hand('3b', '5b', '6b'), hand('4o', '5o', '6o'), hand('4c', '5c', '6c')], {}, 1);
    g = play(g, 1, '3b');
    g = play(g, 2, '4o');
    g = play(g, 3, '4c');
    g = play(g, 0, '3e');
    expect(g.hand.tricks[0].winnerTeam).toBeNull();
    expect(g.hand.turn).toBe(1);
  });

  it('envido por equipos: cuenta el mejor de cada equipo; empate gana el más cercano a la mano', () => {
    // Asiento 3 (equipo 1) y asiento 2 (equipo 0) tienen 33. Mano: asiento 3.
    const hs = [hand('4e', '10b', '11o'), hand('4b', '10c', '12o'), hand('7c', '6c', '1e'), hand('7o', '6o', '1b')];
    let g = game(hs, {}, 3);
    g = act(g, 3, { type: 'envido', kind: 'envido' });
    g = act(g, 2, { type: 'quiero' }); // cualquier compañero puede responder
    expect(g.score).toEqual([0, 2]);
  });

  it('3 vs 3: seis jugadores, equipos alternados y bazas completas', () => {
    const hs = [
      hand('4e', '5e', '6e'), hand('4b', '5b', '6b'), hand('4o', '5o', '6o'),
      hand('4c', '5c', '6c'), hand('1e', '10e', '11e'), hand('1b', '10b', '11b'),
    ];
    let g = game(hs, {}, 0);
    for (const [seat, card] of [[0, '4e'], [1, '4b'], [2, '4o'], [3, '4c'], [4, '1e'], [5, '1b']] as const) g = play(g, seat, card);
    expect(g.hand.tricks[0].winnerSeat).toBe(4);
    expect(g.hand.turn).toBe(4);
    for (const [seat, card] of [[4, '10e'], [5, '10b'], [0, '5e'], [1, '5b'], [2, '5o'], [3, '5c']] as const) g = play(g, seat, card);
    expect(g.phase).toBe('handOver');
    expect(g.score).toEqual([1, 0]);
  });
});

describe('partida completa con bots', () => {
  for (const numPlayers of [2, 4, 6] as const) {
    for (const flor of [false, true]) {
      it(`${numPlayers} jugadores, flor ${flor ? 'sí' : 'no'}: siempre termina con un ganador`, () => {
        let seed = 42 + numPlayers + (flor ? 100 : 0);
        const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        let g = createGame({ numPlayers, rules: rules({ flor }), rng });
        let steps = 0;
        while (g.phase !== 'gameOver' && steps < 20000) {
          steps++;
          if (g.phase === 'handOver') {
            g = startNextHand(g, rng);
            continue;
          }
          const actors = Array.from({ length: numPlayers }, (_, s) => s).filter((s) => legalActions(g, s).length);
          expect(actors.length).toBeGreaterThan(0);
          const seat = actors[Math.floor(rng() * actors.length)];
          const action = chooseBotAction(g, seat, rng)!;
          g = act(g, seat, action);
          expect(g.score[0]).toBeLessThanOrEqual(30);
        }
        expect(g.phase).toBe('gameOver');
        expect(g.score[g.winner!]).toBe(30);
      });
    }
  }
});
