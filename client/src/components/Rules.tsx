import { describeRules } from '@truco/shared';
import type { FaltaEnvidoMode, RulesConfig } from '@truco/shared';

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-xl bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            value === o.value ? 'bg-gold text-felt-950 shadow' : 'text-white/70 hover:text-white disabled:hover:text-white/70'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
export { Segmented };

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-3 py-1.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-white/50">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-gold' : 'bg-white/20'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function RulesForm({ rules, onChange, disabled }: { rules: RulesConfig; onChange: (patch: Partial<RulesConfig>) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/60">Partida a</div>
        <Segmented
          disabled={disabled}
          value={rules.targetScore}
          onChange={(targetScore) => onChange({ targetScore })}
          options={[
            { value: 15, label: '15' },
            { value: 24, label: '24' },
            { value: 30, label: '30' },
          ]}
        />
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/60">Falta envido</div>
        <select
          disabled={disabled}
          value={rules.faltaEnvido}
          onChange={(e) => onChange({ faltaEnvido: e.target.value as FaltaEnvidoMode })}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
        >
          <option value="buenasMalas">Tradicional: en malas gana el partido, en buenas lo que falta</option>
          <option value="faltaLider">Lo que le falta al que va ganando</option>
          <option value="partidoCompleto">Siempre gana el partido</option>
        </select>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/60">Tiempo por jugada</div>
        <Segmented
          disabled={disabled}
          value={rules.turnTimeSec}
          onChange={(turnTimeSec) => onChange({ turnTimeSec })}
          options={[
            { value: 0, label: 'Libre' },
            { value: 30, label: '30s' },
            { value: 60, label: '60s' },
            { value: 90, label: '90s' },
          ]}
        />
      </div>
      <div className="divide-y divide-white/5">
        <Toggle disabled={disabled} checked={rules.flor} onChange={(flor) => onChange({ flor })} label="Jugar con flor" hint="Tres cartas del mismo palo. Anula el envido." />
        <Toggle
          disabled={disabled || !rules.flor}
          checked={rules.contraflor}
          onChange={(contraflor) => onChange({ contraflor })}
          label="Contraflor y contraflor al resto"
        />
        <Toggle disabled={disabled} checked={rules.envidoEnvido} onChange={(envidoEnvido) => onChange({ envidoEnvido })} label='Permitir "envido envido"' />
        <Toggle
          disabled={disabled}
          checked={rules.mazoPenaltyFirstRound}
          onChange={(mazoPenaltyFirstRound) => onChange({ mazoPenaltyFirstRound })}
          label="Mazo en primera da 1 punto extra"
          hint="Si nadie cantó envido ni flor."
        />
      </div>
    </div>
  );
}

export function RulesSummary({ rules }: { rules: RulesConfig }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
      {describeRules(rules).map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-white/55">{r.label}</dt>
          <dd className="font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RuleChips({ rules }: { rules: RulesConfig }) {
  return (
    <span className="flex flex-wrap gap-1">
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">a {rules.targetScore}</span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{rules.flor ? 'con flor' : 'sin flor'}</span>
      {rules.turnTimeSec > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{rules.turnTimeSec}s</span>}
    </span>
  );
}
