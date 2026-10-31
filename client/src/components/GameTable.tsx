import { useEffect, useMemo, useRef, useState } from 'react';
import { MODE_LABEL } from '@truco/shared';
import type { Action, GameEvent, PlayerView, RoomView, Team } from '@truco/shared';
import { leaveRoom, rematch, sendAction, sit, useStore } from '../store';
import { CALL_TEXT, actionLabel, pendingText, teamName } from '../texts';
import { CardBack, SpanishCard } from './Card';
import { ChatPanel } from './Chat';
import { RulesSummary } from './Rules';
import { ScoreBoard } from './Score';

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

interface Bubble { key: number; seat: number; text: string; tone: 'call' | 'tanto' }

/** Globos de diálogo para los cantos recientes (solo eventos nuevos, no el historial). */
function useBubbles(events: GameEvent[]) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const lastSeen = useRef<number | null>(null);
  useEffect(() => {
    const maxId = events.length ? events[events.length - 1].id : 0;
    if (lastSeen.current === null) {
      lastSeen.current = maxId;
      return;
    }
    const fresh = events.filter((e) => e.id > lastSeen.current!);
    lastSeen.current = maxId;
    const add: Bubble[] = [];
    for (const e of fresh) {
      if (e.kind === 'call') add.push({ key: e.id * 10, seat: e.seat, text: CALL_TEXT[e.call], tone: 'call' });
      if (e.kind === 'envidoResult' || e.kind === 'florResult')
        e.reveals.forEach((r, i) => add.push({ key: e.id * 10 + i + 1, seat: r.seat, text: `${r.points}`, tone: 'tanto' }));
    }
    if (!add.length) return;
    setBubbles((b) => [...b.filter((x) => !add.some((a) => a.seat === x.seat)), ...add]);
    const keys = add.map((a) => a.key);
    const t = setTimeout(() => setBubbles((b) => b.filter((x) => !keys.includes(x.key))), 2800);
    return () => clearTimeout(t);
  }, [events]);
  return bubbles;
}

const ACTION_STYLE: Partial<Record<Action['type'], string>> = {
  quiero: 'bg-emerald-500 hover:bg-emerald-400 text-white',
  noQuiero: 'bg-red-600 hover:bg-red-500 text-white',
  truco: 'bg-amber-500 hover:bg-amber-400 text-felt-950',
  envido: 'bg-sky-500 hover:bg-sky-400 text-felt-950',
  flor: 'bg-fuchsia-500 hover:bg-fuchsia-400 text-white',
  contraflor: 'bg-fuchsia-500 hover:bg-fuchsia-400 text-white',
  contraflorResto: 'bg-fuchsia-700 hover:bg-fuchsia-600 text-white',
  achico: 'bg-white/15 hover:bg-white/25 text-white',
};

