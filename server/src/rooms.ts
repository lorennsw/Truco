import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  Action,
  ChatMessage,
  ClientToServer,
  CreateRoomInput,
  DEFAULT_RULES,
  GameMode,
  GameState,
  MODE_PLAYERS,
  MemberView,
  PublicRoomSummary,
  RoomStatus,
  RoomView,
  RulesConfig,
  ServerToClient,
  TEAM_CHAT_HISTORY,
  TEAM_CHAT_MAX_LENGTH,
  Team,
  TeamChatMessage,
  applyAction,
  chooseBotAction,
  createGame,
  getPlayerView,
  legalActions,
  pendingBet,
  sanitizeRules,
  startNextHand,
  teamOf,
} from '@truco/shared';
import { botLine } from './botTalk';

type IO = Server<ClientToServer, ServerToClient>;
export type TrucoSocket = Socket<ClientToServer, ServerToClient>;

/** Sesión de un jugador humano (persiste entre reconexiones mediante un token). */
interface PlayerSession {
  id: string;
  token: string;
  name: string;
  sockets: Set<string>;
  roomCode: string | null;
  disconnectedAt: number | null;
}

interface Member {
  id: string;
  name: string;
  isBot: boolean;
}

/** Chat privado de cada equipo, aislado por partida (un gameId nuevo en cada partida). */
interface TeamChat {
  gameId: string;
  seq: number;
  messages: [TeamChatMessage[], TeamChatMessage[]];
  /** Mensajes ya aceptados por (jugador, clientId): evita duplicados por reintentos. */
  seen: Map<string, string>;
}

interface Room {
  code: string;
  name: string;
  isPublic: boolean;
  mode: GameMode;
  rules: RulesConfig;
  hostId: string;
  status: RoomStatus;
  seats: (string | null)[];
  members: Map<string, Member>;
  game: GameState | null;
  chat: ChatMessage[];
  chatSeq: number;
  teamChat: TeamChat | null;
  timer: NodeJS.Timeout | null;
  deadline: number | null;
  emptySince: number | null;
}

const BOT_NAMES = ['Don Pepe', 'La Chola', 'El Tano', 'Doña Rosa', 'El Gringo', 'Coco', 'Pocho', 'Mirta', 'El Ruso', 'Tita'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HAND_PAUSE_MS = 6500;
// Límite de frecuencia del chat de equipo: como máximo 5 mensajes cada 5 segundos.
const TEAM_CHAT_BURST = 5;
const TEAM_CHAT_WINDOW_MS = 5000;
const DISCONNECTED_ACT_MS = 20000;
const LOBBY_DISCONNECT_KICK_MS = 90000;
const EMPTY_ROOM_TTL_MS = 10 * 60000;

const cleanName = (s: unknown, fallback = 'Jugador') =>
  (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 20) : '') || fallback;

export class RoomManager {
  private players = new Map<string, PlayerSession>();
  private rooms = new Map<string, Room>();
  private lobbyDirty = false;
  private teamChatSent = new Map<string, number[]>();

  /** Multiplicador de los tiempos de los bots y las pausas (1 = ritmo normal; las pruebas lo aceleran). */
  constructor(private io: IO, private pace = 1) {
    setInterval(() => this.sweep(), 15000).unref();
  }

  // ───────────────────────── Sesiones ─────────────────────────

  hello(socket: TrucoSocket, p: { playerId?: string; token?: string; name: string }) {
    let player = p.playerId ? this.players.get(p.playerId) : undefined;
    if (!player || player.token !== p.token) {
      player = { id: randomUUID(), token: randomBytes(18).toString('base64url'), name: cleanName(p.name), sockets: new Set(), roomCode: null, disconnectedAt: null };
      this.players.set(player.id, player);
    }
    if (p.name) this.rename(player, p.name);
    player.sockets.add(socket.id);
    player.disconnectedAt = null;
    socket.data.playerId = player.id;
    socket.join(`player:${player.id}`);

    const room = player.roomCode ? this.rooms.get(player.roomCode) : undefined;
    if (room && room.members.has(player.id)) {
      this.update(room);
    } else {
      player.roomCode = null;
    }
    return { playerId: player.id, token: player.token, roomCode: player.roomCode };
  }

