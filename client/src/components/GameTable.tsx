import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MODE_LABEL } from '@truco/shared';
import type { Action, ChatMessage, GameEvent, PlayerView, RoomView, SeatView, Team } from '@truco/shared';
import { leaveRoom, rematch, sendAction, sit, useStore } from '../store';
import { CALL_TEXT, actionLabel, pendingText, teamName } from '../texts';
import { SpanishCard } from './Card';
import { ChatPanel } from './Chat';
import { BarTableSurface, CardDeck } from './BarTable';
import { setMuted, useAmbientSound, useMuted } from '../ambient';
import { RulesSummary } from './Rules';
import { ScoreBoard } from './Score';

// ───────────────────────── Hooks ─────────────────────────

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

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

interface Bubble { key: number; seat: number; text: string | null; tone: 'call' | 'tanto' | 'say'; sub?: string }

/**
 * Nubes de diálogo: los cantos recientes, los tantos y lo que dice cada jugador en el chat
 * (los bots comentan sus jugadas). Solo lo nuevo, no el historial.
 */
function useBubbles(events: GameEvent[], chat: ChatMessage[], seatOf: (playerId: string | null) => number | null) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const lastEvent = useRef<number | null>(null);
  const lastChat = useRef<number | null>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const show = (b: Bubble, merge: boolean) => {
    setBubbles((list) => {
      const prev = list.find((x) => x.seat === b.seat);
      // Si el jugador recién cantó, la frase va debajo del canto en la misma nube.
      const next = merge && prev && prev.text ? { ...prev, sub: b.sub } : b;
      return [...list.filter((x) => x.seat !== b.seat), next];
    });
    clearTimeout(timers.current.get(b.seat));
    timers.current.set(
      b.seat,
      setTimeout(() => setBubbles((list) => list.filter((x) => x.seat !== b.seat)), b.sub ? 4600 : 3600),
    );
  };

  useEffect(() => {
    const maxId = events.length ? events[events.length - 1].id : 0;
    if (lastEvent.current === null) {
      lastEvent.current = maxId;
      return;
    }
    const fresh = events.filter((e) => e.id > lastEvent.current!);
    lastEvent.current = maxId;
    for (const e of fresh) {
      if (e.kind === 'call') show({ key: e.id * 10, seat: e.seat, text: CALL_TEXT[e.call], tone: 'call' }, false);
      if (e.kind === 'envidoResult' || e.kind === 'florResult')
        e.reveals.forEach((r, i) => show({ key: e.id * 10 + i + 1, seat: r.seat, text: `${r.points}`, tone: 'tanto' }, false));
    }
  }, [events]);

  useEffect(() => {
    const maxId = chat.length ? chat[chat.length - 1].id : 0;
    if (lastChat.current === null) {
      lastChat.current = maxId;
      return;
    }
    const fresh = chat.filter((m) => m.id > lastChat.current! && !m.system);
    lastChat.current = maxId;
    for (const m of fresh) {
      const seat = seatOf(m.playerId);
      if (seat === null) continue;
      const text = m.text.length > 90 ? `${m.text.slice(0, 88)}…` : m.text;
      show({ key: -m.id, seat, text: null, tone: 'say', sub: text }, true);
    }
  }, [chat]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return bubbles;
}

// ───────────────────────── Piezas pequeñas ─────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const teamRing = (t: Team) => (t === 0 ? 'ring-team0/70' : 'ring-team1/70');
const teamBg = (t: Team) => (t === 0 ? 'bg-team0/20 text-team0' : 'bg-team1/20 text-team1');
/** Ancho de las cartas propias: depende del ancho y del alto de la pantalla. */
const HAND_CARD_W = 'clamp(72px, min(22vw, 13vh), 112px)';

function BotIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5" />
    </svg>
  );
}

/** Avatar con el color del equipo y, si corre el tiempo, un anillo que se vacía. */
function Avatar({ seat, size, active, fraction }: { seat: SeatView; size: number; active: boolean; fraction: number | null }) {
  const p = seat.player;
  const ring = active && fraction !== null;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {ring && (
        <span
          className="absolute -inset-[3px] rounded-full"
          style={{ background: `conic-gradient(var(--color-gold) ${fraction! * 360}deg, rgba(243,236,219,0.12) 0)` }}
          aria-hidden
        />
      )}
      <span
        className={`relative flex h-full w-full items-center justify-center rounded-full font-bold ring-2 ${teamRing(seat.team)} ${teamBg(seat.team)} ${
          active && !ring ? 'turn-glow' : ''
        } ${p && !p.connected ? 'opacity-50 grayscale' : ''}`}
        style={{ fontSize: size * 0.42, backgroundColor: ring ? 'var(--color-ink-850)' : undefined }}
      >
        {p?.isBot ? <BotIcon className="h-[55%] w-[55%]" /> : (p?.name[0] ?? '?').toUpperCase()}
      </span>
      {p && !p.connected && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-900 bg-danger" title="Desconectado" />}
    </span>
  );
}

export type BubbleDir = 'up' | 'down' | 'left' | 'right';
/** En las puntas de la fila (celular) la nube se alinea hacia adentro para no salirse de la pantalla. */
type BubbleAlign = 'center' | 'start' | 'end';
const ALIGN_POS: Record<BubbleAlign, string> = { center: '', start: '!left-0 !translate-x-0', end: '!left-auto right-0 !translate-x-0' };
const ALIGN_TAIL: Record<BubbleAlign, string> = { center: '', start: '!left-6', end: '!left-auto right-6 translate-x-1/2' };

