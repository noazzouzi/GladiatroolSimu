import sys,json,os; sys.path.insert(0,'/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/work')
from fastdet import *
a,b,out=int(sys.argv[1]),int(sys.argv[2]),sys.argv[3]
M=np.load(SP+'work/Mk1f.npy'); up=2
S=np.diag([1/up,1/up,1]); M2=(np.vstack([M,[0,0,1]])@S)[:2]
det=Det(M2,(480,852),up)
ref=cv2.imread(SP+'frames/k1f/s724_05.jpg',0).astype(np.float32); patch=ref[108:130,300:560]
def ncc(x,y):
    x=x-x.mean(); y=y-y.mean(); return float((x*y).sum()/np.sqrt((x*x).sum()*(y*y).sum()+1e-9))
res={}
for n in range(a,b+1):
    for k in range(1,11):
        f=SP+'frames/k1f/s%d_%02d.jpg'%(n,k)
        if not os.path.exists(f): continue
        img0=cv2.imread(f)
        if img0 is None: continue
        g=cv2.cvtColor(img0,cv2.COLOR_BGR2GRAY).astype(np.float32)
        win=max(ncc(g[108+dy:130+dy,300:560],patch) for dy in range(-6,7,2))
        o=det.run(img0)
        res['s%d_%02d'%(n,k)]={'t':n*10+k-1,'win':round(win,2),'lum':round(float(g[140:320,200:560].mean()),1),
          'R':{c:round(v[0],2) for c,v in o.items() if v[0]>=0.35 and v[2]<0.1},
          'G':{c:round(v[2],2) for c,v in o.items() if v[2]>=0.12},
          'B':{c:round(v[1],2) for c,v in o.items() if v[1]>=0.12}}
json.dump(res,open(out,'w')); print('done',len(res))
