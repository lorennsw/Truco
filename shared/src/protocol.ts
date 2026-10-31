// Contrato de mensajes Socket.IO entre cliente y servidor.

import type { Action, PlayerView, Team } from './engine';
import type { RulesConfig } from './rules';

export type GameMode = 1 | 2 | 3;
export const MODE_PLAYERS: Record<GameMode, 2 | 4 | 6> = { 1: 2, 2: 4, 3: 6 };
export const MODE_LABEL: Record<GameMode, string> = { 1: '1 vs 1', 2: '2 vs 2', 3: '3 vs 3' };

export interface SeatView {
  index: number;
  team: Team;
  player: { id: string; name: string; isBot: boolean; connected: boolean } | null;
}

export interface MemberView {
  id: string;
  name: string;
  connected: boolean;
  seat: number | null;
  isBot: boolean;
}

export interface ChatMessage {
  id: number;
  playerId: string | null;
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomView {
  code: string;
  name: string;
  isPublic: boolean;
  mode: GameMode;
  rules: RulesConfig;
  hostId: string;
  status: RoomStatus;
  seats: SeatView[];
  members: MemberView[];
  chat: ChatMessage[];
  game: PlayerView | null;
  /** Milisegundos que quedan para la jugada actual (null = sin límite). */
  turnMsLeft: number | null;
  me: { id: string; seat: number | null };
}

export interface PublicRoomSummary {
  code: string;
  name: string;
  mode: GameMode;
  rules: RulesConfig;
  status: RoomStatus;
  seated: number;
  capacity: number;
  hostName: string;
}

export interface CreateRoomInput {
  name: string;
  isPublic: boolean;
  mode: GameMode;
  rules: Partial<RulesConfig>;
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServer {
  'session:hello': (p: { playerId?: string; token?: string; name: string }, ack: Ack<{ playerId: string; token: string; roomCode: string | null }>) => void;
  'player:rename': (p: { name: string }) => void;
  'lobby:subscribe': () => void;
  'lobby:unsubscribe': () => void;
  'room:create': (p: CreateRoomInput, ack: Ack<{ code: string }>) => void;
  'room:join': (p: { code: string }, ack: Ack<{ code: string }>) => void;
  'room:quickJoin': (p: { mode?: GameMode }, ack: Ack<{ code: string }>) => void;
  'room:leave': () => void;
  'room:sit': (p: { seat: number }, ack?: Ack) => void;
  'room:stand': () => void;
  'room:autoTeams': () => void;
  'room:addBot': (p: { seat: number }) => void;
  'room:removeSeat': (p: { seat: number }) => void;
  'room:update': (p: { name?: string; isPublic?: boolean; mode?: GameMode; rules?: Partial<RulesConfig> }) => void;
  'room:start': (ack?: Ack) => void;
  'room:rematch': () => void;
  'game:action': (p: Action, ack?: Ack) => void;
  'chat:send': (p: { text: string }) => void;
}

export interface ServerToClient {
  'room:state': (room: RoomView) => void;
  'room:left': (p: { reason?: string }) => void;
  'lobby:rooms': (rooms: PublicRoomSummary[]) => void;
  notice: (p: { message: string }) => void;
}
