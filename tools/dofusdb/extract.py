#!/usr/bin/env python3
"""
Extracteur DofusDB pour le Simulateur du Gladiatrool.

Recupere (de facon idempotente, avec cache disque local) les donnees brutes du
client DOFUS 3 exposees par l'API publique https://api.dofusdb.fr :

  * spells.json        : sorts d'id [--range] (30370..30700 par defaut)
                         + sorts de la plage etendue [--extra-range] dont le typeId
                           appartient a --extra-types (types partages avec le Gladiatrool)
                         + sorts dont name.fr / adminName matche Trool|Gladia
                         + sorts des monstres de la race 313 (et monstres references)
                         + fermeture recursive : tout sort reference par un effet
                           (lancement de sous-sort, pose de glyphe/piege/rune,
                           modificateurs de sort "#1 : ...", etc.)
  * spell_levels.json  : tous les niveaux de ces sorts (dict id -> objet complet)
  * effects.json       : definition complete de chaque effectId rencontre
  * effects_catalog_fr.json : catalogue complet (id -> description FR + classification
                         des parametres), pour decoder n'importe quel effet
  * spell_states.json  : tous les etats references (effets 950/951/952, masques
                         de cible E<id>/e<id>, statesCriterion, triggers...)
  * monsters.json      : monstres race 313 + monstres invoques/references
  * monster_races.json : races rencontrees
  * spell_types.json   : types de sorts rencontres (utile pour classer les sorts)
  * maps.json          : map-positions 139988485 (arene, instance de combat) et
                         139725313 (exterieur) + sous-zone 84
  * provenance.json    : pourquoi chaque objet a ete extrait (graphe de references),
                         liste des cellIds explicites, masques/criteres non resolus
  * summary.json       : comptes, parametres, date d'extraction

Usage :
    python3 tools/dofusdb/extract.py                 # utilise le cache si present
    python3 tools/dofusdb/extract.py --refresh       # ignore le cache (re-telecharge)
    python3 tools/dofusdb/extract.py --cache-dir /tmp/dofusdb_cache --out research/raw/dofusdb

Dependances : bibliotheque standard uniquement (urllib). Le proxy HTTPS et le
bundle CA sont pris depuis l'environnement (HTTPS_PROXY, SSL_CERT_FILE).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

API = "https://api.dofusdb.fr"
PAGE = 50  # limite max de l'API (Feathers)
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "research" / "raw" / "dofusdb"
DEFAULT_CACHE = Path(os.environ.get("DOFUSDB_CACHE", Path.home() / ".cache" / "gladiatrool-dofusdb"))

# Types de sorts (spell-types) partages avec le Gladiatrool et presents apres 30700 :
#   3834 MANAGERS (30710 Objectif Check), 3864 PASSIVE SPELLS (30739 Transformation d'Archetype),
#   3872 Sort uniques (30719 Pense Vite), 3883 Declenches (30701 Glyphe de combat),
#   3915 Declenches Mama Troollette (30718/30723/30724/30750 Rassemblement Troollesque),
#   3919 Passif (30694 Trooler), 3920 Declenches (30754 Trooler | Check objectif // Empale)
DEFAULT_EXTRA_TYPES = [3834, 3864, 3872, 3883, 3915, 3919, 3920]
DEFAULT_RACES = [313]
DEFAULT_MAPS = [139988485, 139725313]
DEFAULT_SUBAREAS = [84]
NAME_REGEXES = {"name.fr": ["Trool", "Gladia"], "adminName": ["Trool", "Gladia"]}

# --------------------------------------------------------------------------------------
# Client HTTP avec cache
# --------------------------------------------------------------------------------------


def _qs(params: list[tuple[str, object]]) -> str:
    # Feathers : on garde les crochets et le $ lisibles, on encode le reste.
    return urllib.parse.urlencode([(k, str(v)) for k, v in params], safe="[]$")


class Client:
    def __init__(self, cache_dir: Path, refresh: bool = False, sleep: float = 0.05,
                 retries: int = 5, timeout: float = 60.0, verbose: bool = True):
        self.cache_dir = Path(cache_dir)
        self.refresh = refresh
        self.sleep = sleep
        self.retries = retries
        self.timeout = timeout
        self.verbose = verbose
        self.n_http = 0
        self.n_cache = 0
        self.refreshed: set[str] = set()  # cles deja rafraichies pendant ce run
        (self.cache_dir / "objects").mkdir(parents=True, exist_ok=True)
        (self.cache_dir / "queries").mkdir(parents=True, exist_ok=True)
        cafile = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
        self.ctx = ssl.create_default_context(cafile=cafile if cafile and os.path.exists(cafile) else None)

    # -- bas niveau ------------------------------------------------------------------
    def _http_get(self, url: str):
        """Retourne (status, json|None). 404 -> (404, None). Retries sur 429/5xx/reseau."""
        delay = 1.0
        last_err = None
        for attempt in range(self.retries):
            try:
                req = urllib.request.Request(url, headers={
                    "User-Agent": "GladiatroolSimu-extractor/1.0 (+research)",
                    "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=self.timeout, context=self.ctx) as r:
                    data = r.read()
                self.n_http += 1
                if self.sleep:
                    time.sleep(self.sleep)
                return 200, json.loads(data.decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    self.n_http += 1
                    return 404, None
                last_err = e
                if e.code not in (408, 425, 429, 500, 502, 503, 504):
                    raise
            except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
                last_err = e
            if self.verbose:
                print(f"  ! erreur {last_err!r} sur {url} (tentative {attempt + 1}/{self.retries})", file=sys.stderr)
            time.sleep(delay)
            delay = min(delay * 2, 30)
        raise RuntimeError(f"Echec definitif GET {url}: {last_err!r}")

    def _obj_path(self, service: str, oid) -> Path:
        return self.cache_dir / "objects" / service / f"{oid}.json"

    def _use_cache(self, key: str) -> bool:
        return (not self.refresh) or (key in self.refreshed)

    # -- objets individuels ------------------------------------------------------------
    def get_obj(self, service: str, oid):
        """GET /<service>/<id> avec cache. Retourne None si 404."""
        p = self._obj_path(service, oid)
        key = f"obj:{service}:{oid}"
        if p.exists() and self._use_cache(key):
            self.n_cache += 1
            d = json.loads(p.read_text("utf-8"))
            return None if d.get("__notfound__") else d
        status, d = self._http_get(f"{API}/{service}/{oid}")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(d if status == 200 else {"__notfound__": True}, ensure_ascii=False), "utf-8")
        self.refreshed.add(key)
        return d if status == 200 else None

    def get_many(self, service: str, ids) -> dict:
        """Recupere une liste d'id via id[$in][] (par paquets de 50), avec cache par objet.
        Retourne {id: obj} (les id inexistants sont absents)."""
        ids = sorted({int(i) for i in ids})
        out, missing = {}, []
        for i in ids:
            p = self._obj_path(service, i)
            key = f"obj:{service}:{i}"
            if p.exists() and self._use_cache(key):
                self.n_cache += 1
                d = json.loads(p.read_text("utf-8"))
                if not d.get("__notfound__"):
                    out[i] = d
            else:
                missing.append(i)
        for k in range(0, len(missing), PAGE):
            chunk = missing[k:k + PAGE]
            params = [("id[$in][]", i) for i in chunk] + [("$limit", PAGE)]
            status, d = self._http_get(f"{API}/{service}?{_qs(params)}")
            got = {int(o["id"]): o for o in (d or {}).get("data", [])}
            for i in chunk:
                p = self._obj_path(service, i)
                p.parent.mkdir(parents=True, exist_ok=True)
                if i in got:
                    p.write_text(json.dumps(got[i], ensure_ascii=False), "utf-8")
                    out[i] = got[i]
                else:
                    # confirmation individuelle (evite un faux negatif du filtre $in)
                    single = self.get_obj(service, i)
                    if single is not None:
                        out[i] = single
                    else:
                        p.write_text(json.dumps({"__notfound__": True}), "utf-8")
                self.refreshed.add(f"obj:{service}:{i}")
        return out

    # -- requetes paginees -----------------------------------------------------------------
    def find_all(self, service: str, params: list[tuple[str, object]]) -> list:
        """Requete Feathers paginee (tri par id croissant), cache par requete complete."""
        base = list(params) + [("$sort[id]", 1)]
        key_url = f"{API}/{service}?{_qs(base)}"
        key = "q:" + key_url
        qp = self.cache_dir / "queries" / (hashlib.sha1(key_url.encode()).hexdigest() + ".json")
        if qp.exists() and self._use_cache(key):
            self.n_cache += 1
            return json.loads(qp.read_text("utf-8"))["data"]
        data, skip, total = [], 0, None
        while True:
            status, d = self._http_get(f"{API}/{service}?{_qs(base + [('$limit', PAGE), ('$skip', skip)])}")
            if status != 200:
                raise RuntimeError(f"requete {service} {params} -> {status}")
            total = d["total"]
            data.extend(d["data"])
            skip += PAGE
            if skip >= total or not d["data"]:
                break
        if len(data) != total:
            print(f"  ! pagination incomplete {service} {params}: {len(data)}/{total}", file=sys.stderr)
        qp.write_text(json.dumps({"url": key_url, "total": total, "data": data}, ensure_ascii=False), "utf-8")
        self.refreshed.add(key)
        # alimente aussi le cache objet
        for o in data:
            if "id" in o:
                p = self._obj_path(service, o["id"])
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(json.dumps(o, ensure_ascii=False), "utf-8")
                self.refreshed.add(f"obj:{service}:{o['id']}")
        return data


# --------------------------------------------------------------------------------------
# Classification generique des parametres d'effets (a partir du catalogue FR)
# --------------------------------------------------------------------------------------
# Convention Ankama : #1 = diceNum (parameter0), #2 = diceSide (parameter1), #3 = value (parameter2).

def fr(o, field="description") -> str:
    v = (o or {}).get(field) or {}
    return (v.get("fr") if isinstance(v, dict) else v) or ""


# Surcharges constatees dans les donnees (le gabarit FR ne dit pas quel champ porte l'id) :
PARAM_OVERRIDES = {
    # 'Enleve les effets du sort #2' : dans les donnees DOFUS 3 l'id du sort est dans `value`
    406: {"value": "spell", "diceSide": "spell"},
    # (description vide) : `value` = id de spell-level d'un sort temporaire appris (ex. 81041 -> 30705)
    3405: {"value": "spell_level"},
    # 'Desapprend le sort temporaire #2' : `value` = id de spell-level (ex. 80500 -> 30395 Impact)
    3406: {"value": "spell_level"},
}


def classify_effect(eid: int, desc: str) -> dict:
    """Retourne {param: kind} ou param in {diceNum, diceSide, value} et kind in
    {spell, spell_level_grade, monster, monster_grade, state}."""
    d = desc.strip()
    low = d.lower()
    c: dict[str, str] = {}
    if d == "#1":
        # Effets "script" dont le client affiche le nom du sort lance (1160, 2160, 792, 1017...).
        c["diceNum"] = "spell"
        c["diceSide"] = "spell_level_grade"
    elif re.match(r"^#1\s*:", d):
        # Modificateurs de sort : "#1 : +#3 Portee maximale", "#1 : -#3 de relance"...
        c["diceNum"] = "spell"
    if re.match(r"^pose (un|une) (pi[eè]ge|glyphe|rune)", low) or "glyphe-aura" in low or "glyphe-prison" in low:
        c["diceNum"] = "spell"
        c["diceSide"] = "spell_level_grade"
    if re.search(r"(invoque\s*:\s*#1|invocation\s*:\s*#1)", low):
        c["diceNum"] = "monster"
        c["diceSide"] = "monster_grade"
    if re.search(r"sort\s*:?\s*#2", low):
        c["diceSide"] = "spell"
    if re.search(r"(sort|sort temporaire)\s*:?\s*#3", low):
        c["value"] = "spell"
    if re.search(r"[ée]tat\s*#3", low):
        c["value"] = "state"
    if re.search(r"[ée]tat\s*#1", low):
        c["diceNum"] = "state"
    c.update(PARAM_OVERRIDES.get(eid, {}))
    return c


MASK_TOKEN = re.compile(r"^\*?([A-Za-z])(-?\d+)$")


def parse_mask_refs(mask: str):
    """Masques de cible Ankama : 'a,A,E1234,e55,F7979,f12,*E12,...'
    E/e<id> = (ne) possede (pas) l'etat <id> ; F/f<id> = (n')est (pas) le monstre <id> ;
    prefixe '*' = critere evalue sur le lanceur (convention Ankama, a confirmer).
    Retourne (states, monsters, others)."""
    states, monsters, others = set(), set(), []
    for tok in (mask or "").split(","):
        tok = tok.strip()
        m = MASK_TOKEN.match(tok)
        if not m:
            continue
        letter, num = m.group(1), int(m.group(2))
        if letter in "Ee":
            states.add(num)
        elif letter in "Ff":
            monsters.add(num)
        else:
            others.append(tok)
    return states, monsters, others


def parse_criterion_states(crit: str) -> set[int]:
    # statesCriterion : ex. "HS=2130" (possede l'etat), "HS!7" (ne possede pas), "E1234", "(E1|E2)"
    return {int(x) for x in re.findall(r"(?:HS\s*[=!]\s*|E)(\d+)", crit or "")}


def parse_trigger_spell_refs(trig: str) -> set[int]:
    # 'TR<id>' : declencheur lie a un sort (id de sort ; semantique exacte a confirmer)
    return {int(x) for x in re.findall(r"(?:^|\|)TR(\d+)", trig or "")}


def parse_trigger_refs(trig: str) -> tuple[set[int], list[str]]:
    """Triggers : ex. 'I', 'TB', 'DA', 'EON1234', 'EOFF1234', 'X', ... On extrait les id
    d'etats des declencheurs d'etat (EON/EOFF/EO... + chiffres) ; les autres tokens
    numeriques sont remontes tels quels pour analyse."""
    states, other = set(), []
    for tok in (trig or "").split("|"):
        tok = tok.strip()
        m = re.match(r"^E(?:ON|OFF|O|A|R)?(\d+)$", tok)
        if m:
            states.add(int(m.group(1)))
        elif re.search(r"\d", tok):
            other.append(tok)
    return states, other


# --------------------------------------------------------------------------------------
# Extraction
# --------------------------------------------------------------------------------------

def zone_has_cells(z) -> bool:
    return bool(z and z.get("cellIds"))


def run(args) -> int:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    cl = Client(Path(args.cache_dir), refresh=args.refresh, sleep=args.sleep, verbose=not args.quiet)
    t0 = time.time()
    log = (lambda *a: None) if args.quiet else (lambda *a: print(*a, file=sys.stderr))

    # 1) catalogue complet des effets
    log("[1/7] catalogue des effets ...")
    catalog = {int(e["id"]): e for e in cl.find_all("effects", [])}
    eff_class = {eid: classify_effect(eid, fr(e)) for eid, e in catalog.items()}
    log(f"      {len(catalog)} effets au catalogue, "
        f"{sum(1 for c in eff_class.values() if c)} avec parametres references")

    # provenance
    prov_spells: dict[int, list] = defaultdict(list)
    prov_monsters: dict[int, list] = defaultdict(list)
    prov_states: dict[int, list] = defaultdict(list)
    prov_levels: dict[int, list] = defaultdict(list)
    edges: list[dict] = []
    cell_refs: list[dict] = []
    unresolved: list[dict] = []
    other_mask_tokens: dict[str, int] = defaultdict(int)
    other_trigger_tokens: dict[str, int] = defaultdict(int)

    # 2) graines
    log("[2/7] graines : plages d'id, recherches par nom, races ...")
    seeds: dict[int, dict] = {}
    lo, hi = args.range
    for s in cl.find_all("spells", [("id[$gte]", lo), ("id[$lte]", hi)]):
        seeds[s["id"]] = s
        prov_spells[s["id"]].append({"why": f"plage {lo}..{hi}"})
    if args.extra_range:
        elo, ehi = args.extra_range
        for s in cl.find_all("spells", [("id[$gte]", elo), ("id[$lte]", ehi)]):
            if s["typeId"] in set(args.extra_types):
                seeds[s["id"]] = s
                prov_spells[s["id"]].append({"why": f"plage etendue {elo}..{ehi}, typeId {s['typeId']}"})
    for field, pats in NAME_REGEXES.items():
        for pat in pats:
            for s in cl.find_all("spells", [(f"{field}[$regex]", pat)]):
                seeds[s["id"]] = s
                prov_spells[s["id"]].append({"why": f"recherche {field} ~ /{pat}/"})

    races = {}
    monsters: dict[int, dict] = {}
    for rid in args.races:
        race = cl.get_obj("monster-races", rid)
        if race:
            races[rid] = race
        for m in cl.find_all("monsters", [("race", rid)]):
            monsters[m["id"]] = m
            prov_monsters[m["id"]].append({"why": f"race {rid}"})

    # 3) fermeture recursive sorts <-> niveaux <-> monstres
    log("[3/7] fermeture recursive des references ...")
    spells: dict[int, dict] = dict(seeds)
    levels: dict[int, dict] = {}
    states_needed: set[int] = set()
    spell_queue: deque[int] = deque(sorted(spells))
    monster_queue: deque[int] = deque(sorted(monsters))
    processed_spells: set[int] = set()
    processed_monsters: set[int] = set()
    level_ids_needed: set[int] = set()
    unresolved_levels: set[int] = set()

    def want_spell(sid: int, why: dict):
        prov_spells[sid].append(why)
        if sid not in spells and sid not in processed_spells:
            spell_queue.append(sid)

    def want_monster(mid: int, why: dict):
        prov_monsters[mid].append(why)
        if mid not in monsters and mid not in processed_monsters:
            monster_queue.append(mid)

    def want_state(stid: int, why: dict):
        prov_states[stid].append(why)
        states_needed.add(stid)

    def scan_zone(z, ctx: dict, where: str):
        if zone_has_cells(z):
            cell_refs.append({**ctx, "where": where, "shape": z.get("shape"),
                              "param1": z.get("param1"), "param2": z.get("param2"),
                              "cellIds": list(z.get("cellIds"))})

    def scan_level(lv: dict):
        sid = lv["spellId"]
        ctx0 = {"spellId": sid, "levelId": lv["id"], "grade": lv.get("grade")}
        for st in parse_criterion_states(lv.get("statesCriterion", "")):
            want_state(st, {**ctx0, "via": "statesCriterion"})
        for pz in lv.get("previewZones") or []:
            scan_zone(pz, ctx0, "previewZones")
        for crit_flag, key in ((False, "effects"), (True, "criticalEffect")):
            for e in lv.get(key) or []:
                eid = e["effectId"]
                ctx = {**ctx0, "critical": crit_flag, "effectUid": e.get("effectUid"),
                       "effectId": eid, "order": e.get("order")}
                scan_zone(e.get("zoneDescr"), ctx, "effect.zoneDescr")
                cls = eff_class.get(eid, {})
                if eid not in catalog:
                    unresolved.append({**ctx, "problem": "effectId absent du catalogue /effects"})
                for param, kind in cls.items():
                    val = e.get(param)
                    if not isinstance(val, int) or val <= 0:
                        continue
                    if kind == "spell":
                        edges.append({**ctx, "param": param, "kind": "spell", "ref": val})
                        want_spell(val, {**ctx, "via": f"effet {eid} {param}"})
                    elif kind == "monster":
                        edges.append({**ctx, "param": param, "kind": "monster", "ref": val})
                        want_monster(val, {**ctx, "via": f"effet {eid} {param}"})
                    elif kind == "spell_level":
                        edges.append({**ctx, "param": param, "kind": "spell_level", "ref": val})
                        prov_levels[val].append({**ctx, "via": f"effet {eid} {param}"})
                        level_ids_needed.add(val)
                    elif kind == "state":
                        edges.append({**ctx, "param": param, "kind": "state", "ref": val})
                        want_state(val, {**ctx, "via": f"effet {eid} {param}"})
                st, mo, oth = parse_mask_refs(e.get("targetMask", ""))
                for x in st:
                    want_state(x, {**ctx, "via": "targetMask"})
                for x in mo:
                    edges.append({**ctx, "param": "targetMask", "kind": "monster", "ref": x})
                    want_monster(x, {**ctx, "via": "targetMask"})
                for t in oth:
                    other_mask_tokens[t] += 1
                tst, toth = parse_trigger_refs(e.get("triggers", ""))
                for x in tst:
                    want_state(x, {**ctx, "via": "triggers"})
                for t in toth:
                    other_trigger_tokens[t] += 1
                for x in parse_trigger_spell_refs(e.get("triggers", "")):
                    edges.append({**ctx, "param": "triggers", "kind": "spell", "ref": x})
                    want_spell(x, {**ctx, "via": "triggers TR"})

    def scan_spell(s: dict):
        ctx = {"spellId": s["id"]}
        scan_zone(s.get("basePreviewZoneDescr"), ctx, "spell.basePreviewZoneDescr")
        for key in ("boundScriptUsageData", "criticalHitBoundScriptUsageData"):
            for b in s.get(key) or []:
                for mk in ("targetMask", "casterMask", "activationMask"):
                    st, mo, oth = parse_mask_refs(b.get(mk, ""))
                    for x in st:
                        want_state(x, {**ctx, "via": f"{key}.{mk}"})
                    for x in mo:
                        want_monster(x, {**ctx, "via": f"{key}.{mk}"})
                for x in parse_criterion_states(b.get("criterion", "")):
                    want_state(x, {**ctx, "via": f"{key}.criterion"})
        for lid in s.get("spellLevels") or []:
            level_ids_needed.add(lid)
            prov_levels[lid].append({"spellId": s["id"]})

    rounds = 0
    while spell_queue or monster_queue or (level_ids_needed - set(levels) - unresolved_levels):
        rounds += 1
        # sorts a recuperer
        batch = sorted({i for i in spell_queue if i not in spells})
        spell_queue.clear()
        if batch:
            got = cl.get_many("spells", batch)
            for i in batch:
                if i in got:
                    spells[i] = got[i]
                else:
                    unresolved.append({"kind": "spell", "id": i, "problem": "404 /spells",
                                       "referenced_by": prov_spells.get(i, [])[:3]})
        for sid in sorted(set(spells) - processed_spells):
            processed_spells.add(sid)
            scan_spell(spells[sid])
            if len(processed_spells) > args.max_spells:
                raise SystemExit(f"Garde-fou : plus de {args.max_spells} sorts, arret (voir --max-spells)")
        # niveaux
        need = sorted(level_ids_needed - set(levels) - unresolved_levels)
        if need:
            got = cl.get_many("spell-levels", need)
            for lid in need:
                if lid in got:
                    levels[lid] = got[lid]
                    scan_level(got[lid])
                    if got[lid]["spellId"] not in spells:
                        want_spell(got[lid]["spellId"], {"levelId": lid, "via": "spell-level reference"})
                else:
                    unresolved_levels.add(lid)
                    unresolved.append({"kind": "spell-level", "id": lid, "problem": "404 /spell-levels"})
        # monstres
        mbatch = sorted({i for i in monster_queue if i not in monsters and i not in processed_monsters})
        monster_queue.clear()
        if mbatch:
            got = cl.get_many("monsters", mbatch)
            for i in mbatch:
                if i in got:
                    monsters[i] = got[i]
                else:
                    unresolved.append({"kind": "monster", "id": i, "problem": "404 /monsters",
                                       "referenced_by": prov_monsters.get(i, [])[:3]})
        start_levels = set()
        for mid in sorted(set(monsters) - processed_monsters):
            processed_monsters.add(mid)
            m = monsters[mid]
            for sid in m.get("spells") or []:
                want_spell(sid, {"monsterId": mid, "via": "monster.spells"})
            for g in m.get("grades") or []:
                ssl_id = g.get("startingSpellId") or 0
                if ssl_id:
                    start_levels.add(ssl_id)
                    prov_levels[ssl_id].append({"monsterId": mid, "grade": g.get("grade"),
                                                "via": "grade.startingSpellId"})
        if start_levels:
            need = sorted(start_levels - set(levels))
            got = cl.get_many("spell-levels", need) if need else {}
            for lid in sorted(start_levels):
                lv = levels.get(lid) or got.get(lid)
                if lv is None:
                    unresolved.append({"kind": "spell-level", "id": lid, "problem": "startingSpellId 404"})
                    continue
                want_spell(lv["spellId"], {"levelId": lid, "via": "monster.grade.startingSpellId"})
        log(f"      tour {rounds}: {len(spells)} sorts, {len(levels)} niveaux, {len(monsters)} monstres")

    # niveaux references par startingSpellId mais dont le sort a ete ajoute : deja couverts
    # 4) etats
    log("[4/7] etats ...")
    states = cl.get_many("spell-states", sorted(states_needed))
    for st in sorted(states_needed - set(states)):
        unresolved.append({"kind": "state", "id": st, "problem": "404 /spell-states",
                           "referenced_by": prov_states.get(st, [])[:3]})

    # 5) effets rencontres
    log("[5/7] effets rencontres ...")
    used_eids = set()
    for lv in levels.values():
        for key in ("effects", "criticalEffect"):
            for e in lv.get(key) or []:
                used_eids.add(e["effectId"])
    for st in states.values():
        for x in st.get("effectsIds") or []:
            pass  # effectsIds d'un etat = ids d'effets "visuels" internes (non decodes ici)
    effects = {}
    for eid in sorted(used_eids):
        e = catalog.get(eid) or cl.get_obj("effects", eid)
        if e is None:
            unresolved.append({"kind": "effect", "id": eid, "problem": "404 /effects"})
            continue
        effects[eid] = e

    # 6) types de sorts, races des monstres, cartes
    log("[6/7] types de sorts, races, cartes ...")
    spell_types = {}
    for tid in sorted({s["typeId"] for s in spells.values()}):
        t = cl.get_obj("spell-types", tid)
        if t:
            spell_types[tid] = t
    for rid in sorted({m["race"] for m in monsters.values()} - set(races)):
        r = cl.get_obj("monster-races", rid)
        if r:
            races[rid] = r
    maps = {"map-positions": {}, "subareas": {}}
    for mid in args.maps:
        mp = cl.get_obj("map-positions", mid)
        maps["map-positions"][str(mid)] = mp
    for sa in args.subareas:
        maps["subareas"][str(sa)] = cl.get_obj("subareas", sa)
    maps["_note"] = ("DofusDB n'expose pas les donnees de cellules (/maps/<id> -> 404, /maps vide) : "
                     "seules les map-positions et l'image de fond sont disponibles.")

    # 7) ecriture
    log("[7/7] ecriture ...")

    def strip(o):
        return {k: v for k, v in o.items() if k not in ("_id",)}

    def dump(name, obj):
        (out / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=False) + "\n", "utf-8")

    def by_id(d):
        return {str(k): strip(d[k]) for k in sorted(d)}

    dump("spells.json", by_id(spells))
    dump("spell_levels.json", by_id(levels))
    dump("effects.json", by_id(effects))
    dump("effects_catalog_fr.json", {str(k): {
        "fr": fr(catalog[k]), "en": (catalog[k].get("description") or {}).get("en", ""),
        "params": eff_class.get(k, {}), "elementId": catalog[k].get("elementId"),
        "characteristic": catalog[k].get("characteristic"), "category": catalog[k].get("category"),
        "effectPriority": catalog[k].get("effectPriority"), "active": catalog[k].get("active"),
        "isInPercent": catalog[k].get("isInPercent"), "useInFight": catalog[k].get("useInFight"),
        "oppositeId": catalog[k].get("oppositeId"), "bonusType": catalog[k].get("bonusType"),
    } for k in sorted(catalog)})
    dump("spell_states.json", by_id(states))
    dump("monsters.json", by_id(monsters))
    dump("monster_races.json", by_id(races))
    dump("spell_types.json", by_id(spell_types))
    dump("maps.json", maps)

    def dd(d):
        return {str(k): v for k, v in sorted(d.items())}

    dump("provenance.json", {
        "spells": dd(prov_spells), "spell_levels": dd(prov_levels), "monsters": dd(prov_monsters),
        "states": dd(prov_states), "reference_edges": edges, "cell_refs": cell_refs,
        "unresolved": unresolved,
        "other_targetMask_tokens": dict(sorted(other_mask_tokens.items())),
        "other_trigger_tokens": dict(sorted(other_trigger_tokens.items())),
        "effect_param_classification": {str(k): v for k, v in sorted(eff_class.items()) if v},
    })
    n_eff = sum(len(lv.get("effects") or []) for lv in levels.values())
    n_crit = sum(len(lv.get("criticalEffect") or []) for lv in levels.values())
    summary = {
        "generated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "api": API,
        "params": {"range": args.range, "extra_range": args.extra_range, "extra_types": args.extra_types,
                   "races": args.races, "maps": args.maps, "subareas": args.subareas,
                   "name_regexes": NAME_REGEXES},
        "counts": {
            "spells": len(spells),
            "spells_in_range": sum(1 for s in spells if lo <= s <= hi),
            "spells_seeds": len(seeds),
            "spells_added_by_closure": len(set(spells) - set(seeds)),
            "spell_levels": len(levels),
            "effects_normal": n_eff, "effects_critical": n_crit,
            "distinct_effect_ids": len(effects),
            "states": len(states), "monsters": len(monsters), "races": len(races),
            "spell_types": len(spell_types), "reference_edges": len(edges),
            "cell_refs": len(cell_refs), "unresolved": len(unresolved),
            "closure_rounds": rounds,
        },
        "http_requests": cl.n_http, "cache_hits": cl.n_cache,
        "elapsed_s": round(time.time() - t0, 1),
    }
    dump("summary.json", summary)
    log(json.dumps(summary["counts"], indent=1))
    log(f"HTTP: {cl.n_http} requetes, cache: {cl.n_cache} hits, {summary['elapsed_s']} s")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="repertoire de sortie (defaut: %(default)s)")
    ap.add_argument("--cache-dir", default=str(DEFAULT_CACHE), help="cache disque (defaut: %(default)s, ou $DOFUSDB_CACHE)")
    ap.add_argument("--refresh", action="store_true", help="ignorer le cache et tout re-telecharger")
    ap.add_argument("--range", nargs=2, type=int, default=[30370, 30700], metavar=("MIN", "MAX"))
    ap.add_argument("--extra-range", nargs=2, type=int, default=[30701, 30800], metavar=("MIN", "MAX"),
                    help="plage scannee en plus, filtree par --extra-types")
    ap.add_argument("--extra-types", nargs="*", type=int, default=DEFAULT_EXTRA_TYPES)
    ap.add_argument("--races", nargs="*", type=int, default=DEFAULT_RACES)
    ap.add_argument("--maps", nargs="*", type=int, default=DEFAULT_MAPS)
    ap.add_argument("--subareas", nargs="*", type=int, default=DEFAULT_SUBAREAS)
    ap.add_argument("--max-spells", type=int, default=5000, help="garde-fou sur la taille de la fermeture")
    ap.add_argument("--sleep", type=float, default=0.05, help="pause entre requetes HTTP (s)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
