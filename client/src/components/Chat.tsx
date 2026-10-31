import { useEffect, useMemo, useRef, useState } from 'react';
import { cardLabel } from '@truco/shared';
import type { CallName, GameEvent, RoomView, Team } from '@truco/shared';
import { sendChat } from '../store';
import { CALL_TEXT, SCORE_REASON, teamName } from '../texts';
import { SuitIcon } from './Card';

const QUICK = ['¡Buena!', 'Jaja', '¿Querés?', 'Vamos compañero', 'Bien jugado'];

const TRUCO_CALLS: CallName[] = ['truco', 'retruco', 'vale4'];
const ENVIDO_CALLS: CallName[] = ['envido', 'real', 'falta'];
const FLOR_CALLS: CallName[] = ['flor', 'contraflor', 'contraflorResto', 'achico'];

const teamDot = (t: Team) => (t === 0 ? 'bg-team0' : 'bg-team1');
const teamText = (t: Team) => (t === 0 ? 'text-team0' : 'text-team1');

/** Una línea del historial, con una jerarquía visual según el tipo de evento. */
function LogEntry({ e, name, mySeat }: { e: GameEvent; name: (s: number) => string; mySeat: number | null }) {
  const who = (seat: number) => <span className={`font-semibold ${teamText((seat % 2) as Team)}`}>{name(seat)}</span>;
  switch (e.kind) {
    case 'newHand':
      return (
        <div className="flex items-center gap-3 pb-1 pt-4 first:pt-1">
          <span className="label whitespace-nowrap">Mano {e.hand}</span>
          <span className="h-px flex-1 bg-ivory/10" />
          <span className="text-[11px] text-ivory/45">es mano {name(e.mano)}</span>
        </div>
      );
    case 'play':
      return (
        <div className="flex items-center gap-2 py-0.5 text-[13px] text-ivory/60">
          <span className="flex h-5 w-4 shrink-0 items-center justify-center rounded-[3px] bg-cream shadow-sm">
            <SuitIcon suit={e.card.suit} className="h-3 w-3" />
          </span>
          <span className="truncate">
            {who(e.seat)} <span className="text-ivory/45">juega</span> {cardLabel(e.card)}
          </span>
        </div>
      );
    case 'call': {
      const c = e.call;
      const accent = TRUCO_CALLS.includes(c)
        ? 'border-truco text-truco'
        : ENVIDO_CALLS.includes(c)
          ? 'border-envido text-envido'
          : FLOR_CALLS.includes(c)
            ? 'border-flor text-flor'
            : c === 'quiero'
              ? 'border-jade/60 text-jade'
              : c === 'noQuiero'
                ? 'border-danger/60 text-danger'
                : 'border-ivory/20 text-ivory/70';
      const isBet = !['quiero', 'noQuiero', 'mazo'].includes(c);
      return (
        <div className={`my-0.5 border-l-2 py-0.5 pl-2.5 text-[13px] ${accent.split(' ')[0]}`}>
          {who(e.seat)}{' '}
          <span className={`${accent.split(' ')[1]} ${isBet ? 'font-bold' : 'font-semibold'}`}>{CALL_TEXT[c]}</span>
        </div>
      );
    }
    case 'trick':
      return (
        <div className="flex items-center gap-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ivory/45">
          <span className="h-px w-3 bg-ivory/15" />
          Baza {e.index + 1}
          {e.winnerTeam === null ? (
            <span className="text-ivory/70">· parda</span>
          ) : (
            <>
              <span className={`h-1.5 w-1.5 rounded-full ${teamDot(e.winnerTeam)}`} />
              <span className={teamText(e.winnerTeam)}>{teamName(e.winnerTeam, mySeat)}</span>
            </>
          )}
        </div>
      );
    case 'envidoResult':
    case 'florResult':
      return (
        <div className="my-1 rounded-[var(--radius-sm)] bg-ivory/[0.04] px-2.5 py-2 text-[12px]">
          <div className={`mb-1 font-semibold ${e.kind === 'envidoResult' ? 'text-envido' : 'text-flor'}`}>
            {e.kind === 'envidoResult' ? 'Envido' : 'Flor'} · gana {teamName(e.winnerTeam, mySeat)}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-ivory/65">
            {e.reveals.map((r) => (
              <span key={r.seat}>
                {name(r.seat)} <b className="tabular-nums text-ivory">{r.points}</b>
              </span>
            ))}
          </div>
        </div>
      );
    case 'score':
      return (
        <div className="my-0.5 flex items-center gap-2 text-[13px]">
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[12px] font-bold tabular-nums text-gold">+{e.points}</span>
          <span className={`font-semibold ${teamText(e.team)}`}>{teamName(e.team, mySeat)}</span>
          <span className="text-ivory/45">por {SCORE_REASON[e.reason]}</span>
        </div>
      );
    case 'gameOver':
      return (
        <div className="my-2 rounded-[var(--radius-sm)] border border-gold/40 bg-gold/10 px-3 py-2 text-center text-sm font-bold text-gold">
          Partida terminada · ganó {teamName(e.winnerTeam, mySeat)}
        </div>
      );
    case 'handEnd':
      return null;
  }
}

