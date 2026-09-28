/**
 * Pics (ETUDE §9.13, notes 30 §2) : les comportements ÉMERGENT des données des sorts 30390 (80489 pose, 80492 entrée
 * par l'aura 1091, 81026 début de tour par le glyphe 401), des passifs 30694 / 30639 → 30700 → 30701 (sortie) et du
 * script de la Mama 30430 → 30723 (invulnérabilité levée 1 tour par EON5902), interprétés par le moteur (marks.ts,
 * triggerProcessing.ts, turns.ts) — aucun crochet de test.
 */
import { describe, expect, it } from 'vitest';
import type { ConfigOverrides } from '../src/data/index.js';
import {
  addFighter,
  applyDamage,
  castSpell,
  moveAlongPath,
  nextTurn,
  resolveSpell,
  type Fighter,
  type FightState,
} from '../src/engine/index.js';
import { M, SL } from './helpers/engineSetup.js';
import { arena, damagesOf, mob, player, timeline } from './helpers/fightSetup.js';

const MIN = { rollMode: 'min', critMode: 'never' } as const;

/** Déplace un combattant (marche sans PM) le long de ``path``. */
function walk(s: FightState, f: Fighter, path: number[]): void {
  const r = moveAlongPath(s, f.id, path, { ignoreMp: true });
  expect(r.ok, r.reason).toBe(true);
}

/** Multiplicateurs 1163 portés (valeurs) et sort d'origine. */
function mults(f: Fighter): Array<[number, number]> {
  return f.buffs.filter((b) => b.kind === 'multiplier').map((b) => [b.spellId, b.value]);
}

/**
 * Mama avec le seul script d'invulnérabilité (30723 niv. 1 : état 56 + déclencheur EON5902), sans passe-tour ni
 * Faveur (son sort de départ complet la rend inamovible jusqu'au T7).
 */
function mamaInvulnerable(s: FightState, cell: number): Fighter {
  const mama = addFighter(s, { kind: 'monster', monsterId: M.mama }, cell);
  resolveSpell(s, mama, s.ctx.getSpell(81097), cell);
  expect(mama.invulnerable).toBe(true);
  return mama;
}

describe('T3 — Videur critique poussé dans les pics (aura réelle 1091)', () => {
  it('−2 000 à l’arrivée (aura) puis −7 904 (3 952 × 2) : 9 904 au total ; Vulnérable, ×2 d’aura', () => {
    const { s } = arena({ rng: { rollMode: 'min', critMode: 'always' } });
    const acro = player(s, 'acrobate', 314);
    for (const c of [286, 287, 315]) player(s, 'dompteur', c);
    const t1 = mob(s, M.troollibre, 242);
    mob(s, M.troollibre, 358);
    const hp0 = t1.hp;
    expect(castSpell(s, acro.id, SL.videur, 256).critical).toBe(true);
    expect(t1.cell).toBe(199);
    expect(damagesOf(s, t1.id)).toEqual([2000, 7904]);
    expect(hp0 - t1.hp).toBe(9904);
    expect(t1.hasState(5902) && t1.hasState(5994)).toBe(true);
    expect(mults(t1)).toEqual([[30390, 200]]);
    expect(s.marks.find((m) => m.type === 'aura')!.occupants).toEqual([t1.id]);
  });

  it('spikes.auraAppliesMidSpell = false : l’aura s’applique après le sort (3 952 puis 2 000)', () => {
    const { s } = arena({ rng: { rollMode: 'min', critMode: 'always' }, spikes: { auraAppliesMidSpell: false } });
    const acro = player(s, 'acrobate', 314);
    for (const c of [286, 287, 315]) player(s, 'dompteur', c);
    const t1 = mob(s, M.troollibre, 242);
    castSpell(s, acro.id, SL.videur, 256);
    expect(damagesOf(s, t1.id)).toEqual([3952, 2000]);
  });
});