const BUBBLE_POS: Record<BubbleDir, string> = {
  up: 'bottom-full left-1/2 mb-3 -translate-x-1/2 origin-bottom',
  down: 'top-full left-1/2 mt-3 -translate-x-1/2 origin-top',
  left: 'right-full top-1/2 mr-3 -translate-y-1/2 origin-right',
  right: 'left-full top-1/2 ml-3 -translate-y-1/2 origin-left',
};
const TAIL_POS: Record<BubbleDir, string> = {
  up: 'left-1/2 top-full -translate-x-1/2 -translate-y-1/2',
  down: 'left-1/2 bottom-full -translate-x-1/2 translate-y-1/2',
  left: 'left-full top-1/2 -translate-x-1/2 -translate-y-1/2',
  right: 'right-full top-1/2 translate-x-1/2 -translate-y-1/2',
};
const BUBBLE_TONE: Record<Bubble['tone'], string> = {
  call: 'bg-ivory text-ink-950',
  tanto: 'bg-envido text-ink-950',
  say: 'bg-ivory text-ink-950',
};

/** Nube de diálogo con colita que apunta a la foto del jugador. */
function SpeechBubble({ bubble, dir = 'up', align = 'center' }: { bubble: Bubble; dir?: BubbleDir; align?: BubbleAlign }) {
  return (
    <div
      key={bubble.key}
      className={`anim-bubble pointer-events-none absolute z-30 w-max max-w-[200px] rounded-2xl px-3.5 py-2 text-center shadow-[var(--shadow-lift)] ${BUBBLE_POS[dir]} ${ALIGN_POS[align]} ${BUBBLE_TONE[bubble.tone]}`}
    >
      <span className={`absolute h-3 w-3 rotate-45 rounded-[2px] ${TAIL_POS[dir]} ${ALIGN_TAIL[align]} ${bubble.tone === 'tanto' ? 'bg-envido' : 'bg-ivory'}`} aria-hidden />
      {bubble.text && <span className="relative block whitespace-nowrap text-[16px] font-extrabold leading-tight tracking-tight">{bubble.text}</span>}
      {bubble.sub && <span className={`relative block text-[12.5px] leading-snug ${bubble.text ? 'mt-0.5 text-ink-950/70' : 'font-medium'}`}>{bubble.sub}</span>}
    </div>
  );
}

/** Nube de "pensando…" para que se note a quién le toca. */
function ThinkingBubble({ dir = 'up', align = 'center' }: { dir?: BubbleDir; align?: BubbleAlign }) {
  return (
    <div className={`anim-pop pointer-events-none absolute z-20 rounded-full bg-ivory px-2.5 py-1.5 shadow-[var(--shadow-soft)] ${BUBBLE_POS[dir]} ${ALIGN_POS[align]}`} aria-label="Pensando">
      <span className={`absolute h-2.5 w-2.5 rotate-45 rounded-[2px] bg-ivory ${TAIL_POS[dir]} ${ALIGN_TAIL[align]}`} aria-hidden />
      <span className="relative flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="thinking-dot h-1.5 w-1.5 rounded-full bg-ink-950/70" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
    </div>
  );
}

const ManoChip = ({ className = '' }: { className?: string }) => (
  <span className={`chip h-[18px] bg-gold px-1.5 text-[9px] text-ink-950 ${className}`}>Mano</span>
);

/**
 * Efecto lupa como el dock de macOS: la carta bajo el mouse se agranda y las vecinas un poco menos.
 * Es solo visual y local: no se envía nada al servidor, así que los demás no lo ven.
 */
function useDock(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [scales, setScales] = useState<number[]>([]);
  const onMouseMove = (e: React.MouseEvent) => {
    const box = ref.current;
    if (!enabled || !box) return;
    const left = box.getBoundingClientRect().left;
    const items = Array.from(box.children) as HTMLElement[];
    setScales(
      items.map((el) => {
        const center = left + el.offsetLeft + el.offsetWidth / 2;
        const d = Math.abs(e.clientX - center) / (el.offsetWidth * 1.4);
        return d >= 1 ? 1 : 1 + 0.32 * (Math.cos(d * Math.PI) + 1) / 2;
      }),
    );
  };
  const onMouseLeave = () => setScales([]);
  return { ref, scales, handlers: enabled ? { onMouseMove, onMouseLeave } : {} };
}

/**
 * Arrastrar una carta de la mano a la mesa para jugarla (mouse o dedo).
 * Si se suelta sobre la mesa se juega; si no, vuelve a su lugar. Un toque o clic sin arrastrar sigue funcionando igual.
 */
function useCardDrag(onDrop: (cardId: string) => void) {
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; over: boolean } | null>(null);
  const start = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  const overTable = (x: number, y: number) => {
    const mesa = document.querySelector('[data-mesa]')?.getBoundingClientRect();
    return !!mesa && x >= mesa.left && x <= mesa.right && y >= mesa.top && y <= mesa.bottom;
  };

  const bind = (id: string, enabled: boolean) =>
    enabled
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            start.current = { id, x: e.clientX, y: e.clientY, moved: false };
          },
          onPointerMove: (e: React.PointerEvent) => {
            const st = start.current;
            if (!st || st.id !== id) return;
            const dx = e.clientX - st.x;
            const dy = e.clientY - st.y;
            if (!st.moved && Math.hypot(dx, dy) < 8) return;
            // Recién al empezar a arrastrar se captura el puntero, así un clic simple llega a la carta.
            if (!st.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            st.moved = true;
            setDrag({ id, dx, dy, over: overTable(e.clientX, e.clientY) });
          },
          onPointerUp: (e: React.PointerEvent) => {
            const st = start.current;
            start.current = null;
            if (!st?.moved) return;
            justDragged.current = true;
            setTimeout(() => (justDragged.current = false), 0);
            setDrag(null);
            if (overTable(e.clientX, e.clientY)) onDrop(id);
          },
          onPointerCancel: () => {
            start.current = null;
            setDrag(null);
          },
          // Después de arrastrar no cuenta como clic.
          onClickCapture: (e: React.MouseEvent) => {
            if (justDragged.current) e.stopPropagation();
          },
        }
      : {};

  return { drag, bind };
}

// ───────────────────────── Mesa ─────────────────────────

interface SeatInfo {
  seat: SeatView;
  relation: 'yo' | 'compañero' | 'rival' | 'equipo';
  active: boolean;
  isMano: boolean;
  bubble?: Bubble;
  cardsLeft: number;
}

