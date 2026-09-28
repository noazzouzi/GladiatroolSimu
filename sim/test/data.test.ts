import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_KEYS,
  CAMPS,
  EFFECT_CATEGORIES,
  EFFECT_HANDLERS,
  ELEMENTS,
  OBJECTIVE_EVENTS,
  OBJECTIVE_IDS,
  SPELL_FAMILIES,
  STAT_KEYS,
  STATE_FLAGS,
  SUBSPELL_CASTERS,
  SUBSPELL_CELLS,
  ZONE_SHAPES,
  defaultConfig,
  gameData as D,
  getConfigValue,
  getSpellLevel,
  getSpellLevelByGrade,
  isConfigRef,
  loadConfig,
  resolveConfigRef,
  rollBounds,
  validateConfig,
  type EffectData,
  type SimConfig,
  type SpellLevelData,
} from '../src/data';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function allEffects(): { lvl: SpellLevelData; e: EffectData }[] {
  const out: { lvl: SpellLevelData; e: EffectData }[] = [];
  for (const lvl of Object.values(D.spells)) {
    for (const e of [...lvl.effects, ...lvl.critEffects]) out.push({ lvl, e });
  }
  return out;
}

function collectConfigRefs(v: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => collectConfigRefs(x, out));
  else if (v && typeof v === 'object') {
    if (isConfigRef(v)) out.add(v.$config);
    else Object.values(v).forEach((x) => collectConfigRefs(x, out));
  }
  return out;
}

const hasSpell = (id: number) => String(id) in D.spells;

describe('carte', () => {
  const cells = D.map.cells;

  it('560 cellules indexées par id, coordonnées MapPoint', () => {
    expect(cells).toHaveLength(560);
    cells.forEach((c, i) => expect(c.id).toBe(i));
    // formule inverse id = (x-y)*14 + y + floor((x-y)/2)
    for (const c of cells) expect((c.x - c.y) * 14 + c.y + Math.floor((c.x - c.y) / 2)).toBe(c.id);
    expect([cells[300].x, cells[300].y]).toEqual([17, -4]);
  });

  it('241 cases jouables et 96 cases de pics jouables', () => {
    const playable = cells.filter((c) => c.walkable).map((c) => c.id);
    expect(playable).toHaveLength(241);
    expect(D.map.playable).toEqual(playable);
    const spikes = cells.filter((c) => c.spikes);
    expect(spikes).toHaveLength(96);
    expect(spikes.every((c) => c.walkable)).toBe(true);
    expect(D.map.spikes.cells).toEqual(spikes.map((c) => c.id));
    expect(D.map.spikes.rawList).toHaveLength(102);
    expect(D.map.spikes.listedNotWalkable).toEqual([250, 293, 321, 362]);
    // pics = profondeur de bord 1 et 2 + les 4 angles
    const byDepth = (d: number) => spikes.filter((c) => c.edgeDepth === d).length;
    expect([byDepth(1), byDepth(2), byDepth(3)]).toEqual([48, 44, 4]);
    expect(cells.filter((c) => c.walkable && !c.spikes)).toHaveLength(145);
  });

  it('cases spéciales : départs, centre, attente de la Mama, cadeaux', () => {
    expect(D.map.startCells).toEqual([286, 287, 314, 315]);
    expect(D.map.center).toBe(300);
    expect(cells[300].neighbours).toEqual([286, 287, 314, 315]);
    expect(cells[300].edgeDepth).toBe(9);
    expect(D.map.bossWaitCell).toBe(152);
    expect(cells[152].walkable).toBe(false);
    expect(D.map.giftCells).toEqual([272, 273, 299, 301, 327, 328, 329]);
    for (const id of [...D.map.startCells, ...D.map.giftCells]) {
      expect(cells[id].walkable && !cells[id].spikes).toBe(true);
    }
    expect(D.map.losBlocking).toEqual(cells.filter((c) => !c.los).map((c) => c.id));
    expect(D.map.staticObstacles).toEqual([]);
  });

  it('voisinage 4-connexe symétrique, limité aux cases jouables', () => {
    for (const c of cells) {
      for (const n of c.neighbours) {
        expect(cells[n].walkable).toBe(true);
        expect(Math.abs(cells[n].x - c.x) + Math.abs(cells[n].y - c.y)).toBe(1);
        expect(cells[n].neighbours).toContain(c.id);
      }
      if (!c.walkable) expect(c.neighbours).toEqual([]);
    }
  });

  it('la liste des pics du sort 80489 correspond à la carte', () => {
    const glyph = getSpellLevel(80489).effects;
    expect(glyph.map((e) => e.effectId)).toEqual([401, 1091]);
    for (const e of glyph) {
      expect(e.zone.shape).toBe(';');
      expect(e.zone.cellIds).toEqual(D.map.spikes.rawList);
    }
  });
});

