/**
 * Scénario — mise en place (ETUDE §2.2 « Lancement », §3.5, §4.1, §6.2) : placement, sorts de départ, archétypes,
 * pics, objectif imposé, V1 (T15), timeline initiale, premier point de décision.
 */
import { describe, expect, it } from 'vitest';
import { gameData, loadConfig } from '../src/data/index.js';
import { createFight, Stat } from '../src/engine/index.js';
import { createGladiatroolFight, createScenarioContext, GladiatroolFight } from '../src/scenario/index.js';
import { DET, newFight } from './helpers/scenarioSetup.js';

describe('mise en place du combat', () => {
  it('par défaut : A-D-D-M (config), placement 314 / 287 / 286 / 315, Mama sur 152, entité de scénario hors carte', () => {
    const fight = newFight();
    const s = fight.state;
    const players = fight.getPlayers();
    expect(players.map((p) => p.archetype)).toEqual(['acrobate', 'dompteur', 'dompteur', 'magicien']);
    expect(players.map((p) => p.cell)).toEqual([314, 287, 286, 315]);
    expect(players.map((p) => p.name)).toEqual(['Acrobate', 'Dompteur 1', 'Dompteur 2', 'Magicien']);
    const mama = fight.getMama()!;
    expect(mama.cell).toBe(152);
    expect(mama.monsterId).toBe(7984);
    const sce = s.fighters[fight.scenario.sceId]!;
    expect([sce.team, sce.cell]).toEqual(['scenario', -1]);
    expect(s.timeline).not.toContain(sce.id);
  });

  it('T15 : V1 = 2 Troollibres sur 242 et 358, avec leur passif (sortie des pics 30700)', () => {
    const fight = newFight();
    const v1 = fight.scenario.waves[0]!;
    expect(v1.wave).toBe(1);
    expect(v1.cells).toEqual([242, 358]);
    for (const id of v1.fighterIds) {
      const t = fight.state.fighters[id]!;
      expect(t.monsterId).toBe(7981);
      expect(t.buffs.some((b) => b.spellId === 30700)).toBe(true);
    }
    expect(fight.getLivingMonsters().map((f) => f.monsterId).sort()).toEqual([7981, 7981, 7984]);
  });

  it('sorts de départ : passif 30639 sans bonus conditionnels (PV 30 000, Puissance 0), états d’archétype, grimoire initial', () => {
    const fight = newFight();
    const expected: Record<string, [number, number]> = { acrobate: [5900, 80507], dompteur: [5899, 80500], magicien: [5901, 80514] };
    for (const p of fight.getPlayers()) {
      const [state, start] = expected[p.archetype!]!;
      expect(p.hasState(5970)).toBe(true);
      expect(p.hasState(state)).toBe(true);
      expect([p.hp, p.maxHp]).toEqual([30000, 30000]);
      expect(p.stat(Stat.POWER)).toBe(0);
      expect(p.spells.map((x) => x.spellLevelId)).toEqual([80499, start]);
    }
    // durée du tour (3407 du passif) : lue au début du tour de J1
    expect(fight.getCurrentFighter()!.turnSeconds).toBe(60);
  });

  it('Mama : passif 30430 (pré-combat 5971, tour annulé, invulnérable 56, Faveur V +25 % DF)', () => {
    const fight = newFight();
    const mama = fight.getMama()!;
    expect(mama.hasState(5971)).toBe(true);
    expect(mama.hasState(56)).toBe(true);
    expect(mama.hasState(5973)).toBe(true);
    expect(mama.stat(Stat.FINAL_DAMAGE)).toBe(25);
    // son tour du T1 a été annulé avant celui de J1
    expect(fight.state.log!.ofType('turnCancelled').map((e) => e.fighterId)).toEqual([mama.id]);
  });

  it('pics (96 cases) posés par l’entité de scénario ; objectif imposé Empalé ; déclencheurs des votes sur l’entité', () => {
    const fight = newFight();
    const s = fight.state;
    const spikes = s.marks.filter((m) => m.sourceSpellId === 30390);
    expect(spikes.map((m) => m.type).sort()).toEqual(['aura', 'glyphTurnStart']);
    for (const m of spikes) {
      expect(m.cells.length).toBe(96);
      expect(m.casterId).toBe(fight.scenario.sceId);
    }
    expect(fight.getActiveObjective()?.id).toBe('empale');
    const sce = s.fighters[fight.scenario.sceId]!;
    expect(sce.buffs.filter((b) => b.spellId === 30443 && b.kind === 'triggered')).toHaveLength(5);
    // l'objectif Empalé des données (30428) n'est pas lancé sur les joueurs : suivi déclaratif
    for (const p of fight.getPlayers()) expect(p.hasState(6026)).toBe(false);
  });

  it('premier point de décision : T1, la Mama en tête (tour annulé), puis J1 ; timeline J1, M1, J2, M2, J3, J4', () => {
    const fight = newFight();
    expect(fight.turn).toBe(1);
    expect(fight.getStatus()).toEqual({ kind: 'playerTurn', fighterId: fight.scenario.playerIds[0] });
    expect(fight.isPlayerTurn()).toBe(true);
    const [j1, j2, j3, j4] = fight.scenario.playerIds;
    const [m1, m2] = fight.scenario.waves[0]!.fighterIds;
    expect(fight.getTimeline().ids).toEqual([fight.scenario.mamaId, j1, m1, j2, m2, j3, j4]);
  });

  it('composition et cases imposées ; noms numérotés ; 1 à 4 joueurs', () => {
    const fight = newFight(DET, {
      players: [
        { archetype: 'acrobate', startCell: 287 },
        { archetype: 'acrobate' },
        { archetype: 'dompteur', name: 'Grosbill' },
        { archetype: 'magicien', startCell: 314 },
      ],
    });
    const players = fight.getPlayers();
    expect(players.map((p) => p.cell)).toEqual([287, 286, 315, 314]);
    expect(players.map((p) => p.name)).toEqual(['Acrobate 1', 'Acrobate 2', 'Grosbill', 'Magicien']);
    const solo = newFight(DET, { players: [{ archetype: 'dompteur' }] });
    expect(solo.getPlayers()).toHaveLength(1);
    expect(solo.getTimeline().ids).toEqual([solo.scenario.mamaId, solo.scenario.playerIds[0], ...solo.scenario.waves[0]!.fighterIds]);
    expect(() => newFight(DET, { players: [] })).toThrow(/1 à 4 joueurs/);
    expect(() => newFight(DET, { players: Array.from({ length: 5 }, () => ({ archetype: 'acrobate' as const })) })).toThrow(/1 à 4/);
    expect(() => newFight(DET, { players: [{ archetype: 'acrobate', startCell: 300 }] })).toThrow(/Case de départ invalide/);
    expect(() =>
      newFight(DET, { players: [{ archetype: 'acrobate', startCell: 286 }, { archetype: 'magicien', startCell: 286 }] }),
    ).toThrow(/deux fois/);
  });

  it('timeline.playerOrder de la configuration ; hpMode passiveApplies et dompteurPower (configuration)', () => {
    const fight = createGladiatroolFight(gameData, loadConfig({ timeline: { playerOrder: ['magicien', 'acrobate'] }, archetypes: { hpMode: 'passiveApplies', dompteurPower: 3000 } }));
    const [m, a] = fight.getPlayers();
    expect([m!.archetype, a!.archetype]).toEqual(['magicien', 'acrobate']);
    expect(a!.maxHp).toBe(35000);
    expect(m!.maxHp).toBe(25000);
    const d = createGladiatroolFight(gameData, loadConfig({ timeline: { playerOrder: ['dompteur'] }, archetypes: { dompteurPower: 3000 } }));
    expect(d.getPlayers()[0]!.stat(Stat.POWER)).toBe(3000);
  });

  it('contexte réutilisable (createScenarioContext) ; autoStart faux : statut idle puis advance()', () => {
    const ctx = createScenarioContext({ overrides: DET });
    const a = createGladiatroolFight(undefined, undefined, { seed: 4, options: { ctx, autoStart: false } });
    expect(a.getStatus()).toEqual({ kind: 'idle' });
    expect(a.turn).toBe(0);
    expect(a.advance().kind).toBe('playerTurn');
    const b = createGladiatroolFight(undefined, undefined, { seed: 4, options: { ctx } });
    expect(b.ctx).toBe(a.ctx);
    expect(b.getStatus()).toEqual(a.getStatus());
    expect(() => new GladiatroolFight(createFight(ctx))).toThrow(/scénario/);
  });
});