/** Cartel de un jugador sentado alrededor de la mesa. */
function SeatPlate({
  info,
  layout,
  compact,
  fraction,
  secsLeft,
  dir,
  align = 'center',
  canTake,
}: {
  info: SeatInfo;
  layout: 'pill' | 'stack';
  compact: boolean;
  fraction: number | null;
  secsLeft: number | null;
  dir: BubbleDir;
  align?: BubbleAlign;
  canTake: boolean;
}) {
  const { seat, active, isMano, bubble, cardsLeft } = info;
  const p = seat.player;
  const relLabel = info.relation === 'compañero' ? 'Compañero' : info.relation === 'rival' ? 'Rival' : `Equipo ${seat.team + 1}`;
  const showTimer = active && secsLeft !== null;
  // La nube sale de la foto hacia la mesa; si no dijo nada y es su turno, muestra que está pensando.
  const cloud = bubble ? <SpeechBubble bubble={bubble} dir={dir} align={align} /> : active ? <ThinkingBubble dir={dir} align={align} /> : null;
  const sideways = dir === 'left' || dir === 'right';
  const backs = (
    <span className="flex items-center" aria-label={`${cardsLeft} cartas en mano`}>
      {Array.from({ length: cardsLeft }, (_, i) => (
        <span key={i} className="card-back-mini -ml-1 first:ml-0" style={{ rotate: `${(i - (cardsLeft - 1) / 2) * 8}deg` }} />
      ))}
    </span>
  );
  const take = canTake && (
    <button onClick={() => sit(seat.index)} className="btn btn-gold mt-1.5 h-7 rounded-full px-3 text-[11px]">
      Tomar lugar
    </button>
  );

  if (layout === 'stack' && !compact) {
    return (
      <div className="relative flex w-[124px] flex-col items-center gap-1.5">
        {!sideways && cloud}
        <div className="relative">
          {sideways && cloud}
          <Avatar seat={seat} size={46} active={active} fraction={fraction} />
          {isMano && <ManoChip className="absolute -right-5 -top-1.5 shadow-[var(--shadow-soft)]" />}
        </div>
        <div className={`flex max-w-full flex-col items-center rounded-2xl bg-ink-900/90 px-3 py-1 leading-tight shadow-[var(--shadow-soft)] ring-1 transition ${active ? 'ring-gold/80' : 'ring-ivory/10'}`}>
          <span className="max-w-[104px] truncate text-[13px] font-semibold">{p?.name ?? 'Libre'}</span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-ivory/50">
            <span className={`h-1.5 w-1.5 rounded-full ${seat.team === 0 ? 'bg-team0' : 'bg-team1'}`} />
            {p && !p.connected ? <span className="text-danger">Desconectado</span> : relLabel}
            {showTimer && <b className="tabular-nums text-gold">{secsLeft}s</b>}
          </span>
        </div>
        {cardsLeft > 0 && backs}
        {take}
      </div>
    );
  }
  if (compact) {
    return (
      <div className="relative flex w-[74px] flex-col items-center gap-1">
        {!sideways && cloud}
        <div className="relative">
          {sideways && cloud}
          <Avatar seat={seat} size={38} active={active} fraction={fraction} />
          {isMano && <ManoChip className="absolute -right-4 -top-1.5" />}
        </div>
        <div className={`flex max-w-full items-center gap-1 rounded-full bg-ink-900/85 px-2 py-0.5 ring-1 ${active ? 'ring-gold/70' : 'ring-ivory/10'}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${seat.team === 0 ? 'bg-team0' : 'bg-team1'}`} />
          <span className="truncate text-[11px] font-semibold">{p?.name ?? 'Libre'}</span>
          {showTimer && <span className="text-[10px] font-bold tabular-nums text-gold">{secsLeft}</span>}
        </div>
        {cardsLeft > 0 && backs}
        {take}
      </div>
    );
  }
  return (
    <div className="relative flex flex-col items-center">
      {cloud}
      {isMano && <ManoChip className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 shadow-[var(--shadow-soft)]" />}
      <div
        className={`flex h-[52px] w-[184px] items-center gap-2.5 rounded-full bg-ink-900/90 py-1.5 pl-1.5 pr-3 shadow-[var(--shadow-soft)] ring-1 transition ${
          active ? 'ring-gold/80' : 'ring-ivory/10'
        }`}
      >
        <Avatar seat={seat} size={40} active={active} fraction={fraction} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13.5px] font-semibold">{p?.name ?? 'Libre'}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-ivory/50">
            <span className={`h-1.5 w-1.5 rounded-full ${seat.team === 0 ? 'bg-team0' : 'bg-team1'}`} />
            {p && !p.connected ? <span className="text-danger">Desconectado</span> : relLabel}
          </span>
        </div>
        {showTimer ? <span className="text-[12px] font-bold tabular-nums text-gold">{secsLeft}s</span> : cardsLeft > 0 && backs}
      </div>
      {take}
    </div>
  );
}

function TrickDots({ g, size = 22 }: { g: PlayerView; size?: number }) {
  return (
    <div className="flex gap-1.5" aria-label="Bazas">
      {[0, 1, 2].map((i) => {
        const t = g.tricks[i];
        const res = t?.done ? t.winnerTeam : undefined;
        return (
          <span
            key={i}
            title={`Baza ${i + 1}`}
            style={{ width: size, height: size }}
            className={`flex items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-300 ${
              res === undefined
                ? 'border border-ivory/20 text-ivory/40'
                : res === null
                  ? 'bg-ivory/80 text-ink-950'
                  : res === 0
                    ? 'bg-team0 text-ink-950'
                    : 'bg-team1 text-ink-950'
            }`}
          >
            {res === null ? 'P' : i + 1}
          </span>
        );
      })}
    </div>
  );
}

const LEVEL_NAME = ['', '', 'Truco', 'Retruco', 'Vale cuatro'];