  playerOf(socket: TrucoSocket): PlayerSession | undefined {
    return this.players.get(socket.data.playerId);
  }

  disconnect(socket: TrucoSocket) {
    const player = this.playerOf(socket);
    if (!player) return;
    player.sockets.delete(socket.id);
    if (player.sockets.size === 0) {
      player.disconnectedAt = Date.now();
      const room = player.roomCode ? this.rooms.get(player.roomCode) : undefined;
      if (room) this.update(room);
    }
  }

  rename(player: PlayerSession, name: string) {
    player.name = cleanName(name, player.name);
    const room = player.roomCode ? this.rooms.get(player.roomCode) : undefined;
    const m = room?.members.get(player.id);
    if (room && m) {
      m.name = player.name;
      this.update(room);
    }
  }

  private isConnected(id: string) {
    const p = this.players.get(id);
    return !!p && p.sockets.size > 0;
  }

  // ───────────────────────── Lobby público ─────────────────────────

  publicRooms(): PublicRoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic)
      .map((r) => ({
        code: r.code,
        name: r.name,
        mode: r.mode,
        rules: r.rules,
        status: r.status,
        seated: r.seats.filter((s) => s && !r.members.get(s)?.isBot).length,
        capacity: r.seats.length,
        hostName: r.members.get(r.hostId)?.name ?? '—',
      }))
      .sort((a, b) => Number(a.status !== 'lobby') - Number(b.status !== 'lobby') || b.seated - a.seated);
  }

  private markLobbyDirty() {
    if (this.lobbyDirty) return;
    this.lobbyDirty = true;
    setTimeout(() => {
      this.lobbyDirty = false;
      this.io.to('lobby').emit('lobby:rooms', this.publicRooms());
    }, 250);
  }

  // ───────────────────────── Salas ─────────────────────────

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(5);
      const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  create(player: PlayerSession, input: CreateRoomInput): Room {
    this.leave(player);
    const mode: GameMode = [1, 2, 3].includes(input.mode) ? input.mode : 1;
    const room: Room = {
      code: this.newCode(),
      name: cleanName(input.name, `Mesa de ${player.name}`).slice(0, 30),
      isPublic: !!input.isPublic,
      mode,
      rules: sanitizeRules({ ...DEFAULT_RULES, ...input.rules }),
      hostId: player.id,
      status: 'lobby',
      seats: Array(MODE_PLAYERS[mode]).fill(null),
      members: new Map(),
      game: null,
      chat: [],
      chatSeq: 0,
      teamChat: null,
      timer: null,
      deadline: null,
      emptySince: null,
    };
    this.rooms.set(room.code, room);
    this.join(player, room.code);
    return room;
  }

  join(player: PlayerSession, rawCode: string): Room {
    const code = String(rawCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error('No existe una sala con ese código.');
    if (player.roomCode && player.roomCode !== code) this.leave(player);
    if (!room.members.has(player.id)) {
      room.members.set(player.id, { id: player.id, name: player.name, isBot: false });
      this.system(room, `${player.name} entró a la sala.`);
      // En el lobby, sentarlo automáticamente en el primer lugar libre.
      if (room.status === 'lobby') {
        const free = room.seats.indexOf(null);
        if (free >= 0) room.seats[free] = player.id;
      }
    }
    player.roomCode = code;
    room.emptySince = null;
    this.update(room);
    return room;
  }

  quickJoin(player: PlayerSession, mode?: GameMode): Room {
    const candidates = [...this.rooms.values()].filter(
      (r) => r.isPublic && r.status === 'lobby' && r.seats.includes(null) && (!mode || r.mode === mode),
    );
    if (!candidates.length) throw new Error('No hay partidas públicas con lugares libres. ¡Creá una!');
    candidates.sort((a, b) => b.seats.filter(Boolean).length - a.seats.filter(Boolean).length);
    return this.join(player, candidates[0].code);
  }

  leave(player: PlayerSession) {
    const room = player.roomCode ? this.rooms.get(player.roomCode) : undefined;
    player.roomCode = null;
    if (!room) return;
    this.removeMember(room, player.id, `${player.name} se fue de la sala.`);
    this.io.to(`player:${player.id}`).emit('room:left', {});
  }

  private removeMember(room: Room, id: string, message: string) {
    const member = room.members.get(id);
    if (!member) return;
    room.members.delete(id);
    const seat = room.seats.indexOf(id);
    if (seat >= 0) {
      if (room.status === 'playing') {
        // La partida sigue: un bot ocupa su lugar.
        const bot = this.makeBot(room);
        room.seats[seat] = bot.id;
        message += ` ${bot.name} (bot) juega en su lugar.`;
      } else {
        room.seats[seat] = null;
      }
    }
    this.system(room, message);
    const humans = [...room.members.values()].filter((m) => !m.isBot);
    if (!humans.length) {
      this.destroy(room);
      return;
    }
    if (room.hostId === id) {
      const next = humans.find((m) => this.isConnected(m.id)) ?? humans[0];
      room.hostId = next.id;
      this.system(room, `${next.name} ahora es el anfitrión.`);
    }
    this.update(room);
  }

  private destroy(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    this.rooms.delete(room.code);
    for (const m of room.members.values()) {
      const p = this.players.get(m.id);
      if (p && p.roomCode === room.code) p.roomCode = null;
    }
    this.markLobbyDirty();
  }

  private makeBot(room: Room): Member {
    const used = new Set([...room.members.values()].map((m) => m.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${room.members.size + 1}`;
    const bot: Member = { id: `bot-${randomUUID()}`, name, isBot: true };
    room.members.set(bot.id, bot);
    return bot;
  }

  roomOf(player: PlayerSession): Room {
    const room = player.roomCode ? this.rooms.get(player.roomCode) : undefined;
    if (!room) throw new Error('No estás en ninguna sala.');
    return room;
  }

  private requireHost(room: Room, player: PlayerSession) {
    if (room.hostId !== player.id) throw new Error('Solo el anfitrión puede hacer eso.');
  }

  private requireLobby(room: Room) {
    if (room.status !== 'lobby') throw new Error('No se puede cambiar durante la partida.');
  }

  sit(player: PlayerSession, seat: number) {
    const room = this.roomOf(player);
    if (!Number.isInteger(seat) || seat < 0 || seat >= room.seats.length) throw new Error('Lugar inválido.');
    const occupant = room.seats[seat];
    const current = room.seats.indexOf(player.id);
    if (room.status !== 'lobby') {
      // Durante la partida, un espectador puede reemplazar a un bot.
      if (current >= 0) throw new Error('Ya estás jugando.');
      if (!occupant || !room.members.get(occupant)?.isBot) throw new Error('Ese lugar no está disponible.');
      room.members.delete(occupant);
      room.seats[seat] = player.id;
      this.system(room, `${player.name} toma el lugar del bot.`);
      this.update(room);
      return;
    }
    if (occupant === player.id) return;
    if (occupant && !room.members.get(occupant)?.isBot) throw new Error('Ese lugar está ocupado.');
    if (occupant) room.members.delete(occupant); // reemplaza al bot
    if (current >= 0) room.seats[current] = null;
    room.seats[seat] = player.id;
    this.update(room);
  }

  stand(player: PlayerSession) {
    const room = this.roomOf(player);
    this.requireLobby(room);
    const current = room.seats.indexOf(player.id);
    if (current >= 0) room.seats[current] = null;
    this.update(room);
  }

  autoTeams(player: PlayerSession) {
    const room = this.roomOf(player);
    this.requireHost(room, player);
    this.requireLobby(room);
    const humans = [...room.members.values()].filter((m) => !m.isBot).map((m) => m.id);
    const bots = room.seats.filter((s): s is string => !!s && !!room.members.get(s)?.isBot);
    const pool = shuffle(humans).concat(bots).slice(0, room.seats.length);
    for (const b of bots) if (!pool.includes(b)) room.members.delete(b);
    // Mezcla al azar y reparte en asientos alternados (equipos: pares vs impares).
    const order = shuffle(pool);
    room.seats = room.seats.map((_, i) => order[i] ?? null);
    this.system(room, 'Equipos sorteados.');
    this.update(room);
  }

  addBot(player: PlayerSession, seat: number) {
    const room = this.roomOf(player);
    this.requireHost(room, player);
    this.requireLobby(room);
    if (room.seats[seat] !== null) throw new Error('Ese lugar está ocupado.');
    room.seats[seat] = this.makeBot(room).id;
    this.update(room);
  }

  removeSeat(player: PlayerSession, seat: number) {
    const room = this.roomOf(player);
    this.requireHost(room, player);
    this.requireLobby(room);
    const id = room.seats[seat];
    if (!id) return;
    room.seats[seat] = null;
    if (room.members.get(id)?.isBot) room.members.delete(id);
    this.update(room);
  }

  updateSettings(player: PlayerSession, p: { name?: string; isPublic?: boolean; mode?: GameMode; rules?: Partial<RulesConfig> }) {
    const room = this.roomOf(player);
    this.requireHost(room, player);
    this.requireLobby(room);
    if (p.name !== undefined) room.name = cleanName(p.name, room.name).slice(0, 30);
    if (p.isPublic !== undefined) room.isPublic = !!p.isPublic;
    if (p.rules) room.rules = sanitizeRules({ ...room.rules, ...p.rules });
    if (p.mode && [1, 2, 3].includes(p.mode) && p.mode !== room.mode) {
      room.mode = p.mode;
      const size = MODE_PLAYERS[p.mode];
      const kept = room.seats.slice(0, size);
      for (const id of room.seats.slice(size)) if (id && room.members.get(id)?.isBot) room.members.delete(id);
      room.seats = kept.concat(Array(Math.max(0, size - kept.length)).fill(null));
    }
    this.update(room);
  }

  start(player: PlayerSession) {
    const room = this.roomOf(player);
    this.requireHost(room, player);
    this.requireLobby(room);
    if (room.seats.some((s) => s === null)) throw new Error('Faltan jugadores: completá los lugares o agregá bots.');
    room.game = createGame({ numPlayers: MODE_PLAYERS[room.mode], rules: room.rules });
    room.status = 'playing';
    room.teamChat = { gameId: randomUUID(), seq: 0, messages: [[], []], seen: new Map() };
    this.system(room, `¡Empieza la partida a ${room.rules.targetScore} puntos!`);
    this.update(room);
  }

  rematch(player: PlayerSession) {
    const room = this.roomOf(player);
    this.requireHost(room, player);
    if (room.status !== 'finished') throw new Error('La partida no terminó.');
    room.status = 'lobby';
    room.game = null;
    this.update(room);
  }

  action(player: PlayerSession, action: Action) {
    const room = this.roomOf(player);
    if (room.status !== 'playing' || !room.game) throw new Error('No hay partida en curso.');
    const seat = room.seats.indexOf(player.id);
    if (seat < 0) throw new Error('Estás mirando la partida, no jugando.');
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('Acción inválida.');
    const res = applyAction(room.game, seat, action);
    if (!res.ok) throw new Error(res.error);
    room.game = res.state;
    this.update(room);
  }

  chat(player: PlayerSession, text: string) {
    const room = this.roomOf(player);
    const clean = String(text ?? '').trim().slice(0, 280);
    if (!clean) return;
    this.pushChat(room, { playerId: player.id, name: player.name, text: clean });
    // Solo se reenvía el estado: escribir en el chat no debe reiniciar el tiempo del turno.
    this.broadcast(room);
  }

  /**
   * Chat privado de equipo. El equipo se obtiene del asiento real del jugador en el servidor;
   * el cliente no elige destinatarios. El mensaje solo se envía a los integrantes de ese equipo.
   */
  teamChat(player: PlayerSession, rawText: unknown, rawClientId: unknown): { id: string } {
    const room = this.roomOf(player);
    if (room.mode === 1) throw new Error('En 1 vs 1 no hay chat de equipo.');
    if (room.status !== 'playing' || !room.game || !room.teamChat) throw new Error('El chat de equipo está disponible solo durante la partida.');
    const seat = room.seats.indexOf(player.id);
    if (seat < 0) throw new Error('Solo los jugadores de la partida pueden usar el chat de equipo.');

    const text = typeof rawText === 'string' ? rawText.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
    if (!text) throw new Error('El mensaje está vacío.');
    if (text.length > TEAM_CHAT_MAX_LENGTH) throw new Error(`El mensaje es demasiado largo (máximo ${TEAM_CHAT_MAX_LENGTH} caracteres).`);

    const tc = room.teamChat;
    const clientId = typeof rawClientId === 'string' && rawClientId ? rawClientId.slice(0, 64) : null;
    const dedupeKey = clientId ? `${player.id}:${clientId}` : null;
    const already = dedupeKey ? tc.seen.get(dedupeKey) : undefined;
    if (already) return { id: already }; // reintento del mismo mensaje: no se duplica

    const now = Date.now();
    const recent = (this.teamChatSent.get(player.id) ?? []).filter((t) => now - t < TEAM_CHAT_WINDOW_MS);
    if (recent.length >= TEAM_CHAT_BURST) throw new Error('Estás enviando mensajes muy rápido. Esperá un momento.');
    recent.push(now);
    this.teamChatSent.set(player.id, recent);

    const team = teamOf(seat);
    const msg: TeamChatMessage = {
      id: `${tc.gameId}:${++tc.seq}`,
      gameId: tc.gameId,
      senderId: player.id,
      senderName: player.name,
      seat,
      team,
      text,
      at: now,
    };
    const list = tc.messages[team];
    list.push(msg);
    if (list.length > TEAM_CHAT_HISTORY) list.splice(0, list.length - TEAM_CHAT_HISTORY);
    if (dedupeKey) {
      tc.seen.set(dedupeKey, msg.id);
      if (tc.seen.size > 500) tc.seen.delete(tc.seen.keys().next().value!);
    }
    this.broadcastTeam(room, team);
    return { id: msg.id };
  }

  /** Historial del equipo de un jugador, solo si está sentado en la partida actual. */
  private teamChatFor(room: Room, playerId: string): TeamChatMessage[] | null {
    if (room.mode === 1 || !room.teamChat || room.status === 'lobby') return null;
    const seat = room.seats.indexOf(playerId);
    if (seat < 0) return null;
    const team = teamOf(seat);
    return room.teamChat.messages[team].filter((m) => m.team === team && m.gameId === room.teamChat!.gameId);
  }

  /** Envía el estado actualizado solo a los integrantes humanos de un equipo. */
  private broadcastTeam(room: Room, team: Team) {
    room.seats.forEach((id, seat) => {
      if (!id || teamOf(seat) !== team || room.members.get(id)?.isBot) return;
      this.io.to(`player:${id}`).emit('room:state', this.view(room, id));
    });
  }

  private system(room: Room, text: string) {
    this.pushChat(room, { playerId: null, name: 'Mesa', text, system: true });
  }

  private pushChat(room: Room, msg: Omit<ChatMessage, 'id' | 'at'>) {
    room.chat.push({ ...msg, id: ++room.chatSeq, at: Date.now() });
    if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
  }

  // ───────────────────────── Ciclo de juego ─────────────────────────

  /** Después de cada cambio: programa jugadas automáticas y envía el estado a cada jugador. */
  private update(room: Room) {
    if (!this.rooms.has(room.code)) return;
    if (room.game?.phase === 'gameOver' && room.status === 'playing') {
      room.status = 'finished';
      const w = room.game.winner!;
      const names = room.seats.filter((_, i) => teamOf(i) === w).map((id) => room.members.get(id!)?.name ?? '?');
      this.system(room, `¡Ganaron ${names.join(', ')}! Resultado ${room.game.score[w]} a ${room.game.score[w === 0 ? 1 : 0]}.`);
    }
    this.schedule(room);
    this.broadcast(room);
    this.markLobbyDirty();
  }

  private schedule(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.deadline = null;
    const g = room.game;
    if (!g || room.status !== 'playing') return;

    if (g.phase === 'handOver') {
      room.timer = setTimeout(() => {
        if (room.game?.phase !== 'handOver') return;
        room.game = startNextHand(room.game);
        this.update(room);
      }, HAND_PAUSE_MS * this.pace);
      return;
    }

    const actors = room.seats.map((_, s) => s).filter((s) => legalActions(g, s).length > 0);
    if (!actors.length) return;
    const kind = (s: number) => {
      const id = room.seats[s]!;
      if (room.members.get(id)?.isBot) return 'bot';
      return this.isConnected(id) ? 'human' : 'away';
    };
    const humans = actors.filter((s) => kind(s) === 'human');
    let seat: number;
    let delay: number;
    if (humans.length) {
      // Si alguno de los que pueden actuar es humano y está conectado, se lo espera.
      if (!g.rules.turnTimeSec) return;
      seat = humans.includes(g.hand.turn) ? g.hand.turn : humans[0];
      delay = g.rules.turnTimeSec * 1000;
      room.deadline = Date.now() + delay;
    } else {
      const bot = actors.find((s) => kind(s) === 'bot');
      if (bot !== undefined) {
        seat = bot;
        // Ritmo tranquilo: el bot "piensa" un poco más si tiene que responder un canto, y se deja ver
        // quién ganó la baza antes de que arranque la siguiente.
        const t = g.hand.tricks;
        const trickJustEnded = t.length > 1 && t[t.length - 1].plays.length === 0;
        delay = (1700 + Math.random() * 1300 + (pendingBet(g.hand) ? 900 : 0) + (trickJustEnded ? 1400 : 0)) * this.pace;
      } else {
        seat = actors[0];
        delay = g.rules.turnTimeSec ? Math.min(DISCONNECTED_ACT_MS, g.rules.turnTimeSec * 1000) : DISCONNECTED_ACT_MS;
        room.deadline = Date.now() + delay;
      }
    }
    const handNo = g.hand.number;
    const eventSeq = g.eventSeq;
    room.timer = setTimeout(() => this.autoAct(room, seat, handNo, eventSeq), delay);
  }

  private autoAct(room: Room, seat: number, handNo: number, eventSeq: number) {
    const g = room.game;
    if (!g || g.hand.number !== handNo || g.eventSeq !== eventSeq) return;
    const action = chooseBotAction(g, seat);
    if (!action) return;
    const res = applyAction(g, seat, action);
    if (res.ok) {
      room.game = res.state;
      // Los bots (no los humanos ausentes) a veces comentan lo que hacen.
      const bot = room.members.get(room.seats[seat] ?? '');
      const line = bot?.isBot ? botLine(g, seat, action) : null;
      if (bot && line) this.pushChat(room, { playerId: bot.id, name: bot.name, text: line });
    }
    this.update(room);
  }

  private broadcast(room: Room) {
    for (const m of room.members.values()) {
      if (m.isBot) continue;
      this.io.to(`player:${m.id}`).emit('room:state', this.view(room, m.id));
    }
  }

  private view(room: Room, playerId: string): RoomView {
    const seat = room.seats.indexOf(playerId);
    const mySeat = seat >= 0 ? seat : null;
    const memberInfo = (id: string) => {
      const m = room.members.get(id)!;
      return { id, name: m.name, isBot: m.isBot, connected: m.isBot || this.isConnected(id) };
    };
    const members: MemberView[] = [...room.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      isBot: m.isBot,
      connected: m.isBot || this.isConnected(m.id),
      seat: room.seats.indexOf(m.id) >= 0 ? room.seats.indexOf(m.id) : null,
    }));
    return {
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      mode: room.mode,
      rules: room.rules,
      hostId: room.hostId,
      status: room.status,
      seats: room.seats.map((id, index) => ({ index, team: teamOf(index), player: id ? memberInfo(id) : null })),
      members,
      chat: room.chat.slice(-60),
      teamChat: this.teamChatFor(room, playerId),
      game: room.game ? getPlayerView(room.game, mySeat) : null,
      turnMsLeft: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
      me: { id: playerId, seat: mySeat },
    };
  }

  /** Limpieza periódica: saca del lobby a desconectados y borra salas abandonadas. */
  private sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const humans = [...room.members.values()].filter((m) => !m.isBot);
      const connected = humans.filter((m) => this.isConnected(m.id));
      if (!connected.length) {
        room.emptySince ??= now;
        if (now - room.emptySince > EMPTY_ROOM_TTL_MS) this.destroy(room);
        continue;
      }
      room.emptySince = null;
      if (room.status === 'lobby') {
        for (const m of humans) {
          const p = this.players.get(m.id);
          if (p && p.sockets.size === 0 && p.disconnectedAt && now - p.disconnectedAt > LOBBY_DISCONNECT_KICK_MS) {
            p.roomCode = null;
            this.removeMember(room, m.id, `${m.name} se desconectó.`);
          }
        }
      }
    }
  }
}

function shuffle<T>(a: T[]): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
