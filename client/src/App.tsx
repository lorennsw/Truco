import { GameTable } from './components/GameTable';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { useStore } from './store';

function Notices() {
  const notices = useStore((s) => s.notices);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {notices.map((n) => (
        <div
          key={n.id}
          role="status"
          className={`anim-pop rounded-xl px-4 py-2 text-sm font-semibold shadow-xl ${n.tone === 'error' ? 'bg-red-600 text-white' : 'bg-cream text-felt-950'}`}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const room = useStore((s) => s.room);
  const connected = useStore((s) => s.connected);
  const ready = useStore((s) => s.ready);
  return (
    <>
      <Notices />
      {!ready && (
        <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm text-white/80">
          {connected ? 'Iniciando sesión…' : 'Conectando con el servidor…'}
        </div>
      )}
      {!room ? <Home /> : room.status === 'lobby' ? <Lobby room={room} /> : <GameTable room={room} />}
    </>
  );
}