export function ChatPanel({ room, showLog = false, className = '' }: { room: RoomView; showLog?: boolean; className?: string }) {
  const [tab, setTab] = useState<'chat' | 'log'>(showLog ? 'log' : 'chat');
  const [text, setText] = useState('');
  const lastChatId = room.chat.length ? room.chat[room.chat.length - 1].id : 0;
  const [seenChat, setSeenChat] = useState(lastChatId);
  const listRef = useRef<HTMLDivElement>(null);
  const name = (seat: number) => room.seats[seat]?.player?.name ?? `Lugar ${seat + 1}`;
  const events = useMemo(() => (room.game?.events ?? []).filter((e) => e.kind !== 'handEnd'), [room.game?.events]);
  const seatOf = useMemo(() => new Map(room.members.map((m) => [m.id, m.seat])), [room.members]);
  const unread = tab === 'log' ? room.chat.filter((m) => m.id > seenChat && !m.system && m.playerId !== room.me.id).length : 0;

  useEffect(() => {
    if (tab === 'chat') setSeenChat(lastChatId);
  }, [tab, lastChatId]);

  // Mantener el scroll abajo solo si el usuario ya estaba cerca del final.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 140) el.scrollTop = el.scrollHeight;
  }, [room.chat.length, events.length, tab]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab]);

  const submit = (t: string) => {
    if (!t.trim()) return;
    sendChat(t);
    setText('');
  };

  return (
    <div className={`panel flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] ${className}`}>
      {showLog && (
        <div className="p-2">
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-ink-950/60 p-1" role="tablist">
            {(['log', 'chat'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`relative h-8 rounded-[9px] text-[12px] font-semibold uppercase tracking-wider transition ${
                  tab === t ? 'bg-ivory/10 text-ivory shadow-sm' : 'text-ivory/50 hover:text-ivory/80'
                }`}
              >
                {t === 'log' ? 'Jugadas' : 'Chat'}
                {t === 'chat' && unread > 0 && (
                  <span className="absolute right-3 top-1/2 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full bg-jade px-1 text-[10px] font-bold text-ink-950">
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1" aria-live="polite">
        {tab === 'log' ? (
          events.length ? (
            events.map((e) => <LogEntry key={e.id} e={e} name={name} mySeat={room.me.seat} />)
          ) : (
            <p className="py-8 text-center text-sm text-ivory/40">Todavía no hay jugadas.</p>
          )
        ) : (
          <div className="flex flex-col gap-2 pt-2">
            {room.chat.map((m) => {
              if (m.system)
                return (
                  <div key={m.id} className="py-0.5 text-center text-[11px] text-ivory/40">
                    {m.text}
                  </div>
                );
              const mine = m.playerId === room.me.id;
              const seat = m.playerId ? seatOf.get(m.playerId) : null;
              const tone = seat == null ? 'text-ivory/70' : teamText((seat % 2) as Team);
              return (
                <div key={m.id} className={`flex max-w-[88%] flex-col ${mine ? 'items-end self-end' : 'items-start'}`}>
                  {!mine && <span className={`mb-0.5 px-1 text-[11px] font-semibold ${tone}`}>{m.name}</span>}
                  <span
                    className={`break-words rounded-2xl px-3 py-1.5 text-[13.5px] leading-snug ${
                      mine ? 'rounded-br-md bg-jade-strong/30 text-ivory' : 'rounded-bl-md bg-ivory/[0.07] text-ivory/90'
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {tab === 'chat' && (
        <div className="border-t hairline p-2.5">
          <div className="scrollbar-thin mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {QUICK.map((q) => (
              <button key={q} onClick={() => submit(q)} className="h-7 shrink-0 rounded-full border border-ivory/10 px-2.5 text-[12px] text-ivory/75 transition hover:border-ivory/25 hover:text-ivory">
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
            className="flex gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={280}
              placeholder="Escribí un mensaje…"
              aria-label="Mensaje"
              className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-ivory/10 bg-ink-950/60 px-3 text-sm outline-none transition placeholder:text-ivory/35 focus:border-jade/60"
            />
            <button disabled={!text.trim()} className="btn btn-primary btn-sm h-10">
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
