import sys,json,os; sys.path.insert(0,'/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/work')
import numpy as np, cv2
from grid import diamond, center
from match import ref2shot, P
from shotfit import WALK
SP='/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/'
CELLS=sorted(WALK|{152})
class Det:
    def __init__(self,M,shape,up=2):
        # M maps shot(orig-res *up) -> ref ; we work at 'up' scale
        self.up=up; h,w=shape[0]*up,shape[1]*up; self.h,self.w=h,w
        self.rings={}; self.fills={}
        for cid in CELLS:
            poly=np.array([ref2shot(M,*pt) for pt in diamond(cid,P)]); c=poly.mean(0)
            rs=[]
            for ins in (0.72,0.8,0.88):
                pp=(poly-c)*ins+c; pts=[]
                for a,b in zip(pp,np.roll(pp,-1,0)):
                    for t in np.linspace(0,1,12,endpoint=False): pts.append(a+(b-a)*t)
                pts=np.round(pts).astype(int); ok=(pts[:,0]>=0)&(pts[:,0]<w)&(pts[:,1]>=0)&(pts[:,1]<h)
                rs.append(pts[ok])
            self.rings[cid]=rs
            pf=((poly-c)*0.45+c).astype(np.int32); m=np.zeros((h,w),np.uint8); cv2.fillPoly(m,[pf],1)
            self.fills[cid]=np.nonzero(m)
    def run(self,img0):
        img=cv2.resize(img0,None,fx=self.up,fy=self.up,interpolation=cv2.INTER_CUBIC) if self.up!=1 else img0
        hsv=cv2.cvtColor(img,cv2.COLOR_BGR2HSV).astype(np.int16); H,S,V=hsv[...,0],hsv[...,1],hsv[...,2]
        b,g,r=[img[...,i].astype(np.int16) for i in range(3)]
        red=((H<=17)|(H>=170))&(S>=140)&(V>=100)&((r-g)>=60)
        blue=(b-r>=40)&(b>=90)
        orange=((H>=5)&(H<=22)&(S>=150)&(V>=170)&((r-g)>=50))
        out={}
        for cid in CELLS:
            R=0;B=0
            for pts in self.rings[cid]:
                if len(pts)<10: continue
                R=max(R,red[pts[:,1],pts[:,0]].mean()); B=max(B,blue[pts[:,1],pts[:,0]].mean())
            f=self.fills[cid]; G=orange[f].mean() if len(f[0]) else 0
            out[cid]=(R,B,G)
        return out
