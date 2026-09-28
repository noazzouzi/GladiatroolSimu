#!/usr/bin/env python3
"""Minimal Cytrus v6 (Ankama CDN) client: parse a .manifest (FlatBuffers) and
extract individual files without the launcher.

Manifest schema (Cytrus v6, reverse-documented by the community, e.g. npm "cytrus-v6"):
  table Chunk    { hash:[byte]; size:long; offset:long; }
  table File     { name:string; size:long; hash:[byte]; chunks:[Chunk]; executable:bool; symlink:string; }
  table Bundle   { hash:[byte]; chunks:[Chunk]; }
  table Fragment { name:string; files:[File]; bundles:[Bundle]; }
  table Manifest { fragments:[Fragment]; }
Bundles live at https://cytrus.cdn.ankama.com/<game>/bundles/<hash[:2]>/<hash>.
A file = list of chunks (by hash); each chunk is stored inside some bundle at
(offset,size). Small files have no chunk list: the file hash itself is a chunk.

Usage:
  python3 cytrus.py list  <manifest> [regex]
  python3 cytrus.py get   <manifest> <file-name> <out-path> [--game dofus]
"""
import struct, sys, re, os, hashlib, urllib.request

CDN = "https://cytrus.cdn.ankama.com"


class FB:
    def __init__(self, buf):
        self.b = buf

    def u32(self, p):
        return struct.unpack_from('<I', self.b, p)[0]

    def i32(self, p):
        return struct.unpack_from('<i', self.b, p)[0]

    def u16(self, p):
        return struct.unpack_from('<H', self.b, p)[0]

    def root(self):
        return self.u32(0)

    def field(self, tab, idx):
        vt = tab - self.i32(tab)
        vtsize = self.u16(vt)
        o = 4 + 2 * idx
        if o >= vtsize:
            return None
        off = self.u16(vt + o)
        return tab + off if off else None

    def ref(self, p):
        return p + self.u32(p)

    def string(self, tab, idx):
        p = self.field(tab, idx)
        if p is None:
            return None
        s = self.ref(p)
        n = self.u32(s)
        return self.b[s + 4:s + 4 + n].decode('utf-8')

    def bytes_(self, tab, idx):
        p = self.field(tab, idx)
        if p is None:
            return None
        s = self.ref(p)
        n = self.u32(s)
        return bytes(self.b[s + 4:s + 4 + n])

    def i64(self, tab, idx):
        p = self.field(tab, idx)
        return 0 if p is None else struct.unpack_from('<q', self.b, p)[0]

    def tables(self, tab, idx):
        p = self.field(tab, idx)
        if p is None:
            return []
        v = self.ref(p)
        n = self.u32(v)
        return [self.ref(v + 4 + 4 * i) for i in range(n)]


def parse_manifest(path):
    fb = FB(open(path, 'rb').read())
    frags = []
    for fr in fb.tables(fb.root(), 0):
        name = fb.string(fr, 0)
        files = []
        for f in fb.tables(fr, 1):
            chunks = [(fb.bytes_(c, 0).hex(), fb.i64(c, 1), fb.i64(c, 2)) for c in fb.tables(f, 3)]
            files.append(dict(name=fb.string(f, 0), size=fb.i64(f, 1), hash=fb.bytes_(f, 2).hex() if fb.bytes_(f, 2) else None, chunks=chunks))
        bundles = []
        for bd in fb.tables(fr, 2):
            bundles.append(dict(hash=fb.bytes_(bd, 0).hex(), chunks=[(fb.bytes_(c, 0).hex(), fb.i64(c, 1), fb.i64(c, 2)) for c in fb.tables(bd, 1)]))
        frags.append(dict(name=name, files=files, bundles=bundles))
    return frags


def chunk_index(frags):
    idx = {}
    for fr in frags:
        for bd in fr['bundles']:
            for (h, size, off) in bd['chunks']:
                idx[h] = (bd['hash'], off, size)
    return idx


def fetch_range(game, bundle, off, size):
    url = f"{CDN}/{game}/bundles/{bundle[:2]}/{bundle}"
    req = urllib.request.Request(url, headers={'Range': f'bytes={off}-{off + size - 1}'})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if len(data) != size:  # server ignored Range -> slice
        data = data[off:off + size]
    return data


def get_file(frags, name, out, game='dofus'):
    idx = chunk_index(frags)
    f = next((f for fr in frags for f in fr['files'] if f['name'] == name), None)
    if f is None:
        raise SystemExit(f'file not found: {name}')
    parts = f['chunks'] or [(f['hash'], f['size'], 0)]
    data = bytearray()
    for (h, size, off) in parts:
        bundle, boff, bsize = idx[h]
        chunk = fetch_range(game, bundle, boff, bsize)
        if hashlib.sha1(chunk).hexdigest() != h:
            print(f'warning: sha1 mismatch for chunk {h}', file=sys.stderr)
        data += chunk
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, 'wb').write(data)
    print(f'{name} -> {out} ({len(data)} bytes, sha1={hashlib.sha1(data).hexdigest()}, expected {f["hash"]})')


if __name__ == '__main__':
    cmd, man = sys.argv[1], sys.argv[2]
    frags = parse_manifest(man)
    if cmd == 'list':
        rx = re.compile(sys.argv[3]) if len(sys.argv) > 3 else None
        for fr in frags:
            for f in fr['files']:
                if rx is None or rx.search(f['name']):
                    print(fr['name'], f['name'], f['size'], sep='\t')
    elif cmd == 'get':
        game = 'dofus'
        if '--game' in sys.argv:
            game = sys.argv[sys.argv.index('--game') + 1]
        get_file(frags, sys.argv[3], sys.argv[4], game)
