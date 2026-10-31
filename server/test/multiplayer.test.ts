import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, Socket } from 'socket.io-client';
import type { ClientToServer, RoomView, ServerToClient } from '@truco/shared';
import { createTrucoServer } from '../src/app';

type Client = Socket<ServerToClient, ClientToServer> & { last?: RoomView };

let url = '';
const server = createTrucoServer({ serveClient: false });
const clients: Client[] = [];

beforeAll(async () => {
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});
afterAll(() => {
  clients.forEach((c) => c.close());
  server.io.close();
});

async function client(name: string, session?: { playerId: string; token: string }) {
  const s = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
  clients.push(s);
  s.on('room:state', (r) => (s.last = r));
  const res = await s.emitWithAck('session:hello', { name, ...session });
  if (!res.ok) throw new Error(res.error);
  return { s, session: { playerId: res.playerId, token: res.token } };
}

const until = async (fn: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('multijugador', () => {
  it('crear sala, unirse por código, jugar, reconectar', async () => {
    const a = await client('Ana');
    const b = await client('Beto');
    const created = await a.s.emitWithAck('room:create', { name: 'Mesa test', isPublic: true, mode: 1, rules: { turnTimeSec: 0 } });
    expect(created.ok).toBe(true);
    const code = (created as { code: string }).code;

    const joined = await b.s.emitWithAck('room:join', { code: code.toLowerCase() });
    expect(joined.ok).toBe(true);
    await until(() => a.s.last?.seats.every((x) => x.player) === true);
    expect(a.s.last!.seats.map((x) => x.player?.name)).toEqual(['Ana', 'Beto']);

    // Solo el anfitrión puede empezar.
    expect((await b.s.emitWithAck('room:start')).ok).toBe(false);
    expect((await a.s.emitWithAck('room:start')).ok).toBe(true);
    await until(() => !!a.s.last?.game && !!b.s.last?.game);

    // Cada uno ve solo sus cartas.
    const ga = a.s.last!.game!;
    expect(ga.myHand).toHaveLength(3);
    expect(b.s.last!.game!.myHand.map((c) => c.id)).not.toEqual(ga.myHand.map((c) => c.id));
    expect(JSON.stringify(a.s.last)).not.toContain('initialHands');

    // Juega quien tiene el turno; el otro recibe error.
    const turn = ga.turn;
    const [mover, other] = turn === 0 ? [a, b] : [b, a];
    const bad = await other.s.emitWithAck('game:action', { type: 'play', cardId: other.s.last!.game!.myHand[0].id });
    expect(bad.ok).toBe(false);
    const card = mover.s.last!.game!.myHand[0];
    expect((await mover.s.emitWithAck('game:action', { type: 'play', cardId: card.id })).ok).toBe(true);
    await until(() => other.s.last!.game!.tricks[0].plays.length === 1);
    expect(other.s.last!.game!.tricks[0].plays[0].card.id).toBe(card.id);

    // Reconexión: el jugador recupera su lugar y sus cartas.
    const handBefore = b.s.last!.game!.myHand.map((c) => c.id);
    b.s.close();
    const b2 = await client('Beto', b.session);
    await until(() => !!b2.s.last?.game);
    expect(b2.s.last!.me.seat).toBe(1);
    expect(b2.s.last!.game!.myHand.map((c) => c.id)).toEqual(handBefore);
  });

  it('2 vs 2 con bots juega sola hasta terminar manos', async () => {
    const h = await client('Host');
    const created = await h.s.emitWithAck('room:create', { name: 'Bots', isPublic: false, mode: 2, rules: { turnTimeSec: 0 } });
    expect(created.ok).toBe(true);
    for (const seat of [1, 2, 3]) h.s.emit('room:addBot', { seat });
    await until(() => h.s.last?.seats.every((x) => x.player) === true);
    expect(h.s.last!.seats.map((x) => x.team)).toEqual([0, 1, 0, 1]);
    // El host deja su lugar a un bot y mira: la partida avanza sola.
    expect((await h.s.emitWithAck('room:start')).ok).toBe(true);
    await until(() => !!h.s.last?.game);
    const hand0 = h.s.last!.game!.handNumber;
    // Juega el host automáticamente con la lógica del bot cuando le toca.
    const tick = setInterval(async () => {
      const g = h.s.last?.game;
      if (!g || !g.legal.length) return;
      const play = g.legal.find((x) => x.type === 'play') ?? g.legal.find((x) => x.type === 'quiero') ?? g.legal[0];
      h.s.emit('game:action', play);
    }, 50);
    await until(() => (h.s.last?.game?.handNumber ?? 0) > hand0, 20000);
    clearInterval(tick);
    expect(h.s.last!.game!.score[0] + h.s.last!.game!.score[1]).toBeGreaterThan(0);
  }, 30000);

  it('lista de partidas públicas y unirse rápido', async () => {
    const c = await client('Carla');
    const rooms = await new Promise<unknown[]>((r) => {
      c.s.once('lobby:rooms', r);
      c.s.emit('lobby:subscribe');
    });
    expect(Array.isArray(rooms)).toBe(true);
    const host = await client('Dani');
    await host.s.emitWithAck('room:create', { name: 'Pública', isPublic: true, mode: 3, rules: {} });
    const q = await c.s.emitWithAck('room:quickJoin', { mode: 3 });
    expect(q.ok).toBe(true);
    await until(() => c.s.last?.seats.filter((x) => x.player).length === 2);
    expect(c.s.last!.seats).toHaveLength(6);
  });
});
