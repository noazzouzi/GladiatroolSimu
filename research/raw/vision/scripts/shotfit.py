import numpy as np, cv2, json, sys
from grid import *
GLYPH=set(json.load(open(SP+'big/d3/spike_cells.json')))|{250,293,321,362}
CELLS=load_cells(); WALK=set(c['cellNumber'] for c in CELLS if c['mov'])
def grads(img):
    g=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY).astype(np.float32); g=cv2.GaussianBlur(g,(3,3),0)
    return cv2.Sobel(g,cv2.CV_32F,1,0), cv2.Sobel(g,cv2.CV_32F,0,1)
# lattice edge score: lines x/(W) +- y/(H) = const. Use line families directly.
def lattice_score(gx,gy,X0,Y0,s,mask=None):
    h,w=gx.shape
    W=86*s; H=43*s
    # Family A: edges with direction (W/2, H/2) i.e. slope +H/W ; normal (H,-W)/norm
    # points on lines: (x - X0)/W*... use parametric: u=(x-X0)/W + (y-Y0)/H ; v=(x-X0)/W - (y-Y0)/H ; edges at u in Z+0.5? compute
    ys,xs=np.mgrid[0:h:2,0:w:2]
    u=(xs-X0)/W+(ys-Y0)/H; v=(xs-X0)/W-(ys-Y0)/H
    # cell centers at X0+W*(i + ...). With center (X0 + s*(43+86c+43*(r%2)), Y0+s*(21.5+21.5r)): u=(43+86c+43 r%2)/86+(21.5+21.5r)/43 -> centers at u = 1 + c + (r%2)/2 + r/2 -> integer+... edges at half-integers offset
    nA=np.array([H,-W])/np.hypot(H,W); nB=np.array([H,W])/np.hypot(H,W)
    GA=np.abs(gx[ys,xs]*nA[0]+gy[ys,xs]*nA[1]); GB=np.abs(gx[ys,xs]*nB[0]+gy[ys,xs]*nB[1])
    # edges of family A (parallel to direction (W,H)) are lines of constant v ; family B constant u
    fu=(u-0.5)%1; fu=np.minimum(fu,1-fu)
    fv=(v-0.5)%1; fv=np.minimum(fv,1-fv)
    k=np.hypot(1/W,1/H)
    wA=np.exp(-((fv/k)/1.5)**2/2.0)
    wB=np.exp(-((fu/k)/1.5)**2/2.0)
    m=np.ones_like(u,bool) if mask is None else mask[ys,xs]
    return float(((GA*wA+GB*wB)[m]).mean()/(((wA+wB)[m]).mean()+1e-9)) - float((GA+GB)[m].mean()/2)
