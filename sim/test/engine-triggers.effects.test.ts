/**
 * Déclencheurs et effets restants (ETUDE §9.10, N70 §3.5) : inventaire des jetons des données, D / DBA / X / XD / K /
 * CAP / TR# / EON / EOFF, sous-sorts déclenchés (792, 1017, 1018, 1160 ; cible additionnelle O), anti-boucle,
 * interception (765), renvois (1123, 1223), seuil (2872), désenvoûtement (132 : dispellable 1 contre 3), cumul
 * (maxStack), glyphe immédiat (1165, cadeau). Références SPEC §13 : T4 (jet 99), T12 et T13 dans l'arène complète.
 */
import { describe, expect, it } from 'vitest';
import type { ConfigOverrides } from '../src/data/index.js';
import {
  addFighter,
  applyDamage,
  castSpell,
  flushTriggers,
  moveAlongPath,
  nextTurn,
  parseTriggers,
  resolveSpell,
  Stat,
  type Fighter,
  type FightState,
} from '../src/engine/index.js';
import { cellInDirectionOrThrow, M, SL } from './helpers/engineSetup.js';
import { arena, castPassive, damagesOf, mob, player, timeline } from './helpers/fightSetup.js';

const MIN = { rollMode: 'min', critMode: 'never' } as const;

function walk(s: FightState, f: Fighter, path: number[]): void {
  const r = moveAlongPath(s, f.id, path, { ignoreMp: true });
  expect(r.ok, r.reason).toBe(true);
}

function dompteurState(s: FightState, d: Fighter): void {
  resolveSpell(s, d, s.ctx.getSpell(80911), d.cell);
}

describe('inventaire des déclencheurs des données', () => {
  it('tous les jetons des effets exécutés sont reconnus par le moteur', () => {
    const { s } = arena();
    const tokens = new Set<string>();
    const unknown = new Set<string>();
    for (const lvl of Object.values(s.ctx.data.spells)) {
      for (const e of [...lvl.effects, ...lvl.critEffects]) {
        if (!e.exec) continue;
        for (const t of e.triggers) tokens.add(t);
        for (const u of parseTriggers(e.triggers.filter((t) => t !== 'I')).unknown) unknown.add(u);
      }
    }
    expect([...unknown]).toEqual([]);
    expect([...tokens].sort()).toEqual(
      [
        'CAP', 'CD', 'D', 'DBA', 'EOFF5902', 'EOFF5903', 'EON5902', 'EON5906', 'EON5907', 'EON5908', 'EON5909',
        'EON5910', 'I', 'K', 'PD', 'TB', 'TE', 'TR30620', 'VA', 'X', 'XD', 'XPD',
      ].sort(),
    );
  });
});

describe('références SPEC §13 dans l’arène complète (pics, passifs)', () => {
  it('T4 : Grondement critique, jet 99, sur un Trooll Vulnérable (entré dans les pics) = 12 078', () => {
    const { s } = arena({ rng: { rollMode: 'random', critMode: 'always' } });
    const d = player(s, 'dompteur', 242);
    const t = mob(s, M.troollibre, 213);
    walk(s, t, [199]);
    s.rng.int = () => 99;
    expect(castSpell(s, d.id, SL.grondement, t.cell).critical).toBe(true);
    expect(damagesOf(s, t.id)).toEqual([2000, 12078]);
  });

  it('T12 : Relâchement de Fureur +100 sur la Mama entrée dans les pics : 35 014 (critique 41 114)', () => {
    for (const [critMode, exp] of [
      ['never', 35014],
      ['always', 41114],
    ] as const) {
      const { s } = arena({ rng: { rollMode: 'min', critMode } });
      const d = player(s, 'dompteur', 300, [SL.frappe, SL.relachement]);
      const mama = addFighter(s, { kind: 'monster', monsterId: M.mama }, 213);
      resolveSpell(s, mama, s.ctx.getSpell(81097), mama.cell);
      walk(s, mama, [199]);
      for (let k = 0; k < 4; k++) resolveSpell(s, d, s.ctx.getSpell(SL.relachementGrowth), d.cell);
      expect(castSpell(s, d.id, SL.relachement, mama.cell).ok).toBe(true);
      expect(damagesOf(s, mama.id)).toEqual([2000, exp]);
    }
  });

  it('T13 : Pulsation d’Énergie centrée sur 300 : 2 415 à chacun des 4 alliés des cases de départ', () => {
    const { s } = arena({ rng: MIN });
    const mag = player(s, 'magicien', cellInDirectionOrThrow(300, 0, 1));
    const allies = [286, 287, 314, 315].map((c) => player(s, 'dompteur', c));
    for (const a of allies) a.hp = 20000;
    expect(castSpell(s, mag.id, SL.pulsation, 300).ok).toBe(true);
    expect(allies.map((a) => a.hp - 20000)).toEqual([2415, 2415, 2415, 2415]);
  });
});

