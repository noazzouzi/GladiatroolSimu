#!/usr/bin/env python3
"""Extrait l'énumération des « ActionIds » (identifiants d'effets) du client DOFUS 3 (Unity/IL2CPP).

Source : ``Dofus_Data/il2cpp_data/Metadata/global-metadata.dat`` de la release Cytrus ``dofus3``
(testé : 6.0_3.6.12.16, métadonnées IL2CPP version 39, sha1 8a2944d5007de8bcb9f53c5de3d6e9e525c8124f).
Téléchargement (sans launcher) avec l'outil de l'agent « carte » :

    python3 tools/map/cytrus.py get <manifest dofus3 windows> \
        Dofus_Data/il2cpp_data/Metadata/global-metadata.dat /tmp/.../global-metadata.dat

Principe : l'en-tête v39 est une suite de triplets (offset, taille, nombre) ; on lit la table des
chaînes, la table des champs (12 o : nameIndex, typeIndex, token), la table des valeurs par défaut des
champs (12 o : fieldIndex, typeIndex, dataIndex) et le blob de données.  L'énumération recherchée est la
suite contiguë de champs dont la valeur par défaut a le même type que le champ « CharacterBoostPushDamage »
(type sous-jacent 16 bits : 414 = 0x019E, contrôle intégré).

Usage : python3 tools/mechanics/il2cpp_actionids.py <global-metadata.dat> <sortie.json>
"""
from __future__ import annotations

import hashlib
import json
import struct
import sys


def extract(path: str) -> dict:
    b = open(path, 'rb').read()
    magic, version = struct.unpack_from('<Ii', b, 0)
    if magic != 0xFAB11BAF:
        raise SystemExit('pas un fichier global-metadata.dat')
    h = struct.unpack_from('<96i', b, 8)
    tables = [(h[3 * i], h[3 * i + 1], h[3 * i + 2]) for i in range(32)]
    str_off, str_size, _ = tables[2]
    fdv_off, _, fdv_n = tables[7]
    data_off = tables[8][0]
    fld_off, _, fld_n = tables[11]
    fields = [struct.unpack_from('<iiI', b, fld_off + 12 * i) for i in range(fld_n)]
    fdv = {}
    for i in range(fdv_n):
        fi, ti, di = struct.unpack_from('<iii', b, fdv_off + 12 * i)
        fdv[fi] = (ti, di)

    def cstr(idx: int) -> str:
        e = b.index(b'\x00', str_off + idx)
        return b[str_off + idx:e].decode('utf-8', 'replace')

    key = b'\x00CharacterBoostPushDamage\x00'
    pos = b.find(key, str_off, str_off + str_size)
    idx = pos + 1 - str_off
    anchor = next(i for i, (ni, _t, _k) in enumerate(fields) if ni == idx and i in fdv)
    tidx = fdv[anchor][0]
    s = anchor
    while s - 1 in fdv and fdv[s - 1][0] == tidx:
        s -= 1
    e = anchor
    while e + 1 in fdv and fdv[e + 1][0] == tidx:
        e += 1
    out = {}
    for fi in range(s, e + 1):
        v = struct.unpack_from('<H', b, data_off + fdv[fi][1])[0]
        out.setdefault(v, []).append(cstr(fields[fi][0]))
    assert out.get(414) == ['CharacterBoostPushDamage'], 'contrôle 414 échoué'
    return {
        'source': 'DOFUS 3 client IL2CPP global-metadata.dat (enum ActionIds, type sous-jacent uint16)',
        'metadataVersion': version,
        'sha1': hashlib.sha1(b).hexdigest(),
        'count': sum(len(v) for v in out.values()),
        'actionIds': {str(k): v for k, v in sorted(out.items())},
    }


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    res = extract(sys.argv[1])
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(f"{res['count']} noms d'actions -> {sys.argv[2]}")
