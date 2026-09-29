/**
 * Explications en français des plans : ce que fait chaque action (dégâts, poussées, entrées dans les pics, morts,
 * objectifs, cadeaux), bilan du tour, risques (menace estimée, pics, lignes de la Mama) et résultat de
 * l'anticipation (tours des monstres simulés). Tout est calculé par DIFFÉRENCE entre états simulés.
 */
import { fmtNum, Stat } from '../engine/index.js';
import type { GladiatroolFight } from '../scenario/index.js';
import type { MacroAction } from './actions.js';
import { evaluateWithDetail, monsterInSpikes, playerInSpikes } from './evaluate.js';
import type { PlanSummary, TargetDamage } from './types.js';
import type { PlannerWeights } from './weights.js';

interface FighterDiff {
  id: number;
  name: string;
  team: string;
  hpBefore: number;
  hpAfter: number;
  diedNow: boolean;
  cellBefore: number;
  cellAfter: number;
  enteredSpikes: boolean;
  exitedSpikes: boolean;
}

function inSpikes(fight: GladiatroolFight, id: number): boolean {
  const f = fight.state.fighters[id];
  if (!f || !f.alive || f.cell < 0) return false;
  return f.team === 'monsters' ? monsterInSpikes(fight.state, f) : playerInSpikes(fight.state, f);
}

/** Différences par combattant entre deux états (combattants présents dans ``before``). */
export function diffFighters(before: GladiatroolFight, after: GladiatroolFight): FighterDiff[] {
  const out: FighterDiff[] = [];
  const bf = before.state.fighters;
  const af = after.state.fighters;
  for (let i = 0; i < bf.length; i++) {
    const b = bf[i]!;
    const a = af[i];
    if (!a || b.team === 'scenario' || !b.alive) continue;
    out.push({
      id: b.id,
      name: b.name,
      team: b.team,
      hpBefore: b.hp,
      hpAfter: a.alive ? a.hp : 0,
      diedNow: !a.alive,
      cellBefore: b.cell,
      cellAfter: a.alive ? a.cell : a.deathCell,
      enteredSpikes: !inSpikes(before, b.id) && (a.alive ? inSpikes(after, a.id) : a.deathCell >= 0 && after.ctx.grid.isSpike(a.deathCell)),
      exitedSpikes: inSpikes(before, b.id) && a.alive && !inSpikes(after, a.id),
    });
  }
  return out;
}

function spellName(fight: GladiatroolFight, spellLevelId: number): string {
  return fight.ctx.getSpell(spellLevelId).name;
}

const STAT_LABELS: Readonly<Record<number, string>> = {
  [Stat.AP]: 'PA',
  [Stat.MP]: 'PM',
  [Stat.RANGE]: 'PO',
  [Stat.CRIT]: '% critique',
  [Stat.FINAL_DAMAGE]: '% dommages finaux',
};

/** Boosts (PA, PM, PO, DF, critique) et boucliers gagnés par les joueurs entre deux états. */
function describeBoosts(before: GladiatroolFight, after: GladiatroolFight): string[] {
  const out: string[] = [];
  for (const a of after.state.fighters) {
    if (!a.alive || a.team !== 'players') continue;
    const b = before.state.fighters[a.id];
    if (!b) continue;
    const old = new Set(b.buffs.map((x) => x.uid));
    const bits: string[] = [];
    for (const buff of a.buffs) {
      if (old.has(buff.uid) || buff.kind !== 'stat' || buff.value <= 0) continue;
      const label = STAT_LABELS[buff.stat];
      if (!label) continue;
      const when = buff.delay > 0 ? ' au prochain tour' : '';
      bits.push(`+${buff.value} ${label}${when}`);
    }
    const dsh = a.shield - (b.alive ? b.shield : 0);
    if (dsh > 0) bits.push(`bouclier +${fmtNum(dsh)}`);
    if (bits.length) out.push(`${a.name} ${bits.join(', ')}`);
  }
  return out;
}