function ActionButtons({ g, onAction }: { g: PlayerView; onAction: (a: Action) => void }) {
  const [confirmMazo, setConfirmMazo] = useState(false);
  useEffect(() => {
    if (!confirmMazo) return;
    const t = setTimeout(() => setConfirmMazo(false), 3000);
    return () => clearTimeout(t);
  }, [confirmMazo]);
  const actions = g.legal.filter((a) => a.type !== 'play');
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {actions.map((a) =>
        a.type === 'mazo' ? (
          <button
            key="mazo"
            onClick={() => (confirmMazo ? onAction(a) : setConfirmMazo(true))}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${confirmMazo ? 'bg-red-700 text-white' : 'bg-black/30 text-white/70 hover:bg-black/50'}`}
          >
            {confirmMazo ? '¿Seguro? Irse al mazo' : 'Irse al mazo'}
          </button>
        ) : (
          <button
            key={a.type + ('kind' in a ? a.kind : '')}
            onClick={() => onAction(a)}
            className={`rounded-xl px-4 py-2.5 text-sm font-extrabold shadow-lg transition active:scale-95 sm:text-base ${ACTION_STYLE[a.type] ?? 'bg-white/15'}`}
          >
            {actionLabel(a, g)}
          </button>
        ),
      )}
    </div>
  );
}

export function GameTable({ room }: { room: RoomView }) {
  const g = room.game!;
  const connected = useStore((s) => s.connected);
  const deadlineAt = useStore((s) => s.deadlineAt);
  const now = useNow(deadlineAt !== null);
  const wide = useMedia('(min-width: 640px)');
  const desktop = useMedia('(min-width: 1024px)');
  const [chatOpen, setChatOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const bubbles = useBubbles(g.events);
  const n = g.numPlayers;
  const mySeat = room.me.seat;
  const viewSeat = mySeat ?? 0;
  const myTeam: Team | null = mySeat !== null ? ((mySeat % 2) as Team) : null;
  const isHost = room.hostId === room.me.id;
  const name = (seat: number) => room.seats[seat]?.player?.name ?? `Lugar ${seat + 1}`;
  const secsLeft = deadlineAt ? Math.max(0, Math.ceil((deadlineAt - now) / 1000)) : null;

  const activeSeats = useMemo(() => {
    if (g.phase !== 'playing') return [];
    if (g.respondingTeam !== null) return room.seats.filter((s) => s.team === g.respondingTeam).map((s) => s.index);
    return [g.turn];
  }, [g.phase, g.respondingTeam, g.turn, room.seats]);

  const myTurn = mySeat !== null && g.legal.some((a) => a.type === 'play');
  const mustRespond = mySeat !== null && g.respondingTeam === myTeam && g.legal.length > 0;

  useEffect(() => {
    document.title = myTurn || mustRespond ? '🃏 ¡Te toca! · Truco' : 'Truco Argentino';
    return () => {
      document.title = 'Truco Argentino';
    };
  }, [myTurn, mustRespond]);

  const onAction = (a: Action) => {
    sendAction(a);
  };

  // Posiciones alrededor de la mesa: yo abajo; el siguiente en el orden de juego, a mi derecha.
  const pos = (seat: number, radius: number) => {
    const r = (seat - viewSeat + n) % n;
    const angle = ((90 - (r * 360) / n) * Math.PI) / 180;
    return { x: 50 + Math.cos(angle) * radius * 0.96, y: 50 + Math.sin(angle) * radius };
  };
  const tableCard = n === 6 || !wide ? 'sm' : 'md';
  const cardStep = n === 6 || !wide ? 16 : 24;

  const pendingByOthers = g.pending && g.respondingTeam !== myTeam;
  const lastCaller = (() => {
    if (g.pending === 'flor') return g.flor.calls[g.flor.calls.length - 1].seat;
    if (g.pending === 'envido') return g.envido.calls[g.envido.calls.length - 1].seat;
    if (g.pending === 'truco') return g.truco.pending!.seat;
    return null;
  })();

  const handValue = g.truco.level;
  const status = (() => {
    if (g.phase === 'gameOver') return '¡Partida terminada!';
    if (g.phase === 'handOver') return 'Repartiendo la próxima mano…';
    if (mustRespond) return `${name(lastCaller!)} cantó ${pendingText(g)}. ¿Qué respondés?`;
    if (g.pending) return `${pendingByOthers ? 'Esperando respuesta' : 'Responde tu equipo'}: ${pendingText(g)}`;
    if (myTurn) return '¡Te toca jugar!';
    return `Juega ${name(g.turn)}…`;
  })();

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <div className="flex items-start gap-2 p-2 sm:p-3">
          <div className="flex flex-col gap-1.5">
            <button onClick={() => (confirm('¿Salir de la partida? Un bot ocupará tu lugar.') ? leaveRoom() : null)} className="rounded-xl bg-black/30 px-3 py-2 text-xs hover:bg-black/50">
              ← Salir
            </button>
            <button onClick={() => setRulesOpen(true)} className="rounded-xl bg-black/30 px-3 py-2 text-xs hover:bg-black/50">
              Reglas
            </button>
          </div>
          <div className="hidden min-w-0 flex-1 text-center sm:block">
            <div className="truncate font-display text-lg font-bold">{room.name}</div>
            <div className="text-xs text-white/55">
              {MODE_LABEL[room.mode]} · a {g.rules.targetScore} {g.rules.flor ? '· con flor' : '· sin flor'} · Sala {room.code}
            </div>
          </div>
          <div className="ml-auto flex items-start gap-2">
            <ScoreBoard score={g.score} rules={g.rules} mySeat={mySeat} compact={!wide} />
            {!desktop && (
              <button onClick={() => setChatOpen(true)} className="relative rounded-xl bg-black/30 px-3 py-2 text-lg" aria-label="Chat y jugadas">
                💬
              </button>
            )}
          </div>
        </div>

        {!connected && (
          <div className="absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold shadow-lg">Reconectando…</div>
        )}

        {/* Mesa */}
        <div className="relative min-h-0 flex-1">
          <div className="wood absolute inset-x-[3%] inset-y-[6%] rounded-[50%] p-2 sm:inset-x-[7%] sm:p-3">
            <div className="felt h-full w-full rounded-[50%] shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]" />
          </div>

          {/* Centro: estado de la mano */}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center">
            <div className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/75">
              Mano {g.handNumber} · vale {handValue}
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => {
                const t = g.tricks[i];
                const res = t?.done ? t.winnerTeam : undefined;
                return (
                  <span
                    key={i}
                    title={`Baza ${i + 1}`}
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                      res === undefined ? 'border-white/25 text-white/40' : res === null ? 'border-white bg-white/70 text-felt-950' : res === 0 ? 'border-team0 bg-team0 text-felt-950' : 'border-team1 bg-team1 text-felt-950'
                    }`}
                  >
                    {res === null ? 'P' : `${i + 1}ª`}
                  </span>
                );
              })}
            </div>
            {g.truco.level > 1 && <div className="text-xs font-bold text-amber-300">{['', '', 'Truco', 'Retruco', 'Vale cuatro'][g.truco.level]} querido</div>}
          </div>

          {/* Cartas jugadas */}
          {room.seats.map((s) => {
            const p = pos(s.index, n === 6 ? (wide ? 24 : 18) : 27);
            const cards = g.tricks.map((t) => ({ t, play: t.plays.find((pl) => pl.seat === s.index) })).filter((x) => x.play);
            return (
              <div key={`played-${s.index}`} className="pointer-events-none absolute" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                {cards.map(({ t, play }, i) => (
                  <SpanishCard
                    key={play!.card.id}
                    card={play!.card}
                    size={tableCard}
                    highlight={t.done && t.winnerSeat === s.index}
                    className="anim-drop absolute"
                    style={{
                      transform: `translate(-50%, -50%) translate(${(i - (cards.length - 1) / 2) * cardStep}px, ${i * 3}px) rotate(${(i - 1) * 7}deg)`,
                      zIndex: i,
                    }}
                  />
                ))}
              </div>
            );
          })}

          {/* Jugadores */}
          {room.seats.map((s) => {
            const p = pos(s.index, 43);
            // En pantallas angostas, los jugadores de los costados se anclan al borde para no salirse.
            const shift = !wide && p.x < 25 ? '0%' : !wide && p.x > 75 ? '-100%' : '-50%';
            const left = !wide && p.x < 25 ? 1 : !wide && p.x > 75 ? 99 : p.x;
            const isMe = s.index === mySeat;
            const active = activeSeats.includes(s.index);
            const bubble = bubbles.find((b) => b.seat === s.index);
            const teamColor = s.team === 0 ? 'border-team0' : 'border-team1';
            return (
              <div
                key={`seat-${s.index}`}
                className={`absolute z-10 flex flex-col ${shift === '0%' ? 'items-start' : shift === '-100%' ? 'items-end' : 'items-center'}`}
                style={{ left: `${left}%`, top: `${p.y}%`, translate: `${shift} -50%` }}
              >
                {bubble && (
                  <div
                    key={bubble.key}
                    className={`anim-bubble absolute bottom-full left-1/2 z-30 mb-2 whitespace-nowrap rounded-2xl px-3 py-1.5 text-sm font-black shadow-xl ${
                      bubble.tone === 'tanto' ? 'bg-sky-100 text-sky-900' : 'bg-cream text-felt-950'
                    }`}
                  >
                    {bubble.text}
                  </div>
                )}
                <div
                  className={`flex items-center gap-2 rounded-full border-2 ${teamColor} bg-felt-950/85 py-1 pl-1 pr-3 shadow-lg ${active ? 'turn-glow' : ''} ${
                    s.player && !s.player.connected ? 'opacity-60' : ''
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold sm:h-8 sm:w-8 ${s.team === 0 ? 'bg-team0/30' : 'bg-team1/30'}`}>
                    {s.player?.isBot ? '🤖' : (s.player?.name[0] ?? '?').toUpperCase()}
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span className="max-w-20 truncate text-xs font-bold sm:max-w-28 sm:text-sm">
                      {isMe ? 'Vos' : (s.player?.name ?? 'Libre')}
                    </span>
                    <span className="text-[10px] text-white/55">
                      {myTeam === null ? `Equipo ${s.team + 1}` : s.team === myTeam ? (isMe ? 'Nosotros' : 'Compañero') : 'Rival'}
                      {s.player && !s.player.connected && ' · desconectado'}
                    </span>
                  </div>
                  {g.mano === s.index && <span className="rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-black uppercase text-felt-950">Mano</span>}
                  {active && secsLeft !== null && <span className="text-xs font-bold tabular-nums text-gold">{secsLeft}s</span>}
                </div>
                {!isMe && g.cardsLeft[s.index] > 0 && (
                  <div className="mt-1 flex">
                    {Array.from({ length: g.cardsLeft[s.index] }, (_, i) => (
                      <CardBack key={i} size="xs" className="-ml-4 first:ml-0" style={{ transform: `rotate(${(i - 1) * 8}deg)` }} />
                    ))}
                  </div>
                )}
                {mySeat === null && s.player?.isBot && (
                  <button onClick={() => sit(s.index)} className="pointer-events-auto mt-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-felt-950">
                    Tomar lugar
                  </button>
                )}
              </div>
            );
          })}

          {/* Resultado de la mano */}
          {g.phase === 'handOver' && g.result && (
            <div className="anim-pop absolute left-1/2 top-[32%] z-20 -translate-x-1/2 rounded-2xl bg-felt-950/90 px-5 py-3 text-center shadow-2xl ring-1 ring-white/15">
              <div className="font-display text-xl font-bold">
                {teamName(g.result.winnerTeam, mySeat)} {mySeat === null ? 'gana' : g.result.winnerTeam === myTeam ? 'ganamos' : 'ganan'} la mano
              </div>
              <div className="text-sm text-white/70">
                +{g.result.points} {g.result.reason === 'noQuiero' ? '(no quisieron)' : g.result.reason === 'mazo' ? '(se fueron al mazo)' : ''}
              </div>
            </div>
          )}
        </div>

        {/* Zona inferior: estado, acciones y mano propia */}
        <div className="flex flex-col items-center gap-2 px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-1">
          <div
            className={`rounded-full px-4 py-1.5 text-center text-sm font-semibold ${
              mustRespond ? 'bg-amber-400 text-felt-950' : myTurn ? 'bg-gold text-felt-950' : 'bg-black/30 text-white/80'
            }`}
          >
            {status}
            {(myTurn || mustRespond) && secsLeft !== null && <span className="ml-2 tabular-nums">⏱ {secsLeft}s</span>}
          </div>
          {mySeat !== null && <ActionButtons g={g} onAction={onAction} />}
          {mySeat !== null ? (
            <div className="flex items-end gap-3">
              <div className="flex items-end">
                {g.myHand.map((c, i) => {
                  const playable = g.legal.some((a) => a.type === 'play' && a.cardId === c.id);
                  return (
                    <SpanishCard
                      key={`${g.handNumber}-${c.id}`}
                      card={c}
                      size="lg"
                      playable={playable}
                      onClick={() => onAction({ type: 'play', cardId: c.id })}
                      className="anim-deal -ml-3 first:ml-0 sm:-ml-2"
                      style={{ transform: `rotate(${(i - (g.myHand.length - 1) / 2) * 5}deg)`, animationDelay: `${i * 80}ms` }}
                    />
                  );
                })}
                {g.myHand.length === 0 && <div className="h-[7.8rem] sm:h-36" />}
              </div>
              <div className="flex flex-col gap-1 text-xs">
                {g.myEnvido !== null && (
                  <span className="rounded-lg bg-sky-500/20 px-2 py-1 font-semibold text-sky-200">Envido: {g.myEnvido}</span>
                )}
                {g.myFlor !== null && <span className="rounded-lg bg-fuchsia-500/25 px-2 py-1 font-semibold text-fuchsia-200">Flor: {g.myFlor}</span>}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-black/30 px-4 py-3 text-sm text-white/70">Estás mirando la partida. Podés tomar el lugar de un bot.</div>
          )}
        </div>
      </main>

      {/* Panel lateral */}
      {desktop ? (
        <aside className="flex h-full w-80 shrink-0 flex-col p-3 pl-0">
          <ChatPanel room={room} showLog className="h-full" />
        </aside>
      ) : (
        chatOpen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 backdrop-blur-sm" onClick={() => setChatOpen(false)}>
            <div className="mt-auto flex h-[75%] flex-col" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setChatOpen(false)} className="mb-2 self-end rounded-full bg-white/15 px-3 py-1 text-sm">
                Cerrar ✕
              </button>
              <ChatPanel room={room} showLog className="min-h-0 flex-1" />
            </div>
          </div>
        )
      )}

      {rulesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setRulesOpen(false)}>
          <div className="panel anim-pop w-full max-w-lg rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-display text-2xl font-bold">Reglamento activo</h2>
            <RulesSummary rules={g.rules} />
            <button onClick={() => setRulesOpen(false)} className="mt-5 w-full rounded-xl bg-white/15 py-2.5 font-semibold hover:bg-white/25">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {g.phase === 'gameOver' && g.winner !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="panel anim-pop w-full max-w-md rounded-3xl p-7 text-center">
            <div className="text-6xl">{myTeam === null || g.winner === myTeam ? '🏆' : '🥲'}</div>
            <h2 className="mt-2 font-display text-3xl font-black">
              {myTeam === null ? `¡Ganó el ${teamName(g.winner, null)}!` : g.winner === myTeam ? '¡Ganamos!' : 'Perdimos…'}
            </h2>
            <p className="mt-1 text-white/70">
              {room.seats
                .filter((s) => s.team === g.winner)
                .map((s) => s.player?.name)
                .join(', ')}
            </p>
            <div className="mt-4 text-4xl font-black tabular-nums">
              {g.score[g.winner]} <span className="text-white/40">a</span> {g.score[g.winner === 0 ? 1 : 0]}
            </div>
            <div className="mt-6 flex flex-col gap-2">
              {isHost ? (
                <button onClick={rematch} className="rounded-xl bg-gold py-3 font-bold text-felt-950 hover:brightness-110">
                  Volver a la sala (revancha)
                </button>
              ) : (
                <p className="text-sm text-white/60">El anfitrión puede volver a la sala para la revancha.</p>
              )}
              <button onClick={leaveRoom} className="rounded-xl bg-white/10 py-2.5 font-semibold hover:bg-white/20">
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
