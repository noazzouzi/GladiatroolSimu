#!/usr/bin/env python3
"""Parser for DOFUS 2 map files (.dlm, zlib-compressed), after
com.ankamagames.atouin.data.map.Map / Layer / Cell / CellData (client 2.x).
Only what is needed to recover per-cell data (CellData) is kept, but layers are
fully walked (GraphicalElement / SoundElement) because they precede CellData.

Usage: python3 dlm.py <file.dlm>   -> prints a JSON summary
"""
import struct, zlib, json, sys

MAP_CELLS_COUNT = 560
MAP_WIDTH = 14
MAP_HEIGHT = 20
LEGACY_SOUND_FIELDS = False
DECRYPTION_KEY = b"649ae451ca33ec53bbcbcc33becf15f4"  # public 2.x key (only for encrypted maps)


class R:
    def __init__(self, b):
        self.b = b; self.p = 0

    def _u(self, fmt):
        v = struct.unpack_from('>' + fmt, self.b, self.p)[0]
        self.p += struct.calcsize(fmt)
        return v

    def byte(self): return self._u('b')
    def ubyte(self): return self._u('B')
    def short(self): return self._u('h')
    def ushort(self): return self._u('H')
    def int(self): return self._u('i')
    def uint(self): return self._u('I')
    def bool(self): return self._u('B') != 0
    def bytes(self, n):
        v = self.b[self.p:self.p + n]; self.p += n; return v


def parse_cell_data(r, v, cid):
    c = dict(id=cid)
    floor = r.byte() * 10
    c['floor'] = floor
    if floor == -1280:
        c['empty'] = True
        return c
    if v >= 9:
        bits = r.short() & 0xFFFF
        c['rawBits'] = bits
        c['mov'] = (bits & 1) == 0
        c['nonWalkableDuringFight'] = (bits & 2) != 0
        c['nonWalkableDuringRP'] = (bits & 4) != 0
        c['los'] = (bits & 8) == 0
        c['blue'] = (bits & 16) != 0
        c['red'] = (bits & 32) != 0
        c['visible'] = (bits & 64) != 0
        c['farmCell'] = (bits & 128) != 0
        if v >= 10:
            c['havenbagCell'] = (bits & 256) != 0
            c['topArrow'] = (bits & 512) != 0
            c['bottomArrow'] = (bits & 1024) != 0
            c['rightArrow'] = (bits & 2048) != 0
            c['leftArrow'] = (bits & 4096) != 0
        else:
            c['havenbagCell'] = False
            c['topArrow'] = (bits & 256) != 0
            c['bottomArrow'] = (bits & 512) != 0
            c['rightArrow'] = (bits & 1024) != 0
            c['leftArrow'] = (bits & 2048) != 0
    else:
        lm = r.ubyte()
        c['rawBits'] = lm
        c['los'] = (lm & 2) >> 1 == 1
        c['mov'] = (lm & 1) == 1
        c['visible'] = (lm & 64) >> 6 == 1
        c['farmCell'] = (lm & 32) >> 5 == 1
        c['blue'] = (lm & 16) >> 4 == 1
        c['red'] = (lm & 8) >> 3 == 1
        c['nonWalkableDuringRP'] = (lm & 128) >> 7 == 1
        c['nonWalkableDuringFight'] = (lm & 4) >> 2 == 1
        c['havenbagCell'] = False
    c['speed'] = r.byte()
    c['mapChangeData'] = r.ubyte()
    if v > 5:
        c['moveZone'] = r.ubyte()
    has_lz_rp = c['mov'] and not c['farmCell']
    has_lz_fight = c['mov'] and not c['nonWalkableDuringFight'] and not c['farmCell'] and not c['havenbagCell']
    if v > 10 and (has_lz_rp or has_lz_fight):
        c['linkedZone'] = r.ubyte()
    if 7 < v < 9:
        r.byte()
    return c


