/** Petits composants partagés : barre de PV, progression, zone de texte copiable, liste des combattants. */
import { useRef, useState } from 'react';
import { fmtInt } from '../model/format.js';
import type { MapFighter, Progress } from '../model/types.js';
import { Icon } from './Icon.js';
import { TokenBadge } from './Token.js';

export function HpBar({ hp, maxHp, shield = 0 }: { hp: number; maxHp: number; shield?: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const cls = pct <= 0.35 ? 'low' : pct <= 0.65 ? 'mid' : '';
  return (
    <div className="hpbar" aria-label={`${fmtInt(hp)} PV sur ${fmtInt(maxHp)}`}>
      <span>
        {fmtInt(hp)}
        <span className="muted"> / {fmtInt(maxHp)}</span>
        {shield > 0 ? <span className="muted hp-shield"> +{fmtInt(shield)} bouclier</span> : null}
      </span>
      <div className="hpbar-track">
        <div className={`hpbar-fill ${cls}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

export function ProgressView({ progress, onCancel, startedAt }: { progress: Progress; onCancel?: () => void; startedAt?: number }) {
  const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;
  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="row-between">
        <span className="small">
          {progress.phase}
          {elapsed !== null && elapsed > 0 ? <span className="muted"> — {elapsed} s</span> : null}
        </span>
        {onCancel ? (
          <button type="button" id="btn-annuler-calcul" className="btn btn-small" onClick={onCancel}>
            <Icon name="x" size={14} /> Annuler
          </button>
        ) : null}
      </div>
      <div className="progress-track">
        {progress.fraction === null ? (
          <div className="progress-bar indeterminate" />
        ) : (
          <div className="progress-bar" style={{ width: `${Math.max(3, progress.fraction * 100)}%` }} />
        )}
      </div>
    </div>
  );
}

/** Texte à copier (export sans téléchargement) : bouton « Copier » (presse-papiers) avec repli par sélection. */
export function CopyBox({ id, text, rows = 12, label }: { id: string; text: string; rows?: number; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState('');
  const copy = async () => {
    const ta = ref.current;
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copié dans le presse-papiers.');
    } catch {
      if (ta) {
        ta.focus();
        ta.select();
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
        setMsg(ok ? 'Copié.' : 'Texte sélectionné : Ctrl+C (ou ⌘+C) pour copier.');
      }
    }
  };
  return (
    <div className="stack">
      <label className="field" htmlFor={id}>
        {label}
        <textarea id={id} ref={ref} readOnly rows={rows} value={text} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="row">
        <button type="button" className="btn btn-small" id={`${id}-copier`} onClick={copy}>
          <Icon name="copy" size={15} /> Copier
        </button>
        <span className="small muted" role="status">
          {msg}
        </span>
      </div>
    </div>
  );
}

/** Liste des combattants avec PV et états (ordre donné). */
export function FighterList({ fighters, onSelect, selectedId }: { fighters: MapFighter[]; onSelect?: (f: MapFighter) => void; selectedId?: number | null }) {
  return (
    <ul className="fighter-list">
      {fighters.map((f) => (
        <li
          key={f.id}
          className={`fighter-row${f.current ? ' current' : ''}${f.alive ? '' : ' dead'}`}
          style={selectedId === f.id ? { borderColor: 'var(--accent)' } : undefined}
          onClick={onSelect ? () => onSelect(f) : undefined}
        >
          <TokenBadge fighter={f} />
          <div style={{ minWidth: 0 }}>
            <div className="name">
              {f.name}
              {f.current ? <span className="muted small"> — joue</span> : null}
              {f.waiting ? <span className="muted small"> — en attente (152)</span> : null}
            </div>
            <div className="row" style={{ gap: 4 }}>
              {!f.alive ? <span className="chip">mort</span> : null}
              {f.inSpikes ? <span className="chip chip-spike">dans les pics</span> : null}
              {f.vulnerable ? <span className="chip chip-vuln">Vulnérable ×2</span> : null}
              {f.unshakable ? <span className="chip chip-unshak">Inébranlable</span> : null}
              {f.invulnerable ? <span className="chip chip-invul">Invulnérable</span> : null}
              {f.alive && f.cell >= 0 ? <span className="chip mono">case {f.cell}</span> : null}
            </div>
          </div>
          <HpBar hp={f.hp} maxHp={f.maxHp} shield={f.shield} />
        </li>
      ))}
    </ul>
  );
}