/** Description d'une macro-action (lignes françaises). */
export function describeMacro(before: GladiatroolFight, after: GladiatroolFight, macro: MacroAction, actorId: number, finalMove: boolean): string {
  const parts: string[] = [];
  const actor = before.state.fighters[actorId]!;
  if (macro.path.length) {
    const to = macro.path[macro.path.length - 1]!;
    const pm = macro.moveCost;
    parts.push(`${finalMove ? 'Fin de tour : déplacement' : 'Déplacement'} ${actor.cell} → ${to} (${pm} PM)`);
  }
  if (macro.spellLevelId !== null) {
    const effects: string[] = [];
    for (const d of diffFighters(before, after)) {
      if (d.id === actorId && d.hpAfter === d.hpBefore && !d.diedNow) {
        if (d.cellAfter !== d.cellBefore && d.cellAfter !== (macro.path[macro.path.length - 1] ?? d.cellBefore)) {
          effects.push(`${d.name} ${d.cellBefore} → ${d.cellAfter}`);
        }
        continue;
      }
      const bits: string[] = [];
      const moved = d.cellAfter !== d.cellBefore && !(d.id === actorId && macro.path.length && d.cellAfter === macro.path[macro.path.length - 1]);
      if (moved) bits.push(`${d.cellBefore} → ${d.cellAfter}${d.enteredSpikes ? ' (pics)' : ''}`);
      else if (d.enteredSpikes) bits.push('entre dans les pics');
      const dhp = d.hpAfter - d.hpBefore;
      if (dhp < 0) bits.push(`${fmtNum(dhp)} PV`);
      else if (dhp > 0) bits.push(`+${fmtNum(dhp)} PV`);
      if (d.diedNow) bits.push('MORT');
      if (bits.length) effects.push(`${d.name} ${bits.join(', ')}`);
    }
    effects.push(...describeBoosts(before, after));
    const target = macro.cell >= 0 ? ` sur ${macro.cell}` : '';
    parts.push(`${spellName(before, macro.spellLevelId)}${target}${effects.length ? ' : ' + effects.join(' ; ') : ' : sans effet visible'}`);
  }
  const bsc = before.scenario;
  const asc = after.scenario;
  for (const o of asc.completed.slice(bsc.completed.length)) parts.push(`objectif « ${o.name} » validé`);
  if (asc.giftsTaken > bsc.giftsTaken) parts.push('cadeau ramassé');
  const learned = after.state.fighters[actorId]?.spells.filter((s) => !actor.spells.some((x) => x.spellLevelId === s.spellLevelId)) ?? [];
  if (learned.length) parts.push(`sorts appris : ${learned.map((s) => spellName(after, s.spellLevelId)).join(', ')}`);
  return parts.join(' — ');
}

/** Bilan structuré d'un tour planifié (racine → feuille, puis anticipation éventuelle). */
export function summarize(
  root: GladiatroolFight,
  leaf: GladiatroolFight,
  look: GladiatroolFight | null,
  actorId: number,
  weights: PlannerWeights,
): PlanSummary {
  const diffs = diffFighters(root, leaf);
  const targets: TargetDamage[] = [];
  let damageDealt = 0;
  const enteredSpikes: string[] = [];
  const kills: string[] = [];
  const playerDeaths: string[] = [];
  for (const d of diffs) {
    if (d.team === 'monsters') {
      const dmg = d.hpBefore - d.hpAfter;
      if (dmg !== 0 || d.enteredSpikes || d.diedNow) {
        targets.push({ id: d.id, name: d.name, damage: dmg, killed: d.diedNow, enteredSpikes: d.enteredSpikes });
        damageDealt += Math.max(0, dmg);
      }
      if (d.enteredSpikes) enteredSpikes.push(d.name);
      if (d.diedNow) kills.push(d.name);
    } else if (d.team === 'players' && d.diedNow) playerDeaths.push(d.name);
  }
  const objectivesCompleted = leaf.scenario.completed.slice(root.scenario.completed.length).map((o) => o.name);
  const actor = leaf.state.fighters[actorId]!;
  const { detail } = evaluateWithDetail(leaf, weights);
  const risks: string[] = [];
  for (const t of detail.threats) {
    const p = leaf.state.fighters[t.playerId]!;
    if (t.deathRisk >= 0.25) {
      risks.push(`${p.name} risque de mourir (menace estimée ${fmtNum(t.expectedDamage)}, ${fmtNum(t.hp + t.shield)} PV et bouclier)`);
    } else if (t.expectedDamage >= 0.3 * p.maxHp) {
      risks.push(`${p.name} exposé (menace estimée ${fmtNum(t.expectedDamage)})`);
    }
    if (t.inSpikes) risks.push(`${p.name} est dans les pics`);
    if (t.onMamaLine) risks.push(`${p.name} est aligné avec la Mama (case ${detail.mamaLineCell}) : Rassemblement`);
    if (t.pushRisk) risks.push(`${p.name} peut être poussé dans les pics`);
  }
  if (detail.dyingInSpikes.length) {
    const names = detail.dyingInSpikes.map((id) => leaf.state.fighters[id]!.name);
    risks.push(`mourra seul dans les pics au début de son tour : ${names.join(', ')}`);
  }
  if (detail.mamaWindowOpen) risks.push('fenêtre de burst ouverte sur la Mama (dans les pics, vulnérable)');

  let lookahead: PlanSummary['lookahead'] = null;
  if (look) {
    const ld = diffFighters(leaf, look);
    let lost = 0;
    const pd: string[] = [];
    const md: string[] = [];
    for (const d of ld) {
      if (d.team === 'players') {
        lost += Math.max(0, d.hpBefore - d.hpAfter);
        if (d.diedNow) pd.push(d.name);
      } else if (d.team === 'monsters' && d.diedNow) md.push(d.name);
    }
    const st = look.getStatus();
    const who = st.kind === 'playerTurn' ? look.state.fighters[st.fighterId]!.name : null;
    lookahead = {
      untilFighter: who,
      turn: look.turn,
      playerHpLost: lost,
      playerDeaths: pd,
      monsterDeaths: md,
      objectivesCompleted: look.scenario.completed.slice(leaf.scenario.completed.length).map((o) => o.name),
    };
  }
  return {
    damageDealt,
    targets,
    enteredSpikes,
    kills,
    playerDeaths,
    objectivesCompleted,
    giftTaken: leaf.scenario.giftsTaken > root.scenario.giftsTaken,
    finalCell: actor.alive ? actor.cell : -1,
    finalInSpikes: actor.alive && leaf.ctx.grid.isSpike(actor.cell),
    apLeft: actor.alive ? actor.ap : 0,
    mpLeft: actor.alive ? actor.mp : 0,
    risks,
    lookahead,
  };
}

