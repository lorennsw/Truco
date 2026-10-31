import { useState } from 'react';
import { MODE_LABEL } from '@truco/shared';
import type { GameMode, RoomView, SeatView } from '@truco/shared';
import { addBot, autoTeams, inviteLink, leaveRoom, notify, removeSeat, sit, stand, startGame, updateRoom } from '../store';
import { ChatPanel } from './Chat';
import { RulesForm, RulesSummary, Segmented } from './Rules';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify(`${what} copiado`, 'info');
  } catch {
    notify('No se pudo copiar. Copialo a mano: ' + text);
  }
}

function Seat({ seat, room }: { seat: SeatView; room: RoomView }) {
  const isHost = room.hostId === room.me.id;
  const p = seat.player;
  const mine = p?.id === room.me.id;
  const color = seat.team === 0 ? 'border-team0/60' : 'border-team1/60';
  return (
    <div className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 ${p ? color : 'border-dashed border-white/15'} bg-black/25 px-3 py-2.5`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold">
        {p ? (p.isBot ? 'B' : p.name[0]?.toUpperCase()) : seat.index + 1}
      </span>
      <div className="min-w-0 flex-1">
        {p ? (
          <>
            <div className="flex items-center gap-1.5 truncate font-semibold">
              {p.name}
              {mine && <span className="rounded bg-gold/25 px-1.5 text-[10px] font-bold uppercase text-gold">vos</span>}
              {p.id === room.hostId && <span title="Anfitrión">👑</span>}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <span className={`h-1.5 w-1.5 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {p.isBot ? 'Bot' : p.connected ? 'Conectado' : 'Desconectado'} · Lugar {seat.index + 1}
            </div>
          </>
        ) : (
          <div className="text-sm text-white/50">Lugar {seat.index + 1} · libre</div>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {(!p || p.isBot) && !mine && (
          <button onClick={() => sit(seat.index)} className="btn btn-secondary btn-sm h-8">
            Sentarme
          </button>
        )}
        {!p && isHost && (
          <button onClick={() => addBot(seat.index)} className="btn btn-ghost btn-sm h-8" title="Agregar bot">
            + Bot
          </button>
        )}
        {mine && (
          <button onClick={stand} className="btn btn-ghost btn-sm h-8">
            Pararme
          </button>
        )}
        {p && isHost && !mine && (
          <button onClick={() => removeSeat(seat.index)} className="rounded-lg bg-red-500/20 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/30" title="Liberar lugar">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function Lobby({ room }: { room: RoomView }) {
  const isHost = room.hostId === room.me.id;
  const [editRules, setEditRules] = useState(false);
  const full = room.seats.every((s) => s.player);
  const unseated = room.members.filter((m) => m.seat === null && !m.isBot);
  const link = inviteLink(room.code);

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-5 px-4 py-5">
      <header className="flex flex-wrap items-center gap-3">
        <button onClick={leaveRoom} className="btn btn-secondary btn-sm">
          ← Salir
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl font-bold">{room.name}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-white/60">
            <span className="rounded-full bg-gold/20 px-2 py-0.5 font-bold text-gold">{MODE_LABEL[room.mode]}</span>
            <span>{room.isPublic ? '🌎 Pública' : '🔒 Privada'}</span>
            <span>· Esperando jugadores</span>
          </div>
        </div>
        <div className="panel flex items-center gap-3 rounded-2xl px-4 py-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Código</div>
            <div className="font-mono text-2xl font-black tracking-[0.25em] text-gold">{room.code}</div>
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => copy(room.code, 'Código')} className="btn btn-secondary btn-sm h-7 text-xs">
              Copiar código
            </button>
            <button onClick={() => copy(link, 'Enlace')} className="btn btn-secondary btn-sm h-7 text-xs">
              Copiar enlace
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          <section className="grid gap-4 md:grid-cols-2">
            {([0, 1] as const).map((team) => (
              <div key={team} className="panel rounded-3xl p-4">
                <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold">
                  <span className={`h-3 w-3 rounded-full ${team === 0 ? 'bg-team0' : 'bg-team1'}`} />
                  Equipo {team + 1}
                  {room.me.seat !== null && room.me.seat % 2 === team && <span className="text-sm font-normal text-white/50">(tu equipo)</span>}
                </h2>
                <div className="flex flex-col gap-2">
                  {room.seats
                    .filter((s) => s.team === team)
                    .map((s) => (
                      <Seat key={s.index} seat={s} room={room} />
                    ))}
                </div>
              </div>
            ))}
          </section>
          <p className="-mt-2 text-center text-xs text-white/45">
            En la mesa los equipos se sientan intercalados: {room.mode > 1 ? 'los compañeros quedan enfrentados. ' : ''}El primer jugador mano se sortea al empezar.
          </p>

          {unseated.length > 0 && (
            <div className="panel rounded-2xl px-4 py-3 text-sm">
              <span className="text-white/60">Sin lugar: </span>
              {unseated.map((m) => m.name).join(', ')}
            </div>
          )}

          <section className="panel rounded-3xl p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold">Reglamento de esta mesa</h2>
              {isHost && (
                <button onClick={() => setEditRules((v) => !v)} className="btn btn-secondary btn-sm">
                  {editRules ? 'Listo' : 'Editar'}
                </button>
              )}
            </div>
            {isHost && editRules ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-3">
                  <Segmented<GameMode>
                    value={room.mode}
                    onChange={(mode) => updateRoom({ mode })}
                    options={[
                      { value: 1, label: '1 vs 1' },
                      { value: 2, label: '2 vs 2' },
                      { value: 3, label: '3 vs 3' },
                    ]}
                  />
                  <Segmented
                    value={room.isPublic ? 'pub' : 'priv'}
                    onChange={(v) => updateRoom({ isPublic: v === 'pub' })}
                    options={[
                      { value: 'priv', label: '🔒 Privada' },
                      { value: 'pub', label: '🌎 Pública' },
                    ]}
                  />
                </div>
                <RulesForm rules={room.rules} onChange={(rules) => updateRoom({ rules })} />
              </div>
            ) : (
              <RulesSummary rules={room.rules} />
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {isHost ? (
            <div className="panel flex flex-col gap-2 rounded-3xl p-4">
              <button
                disabled={!full}
                onClick={startGame}
                className="btn btn-gold btn-lg w-full"
              >
                ¡Empezar partida!
              </button>
              {!full && <p className="text-center text-xs text-white/55">Completá los lugares (podés agregar bots).</p>}
              <button onClick={autoTeams} className="btn btn-secondary w-full">
                🎲 Sortear equipos
              </button>
              <button
                onClick={() => room.seats.forEach((s) => !s.player && addBot(s.index))}
                className="btn btn-secondary w-full"
              >
                🤖 Completar con bots
              </button>
            </div>
          ) : (
            <div className="panel rounded-3xl p-4 text-center text-sm text-white/70">
              Esperando a que <b>{room.members.find((m) => m.id === room.hostId)?.name}</b> empiece la partida…
            </div>
          )}
          <ChatPanel room={room} className="h-80 lg:h-[26rem]" />
        </aside>
      </div>
    </div>
  );
}
