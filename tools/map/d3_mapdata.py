#!/usr/bin/env python3
"""Extract per-cell data of a DOFUS 3 (Unity) map from its Addressables bundle.

DOFUS 3 stores each map as a MonoBehaviour 'map_<mapId>' (type tree present) in
Dofus_Data/StreamingAssets/Content/Map/Data/mapdata_assets_world_<N>.bundle.
The bundle containing a given map is resolved from Content/Map/Data/catalog_1.0.bin
(Addressables binary catalog) by find_bundle_for_map().

Usage:
  python3 d3_mapdata.py find   <catalog_1.0.bin> <mapId>
  python3 d3_mapdata.py cells  <bundle> <mapId> <out.json>
"""
import sys, re, struct, json

UNITY_FALLBACK = '6000.0.0f1'  # bundles carry no version string; any 6000.x works for reading


def find_bundle_for_map(catalog_path, map_id):
    b = open(catalog_path, 'rb').read()
    u = lambda o: struct.unpack_from('<I', b, o)[0]
    m = re.search(rb'map_' + str(map_id).encode() + rb'\.asset', b)
    if not m:
        return None
    dep = u(m.end() + 12)           # offset of the dependency list of this asset entry
    n = u(dep - 4) // 4
    locs = [u(dep + 4 * i) for i in range(n)]
    key = u(locs[0])                # first dependency -> location record -> primaryKey string
    ln = u(key - 4)
    return b[key:key + ln].decode()


def load_map(bundle_path, map_id):
    import UnityPy, warnings
    warnings.filterwarnings('ignore')
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_FALLBACK
    env = UnityPy.load(bundle_path)
    for o in env.objects:
        if o.type.name == 'MonoBehaviour' and o.peek_name() == f'map_{map_id}':
            return o.read_typetree()
    raise SystemExit(f'map_{map_id} not in {bundle_path}')


def list_maps(bundle_path):
    import UnityPy, warnings
    warnings.filterwarnings('ignore')
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_FALLBACK
    env = UnityPy.load(bundle_path)
    return [o.peek_name() for o in env.objects if o.type.name == 'MonoBehaviour']


def extract(tt, map_id):
    """Normalise the known layouts:
    - 3.6 (live 'dofus3' 3.6.12.x): fields under tt['mapData']; elements carry 'transform' (m31/m32).
    - 3.7 (beta 3.7.2.x): flat fields; elements are SerializeReference 'rid's resolved through
      tt['references']['RefIds'] (ClientMapElement: position{x,y}, scale{x,y}, gfxId);
      cellsData lost nonWalkableDuringFight/RP and 'floor' became 'altitude'."""
    if 'mapData' in tt:
        md = tt['mapData']
        pos = lambda e: (e['transform']['m31'], e['transform']['m32'], e['transform']['m11'] < 0)
        bg = [dict(gfxId=e['gfxId'], x=pos(e)[0], y=pos(e)[1], flipX=pos(e)[2]) for e in md['backgroundElements']]
        mid = [dict(gfxId=e['gfxId'], cellId=e['cellId'], x=pos(e)[0], y=pos(e)[1]) for e in md['sortableElements']]
        anim = [dict(gfxId=e['gfxId'], cellId=e['cellId']) for e in md['animatedElements']]
        layout = '3.6 (mapData)'
    else:
        md = tt
        refs = {r['rid']: r.get('data') for r in tt['references']['RefIds']}
        def group(groups, with_cell):
            out = []
            for g in groups:
                for ref in g['mapElements']:
                    d = refs.get(ref['rid']) or {}
                    if 'position' not in d:
                        continue
                    item = dict(gfxId=d.get('gfxId'), x=d['position']['x'], y=d['position']['y'],
                                flipX=d.get('scale', {}).get('x', 1) < 0)
                    if with_cell:
                        item['cellId'] = g.get('cellId')
                    out.append(item)
            return out
        bg = group(md['backgroundMapElements'], False)
        mid = group(md['middlegroundMapElements'], True)
        anim = [dict(gfxId=(refs.get(r['rid']) or {}).get('gfxId'), cellId=(refs.get(r['rid']) or {}).get('cellId'))
                for r in md['mapAnimatedElements']]
        layout = '3.7 (flat, SerializeReference)'
    return dict(mapId=map_id, layout=layout,
                neighbours=dict(top=md['topNeighbourId'], bottom=md['bottomNeighbourId'],
                                left=md['leftNeighbourId'], right=md['rightNeighbourId']),
                cellsData=md['cellsData'], backgroundElements=bg, sortableElements=mid, animatedElements=anim)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'find':
        print(find_bundle_for_map(sys.argv[2], int(sys.argv[3])))
    elif cmd == 'list':
        print('\n'.join(list_maps(sys.argv[2])))
    elif cmd == 'cells':
        tt = load_map(sys.argv[2], int(sys.argv[3]))
        json.dump(extract(tt, int(sys.argv[3])), open(sys.argv[4], 'w'), indent=0)
        print('ok ->', sys.argv[4])
