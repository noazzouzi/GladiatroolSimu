/**
 * Envoûtements et effets « durables » : caractéristiques (PA/PM, vitalité), états (pose, retrait, désactivation,
 * EON/EOFF), boucliers, seuil de PV, 293, 406, 132, mort du lanceur, grimoire (3405/3406), choix, invocation, marques,
 * exécution d'un effet porté par un buff (déclenché / différé).
 */
import { describe, expect, it } from 'vitest';
import {
  activateBuff,
  addBuff,
  applyDamage,
  Buff,
  castSpell,
  executeBuffEffect,
  flushTriggers,
  killFighter,
  removeBuff,
  resolveSpell,
  spellBaseDamageBonus,
  Stat,
  type Fighter,
  type FightState,
  type TriggerEvent,
} from '../src/engine/index.js';
import { archetype, cellInDirectionOrThrow, M, monster, scenarioEntity, SL, testFight } from './helpers/engineSetup.js';

function giveState(s: FightState, f: Fighter, stateId: number): Buff {
  const b = new Buff();
  b.kind = 'state';
  b.stateId = stateId;
  b.casterId = f.id;
  b.duration = -1;
  return addBuff(s, f, b);
}

describe('caractéristiques', () => {
  it('Regain Vigoureux : +2 PA +2 PM aux alliés de la zone, PA courants compris ; retrait du buff', () => {
    const s = testFight();
    const mag = archetype(s, 'magicien', 300);
    const ally = archetype(s, 'dompteur', cellInDirectionOrThrow(300, 1, 2));
    const enemy = monster(s, M.troollibre, cellInDirectionOrThrow(300, 7, 1));
    expect(castSpell(s, mag.id, SL.regain, 300).ok).toBe(true);
    expect([mag.ap, mag.mp]).toEqual([8 - 2 + 2, 6]);
    expect([ally.ap, ally.mp]).toEqual([10, 6]);
    expect([enemy.ap, enemy.mp]).toEqual([11, 6]);
    for (const b of [...ally.buffs]) removeBuff(s, ally, b, 'test');
    expect([ally.ap, ally.mp]).toEqual([8, 4]);
  });

  it('vitalité : PV max et PV courants du même montant ; érosion : PV max perdus', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const b = new Buff();
    b.kind = 'stat';
    b.stat = Stat.VITALITY;
    b.value = 5000;
    b.casterId = acro.id;
    acro.hp = 20000;
    addBuff(s, acro, b);
    expect([acro.hp, acro.maxHp]).toEqual([25000, 35000]);
    removeBuff(s, acro, b, 'test');
    expect([acro.hp, acro.maxHp]).toEqual([20000, 30000]);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 1));
    applyDamage(s, t, acro, 1000, { actionId: 100 });
    expect([acro.hp, acro.erodedHp, acro.maxHp]).toEqual([19000, 100, 29900]);
  });
});

describe('états', () => {
  it('pose / retrait / désactivation ; déclencheurs EON / EOFF dans la file', () => {
    const events: TriggerEvent[] = [];
    const s = testFight({}, { onTrigger: (_s, ev) => void events.push(ev) });
    const sce = scenarioEntity(s);
    const t = monster(s, M.troollibre, s.ctx.data.map.spikes.cells[3]!);
    resolveSpell(s, sce, s.ctx.getSpell(SL.spikesEntry), t.cell);
    expect(t.hasState(5902) && t.hasState(5994)).toBe(true);
    expect(events.filter((e) => e.type === 'stateOn').map((e) => (e as { stateId: number }).stateId)).toEqual([5902, 5994]);
    // Mama invulnérable (56, effet d'état 7) : 0 dommage ; désactivation (952) : de nouveau vulnérable
    const mama = monster(s, M.mama, cellInDirectionOrThrow(300, 1, 1));
    const inv = giveState(s, mama, 56);
    expect(mama.invulnerable).toBe(true);
    const out = applyDamage(s, sce, mama, 5000, { actionId: 100 });
    expect([out.lifeLoss, out.invulnerable, mama.hp]).toEqual([0, true, 150000]);
    const dis = new Buff();
    dis.kind = 'disableState';
    dis.stateId = 56;
    dis.casterId = mama.id;
    addBuff(s, mama, dis);
    expect(mama.hasState(56)).toBe(false);
    // hors d'une action de premier niveau, les déclenchements restent en file jusqu'au prochain vidage
    expect(s.triggerQueue.at(-1)).toMatchObject({ type: 'stateOff', stateId: 56 });
    flushTriggers(s);
    expect(s.triggerQueue).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'stateOff', stateId: 56, targetId: mama.id });
    removeBuff(s, mama, dis, 'test');
    expect(mama.hasState(56)).toBe(true);
    removeBuff(s, mama, inv, 'test');
    expect(mama.invulnerable).toBe(false);
  });
});

