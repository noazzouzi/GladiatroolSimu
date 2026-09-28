import json
from PIL import Image, ImageDraw, ImageFont
SP='/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/'
cells=json.load(open(SP+'big/d3/d3_139988488.json'))['cellsData']
W=set(c['cellNumber'] for c in cells if c['mov'] and not c['nonWalkableDuringFight'])
GL=set(json.load(open(SP+'big/d3/spike_cells.json')))
per=json.load(open('per_wave_counts_1080.json')); per10=json.load(open('per_wave_counts.json'))['10']
n={'1':11,'2':11,'3':11,'4':11,'5':11,'6':11,'7':11,'9':11,'10':11}
GIFT={301:12,327:12,272:9,299:9,329:9,328:8,273:4}
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def panel(title, counts=None, special=True, s=0.42, gifts=None, n_=None):
    cw,ch=86*s,43*s
    rows=range(8,36); cols=range(14)
    Wp=int(15*cw+10); Hp=int(30*ch/2+60)
    im=Image.new('RGB',(Wp,Hp),(255,255,255)); d=ImageDraw.Draw(im)
    f=ImageFont.truetype(FONT,int(10*s/0.42)); ft=ImageFont.truetype(FONT,14)
    d.text((6,4),title,fill=(0,0,0),font=ft)
    for cid in list(W)+[152]:
        r,c=divmod(cid,14)
        x=5+c*cw+(r%2)*cw/2+cw/2; y=40+(r-4)*ch/2
        poly=[(x,y-ch/2),(x+cw/2,y),(x,y+ch/2),(x-cw/2,y)]
        fill=(120,90,50) if cid in GL else (240,225,190)
        if cid==152: fill=(200,160,230)
        if special:
            if cid in (286,287,314,315): fill=(120,170,255)
            if cid==300: fill=(230,80,160)
        if gifts and cid in gifts: fill=(255,160,40)
        v=counts.get(str(cid),0) if counts else 0
        if v: 
            a=min(1.0,0.25+0.75*v/max(1,(n_ or 11)))
            fill=(int(255*(1-a)+200*a),int(255*(1-a)+20*a),int(255*(1-a)+20*a))
        d.polygon(poly,fill=fill,outline=(160,160,160))
        if v: d.text((x-6*s/0.42*len(str(v))/1.6,y-6*s/0.42),str(v),fill=(0,0,0),font=f)
        elif special and cid in (152,300,286,287,314,315): d.text((x-9,y-6),str(cid),fill=(0,0,0),font=f)
        elif gifts and cid in gifts: d.text((x-5,y-6),str(gifts[cid]),fill=(0,0,0),font=f)
    return im
panels=[panel('Reperes: pics(brun) depart(bleu) 300(rose) 152(violet)',special=True),
        panel('Cadeaux (Glyphes evenementiels) T2-T9, n=63',special=False,gifts=GIFT)]
names={1:'V1 2 Troollibres',2:'V2 1 Troollibre + 2 Artroolleurs',3:'V3 2 Nitroolls + 1 Artroolleur',4:'V4 Nitrooll+Artroolleur+Troollibre',5:'V5 3 Troollibres',6:'V6 3 Artroolleurs',7:'V7 3 Nitroolls',9:'V9 1 Nit + 2 Tl + 2 Art',10:'V10 2 Nit + 2 Tl + 2 Art (480p, n=10)'}
for w in [1,2,3,4,5,6,7,9,10]:
    cnt=per[str(w)] if w!=10 else per10
    panels.append(panel(names[w]+('' if w==10 else ' (n=11 combats)'),counts=cnt,special=False))
pw,ph=panels[0].size; cols=4; rows=(len(panels)+cols-1)//cols
sheet=Image.new('RGB',(pw*cols,ph*rows+40),(255,255,255)); d=ImageDraw.Draw(sheet)
for i,p in enumerate(panels): sheet.paste(p,((i%cols)*pw,40+(i//cols)*ph))
d.text((8,8),'Gladiatrool - carte de combat 139988488 : cellules observees (VOD Twitch 2852548819, 11 combats). Chiffre = nb de combats ou un monstre est apparu sur la cellule.',fill=(0,0,0),font=ImageFont.truetype(FONT,15))
sheet.save('/home/user/GladiatroolSimu/research/figures/40_carte_positions_schema.png'); print(sheet.size)