describe('sorts', () => {
  it('fermeture : 369 niveaux, index par sort cohérent', () => {
    expect(Object.keys(D.spells)).toHaveLength(D.meta.counts.spellLevels);
    for (const [key, lvl] of Object.entries(D.spells)) {
      expect(String(lvl.spellLevelId)).toBe(key);
      expect(D.spellIndex[String(lvl.spellId)][lvl.grade - 1]).toBe(lvl.spellLevelId);
      expect(SPELL_FAMILIES).toContain(lvl.family);
    }
    expect(getSpellLevelByGrade(30390, 2).spellLevelId).toBe(80492);
    expect(() => getSpellLevel(1)).toThrow(/inconnu/);
  });

  it('chaque sort d\'emplacement, d\'amélioration et unique existe', () => {
    for (const key of ARCHETYPE_KEYS) {
      const a = D.archetypes[key];
      expect(a.spellSlots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      for (const s of a.spellSlots) expect(hasSpell(s.spellLevelId)).toBe(true);
      expect(a.spellSlots[0].spellLevelId).toBe(80499);
      expect(Object.keys(a.upgrades)).toHaveLength(7);
      for (const [base, u] of Object.entries(a.upgrades)) {
        expect(a.spellSlots.some((s) => String(s.spellLevelId) === base)).toBe(true);
        expect(getSpellLevel(u.to).family).toBe('upgraded');
        expect(getSpellLevel(u.choiceSpellLevelId).family).toBe('choice');
      }
      expect(a.uniques).toHaveLength(7);
      expect(a.uniques).toContain(80843);
      for (const u of a.uniques) {
        const lvl = getSpellLevel(u);
        expect(lvl.family).toBe('unique');
        expect(lvl.cast.ap).toBe(5);
        // usage unique : le sort se désapprend lui-même (3406)
        expect(lvl.effects.some((e) => e.effectId === 3406 && e.subSpell?.spellLevelId === u)).toBe(true);
      }
      expect(hasSpell(a.passiveSpellLevelId)).toBe(true);
      expect(hasSpell(a.body.startingSpellLevel)).toBe(true);
    }
    expect(D.archetypes.acrobate.spellSlots.map((s) => s.spellLevelId)).toEqual(
      [80499, 80507, 80513, 80510, 80522, 80511, 80509, 80512],
    );
    expect(D.archetypes.dompteur.spellSlots.map((s) => s.spellLevelId)).toEqual(
      [80499, 80500, 80501, 80502, 80503, 80504, 80505, 80506],
    );
    expect(D.archetypes.magicien.spellSlots.map((s) => s.spellLevelId)).toEqual(
      [80499, 80514, 80515, 80516, 80519, 80521, 80517, 80518],
    );
    expect(D.archetypes.dompteur.upgrades['80505']).toMatchObject({ to: 80760, dataLearnsSpellLevelId: 80750 });
  });

  it('chaque sous-sort référencé existe (sauf 80750, documenté et remplacé)', () => {
    const missing: number[] = [];
    for (const { lvl, e } of allEffects()) {
      const ref = e.subSpell;
      if (!ref) continue;
      expect(D.spellIndex[String(ref.spellId)], `${lvl.spellLevelId} → ${ref.spellId}`).toBeDefined();
      if (ref.spellLevelId === null) continue;
      if (ref.missing) {
        missing.push(ref.spellLevelId);
        expect(hasSpell(ref.substituteSpellLevelId!)).toBe(true);
        continue;
      }
      expect(hasSpell(ref.spellLevelId), `${lvl.spellLevelId} → ${ref.spellLevelId}`).toBe(true);
      expect(getSpellLevel(ref.spellLevelId).spellId).toBe(ref.spellId);
      if (ref.grade !== null) expect(getSpellLevel(ref.spellLevelId).grade).toBe(ref.grade);
    }
    expect([...new Set(missing)]).toEqual([80750]);
  });

  it('sous-sorts résolus selon les règles d\'extraction (1160, 406, 3405/3406, 950)', () => {
    const videur = getSpellLevel(80507);
    const e1160 = videur.effects.find((e) => e.effectId === 1160)!;
    expect(e1160.exec).toBe(true);
    expect(e1160.subSpell).toEqual({ spellId: 30689, grade: 1, spellLevelId: 80981 });
    // l'effet de poussée affiché par Videur est d'affichage : la vraie poussée est dans 30689
    expect(videur.effects.find((e) => e.effectId === 5)!.exec).toBe(false);
    expect(getSpellLevel(80981).effects.find((e) => e.effectId === 5)!.exec).toBe(true);
    const arrival = getSpellLevel(80835).effects.find((e) => e.effectId === 406)!;
    expect(arrival.subSpell).toEqual({ spellId: 30750, grade: null, spellLevelId: null });
    expect(arrival.delay).toBe(7);
    const upgrade = getSpellLevel(80639).effects;
    expect(upgrade.find((e) => e.effectId === 3406)!.subSpell?.spellLevelId).toBe(80507);
    expect(upgrade.find((e) => e.effectId === 3405)!.subSpell?.spellLevelId).toBe(80766);
    const entry = getSpellLevel(80492).effects;
    expect(entry.filter((e) => e.effectId === 950).map((e) => e.stateId)).toEqual([5902, 5903, 5994, 5994]);
    const aura = entry.find((e) => e.effectId === 1163)!;
    expect(aura.mask.camp).toBe('Def');
    expect(aura.triggers).toEqual(['D']);
    expect(aura.min).toBe(200);
  });

  it('masques analysés : inclusion, conditions, camp', () => {
    const cardEffect = getSpellLevel(80897).effects.find((e) => e.effectId === 125)!;
    expect(cardEffect.targetMask).toBe('C,*E5900');
    expect(cardEffect.mask).toEqual({ include: ['C'], exclude: [{ key: 'E', value: 5900, onCaster: true }], camp: null });
    for (const { e } of allEffects()) {
      if (e.mask.camp !== null) expect(CAMPS).toContain(e.mask.camp);
      for (const t of e.mask.include) expect(t).toMatch(/^[A-Za-z]$/);
      for (const c of e.mask.exclude) expect(c.key).toMatch(/^[bBeEfFzZKoOPpTWUvVrRQq]$/);
      expect(ZONE_SHAPES).toContain(e.zone.shape);
      if (e.element) expect(ELEMENTS).toContain(e.element);
      if (e.zone.shape === ';') expect(e.zone.cellIds?.length).toBeGreaterThan(0);
    }
  });

  it('zones normalisées comme SpellZone.from_zone_descr', () => {
    const z = (lvl: number, eid: number) => getSpellLevel(lvl).effects.find((e) => e.effectId === eid)!.zone;
    expect(z(80507, 100)).toMatchObject({ shape: 'T', radius: 2, minRadius: 0, degression: 10, maxTicks: 4 });
    expect(z(80935, 1103)).toMatchObject({ shape: 'X', radius: 63, minRadius: 1 });
    expect(z(80483, 100)).toMatchObject({ shape: 'C', radius: 2, minRadius: 1 });
    expect(z(80500, 100)).toMatchObject({ shape: 'C', radius: 2 });
    expect(z(80837, 2960)).toMatchObject({ shape: ';', cellIds: [300] });
  });

  it('forme des niveaux et des effets conforme aux types', () => {
    const castKeys = ['ap', 'range', 'rangeModifiable', 'inLine', 'inDiagonal', 'los', 'needFreeCell', 'needTakenCell',
      'needVisibleEntity', 'maxPerTurn', 'maxPerTarget', 'interval', 'initialCooldown', 'globalCooldown', 'critRate',
      'maxStack', 'statesCriterion'];
    const effectKeys = ['order', 'effectId', 'exec', 'min', 'max', 'value', 'targetMask', 'mask', 'triggers', 'duration',
      'delay', 'triggerDuration', 'dispellable', 'zone'];
    const allowed = new Set([...effectKeys, 'element', 'subSpell', 'stateId', 'summon']);
    const ints = ['order', 'effectId', 'min', 'max', 'value', 'duration', 'delay', 'triggerDuration', 'dispellable'] as const;
    const problems: string[] = [];
    const castSig = [...castKeys].sort().join();
    for (const lvl of Object.values(D.spells)) {
      if (Object.keys(lvl.cast).sort().join() !== castSig || lvl.cast.range.length !== 2) problems.push(`${lvl.spellLevelId} cast`);
      for (const e of [...lvl.effects, ...lvl.critEffects]) {
        const id = `${lvl.spellLevelId}/${e.order}`;
        const keys = Object.keys(e);
        effectKeys.filter((k) => !keys.includes(k)).forEach((k) => problems.push(`${id} : ${k} manquant`));
        keys.filter((k) => !allowed.has(k)).forEach((k) => problems.push(`${id} : ${k} inattendu`));
        ints.filter((k) => !Number.isInteger(e[k])).forEach((k) => problems.push(`${id} : ${k} non entier`));
        if (typeof e.exec !== 'boolean' || e.triggers.length === 0) problems.push(`${id} : exec/triggers`);
        if ([950, 951, 952].includes(e.effectId) && e.stateId !== e.value) problems.push(`${id} : stateId`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('bornes des jets (rollBounds)', () => {
    expect(rollBounds(getSpellLevel(80507).effects.find((e) => e.effectId === 100)!)).toEqual([59, 63]);
    expect(rollBounds({ min: 2000, max: 0, value: 0 })).toEqual([2000, 2000]);
    expect(rollBounds({ min: 0, max: 0, value: 25 })).toEqual([25, 25]);
  });
});

describe('catalogue des effets et états', () => {
  it('chaque effectId des sorts a une entrée dans effects', () => {
    const used = new Set(allEffects().map(({ e }) => e.effectId));
    expect(Object.keys(D.effects).map(Number).sort((a, b) => a - b)).toEqual([...used].sort((a, b) => a - b));
    for (const entry of Object.values(D.effects)) {
      expect(EFFECT_CATEGORIES).toContain(entry.category);
      expect(EFFECT_HANDLERS).toContain(entry.handler);
      if (entry.handler === 'statBuff') {
        expect(STAT_KEYS).toContain(entry.stat);
        expect([1, -1]).toContain(entry.sign);
      }
      if (entry.handler === 'executeSubSpell') {
        expect(SUBSPELL_CASTERS).toContain(entry.executor!.caster);
        expect(SUBSPELL_CELLS).toContain(entry.executor!.cell);
        expect(D.rules.subSpellExecutors[String(entry.effectId)]).toBeDefined();
      }
    }
    expect(D.effects['100']).toMatchObject({ handler: 'damage', element: 'neutral', boostable: true });
    expect(D.effects['89']).toMatchObject({ handler: 'damageCasterHpPct', boostable: false });
    expect(D.effects['1160'].executor).toEqual({ caster: 'originalCaster', cell: 'effectTargetCell', globalLimit: false });
    expect(D.effects['2792'].executor?.globalLimit).toBe(true);
  });

  it('états référencés présents avec leurs effets d\'état', () => {
    for (const { e } of allEffects()) {
      if (e.stateId !== undefined) expect(D.states[String(e.stateId)], `état ${e.stateId}`).toBeDefined();
    }
    for (const s of Object.values(D.states)) s.flags.forEach((f) => expect(STATE_FLAGS).toContain(f));
    expect(D.states['5994'].stateEffects).toEqual([]);
    expect(D.states['56'].flags).toContain('invulnerable');
    expect(D.states['157'].stateEffects).toEqual([0]);
    expect(D.states['5970'].flags).toEqual(expect.arrayContaining(['cantTackle', 'cantBeTackled']));
    for (const id of [5899, 5900, 5901, 5902, 5903, 5918, 5965, 5971, 5973, 5977, 6024]) {
      expect(D.states[String(id)], `état ${id}`).toBeDefined();
    }
  });
});

describe('archétypes, monstres, boss', () => {
  it('stats de base des archétypes (×61, 1 000 DoPou, 10 % critique)', () => {
    for (const key of ARCHETYPE_KEYS) {
      const s = D.archetypes[key].baseStats;
      expect([s.hp, s.ap, s.mp, s.strength, s.power, s.pushDamage, s.critPct, s.level, s.erosionPct]).toEqual(
        [30000, 8, 4, 6000, 0, 1000, 10, 200, 10],
      );
      expect(D.archetypes[key].turnSeconds).toBe(60);
    }
    expect(D.archetypes.acrobate.hpByMode.passiveApplies).toBe(35000);
    expect(D.archetypes.magicien.hpByMode.passiveApplies).toBe(25000);
    expect(D.archetypes.dompteur.passiveBonus).toMatchObject({ effectId: 138, value: 3000 });
  });

  it('18 Acclamations exactes (6 par archétype), appliquées par l\'accumulateur', () => {
    const all = ARCHETYPE_KEYS.flatMap((k) => D.archetypes[k].acclamations);
    expect(all).toHaveLength(18);
    for (const key of ARCHETYPE_KEYS) {
      const acc = D.archetypes[key].acclamations;
      expect(acc).toHaveLength(6);
      expect(acc.slice(0, 2).map((a) => a.stat)).toEqual(['ap', 'mp']);
      expect(acc.map((a) => a.stat)).toContain('range');
    }
    for (const a of all) {
      expect(STAT_KEYS).toContain(a.stat);
      const real = getSpellLevel(a.realSpellLevel).effects.filter((e) => e.exec && e.effectId === a.effectId);
      expect(real).toHaveLength(1);
      expect(real[0].min).toBe(a.value);
      expect(real[0].duration).toBe(-1);
      // l'effet propre de la carte est d'affichage : pas de double application dans les données
      const card = getSpellLevel(a.choiceSpellLevelId).effects.filter((e) => e.effectId === a.effectId);
      expect(card.every((e) => !e.exec)).toBe(true);
    }
    const stats = (k: 'acrobate' | 'dompteur' | 'magicien') =>
      D.archetypes[k].acclamations.map((a) => `${a.stat}:${a.value}`).sort();
    expect(stats('dompteur')).toEqual(['ap:1', 'critDamage:500', 'critPct:20', 'finalDamagePct:10', 'mp:1', 'range:1']);
    expect(stats('acrobate')).toEqual(['ap:1', 'mp:1', 'pushDamage:200', 'range:1', 'resPct:10', 'resPctMelee:10']);
    expect(stats('magicien')).toEqual(['ap:1', 'finalHealPct:20', 'mp:1', 'range:1', 'resPctRanged:15', 'vitality:5000']);
  });

  it('monstres 7980–7986 : stats, sorts et sorts de départ', () => {
    const exp: Record<string, [number, number, number, number]> = {
      7981: [25000, 11, 6, 4000], 7982: [19000, 11, 5, 3000], 7983: [22000, 12, 5, 3500],
      7984: [150000, 20, 6, 4500], 7985: [5500, 0, 0, 0], 7986: [5500, 0, 0, 0], 7980: [30000, 8, 4, 6000],
    };
    expect(Object.keys(D.monsters).sort()).toEqual(Object.keys(exp).sort());
    for (const [id, [hp, ap, mp, str]] of Object.entries(exp)) {
      const m = D.monsters[id];
      expect([m.stats.hp, m.stats.ap, m.stats.mp, m.stats.strength]).toEqual([hp, ap, mp, str]);
      for (const s of [...m.spells, m.startingSpellLevel]) expect(hasSpell(s)).toBe(true);
    }
    expect(D.monsters['7984'].stats.level).toBe(1000);
    expect(D.monsters['7981'].startingSpellLevel).toBe(81002);
  });

  it('boss : attente 152, arrivée T8 sur 300, Rassemblement X63, Faveur +25 % / −5 %', () => {
    const b = D.boss;
    expect(b.waitCell).toBe(152);
    expect([b.arrival.delayTurns, b.arrival.resultingGlobalTurn, b.arrival.targetCell]).toEqual([7, 8, 300]);
    expect(b.rassemblement.zone).toMatchObject({ shape: 'X', radius: 63, minRadius: 1 });
    expect([b.favour.startFinalDamageBonus, b.favour.perObjective]).toEqual([25, -5]);
    for (const lid of [...b.arrival.spellLevels, ...b.rassemblement.spellLevels, ...b.invulnerability.spellLevels,
      ...b.favour.spellLevels, ...b.onDeath.spellLevels, b.preFight.spellLevel, b.startingSpellLevel]) {
      expect(hasSpell(lid), `niveau ${lid}`).toBe(true);
    }
  });
});

describe('scénario', () => {
  it('10 vagues avec les compositions DPLN', () => {
    const W = D.scenario.waves;
    expect(W.map((w) => w.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const comp = (n: number) =>
      Object.fromEntries(W[n - 1].composition.map((c) => [c.monsterId, c.count]));
    const [TL, AR, NI, MA] = [7981, 7982, 7983, 7984];
    expect(comp(1)).toEqual({ [TL]: 2 });
    expect(comp(2)).toEqual({ [TL]: 1, [AR]: 2 });
    expect(comp(3)).toEqual({ [NI]: 2, [AR]: 1 });
    expect(comp(4)).toEqual({ [NI]: 1, [AR]: 1, [TL]: 1 });
    expect(comp(5)).toEqual({ [TL]: 3 });
    expect(comp(6)).toEqual({ [AR]: 3 });
    expect(comp(7)).toEqual({ [NI]: 3 });
    expect(comp(8)).toEqual({ [MA]: 1 });
    expect(comp(9)).toEqual({ [NI]: 1, [TL]: 2, [AR]: 2 });
    expect(comp(10)).toEqual({ [NI]: 2, [TL]: 2, [AR]: 2 });
    const hp = W.reduce((s, w) => s + w.composition.reduce((t, c) => t + c.count * D.monsters[c.monsterId].stats.hp, 0), 0);
    expect(hp).toBe(832000);
    expect(W[0].spawn?.fixedCells).toEqual([242, 358]);
    expect(W[7].boss).toBe(true);
    expect(W[7].spawn).toBeNull();
  });

  it('candidats d\'apparition : cases jouables hors pics, pondérées, réparties par type', () => {
    for (const w of D.scenario.waves) {
      if (!w.spawn) continue;
      for (const c of w.composition) {
        const cands = w.spawn.candidatesByType[String(c.monsterId)];
        expect(cands.length, `V${w.n} type ${c.monsterId}`).toBeGreaterThan(0);
        expect(w.spawn.slotsByType[String(c.monsterId)].length).toBeGreaterThan(0);
        for (const { cell, weight } of cands) {
          expect(D.map.cells[cell].walkable && !D.map.cells[cell].spikes).toBe(true);
          expect(weight).toBeGreaterThan(0);
        }
      }
      for (const g of w.spawn.groups ?? []) expect(g.candidates.length).toBeGreaterThan(0);
    }
    expect(D.scenario.waves[1].spawn?.groups?.map((g) => g.candidates.map((c) => c.cell))).toEqual(
      [[187, 188], [411, 412], [242, 358, 246]],
    );
  });

  it('21 objectifs déclaratifs : 1 imposé + 5 paliers de 4', () => {
    const list = D.scenario.objectives.list;
    expect(list).toHaveLength(21);
    expect(list.map((o) => o.id).sort()).toEqual([...OBJECTIVE_IDS].sort());
    expect(list[0]).toMatchObject({ id: 'empale', tier: 1, imposed: true, condition: { kind: 'victimHasState', stateId: 5994 } });
    for (let t = 2; t <= 6; t++) {
      expect(list.filter((o) => o.tier === t).map((o) => o.orientation).sort()).toEqual(
        ['acrobate', 'dompteur', 'general', 'magicien'],
      );
    }
    for (const o of list) {
      for (const ev of Array.isArray(o.on) ? o.on : [o.on]) expect(OBJECTIVE_EVENTS).toContain(ev);
      expect(hasSpell(o.spellLevel) && hasSpell(o.rewardSpellLevel)).toBe(true);
      expect(o.summary.length).toBeGreaterThan(10);
    }
    const m = D.scenario.objectives.manager;
    expect(m.voteChoiceIdAfterObjective).toEqual({ 1: 11, 2: 12, 3: 13, 4: 14, 5: 15 });
    expect(m.reward.spellManagerLevelByTier).toHaveLength(6);
  });

  it('choix, cadeaux, victoire', () => {
    const ch = D.scenario.choices;
    expect(Object.keys(ch).sort((a, b) => +a - +b)).toEqual(['10', '11', '12', '13', '14', '15', '16', '17']);
    for (const c of Object.values(ch)) {
      const lvl = getSpellLevel(c.castBySpellLevel);
      expect(lvl.effects.some((e) => e.effectId === c.effectId)).toBe(true);
    }
    expect(D.scenario.gifts.cells).toEqual(D.map.giftCells);
    expect(D.scenario.gifts.observed).toEqual({ spawned: 63, turns: 88 });
    expect(D.scenario.victory).toMatchObject({ requiresState: 5965, killingBossEndsFight: false });
  });
});

describe('tests de référence (SPEC §13)', () => {
  const T = Object.fromEntries(D.tests.map((t) => [t.id, t.expected]));
  const x = (roll: number, strength: number) => Math.trunc((roll * (100 + strength)) / 100);

  it('T1 à T16 présents', () => {
    expect(D.tests.map((t) => t.id)).toEqual(Array.from({ length: 16 }, (_, i) => `T${i + 1}`));
  });

  it('valeurs recalculables depuis les sorts', () => {
    const dmg = (lvl: number, crit = false) =>
      rollBounds((crit ? getSpellLevel(lvl).critEffects : getSpellLevel(lvl).effects).find((e) => e.effectId === 100)!);
    const [lo, hi] = dmg(80499);
    const [clo, chi] = dmg(80499, true);
    expect({ hit: [x(lo, 6000), x(hi, 6000)], crit: [x(clo, 6000), x(chi, 6000)] }).toMatchObject(
      { hit: T.T1.hit, crit: T.T1.crit },
    );
    const [alo, ahi] = dmg(80486);
    expect([x(alo, 3000), x(ahi, 3000)]).toEqual(T.T16.hit);
    expect(T.T5).toEqual({ cell: 300, neighbours: D.map.cells[300].neighbours });
    expect(T.T15).toMatchObject({ cells: D.scenario.waves[0].spawn!.fixedCells });
    expect(T.T11).toEqual({ 7981: 11500, 7982: 8500, 7983: 10000, 7984: 74000 });
  });
});

describe('configuration', () => {
  it('configuration par défaut complète, documentée et typée', () => {
    expect(validateConfig(defaultConfig as SimConfig)).toEqual([]);
    const docs = Object.keys(defaultConfig._doc);
    expect(docs.length).toBeGreaterThan(80);
    for (const p of docs) {
      const d = defaultConfig._doc[p];
      expect(d.why.length, p).toBeGreaterThan(5);
      expect(() => getConfigValue(defaultConfig as SimConfig, p)).not.toThrow();
    }
    expect(defaultConfig.timeline.playerOrder).toEqual(['acrobate', 'dompteur', 'dompteur', 'magicien']);
    expect(defaultConfig.rng).toMatchObject({ rollMode: 'random', critMode: 'random' });
    expect(Object.isFrozen(defaultConfig.spikes)).toBe(true);
  });

  it('paramètres de SPEC §12 présents', () => {
    const required = [
      'timeline.model', 'timeline.newMonstersInsertion', 'timeline.playerOrder', 'ai.focus', 'ai.skipIfInSpikes',
      'ai.skipIfNoTargetReachable', 'ai.engageRadius', 'ai.avoidSpikes', 'ai.monstersCanTargetAllies', 'ai.profiles',
      'spikes.entryDamage', 'spikes.monsterTurnStartDamageRaw', 'spikes.playerTurnStartDamage', 'spikes.playersDoubledInside',
      'spikes.stackExitAndInside', 'spikes.exitVulnerabilityTurns', 'spikes.triggerWhenWalkingThrough',
      'spikes.walkThroughInterruptsMovement', 'spikes.retriggerOnMoveInside', 'spikes.auraAppliesMidSpell', 'spawn.mode',
      'spawn.seed', 'spawn.excludeOccupied', 'boss.arrivalFallback', 'boss.actsBeforeArrival',
      'boss.rassemblementBlockedByUnshakable', 'boss.rassemblementPullThenPush', 'boss.giftCancelsRassemblement',
      'boss.invulnerabilityLiftedBeforeEntryDamage', 'boss.invulnerabilityBackBeforeTurnStartSpikes',
      'boss.catastroollBonusScope', 'boss.levelForPushDamage', 'boss.favourCap', 'objectives.maxCount',
      'objectives.offerCount', 'objectives.offerDraw', 'objectives.tier6Offered', 'objectives.votePolicy',
      'objectives.pushKillsCount', 'objectives.glyphKillsCreditPlayer', 'objectives.solitudeBeforeArrival',
      'objectives.mamaCountsFromTurn', 'objectives.v100MeansFull', 'bonuses.offerCount', 'bonuses.draw',
      'bonuses.firstTurn', 'bonuses.lastTurn', 'bonuses.doubleApplication', 'bonuses.policy', 'gifts.spawnProbability',
      'gifts.cellDraw', 'gifts.cardCount', 'gifts.cardMix', 'gifts.pushedPlayerTriggers',
      'gifts.upgradedSpellGreyedUntilNextTurn', 'spells.newSpellUsableSameTurn', 'spells.penseVite.maxCasts',
      'spells.penseVite.turnSeconds', 'spells.relachementGrowthStart', 'spells.voltigeUpgradedMaxPerTurn',
      'spells.ggUpgradedKeepsRecastBonus', 'spells.jaillissementUpgradeBroken', 'spells.maledictionCollateraleChains',
      'spells.maledictionCollateraleHitsCarrier', 'spells.maledictionRegenerantePercent',
      'spells.maledictionRegeneranteZone', 'spells.pulsationChaotiqueBounceRange', 'spells.chamboulementBounceTarget',
      'spells.poutchLifetimeTurns', 'spells.protectionProlongeeSelfHeals', 'spells.delivranceWorks',
      'spells.coupDeSangCreatesErosion', 'spells.impactCritHitsPoutch', 'archetypes.hpMode', 'archetypes.dompteurPower',
      'rng.rollMode', 'rng.critMode', 'rng.seed', 'rng.rollDistribution', 'engine.subSpellsIgnoreCastConditions',
      'engine.pushLevelForArchetypes', 'victory.canFinishFromTurn', 'victory.turnLimit', 'map.dynamicObstacles',
    ];
    for (const p of required) expect(defaultConfig._doc[p], p).toBeDefined();
  });

  it('chaque référence $config des données existe dans la configuration', () => {
    const refs = collectConfigRefs(D, new Set());
    expect(refs.size).toBeGreaterThan(20);
    for (const r of refs) expect(() => getConfigValue(defaultConfig as SimConfig, r), r).not.toThrow();
    expect(resolveConfigRef(D.boss.arrival.fallback, defaultConfig as SimConfig)).toEqual([287, 'axisTowardWaitCell', 'nearestFree']);
    expect(resolveConfigRef(42, defaultConfig as SimConfig)).toBe(42);
  });

  it('loadConfig fusionne profondément une configuration partielle', () => {
    const c = loadConfig({ spikes: { playersDoubledInside: true }, spells: { penseVite: { maxCasts: 5 } },
      timeline: { playerOrder: ['acrobate', 'acrobate', 'dompteur', 'magicien'] }, spawn: { seed: 7 } });
    expect(c.spikes.playersDoubledInside).toBe(true);
    expect(c.spikes.playerTurnStartDamage).toBe(1000);
    expect(c.spells.penseVite).toEqual({ maxCasts: 5, turnSeconds: 10 });
    expect(c.timeline.playerOrder).toEqual(['acrobate', 'acrobate', 'dompteur', 'magicien']);
    expect(c.spawn.seed).toBe(7);
    // copie neuve, défaut intact
    expect(defaultConfig.spikes.playersDoubledInside).toBe(false);
    c.gifts.cells.push(1);
    expect(defaultConfig.gifts.cells).toHaveLength(7);
    expect(loadConfig().boss.favourCap).toBeNull();
    expect(loadConfig({ boss: { favourCap: 5 } }).boss.favourCap).toBe(5);
    expect(loadConfig({ ai: { profiles: { mama: { preferredDistance: [2, 3] } } } }).ai.profiles.mama.spells).toHaveLength(4);
  });

  it('loadConfig refuse les paramètres inconnus ou mal typés', () => {
    expect(() => loadConfig({ spikes: { playerTurnStartDmg: 2000 } } as never)).toThrow(/paramètre inconnu : spikes.playerTurnStartDmg/);
    expect(() => loadConfig({ timeline: { model: 'aucun' } } as never)).toThrow(/timeline.model/);
    expect(() => loadConfig({ gifts: { spawnProbability: 1.5 } })).toThrow(/gifts.spawnProbability/);
    expect(() => loadConfig({ timeline: { playerOrder: [] } })).toThrow(/au moins 1/);
    expect(() => loadConfig({ boss: { arrivalFallback: [287, 'ailleurs'] } } as never)).toThrow(/boss.arrivalFallback/);
    expect(() => loadConfig({ rng: { seed: 1.5 } })).toThrow(/rng.seed/);
  });
});

describe('générateur', () => {
  const python = spawnSync('python3', ['--version']);
  it.skipIf(python.status !== 0)('build:data est idempotent (fichiers à jour)', () => {
    const r = spawnSync('python3', ['tools/simdata/build_sim_data.py', '--check'], { cwd: ROOT, encoding: 'utf-8' });
    expect(r.stderr).toBe('');
    expect(r.status, r.stdout).toBe(0);
  });
});
