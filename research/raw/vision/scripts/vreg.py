import sys; sys.path.insert(0,SPW:='/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/work')
from match import *
def reg_frame(path, up=2, ratio=0.8, roi=None):
    img=cv2.imread(path)
    if roi: 
        x0,y0,x1,y1=roi; m=np.zeros(img.shape[:2],np.uint8); m[y0:y1,x0:x1]=255
    else: m=None
    big=cv2.resize(img,None,fx=up,fy=up,interpolation=cv2.INTER_CUBIC)
    mb=cv2.resize(m,None,fx=up,fy=up,interpolation=cv2.INTER_NEAREST) if m is not None else None
    M,ninl,ng=register(big,ratio=ratio,mask=mb)
    # convert to original-frame coordinates
    S=np.diag([up,up,1.0]); A=np.vstack([M,[0,0,1]])@S
    return A[:2],ninl,ng
def ov(path,M,cells=range(112,490),out=None,fs=10,up=2,hl=None,labels=True):
    base=Image.open(path).convert('RGB'); base=base.resize((base.width*up,base.height*up),Image.LANCZOS)
    S=np.diag([1/up,1/up,1.0]); A=np.vstack([M,[0,0,1]])@S
    o=overlay_shot(base,A[:2],list(cells),fs=fs,width=1,highlight=hl,labels=labels)
    if out: o.save(out)
    return o
