/**
 * Écran « Résultats » : synthèse lisible de docs/RESULTATS.md et des expériences sim/results/*.json (module
 * virtuel ``virtual:resultats`` : statistiques par variante, sans les combats bruts) — taux de victoire avec IC de
 * Wilson, ADDM contre AADM, sensibilité aux hypothèses, politiques, tour de mort de la Mama.
 */
import results from 'virtual:resultats';
import { DiffChart, GroupedHistogram, WinRateChart, type RateGroup, type RateRow } from '../components/charts.js';
import { fmtDec, fmtP, fmtPct } from '../model/format.js';
import type { ExperimentSummary, VariantSummary } from '../model/resultsExtract.js';

const HYPOTHESES: Record<string, string> = {
  base: 'Hypothèses par défaut',
  q3: 'Joueurs ×2 dans les pics (Q3)',
  q4: 'Pics : 2 000 au début du tour des joueurs (Q4)',
  q1a: 'Timeline : Troolls par initiative (Q1)',
  q1b: 'Timeline : tous les Troolls après la Mama (Q1)',
  q1c: 'Timeline : nouveaux venus en tête (Q1)',
  q5: 'Apparitions uniformes (Q5)',
  q2a: 'IA : cible la plus faible (Q2)',
  q2b: 'IA : joue même dans les pics (Q2)',
  q2c: 'IA : séquence gloutonne (Q2)',
  q12: '3 objectifs proposés par vote (Q12)',
  q14: 'Cadeaux rares, p = 0,3 (Q14)',
  q20: 'PV par archétype : A 35 000, M 25 000 (Q20)',
};

const POLICY: Record<string, string> = {
  '': 'Politique par défaut (planificateur)',
  'bonus PO_first': 'Acclamations : PO d\'abord',
  'bonus PA_first': 'Acclamations : PA d\'abord',
  'bonus DF_first': 'Acclamations : dommages d\'abord',
  'vote fixed': 'Votes : liste fixe',
  'vote preference': 'Votes : préférence seule',
};

function colorOf(compo: string | null): string {
  if (!compo) return 'var(--series-muted)';
  const c = compo.split(/[ =@]/)[0];
  return c === 'ADDM' ? 'var(--series-1)' : c === 'AADM' ? 'var(--series-2)' : 'var(--series-muted)';
}

function rateRow(v: VariantSummary, label?: string): RateRow {
  return { key: v.name, label: label ?? v.name, wins: v.wins, runs: v.runs, rate: v.winRate, ci: v.ci, color: colorOf(v.compo ?? v.name) };
}

function exp(id: string): ExperimentSummary | undefined {
  return results[id];
}

/** Variantes appariées ADDM / AADM par groupe (nom sans la composition). */
function pairedGroups(e: ExperimentSummary | undefined, labelOf: (rest: string) => string, strip = /^(ADDM|AADM)\s*/): RateGroup[] {
  if (!e) return [];
  const groups = new Map<string, RateGroup>();
  for (const v of e.variants) {
    const rest = v.name.replace(strip, '').replace(/^pess\s*/, '').trim();
    const key = rest || 'base';
    const g = groups.get(key) ?? { key, label: labelOf(rest), rows: [] };
    g.rows.push(rateRow(v, v.name.startsWith('ADDM') ? 'ADDM' : v.name.startsWith('AADM') ? 'AADM' : v.name));
    groups.set(key, g);
  }
  return [...groups.values()];
}

