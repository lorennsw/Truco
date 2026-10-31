import { useEffect, useState } from 'react';
import { DEFAULT_RULES, MODE_LABEL, makeCard } from '@truco/shared';
import type { GameMode, RulesConfig } from '@truco/shared';
import { createRoom, joinRoom, quickJoin, setName, subscribeLobby, useStore } from '../store';
import { SpanishCard } from './Card';
import { RuleChips, RulesForm, Segmented } from './Rules';

const MODES: { value: GameMode; label: string }[] = [
  { value: 1, label: '1 vs 1' },
  { value: 2, label: '2 vs 2' },
  { value: 3, label: '3 vs 3' },
];

export function Home() {
  const name = useStore((s) => s.name);
  const lobby = useStore((s) => s.lobby);
  const ready = useStore((s) => s.ready);
  const invite = new URLSearchParams(window.location.search).get('sala')?.toUpperCase() ?? '';
  const [code, setCode] = useState(invite);
  const [mode, setMode] = useState<GameMode>(2);
  const [isPublic, setIsPublic] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [rules, setRules] = useState<RulesConfig>(DEFAULT_RULES);
  const [showRules, setShowRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasName = name.trim().length > 0;

  useEffect(() => subscribeLobby(), []);

  const run = async (fn: () => Promise<unknown>) => {
    if (!hasName) return document.getElementById('name')?.focus();
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-10">
      <header className="flex flex-col items-center gap-4 text-center">
        <div className="relative flex h-28 w-48 items-end justify-center">
          {[makeCard(1, 'espada'), makeCard(1, 'basto'), makeCard(7, 'espada'), makeCard(7, 'oro')].map((c, i) => (
            <div
              key={c.id}
              className="absolute bottom-0"
              style={{ transform: `translateX(${(i - 1.5) * 34}px) rotate(${(i - 1.5) * 12}deg)`, transformOrigin: 'bottom center' }}
            >
              <div className="anim-deal" style={{ animationDelay: `${i * 90}ms` }}>
                <SpanishCard card={c} size="md" />
              </div>
            </div>
          ))}
        </div>
        <div>
          <h1 className="font-display text-5xl font-black tracking-tight text-cream drop-shadow sm:text-6xl">Truco Argentino</h1>
          <p className="mt-2 text-white/70">Jugá online con amigos o con quien se siente. 1 vs 1, 2 vs 2 y 3 vs 3.</p>
        </div>
        <label className="flex w-full max-w-sm flex-col gap-1 text-left">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Tu nombre</span>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="¿Cómo te llaman en la mesa?"
            className={`rounded-xl border bg-black/30 px-4 py-3 text-lg outline-none focus:border-gold ${hasName ? 'border-white/10' : 'border-gold/70'}`}
          />
        </label>
      </header>

      {invite && (
        <div className="panel anim-pop mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl p-5 text-center">
          <div className="text-white/80">
            Te invitaron a la sala <span className="font-mono text-lg font-bold text-gold">{invite}</span>
          </div>
          <button
            disabled={!ready || busy}
            onClick={() => run(() => joinRoom(invite))}
            className="rounded-xl bg-gold px-6 py-3 font-bold text-felt-950 shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {hasName ? 'Entrar a la sala' : 'Escribí tu nombre para entrar'}
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="panel flex flex-col gap-4 rounded-3xl p-5 sm:p-6">
          <h2 className="font-display text-2xl font-bold">Crear una mesa</h2>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={30}
            placeholder={`Mesa de ${name || '…'}`}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 outline-none focus:border-gold/60"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={mode} onChange={setMode} options={MODES} />
            <Segmented
              value={isPublic ? 'pub' : 'priv'}
              onChange={(v) => setIsPublic(v === 'pub')}
              options={[
                { value: 'priv', label: '🔒 Privada' },
                { value: 'pub', label: '🌎 Pública' },
              ]}
            />
          </div>
          <p className="text-xs text-white/50">
            {isPublic ? 'Aparece en la lista de partidas públicas: cualquiera puede sumarse.' : 'Solo entra quien tenga el código o el enlace de invitación.'}
          </p>
          <div className="rounded-2xl bg-black/20 p-3">
            <button onClick={() => setShowRules((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="font-semibold">Reglamento</span>
              <span className="flex items-center gap-2 text-sm text-white/60">
                <RuleChips rules={rules} /> {showRules ? '▲' : '▼'}
              </span>
            </button>
            {showRules && (
              <div className="mt-3">
                <RulesForm rules={rules} onChange={(p) => setRules((r) => ({ ...r, ...p }))} />
              </div>
            )}
          </div>
          <button
            disabled={!ready || busy}
            onClick={() => run(() => createRoom({ name: roomName, isPublic, mode, rules }))}
            className="rounded-xl bg-gold px-6 py-3 text-lg font-bold text-felt-950 shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            Crear mesa {MODE_LABEL[mode]}
          </button>
        </section>

        <div className="flex flex-col gap-6">
          <section className="panel flex flex-col gap-3 rounded-3xl p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold">Unirse con código</h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) run(() => joinRoom(code.trim()));
              }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="ABC12"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 font-mono text-lg uppercase tracking-[0.3em] outline-none focus:border-gold/60"
              />
              <button disabled={!ready || busy || !code.trim()} className="rounded-xl bg-white/15 px-5 font-bold hover:bg-white/25 disabled:opacity-50">
                Unirse
              </button>
            </form>
            <button
              disabled={!ready || busy}
              onClick={() => run(() => quickJoin())}
              className="rounded-xl border border-gold/50 px-4 py-2.5 font-semibold text-gold hover:bg-gold/10 disabled:opacity-50"
            >
              ⚡ Partida rápida (primera mesa pública libre)
            </button>
          </section>

          <section className="panel flex min-h-48 flex-col gap-3 rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">Partidas públicas</h2>
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> en vivo
              </span>
            </div>
            {lobby.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/50">No hay mesas públicas ahora. ¡Creá la primera!</p>
            ) : (
              <ul className="scrollbar-thin -mx-1 flex max-h-80 flex-col gap-2 overflow-y-auto px-1">
                {lobby.map((r) => (
                  <li key={r.code} className="flex items-center gap-3 rounded-2xl bg-black/25 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                        <span className="rounded-full bg-gold/20 px-2 py-0.5 font-bold text-gold">{MODE_LABEL[r.mode]}</span>
                        <RuleChips rules={r.rules} />
                        <span>
                          {r.seated}/{r.capacity} jugadores
                        </span>
                      </div>
                    </div>
                    {r.status === 'lobby' ? (
                      <button
                        disabled={!ready || busy}
                        onClick={() => run(() => joinRoom(r.code))}
                        className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-felt-950 disabled:opacity-50"
                      >
                        Entrar
                      </button>
                    ) : (
                      <button
                        disabled={!ready || busy}
                        onClick={() => run(() => joinRoom(r.code))}
                        className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        title="La partida ya empezó: podés mirar o reemplazar a un bot"
                      >
                        Mirar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <footer className="pb-4 text-center text-xs text-white/40">Baraja española de 40 cartas · Reglas tradicionales argentinas, configurables por mesa</footer>
    </div>
  );
}
