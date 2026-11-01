import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, Socket } from 'socket.io-client';
import type { ClientToServer, GameMode, RoomView, ServerToClient } from '@truco/shared';
import { createTrucoServer } from '../src/app';

type Client = Socket<ServerToClient, ClientToServer> & {
  last?: RoomView;
  /** Todo lo que recibió el cliente, serializado, para buscar filtraciones. */
  raw: string[];
  session: { playerId: string; token: string };
};

let url = '';
const server = createTrucoServer({ serveClient: false, pace: 0.2 });
const all: Client[] = [];

beforeAll(async () => {
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});
afterAll(() => {
  all.forEach((c) => c.close());
  server.io.close();
});

async function client(name: string, session?: { playerId: string; token: string }): Promise<Client> {
  const s = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
  s.raw = [];
  all.push(s);
  s.onAny((_event, ...args) => s.raw.push(JSON.stringify(args)));
  s.on('room:state', (r) => (s.last = r));
  const res = await s.emitWithAck('session:hello', { name, ...session });
  if (!res.ok) throw new Error(res.error);
  s.session = { playerId: res.playerId, token: res.token };
  return s;
}

const until = async (fn: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 15));
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Crea una partida con jugadores humanos en todos los lugares (asientos pares = equipo 0, impares = equipo 1). */
async function table(mode: GameMode, prefix: string) {
  const size = mode * 2;
  const players: Client[] = [];
  const host = await client(`${prefix}0`);
  const created = await host.emitWithAck('room:create', { name: prefix, isPublic: false, mode, rules: { turnTimeSec: 0 } });
  if (!created.ok) throw new Error(created.error);
  const code = created.code;
  players.push(host);
  for (let i = 1; i < size; i++) {
    const c = await client(`${prefix}${i}`);
    const joined = await c.emitWithAck('room:join', { code });
    if (!joined.ok) throw new Error(joined.error);
    players.push(c);
  }
  await until(() => host.last?.seats.every((s) => s.player) === true);
  const started = await host.emitWithAck('room:start');
  if (!started.ok) throw new Error(started.error);
  await until(() => players.every((p) => p.last?.status === 'playing'));
  // Asiento de cada cliente según el servidor.
  const bySeat: Client[] = [];
  for (const p of players) bySeat[p.last!.me.seat!] = p;
  return { code, bySeat, team0: bySeat.filter((_, i) => i % 2 === 0), team1: bySeat.filter((_, i) => i % 2 === 1) };
}

const texts = (c: Client) => (c.last?.teamChat ?? []).map((m) => m.text);
const leaked = (c: Client, secret: string) => c.raw.some((r) => r.includes(secret));