describe('T9 — début de tour dans les pics (glyphe 401 → 30390 niv. 3)', () => {
  it('monstre : 1 000 × 2 (1163 d’aura) = 2 000 ; un Trooll à ≤ 2 000 PV meurt au début de son tour', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 300);
    const t = mob(s, M.troollibre, 213);
    const t2 = mob(s, M.artroolleur, 387);
    timeline(s, [acro, t, t2]);
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: acro.id });
    walk(s, t, [199]);
    walk(s, t2, [402]);
    t2.hp = 2000;
    expect(damagesOf(s, t.id)).toEqual([2000]);
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: t.id });
    expect(damagesOf(s, t.id)).toEqual([2000, 2000]);
    // l'Artroolleur (2 000 PV) meurt au début de son tour ; nextTurn passe au tour global suivant
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: acro.id });
    expect(t2.alive).toBe(false);
    expect(s.turn).toBe(2);
    expect(s.log!.ofType('death').at(-1)).toMatchObject({ fighterId: t2.id, cause: 'damage' });
  });

  it('joueur : 1 000 (données, pas de ×2 dans les pics) ; spikes.playerTurnStartDamage = 2 000 ; playersDoubledInside', () => {
    for (const [over, entry, start] of [
      [{}, 2000, 1000],
      [{ spikes: { playerTurnStartDamage: 2000 } }, 2000, 2000],
      [{ spikes: { playersDoubledInside: true } }, 2000, 2000],
    ] as Array<[ConfigOverrides, number, number]>) {
      const { s } = arena({ rng: MIN, ...over });
      const p = player(s, 'dompteur', 213);
      timeline(s, [p]);
      walk(s, p, [199]);
      expect(p.hasState(5903) && p.hasState(5994)).toBe(true);
      nextTurn(s);
      expect(damagesOf(s, p.id)).toEqual([entry, start]);
    }
  });
});

describe('sortie des pics : passif 30700 → 30701 (×2 et Vulnérable pendant 1 tour du porteur)', () => {
  it('joueur : ×2 jusqu’au début de son prochain tour (Mitroollette de la Mama 4 278 → 8 556 → 4 278)', () => {
    const { s } = arena({ rng: MIN });
    const p = player(s, 'acrobate', 213);
    const mama = addFighter(s, { kind: 'monster', monsterId: M.mama }, 257);
    timeline(s, [p, mama]);
    nextTurn(s);
    walk(s, p, [199]);
    walk(s, p, [213]);
    // aura retirée (EOFF5903) → 30701 lancé par le porteur sur lui-même
    expect(p.hasState(5903)).toBe(false);
    expect(p.hasState(5994)).toBe(true);
    expect(mults(p)).toEqual([[30701, 200]]);
    const exitBuff = p.buffs.find((b) => b.spellId === 30701 && b.kind === 'multiplier')!;
    expect([exitBuff.casterId, exitBuff.duration]).toEqual([p.id, 1]);
    nextTurn(s); // tour de la Mama
    expect(castSpell(s, mama.id, 80497, p.cell).ok).toBe(true);
    expect(damagesOf(s, p.id).at(-1)).toBe(8556);
    nextTurn(s); // tour 2 du joueur : décompte → ×2 retiré (EOFF5994)
    expect(p.hasState(5994)).toBe(false);
    expect(mults(p)).toEqual([]);
    nextTurn(s);
    expect(castSpell(s, mama.id, 80497, p.cell).ok).toBe(true);
    expect(damagesOf(s, p.id).at(-1)).toBe(4278);
  });

  it('Trooll sorti des pics : ×2 jusqu’à son tour ; la Mama n’a pas le passif 30700 (aucun ×2 de sortie)', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 300);
    const t = mob(s, M.troollibre, 213);
    timeline(s, [acro, t]);
    nextTurn(s);
    walk(s, t, [199]);
    walk(s, t, [213]);
    expect(t.hasState(5994)).toBe(true);
    expect(mults(t)).toEqual([[30701, 200]]);
    nextTurn(s); // début du tour du Trooll : décompte de SES buffs → sortie expirée
    expect(mults(t)).toEqual([]);
    expect(t.hasState(5994)).toBe(false);

    const { s: s2 } = arena({ rng: MIN });
    const mama = mamaInvulnerable(s2, 213);
    walk(s2, mama, [199]);
    walk(s2, mama, [213]);
    expect(mama.hasState(5994)).toBe(false);
    expect(mults(mama)).toEqual([]);
  });
});

