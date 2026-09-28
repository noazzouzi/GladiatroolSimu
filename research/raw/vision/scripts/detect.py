import sys; sys.path.insert(0,'/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/work')
from vreg import *
from shotfit import WALK, GLYPH
def ring_pts(M, cid, inset=0.85, n=48):
    poly=np.array([ref2shot(M,*pt) for pt in diamond(cid,P)])
    c=poly.mean(0); poly=(poly-c)*inset+c
    pts=[]
    for a,b in zip(poly,np.roll(poly,-1,0)):
        for t in np.linspace(0,1,n//4,endpoint=False): pts.append(a+(b-a)*t)
    return np.array(pts)
def markers(img, M, cells=None, inset=0.85):
    hsv=cv2.cvtColor(img,cv2.COLOR_BGR2HSV).astype(int)
    H,S,V=hsv[...,0],hsv[...,1],hsv[...,2]
    b,g,r=[img[...,i].astype(int) for i in range(3)]
    red=((H<=17)|(H>=170))&(S>=140)&(V>=100)&((r-g)>=60)
    blue=(b-r>=40)&(b>=90)
    white=(S<40)&(V>220)
    orange=((H>=5)&(H<=22)&(S>=150)&(V>=170)&((r-g)>=50))
    out={}
    h,w=img.shape[:2]
    for cid in (cells or sorted(WALK)):
        sc=[]
        for ins in (0.72,0.8,0.88):
            pts=ring_pts(M,cid,ins).round().astype(int)
            ok=(pts[:,0]>=0)&(pts[:,0]<w)&(pts[:,1]>=0)&(pts[:,1]<h)
            pts=pts[ok]
            if len(pts)<10: continue
            sc.append((red[pts[:,1],pts[:,0]].mean(), blue[pts[:,1],pts[:,0]].mean(), white[pts[:,1],pts[:,0]].mean()))
        if sc:
            poly=np.array([ref2shot(M,*pt) for pt in diamond(cid,P)]); c=poly.mean(0); poly=((poly-c)*0.45+c).astype(np.int32)
            m=np.zeros((h,w),np.uint8); cv2.fillPoly(m,[poly],1)
            fill=orange[m>0].mean() if m.sum()>0 else 0
            out[cid]=tuple(max(s[i] for s in sc) for i in range(3))+(fill,)
    return out
def summarize(out, thr=0.35):
    R=sorted([c for c,v in out.items() if v[0]>=thr]); B=sorted([c for c,v in out.items() if v[1]>=thr]); W=sorted([c for c,v in out.items() if v[2]>=thr])
    return R,B,W