function Section({ id, title, children, lede }: { id: string; title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {lede ? <p className="lede small">{lede}</p> : null}
      {children}
    </section>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export function ResultsScreen() {
  const ref = exp('compos-ref');
  const addm = ref?.variants.find((v) => v.name === 'ADDM');
  const aadm = ref?.variants.find((v) => v.name === 'AADM');
  const cmpRef = ref?.comparisons[0];
  const cad = exp('cadeaux');
  const cadAddm = cad?.variants.find((v) => v.name === 'ADDM q14');
  const cadAadm = cad?.variants.find((v) => v.name === 'AADM q14');
  const mamaCats = [8, 9, 10, 11, 12, 13].map((t) => ({ key: String(t), label: `T${t}` }));
  const mamaSeries = (list: (VariantSummary | undefined)[]) =>
    list
      .filter((v): v is VariantSummary => !!v)
      .map((v) => {
        const counts: Record<string, number> = {};
        for (const [k, n] of Object.entries(v.mamaHist)) {
          const t = Number(k);
          const key = t === 0 || t >= 14 ? '14+' : String(t);
          counts[key] = (counts[key] ?? 0) + n;
        }
        return { key: v.name, label: v.name, color: colorOf(v.compo ?? v.name), counts, total: v.runs };
      });
  const winCats = [10, 11, 12, 13, 14].map((t) => ({ key: String(t), label: `T${t}` }));
  const winSeries = (list: (VariantSummary | undefined)[]) =>
    list
      .filter((v): v is VariantSummary => !!v)
      .map((v) => {
        const counts: Record<string, number> = {};
        for (const [k, n] of Object.entries(v.winHist)) {
          const t = Number(k);
          const key = t === 0 ? 'x' : t >= 14 ? '14' : String(t);
          counts[key] = (counts[key] ?? 0) + n;
        }
        return { key: v.name, label: v.name, color: colorOf(v.compo ?? v.name), counts, total: v.runs };
      });

  const compos = exp('compos-autres');
  const eff = exp('effectifs');
  const sens = exp('sensibilite');
  const pess = exp('pessimiste');
  const bonus = exp('bonus');
  const bonusPess = exp('bonus-pess');
  const votes = exp('votes');
  const placement = exp('placement');
  const oracle = exp('oracle');

  const sensDiffs = (sens?.comparisons ?? []).filter((c) => /^AADM/.test(c.a) && /^ADDM/.test(c.b));

  return (
    <div className="stack">
      <Section
        id="res-resume"
        title="Résumé des expériences"
        lede={
          <>
            Expériences Monte Carlo du planificateur (mode fast, déterministe) sur des graines jamais utilisées pendant sa mise au point (1001 et plus).
            Toutes les variantes d'une expérience jouent les mêmes graines (comparaisons appariées, test exact de McNemar). Détails : docs/RESULTATS.md.
          </>
        }
      >
        <div className="kpis">
          {addm ? <Kpi value={`${addm.wins} / ${addm.runs}`} label={`ADDM, victoires (${fmtPct(addm.winRate)})`} /> : null}
          {aadm ? <Kpi value={`${aadm.wins} / ${aadm.runs}`} label={`AADM, victoires (${fmtPct(aadm.winRate)})`} /> : null}
          {cmpRef ? <Kpi value={`${cmpRef.aOnly} / ${cmpRef.bOnly}`} label={`graines gagnées par ${cmpRef.a} seule / ${cmpRef.b} seule (${fmtP(cmpRef.p)})`} /> : null}
          {cmpRef ? <Kpi value={`+${fmtDec(cmpRef.turnDiff.mean, 2)} tour`} label="tour de fin moyen, AADM − ADDM" /> : null}
          {cadAddm && cadAadm ? <Kpi value={`${fmtPct(cadAddm.winRate, 0)} / ${fmtPct(cadAadm.winRate, 0)}`} label="cadeaux rares (Q14) : ADDM / AADM" /> : null}
        </div>
        <ul className="small" style={{ marginTop: 12, paddingLeft: '1.2rem' }}>
          <li>
            <strong>Il faut un Acrobate et quatre joueurs</strong> : sans Acrobate (DDDM) 20 % de victoires ; à 3 joueurs, ADM 73 %, AAD 40 %, ADD 17 % ; à 2
            joueurs ou moins, aucune victoire.
          </li>
          <li>
            <strong>ADDM et AADM ne se départagent pas</strong> sur le taux de victoire avec les hypothèses par défaut (196 et 198 sur 200) ni dans le scénario
            pessimiste (58,8 % et 59,4 %).
          </li>
          <li>
            <strong>Profils différents</strong> : ADDM tue la Mama environ un tour plus tôt (au T8 dans 41 % des combats, contre 3 % pour AADM) ; AADM met plus
            de monstres en pics.
          </li>
          <li>
            <strong>Cadeaux rares → AADM</strong> : 95 % contre 81 % (p &lt; 0,001) ; ADDM dépend du Relâchement de Fureur des cadeaux.
          </li>
          <li>
            <strong>Une seule hypothèse renverse le jeu</strong> : tous les Troolls après la Mama (Q1) → aucune victoire. À trancher en priorité, puis Q14 et Q2.
          </li>
          <li>Limites : IA des monstres non validée sur des combats réels ; le planificateur n'est pas un joueur ; conclusions valables pour ce simulateur.</li>
        </ul>
      </Section>

      <div className="split-even">
        <Section id="res-compos" title="Compositions à 4 joueurs" lede={compos ? `${compos.seeds}, ${compos.variants[0]?.runs ?? 0} graines par composition (ordre de jeu).` : undefined}>
          {compos ? <WinRateChart idPrefix="res-compos" title="Taux de victoire par composition à 4 joueurs" groups={[{ key: 'c', label: '', rows: compos.variants.map((v) => rateRow(v)) }]} /> : <p className="muted">Données absentes.</p>}
        </Section>
        <Section id="res-effectifs" title="Effectifs réduits" lede={eff ? `${eff.seeds} : 4, 3, 2 et 1 joueurs.` : undefined}>
          {eff ? <WinRateChart idPrefix="res-effectifs" title="Taux de victoire selon le nombre de joueurs" groups={[{ key: 'e', label: '', rows: eff.variants.map((v) => rateRow(v)) }]} /> : null}
        </Section>
      </div>

      <Section
        id="res-addm-aadm"
        title="ADDM contre AADM (200 graines)"
        lede={
          cmpRef ? (
            <>
              Graines gagnées par une seule composition : {cmpRef.a} {cmpRef.aOnly}, {cmpRef.b} {cmpRef.bOnly} ({fmtP(cmpRef.p)}). Écart de progression {cmpRef.a} −{' '}
              {cmpRef.b} : {fmtDec(100 * cmpRef.progressDiff.mean, 2)} point [{fmtDec(100 * cmpRef.progressDiff.low, 2)} ; {fmtDec(100 * cmpRef.progressDiff.high, 2)}]. La
              différence nette porte sur le rythme contre la Mama.
            </>
          ) : undefined
        }
      >
        <div className="split-even">
          <div>
            <h3>Tour de mort de la Mama</h3>
            <GroupedHistogram
              idPrefix="res-mama"
              title="Répartition du tour de mort de la Mama, ADDM et AADM"
              categories={[...mamaCats, { key: '14+', label: 'T14+ / jamais' }]}
              series={mamaSeries([addm, aadm])}
              categoryLabel="tour"
            />
          </div>
          <div>
            <h3>Tour de victoire</h3>
            <GroupedHistogram
              idPrefix="res-victoire"
              title="Répartition du tour de victoire, ADDM et AADM"
              categories={[...winCats.slice(0, 4), { key: '14', label: 'T14+' }, { key: 'x', label: 'défaite' }]}
              series={winSeries([addm, aadm])}
              categoryLabel="tour de victoire"
            />
          </div>
        </div>
        {addm && aadm ? (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Variante</th>
                  <th scope="col" className="num">Victoires</th>
                  <th scope="col" className="num">IC 95 %</th>
                  <th scope="col" className="num">Progression</th>
                  <th scope="col" className="num">Tour final</th>
                  <th scope="col" className="num">Objectifs</th>
                  <th scope="col" className="num">Morts / combat</th>
                  <th scope="col" className="num">Mama tuée (tour moyen)</th>
                </tr>
              </thead>
              <tbody>
                {[addm, aadm].map((v) => (
                  <tr key={v.name}>
                    <td>
                      <span className="swatch" style={{ background: colorOf(v.name) }} />
                      {v.name}
                    </td>
                    <td className="num">
                      {v.wins} / {v.runs}
                    </td>
                    <td className="num">
                      {fmtPct(v.ci[0])} – {fmtPct(v.ci[1])}
                    </td>
                    <td className="num">{fmtPct(v.progress, 2)}</td>
                    <td className="num">{fmtDec(v.turn, 2)}</td>
                    <td className="num">{fmtDec(v.objectives, 2)}</td>
                    <td className="num">{fmtDec(v.deaths, 3)}</td>
                    <td className="num">
                      {fmtPct(v.mamaRate)} {v.mamaTurn !== null ? `(T${fmtDec(v.mamaTurn, 2)})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>

      <Section
        id="res-sensibilite"
        title="Sensibilité aux hypothèses non tranchées"
        lede={sens ? `${sens.seeds}, ADDM et AADM, une hypothèse à la fois (questions de research/QUESTIONS_OUVERTES.md).` : undefined}
      >
        {sens ? <WinRateChart idPrefix="res-sens" title="Taux de victoire d'ADDM et d'AADM sous chaque hypothèse" groups={pairedGroups(sens, (r) => HYPOTHESES[r || 'base'] ?? r)} /> : null}
        {sensDiffs.length ? (
          <>
            <h3 style={{ marginTop: 12 }}>Écart de progression AADM − ADDM (apparié)</h3>
            <DiffChart
              title="Écart de progression apparié AADM moins ADDM par hypothèse"
              unit="pt"
              rows={sensDiffs.map((c) => {
                const g = c.a.replace(/^AADM\s*/, '');
                return { key: c.a, label: HYPOTHESES[g || 'base'] ?? g, mean: 100 * c.progressDiff.mean, low: 100 * c.progressDiff.low, high: 100 * c.progressDiff.high };
              })}
            />
          </>
        ) : null}
      </Section>

      <div className="split-even">
        <Section id="res-cadeaux" title="Cadeaux rares (Q14), 160 graines" lede="Probabilité d'un cadeau par tour : 0,72 (défaut) ou 0,3.">
          {cad ? <WinRateChart idPrefix="res-cadeaux" title="Taux de victoire selon la fréquence des cadeaux" groups={pairedGroups(cad, (r) => (r ? 'Cadeaux rares (p = 0,3)' : 'Cadeaux fréquents (p = 0,72)'))} /> : null}
          {cad ? <MamaByVariant e={cad} /> : null}
        </Section>
        <Section id="res-pessimiste" title="Scénario pessimiste combiné" lede="Q3 (×2 dans les pics) + Q4 (2 000 au début du tour) + Q2 (les monstres jouent dans les pics) + Q14 (cadeaux rares), 160 graines.">
          {pess ? <WinRateChart idPrefix="res-pess" title="Taux de victoire dans le scénario pessimiste" groups={[{ key: 'p', label: '', rows: pess.variants.map((v) => rateRow(v)) }]} /> : null}
          {pess?.comparisons[0] ? (
            <p className="small">
              Graines gagnées par une seule composition : {pess.comparisons[0].a} {pess.comparisons[0].aOnly}, {pess.comparisons[0].b} {pess.comparisons[0].bOnly} (
              {fmtP(pess.comparisons[0].p)}).
            </p>
          ) : null}
          {oracle ? (
            <>
              <h3 style={{ marginTop: 12 }}>Effet de l'information cachée</h3>
              <p className="small muted">Planificateur tricheur (connaît les tirages futurs) contre planificateur corrigé, scénario pessimiste, 80 graines.</p>
              <WinRateChart idPrefix="res-oracle" title="Planificateur corrigé contre tricheur" groups={[{ key: 'o', label: '', rows: oracle.variants.map((v) => rateRow(v, v.name.replace(' pess oracle', ', tricheur').replace(' pess', ', corrigé'))) }]} />
            </>
          ) : null}
        </Section>
      </div>

      <Section id="res-politiques" title="Politiques de choix" lede="Acclamations (bonus), votes d'objectifs et placement initial, 60 graines. Avec les hypothèses par défaut, on est au plafond : seuls les scénarios dégradés discriminent.">
        <div className="split-even">
          <div>
            <h3>Acclamations, hypothèses par défaut</h3>
            {bonus ? <WinRateChart idPrefix="res-bonus" title="Taux de victoire selon la politique d'Acclamation" groups={pairedGroups(bonus, (r) => POLICY[r] ?? r)} /> : null}
          </div>
          <div>
            <h3>Acclamations, scénario pessimiste</h3>
            {bonusPess ? <WinRateChart idPrefix="res-bonus-pess" title="Taux de victoire selon la politique d'Acclamation, scénario pessimiste" groups={pairedGroups(bonusPess, (r) => POLICY[r] ?? r)} /> : null}
            <p className="small">« PO d'abord pour tous » dégrade nettement ADDM dans le scénario difficile (48 % contre 68 %, p = 0,017) : les Dompteurs perdent leurs dommages finaux.</p>
          </div>
          <div>
            <h3>Votes d'objectifs</h3>
            {votes ? <WinRateChart idPrefix="res-votes" title="Taux de victoire selon la politique de vote" groups={pairedGroups(votes, (r) => POLICY[r] ?? r)} /> : null}
          </div>
          <div>
            <h3>Placement initial</h3>
            {placement ? <WinRateChart idPrefix="res-placement" title="Taux de victoire selon le placement initial" groups={[{ key: 'pl', label: '', rows: placement.variants.map((v) => rateRow(v)) }]} /> : null}
          </div>
        </div>
      </Section>

      <Section id="res-limites" title="Limites et reproduction">
        <ul className="small" style={{ paddingLeft: '1.2rem' }}>
          <li>L'IA des monstres est paramétrée d'après les données et les vidéos, sans validation quantitative contre des combats réels.</li>
          <li>Effet plafond : avec les hypothèses par défaut, presque tous les combats sont gagnés ; les politiques n'y ont aucune puissance de comparaison.</li>
          <li>40 à 200 graines par variante : un écart réel de 1 à 3 points de taux de victoire reste indétectable.</li>
          <li>Le planificateur n'est pas un joueur humain ; il imagine un seul futur plausible (graine neutralisée), pas une espérance sur plusieurs tirages.</li>
          <li>
            Reproduire : <code>npm run cli -- comparer --compos ADDM,AADM --graines 1001-1200</code> ; campagnes complètes : docs/RESULTATS.md, section 8.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function MamaByVariant({ e }: { e: ExperimentSummary }) {
  return (
    <div className="table-wrap">
      <table className="data-table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th scope="col">Variante</th>
            <th scope="col" className="num">Morts / combat</th>
            <th scope="col" className="num">Mama tuée au T8</th>
            <th scope="col" className="num">Mama jamais tuée ou après T13</th>
          </tr>
        </thead>
        <tbody>
          {e.variants.map((v) => {
            const t8 = v.mamaHist['8'] ?? 0;
            const late = Object.entries(v.mamaHist).filter(([k]) => Number(k) === 0 || Number(k) > 13).reduce((s, [, n]) => s + n, 0);
            return (
              <tr key={v.name}>
                <td>
                  <span className="swatch" style={{ background: colorOf(v.name) }} />
                  {v.name.replace(' q14', ', cadeaux rares')}
                </td>
                <td className="num">{fmtDec(v.deaths, 2)}</td>
                <td className="num">{fmtPct(t8 / v.runs, 0)}</td>
                <td className="num">{fmtPct(late / v.runs, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