describe('boucliers, seuil, bonus de base, retraits', () => {
  it('Protection Prolongée : 3 000 de bouclier absorbés avant les PV, bouclier consommé puis retiré', () => {
    const s = testFight();
    const mag = archetype(s, 'magicien', 300);
    const ally = archetype(s, 'acrobate', cellInDirectionOrThrow(300, 1, 2));
    castSpell(s, mag.id, SL.protection, ally.cell);
    expect(ally.shield).toBe(3000);
    const tr = monster(s, M.troollibre, cellInDirectionOrThrow(ally.cell, 1, 1));
    const out = applyDamage(s, tr, ally, 2000, { actionId: 100 });
    expect([out.shieldAbsorbed, out.lifeLoss, ally.shield, ally.hp]).toEqual([2000, 0, 1000, 30000]);
    applyDamage(s, tr, ally, 1500, { actionId: 100 });
    expect([ally.shield, ally.hp]).toEqual([0, 29500]);
    expect(ally.buffs.some((b) => b.kind === 'shield')).toBe(false);
    // le soin de début de tour (déclencheur TB) est posé comme buff déclenché ; exécution par l'étape suivante
    const trig = ally.buffs.find((b) => b.kind === 'triggered')!;
    expect(trig.triggers).toEqual(['TB']);
    executeBuffEffect(s, trig);
    // soin plafonné aux PV manquants (PV max érodés de 50 par les 500 perdus)
    expect([ally.hp, ally.maxHp]).toEqual([29950, 29950]);
  });

  it('seuil de PV (2872, Immortalité du Bienfaiteur) : impossible de descendre sous 1 PV', () => {
    const s = testFight();
    const mag = archetype(s, 'magicien', 300, [80848]);
    const ally = archetype(s, 'dompteur', cellInDirectionOrThrow(300, 1, 2));
    expect(castSpell(s, mag.id, 80848, ally.cell).ok).toBe(true);
    const tr = monster(s, M.troollibre, cellInDirectionOrThrow(ally.cell, 1, 1));
    applyDamage(s, tr, ally, 100000, { actionId: 100 });
    expect(ally.alive).toBe(true);
    expect(ally.hp).toBe(1);
  });

  it('293 différé (Grondement : +20 au tour +2) et 406 (Détonation retire ses propres bonus)', () => {
    const s = testFight();
    const d = archetype(s, 'dompteur', 300);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
    castSpell(s, d.id, SL.grondement, t.cell);
    const gg = d.buffs.find((b) => b.kind === 'spellModifier')!;
    expect([gg.active, gg.delay, gg.duration, spellBaseDamageBonus(d, 30396)]).toEqual([false, 2, 1, 0]);
    activateBuff(s, d, gg);
    expect(spellBaseDamageBonus(d, 30396)).toBe(20);
    // Détonation : 1160 → 30417 (+5 au sort 30398 par cible) puis dégâts, puis 406 (valeur 30398)
    const s2 = testFight();
    const d2 = archetype(s2, 'dompteur', 300);
    const x = cellInDirectionOrThrow(300, 1, 3);
    const a = monster(s2, M.troollibre, x);
    castSpell(s2, d2.id, 80503, x);
    // le bonus du sous-sort 30417 n'est pas retiré par 406 (valeur 30398, sort parent) : ETUDE / données telles quelles
    expect(d2.buffs.filter((b) => b.kind === 'spellModifier').map((b) => [b.spellId, b.modSpellId, b.value])).toEqual([[30417, 30398, 5]]);
    expect(a.hp).toBe(25000 - (38 + 5) * 61);
  });

  it('Délivrance (132) retire les envoûtements dispellable = 1 ; neutralisée si spells.delivranceWorks = false', () => {
    for (const works of [true, false]) {
      const s = testFight({ spells: { delivranceWorks: works } });
      const mag = archetype(s, 'magicien', 300);
      const tr = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
      castSpell(s, mag.id, SL.ventsContraires, tr.cell);
      expect(tr.mp).toBe(4);
      mag.restoreApMp();
      mag.resetCastCounters();
      castSpell(s, mag.id, SL.delivrance, tr.cell);
      expect(tr.mp).toBe(works ? 6 : 4);
    }
  });

  it('mort du lanceur : ses envoûtements sur les autres sont retirés (engine.removeBuffsOfDeadCaster)', () => {
    for (const remove of [true, false]) {
      const s = testFight({ engine: { removeBuffsOfDeadCaster: remove } });
      const tr = monster(s, M.troollibre, 300);
      const p = archetype(s, 'magicien', cellInDirectionOrThrow(300, 1, 2));
      castSpell(s, tr.id, SL.aspiratrooll, p.cell);
      expect(p.stat(Stat.EROSION)).toBe(20);
      killFighter(s, tr, p.id, 'damage');
      expect(tr.alive).toBe(false);
      expect(s.isOccupied(300)).toBe(false);
      expect(p.stat(Stat.EROSION)).toBe(remove ? 10 : 20);
    }
  });
});