describe('chat de equipo', () => {
  it('2 vs 2: los compañeros se leen y los rivales no reciben nada', async () => {
    const { team0, team1 } = await table(2, 'A');
    const secret = 'SECRETO-2V2-quiero-retruco';
    const res = await team0[0].emitWithAck('teamChat:send', { text: secret, clientId: 'm1' });
    expect(res.ok).toBe(true);
    await until(() => texts(team0[1]).includes(secret));
    expect(texts(team0[0])).toEqual([secret]);
    const msg = team0[1].last!.teamChat![0];
    expect(msg.team).toBe(0);
    expect(msg.senderId).toBe(team0[0].session.playerId);
    expect(msg.gameId).toBeTruthy();
    expect(typeof msg.at).toBe('number');

    // Respuesta del compañero.
    expect((await team0[1].emitWithAck('teamChat:send', { text: 'dale, tengo el ancho' })).ok).toBe(true);
    await until(() => texts(team0[0]).length === 2);

    await sleep(150);
    for (const rival of team1) {
      expect(leaked(rival, secret)).toBe(false);
      expect(rival.last!.teamChat).toEqual([]);
    }
  });

  it('3 vs 3: los tres compañeros comparten la conversación; el otro equipo no accede', async () => {
    const { team0, team1 } = await table(3, 'B');
    const secret0 = 'SECRETO-3V3-equipo-cero';
    const secret1 = 'SECRETO-3V3-equipo-uno';
    for (const [i, c] of team0.entries()) expect((await c.emitWithAck('teamChat:send', { text: `${secret0}-${i}` })).ok).toBe(true);
    expect((await team1[2].emitWithAck('teamChat:send', { text: secret1 })).ok).toBe(true);

    for (const c of team0) await until(() => texts(c).length === 3);
    for (const c of team1) await until(() => texts(c).length === 1);
    await sleep(150);
    for (const c of team0) {
      expect(texts(c)).toEqual([0, 1, 2].map((i) => `${secret0}-${i}`));
      expect(leaked(c, secret1)).toBe(false);
    }
    for (const c of team1) {
      expect(texts(c)).toEqual([secret1]);
      expect(leaked(c, secret0)).toBe(false);
    }
  });

  it('no se puede fingir pertenecer al otro equipo', async () => {
    const { code, team0, team1 } = await table(2, 'C');
    const secret = 'SECRETO-falso-equipo';
    // Campos inventados por el cliente: el servidor los ignora.
    const spoof = { text: secret, team: 1, roomCode: code, senderId: team1[0].session.playerId, seat: 1 } as unknown as { text: string };
    expect((await team0[0].emitWithAck('teamChat:send', spoof)).ok).toBe(true);
    await until(() => texts(team0[1]).includes(secret));
    const msg = team0[1].last!.teamChat!.find((m) => m.text === secret)!;
    expect(msg.team).toBe(0);
    expect(msg.senderId).toBe(team0[0].session.playerId);
    await sleep(150);
    for (const rival of team1) expect(leaked(rival, secret)).toBe(false);
  });

  it('un usuario ajeno a la partida no puede leer ni escribir', async () => {
    const { code, team0 } = await table(2, 'D');
    const secret = 'SECRETO-ajeno';
    // Fuera de cualquier sala.
    const outsider = await client('Intruso');
    const r1 = await outsider.emitWithAck('teamChat:send', { text: 'hola' });
    expect(r1.ok).toBe(false);
    // Dentro de la sala pero como espectador (entró con la partida empezada).
    const spectator = await client('Mirón');
    expect((await spectator.emitWithAck('room:join', { code })).ok).toBe(true);
    await until(() => !!spectator.last);
    expect(spectator.last!.me.seat).toBeNull();
    expect(spectator.last!.teamChat).toBeNull();
    const r2 = await spectator.emitWithAck('teamChat:send', { text: 'hola' });
    expect(r2.ok).toBe(false);

    expect((await team0[0].emitWithAck('teamChat:send', { text: secret })).ok).toBe(true);
    await until(() => texts(team0[1]).includes(secret));
    await sleep(150);
    expect(leaked(outsider, secret)).toBe(false);
    expect(leaked(spectator, secret)).toBe(false);
  });

  it('los mensajes no se filtran a otras partidas simultáneas', async () => {
    const g1 = await table(2, 'E');
    const g2 = await table(2, 'F');
    const secret = 'SECRETO-partida-uno';
    expect((await g1.team0[0].emitWithAck('teamChat:send', { text: secret })).ok).toBe(true);
    await until(() => texts(g1.team0[1]).includes(secret));
    await sleep(150);
    for (const c of g2.bySeat) {
      expect(leaked(c, secret)).toBe(false);
      expect(c.last!.teamChat).toEqual([]);
    }
  });

  it('el historial se recupera al reconectarse, sin duplicados', async () => {
    const { team0, team1 } = await table(2, 'G');
    const secret = 'SECRETO-reconexion';
    expect((await team0[0].emitWithAck('teamChat:send', { text: secret, clientId: 'abc' })).ok).toBe(true);
    // Reintento con el mismo clientId: no se duplica.
    const retry = await team0[0].emitWithAck('teamChat:send', { text: secret, clientId: 'abc' });
    expect(retry.ok).toBe(true);
    await until(() => texts(team0[1]).includes(secret));

    const session = team0[1].session;
    team0[1].close();
    // Mientras está desconectado, el compañero sigue escribiendo.
    expect((await team0[0].emitWithAck('teamChat:send', { text: 'mientras no estabas' })).ok).toBe(true);
    const back = await client('vuelve', session);
    await until(() => !!back.last?.teamChat);
    expect(texts(back)).toEqual([secret, 'mientras no estabas']);
    expect(new Set(back.last!.teamChat!.map((m) => m.id)).size).toBe(2);

    // Un rival que se reconecta no recupera mensajes ajenos.
    const rivalSession = team1[0].session;
    team1[0].close();
    const rivalBack = await client('rival', rivalSession);
    await until(() => !!rivalBack.last);
    expect(rivalBack.last!.teamChat).toEqual([]);
    expect(leaked(rivalBack, secret)).toBe(false);
  });

  it('la sesión de una partida anterior no da acceso al chat de la nueva', async () => {
    const { team0 } = await table(2, 'H');
    const secret = 'SECRETO-partida-vieja';
    expect((await team0[0].emitWithAck('teamChat:send', { text: secret })).ok).toBe(true);
    await until(() => texts(team0[1]).includes(secret));
    const oldGameId = team0[1].last!.teamChat![0].gameId;
    // El jugador se va de la sala y entra a otra partida distinta.
    team0[1].emit('room:leave');
    const other = await table(2, 'I');
    const newcomerSession = team0[1].session;
    // Con su misma sesión, no ve nada de la partida anterior.
    const again = await client('reusa', newcomerSession);
    await sleep(200);
    expect(again.last?.teamChat ?? null).toBeNull();
    expect(leaked(again, secret)).toBe(false);
    expect(JSON.stringify(other.bySeat.map((c) => c.last))).not.toContain(oldGameId);
  });

  it('valida contenido vacío, largo excesivo y frecuencia', async () => {
    const { team0 } = await table(2, 'J');
    expect((await team0[0].emitWithAck('teamChat:send', { text: '   \n  ' })).ok).toBe(false);
    expect((await team0[0].emitWithAck('teamChat:send', { text: 'x'.repeat(301) })).ok).toBe(false);
    expect((await team0[0].emitWithAck('teamChat:send', { text: 123 as unknown as string })).ok).toBe(false);
    const results: boolean[] = [];
    for (let i = 0; i < 8; i++) results.push((await team0[0].emitWithAck('teamChat:send', { text: `spam ${i}` })).ok);
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(results.slice(5).every((r) => !r)).toBe(true);
  });

  it('el chat general sigue funcionando para todos', async () => {
    const { bySeat } = await table(2, 'K');
    bySeat[1].emit('chat:send', { text: 'hola a todos' });
    for (const c of bySeat) await until(() => c.last!.chat.some((m) => m.text === 'hola a todos'));
  });

  it('en 1 vs 1 no hay chat de equipo', async () => {
    const { bySeat } = await table(1, 'L');
    for (const c of bySeat) expect(c.last!.teamChat).toBeNull();
    expect((await bySeat[0].emitWithAck('teamChat:send', { text: 'hola' })).ok).toBe(false);
  });
});
