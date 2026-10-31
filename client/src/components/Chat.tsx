import { useEffect, useMemo, useRef, useState } from 'react';
import { cardLabel } from '@truco/shared';
import { TEAM_CHAT_MAX_LENGTH } from '@truco/shared';
import type { CallName, GameEvent, RoomView, Team, TeamChatMessage } from '@truco/shared';
import { sendChat, sendTeamChat } from '../store';
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

const hhmm = (at: number) => new Date(at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/** Mantiene el scroll al final cuando llegan mensajes, salvo que el usuario esté leyendo más arriba. */
function useStickyScroll(dep: unknown, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 140) el.scrollTop = el.scrollHeight;
  }, [dep]);
  useEffect(() => {
    const el = ref.current;
    if (active && el) el.scrollTop = el.scrollHeight;
  }, [active]);
  return ref;
}

/** Chat privado del equipo: solo lo reciben los compañeros (lo garantiza el servidor). */
function TeamChatView({ room, messages }: { room: RoomView; messages: TeamChatMessage[] }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useStickyScroll(messages.length, true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const myTeam = room.me.seat !== null ? ((room.me.seat % 2) as Team) : 0;
  const mates = room.seats.filter((s) => s.team === myTeam && s.index !== room.me.seat && s.player).map((s) => s.player!.name);
  const canSend = room.status === 'playing';

  // El campo crece con el texto (hasta un máximo).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [text]);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const res = await sendTeamChat(t);
    setSending(false);
    if (res.ok) setText('');
    inputRef.current?.focus();
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b hairline px-4 pb-2 text-[12px] text-ivory/55">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
        <span className="truncate">
          Solo lo ven {mates.length ? <b className="font-semibold text-ivory/80">vos y {mates.join(', ')}</b> : 'vos y tu equipo'}
        </span>
      </div>
      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${myTeam === 0 ? 'bg-team0/15 text-team0' : 'bg-team1/15 text-team1'}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 5h16v11H8l-4 4V5z" />
              </svg>
            </span>
            <p className="text-sm font-semibold text-ivory/75">Coordiná tu estrategia con tu equipo</p>
            <p className="max-w-[16rem] text-[12px] text-ivory/45">Los rivales no pueden ver estos mensajes.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((m, i) => {
              const mine = m.senderId === room.me.id;
              const grouped = i > 0 && messages[i - 1].senderId === m.senderId && m.at - messages[i - 1].at < 120000;
              return (
                <div key={m.id} className={`anim-pop flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? '-mt-1.5' : ''}`}>
                  {!mine && (
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ring-1 ${
                        m.team === 0 ? 'bg-team0/20 text-team0 ring-team0/50' : 'bg-team1/20 text-team1 ring-team1/50'
                      } ${grouped ? 'invisible' : ''}`}
                      aria-hidden
                    >
                      {m.senderName[0]?.toUpperCase()}
                    </span>
                  )}
                  <div className={`flex max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!grouped && (
                      <span className="mb-0.5 flex items-baseline gap-1.5 px-1 text-[11px]">
                        <span className={`font-semibold ${mine ? 'text-ivory/70' : m.team === 0 ? 'text-team0' : 'text-team1'}`}>{mine ? 'Vos' : m.senderName}</span>
                        <span className="text-ivory/35 tabular-nums">{hhmm(m.at)}</span>
                      </span>
                    )}
                    <span
                      className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[13.5px] leading-snug ${
                        mine ? 'rounded-br-md bg-jade-strong/30 text-ivory' : 'rounded-bl-md bg-ivory/[0.07] text-ivory/90'
                      }`}
                    >
                      {m.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <form
        className="border-t hairline p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            disabled={!canSend}
            maxLength={TEAM_CHAT_MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift + Enter hace un salto de línea.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={canSend ? 'Mensaje para tu equipo…' : 'La partida terminó'}
            aria-label="Mensaje para tu equipo"
            className="max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-[var(--radius-md)] border border-ivory/10 bg-ink-950/60 px-3 py-2 text-sm leading-snug outline-none transition placeholder:text-ivory/35 focus:border-jade/60 disabled:opacity-50"
          />
          <button disabled={!text.trim() || sending || !canSend} className="btn btn-primary btn-sm h-10">
            Enviar
          </button>
        </div>
        <div className="mt-1 flex justify-between px-1 text-[10.5px] text-ivory/35">
          <span>Enter para enviar · Shift + Enter, nueva línea</span>
          {text.length > TEAM_CHAT_MAX_LENGTH * 0.8 && (
            <span className="tabular-nums">
              {text.length}/{TEAM_CHAT_MAX_LENGTH}
            </span>
          )}
        </div>
      </form>
    </>
  );
}

type Tab = 'log' | 'chat' | 'team';

export function ChatPanel({ room, showLog = false, className = '' }: { room: RoomView; showLog?: boolean; className?: string }) {
  const hasTeam = showLog && room.mode > 1 && room.teamChat !== null;
  const [tab, setTab] = useState<Tab>(showLog ? 'log' : 'chat');
  const [text, setText] = useState('');
  const teamMessages = room.teamChat ?? [];
  const lastChatId = room.chat.length ? room.chat[room.chat.length - 1].id : 0;
  const lastTeamId = teamMessages.length ? teamMessages[teamMessages.length - 1].id : '';
  const [seenChat, setSeenChat] = useState(lastChatId);
  const [seenTeam, setSeenTeam] = useState(lastTeamId);
  const name = (seat: number) => room.seats[seat]?.player?.name ?? `Lugar ${seat + 1}`;
  const events = useMemo(() => (room.game?.events ?? []).filter((e) => e.kind !== 'handEnd'), [room.game?.events]);
  const seatOf = useMemo(() => new Map(room.members.map((m) => [m.id, m.seat])), [room.members]);
  const listRef = useStickyScroll(`${tab}:${room.chat.length}:${events.length}`, true);

  const unreadChat = tab !== 'chat' ? room.chat.filter((m) => m.id > seenChat && !m.system && m.playerId !== room.me.id).length : 0;
  const seenTeamIndex = teamMessages.findIndex((m) => m.id === seenTeam);
  const unreadTeam = tab !== 'team' ? teamMessages.slice(seenTeamIndex + 1).filter((m) => m.senderId !== room.me.id).length : 0;

  useEffect(() => {
    if (tab === 'chat') setSeenChat(lastChatId);
  }, [tab, lastChatId]);
  useEffect(() => {
    if (tab === 'team') setSeenTeam(lastTeamId);
  }, [tab, lastTeamId]);
  // Si la pestaña EQUIPO deja de corresponder (por ejemplo, al volver a la sala), se vuelve a JUGADAS.
  useEffect(() => {
    if (tab === 'team' && !hasTeam) setTab('log');
  }, [tab, hasTeam]);

  const submit = (t: string) => {
    if (!t.trim()) return;
    sendChat(t);
    setText('');
  };

  const tabs: { id: Tab; label: string; unread: number }[] = [
    { id: 'log', label: 'Jugadas', unread: 0 },
    { id: 'chat', label: 'Chat', unread: unreadChat },
    ...(hasTeam ? [{ id: 'team' as const, label: 'Equipo', unread: unreadTeam }] : []),
  ];

  return (
    <div className={`panel flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] ${className}`}>
      {showLog && (
        <div className="p-2">
          <div className={`grid gap-1 rounded-[var(--radius-md)] bg-ink-950/60 p-1 ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex h-8 items-center justify-center gap-1.5 rounded-[9px] text-[12px] font-semibold uppercase tracking-wider transition ${
                  tab === t.id ? 'bg-ivory/10 text-ivory shadow-sm' : 'text-ivory/50 hover:text-ivory/80'
                }`}
              >
                {t.id === 'team' && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 018 0v3" />
                  </svg>
                )}
                {t.label}
                {t.unread > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-jade px-1 text-[10px] font-bold text-ink-950" aria-label={`${t.unread} sin leer`}>
                    {t.unread > 9 ? '9+' : t.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'team' && hasTeam ? (
        <TeamChatView room={room} messages={teamMessages} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
