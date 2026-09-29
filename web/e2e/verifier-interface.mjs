#!/usr/bin/env node
/**
 * Vérification de l'interface web dans un vrai navigateur (Playwright + Chromium).
 *
 * Script MANUEL (hors `npm test`) : Playwright n'est pas une dépendance du dépôt. Usage :
 *
 *   npm run web:build
 *   npm i --prefix /tmp/pw playwright            # une fois, hors du dépôt
 *   PLAYWRIGHT_DIR=/tmp/pw CHROMIUM=/opt/pw-browsers/chromium node web/e2e/verifier-interface.mjs [options]
 *
 * Options :
 *   --url <url>          page à tester (défaut : file://…/web/dist/index.html ; p. ex. http://localhost:4173/ avec
 *                        `npm run web:preview`)
 *   --out <dossier>      captures d'écran (défaut : web/e2e/captures, ignoré par git si vous l'ajoutez à .gitignore)
 *   --sans-captures      saute la série de captures (5 écrans × 2 tailles × 2 thèmes)
 *   --sans-parcours      saute les parcours fonctionnels
 *
 * Variables : PLAYWRIGHT_DIR (dossier contenant node_modules/playwright ; sinon `import('playwright')`),
 * CHROMIUM (exécutable ; sinon celui de Playwright).
 *
 * Contrôles :
 *   1. Captures : chaque écran à 1280 × 800 et 400 × 850, thèmes clair et sombre (emulateMedia colorScheme), en
 *      faisant défiler la fenêtre (une capture pleine page redimensionnerait la fenêtre et fausserait la carte) ;
 *      erreurs et avertissements console, exceptions, requêtes externes (seules fonts.googleapis.com et
 *      fonts.gstatic.com sont tolérées), défilement horizontal de la page (scrollWidth > clientWidth), onglets
 *      coupés.
 *   2. Parcours : exemple T1 (2 Troollibres sur 242 / 358, 4 joueurs sur les cases de départ), meilleur tour
 *      (Acrobate : Troollibres envoyés dans les pics, temps mesuré, tracé sur la carte), « Appliquer », glisser-déposer
 *      d'un monstre puis nouveau plan, export / import (texte et fichier), simulation ADDM graine 1001 rejouée
 *      jusqu'à l'arrivée de la Mama sur 300 au T8, « Planifier depuis ici », onglet Résultats (chiffres de
 *      docs/RESULTATS.md), bascule de thème explicite.
 *
 * Code de sortie : 0 si tout passe, 1 sinon (le détail est imprimé).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const URL_ = opt('--url', pathToFileURL(resolve(here, '../dist/index.html')).href);
const OUT = resolve(opt('--out', resolve(here, 'captures')));
const SHOTS = !args.includes('--sans-captures');
const FLOWS = !args.includes('--sans-parcours');
mkdirSync(OUT, { recursive: true });

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_DIR) return createRequire(resolve(process.env.PLAYWRIGHT_DIR, 'noop.js'))('playwright');
  return import('playwright');
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

const TABS = ['carte', 'meilleur', 'simulation', 'resultats', 'aide'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const failures = [];
const log = [];
const note = (s) => {
  log.push(s);
  console.log(s);
};
const check = (ok, what) => {
  note(`${ok ? 'OK   ' : 'ÉCHEC'} ${what}`);
  if (!ok) failures.push(what);
  return ok;
};

/** Contexte instrumenté : console, exceptions, requêtes externes. */
async function openPage({ width, height, scheme, reducedMotion }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: reducedMotion ?? 'no-preference', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const external = new Set();
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    // polices bloquées (réseau coupé) : tolérées, elles ont des piles de repli
    if (/fonts\.(googleapis|gstatic)\.com/.test(m.text()) || /ERR_(NAME|INTERNET|TUNNEL|PROXY|CONNECTION)/.test(m.text())) return;
    errors.push(`${m.type()} : ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`exception : ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (/^(file|data|blob|about):/.test(u)) return;
    if (URL_.startsWith('http') && u.startsWith(new URL(URL_).origin)) return;
    external.add(new URL(u).host);
  });
  await page.goto(URL_);
  await page.waitForSelector('#onglet-carte');
  return { ctx, page, errors, external };
}

async function waitMap(page) {
  // la vue du combat est prête quand les jetons sont dessinés
  await page.waitForSelector('svg.map-svg g[role="img"][aria-label*=", case "]', { timeout: 30_000 });
  await page.waitForTimeout(400);
}