function TableStage({ room, g, seats, fraction, secsLeft, dropHint = null }: { room: RoomView; g: PlayerView; seats: SeatInfo[]; fraction: number | null; secsLeft: number | null; dropHint?: 'near' | 'over' | null }) {
  const [ref, box] = useSize<HTMLDivElement>();
  const n = g.numPlayers;
  const mySeat = room.me.seat;
  const viewSeat = mySeat ?? 0;
  const myTeam: Team | null = mySeat !== null ? ((mySeat % 2) as Team) : null;

  // Los carteles de los jugadores van por fuera de la mesa: primero se reserva su lugar y la mesa ocupa el resto.
  // En pantallas anchas, los de los costados van al costado (apilados) y los de arriba, arriba;
  // en pantallas chicas, todos en una fila sobre la mesa.
  const compact = box.w < 640;
  const pad = compact ? 6 : 16;
  const gap = compact ? 6 : 12;
  const side = { w: 124, h: 118 };
  const top = compact ? { w: 80, h: 90 } : { w: 184, h: 64 };
  const spectator = mySeat === null;
  const hasSide = !compact && n > 2;
  const marginX = hasSide ? side.w + gap + pad : pad;
  const marginTop = top.h + gap + pad;
  const marginBottom = spectator ? top.h + gap + pad : pad;
  const availW = Math.max(0, box.w - marginX * 2);
  const availH = Math.max(0, box.h - marginTop - marginBottom);
  const aspect = availH ? clamp(availW / availH, 0.75, 2.05) : 2;
  const tw = Math.min(availW, availH * aspect);
  const th = tw / aspect;
  const offsetY = (marginTop - marginBottom) / 2;

  const cardW = compact
    ? Math.round(clamp(tw * (n === 6 ? 0.13 : 0.15), 34, 54))
    : Math.round(clamp(Math.min(tw * (n === 6 ? 0.07 : 0.08), th * 0.17), 44, 104));
  const cardH = (cardW * 520) / 336;
  const step = Math.round(cardW * (compact ? 0.3 : 0.42));
  const fanHalfW = cardW / 2 + step;
  // Radio (en fracción de la mesa) donde caen las cartas jugadas de cada jugador, dentro de la madera.
  const Px = Math.max(0.12, 0.5 - (fanHalfW + tw * 0.07) / tw);
  const Py = Math.max(0.14, 0.5 - (cardH / 2 + th * 0.08) / th);

  // Yo abajo; el siguiente en el orden de juego, a mi derecha.
  const angleOf = (seat: number) => {
    const r = (seat - viewSeat + n) % n;
    return ((90 - (r * 360) / n) * Math.PI) / 180;
  };

  /** Posición del cartel de un jugador (en px, relativa al centro de la mesa), siempre fuera de la madera. */
  const others = seats.filter((s) => s.seat.index !== mySeat);
  const rowSeats = others.filter((s) => Math.sin(angleOf(s.seat.index)) < 0.7).sort((x, y) => Math.cos(angleOf(x.seat.index)) - Math.cos(angleOf(y.seat.index)));
  const placeOf = (seat: number): { x: number; y: number; layout: 'pill' | 'stack'; dir: BubbleDir; align?: BubbleAlign } => {
    const a = angleOf(seat);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    if (sn >= 0.7) return { x: 0, y: th / 2 + gap + top.h / 2, layout: compact ? 'stack' : 'pill', dir: 'up' };
    if (compact) {
      const i = rowSeats.findIndex((s) => s.seat.index === seat);
      const slot = Math.min(tw, box.w - pad * 2) / rowSeats.length;
      const align = rowSeats.length > 1 && i === 0 ? 'start' : rowSeats.length > 1 && i === rowSeats.length - 1 ? 'end' : 'center';
      return { x: (i - (rowSeats.length - 1) / 2) * slot, y: -th / 2 - gap - top.h / 2, layout: 'stack', dir: 'down', align };
    }
    if (hasSide && Math.abs(c) > 0.3) return { x: Math.sign(c) * (tw / 2 + gap + side.w / 2), y: Math.sign(sn) * Math.max(Math.abs(sn) * th * 0.3, (side.h + 12) / 2), layout: 'stack', dir: c > 0 ? 'left' : 'right' };
    return { x: c * tw * 0.3, y: -th / 2 - gap - top.h / 2 + 6, layout: 'pill', dir: 'down' };
  };

  const result = g.phase === 'handOver' ? g.result : null;

  // Mazo decorativo en un ángulo donde no hay jugadores (arriba a la izquierda).
  const propRadius = 0.78;
  const props = compact && n === 6 ? [] : [{ angle: ((n === 6 ? -118 : -135) * Math.PI) / 180, kind: 'deck' as const }];
  const propSize = Math.round(clamp(Math.min(tw, th * 1.6) * (n === 6 ? 0.036 : 0.048), 20, 46));

  return (
    <div ref={ref} className="relative min-h-0 flex-1 overflow-x-clip">
      {tw > 0 && (
        <div data-mesa className="absolute left-1/2 top-1/2" style={{ width: tw, height: th, transform: `translate(-50%, calc(-50% + ${offsetY}px))` }}>
          {/* Mesa de madera */}
          <BarTableSurface edge={Math.round(clamp(th * 0.03, 6, 16))} />
          {/* Al arrastrar una carta, la mesa se ilumina para indicar dónde soltarla */}
          {dropHint && (
            <div
              className={`pointer-events-none absolute inset-[6%] z-20 flex items-start justify-center rounded-[50%] border-[3px] border-dashed pt-[7%] transition-colors duration-150 ${
                dropHint === 'over' ? 'border-gold bg-gold/20' : 'border-ivory/40 bg-ivory/5'
              }`}
            >
              <span className="rounded-full bg-ink-950/70 px-3 py-1 text-[13px] font-semibold text-ivory">{dropHint === 'over' ? 'Soltá para jugarla' : 'Arrastrala a la mesa'}</span>
            </div>
          )}

          {/* El mazo, en un hueco entre jugadores */}
          {props.map(({ angle, kind }) => (
            <div
              key={kind}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(0.5 + Math.cos(angle) * 0.5 * propRadius) * 100}%`, top: `${(0.5 + Math.sin(angle) * 0.5 * propRadius) * 100}%` }}
            >
              <CardDeck size={propSize} />
            </div>
          ))}

          {/* Centro: valor de la mano y bazas (en pantallas chicas se muestra en la zona inferior) */}
          {!compact && (
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-[var(--radius-lg)] bg-ink-950/55 px-4 py-2.5 shadow-[var(--shadow-soft)] backdrop-blur-[2px]">
              <span className="label text-ivory/55">
                Mano {g.handNumber} · vale {g.truco.level}
              </span>
              <TrickDots g={g} />
              {g.truco.level > 1 && <span className="text-[11px] font-semibold uppercase tracking-wider text-truco">{LEVEL_NAME[g.truco.level]} querido</span>}
            </div>
          )}

          {/* Cartas jugadas, en abanico delante de cada jugador */}
          {seats.map(({ seat }) => {
            const a = angleOf(seat.index);
            const x = 0.5 + Math.cos(a) * Px;
            const y = 0.5 + Math.sin(a) * Py;
            const cards = g.tricks.map((t) => ({ t, play: t.plays.find((pl) => pl.seat === seat.index) })).filter((c) => c.play);
            const mid = (cards.length - 1) / 2;
            return (
              <div key={`played-${seat.index}`} className="pointer-events-none absolute" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
                {cards.map(({ t, play }, i) => {
                  const won = t.done && t.winnerSeat === seat.index;
                  return (
                    // Posición y animación en contenedores separados para que no se pisen los transform.
                    <div
                      key={play!.card.id}
                      className="absolute left-0 top-0"
                      style={{
                        width: cardW,
                        transform: `translate(-50%, -50%) translate(${(i - mid) * step}px, ${i * 2}px) rotate(${(i - mid) * 6}deg)`,
                        zIndex: i,
                      }}
                    >
                      <div className="anim-drop">
                        <div className={won ? 'anim-win' : ''}>
                          <SpanishCard card={play!.card} size="fluid" state={won ? 'winner' : 'static'} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Jugadores alrededor de la mesa (el jugador local tiene su zona abajo) */}
          {others.map((info) => {
            const at = placeOf(info.seat.index);
            return (
              <div
                key={`seat-${info.seat.index}`}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `calc(50% + ${at.x}px)`, top: `calc(50% + ${at.y}px)` }}
              >
                <SeatPlate
                  info={info}
                  layout={at.layout}
                  compact={compact}
                  fraction={fraction}
                  secsLeft={secsLeft}
                  dir={at.dir}
                  align={at.align}
                  canTake={mySeat === null && !!info.seat.player?.isBot}
                />
              </div>
            );
          })}

          {/* Resultado de la mano */}
          {result && (
            <div className="anim-pop absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
              <div className="flex flex-col items-center gap-1 whitespace-nowrap rounded-[var(--radius-xl)] border border-ivory/10 bg-ink-900 px-6 py-4 text-center shadow-[var(--shadow-lift)]">
                <span className="label">Fin de la mano</span>
                <span className={`font-display text-xl font-bold sm:text-2xl ${result.winnerTeam === 0 ? 'text-team0' : 'text-team1'}`}>
                  {mySeat === null ? `Gana ${teamName(result.winnerTeam, null)}` : result.winnerTeam === myTeam ? 'Ganamos la mano' : 'Ganaron la mano'}
                </span>
                <span className="text-sm text-ivory/65">
                  <b className="text-gold">+{result.points}</b>
                  {result.reason === 'noQuiero' ? ' · no quisieron' : result.reason === 'mazo' ? ' · se fueron al mazo' : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Zona del jugador local ─────────────────────────

/** Estilo de cada botón según su importancia: una sola acción principal por vez. */
function actionStyle(a: Action): { cls: string; accent?: string } {
  switch (a.type) {
    case 'quiero':
      return { cls: 'btn-primary' };
    case 'noQuiero':
    case 'achico':
      return { cls: 'btn-secondary' };
    case 'truco':
      return { cls: 'btn-accent', accent: 'var(--color-truco)' };
    case 'envido':
      return { cls: 'btn-accent', accent: 'var(--color-envido)' };
    case 'flor':
    case 'contraflor':
    case 'contraflorResto':
      return { cls: 'btn-accent', accent: 'var(--color-flor)' };
    default:
      return { cls: 'btn-ghost' };
  }
}

function ActionBar({ g, onAction, align = 'center' }: { g: PlayerView; onAction: (a: Action) => void; align?: 'center' | 'start' }) {
  const [confirmMazo, setConfirmMazo] = useState(false);
  useEffect(() => {
    if (!confirmMazo) return;
    const t = setTimeout(() => setConfirmMazo(false), 3000);
    return () => clearTimeout(t);
  }, [confirmMazo]);
  const actions = g.legal.filter((a) => a.type !== 'play');
  if (!actions.length) return null;
  const responses = actions.filter((a) => a.type === 'quiero' || a.type === 'noQuiero');
  const bets = actions.filter((a) => a.type !== 'quiero' && a.type !== 'noQuiero' && a.type !== 'mazo');
  const mazo = actions.find((a) => a.type === 'mazo');
  const button = (a: Action) => {
    const { cls, accent } = actionStyle(a);
    return (
      <button
        key={a.type + ('kind' in a ? a.kind : '')}
        onClick={() => onAction(a)}
        className={`btn ${cls} anim-pop`}
        style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
      >
        {actionLabel(a, g)}
      </button>
    );
  };
  return (
    <div className={`flex flex-wrap items-center gap-2 ${align === 'start' ? 'justify-start' : 'justify-center'}`}>
      {responses.map(button)}
      {responses.length > 0 && bets.length > 0 && <span className="mx-1 hidden h-6 w-px bg-ivory/15 sm:block" />}
      {bets.map(button)}
      {mazo && (
        <button onClick={() => (confirmMazo ? onAction(mazo) : setConfirmMazo(true))} className={`btn btn-sm ${confirmMazo ? 'btn-danger' : 'btn-ghost'}`}>
          {confirmMazo ? 'Confirmar mazo' : 'Irse al mazo'}
        </button>
      )}
    </div>
  );
}

/** Aviso de estado: canto pendiente (quién, qué y cuánto tiempo queda) o de quién es el turno. */
function StatusLine({
  room,
  g,
  mustRespond,
  myTurn,
  secsLeft,
  fraction,
  hint,
}: {
  room: RoomView;
  g: PlayerView;
  mustRespond: boolean;
  myTurn: boolean;
  secsLeft: number | null;
  fraction: number | null;
  hint: string | null;
}) {
  const name = (s: number) => (s === room.me.seat ? 'Vos' : (room.seats[s]?.player?.name ?? `Lugar ${s + 1}`));
  const caller =
    g.pending === 'flor'
      ? g.flor.calls[g.flor.calls.length - 1].seat
      : g.pending === 'envido'
        ? g.envido.calls[g.envido.calls.length - 1].seat
        : g.pending === 'truco'
          ? g.truco.pending!.seat
          : null;
  const accent = g.pending === 'truco' ? 'text-truco' : g.pending === 'envido' ? 'text-envido' : 'text-flor';

  if (g.phase === 'playing' && caller !== null) {
    return (
      <div
        className={`anim-pop flex max-w-full items-center gap-3 rounded-full py-1.5 pl-1.5 pr-4 ${
          mustRespond ? 'bg-ink-850 shadow-[var(--shadow-lift)] ring-1 ring-gold/50' : 'bg-ink-900/70 ring-1 ring-ivory/10'
        }`}
        role="status"
      >
        <Avatar seat={room.seats[caller]} size={30} active={false} fraction={null} />
        <span className="truncate text-[13px] text-ivory/70">
          <b className="font-semibold text-ivory">{name(caller)}</b> {caller === room.me.seat ? 'cantaste' : 'cantó'}
        </span>
        <span className={`whitespace-nowrap text-[15px] font-extrabold uppercase tracking-wide ${accent}`}>{pendingText(g)}</span>
        {!mustRespond && <span className="hidden whitespace-nowrap text-[12px] text-ivory/45 sm:inline">· esperando respuesta</span>}
        {secsLeft !== null && (
          <span className="flex items-center gap-1.5 text-[13px] font-bold tabular-nums text-gold">
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{ background: `conic-gradient(var(--color-gold) ${(fraction ?? 0) * 360}deg, rgba(243,236,219,0.15) 0)` }}
              aria-hidden
            />
            {secsLeft}s
          </span>
        )}
      </div>
    );
  }
  const text =
    g.phase === 'gameOver'
      ? 'Partida terminada'
      : g.phase === 'handOver'
        ? 'Repartiendo la próxima mano…'
        : myTurn
          ? (hint ?? 'Tu turno: elegí una carta')
          : `Juega ${name(g.turn)}`;
  return (
    <div
      className={`flex h-9 items-center gap-3 rounded-full px-4 text-[13px] font-semibold transition-colors ${
        myTurn ? 'bg-gold text-ink-950 shadow-[0_6px_20px_rgba(216,181,106,0.3)]' : 'bg-ink-900/70 text-ivory/70 ring-1 ring-ivory/10'
      }`}
      role="status"
    >
      {text}
      {myTurn && secsLeft !== null && <span className="tabular-nums opacity-75">{secsLeft}s</span>}
    </div>
  );
}

// ───────────────────────── Pantalla de juego ─────────────────────────

export function GameTable({ room }: { room: RoomView }) {
  const g = room.game!;
  const connected = useStore((s) => s.connected);
  const deadlineAt = useStore((s) => s.deadlineAt);
  const now = useNow(deadlineAt !== null);
  const docked = useMedia('(min-width: 1100px)');
  const wideScore = useMedia('(min-width: 1280px), (min-width: 760px) and (max-width: 1099px)');
  const coarse = useMedia('(pointer: coarse)');
  const canHover = useMedia('(hover: hover) and (pointer: fine)');
  const dock = useDock(canHover);
  // Con mouse y pantalla ancha, los botones van al costado de la mano: así la lupa de las cartas nunca los tapa.
  const sideActions = useMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const bubbles = useBubbles(g.events, room.chat, (id) => {
    const i = room.seats.findIndex((x) => x.player?.id === id);
    return i >= 0 ? i : null;
  });
  const mySeat = room.me.seat;
  const myTeam: Team | null = mySeat !== null ? ((mySeat % 2) as Team) : null;
  const isHost = room.hostId === room.me.id;
  const secsLeft = deadlineAt ? Math.max(0, Math.ceil((deadlineAt - now) / 1000)) : null;
  const fraction = deadlineAt && g.rules.turnTimeSec ? clamp((deadlineAt - now) / (g.rules.turnTimeSec * 1000), 0, 1) : null;
  const lastChatId = room.chat.length ? room.chat[room.chat.length - 1].id : 0;
  const [seenChat, setSeenChat] = useState(lastChatId);
  const teamMsgs = room.teamChat ?? [];
  const lastTeamId = teamMsgs.length ? teamMsgs[teamMsgs.length - 1].id : '';
  const [seenTeam, setSeenTeam] = useState(lastTeamId);
  const seenTeamIdx = teamMsgs.findIndex((m) => m.id === seenTeam);
  const newChat =
    !docked &&
    !drawerOpen &&
    (room.chat.some((m) => m.id > seenChat && !m.system && m.playerId !== room.me.id) ||
      teamMsgs.slice(seenTeamIdx + 1).some((m) => m.senderId !== room.me.id));
  const muted = useMuted();
  useAmbientSound();

  useEffect(() => {
    if (drawerOpen || docked) {
      setSeenChat(lastChatId);
      setSeenTeam(lastTeamId);
    }
  }, [drawerOpen, docked, lastChatId, lastTeamId]);

  const activeSeats = useMemo(() => {
    if (g.phase !== 'playing') return [] as number[];
    if (g.respondingTeam !== null) return room.seats.filter((s) => s.team === g.respondingTeam).map((s) => s.index);
    return [g.turn];
  }, [g.phase, g.respondingTeam, g.turn, room.seats]);

  const seats: SeatInfo[] = room.seats.map((seat) => ({
    seat,
    relation: mySeat === null ? 'equipo' : seat.index === mySeat ? 'yo' : seat.team === myTeam ? 'compañero' : 'rival',
    active: activeSeats.includes(seat.index),
    isMano: g.mano === seat.index,
    bubble: bubbles.find((b) => b.seat === seat.index),
    cardsLeft: g.cardsLeft[seat.index] ?? 0,
  }));
  const me = mySeat !== null ? seats[mySeat] : null;

  const myTurn = mySeat !== null && g.legal.some((a) => a.type === 'play');
  const mustRespond = mySeat !== null && g.respondingTeam === myTeam && g.legal.length > 0;

  // La selección se descarta cuando cambia el turno o la mano.
  useEffect(() => setSelected(null), [myTurn, g.handNumber]);

  useEffect(() => {
    document.title = myTurn || mustRespond ? '¡Te toca! · Truco' : 'Truco Argentino';
    return () => {
      document.title = 'Truco Argentino';
    };
  }, [myTurn, mustRespond]);

  const onAction = (a: Action) => {
    setSelected(null);
    sendAction(a);
  };
  const onCard = (id: string) => {
    // En pantallas táctiles, el primer toque selecciona y el segundo juega (evita jugadas por error).
    if (coarse && selected !== id) return setSelected(id);
    onAction({ type: 'play', cardId: id });
  };
  const cardDrag = useCardDrag((id) => {
    setSelected(null);
    onAction({ type: 'play', cardId: id });
  });

  return (
    <div className="flex h-full overflow-hidden">
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="flex shrink-0 items-center gap-2 px-3 pt-3 sm:gap-3 sm:px-4">
          <button
            onClick={() => (confirm('¿Salir de la partida? Un bot ocupará tu lugar.') ? leaveRoom() : null)}
            className="icon-btn"
            aria-label="Salir de la partida"
            title="Salir"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button onClick={() => setRulesOpen(true)} className="icon-btn" aria-label="Ver reglamento" title="Reglamento">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4z" />
              <path d="M5 17a3 3 0 013-3h11M9 8h6" />
            </svg>
          </button>
          <button
            onClick={() => setMuted(!muted)}
            className="icon-btn"
            aria-label={muted ? 'Activar el sonido de fondo' : 'Silenciar el sonido de fondo'}
            aria-pressed={!muted}
            title={muted ? 'Activar sonido' : 'Silenciar'}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
            </svg>
          </button>
          <div className="hidden min-w-0 flex-1 md:block">
            <div className="truncate font-display text-lg font-bold leading-tight text-ivory">{room.name}</div>
            <div className="truncate text-[12px] text-ivory/45">
              {MODE_LABEL[room.mode]} · a {g.rules.targetScore} · {g.rules.flor ? 'con flor' : 'sin flor'} · sala {room.code}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ScoreBoard score={g.score} rules={g.rules} mySeat={mySeat} compact={!wideScore} />
            {!docked && (
              <button onClick={() => setDrawerOpen(true)} className="icon-btn relative" aria-label="Jugadas y chat" title="Jugadas y chat">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 5h16v11H8l-4 4V5z" />
                </svg>
                {newChat && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-ink-900 bg-jade" />}
              </button>
            )}
          </div>
        </header>

        {!connected && (
          <div className="anim-pop absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-full bg-danger px-4 py-1.5 text-sm font-semibold text-ink-950 shadow-[var(--shadow-lift)]">
            Reconectando…
          </div>
        )}

        <TableStage room={room} g={g} seats={seats} fraction={fraction} secsLeft={secsLeft} dropHint={cardDrag.drag ? (cardDrag.drag.over ? 'over' : 'near') : null} />

        {/* Zona del jugador local: estado, acciones y cartas en filas separadas */}
        <section className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),16px)] sm:px-4" aria-label="Tu zona">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-2.5">
            {!(sideActions && me) && (
              <div className="flex min-h-11 w-full flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2 md:hidden">
                  <TrickDots g={g} size={20} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ivory/50">vale {g.truco.level}</span>
                  {g.myEnvido !== null && <span className="text-[11px] font-semibold text-envido sm:hidden">· envido {g.myEnvido}</span>}
                  {g.myFlor !== null && <span className="text-[11px] font-semibold text-flor sm:hidden">· flor {g.myFlor}</span>}
                </div>
                <StatusLine
                  room={room}
                  g={g}
                  mustRespond={mustRespond}
                  myTurn={myTurn}
                  secsLeft={secsLeft}
                  fraction={fraction}
                  hint={coarse && selected ? 'Tocá de nuevo para jugarla' : null}
                />
                {mySeat !== null && <ActionBar g={g} onAction={onAction} />}
              </div>
            )}

            {me ? (
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-end gap-3">
                {/* Cartel propio (y, con botones al costado, el estado arriba) */}
                <div className={`relative flex justify-end ${sideActions ? 'flex-col items-end gap-3' : ''}`}>
                  {sideActions && (
                    <StatusLine
                      room={room}
                      g={g}
                      mustRespond={mustRespond}
                      myTurn={myTurn}
                      secsLeft={secsLeft}
                      fraction={fraction}
                      hint={null}
                    />
                  )}
                  {me.bubble && <SpeechBubble bubble={me.bubble} dir="up" />}
                  <div className={`hidden items-center gap-2.5 rounded-full bg-ink-900/80 py-1.5 pl-1.5 pr-4 ring-1 sm:flex ${me.active ? 'ring-gold/70' : 'ring-ivory/10'}`}>
                    <Avatar seat={me.seat} size={36} active={me.active} fraction={fraction} />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[13px] font-semibold">Vos</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ivory/50">
                        <span className={`h-1.5 w-1.5 rounded-full ${me.seat.team === 0 ? 'bg-team0' : 'bg-team1'}`} />
                        {teamName(me.seat.team, mySeat)}
                      </span>
                    </div>
                    {me.isMano && <ManoChip />}
                  </div>
                  {me.isMano && <ManoChip className="sm:hidden" />}
                </div>

                {/* Mano propia */}
                <div ref={dock.ref} {...dock.handlers} className={`relative flex items-end justify-center ${canHover ? 'dock' : ''}`} style={{ minHeight: `calc(${HAND_CARD_W} * 1.55)` }}>
                  {g.myHand.map((c, i) => {
                    const playable = g.legal.some((a) => a.type === 'play' && a.cardId === c.id);
                    const mid = (g.myHand.length - 1) / 2;
                    const dragging = cardDrag.drag?.id === c.id ? cardDrag.drag : null;
                    const zoom = cardDrag.drag ? 1 : (dock.scales[i] ?? 1);
                    return (
                      <div
                        key={`${g.handNumber}-${c.id}`}
                        className="-ml-2 first:ml-0 sm:ml-1 sm:first:ml-0"
                        style={{
                          transform: dragging
                            ? `translate(${dragging.dx}px, ${dragging.dy}px) rotate(${dragging.dx * 0.03}deg) scale(1.05)`
                            : `rotate(${(i - mid) * 4}deg) translateY(${Math.abs(i - mid) * 4}px)`,
                          transformOrigin: 'bottom center',
                          zIndex: dragging ? 60 : Math.round(zoom * 10),
                          transition: dragging ? 'none' : 'transform 220ms var(--ease-out)',
                          position: 'relative',
                          cursor: dragging ? 'grabbing' : undefined,
                          touchAction: playable ? 'none' : undefined,
                        }}
                        {...cardDrag.bind(c.id, playable)}
                      >
                        {/* Lupa tipo dock: la carta crece desde abajo y corre a las vecinas */}
                        <div
                          style={{ transform: `scale(${zoom})`, transformOrigin: 'bottom center', marginInline: `calc(${HAND_CARD_W} * ${((zoom - 1) * 0.5).toFixed(3)})` }}
                          className="transition-[transform,margin] duration-150 ease-out"
                        >
                          <div className="anim-deal" style={{ animationDelay: `${i * 140}ms` }}>
                            <SpanishCard
                              card={c}
                              state={!playable ? 'idle' : selected === c.id ? 'selected' : 'playable'}
                              onClick={() => onCard(c.id)}
                              style={{ width: HAND_CARD_W }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Botones (al costado en pantallas anchas) y tantos propios (en celular van en la fila de estado) */}
                <div className="hidden flex-col items-start gap-2.5 sm:flex">
                  {sideActions && <ActionBar g={g} onAction={onAction} align="start" />}
                  {g.myEnvido !== null && (
                    <span className="whitespace-nowrap rounded-full bg-envido/12 px-2.5 py-1 text-[12px] font-semibold text-envido ring-1 ring-envido/25">
                      Envido <b className="tabular-nums">{g.myEnvido}</b>
                    </span>
                  )}
                  {g.myFlor !== null && (
                    <span className="whitespace-nowrap rounded-full bg-flor/12 px-2.5 py-1 text-[12px] font-semibold text-flor ring-1 ring-flor/25">
                      Flor <b className="tabular-nums">{g.myFlor}</b>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-full bg-ink-900/70 px-4 py-2.5 text-sm text-ivory/65 ring-1 ring-ivory/10">Estás mirando la partida. Podés tomar el lugar de un bot.</div>
            )}
          </div>
        </section>
      </main>

      {/* Panel lateral: fijo en escritorio, desplegable en pantallas chicas */}
      {docked ? (
        <aside className="flex h-full w-[320px] shrink-0 flex-col py-3 pr-3 xl:w-[340px] 2xl:w-[380px]">
          <ChatPanel room={room} showLog className="h-full" />
        </aside>
      ) : (
        drawerOpen && (
          <div className="anim-fade fixed inset-0 z-50 flex justify-end bg-ink-950/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}>
            <div className="anim-drawer flex h-full w-full max-w-[400px] flex-col p-3" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex justify-end">
                <button onClick={() => setDrawerOpen(false)} className="btn btn-secondary btn-sm">
                  Cerrar
                </button>
              </div>
              <ChatPanel room={room} showLog className="min-h-0 flex-1" />
            </div>
          </div>
        )
      )}

      {rulesOpen && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink-950/65 p-4 backdrop-blur-sm" onClick={() => setRulesOpen(false)}>
          <div className="panel anim-pop w-full max-w-lg rounded-[var(--radius-xl)] p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-display text-2xl font-bold">Reglamento activo</h2>
            <RulesSummary rules={g.rules} />
            <button onClick={() => setRulesOpen(false)} className="btn btn-secondary mt-6 w-full">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {g.phase === 'gameOver' && g.winner !== null && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
          <div className="panel anim-pop w-full max-w-md rounded-[var(--radius-xl)] p-8 text-center">
            <span className="label">Partida terminada</span>
            <h2 className={`mt-2 font-display text-4xl font-black ${myTeam === null || g.winner === myTeam ? 'text-gold' : 'text-ivory'}`}>
              {myTeam === null ? `Ganó el ${teamName(g.winner, null)}` : g.winner === myTeam ? '¡Ganamos!' : 'Perdimos'}
            </h2>
            <p className="mt-2 text-ivory/60">
              {room.seats
                .filter((s) => s.team === g.winner)
                .map((s) => s.player?.name)
                .join(' · ')}
            </p>
            <div className="mt-6 flex items-center justify-center gap-4 text-5xl font-black tabular-nums">
              <span className={g.winner === 0 ? 'text-team0' : 'text-team1'}>{g.score[g.winner]}</span>
              <span className="text-2xl text-ivory/30">a</span>
              <span className="text-ivory/60">{g.score[g.winner === 0 ? 1 : 0]}</span>
            </div>
            <div className="mt-8 flex flex-col gap-2">
              {isHost ? (
                <button onClick={rematch} className="btn btn-gold btn-lg w-full">
                  Volver a la sala (revancha)
                </button>
              ) : (
                <p className="text-sm text-ivory/55">El anfitrión puede volver a la sala para la revancha.</p>
              )}
              <button onClick={leaveRoom} className="btn btn-secondary w-full">
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
