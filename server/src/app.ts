import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { Ack, ClientToServer, ServerToClient } from '@truco/shared';
import { RoomManager, TrucoSocket } from './rooms';

/** Ejecuta un handler y responde por el ack con el resultado o el error. */
function handle<T extends object>(socket: TrucoSocket, ack: Ack<T> | undefined, fn: () => T | void) {
  try {
    const result = fn();
    if (typeof ack === 'function') ack({ ok: true, ...(result ?? ({} as T)) });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error inesperado.';
    if (typeof ack === 'function') ack({ ok: false, error });
    else socket.emit('notice', { message: error });
  }
}

function findClientDist(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  return [resolve(here, '../../client/dist'), resolve(process.cwd(), 'client/dist'), resolve(process.cwd(), '../client/dist')].find((p) =>
    existsSync(resolve(p, 'index.html')),
  );
}

export function createTrucoServer({ serveClient = true } = {}) {
  // Orígenes permitidos para CORS (separados por coma). Por defecto, cualquiera.
  const origins = process.env.CLIENT_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  const app = express();
  const httpServer = createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(httpServer, {
    cors: { origin: origins?.length ? origins : true },
    pingInterval: 10000,
    pingTimeout: 8000,
  });
  const rooms = new RoomManager(io);

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Si existe el build del cliente, se sirve desde el mismo servicio.
  const clientDist = serveClient ? findClientDist() : undefined;
  if (clientDist) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(resolve(clientDist, 'index.html')));
  }

  io.on('connection', (socket: TrucoSocket) => {
    const player = () => {
      const p = rooms.playerOf(socket);
      if (!p) throw new Error('Sesión no iniciada.');
      return p;
    };

    socket.on('session:hello', (p, ack) => handle(socket, ack, () => rooms.hello(socket, p ?? { name: '' })));
    socket.on('player:rename', (p) => handle(socket, undefined, () => rooms.rename(player(), p?.name)));

    socket.on('lobby:subscribe', () => {
      socket.join('lobby');
      socket.emit('lobby:rooms', rooms.publicRooms());
    });
    socket.on('lobby:unsubscribe', () => {
      socket.leave('lobby');
    });

    socket.on('room:create', (p, ack) => handle(socket, ack, () => ({ code: rooms.create(player(), p).code })));
    socket.on('room:join', (p, ack) => handle(socket, ack, () => ({ code: rooms.join(player(), p?.code).code })));
    socket.on('room:quickJoin', (p, ack) => handle(socket, ack, () => ({ code: rooms.quickJoin(player(), p?.mode).code })));
    socket.on('room:leave', () => handle(socket, undefined, () => rooms.leave(player())));
    socket.on('room:sit', (p, ack) => handle(socket, ack, () => rooms.sit(player(), Number(p?.seat))));
    socket.on('room:stand', () => handle(socket, undefined, () => rooms.stand(player())));
    socket.on('room:autoTeams', () => handle(socket, undefined, () => rooms.autoTeams(player())));
    socket.on('room:addBot', (p) => handle(socket, undefined, () => rooms.addBot(player(), Number(p?.seat))));
    socket.on('room:removeSeat', (p) => handle(socket, undefined, () => rooms.removeSeat(player(), Number(p?.seat))));
    socket.on('room:update', (p) => handle(socket, undefined, () => rooms.updateSettings(player(), p ?? {})));
    socket.on('room:start', (ack) => handle(socket, ack, () => rooms.start(player())));
    socket.on('room:rematch', () => handle(socket, undefined, () => rooms.rematch(player())));
    socket.on('game:action', (p, ack) => handle(socket, ack, () => rooms.action(player(), p)));
    socket.on('chat:send', (p) => handle(socket, undefined, () => rooms.chat(player(), p?.text)));
    socket.on('teamChat:send', (p, ack) => handle(socket, ack, () => rooms.teamChat(player(), p?.text, p?.clientId)));

    socket.on('disconnect', () => rooms.disconnect(socket));
  });

  return { app, httpServer, io, rooms, clientDist };
}