describe('états et caractéristiques d’archétype', () => {
  it('Pugnace (Inébranlable 1 tour) bloque la poussée du Nitrooll jusqu’au prochain tour de l’Acrobate', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 300);
    const nitro = mob(s, M.nitrooll, cellInDirectionOrThrow(300, 1, 2));
    timeline(s, [acro, nitro]);
    nextTurn(s);
    expect(castSpell(s, acro.id, SL.pugnace, acro.cell).ok).toBe(true);
    expect([acro.unshakable, acro.stat(Stat.RES_ALL)]).toEqual([true, 25]);
    nextTurn(s);
    expect(castSpell(s, nitro.id, 80493, acro.cell).ok).toBe(true);
    expect(acro.cell).toBe(300);
    expect(s.log!.ofType('moveBlocked').at(-1)).toMatchObject({ fighterId: acro.id, reason: 'inébranlable' });
    nextTurn(s); // tour 2 de l'Acrobate : Pugnace expire
    expect(acro.unshakable).toBe(false);
    nextTurn(s);
    expect(castSpell(s, nitro.id, 80493, acro.cell).ok).toBe(true);
    expect(acro.cell).not.toBe(300);
  });

  it('Prélèvement (érosion +15 %, vol de vie) puis Ombre Fracassante (30 % des PV érodés, non boostée) ; ×2 sur Vulnérable', () => {
    for (const vulnerable of [false, true]) {
      const { s } = arena({ rng: MIN });
      const d = player(s, 'dompteur', 242);
      const t = mob(s, M.troollibre, 213);
      if (vulnerable) resolveSpell(s, t, s.ctx.getSpell(SL.exitSpikes), t.cell);
      expect(castSpell(s, d.id, SL.prelevement, t.cell).ok).toBe(true);
      expect(t.stat(Stat.EROSION)).toBe(25);
      const hit = 2562 * (vulnerable ? 2 : 1);
      expect(damagesOf(s, t.id)).toEqual([hit]);
      const eroded = Math.floor((hit * 25) / 100);
      expect(t.erodedHp).toBe(eroded);
      expect(castSpell(s, d.id, 80506, t.cell).ok).toBe(true);
      expect(damagesOf(s, t.id).at(-1)).toBe(Math.trunc((eroded * 30) / 100) * (vulnerable ? 2 : 1));
    }
  });

  it('Coup de Sang : 20 % des PV courants du lanceur (6 000, 12 000 sur Vulnérable) puis −10 % de ses PV (sans érosion)', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 300);
    const a = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
    const b = mob(s, M.troollibre, cellInDirectionOrThrow(a.cell, 7, 1));
    resolveSpell(s, b, s.ctx.getSpell(SL.exitSpikes), b.cell);
    expect(castSpell(s, d.id, SL.coupDeSang, a.cell).ok).toBe(true);
    expect([damagesOf(s, a.id), damagesOf(s, b.id)]).toEqual([[6000], [12000]]);
    expect([d.hp, d.maxHp, d.erodedHp]).toEqual([27000, 30000, 0]);
  });

  it('Délivrance (132) : retire Patroolleur (dispellable 1), garde Vulnérable et les effets des pics (dispellable 3)', () => {
    const { s } = arena({ rng: MIN });
    const mag = player(s, 'magicien', 242);
    const t = mob(s, M.troollibre, 213);
    walk(s, t, [199]);
    expect(castSpell(s, t.id, 80485, t.cell).ok).toBe(true);
    expect([t.unshakable, t.stat(Stat.FINAL_DAMAGE)]).toEqual([true, 15]);
    expect(castSpell(s, mag.id, SL.delivrance, t.cell).ok).toBe(true);
    expect([t.unshakable, t.stat(Stat.FINAL_DAMAGE)]).toEqual([false, 0]);
    expect(t.hasState(5994) && t.hasState(5902)).toBe(true);
    expect(t.buffs.some((b) => b.kind === 'multiplier' && b.value === 200)).toBe(true);
  });
});