describe('ré-entrée, déplacement dans les pics, traversée (paramètres spikes.*)', () => {
  function reentry(over: ConfigOverrides): { s: FightState; t: Fighter; d: Fighter } {
    const { s } = arena({ rng: MIN, ...over });
    const d = player(s, 'dompteur', 241);
    const t = mob(s, M.troollibre, 213);
    walk(s, t, [199]);
    walk(s, t, [213]);
    walk(s, t, [199]);
    return { s, t, d };
  }

  it('stackExitAndInside = true : ré-entrée avant son tour → 4 000, puis ×4 (Frappe 976 → 3 904)', () => {
    const { s, t, d } = reentry({});
    expect(damagesOf(s, t.id)).toEqual([2000, 4000]);
    expect(mults(t)).toEqual([
      [30701, 200],
      [30390, 200],
    ]);
    castSpell(s, d.id, SL.frappe, t.cell);
    expect(damagesOf(s, t.id).at(-1)).toBe(3904);
  });

  it('stackExitAndInside = false : la vulnérabilité de sortie est retirée à la ré-entrée (2 000 puis ×2)', () => {
    const { s, t, d } = reentry({ spikes: { stackExitAndInside: false } });
    expect(damagesOf(s, t.id)).toEqual([2000, 2000]);
    expect(mults(t)).toEqual([[30390, 200]]);
    castSpell(s, d.id, SL.frappe, t.cell);
    expect(damagesOf(s, t.id).at(-1)).toBe(1952);
  });

  it('retriggerOnMoveInside : passer d’une case de pics à une autre ne redéclenche rien (défaut) ; sinon ré-application', () => {
    for (const [retrigger, exp] of [
      [false, [2000]],
      [true, [2000, 4000]],
    ] as const) {
      const { s } = arena({ rng: MIN, spikes: { retriggerOnMoveInside: retrigger } });
      const t = mob(s, M.troollibre, 213);
      walk(s, t, [199, 185]);
      expect(damagesOf(s, t.id)).toEqual(exp);
      expect(mults(t)).toEqual([[30390, 200]]);
      expect(t.buffs.filter((b) => b.kind === 'state' && b.stateId === 5902)).toHaveLength(1);
    }
  });

  it('traversée à pied (case de pics isolée 295) : entrée puis sortie ; triggerWhenWalkingThrough / walkThroughInterruptsMovement', () => {
    const { s } = arena({ rng: MIN });
    const p = player(s, 'dompteur', 310);
    walk(s, p, [295, 282]);
    expect(p.cell).toBe(282);
    expect(damagesOf(s, p.id)).toEqual([2000]);
    expect(p.hasState(5994) && !p.hasState(5903)).toBe(true);

    const { s: s2 } = arena({ rng: MIN, spikes: { triggerWhenWalkingThrough: false } });
    const p2 = player(s2, 'dompteur', 310);
    walk(s2, p2, [295, 282]);
    expect(damagesOf(s2, p2.id)).toEqual([]);
    expect(p2.hasState(5994)).toBe(false);

    const { s: s3 } = arena({ rng: MIN, spikes: { walkThroughInterruptsMovement: true } });
    const p3 = player(s3, 'dompteur', 310);
    const r = moveAlongPath(s3, p3.id, [295, 282], { ignoreMp: true });
    expect([r.ok, r.interrupted, r.steps, p3.cell]).toEqual([true, true, 1, 295]);
  });
});

