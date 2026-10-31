import { useSyncExternalStore } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Action, ClientToServer, CreateRoomInput, GameMode, PublicRoomSummary, RoomView, RulesConfig, ServerToClient } from '@truco/shared';

// ───────── Estado global mínimo (sin dependencias) ─────────

interface Notice { id: number; message: string; tone: 'error' | 'info' }

interface State {
  connected: boolean;
  ready: boolean;
  name: string;
  playerId: string | null;
  room: RoomView | null;
  /** Momento local (Date.now) en que vence la jugada. */
  deadlineAt: number | null;
  lobby: PublicRoomSummary[];
  notices: Notice[];
}

const LS = { session: 'truco.session', name: 'truco.name' };
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* almacenamiento no disponible */
  }
};

let state: State = {
  connected: false,
  ready: false,
  name: read(LS.name) ?? '',
  playerId: null,
  room: null,
  deadlineAt: null,
  lobby: [],
  notices: [],
};
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
  );
}

let noticeSeq = 0;
export function notify(message: string, tone: Notice['tone'] = 'error') {
  const n = { id: ++noticeSeq, message, tone };
  set({ notices: [...state.notices, n].slice(-4) });
  setTimeout(() => set({ notices: state.notices.filter((x) => x.id !== n.id) }), 4500);
}

// ───────── Conexión ─────────

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || undefined;
export const socket: Socket<ServerToClient, ClientToServer> = io(SERVER_URL ?? window.location.origin, {
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

function inviteCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('sala')?.toUpperCase() ?? null;
}

export function setUrlRoom(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('sala', code);
  else url.searchParams.delete('sala');
  window.history.replaceState(null, '', url);
}

export function inviteLink(code: string) {
  return `${window.location.origin}${window.location.pathname}?sala=${code}`;
}

socket.on('connect', async () => {
  set({ connected: true });
  const saved = JSON.parse(read(LS.session) ?? 'null') as { playerId: string; token: string } | null;
  const res = await socket.emitWithAck('session:hello', { ...(saved ?? {}), name: state.name || 'Jugador' });
  if (!res.ok) return notify(res.error);
  write(LS.session, JSON.stringify({ playerId: res.playerId, token: res.token }));
  set({ playerId: res.playerId, ready: true });
  if (!res.roomCode) {
    set({ room: null });
    const invite = inviteCodeFromUrl();
    // Si llegó con un enlace de invitación y ya tiene nombre, entra directo.
    if (invite && state.name) joinRoom(invite);
  }
});
socket.on('disconnect', () => set({ connected: false }));
socket.on('room:state', (room) => {
  set({ room, deadlineAt: room.turnMsLeft !== null ? Date.now() + room.turnMsLeft : null });
  setUrlRoom(room.code);
});
socket.on('room:left', (p) => {
  set({ room: null, deadlineAt: null });
  setUrlRoom(null);
  if (p.reason) notify(p.reason, 'info');
});
socket.on('lobby:rooms', (lobby) => set({ lobby }));
socket.on('notice', (p) => notify(p.message));

// ───────── Acciones ─────────

type AckRes = { ok: true } | { ok: false; error: string };
function check<T extends AckRes>(res: T): T {
  if (!res.ok) notify(res.error);
  return res;
}

export function setName(name: string) {
  const clean = name.slice(0, 20);
  write(LS.name, clean);
  set({ name: clean });
  if (clean.trim() && state.ready) socket.emit('player:rename', { name: clean });
}

export async function createRoom(input: CreateRoomInput) {
  return check(await socket.emitWithAck('room:create', input));
}
export async function joinRoom(code: string) {
  const res = check(await socket.emitWithAck('room:join', { code }));
  if (!res.ok) setUrlRoom(null);
  return res;
}
export async function quickJoin(mode?: GameMode) {
  return check(await socket.emitWithAck('room:quickJoin', { mode }));
}
export const leaveRoom = () => {
  socket.emit('room:leave');
  set({ room: null });
  setUrlRoom(null);
};
export const sit = async (seat: number) => check(await socket.emitWithAck('room:sit', { seat }));
export const stand = () => socket.emit('room:stand');
export const autoTeams = () => socket.emit('room:autoTeams');
export const addBot = (seat: number) => socket.emit('room:addBot', { seat });
export const removeSeat = (seat: number) => socket.emit('room:removeSeat', { seat });
export const updateRoom = (p: { name?: string; isPublic?: boolean; mode?: GameMode; rules?: Partial<RulesConfig> }) => socket.emit('room:update', p);
export const startGame = async () => check(await socket.emitWithAck('room:start'));
export const rematch = () => socket.emit('room:rematch');
export const sendAction = async (a: Action) => check(await socket.emitWithAck('game:action', a));
export const sendChat = (text: string) => socket.emit('chat:send', { text });

/** Chat de equipo: el servidor decide el equipo. El clientId evita duplicados si el envío se reintenta. */
export async function sendTeamChat(text: string) {
  const clientId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return check(await socket.emitWithAck('teamChat:send', { text, clientId }));
}
export const subscribeLobby = () => {
  socket.emit('lobby:subscribe');
  const resub = () => socket.emit('lobby:subscribe');
  socket.on('connect', resub);
  return () => {
    socket.off('connect', resub);
    socket.emit('lobby:unsubscribe');
  };
};