describe('buffs déclenchés et sous-sorts', () => {
  function poutchSetup(over: ConfigOverrides = {}, withState = true) {
    const { s } = arena({ rng: MIN, ...over });
    const acro = player(s, 'acrobate', 286);
    const d = player(s, 'dompteur', 300);
    if (withState) dompteurState(s, d);
    const pc = cellInDirectionOrThrow(300, 1, 3);
    const poutch = addFighter(s, { kind: 'monster', monsterId: M.poutch, team: 'players', summonerId: acro.id }, pc);
    castPassive(s, poutch);
    const t = mob(s, M.troollibre, cellInDirectionOrThrow(pc, 1, 2));
    return { s, acro, d, poutch, t };
  }

  it('Poutch : ×50 % sur les dommages d’un allié (DBA) ; frappé par un Dompteur (5899, cible additionnelle O), renvoie 50 % des dommages initiaux aux ennemis à 1–2 cases', () => {
    const { s, d, poutch, t } = poutchSetup();
    expect(castSpell(s, d.id, SL.grondement, poutch.cell).ok).toBe(true);
    expect(damagesOf(s, poutch.id)).toEqual([2501]);
    expect(damagesOf(s, t.id)).toEqual([2501]);
    expect(s.log!.ofType('triggered').some((e) => e.carrierId === poutch.id && e.token === 'D')).toBe(true);
  });

  it('Poutch : renvoi ×2 sur un ennemi Vulnérable ; aucun renvoi si l’attaquant n’a pas l’état Dompteur', () => {
    const v = poutchSetup();
    resolveSpell(v.s, v.t, v.s.ctx.getSpell(SL.exitSpikes), v.t.cell);
    castSpell(v.s, v.d.id, SL.grondement, v.poutch.cell);
    expect(damagesOf(v.s, v.t.id)).toEqual([5002]);
    const n = poutchSetup({}, false);
    castSpell(n.s, n.d.id, SL.grondement, n.poutch.cell);
    expect(damagesOf(n.s, n.t.id)).toEqual([]);
  });

  it('Un pour un : ×50 % subi et 100 % des dommages finaux renvoyés à l’attaquant (1017 → 1223)', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 300, [SL.frappe, 80847]);
    const art = mob(s, M.artroolleur, cellInDirectionOrThrow(300, 3, 4));
    expect(castSpell(s, acro.id, 80847, acro.cell).ok).toBe(true);
    castSpell(s, art.id, SL.tirArtroollerie, acro.cell);
    expect(damagesOf(s, acro.id)).toEqual([868]);
    expect(damagesOf(s, art.id)).toEqual([868]);
  });

  it('Immortalité du Courageux : l’Acrobate intercepte (765) les dommages destinés aux alliés proches de la cible', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 300, [SL.frappe, 80844]);
    const d = player(s, 'dompteur', cellInDirectionOrThrow(300, 1, 4));
    const art = mob(s, M.artroolleur, cellInDirectionOrThrow(d.cell, 3, 4));
    expect(castSpell(s, acro.id, 80844, d.cell).ok).toBe(true);
    expect(acro.cell).toBe(cellInDirectionOrThrow(300, 1, 3));
    castSpell(s, art.id, SL.tirArtroollerie, d.cell);
    expect(damagesOf(s, d.id)).toEqual([]);
    expect(damagesOf(s, acro.id)).toEqual([1736]);
    expect(s.log!.ofType('intercepted')).toHaveLength(1);
  });

  it('Malédiction Collatérale : renvois en chaîne, anti-boucle (un buff ne se redéclenche pas sur son propre effet) ; chaînes désactivables', () => {
    for (const [chains, t1Exp, t2Exp] of [
      [true, [5002, 1250], [2501]],
      [false, [5002], [2501]],
    ] as const) {
      const { s } = arena({ rng: MIN, spells: { maledictionCollateraleChains: chains } });
      const d = player(s, 'dompteur', 300, [SL.frappe, SL.grondement, 80841]);
      const t1 = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
      const t2 = mob(s, M.troollibre, cellInDirectionOrThrow(t1.cell, 0, 1));
      expect(castSpell(s, d.id, 80841, d.cell).ok).toBe(true);
      d.apUsed = 0;
      expect(castSpell(s, d.id, SL.grondement, t1.cell).ok).toBe(true);
      expect([damagesOf(s, t1.id), damagesOf(s, t2.id)]).toEqual([t1Exp, t2Exp]);
      expect(damagesOf(s, d.id)).toEqual([]);
    }
  });

  it('Malédiction Mouvante : l’attaquant repousse de 2 l’ennemi frappé (1018) ; pas sur des dommages de glyphe', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 300, [SL.grondement, 80845]);
    const t = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
    const t2 = mob(s, M.troollibre, 213);
    expect(castSpell(s, d.id, 80845, d.cell).ok).toBe(true);
    d.apUsed = 0;
    expect(castSpell(s, d.id, SL.grondement, t.cell).ok).toBe(true);
    expect(t.cell).toBe(cellInDirectionOrThrow(300, 1, 5));
    walk(s, t2, [199]);
    expect(t2.cell).toBe(199);
  });

  it('Immortalité du Bienfaiteur : au seuil (TR30620) soin de 50 % des PV max puis retrait ; spells.bienfaiteurOverflowLost', () => {
    for (const lost of [true, false]) {
      const { s } = arena({ rng: MIN, spells: { bienfaiteurOverflowLost: lost } });
      const mag = player(s, 'magicien', 300, [SL.frappe, 80848]);
      const d = player(s, 'dompteur', cellInDirectionOrThrow(300, 1, 2));
      const t = mob(s, M.troollibre, cellInDirectionOrThrow(d.cell, 1, 1));
      expect(castSpell(s, mag.id, 80848, d.cell).ok).toBe(true);
      applyDamage(s, t, d, 100000, { actionId: 100 });
      flushTriggers(s);
      if (!lost) {
        expect(d.alive).toBe(false);
        continue;
      }
      expect(d.alive).toBe(true);
      expect(d.hp).toBe(1 + Math.trunc((d.maxHp * 50) / 100));
      expect(d.buffs.some((b) => b.spellId === 30620)).toBe(false);
      applyDamage(s, t, d, 100000, { actionId: 100 });
      flushTriggers(s);
      expect(d.alive).toBe(false);
    }
  });

  it('Immortalité du Berserker : renouvelée (K → TB) seulement si les effets TB passent avant le décompte (engine.turnStartTriggersBeforeDecrement)', () => {
    for (const tbFirst of [false, true]) {
      const { s } = arena({ rng: MIN, engine: { turnStartTriggersBeforeDecrement: tbFirst } });
      const d = player(s, 'dompteur', 300, [SL.frappe, SL.grondement, 80842]);
      const t = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
      timeline(s, [d]);
      nextTurn(s);
      expect(castSpell(s, d.id, 80842, d.cell).ok).toBe(true);
      expect(d.buffs.some((b) => b.kind === 'threshold')).toBe(true);
      t.hp = 100;
      d.apUsed = 0;
      expect(castSpell(s, d.id, SL.grondement, t.cell).ok).toBe(true);
      expect(t.alive).toBe(false);
      expect(s.log!.ofType('triggered').some((e) => e.token === 'K' && e.carrierId === d.id)).toBe(true);
      nextTurn(s);
      expect(d.buffs.some((b) => b.kind === 'threshold')).toBe(tbFirst);
    }
  });

  it('CAP (le porteur lance un sort, lancers directs seulement) : compteur de Productivité 5944 → 5945 → récompense', () => {
    const { s } = arena({ rng: MIN });
    const mag = player(s, 'magicien', 300);
    const t = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
    resolveSpell(s, mag, s.ctx.getSpell(81027), mag.cell);
    const counters = (): number[] => [5944, 5945].filter((x) => mag.hasState(x));
    castSpell(s, mag.id, SL.frappe, t.cell, { ignoreConditions: true });
    expect(counters()).toEqual([5944]);
    castSpell(s, mag.id, SL.frappe, t.cell, { ignoreConditions: true });
    expect(counters()).toEqual([5945]);
    expect(s.log!.ofType('cast').some((e) => e.spellLevelId === 80735)).toBe(false);
    castSpell(s, mag.id, SL.frappe, t.cell, { ignoreConditions: true });
    expect(counters()).toEqual([]);
    expect(s.log!.ofType('cast').some((e) => e.spellLevelId === 80735)).toBe(true);
  });

  it('Poutch tué par le coup d’un Dompteur : le renvoi a lieu quand même (XD, dommages du coup mortel)', () => {
    const { s, d, poutch, t } = poutchSetup();
    poutch.hp = 100;
    castSpell(s, d.id, SL.grondement, poutch.cell);
    expect(poutch.alive).toBe(false);
    expect(damagesOf(s, t.id)).toEqual([2501]);
    const tokens = s.log!.ofType('triggered').filter((e) => e.carrierId === poutch.id).map((e) => e.token);
    expect(tokens).toEqual(['XD']);
  });

  it('Chamboulement : dommages de poussée (PD) → rebond unique (2160) sur l’ennemi non marqué le plus proche, en chaîne', () => {
    const { s } = arena({ rng: MIN });
    const a = player(s, 'acrobate', 300, [80846]);
    const t1 = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    const t2 = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 4));
    const t3 = mob(s, M.artroolleur, cellInDirectionOrThrow(300, 5, 3));
    expect(castSpell(s, a.id, 80846, t1.cell).ok).toBe(true);
    // t1 poussé de 5 contre t2 (4 cases restantes : 1 132 / 566) ; t1 renvoie t2 (PD) puis t2 renvoie t3
    expect([damagesOf(s, t1.id, true), damagesOf(s, t2.id, true)]).toEqual([[1132], [566, 33]]);
    const bounces = s.log!.ofType('triggered').filter((e) => e.token === 'PD').map((e) => e.carrierId);
    expect(bounces).toEqual([t1.id, t2.id]);
    expect(t3.cell).not.toBe(cellInDirectionOrThrow(300, 5, 3));
    // nettoyage : 406 retire les marques 5916 et les déclencheurs de 30677
    for (const f of [t1, t2, t3]) expect(f.buffs.some((b) => b.spellId === 30677)).toBe(false);
  });

  it('Pulsation Chaotique : rebonds (2792 / 2160) sur l’ennemi non marqué le plus proche, +20 de base par rebond', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 300, [80840]);
    const t1 = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
    const t2 = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 5));
    const t3 = mob(s, M.artroolleur, cellInDirectionOrThrow(300, 7, 4));
    expect(castSpell(s, d.id, 80840, t1.cell).ok).toBe(true);
    expect([damagesOf(s, t1.id), damagesOf(s, t2.id), damagesOf(s, t3.id)]).toEqual([[35 * 61], [55 * 61], [75 * 61]]);
    expect(d.buffs.some((b) => b.kind === 'spellModifier')).toBe(false);
  });

  it('VA / CD (objectif « Même pas mal ») : PV modifiés du porteur, dommages infligés par le lanceur du buff', () => {
    const { s } = arena({ rng: MIN });
    const mama = addFighter(s, { kind: 'monster', monsterId: M.mama }, 300);
    const p = player(s, 'dompteur', cellInDirectionOrThrow(300, 1, 3));
    resolveSpell(s, mama, s.ctx.getSpell(80725), mama.cell);
    castSpell(s, mama.id, 80497, p.cell);
    const trig = s.log!.ofType('triggered').map((e) => [e.carrierId, e.token]);
    expect(trig).toEqual([
      [p.id, 'VA'],
      [p.id, 'D'],
      [mama.id, 'CD'],
    ]);
    expect(p.hasState(5961)).toBe(true);
  });

  it('cumul maximal (maxStack 1) : un sous-sort relancé n’empile pas ses buffs (Empalé)', () => {
    const { s } = arena({ rng: MIN });
    const p = player(s, 'dompteur', 300);
    resolveSpell(s, p, s.ctx.getSpell(80585), p.cell);
    const n = p.buffs.filter((b) => b.spellId === 30428).length;
    expect(n).toBeGreaterThan(0);
    resolveSpell(s, p, s.ctx.getSpell(80585), p.cell);
    expect(p.buffs.filter((b) => b.spellId === 30428)).toHaveLength(n);
  });
});