/** Texte français d'un plan : actions numérotées puis bilan, risques et anticipation. */
export function explanationText(actionLines: string[], s: PlanSummary, score: number): string {
  const out: string[] = [];
  if (!actionLines.length) out.push('Aucune action utile : fin du tour sur place.');
  actionLines.forEach((l, i) => out.push(`${i + 1}. ${l}`));
  if (s.targets.length) {
    const detail = s.targets
      .filter((t) => t.damage !== 0)
      .map((t) => `${t.name} : ${fmtNum(t.damage)}${t.killed ? ' (mort)' : ''}`)
      .join(', ');
    out.push(`Dégâts attendus : ${fmtNum(s.damageDealt)}${detail ? ` (${detail})` : ''}.`);
  }
  if (s.enteredSpikes.length) out.push(`Envoyés dans les pics : ${s.enteredSpikes.join(', ')}.`);
  if (s.kills.length) out.push(`Morts : ${s.kills.join(', ')}.`);
  if (s.objectivesCompleted.length) out.push(`Objectif validé : ${s.objectivesCompleted.join(', ')}.`);
  if (s.giftTaken) out.push('Cadeau ramassé.');
  out.push(`Fin du tour sur la case ${s.finalCell}${s.finalInSpikes ? ' (dans les pics)' : ''} ; PA restants ${s.apLeft}, PM restants ${s.mpLeft}.`);
  if (s.playerDeaths.length) out.push(`Joueurs morts pendant le tour : ${s.playerDeaths.join(', ')}.`);
  if (s.risks.length) out.push(`Risques : ${s.risks.join(' ; ')}.`);
  if (s.lookahead) {
    const l = s.lookahead;
    const bits: string[] = [];
    bits.push(`PV perdus par les joueurs ${fmtNum(l.playerHpLost)}`);
    if (l.monsterDeaths.length) bits.push(`morts chez les monstres : ${l.monsterDeaths.join(', ')}`);
    if (l.playerDeaths.length) bits.push(`joueurs morts : ${l.playerDeaths.join(', ')}`);
    if (l.objectivesCompleted.length) bits.push(`objectif validé : ${l.objectivesCompleted.join(', ')}`);
    const until = l.untilFighter ? `jusqu'au tour de ${l.untilFighter}` : `jusqu'au tour global ${l.turn}`;
    out.push(`Anticipation (${until}, jets moyens) : ${bits.join(' ; ')}.`);
  }
  out.push(`Score : ${fmtNum(Math.round(score))}.`);
  return out.join('\n');
}
