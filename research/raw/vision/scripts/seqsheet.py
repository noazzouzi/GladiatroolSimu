import sys; sys.path.insert(0,'/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/work')
from detect import *
from PIL import ImageDraw
M=np.load('Mk1src.npy')
names=sys.argv[2].split(','); out=sys.argv[1]
cx=int(sys.argv[3]) if len(sys.argv)>3 else 300
cw=int(sys.argv[4]) if len(sys.argv)>4 else 380; ch=int(sys.argv[5]) if len(sys.argv)>5 else 260
x,y=ref2shot(M,*center(cx,P))
tiles=[]
for k in names:
    im=ov(SP+'frames/k1src/%s.jpg'%k,M,cells=range(112,490),fs=11,up=1)
    t=im.crop((int(x)-cw,int(y)-ch,int(x)+cw,int(y)+ch)); ImageDraw.Draw(t).text((5,5),k,fill=(255,255,0),stroke_width=2,stroke_fill=(0,0,0)); tiles.append(t)
W,H=tiles[0].size; cols=2; rows=(len(tiles)+1)//2
s=Image.new('RGB',(W*cols,H*rows))
for i,t in enumerate(tiles): s.paste(t,((i%cols)*W,(i//cols)*H))
s.save(out)