describe('glyphe immédiat (1165) : cadeau', () => {
  function gifts(over: ConfigOverrides = {}) {
    const { s, sce } = arena({ rng: MIN, ...over });
    const players = [player(s, 'acrobate', 286), player(s, 'dompteur', 287), player(s, 'dompteur', 314), player(s, 'magicien', 315)];
    const t = mob(s, M.troollibre, 316);
    resolveSpell(s, sce, s.ctx.getSpell(80764), 301);
    resolveSpell(s, sce, s.ctx.getSpell(80764), 327);
    return { s, players, t };
  }

  it('seul un joueur le déclenche ; un choix (liste 10) par joueur ; seul le cadeau ramassé est dissipé', () => {
    const { s, players, t } = gifts();
    expect(s.marks.filter((m) => m.type === 'glyphImmediate').map((m) => m.centerCell)).toEqual([301, 327]);
    // un Trooll traverse le cadeau (masque Atq,A) : rien
    walk(s, t, [301, 288]);
    expect(s.pendingChoices).toHaveLength(0);
    walk(s, players[3]!, [301]);
    expect(s.pendingChoices.map((x) => [x.choiceListId, x.fighterId]).sort()).toEqual(players.map((p) => [10, p.id]).sort());
    expect(s.marks.filter((m) => m.type === 'glyphImmediate').map((m) => m.centerCell)).toEqual([327]);
  });

  it('gifts.monstersTrigger = true : un monstre le déclenche aussi ; engine.dispelGlyphsTriggeringMarkOnly = false : tous dissipés', () => {
    const m = gifts({ gifts: { monstersTrigger: true } });
    walk(m.s, m.t, [301]);
    expect(m.s.pendingChoices.length).toBeGreaterThan(0);
    const a = gifts({ engine: { dispelGlyphsTriggeringMarkOnly: false } });
    walk(a.s, a.players[3]!, [301]);
    expect(a.s.marks.filter((x) => x.type === 'glyphImmediate')).toHaveLength(0);
  });
});
