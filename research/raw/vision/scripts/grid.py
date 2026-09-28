import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
SP='/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/'
def rc(cid): return cid//14, cid%14
def center_units(cid):
    r,c=rc(cid)
    return c*86 + (r%2)*43 + 43, r*21.5 + 21.5
def center(cid,p):
    X0,Y0,sx,sy=p
    u,v=center_units(cid)
    return X0+sx*u, Y0+sy*v
def diamond(cid,p):
    x,y=center(cid,p); X0,Y0,sx,sy=p
    hw,hh=43*sx,21.5*sy
    return [(x,y-hh),(x+hw,y),(x,y+hh),(x-hw,y)]
def load_cells(mapid=139988488):
    d=json.load(open(SP+'big/d3/d3_%d.json'%mapid))
    return d['cellsData']
def pix2cell(x,y,p):
    # brute force nearest diamond
    best=None
    for cid in range(560):
        cx,cy=center(cid,p); X0,Y0,sx,sy=p
        d=abs(x-cx)/(43*sx)+abs(y-cy)/(21.5*sy)
        if best is None or d<best[0]: best=(d,cid)
    return best[1], best[0]
def overlay(img, p, cells_to_draw, color=(0,0,255), labels=True, font_size=11, fill=None, width=1):
    im=img.copy().convert('RGBA'); ov=Image.new('RGBA',im.size,(0,0,0,0)); dr=ImageDraw.Draw(ov)
    try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',font_size)
    except: font=ImageFont.load_default()
    for cid in cells_to_draw:
        poly=diamond(cid,p)
        if fill and cid in fill: dr.polygon(poly, fill=fill[cid])
        dr.line(poly+[poly[0]], fill=color+(255,), width=width)
        if labels:
            x,y=center(cid,p); t=str(cid)
            dr.text((x-len(t)*font_size*0.3,y-font_size*0.55),t,fill=(255,255,255,255),font=font,stroke_width=2,stroke_fill=(0,0,0,255))
    return Image.alpha_composite(im,ov).convert('RGB')
