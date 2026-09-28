#!/usr/bin/env python3
"""
Decodeur lisible des donnees DofusDB extraites par extract.py.

Lit research/raw/dofusdb/*.json et produit :
  * research/raw/dofusdb/decoded_spells.md : chaque sort, groupe par theme, avec tous
    ses niveaux, parametres de lancer et effets (normaux + critiques) decodes en FR ;
    section "Cellules explicitement referencees" ; resume des monstres ; etats.
  * research/raw/dofusdb/INDEX.md : index des fichiers, comptes, commande de relance.

Usage : python3 tools/dofusdb/decode.py [--dir research/raw/dofusdb]
Bibliotheque standard uniquement.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = REPO_ROOT / "research" / "raw" / "dofusdb"

# --------------------------------------------------------------------------------------
# Legendes (niveau de confiance explicite)
# --------------------------------------------------------------------------------------
SHAPES = {
    80: ("P", "point (case unique)", "haute"),
    67: ("C", "cercle/losange de rayon param1", "haute"),
    88: ("X", "croix de taille param1", "haute"),
    76: ("L", "ligne de longueur param1 dans l'axe du lancer", "haute"),
    84: ("T", "ligne perpendiculaire a l'axe (T) de demi-largeur param1", "haute"),
    71: ("G", "carre de demi-cote param1", "haute"),
    65: ("A", "toute la carte (toutes les cases)", "haute"),
    97: ("a", "tous les combattants / toute la carte (variante 'a')", "moyenne"),
    79: ("O", "anneau (bord du cercle) de rayon param1", "haute"),
    81: ("Q", "croix sans centre (param1 = portee, param2 = debut)", "moyenne"),
    82: ("R", "rectangle param1 x param2", "moyenne"),
    86: ("V", "cone de taille param1", "moyenne"),
    87: ("W", "carre creux / bordure de carre", "basse"),
    35: ("#", "croix diagonale (sans centre ?)", "basse"),
    43: ("+", "croix diagonale (X penche)", "moyenne"),
    42: ("*", "etoile (croix + diagonales)", "moyenne"),
    70: ("F", "fourche", "moyenne"),
    108: ("l", "ligne depuis le lanceur (variante 'l')", "basse"),
    85: ("U", "demi-cercle", "moyenne"),
    68: ("D", "damier", "moyenne"),
    73: ("I", "cercle inverse (tout sauf le cercle)", "moyenne"),
    47: ("/", "ligne diagonale", "moyenne"),
    45: ("-", "ligne diagonale perpendiculaire", "moyenne"),
    59: (";", "LISTE EXPLICITE de cellules (zoneDescr.cellIds)", "haute (constate : toujours accompagne de cellIds)"),
    0: ("-", "aucune", "haute"),
}

TRIGGERS = {
    "I": "immediat (a l'application)",
    "TB": "debut de tour du porteur",
    "TE": "fin de tour du porteur",
    "D": "quand le porteur subit des dommages",
    "DA": "dommages Air subis", "DE": "dommages Terre subis", "DF": "dommages Feu subis",
    "DN": "dommages Neutre subis", "DW": "dommages Eau subis",
    "DBA": "dommages subis d'un allie (hypothese)", "DCAC": "dommages de melee subis (hypothese)",
    "DR": "dommages a distance subis (hypothese)",
    "X": "mort du porteur", "XD": "mort (variante D, hypothese)", "XPD": "mort par poussee / dommages de poussee (hypothese)",
    "K": "le porteur tue une cible (hypothese)",
    "P": "le porteur est pousse (hypothese)", "PD": "dommages de poussee subis (hypothese)",
    "PMD": "PM perdus (hypothese)", "APA": "PA ajoutes (hypothese)", "MPA": "PM ajoutes (hypothese)",
    "CC": "coup critique (hypothese)", "CAP": "capture/perte de PA ? (hypothese)", "CD": "hypothese : 'cast done'",
    "CIOFF": "hypothese : fin d'invisibilite / condition OFF", "VA": "hypothese : variation de PV",
    "EON#": "le porteur GAGNE l'etat #", "EOFF#": "le porteur PERD l'etat #",
    "TR#": "declencheur lie au sort # (hypothese)",
}

MASKS = {
    "a": "allies (dont le lanceur ?)", "A": "ennemis", "c": "lanceur (inclus)", "C": "lanceur",
    "g": "allies sauf lanceur (hypothese)", "j": "hypothese : invocations/allies 'j'", "J": "hypothese : 'J' ennemis",
    "h": "hypothese : allies 'h'", "H": "hypothese : ennemis 'H'", "L": "hypothese : 'L'",
    "P": "hypothese : cible principale / 'P'", "O": "hypothese : 'O'", "U": "hypothese : 'U'", "x": "hypothese : 'x'",
    "E#": "la cible POSSEDE l'etat #", "e#": "la cible NE possede PAS l'etat #",
    "F#": "la cible EST le monstre #", "f#": "la cible N'EST PAS le monstre #",
    "V#": "hypothese : PV de la cible >= #%", "v#": "hypothese : PV de la cible < #%",
    "*...": "prefixe '*' : critere evalue sur le LANCEUR (hypothese forte, convention Ankama)",
    "Sce": "hypothese DOFUS 3 : source de l'effet declencheur", "Atq": "hypothese DOFUS 3 : attaquant (declencheur)",
    "Def": "hypothese DOFUS 3 : defenseur (declencheur)",
}

NO_DESC_HINTS = {
    3405: "apprend un sort temporaire ; value = id de spell-level (constaté : Spell Manager 30626)",
    3400: "HYPOTHÈSE : compteur/objectif (value)", 3401: "HYPOTHÈSE : compteur/objectif (value)",
    3792: "HYPOTHÈSE : référence interne (value)", 3793: "HYPOTHÈSE : référence interne (value)",
}

SPELL_CAST_EFFECTS = {
    792: "lance un sous-sort (declenche)",
    1160: "lance un sous-sort sur la cible",
    2160: "lance un sous-sort (sur la cible/cellule)",
    1017: "la cible lance un sous-sort (sur le lanceur ?)",
    1018: "la cible lance un sous-sort (sur elle-meme ?)",
    1019: "la cible lance un sous-sort",
    2017: "lance un sous-sort (variante 2017)",
    2792: "lance un sous-sort (variante 2792)",
    2794: "lance un sous-sort (variante 2794)",
    2960: "lance un sous-sort (variante 2960)",
}

# --------------------------------------------------------------------------------------
# Themes
# --------------------------------------------------------------------------------------
THEMES = [
    ("acrobate", "Acrobate (Baroudeur en interne)"),
    ("dompteur", "Dompteur (Gladiateur en interne)"),
    ("magicien", "Magicien (Guérisseur en interne)"),
    ("commun", "Commun aux joueurs (archetype, passifs, sort commun)"),
    ("uniques", "Sorts uniques (choix de fin de manche)"),
    ("monstres", "Monstres (Troolls)"),
    ("boss", "Boss : Mama Troollette"),
    ("glyphes", "Glyphes & pics"),
    ("objectifs", "Objectifs"),
    ("bonus", "Bonus « Acclamations de la foule »"),
    ("managers", "Managers & scripts"),
    ("autres", "Autres (autres mini-jeux, anciens sorts « Trool », fermeture récursive)"),
]
TYPE_THEME = {}
for t in (3888, 3902, 3862, 3842, 3884):
    TYPE_THEME[t] = "acrobate"
for t in (3889, 3901, 3844, 3841, 3885):
    TYPE_THEME[t] = "dompteur"
for t in (3887, 3903, 3843, 3886):
    TYPE_THEME[t] = "magicien"
for t in (3797,):
    TYPE_THEME[t] = "commun"
for t in (3872, 3873, 3874, 3875, 3878, 3879, 3900, 3880):
    TYPE_THEME[t] = "uniques"
for t in (3793, 3794, 3795):
    TYPE_THEME[t] = "monstres"
for t in (3796, 3876, 3915, 3877, 3890):
    TYPE_THEME[t] = "boss"
for t in (3883, 3830):
    TYPE_THEME[t] = "glyphes"
for t in list(range(3804, 3830)) + list(range(3831, 3839)) + list(range(3845, 3860)) + [3882, 3919, 3920]:
    TYPE_THEME.setdefault(t, "objectifs")
for t in range(3866, 3872):
    TYPE_THEME[t] = "bonus"
for t in (3834, 3860):
    TYPE_THEME[t] = "managers"
ID_THEME = {
    30390: "glyphes", 30427: "glyphes", 30519: "glyphes", 30566: "glyphes", 30657: "glyphes",
    30687: "glyphes", 30700: "glyphes", 30701: "glyphes",
    30443: "objectifs", 30656: "objectifs", 30710: "objectifs", 30428: "objectifs",
    30608: "commun", 30639: "commun", 30739: "commun", 30644: "dompteur", 30648: "acrobate", 30649: "magicien",
    30577: "managers", 30626: "managers", 30658: "managers", 30470: "managers",
}
GLADIA_ID_RANGE = (30370, 30760)


def theme_of(sid: int, s: dict, parents_theme: list[str]) -> str:
    if sid in ID_THEME:
        return ID_THEME[sid]
    t = TYPE_THEME.get(s.get("typeId"))
    if t:
        return t
    for pt in parents_theme:
        if pt and pt != "autres":
            return pt
    return "autres"


# --------------------------------------------------------------------------------------
# Utilitaires
# --------------------------------------------------------------------------------------

def fr(o, field="name") -> str:
    v = (o or {}).get(field) or {}
    return (v.get("fr") if isinstance(v, dict) else v) or ""


def md_escape(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")  # balises couleur/br
    return s.replace("|", "\\|").replace("\n", " ").strip()


class Ctx:
    def __init__(self, d: Path):
        self.d = d
        load = lambda n: json.loads((d / n).read_text("utf-8"))
        self.spells = {int(k): v for k, v in load("spells.json").items()}
        self.levels = {int(k): v for k, v in load("spell_levels.json").items()}
        self.effects = {int(k): v for k, v in load("effects.json").items()}
        self.catalog = {int(k): v for k, v in load("effects_catalog_fr.json").items()}
        self.states = {int(k): v for k, v in load("spell_states.json").items()}
        self.monsters = {int(k): v for k, v in load("monsters.json").items()}
        self.races = {int(k): v for k, v in load("monster_races.json").items()}
        self.types = {int(k): v for k, v in load("spell_types.json").items()}
        self.maps = load("maps.json")
        self.prov = load("provenance.json")
        self.summary = load("summary.json")

    # noms
    def sname(self, sid) -> str:
        s = self.spells.get(int(sid))
        if not s:
            return f"sort {sid} (inconnu)"
        adm = s.get("adminName") or ""
        return f"«{md_escape(fr(s))}»" + (f" [{md_escape(adm)}]" if adm else "")

    def stname(self, stid) -> str:
        st = self.states.get(int(stid))
        return f"«{md_escape(fr(st))}»" if st else "(etat inconnu)"

    def mname(self, mid) -> str:
        m = self.monsters.get(int(mid))
        return f"«{md_escape(fr(m))}»" if m else "(monstre inconnu)"

    def lvl_label(self, lid) -> str:
        lv = self.levels.get(int(lid))
        if not lv:
            return f"spell-level {lid} (ABSENT de DofusDB)"
        return f"spell-level {lid} = sort {lv['spellId']} {self.sname(lv['spellId'])} niv.{lv.get('grade')}"

    def annotate_mask(self, mask: str) -> str:
        if not mask:
            return "—"
        out = []
        for tok in mask.split(","):
            m = re.match(r"^(\*?)([A-Za-z])(-?\d+)$", tok.strip())
            if m:
                star, L, n = m.groups()
                if L in "Ee":
                    out.append(f"{tok}{self.stname(n)}")
                    continue
                if L in "Ff":
                    out.append(f"{tok}{self.mname(n)}")
                    continue
            out.append(tok)
        return ",".join(out)

    def annotate_triggers(self, trig: str) -> str:
        if not trig:
            return "—"
        out = []
        for tok in trig.split("|"):
            m = re.match(r"^E(ON|OFF)(\d+)$", tok)
            if m:
                out.append(f"{tok}{self.stname(m.group(2))}")
                continue
            m = re.match(r"^TR(\d+)$", tok)
            if m:
                out.append(f"{tok}{self.sname(m.group(1))}")
                continue
            out.append(tok)
        return "|".join(out)

    def annotate_criterion(self, crit: str) -> str:
        if not crit:
            return ""
        return re.sub(r"(HS\s*[=!]\s*|E)(\d+)", lambda m: f"{m.group(0)}{self.stname(m.group(2))}", crit)

    # description d'effet
    def fill(self, e: dict) -> str:
        eid = e["effectId"]
        cat = self.catalog.get(eid, {})
        tpl = cat.get("fr") or ""
        params = cat.get("params") or {}
        p = {1: e.get("diceNum", 0), 2: e.get("diceSide", 0), 3: e.get("value", 0)}
        pname = {1: "diceNum", 2: "diceSide", 3: "value"}

        def ref_label(i):
            kind = params.get(pname[i])
            v = p[i]
            if not v:
                return None
            if kind == "spell":
                g = ""
                if pname[i] == "diceNum" and params.get("diceSide") == "spell_level_grade" and p[2]:
                    g = f" niv.{p[2]}"
                return f"sort {v} {self.sname(v)}{g}"
            if kind == "spell_level":
                return self.lvl_label(v)
            if kind == "monster":
                g = f" grade {p[2]}" if params.get("diceSide") == "monster_grade" and p[2] else ""
                return f"monstre {v} {self.mname(v)}{g}"
            if kind == "state":
                return f"etat {v} {self.stname(v)}"
            return None

        if not tpl.strip():
            base = f"(effet {eid} sans description FR" + (f" ; sens probable : {NO_DESC_HINTS[eid]}" if eid in NO_DESC_HINTS else "") + ")"
            extra = [f"{pname[i]}={p[i]}" for i in (1, 2, 3) if p[i]]
            refs = [ref_label(i) for i in (1, 2, 3) if ref_label(i)]
            return base + (" " + ", ".join(extra) if extra else "") + (" → " + "; ".join(refs) if refs else "")
        s = tpl
        show2 = bool(p[2]) and p[2] != p[1]

        def cond12(m):
            return (m.group(1) + "#2") if show2 else ""
        s = re.sub(r"\{\{~1~2([^}]*)\}\}#2", cond12, s)
        s = re.sub(r"\{\{~ps\}\}", "s" if max(abs(p[1] or 0), abs(p[2] or 0)) > 1 else "", s)
        s = re.sub(r"\{\{~[^}]*\}\}", "", s)
        s = re.sub(r'<sprite name="([^"]+)">', r"[\1]", s)
        note = ""
        for i in (1, 2, 3):
            lab = ref_label(i)
            if (i in (1, 2) and f"#{i}" in s and not p[i] and p[3] and "#3" not in tpl
                    and not (p[1] or p[2])):
                # Donnees DOFUS 3 : le parametre affiche est parfois porte par `value`
                # (ex. 406 'Enleve les effets du sort #2' -> value = id du sort ; 3407 -> value = secondes).
                if params.get("value") == "spell":
                    lab = f"sort {p[3]} {self.sname(p[3])}"
                else:
                    lab = str(p[3])
                note = " [param. lu dans `value`]"
            s = s.replace(f"#{i}", lab if lab else str(p[i]))
        s = s.replace("sort sort ", "sort ").replace("Sort sort ", "Sort ")
        s += note
        if eid in SPELL_CAST_EFFECTS:
            s = f"{SPELL_CAST_EFFECTS[eid]} : {s}"
        if eid in (401, 402, 1091, 1165, 400, 2022, 4040) and p[3]:
            s += f" (couleur #{p[3]:06X})"
        return md_escape(s)


def zone_str(z: dict, ctx_cells_ref: str | None = None) -> str:
    if not z:
        return "—"
    shape = z.get("shape", 0)
    L = SHAPES.get(shape, (chr(shape) if 32 < shape < 127 else "?", "inconnue", "?"))[0]
    s = f"`{L}`"
    if shape not in (0,):
        s += f"{z.get('param1', 0)}"
        if z.get("param2"):
            s += f",{z['param2']}"
    extras = []
    if z.get("damageDecreaseStepPercent") not in (None, 10) or z.get("maxDamageDecreaseApplyCount") not in (None, 4):
        extras.append(f"degressif {z.get('damageDecreaseStepPercent')}%x{z.get('maxDamageDecreaseApplyCount')}")
    for k in ("isStopAtTarget", "forcedDirection", "includeCarried", "onlyAffectIfInSightLine"):
        if z.get(k):
            extras.append(k)
    cells = z.get("cellIds") or []
    if cells:
        if shape in (97, 65) and cells == [1]:
            extras.append("cellIds=[1] (valeur par defaut)")
        elif len(cells) <= 12:
            extras.append(f"cellIds={cells}")
        else:
            extras.append(f"cellIds: {len(cells)} cellules" + (f" → voir {ctx_cells_ref}" if ctx_cells_ref else ""))
    return s + (" (" + ", ".join(extras) + ")" if extras else "")


def ascii_grid(cells, marks=None, width=14, height=40) -> list[str]:
    """Rendu de la grille DOFUS (14 colonnes x 40 lignes, lignes impaires decalees d'une
    demi-case vers la droite). id = ligne*14 + colonne. '#' = cellule listee, '.' = autre,
    lettres = marques supplementaires (dict cell -> char)."""
    cells = set(cells)
    marks = marks or {}
    rows = []
    used = [r for r in range(height) if any((r * width + c) in cells or (r * width + c) in marks for c in range(width))]
    if not used:
        return rows
    r0, r1 = max(0, min(used) - 1), min(height - 1, max(used) + 1)
    for r in range(r0, r1 + 1):
        line = (" " if r % 2 else "") + " ".join(
            marks.get(r * width + c) or ("#" if r * width + c in cells else ".") for c in range(width))
        rows.append(f"{r:2d} [{r * width:3d}-{r * width + width - 1:3d}] {line}")
    return rows


def yn(b) -> str:
    return "oui" if b else "non"


# --------------------------------------------------------------------------------------
# Rendu
# --------------------------------------------------------------------------------------

def render(ctx: Ctx) -> str:
    S, LV = ctx.spells, ctx.levels
    # parents (pour heriter le theme des sous-sorts)
    parents = defaultdict(set)
    for e in ctx.prov["reference_edges"]:
        if e.get("kind") == "spell":
            parents[int(e["ref"])].add(int(e["spellId"]))
    for sid, lst in ctx.prov["spells"].items():
        for w in lst:
            if w.get("monsterId"):
                parents[int(sid)].add(-int(w["monsterId"]))
    monster_theme = {}
    for mid, m in ctx.monsters.items():
        if m.get("race") == 313:
            monster_theme[mid] = "boss" if mid == 7984 else "monstres"
    # themes : points fixes (propagation depuis parents)
    theme = {}
    for sid, s in S.items():
        if sid in ID_THEME or TYPE_THEME.get(s.get("typeId")):
            theme[sid] = theme_of(sid, s, [])
    for _ in range(10):
        changed = False
        for sid, s in S.items():
            if sid in theme:
                continue
            pts = []
            for p in sorted(parents.get(sid, ())):
                if p < 0:
                    pts.append(monster_theme.get(-p))
                else:
                    pts.append(theme.get(p))
            t = theme_of(sid, s, [x for x in pts if x])
            if t != "autres":
                theme[sid] = t
                changed = True
        if not changed:
            break
    for sid, s in S.items():
        theme.setdefault(sid, "autres")

    # cellules explicites : index par (spell, level, effectUid)
    cell_refs = [c for c in ctx.prov["cell_refs"]
                 if not (c.get("shape") in (97, 65) and c.get("cellIds") == [1])]
    cell_anchor = {}
    for i, c in enumerate(cell_refs):
        key = (c.get("spellId"), c.get("levelId"), c.get("effectUid"), c.get("where"))
        cell_anchor[key] = f"C{i + 1}"

    out = []
    w = out.append
    sm = ctx.summary
    w("# Sorts du Gladiatrool — décodage des données DofusDB (client DOFUS 3)\n")
    w(f"> Généré par `tools/dofusdb/decode.py` à partir de l'extraction `tools/dofusdb/extract.py` "
      f"({sm['generated_at']}, API {sm['api']}).  ")
    w("> **Nature des données** : FAIT vérifié (source primaire : données du client DOFUS 3 exposées par DofusDB). "
      "Les *interprétations* (sens des masques, triggers, formes de zone, rôle des effets `#1`) sont marquées "
      "avec leur niveau de confiance dans les légendes ci-dessous.  ")
    w("> Source par sort : `https://api.dofusdb.fr/spells/<id>` ; par niveau : `https://api.dofusdb.fr/spell-levels/<id>`.\n")
    c = sm["counts"]
    w(f"**Comptes** : {c['spells']} sorts ({c['spells_in_range']} dans la plage {sm['params']['range']}, "
      f"{c['spells_added_by_closure']} ajoutés par fermeture récursive), {c['spell_levels']} niveaux, "
      f"{c['effects_normal']} effets normaux + {c['effects_critical']} critiques, {c['distinct_effect_ids']} effectId distincts, "
      f"{c['states']} états, {c['monsters']} monstres.\n")

    # sommaire
    w("## Sommaire\n")
    w("- [Légendes](#legendes)")
    w("- [Correspondance archétypes (noms internes)](#correspondance-archetypes)")
    w("- [Monstres](#monstres)")
    for key, title in THEMES:
        n = sum(1 for sid in S if theme[sid] == key)
        w(f"- [{title}](#theme-{key}) — {n} sorts")
    w("- [Cellules explicitement référencées](#cellules-explicitement-referencees)")
    w("- [États référencés](#etats-references)")
    w("- [Références non résolues / bizarreries](#references-non-resolues)\n")

    # legendes
    w('<a id="legendes"></a>\n## Légendes\n')
    w("**Paramètres des effets** (convention Ankama) : `#1` = diceNum, `#2` = diceSide, `#3` = value. "
      "Pour les effets de lancement de sous-sort (description `#1`), diceNum = id du sous-sort, diceSide = niveau (grade) "
      "(constaté : les valeurs correspondent toujours à un sort existant et à un grade valide).\n")
    w("**Formes de zone** (`zoneDescr.shape`, code ASCII) :\n")
    w("| code | lettre | signification | confiance |\n|---|---|---|---|")
    for code, (L, desc, conf) in sorted(SHAPES.items()):
        w(f"| {code} | `{L}` | {desc} | {conf} |")
    w("\nUne zone s'écrit `lettre` + param1[,param2] ; « dégressif x%×n » n'est affiché que s'il diffère du défaut (10 %×4).\n")
    w("**Déclencheurs** (`triggers`) :\n")
    w("| token | signification | \n|---|---|")
    for k, v in TRIGGERS.items():
        w(f"| `{k}` | {v} |")
    w("\n**Masques de cible** (`targetMask`, tokens séparés par des virgules ; confiance moyenne sauf E/e/F/f = haute) :\n")
    w("| token | signification |\n|---|---|")
    for k, v in MASKS.items():
        w(f"| `{k}` | {v} |")
    w("\n**Effets de lancement de sous-sort** (description FR = `#1`, sémantique exacte = HYPOTHÈSE) : "
      + ", ".join(f"`{k}` {v}" for k, v in SPELL_CAST_EFFECTS.items()) + ".\n")
    w("**Durée** : `-1` = infinie (tout le combat), `0` = instantané, `n` = n tours. "
      "**random** : probabilité (%) si > 0. **group** : groupe d'effets aléatoires.\n")

    # correspondance archetypes
    w('<a id="correspondance-archetypes"></a>\n## Correspondance archétypes (noms internes)\n')
    w("FAIT vérifié (adminName + spell-types) : les données internes nomment les archétypes différemment du nom affiché :\n")
    w("| Nom affiché | Nom interne (adminName) | types de sorts | sorts de base | améliorés | choix d'amélioration | uniques | acclamations |")
    w("|---|---|---|---|---|---|---|---|")
    w("| Dompteur | Gladiateur | 3889 / 3901 / 3841 / 3873 / 3869 | 30395–30401 | 30558–30565 | 30469–30476 | 30602, 30603, 30611–30614 | 30589, 30592–30594, 30632–30634 |")
    w("| Acrobate | Baroudeur | 3888 / 3902 / 3842 / 3874 / 3870 | 30402–30408 | 30567–30574 | 30478–30484 | 30604, 30605, 30616–30619 | 30590, 30595–30597, 30635–30637 |")
    w("| Magicien | Guérisseur | 3887 / 3903 / 3843 / 3875 / 3871 | 30409–30415 | 30575–30585 | 30485–30491 | 30606, 30607, 30620–30623 | 30591, 30598–30600, 30629–30631 |\n")

    # monstres
    w('<a id="monstres"></a>\n## Monstres\n')
    w("Source : `https://api.dofusdb.fr/monsters/<id>` (FAIT vérifié). `startingSpellId` = id de *spell-level* lancé au début du combat.\n")
    w("| id | nom | race | grade | niv. | PV | PA | PM | Force | Int | Chance | Agi | Rés. N/T/F/E/A % | esq. PA/PM | sorts | sort de départ | boss | provenance |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for mid in sorted(ctx.monsters, key=lambda m: (ctx.monsters[m].get("race") != 313, m)):
        m = ctx.monsters[mid]
        race = ctx.races.get(m.get("race"), {})
        why = ctx.prov["monsters"].get(str(mid), [])
        whys = sorted({(x.get("why") or f"{x.get('via')} de {x.get('spellId') or x.get('monsterId')}") for x in why})
        for g in m.get("grades") or []:
            st = g.get("startingSpellId") or 0
            w(f"| {mid} | {md_escape(fr(m))} | {m.get('race')} {md_escape(fr(race))} | {g.get('grade')} | {g.get('level')} | "
              f"{g.get('lifePoints')} | {g.get('actionPoints')} | {g.get('movementPoints')} | {g.get('strength')} | "
              f"{g.get('intelligence')} | {g.get('chance')} | {g.get('agility')} | "
              f"{g.get('neutralResistance')}/{g.get('earthResistance')}/{g.get('fireResistance')}/{g.get('waterResistance')}/{g.get('airResistance')} | "
              f"{g.get('paDodge')}/{g.get('pmDodge')} | "
              f"{', '.join(str(x) for x in m.get('spells') or []) or '—'} | "
              f"{(ctx.lvl_label(st) if st else '—')} | {yn(m.get('isBoss'))} | {md_escape('; '.join(whys))[:160]} |")
    w("")

    # themes
    for key, title in THEMES:
        sids = sorted(sid for sid in S if theme[sid] == key)
        w(f'<a id="theme-{key}"></a>\n## {title}\n')
        if not sids:
            w("_(aucun sort)_\n")
            continue
        w("| id | nom | adminName | type | niveaux |\n|---|---|---|---|---|")
        for sid in sids:
            s = S[sid]
            w(f"| [{sid}](#s{sid}) | {md_escape(fr(s))} | {md_escape(s.get('adminName', ''))} | "
              f"{s.get('typeId')} {md_escape(fr(ctx.types.get(s.get('typeId'), {}), 'longName'))} | {len(s.get('spellLevels') or [])} |")
        w("")
        for sid in sids:
            render_spell(ctx, sid, w, cell_anchor)

    # cellules explicites
    w('<a id="cellules-explicitement-referencees"></a>\n## Cellules explicitement référencées\n')
    w("FAIT vérifié : zones dont `cellIds` est non vide (hors valeur par défaut `[1]` des zones `a`/`A`). "
      "La forme `;` (59) = liste explicite de cellules. Les id de cellule sont ceux de la grille DOFUS (560 cases, 14×40 en losange).\n")
    by_spell = defaultdict(list)
    for i, cr in enumerate(cell_refs):
        by_spell[cr.get("spellId")].append((i, cr))
    for sid in sorted(by_spell, key=lambda x: (theme.get(x) == "autres", x)):
        s = S.get(sid, {})
        w(f"### {sid} {ctx.sname(sid)} — thème : {theme.get(sid)}\n")
        for i, cr in by_spell[sid]:
            eff = ""
            if cr.get("effectId") is not None:
                lv = LV.get(cr.get("levelId"), {})
                e = next((x for x in (lv.get("criticalEffect" if cr.get("critical") else "effects") or [])
                          if x.get("effectUid") == cr.get("effectUid")), None)
                eff = f"effet `{cr['effectId']}` " + (ctx.fill(e) if e else "")
                if e:
                    eff += f" · cible `{ctx.annotate_mask(e.get('targetMask', ''))}` · trig `{e.get('triggers')}` · durée {e.get('duration')}"
            shape = cr.get("shape")
            L = SHAPES.get(shape, ("?",))[0]
            cells = cr.get("cellIds")
            dup = len(cells) - len(set(cells))
            w(f"- <a id=\"C{i + 1}\"></a>**C{i + 1}** — niveau {cr.get('levelId')} (grade {cr.get('grade')})"
              f"{' CRITIQUE' if cr.get('critical') else ''} · {cr.get('where')} · forme `{L}` · {eff}")
            w(f"  - {len(cells)} cellules ({len(set(cells))} distinctes{', ' + str(dup) + ' doublon(s)' if dup else ''}) : "
              f"`{cells}`")
            if dup:
                seen, dups = set(), []
                for x in cells:
                    if x in seen:
                        dups.append(x)
                    seen.add(x)
                w(f"  - doublons : `{dups}`")
            w(f"  - triées : `{sorted(set(cells))}`")
            if len(set(cells)) >= 20:
                w("\n  Rendu sur la grille DOFUS (14×40, lignes impaires décalées d'une demi-case ; `#` = cellule listée, "
                  "`@` = cellule 300 citée par 30609 « TP T5 », `.` = autre) :\n")
                w("  ```")
                for row in ascii_grid(cells, {300: "@"} if 300 not in cells else {}):
                    w("  " + row)
                w("  ```")
        w("")

    # etats
    w('<a id="etats-references"></a>\n## États référencés\n')
    w("Source : `https://api.dofusdb.fr/spell-states/<id>` (FAIT vérifié). Colonnes booléennes = propriétés de l'état.\n")
    w("| id | nom FR | empêche sorts | ne peut être déplacé | ne peut être poussé | ne peut infliger dmg | invulnérable | invuln. mêlée | invuln. distance | incurable | ne tacle pas | intaclable | ne peut échanger | silencieux | référencé par (extrait) |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for stid in sorted(ctx.states):
        st = ctx.states[stid]
        refs = ctx.prov["states"].get(str(stid), [])
        spells = sorted({r.get("spellId") for r in refs if r.get("spellId")})
        w(f"| {stid} | {md_escape(fr(st))} | {yn(st.get('preventsSpellCast'))} | {yn(st.get('cantBeMoved'))} | "
          f"{yn(st.get('cantBePushed'))} | {yn(st.get('cantDealDamage'))} | {yn(st.get('invulnerable'))} | "
          f"{yn(st.get('invulnerableMelee'))} | {yn(st.get('invulnerableRange'))} | {yn(st.get('incurable'))} | "
          f"{yn(st.get('cantTackle'))} | {yn(st.get('cantBeTackled'))} | {yn(st.get('cantSwitchPosition'))} | "
          f"{yn(st.get('isSilent'))} | {', '.join(str(x) for x in spells[:8])}{' …' if len(spells) > 8 else ''} |")
    w("")

    # non resolus
    w('<a id="references-non-resolues"></a>\n## Références non résolues / bizarreries\n')
    unres = ctx.prov.get("unresolved") or []
    if not unres:
        w("_(aucune)_")
    for u in unres:
        refs = [e for e in ctx.prov["reference_edges"] if e.get("ref") == u.get("id")]
        w(f"- {u.get('kind')} {u.get('id')} : {u.get('problem')} — référencé par : "
          + "; ".join(f"sort {r['spellId']} {ctx.sname(r['spellId'])} niveau {r['levelId']} effet {r['effectId']} ({r['param']})" for r in refs[:5]))
    w("")
    w("Tokens de masque non interprétés : `" + json.dumps(ctx.prov.get("other_targetMask_tokens"), ensure_ascii=False) + "`  ")
    w("Tokens de trigger numériques non interprétés : `" + json.dumps(ctx.prov.get("other_trigger_tokens"), ensure_ascii=False) + "`\n")
    return "\n".join(out) + "\n"


def render_spell(ctx: Ctx, sid: int, w, cell_anchor):
    s = ctx.spells[sid]
    w(f'<a id="s{sid}"></a>\n### {sid} — {md_escape(fr(s))}' + (f" · _{md_escape(s.get('adminName'))}_" if s.get("adminName") else ""))
    tname = fr(ctx.types.get(s.get("typeId"), {}), "longName")
    desc = md_escape(fr(s, "description"))
    w(f"- type {s.get('typeId')} « {md_escape(tname)} » · niveaux {s.get('spellLevels')} · "
      f"<https://api.dofusdb.fr/spells/{sid}>")
    if desc:
        w(f"- description : {desc}")
    prov = ctx.prov["spells"].get(str(sid), [])
    whys = []
    for x in prov:
        if x.get("why"):
            whys.append(x["why"])
        elif x.get("monsterId"):
            whys.append(f"sort du monstre {x['monsterId']} {ctx.mname(x['monsterId'])}")
        elif x.get("spellId"):
            whys.append(f"référencé par {x['spellId']} ({x.get('via')})")
        elif x.get("levelId"):
            whys.append(f"référencé par le niveau {x['levelId']} ({x.get('via')})")
    uniq = list(dict.fromkeys(whys))
    w(f"- provenance : {'; '.join(uniq[:6])}{' …(+' + str(len(uniq) - 6) + ')' if len(uniq) > 6 else ''}")
    bsu = s.get("boundScriptUsageData") or []
    if bsu:
        w("- scripts liés (boundScriptUsageData) : " + "; ".join(
            f"script {b.get('scriptId')} (cible `{ctx.annotate_mask(b.get('targetMask', ''))}`, zone `{b.get('targetZone')}`"
            + (f", niveaux {b.get('spellLevels')}" if b.get('spellLevels') else "")
            + (f", critère `{b.get('criterion')}`" if b.get('criterion') else "") + ")" for b in bsu))
    for lid in s.get("spellLevels") or []:
        lv = ctx.levels.get(lid)
        if not lv:
            w(f"- **niveau {lid} : ABSENT**")
            continue
        rng = f"{lv.get('minRange')}–{lv.get('range')}"
        crit_state = ctx.annotate_criterion(lv.get("statesCriterion", ""))
        w(f"\n**Niveau {lv.get('grade')}** (spell-level {lid}) — PA **{lv.get('apCost')}** · PO {rng} "
          f"(modifiable {yn(lv.get('rangeCanBeBoosted'))}) · ligne {yn(lv.get('castInLine'))} · diagonale {yn(lv.get('castInDiagonal'))} · "
          f"LdV {yn(lv.get('castTestLos'))} · case libre {yn(lv.get('needFreeCell'))} · case occupée {yn(lv.get('needTakenCell'))} · "
          f"case sans piège {yn(lv.get('needFreeTrapCell'))} · lancers/tour {lv.get('maxCastPerTurn')} · lancers/cible {lv.get('maxCastPerTarget')} · "
          f"intervalle {lv.get('minCastInterval')} · relance initiale {lv.get('initialCooldown')} · relance globale {lv.get('globalCooldown')} · "
          f"critique {lv.get('criticalHitProbability')} % · statesCriterion `{crit_state or '—'}`"
          + (f" · maxStack {lv.get('maxStack')}" if lv.get("maxStack") not in (-1, None) else "")
          + (f" · lancers globaux/tour {lv.get('maxGlobalCastPerTurn')}" if lv.get("maxGlobalCastPerTurn") else "")
          + (f" · lancers globaux/cible {lv.get('maxGlobalCastPerTarget')}" if lv.get("maxGlobalCastPerTarget") else "")
          + (" · cible visible requise" if lv.get("needVisibleEntity") else "")
          + (" · effets cachés" if lv.get("hideEffects") else "")
          + (" · niveau caché" if lv.get("hidden") else ""))
        for pz in lv.get("previewZones") or []:
            w(f"  - zone d'aperçu : {zone_str(pz)}")
        for key, label in (("effects", "Effets"), ("criticalEffect", "Effets critiques")):
            effs = lv.get(key) or []
            if not effs and key == "criticalEffect":
                continue
            w(f"\n{label} ({len(effs)}) :\n")
            for e in effs:
                anchor = cell_anchor.get((sid, lid, e.get("effectUid"), "effect.zoneDescr"))
                bits = [f"cible `{ctx.annotate_mask(e.get('targetMask', ''))}`",
                        f"trig `{ctx.annotate_triggers(e.get('triggers', ''))}`",
                        f"durée {e.get('duration')}"]
                if e.get("delay"):
                    bits.append(f"délai {e['delay']}")
                bits.append(f"zone {zone_str(e.get('zoneDescr'), f'[{anchor}](#{anchor})' if anchor else None)}")
                bits.append(f"dispellable {e.get('dispellable')}")
                if e.get("group"):
                    bits.append(f"group {e['group']}")
                if e.get("random"):
                    bits.append(f"random {e['random']}")
                if e.get("effectElement", -1) not in (-1, None):
                    bits.append(f"élément {e['effectElement']}")
                if e.get("targetId"):
                    bits.append(f"targetId {e['targetId']}")
                if e.get("modificator"):
                    bits.append(f"modificator {e['modificator']}")
                if e.get("effectTriggerDuration"):
                    bits.append(f"triggerDuration {e['effectTriggerDuration']}")
                raw = f"[{e.get('diceNum')},{e.get('diceSide')},{e.get('value')}]"
                w(f"{e.get('order')}. `{e['effectId']}` {ctx.fill(e)} — raw {raw} · " + " · ".join(bits))
    w("")


def render_index(ctx: Ctx) -> str:
    sm = ctx.summary
    c = sm["counts"]
    files = [
        ("spells.json", "dict id → objet sort complet (/spells)", c["spells"]),
        ("spell_levels.json", "dict id → niveau de sort complet (/spell-levels), effets normaux + critiques", c["spell_levels"]),
        ("effects.json", "dict effectId → définition complète (/effects) des effets rencontrés", c["distinct_effect_ids"]),
        ("effects_catalog_fr.json", "catalogue COMPLET des effets : description FR/EN + classification des paramètres (sort/monstre/état)", len(ctx.catalog)),
        ("spell_states.json", "dict id → état (/spell-states) référencé", c["states"]),
        ("monsters.json", "dict id → monstre (/monsters) : race 313 + invoqués/référencés", c["monsters"]),
        ("monster_races.json", "races des monstres extraits", c["races"]),
        ("spell_types.json", "types de sorts (/spell-types) des sorts extraits", c["spell_types"]),
        ("maps.json", "map-positions 139988485 (arène, instance de combat) et 139725313 (extérieur) + sous-zone 84", len(ctx.maps.get("map-positions", {}))),
        ("provenance.json", "graphe de références (sort→sort/monstre/état), provenance de chaque objet, cellIds explicites, non-résolus", c["reference_edges"]),
        ("summary.json", "paramètres et comptes de l'extraction", None),
        ("decoded_spells.md", "décodage lisible de tous les sorts, groupés par thème", None),
    ]
    L = []
    w = L.append
    w("# Données brutes DofusDB — Gladiatrool\n")
    w(f"Extraction du {sm['generated_at']} depuis {sm['api']} (données du client DOFUS 3). "
      "Toutes les données de ce dossier sont des **FAITS vérifiés (source primaire)** ; "
      "les interprétations sont dans `decoded_spells.md` avec niveau de confiance.\n")
    w("## Fichiers\n")
    w("| fichier | contenu | nb |\n|---|---|---|")
    for f, d, n in files:
        w(f"| `{f}` | {d} | {'' if n is None else n} |")
    w("\n## Comptes\n")
    w("| clé | valeur |\n|---|---|")
    for k, v in c.items():
        w(f"| {k} | {v} |")
    w(f"\nRequêtes HTTP lors du dernier run : {sm['http_requests']} (cache : {sm['cache_hits']} hits), durée {sm['elapsed_s']} s.\n")
    w("## Points saillants (calculés depuis les données)\n")
    for line in key_points(ctx):
        w(f"- {line}")
    w("")
    w("## Périmètre de l'extraction\n")
    p = sm["params"]
    w(f"- Plage principale : sorts d'id {p['range'][0]}..{p['range'][1]} (tous).")
    w(f"- Plage étendue {p['extra_range'][0]}..{p['extra_range'][1]} filtrée par typeId ∈ {p['extra_types']} "
      "(types partagés avec les sorts Gladiatrool : MANAGERS, PASSIVE SPELLS, Sort uniques, Déclenchés Glyphe, "
      "Déclenchés Mama Troollette, Trooler).")
    w(f"- Recherches par nom : {p['name_regexes']} (Feathers `$regex`).")
    w(f"- Monstres de la race {p['races']} + tout monstre invoqué (effets « Invoque : #1 », 181/1008/1011...) "
      "ou ciblé par masque (`F<id>`/`f<id>`), avec leurs sorts et `startingSpellId`.")
    w("- Fermeture récursive : tout sort référencé par un effet (description `#1` = lancement de sous-sort : 792, 1160, 2160, "
      "1017-1019, 2017, 2792, 2794, 2960… ; pose de glyphe/piège/rune 400/401/402/1091/1165 ; modificateurs `#1 : …` ; "
      "406 ; 3405/3406 via id de spell-level), détecté génériquement à partir du catalogue d'effets "
      "(`effects_catalog_fr.json`, champ `params`).")
    w("- États : effets 950/951/952 (`value`), masques `E<id>`/`e<id>` (avec ou sans `*`), `statesCriterion` (`HS=<id>`, `HS!<id>`), triggers `EON<id>`/`EOFF<id>`.")
    w("- Limite connue : DofusDB **n'expose pas les cellules de la carte** (`/maps/<id>` → 404) ; seules les map-positions et l'image "
      "(`https://api.dofusdb.fr/img/maps/1/139988485.jpg`) sont disponibles. Les cellules des pics viennent des `cellIds` des sorts.\n")
    w("## Relancer\n")
    w("```bash\ncd /home/user/GladiatroolSimu\n"
      "python3 tools/dofusdb/extract.py            # cache : ~/.cache/gladiatrool-dofusdb (ou $DOFUSDB_CACHE / --cache-dir)\n"
      "python3 tools/dofusdb/extract.py --refresh  # forcer le re-téléchargement\n"
      "python3 tools/dofusdb/decode.py             # régénère decoded_spells.md et INDEX.md\n```\n")
    w("Le script est idempotent : même cache → mêmes fichiers (hors horodatage de `summary.json`). "
      "Stdlib uniquement ; proxy/CA pris dans l'environnement (HTTPS_PROXY, SSL_CERT_FILE).\n")
    return "\n".join(L) + "\n"


def key_points(ctx: Ctx) -> list[str]:
    """Faits saillants recalcules a chaque generation (FAIT verifie sauf mention)."""
    pts = []
    S, LV = ctx.spells, ctx.levels

    def lv_of(sid, grade):
        for lid in (S.get(sid) or {}).get("spellLevels") or []:
            lv = LV.get(lid)
            if lv and lv.get("grade") == grade:
                return lv
        return None

    g1 = lv_of(30390, 1)
    if g1:
        for e in g1.get("effects") or []:
            cells = (e.get("zoneDescr") or {}).get("cellIds") or []
            if cells:
                dup = sorted({c for c in cells if cells.count(c) > 1})
                pts.append(f"**Pics** : sort 30390 « Glyphe de combat » niv.1 (spell-level {g1['id']}), effet `{e['effectId']}` "
                           f"{ctx.fill(e)} sur **{len(set(cells))} cellules distinctes** ({len(cells)} listées, doublons {dup}) : "
                           f"`{sorted(set(cells))}`. Rendu ASCII : section « Cellules explicitement référencées » de decoded_spells.md.")
    for grade, label in ((2, "glyphe-aura (entrée dans les pics)"), (3, "glyphe de début de tour (commencer son tour dans les pics)")):
        lv = lv_of(30390, grade)
        if lv:
            pts.append(f"30390 niv.{grade} = {label} : " + " ; ".join(
                f"{ctx.fill(e)} [cible `{e.get('targetMask')}`, trig `{e.get('triggers')}`, durée {e.get('duration')}]"
                for e in lv.get("effects") or []))
    lv = lv_of(30701, 1)
    if lv:
        pts.append("30700 → 30701 (passif de tous les Troolls via 30694 « Trooler » et des joueurs via 30639) : quand l'état "
                   "5902/5903 (« a déclenché le glyphe ») est PERDU (`EOFF`), le porteur reçoit : " + " ; ".join(
                       f"{ctx.fill(e)} [durée {e.get('duration')}]" for e in lv.get("effects") or []))
    lv = lv_of(30609, 3)
    if lv:
        for e in lv.get("effects") or []:
            cells = (e.get("zoneDescr") or {}).get("cellIds") or []
            if cells:
                pts.append(f"Boss : 30609 « Rassemblement Troollesque [Passe-tour + TP T5] » niv.3 vise la cellule **{cells}** "
                           "(centre de l'anneau de pics) ; niv.4 = téléportation (zone C63). Niv.1 porte un `delay` de "
                           + str(next((x.get('delay') for x in (lv_of(30609, 1) or {}).get('effects', []) if x.get('delay')), '?'))
                           + " sur ses effets.")
    sm = S.get(30626)
    if sm:
        rows = []
        for lid in sm.get("spellLevels") or []:
            lv = LV.get(lid)
            if not lv:
                continue
            per = {}
            for e in lv.get("effects") or []:
                if e["effectId"] == 3405 and e.get("value") in LV:
                    m = e.get("targetMask", "")
                    arch = "Dompteur" if "E5899" in m else "Acrobate" if "E5900" in m else "Magicien" if "E5901" in m else m
                    tl = LV[e["value"]]
                    per[arch] = f"{tl['spellId']} {fr(S.get(tl['spellId']))}"
            rows.append(f"niv.{lv['grade']}: " + ", ".join(f"{k} → {v}" for k, v in per.items()))
        pts.append("Déblocage des sorts (30626 « Spell Manager », lancé par chaque « Reward » d'objectif) : " + " | ".join(rows)
                   + ". Sorts de départ (hypothèse : sort 1 de chaque archétype) : Impact 30395, Videur 30402, Pulsation d'Énergie 30409.")
    ms = []
    for mid in (7980, 7981, 7982, 7983, 7984, 7985):
        m = ctx.monsters.get(mid)
        if m and m.get("grades"):
            g = m["grades"][0]
            ms.append(f"{mid} {fr(m)} (niv {g['level']}, {g['lifePoints']} PV, {g['actionPoints']} PA, {g['movementPoints']} PM, "
                      f"Force {g['strength']}, sorts {m.get('spells')})")
    pts.append("Monstres race 313 : " + " ; ".join(ms) + ".")
    pts.append("7980 « Gladiatroolleur » a pour sort de départ 30639 « Gladiatrooller [Passif] » qui applique des bonus selon l'état "
               "d'archétype du porteur (5899 Dompteur : +3000 Puissance ; 5900 Acrobate : +5000 Vitalité ; 5901 Magicien : −5000 Vitalité) "
               "et fixe la durée de tour à 60 s ⇒ HYPOTHÈSE forte : les joueurs sont transformés en Gladiatroolleur (sort commun 30416 « Frappe Repoussoir »).")
    summoned = {int(e["ref"]) for e in ctx.prov["reference_edges"] if e.get("kind") == "monster" and str(e.get("param")) != "targetMask"}
    troolls = [m for m in (7980, 7981, 7982, 7983, 7984) if m not in summoned]
    pts.append(f"Aucun effet d'invocation des données client ne fait apparaître les Troolls {troolls} ⇒ les vagues d'apparition "
               "(quels monstres, à quel tour, sur quelles cellules) sont gérées côté serveur : à établir par observation (vidéos/guides).")
    for u in ctx.prov.get("unresolved") or []:
        refs = [e for e in ctx.prov["reference_edges"] if e.get("ref") == u.get("id")]
        pts.append(f"Bizarrerie : {u.get('kind')} {u.get('id')} introuvable ({u.get('problem')}), référencé par "
                   + ", ".join(f"{r['spellId']} {fr(S.get(r['spellId']))}" for r in refs[:3])
                   + " — l'amélioration correspondante pourrait être cassée ou la donnée manquer côté DofusDB.")
    return pts


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=str(DEFAULT_DIR))
    args = ap.parse_args(argv)
    d = Path(args.dir)
    ctx = Ctx(d)
    (d / "decoded_spells.md").write_text(render(ctx), "utf-8")
    (d / "INDEX.md").write_text(render_index(ctx), "utf-8")
    print(f"ecrit {d / 'decoded_spells.md'} et {d / 'INDEX.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
