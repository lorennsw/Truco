import { useEffect, useSyncExternalStore } from 'react';

// Sonido ambiente de la mesa: en bucle, bajito y con opción de silenciarlo (se recuerda la preferencia).

const LS_KEY = 'truco.sonido';
const VOLUME = 0.12;
const SRC = `${import.meta.env.BASE_URL}audio/ambiente.mp3`;

let audio: HTMLAudioElement | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(LS_KEY) === 'silencio';
  } catch {
    return false;
  }
})();
let wanted = false;
let fade: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function element() {
  if (!audio) {
    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
  }
  return audio;
}

/** Entrada suave del volumen para que no arranque de golpe. */
function fadeTo(target: number, then?: () => void) {
  const a = element();
  if (fade) clearInterval(fade);
  fade = setInterval(() => {
    const next = a.volume + Math.sign(target - a.volume) * 0.01;
    if (Math.abs(target - a.volume) <= 0.01) {
      a.volume = target;
      clearInterval(fade!);
      fade = null;
      then?.();
    } else {
      a.volume = Math.min(1, Math.max(0, next));
    }
  }, 40);
}

function tryPlay() {
  if (!wanted || muted) return;
  const a = element();
  a.play().then(
    () => fadeTo(VOLUME),
    () => {
      // El navegador bloquea el audio hasta que el usuario interactúa: se reintenta con el primer clic o tecla.
      const resume = () => {
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
        tryPlay();
      };
      window.addEventListener('pointerdown', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    },
  );
}

function stop() {
  if (!audio) return;
  fadeTo(0, () => audio?.pause());
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(LS_KEY, value ? 'silencio' : 'activo');
  } catch {
    /* almacenamiento no disponible */
  }
  if (muted) stop();
  else tryPlay();
  listeners.forEach((l) => l());
}

/** Para otros sonidos (las voces de los cantos): el mismo botón silencia todo. */
export const isMuted = () => muted;

export function useMuted() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => muted,
  );
}

/** Mientras el componente esté montado, suena el ambiente (salvo que esté silenciado). */
export function useAmbientSound() {
  useEffect(() => {
    wanted = true;
    tryPlay();
    return () => {
      wanted = false;
      stop();
    };
  }, []);
}