def parse_dlm(raw):
    data = zlib.decompress(raw)
    r = R(data)
    m = {}
    header = r.byte()
    if header != 77:
        raise ValueError('bad header %r' % header)
    v = m['mapVersion'] = r.byte()
    m['id'] = r.uint()
    if v >= 7:
        m['encrypted'] = r.bool()
        m['encryptionVersion'] = r.byte()
        ln = r.int()
        if m['encrypted']:
            enc = r.bytes(ln)
            dec = bytes(b ^ DECRYPTION_KEY[i % len(DECRYPTION_KEY)] for i, b in enumerate(enc))
            r = R(dec)
    m['relativeId'] = r.uint()
    m['mapType'] = r.byte()
    m['subareaId'] = r.int()
    m['topNeighbourId'] = r.int()
    m['bottomNeighbourId'] = r.int()
    m['leftNeighbourId'] = r.int()
    m['rightNeighbourId'] = r.int()
    m['shadowBonusOnEntities'] = r.uint()
    if v >= 9:
        m['backgroundColor'] = r.int()
        m['gridColor'] = r.uint()
    elif v >= 3:
        m['backgroundRGB'] = (r.byte(), r.byte(), r.byte())
    if v >= 4:
        m['zoomScale'] = r.ushort() / 100
        m['zoomOffsetX'] = r.short()
        m['zoomOffsetY'] = r.short()
    if v > 10:
        m['tacticalModeTemplateId'] = r.int()
    # NB: older 2.x clients read useLowPassFilter/useReverb(/presetId) here; the
    # 2.73 map files (mapVersion 11) go straight to the fixture counts (verified:
    # the parse then consumes the buffer exactly, see _bytesRemaining == 0).
    if LEGACY_SOUND_FIELDS:
        m['useLowPassFilter'] = r.bool()
        m['useReverb'] = r.bool()
        m['presetId'] = r.int() if m['useReverb'] else -1

    def fixture():
        return dict(fixtureId=r.int(), offX=r.short(), offY=r.short(), rotation=r.short(),
                    xScale=r.short(), yScale=r.short(), rgb=(r.byte(), r.byte(), r.byte()), alpha=r.ubyte())
    m['backgroundFixtures'] = [fixture() for _ in range(r.byte())]
    m['foregroundFixtures'] = [fixture() for _ in range(r.byte())]
    r.int()  # unknown
    m['groundCRC'] = r.int()
    layers = []
    for _ in range(r.byte()):
        lay = dict(layerId=r.byte() if v >= 9 else r.int(), cells=[])
        for _ in range(r.short()):
            cell = dict(cellId=r.short(), elements=[])
            for _ in range(r.short()):
                t = r.byte()
                if t == 2:  # GraphicalElement
                    e = dict(type='graphical', elementId=r.uint(), hue=(r.byte(), r.byte(), r.byte()),
                             shadow=(r.byte(), r.byte(), r.byte()))
                    if v <= 4:
                        e['offX'] = r.byte(); e['offY'] = r.byte()
                    else:
                        e['pixelOffX'] = r.short(); e['pixelOffY'] = r.short()
                    e['altitude'] = r.byte()
                    e['identifier'] = r.uint()
                elif t == 33:  # SoundElement
                    e = dict(type='sound', soundId=r.int(), baseVolume=r.short(), fullVolumeDistance=r.int(),
                             nullVolumeDistance=r.int(), minDelay=r.short(), maxDelay=r.short())
                else:
                    raise ValueError(f'unknown element type {t} at {r.p}')
                cell['elements'].append(e)
            lay['cells'].append(cell)
        layers.append(lay)
    m['layers'] = layers
    m['cells'] = [parse_cell_data(r, v, i) for i in range(MAP_CELLS_COUNT)]
    m['_bytesRemaining'] = len(r.b) - r.p
    return m


if __name__ == '__main__':
    m = parse_dlm(open(sys.argv[1], 'rb').read())
    cells = m.pop('cells'); layers = m.pop('layers')
    m['nLayers'] = len(layers)
    m['nElements'] = sum(len(c['elements']) for l in layers for c in l['cells'])
    m['nMov'] = sum(1 for c in cells if c.get('mov'))
    m['nMovFight'] = sum(1 for c in cells if c.get('mov') and not c.get('nonWalkableDuringFight'))
    m['nRed'] = sum(1 for c in cells if c.get('red'))
    m['nBlue'] = sum(1 for c in cells if c.get('blue'))
    print(json.dumps(m, indent=1, default=str))