/** Libellés des jetons de la carte `svgId`. */
const tokens = (page, svgId) => page.$$eval(`#${svgId} g[role="img"][aria-label*=", case "]`, (els) => els.map((e) => e.getAttribute('aria-label')));
const cellOf = (labels, name) => {
  const l = labels.find((x) => x.startsWith(`${name},`));
  const m = l && /, case (-?\d+)/.exec(l);
  return m ? Number(m[1]) : null;
};

async function pageOverflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const tabs = [...document.querySelectorAll('.tab')].map((t) => {
      const r = t.getBoundingClientRect();
      return r.right > d.clientWidth + 1 || r.left < -1 ? t.textContent : null;
    });
    return { scroll: d.scrollWidth > d.clientWidth, sw: d.scrollWidth, cw: d.clientWidth, cutTabs: tabs.filter(Boolean) };
  });
}

// ------------------------------------------------------------------ 1. captures

if (SHOTS) {
  note(`\n== Captures (${URL_}) → ${OUT}`);
  for (const [width, height] of [
    [1280, 800],
    [400, 850],
  ]) {
    for (const scheme of ['light', 'dark']) {
      const { ctx, page, errors, external } = await openPage({ width, height, scheme });
      for (const tab of TABS) {
        await page.click(`#onglet-${tab}`);
        if (tab === 'carte' || tab === 'meilleur') await waitMap(page);
        else await page.waitForTimeout(600);
        const ov = await pageOverflow(page);
        check(!ov.scroll, `${tab} ${width}px ${scheme} : pas de défilement horizontal (${ov.sw} / ${ov.cw})`);
        check(ov.cutTabs.length === 0, `${tab} ${width}px ${scheme} : onglets visibles en entier${ov.cutTabs.length ? ` (coupés : ${ov.cutTabs.join(', ')})` : ''}`);
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        const n = Math.min(3, Math.ceil(total / height));
        for (let i = 0; i < n; i++) {
          await page.evaluate((y) => window.scrollTo(0, y), i * height);
          await page.waitForTimeout(120);
          await page.screenshot({ path: resolve(OUT, `${tab}-${width}-${scheme === 'light' ? 'clair' : 'sombre'}-${i}.png`) });
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      check(errors.length === 0, `${width}px ${scheme} : aucune erreur console${errors.length ? ` — ${errors.join(' | ')}` : ''}`);
      const bad = [...external].filter((h) => !FONT_HOSTS.includes(h));
      check(bad.length === 0, `${width}px ${scheme} : requêtes externes limitées aux polices (${[...external].join(', ') || 'aucune'})`);
      await ctx.close();
    }
  }
}

// ------------------------------------------------------------------ 2. parcours

async function planBest(page, label) {
  const t0 = Date.now();
  await page.click('#btn-meilleur-tour');
  await page.waitForSelector('#titre-plan', { timeout: 120_000 });
  const ms = Date.now() - t0;
  const steps = await page.$$eval('#titre-plan ~ ol li, #titre-plan ~ * li', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  const overlay = await page.$$eval('#carte-plan .ov-path, #carte-plan .ov-push, #carte-plan .ov-zone, #carte-plan .ov-spike-landing', (els) => els.length);
  note(`   ${label} : plan en ${(ms / 1000).toFixed(1)} s, ${overlay} tracés ; étapes :\n     - ${steps.join('\n     - ')}`);
  return { ms, steps, overlay };
}

if (FLOWS) {
  note('\n== Parcours fonctionnels (1280 × 800, thème clair)');
  const { ctx, page, errors, external } = await openPage({ width: 1280, height: 800, scheme: 'light' });
  const shot = (name) => page.screenshot({ path: resolve(OUT, `parcours-${name}.png`), fullPage: false });
  await page.click('#onglet-carte');
  await waitMap(page);

  // --- exemple T1
  let labels = await tokens(page, 'carte-situation');
  check(cellOf(labels, 'Troollibre 1') === 242 && cellOf(labels, 'Troollibre 2') === 358, `T1 : Troollibres sur 242 / 358 (${cellOf(labels, 'Troollibre 1')} / ${cellOf(labels, 'Troollibre 2')})`);
  const starts = ['Acrobate', 'Dompteur 1', 'Dompteur 2', 'Magicien'].map((n) => cellOf(labels, n));
  check(
    starts.every((c) => [286, 287, 314, 315].includes(c)) && new Set(starts).size === 4,
    `T1 : 4 joueurs sur les cases de départ (${starts.join(', ')})`,
  );
  await shot('01-t1');

  // --- meilleur tour
  await page.click('#btn-aller-meilleur-tour');
  await waitMap(page);
  const p1 = await planBest(page, 'T1 Acrobate');
  check(p1.ms < 30_000, `meilleur tour en un temps raisonnable (${(p1.ms / 1000).toFixed(1)} s < 30 s)`);
  const txt = p1.steps.join(' ');
  check(/Videur/.test(txt) && /DANS LES PICS/.test(txt), 'le plan de l\'Acrobate envoie des Troollibres dans les pics avec Videur');
  check(/Videur sur (256|372)/.test(txt), 'l\'Acrobate lance Videur sur 256 (ou 372) : Troollibre de 242 poussé dans les pics');
  check(p1.overlay > 0, 'le plan est tracé sur la carte');
  const altRows = await page.$$eval('.alt-table tbody tr', (r) => r.length);
  check(altRows >= 4, `alternatives comparables (${altRows} lignes)`);
  await shot('02-meilleur-tour');
  // plan d'équipe
  if (await page.$('#plan-vue-equipe:not([disabled])')) {
    await page.click('#plan-vue-equipe');
    const refused = await page.$$eval('#titre-plan ~ * li', (els) => els.filter((e) => /refus/i.test(e.textContent)).length);
    check(refused === 0, 'plan d\'équipe : aucune action refusée');
    await shot('03-plan-equipe');
    await page.click('#plan-vue-courant');
  }

  // --- appliquer
  await page.click('#btn-appliquer-plan');
  await page.waitForSelector('#rejeu-plan-carte', { timeout: 60_000 });
  const applyMsg = await page.textContent('.notice.ok');
  note(`   application : ${applyMsg?.replace(/\s+/g, ' ').trim()}`);
  await shot('04-applique');
  await page.click('#btn-fermer-rejeu-plan');
  await waitMap(page);
  const title = await page.textContent('#titre-carte-plan');
  labels = await tokens(page, 'carte-plan');
  check(!/Acrobate$/.test(title ?? '') && /Tour \d+/.test(title ?? ''), `« Appliquer » : la carte passe au joueur suivant (${title})`);
  const t1After = cellOf(labels, 'Troollibre 1');
  const t2After = cellOf(labels, 'Troollibre 2');
  check(t1After !== 242 || t2After !== 358, `« Appliquer » : les Troollibres ont bougé (${t1After} / ${t2After})`);
  await page.click('#onglet-carte');
  await waitMap(page);
  labels = await tokens(page, 'carte-situation');
  check(cellOf(labels, 'Troollibre 1') === t1After, 'la carte de l\'onglet Carte & situation montre le même état');
  await shot('05-carte-apres');

  // --- éditeur : recharger T1, déplacer un monstre par glisser-déposer, replanifier
  await openSection(page, 'Importer / exporter');
  await page.selectOption('#sit-exemple', 't1');
  await page.waitForTimeout(600);
  await waitMap(page);
  labels = await tokens(page, 'carte-situation');
  check(cellOf(labels, 'Troollibre 2') === 358, 'exemple T1 rechargé');
  const tok = page.locator('#carte-situation g[role="img"][aria-label^="Troollibre 2,"]');
  await page.locator('#carte-situation').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  const from = await tok.boundingBox();
  // case cible : 330 (centre calculé par le survol : on balaye jusqu'à lire « Case 330 »)
  const target = await findCell(page, 'carte-situation', 330);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move((from.x + target.x) / 2, (from.y + target.y) / 2, { steps: 5 });
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  labels = await tokens(page, 'carte-situation');
  check(cellOf(labels, 'Troollibre 2') === 330, `glisser-déposer : Troollibre 2 → 330 (${cellOf(labels, 'Troollibre 2')})`);
  check((await page.inputValue('#monstre-1-case')) === '330', 'l\'éditeur reflète la nouvelle case');
  await shot('06-glisser');
  await page.click('#btn-aller-meilleur-tour');
  await waitMap(page);
  const p2 = await planBest(page, 'T1 modifiée (T2 sur 330)');
  check(p2.steps.length > 0 && p2.ms < 30_000, 'replanification après déplacement');
  await shot('07-replan');

  // --- export / import
  await page.click('#onglet-carte');
  await waitMap(page);
  await openSection(page, 'Importer / exporter');
  const exported = await page.inputValue('#sit-export');
  const sit = JSON.parse(exported);
  check(sit.monsters?.some((m) => m.cell === 330), 'export : la situation contient le Troollibre sur 330');
  sit.monsters.find((m) => m.cell === 330).cell = 331;
  sit.turn = 2;
  await page.fill('#sit-import-texte', JSON.stringify(sit));
  await page.click('#btn-importer-texte');
  await page.waitForTimeout(800);
  await waitMap(page);
  labels = await tokens(page, 'carte-situation');
  check(labels.some((l) => /, case 331/.test(l)) && (await page.inputValue('#sit-tour')) === '2', 'import par collage : case 331 et tour 2');
  const file = resolve(OUT, 'situation-test.json');
  sit.monsters.find((m) => m.cell === 331).cell = 332;
  writeFileSync(file, JSON.stringify(sit));
  await page.setInputFiles('#sit-import-fichier', file);
  await page.waitForTimeout(800);
  await waitMap(page);
  labels = await tokens(page, 'carte-situation');
  check(labels.some((l) => /, case 332/.test(l)), 'import par fichier : case 332');
  await page.fill('#sit-import-texte', '{ pas du json');
  await page.click('#btn-importer-texte');
  check(!!(await page.$('.notice.bad[role="alert"]')), 'import invalide : message d\'erreur');
  await shot('08-import');

  // --- simulation ADDM graine 1001
  await page.click('#onglet-simulation');
  await page.selectOption('#sim-compo', 'ADDM');
  await page.fill('#sim-graine', '1001');
  const t0 = Date.now();
  await page.click('#btn-lancer-combat');
  await page.waitForSelector('#titre-bilan', { timeout: 300_000 });
  const simMs = Date.now() - t0;
  const bilan = (await page.textContent('#titre-bilan'))?.replace(/\s+/g, ' ').trim();
  note(`   simulation ADDM 1001 : ${bilan} (${(simMs / 1000).toFixed(1)} s)`);
  check(!!bilan, 'simulation : bilan affiché');
  await shot('09-simulation');
  await page.click('#rejeu-simulation-tour-8');
  await page.waitForTimeout(300);
  let mamaCell = null;
  for (let k = 0; k < 40; k++) {
    labels = await tokens(page, 'rejeu-simulation-carte');
    mamaCell = cellOf(labels, 'Mama Troollette');
    if (mamaCell === 300) break;
    await page.click('#rejeu-simulation-suiv');
    await page.waitForTimeout(80);
  }
  const frameLabel = (await page.textContent('.frame-label'))?.replace(/\s+/g, ' ').trim();
  check(mamaCell === 300 && /^T8/.test(frameLabel ?? ''), `rejeu : Mama sur 300 au T8 (${frameLabel})`);
  await shot('10-rejeu-t8');
  await page.click('#rejeu-simulation-planifier-ici');
  await page.waitForSelector('#titre-carte-plan', { timeout: 60_000 });
  await waitMap(page);
  const ptitle = await page.textContent('#titre-carte-plan');
  check(/Tour 8/.test(ptitle ?? ''), `« Planifier depuis ici » : onglet Meilleur tour au T8 (${ptitle})`);
  labels = await tokens(page, 'carte-plan');
  const mamaNow = cellOf(labels, 'Mama Troollette');
  check(mamaNow !== null && mamaNow >= 0 && mamaNow !== 152, `état exact repris : Mama dans l'arène (case ${mamaNow} après son tour T8)`);
  const p3 = await planBest(page, 'T8 depuis la simulation');
  check(p3.steps.length > 0, 'plan depuis l\'état exact');
  await shot('11-plan-t8');

  // --- annulation d'un long calcul (simulation en mode deep), puis l'application répond encore
  await page.click('#onglet-simulation');
  await page.selectOption('#sim-mode', 'deep');
  await page.click('#btn-lancer-combat');
  await page.waitForSelector('#btn-annuler-calcul', { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.click('#btn-annuler-calcul');
  await page.waitForSelector('#btn-annuler-calcul', { state: 'detached', timeout: 10_000 });
  await page.waitForTimeout(300);
  const cancelNotice = (await page.$$eval('.notice.warn', (els) => els.map((e) => e.textContent).join(' | '))) ?? '';
  // l'état exact repris par « Planifier depuis ici » est perdu à la relance du worker : les deux messages s'affichent
  check(/Calcul annulé\./.test(cancelNotice) && /état exact est perdu/.test(cancelNotice), `annulation : message affiché (${cancelNotice})`);
  await page.selectOption('#sim-mode', 'fast');
  await page.click('#onglet-carte');
  await waitMap(page);
  check((await tokens(page, 'carte-situation')).length >= 6, 'après annulation : le worker relancé reconstruit la carte');

  // --- résultats
  await page.click('#onglet-resultats');
  await page.waitForTimeout(500);
  const res = await page.textContent('main');
  for (const s of ['196 / 200', '198 / 200', 'p = 0,69', '58,8 %', '59,4 %', '10,81', '11,09', '5,17', '5,33', 'T9,15', 'T10,13']) check(res.includes(s), `Résultats : « ${s} » (docs/RESULTATS.md)`);

  // --- thème explicite
  await page.selectOption('#choix-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg !== 'rgb(228, 231, 227)', `thème sombre explicite (${bg})`);
  await page.selectOption('#choix-theme', 'auto');

  check(errors.length === 0, `parcours : aucune erreur console${errors.length ? ` — ${errors.join(' | ')}` : ''}`);
  const bad = [...external].filter((h) => !FONT_HOSTS.includes(h));
  check(bad.length === 0, `parcours : requêtes externes limitées aux polices (${[...external].join(', ') || 'aucune'})`);
  await ctx.close();

  // --- polices Google bloquées : piles de repli, aucune erreur bloquante
  note('\n== Polices Google Fonts bloquées');
  const nofont = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await nofont.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const np = await nofont.newPage();
  const npErr = [];
  np.on('pageerror', (e) => npErr.push(e.message));
  await np.goto(URL_);
  await waitMap(np);
  const h1Font = await np.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
  check(npErr.length === 0 && /Georgia|serif/.test(h1Font), `sans Google Fonts : page fonctionnelle, titres en police de repli (${h1Font})`);
  await np.screenshot({ path: resolve(OUT, 'parcours-14-sans-polices.png') });
  await nofont.close();

  // --- 400 px : parcours court (carte zoomée, plan, défilement)
  note('\n== Parcours court à 400 × 850, thème sombre, mouvements réduits');
  const small = await openPage({ width: 400, height: 850, scheme: 'dark', reducedMotion: 'reduce' });
  await small.page.click('#onglet-carte');
  await waitMap(small.page);
  const wrap = await small.page.$eval('#carte-situation', (svg) => {
    const w = svg.parentElement;
    const c = svg.querySelector('g[role="img"][aria-label^="Acrobate,"]').getBoundingClientRect();
    const r = w.getBoundingClientRect();
    return { zoomed: w.scrollWidth > w.clientWidth, visible: c.left >= r.left && c.right <= r.right && c.top >= r.top && c.bottom <= r.bottom };
  });
  check(wrap.zoomed && wrap.visible, 'carte ×2 à 400 px, centrée (Acrobate visible dans le cadre)');
  await small.page.click('#btn-aller-meilleur-tour');
  await waitMap(small.page);
  await planBest(small.page, '400 px');
  const ov = await pageOverflow(small.page);
  check(!ov.scroll, `400 px avec plan : pas de défilement horizontal (${ov.sw} / ${ov.cw})`);
  await small.page.screenshot({ path: resolve(OUT, 'parcours-12-plan-400-sombre.png') });
  await small.page.evaluate(() => window.scrollTo(0, 900));
  await small.page.screenshot({ path: resolve(OUT, 'parcours-13-plan-400-sombre-bas.png') });
  check(small.errors.length === 0, `400 px : aucune erreur console${small.errors.length ? ` — ${small.errors.join(' | ')}` : ''}`);
  await small.ctx.close();
}

/** Ouvre une section repliable (<details>) de l'éditeur si elle est fermée. */
async function openSection(page, title) {
  const d = page.locator(`details:has(> summary:has-text("${title}"))`).first();
  if (!(await d.evaluate((e) => e.open))) await d.locator('> summary').click();
}

/** Coordonnées écran du centre de la case `cell` (numéro de case affiché, sinon balayage du survol). */
async function findCell(page, svgId, cell) {
  const p = await page.$$eval(`#${svgId} text.cell-num`, (els, c) => {
    const t = els.find((e) => e.textContent.trim() === String(c));
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, cell);
  if (p) return p;
  const box = await page.locator(`#${svgId}`).boundingBox();
  for (let y = box.y + 4; y < box.y + box.height; y += 6) {
    for (let x = box.x + 4; x < box.x + box.width; x += 12) {
      await page.mouse.move(x, y);
      const m = /Case (\d+)/.exec((await page.textContent('.map-info')) ?? '');
      if (m && Number(m[1]) === cell) return { x: x + 6, y };
    }
  }
  throw new Error(`case ${cell} introuvable sur ${svgId}`);
}

await browser.close();
writeFileSync(resolve(OUT, 'rapport.txt'), log.join('\n') + '\n');
note(`\n${failures.length ? `${failures.length} ÉCHEC(S)` : 'Tout est vert.'} Rapport : ${resolve(OUT, 'rapport.txt')}`);
process.exit(failures.length ? 1 : 0);
