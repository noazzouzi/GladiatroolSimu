#!/usr/bin/env python3
"""Reader for DOFUS 2 .d2p archives (content/maps/maps*.d2p).

Format (big-endian, AS3 ByteArray): 2-byte header (2,1); the last 24 bytes are
  dataOffset, dataCount, indexOffset, indexCount, propertiesOffset, propertiesCount (u32 each).
Index entry = UTF(name: u16 length + bytes), u32 offset (relative to dataOffset), u32 length.
Map files are stored as '<mapId % 10>/<mapId>.dlm' (zlib-compressed).

Usage: python3 d2p.py find <mapId> <d2p files...>
       python3 d2p.py extract <mapId> <out.dlm> <d2p files...>
"""
import struct, sys


def read_index(path):
    with open(path, 'rb') as f:
        buf = f.read()
    dataOffset, dataCount, indexOffset, indexCount, propOffset, propCount = struct.unpack_from('>6I', buf, len(buf) - 24)
    p = indexOffset
    entries = {}
    for _ in range(indexCount):
        n = struct.unpack_from('>H', buf, p)[0]; p += 2
        name = buf[p:p + n].decode('utf-8'); p += n
        off, ln = struct.unpack_from('>II', buf, p); p += 8
        entries[name] = (dataOffset + off, ln)
    # Properties (e.g. 'link' -> next d2p). The 'count' field of recent archives is
    # not reliable (observed 19 for a single 'link' pair), so parse defensively.
    props = {}
    p = propOffset
    try:
        for _ in range(min(propCount, 8)):
            if p >= indexOffset and propOffset < indexOffset:
                break
            n = struct.unpack_from('>H', buf, p)[0]; p += 2
            k = buf[p:p + n].decode(); p += n
            n = struct.unpack_from('>H', buf, p)[0]; p += 2
            v = buf[p:p + n].decode(); p += n
            props[k] = v
    except (UnicodeDecodeError, struct.error):
        pass
    return buf, entries, props


def find_map(map_id, paths):
    key = f'{map_id % 10}/{map_id}.dlm'
    for path in paths:
        buf, entries, props = read_index(path)
        if key in entries:
            off, ln = entries[key]
            return path, key, buf[off:off + ln]
    return None, key, None


if __name__ == '__main__':
    cmd = sys.argv[1]
    mid = int(sys.argv[2])
    if cmd == 'find':
        path, key, data = find_map(mid, sys.argv[3:])
        print(path, key, None if data is None else len(data))
    elif cmd == 'extract':
        out = sys.argv[3]
        path, key, data = find_map(mid, sys.argv[4:])
        if data is None:
            raise SystemExit(f'{key} not found')
        open(out, 'wb').write(data)
        print(f'{key} found in {path}: {len(data)} bytes -> {out}')