describe('Mama : invulnérable (état 56), vulnérable 1 tour après son entrée dans les pics (EON5902 → 952)', () => {
  it('entrée : invulnérabilité levée AVANT les 2 000, ×2 ; au début de son tour elle redevient invulnérable (glyphe absorbé)', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 242);
    const mama = mamaInvulnerable(s, 213);
    timeline(s, [d, mama]);
    nextTurn(s);
    // hors des pics : 0 dommage
    expect(castSpell(s, d.id, SL.impact, mama.cell).ok).toBe(true);
    expect(s.log!.ofType('damage').filter((e) => e.targetId === mama.id).map((e) => [e.invulnerable, e.amount])).toEqual([[true, 0]]);
    // la Mama entre dans les pics : EON5902 → 81099 (952 désactive 56, 1 tour de la Mama)
    walk(s, mama, [199]);
    expect(mama.invulnerable).toBe(false);
    expect(damagesOf(s, mama.id).at(-1)).toBe(2000);
    expect(mama.hp).toBe(150000 - 2000);
    const lift = mama.buffs.find((b) => b.kind === 'disableState' && b.stateId === 56)!;
    expect([lift.casterId, lift.duration, lift.spellId]).toEqual([mama.id, 1, 30723]);
    expect(castSpell(s, d.id, SL.impact, mama.cell).ok).toBe(true);
    expect(damagesOf(s, mama.id).at(-1)).toBe(4148 * 2);
    // début du tour de la Mama : décompte (952 expire, 56 revient) AVANT le glyphe → 1 000 × 2 absorbés
    const hp = mama.hp;
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: mama.id });
    expect(mama.invulnerable).toBe(true);
    expect(mama.hp).toBe(hp);
    expect(s.log!.ofType('damage').at(-1)).toMatchObject({ targetId: mama.id, invulnerable: true });
  });

  it('boss.invulnerabilityBackBeforeTurnStartSpikes = false : glyphe avant le décompte → 2 000 subis', () => {
    const { s } = arena({ rng: MIN, boss: { invulnerabilityBackBeforeTurnStartSpikes: false } });
    const acro = player(s, 'acrobate', 300);
    const mama = mamaInvulnerable(s, 213);
    timeline(s, [acro, mama]);
    nextTurn(s);
    walk(s, mama, [199]);
    const hp = mama.hp;
    nextTurn(s);
    expect(hp - mama.hp).toBe(2000);
    expect(mama.invulnerable).toBe(true);
  });

  it('boss.invulnerabilityLiftedBeforeEntryDamage = false : les 2 000 d’entrée sont absorbés', () => {
    const { s } = arena({ rng: MIN, boss: { invulnerabilityLiftedBeforeEntryDamage: false } });
    const mama = mamaInvulnerable(s, 213);
    walk(s, mama, [199]);
    expect(mama.hp).toBe(150000);
    expect(mama.invulnerable).toBe(false);
    expect(mama.hasState(5902) && mama.hasState(5994)).toBe(true);
    expect(mults(mama)).toEqual([[30390, 200]]);
  });

  it('T11 : PV effectifs de la Mama dans les pics = 74 000 (2 000 à l’entrée puis ×2)', () => {
    for (const [raw, alive] of [
      [73999, true],
      [74000, false],
    ] as const) {
      const { s } = arena({ rng: MIN });
      const d = player(s, 'dompteur', 242);
      const mama = mamaInvulnerable(s, 213);
      walk(s, mama, [199]);
      expect(mama.hp).toBe(148000);
      applyDamage(s, d, mama, raw, { actionId: 100 });
      expect(mama.alive).toBe(alive);
    }
  });
});

describe('Voltige (échange) depuis les pics', () => {
  it('l’Acrobate sort (×2 de sortie jusqu’à son tour), la Mama entre (2 000, invulnérabilité levée) puis 3 538 × 2', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 213);
    const mama = mamaInvulnerable(s, 228);
    walk(s, acro, [199]);
    expect(castSpell(s, acro.id, SL.voltige, mama.cell).ok).toBe(true);
    expect([acro.cell, mama.cell]).toEqual([228, 199]);
    expect(damagesOf(s, mama.id)).toEqual([2000, 7076]);
    expect(acro.hasState(5994) && !acro.hasState(5903)).toBe(true);
    expect(mults(acro)).toEqual([[30701, 200]]);
    expect(mama.hasState(5902) && !mama.invulnerable).toBe(true);
  });

  it('une Mama Inébranlable (Troollement de Tambour) peut être échangée mais pas poussée', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 213);
    const mama = mamaInvulnerable(s, 228);
    const nitro = mob(s, M.nitrooll, 214);
    // Troollement de Tambour : échange avec un allié puis Inébranlable 1 tour sur cet allié
    expect(castSpell(s, nitro.id, 80496, mama.cell).ok).toBe(true);
    expect([mama.cell, nitro.cell]).toEqual([214, 228]);
    expect(mama.unshakable && !mama.canBePushed).toBe(true);
    walk(s, acro, [199]);
    expect(castSpell(s, acro.id, SL.voltige, mama.cell).ok).toBe(true);
    expect([acro.cell, mama.cell]).toEqual([214, 199]);
    expect(mama.hasState(5902) && !mama.invulnerable).toBe(true);
  });
});
