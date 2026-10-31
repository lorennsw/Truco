import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomView } from '@truco/shared';
import { sendChat } from '../store';
import { eventText } from '../texts';

const QUICK = ['¡Buena!', 'Jaja', '¿Querés?', 'Vamos compañero', 'Bien jugado'];

export function ChatPanel({ room, showLog = false, className = '' }: { room: RoomView; showLog?: boolean; className?: string }) {
  const [tab, setTab] = useState<'chat' | 'log'>(showLog ? 'log' : 'chat');
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const name = (seat: number) => room.seats[seat]?.player?.name ?? `Asiento ${seat + 1}`;
  const log = useMemo(
    () =>
      (room.game?.events ?? [])
        .map((e) => ({ id: e.id, text: eventText(e, name, room.me.seat), kind: e.kind }))
        .filter((x) => x.text),
    [room.game?.events, room.seats, room.me.seat],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [room.chat.length, log.length, tab]);

  const submit = (t: string) => {
    if (!t.trim()) return;
    sendChat(t);
    setText('');
  };

  return (
    <div className={`panel flex min-h-0 flex-col rounded-2xl ${className}`}>
      {showLog && (
        <div className="flex gap-1 border-b border-white/10 p-1.5">
          {(['log', 'chat'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase tracking-wide ${tab === t ? 'bg-white/15' : 'text-white/60 hover:bg-white/5'}`}
            >
              {t === 'log' ? 'Jugadas' : 'Chat'}
            </button>
          ))}
        </div>
      )}
      <div className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {tab === 'chat'
          ? room.chat.map((m) =>
              m.system ? (
                <div key={m.id} className="text-center text-xs italic text-white/50">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="break-words">
                  <span className={`font-semibold ${m.playerId === room.me.id ? 'text-gold' : 'text-emerald-300'}`}>{m.name}: </span>
                  <span className="text-white/90">{m.text}</span>
                </div>
              ),
            )
          : log.map((l) => (
              <div
                key={l.id}
                className={
                  l.kind === 'newHand'
                    ? 'pt-2 text-center text-xs font-semibold text-white/50'
                    : l.kind === 'score' || l.kind === 'gameOver'
                      ? 'font-semibold text-gold'
                      : l.kind === 'call'
                        ? 'font-medium text-white'
                        : 'text-white/70'
                }
              >
                {l.text}
              </div>
            ))}
        <div ref={endRef} />
      </div>
      {tab === 'chat' && (
        <div className="border-t border-white/10 p-2">
          <div className="mb-2 flex gap-1 overflow-x-auto scrollbar-thin">
            {QUICK.map((q) => (
              <button key={q} onClick={() => submit(q)} className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20">
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
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold/60"
            />
            <button className="rounded-xl bg-gold px-3 text-sm font-bold text-felt-950">Enviar</button>
          </form>
        </div>
      )}
    </div>
  );
}
