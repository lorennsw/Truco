import { useEffect, useRef } from 'react';
import type { CallName, GameEvent } from '@truco/shared';
import { isMuted } from './ambient';

// Voces de los cantos: cuatro voces grabadas (client/public/voces/v1…v4), una por asiento.
// Suenan en fila para que no se pisen, y respetan el botón de silenciar.

const BASE = `${import.meta.env.BASE_URL}voces/`;
const VOLUME = 0.9;
const MAX_QUEUE = 5;

const ENVIDO_CALLS: CallName[] = ['envido', 'real', 'falta'];
const TRUCO_CALLS: CallName[] = ['truco', 'retruco', 'vale4'];
/** Tantos que están grabados: 1 a 7 y 20 a 33. */
const hasNumber = (n: number) => (n >= 1 && n <= 7) || (n >= 20 && n <= 33);

const cache = new Map<string, HTMLAudioElement>();
const queue: string[] = [];
let playing = false;

function audioFor(src: string) {
  let a = cache.get(src);
  if (!a) {
    a = new Audio(src);
    a.preload = 'auto';
    cache.set(src, a);
  }
  return a;
}

function next() {
  const src = queue.shift();
  if (!src) {
    playing = false;
    return;
  }
  playing = true;
  const a = audioFor(src);
  a.volume = VOLUME;
  a.currentTime = 0;
  const done = () => {
    a.onended = a.onerror = null;
    setTimeout(next, 120);
  };
  a.onended = done;
  a.onerror = done;
  a.play().catch(done);
}

function say(seat: number, clip: string) {
  if (isMuted()) return;
  queue.push(`${BASE}v${(seat % 4) + 1}/${clip}.mp3`);
  // Si se acumulan (por ejemplo al reconectar), quedan solo los últimos.
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (!playing) next();
}

/** Qué grabación corresponde a un canto, mirando lo que se cantó antes en la mano. */
function clipFor(call: CallName, before: GameEvent[]): string | null {
  const lastCall = [...before].reverse().find((e) => e.kind === 'call' && e.call !== 'quiero' && e.call !== 'noQuiero');
  const prev = lastCall?.kind === 'call' ? lastCall.call : null;
  const justBefore = before[before.length - 1];
  const answering = justBefore?.kind === 'call';
  switch (call) {
    case 'truco':
      return 'truco';
    case 'retruco':
      return answering && justBefore.call === 'truco' ? 'quiero-retruco' : 'retruco';
    case 'vale4':
      return answering && justBefore.call === 'retruco' ? 'quiero-vale4' : 'vale4';
    case 'envido':
      return 'envido';
    case 'real':
      return 'real';
    case 'falta':
      return 'falta';
    case 'flor':
      return 'flor';
    case 'contraflor':
      return 'contraflor';
    case 'contraflorResto':
      return 'contraflor-resto';
    case 'quiero':
      if (prev && ENVIDO_CALLS.includes(prev)) return prev === 'envido' ? 'quiero-envido' : prev === 'real' ? 'quiero-real' : 'quiero-falta';
      if (prev && TRUCO_CALLS.includes(prev)) return 'quiero';
      return 'quiero';
    default:
      // No quiero, mazo y "con flor me achico" no tienen grabación: se ven en la nube.
      return null;
  }
}

/** Hace sonar los cantos y los tantos nuevos (no el historial al entrar o reconectar). */
export function useVoices(events: GameEvent[]) {
  const lastSeen = useRef<number | null>(null);
  useEffect(() => {
    const maxId = events.length ? events[events.length - 1].id : 0;
    if (lastSeen.current === null) {
      lastSeen.current = maxId;
      return;
    }
    const from = lastSeen.current;
    lastSeen.current = maxId;
    events.forEach((e, i) => {
      if (e.id <= from) return;
      if (e.kind === 'call') {
        const clip = clipFor(e.call, events.slice(0, i));
        if (clip) say(e.seat, clip);
      }
      if (e.kind === 'envidoResult' || e.kind === 'florResult') {
        for (const r of e.reveals) if (hasNumber(r.points)) say(r.seat, `n${r.points}`);
      }
    });
  }, [events]);
}