describe('grimoire, choix, invocation, marques', () => {
  it('carte d’amélioration : 3406 oublie le sort de base, 3405 apprend l’amélioré (même emplacement)', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300, [SL.frappe, SL.videur]);
    resolveSpell(s, acro, s.ctx.getSpell(80639), acro.cell);
    expect(acro.knowsSpell(SL.videur)).toBe(false);
    const up = acro.spells.find((x) => x.spellLevelId === 80766)!;
    expect([up.slot, up.upgraded]).toEqual([1, true]);
  });

  it('Jaillissement amélioré (80750 absent) : 80760 appris, sauf spells.jaillissementUpgradeBroken', () => {
    for (const broken of [false, true]) {
      const s = testFight({ spells: { jaillissementUpgradeBroken: broken } });
      const d = archetype(s, 'dompteur', 300);
      resolveSpell(s, d, s.ctx.getSpell(80636), d.cell);
      expect(d.knowsSpell(80505)).toBe(false);
      expect(d.knowsSpell(80760)).toBe(!broken);
    }
  });

  it('choix : l’effet 3008 / 3404 met un choix en attente qui bloque les lancers', () => {
    const s = testFight();
    const sce = scenarioEntity(s);
    const acro = archetype(s, 'acrobate', 300);
    const lvl = Object.values(s.ctx.data.spells).find((x) => x.effects.some((e) => e.exec && e.effectId === 3404))!;
    resolveSpell(s, sce, s.ctx.getSpell(lvl.spellLevelId), -1);
    expect(s.pendingChoice).toMatchObject({ scope: 'global', fighterId: -1 });
    expect(castSpell(s, acro.id, SL.frappe, cellInDirectionOrThrow(300, 1, 2)).code).toBe('PENDING_CHOICE');
    s.pendingChoices.shift();
    expect(castSpell(s, acro.id, SL.frappe, cellInDirectionOrThrow(300, 1, 2)).ok).toBe(true);
  });

  it('Soutien Stratégique : invoque le Poutch (équipe du lanceur) qui lance son passif ; un nouveau Poutch tue l’ancien', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const c1 = cellInDirectionOrThrow(300, 1, 2);
    castSpell(s, acro.id, SL.soutien, c1);
    const p1 = s.fighterAt(c1)!;
    expect([p1.monsterId, p1.team, p1.camp, p1.summonerId]).toEqual([M.poutch, 'players', 'Atq', acro.id]);
    expect(p1.buffs.map((b) => [b.kind, b.effectId, b.value])).toEqual([
      ['multiplier', 1163, 50],
      ['triggered', 792, 0],
    ]);
    // le 1163 ×50 % 'DBA' divise par deux les dommages d'un allié
    const out = applyDamage(s, acro, p1, 1000, { actionId: 100 });
    expect(out.lifeLoss).toBe(500);
    acro.turnCount += 2;
    acro.restoreApMp();
    acro.resetCastCounters();
    const c2 = cellInDirectionOrThrow(300, 3, 2);
    castSpell(s, acro.id, SL.soutien, c2);
    expect(p1.alive).toBe(false);
    expect(s.fighterAt(c2)!.monsterId).toBe(M.poutch);
  });

  it('glyphe des pics (30390 niv. 1) : deux marques (début de tour 81026, aura 80492) sur les 96 cases', () => {
    const s = testFight();
    const sce = scenarioEntity(s);
    resolveSpell(s, sce, s.ctx.getSpell(SL.spikesGlyph), -1);
    expect(s.marks.map((m) => [m.type, m.spellLevelId, m.cells.length, m.duration])).toEqual([
      ['glyphTurnStart', 81026, 96, -1],
      ['aura', 80492, 96, -1],
    ]);
    expect(s.marks[0]!.contains(s.ctx.data.map.spikes.cells[10]!)).toBe(true);
    expect(s.marks[0]!.contains(300)).toBe(false);
  });

  it('Ultime Espoir : les alliés morts reviennent à 50 % de leurs PV max sur leur case de mort', () => {
    const s = testFight();
    const mag = archetype(s, 'magicien', 300, [80851]);
    const ally = archetype(s, 'dompteur', cellInDirectionOrThrow(300, 1, 2));
    const cell = ally.cell;
    killFighter(s, ally, -1, 'damage');
    expect(s.isOccupied(cell)).toBe(false);
    expect(castSpell(s, mag.id, 80851, mag.cell).ok).toBe(true);
    expect([ally.alive, ally.cell, ally.hp]).toEqual([true, cell, 15000]);
    expect(s.fighterAt(cell)).toBe(ally);
    expect(mag.knowsSpell(80851)).toBe(false);
  });

  it('mort : les invocations meurent avec leur invocateur ; un effet de mort (X) peut être exécuté par le mort', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    castSpell(s, acro.id, SL.soutien, cellInDirectionOrThrow(300, 1, 2));
    const poutch = s.fighters.find((f) => f.monsterId === M.poutch)!;
    killFighter(s, acro, -1, 'damage');
    expect(poutch.alive).toBe(false);
    // déclenchement de mort : le passif du joueur (80897) porte 792 'X' → 81001, exécutable sur le porteur mort
    const s2 = testFight();
    const p = archetype(s2, 'dompteur', 300);
    resolveSpell(s2, p, s2.ctx.getSpell(SL.playerPassive), p.cell);
    const onDeath = p.buffs.find((b) => b.kind === 'triggered' && b.triggers.includes('X'))!;
    // (étape « déclencheurs ») la mort est en file : sans vidage, rien ; un effet porté exécuté à la main sur le mort
    // sans allowDead ne fait rien ; au vidage de la file, le déclencheur X est exécuté par le moteur
    s2.setEventLog(true);
    const q = s2.triggerQueue.length;
    killFighter(s2, p, -1, 'damage');
    expect(s2.triggerQueue.length).toBe(q + 1);
    const pending = s2.triggerQueue.splice(q);
    const before = s2.log!.ofType('cast').length;
    executeBuffEffect(s2, onDeath);
    expect(s2.log!.ofType('cast').length).toBe(before);
    s2.triggerQueue.push(...pending);
    flushTriggers(s2);
    expect(s2.log!.ofType('cast').at(-1)).toMatchObject({ casterId: p.id, spellLevelId: 81001, cell: 300 });
  });
});

