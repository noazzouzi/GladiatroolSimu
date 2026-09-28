import cv2, numpy as np, json, sys
from grid import *
REF=cv2.imread(SP+'big/img_139988488.jpg')
P=json.load(open(SP+'work/fit_488.json'))
sift=cv2.SIFT_create(nfeatures=20000)
refg=cv2.cvtColor(REF,cv2.COLOR_BGR2GRAY)
KR,DR=sift.detectAndCompute(refg,None)
def register(img, ratio=0.75, mask=None):
    g=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
    # upscale small images for better features
    k,d=sift.detectAndCompute(g,mask)
    bf=cv2.BFMatcher()
    ms=bf.knnMatch(d,DR,k=2)
    good=[m for m,n in ms if m.distance<ratio*n.distance]
    src=np.float32([k[m.queryIdx].pt for m in good]); dst=np.float32([KR[m.trainIdx].pt for m in good])
    M,inl=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=4,maxIters=20000,confidence=0.999)
    return M,int(inl.sum()) if inl is not None else 0,len(good)
def shot2ref(M,x,y):
    return M[0,0]*x+M[0,1]*y+M[0,2], M[1,0]*x+M[1,1]*y+M[1,2]
def shot2cell(M,x,y):
    X,Y=shot2ref(M,x,y); return pix2cell(X,Y,P)
def ref2shot(M,X,Y):
    A=np.vstack([M,[0,0,1]]); Ai=np.linalg.inv(A)
    return Ai[0,0]*X+Ai[0,1]*Y+Ai[0,2], Ai[1,0]*X+Ai[1,1]*Y+Ai[1,2]
def overlay_shot(img_pil,M,cells,color=(0,0,255),labels=True,fs=11,width=1,highlight=None):
    from PIL import ImageDraw, ImageFont
    im=img_pil.convert('RGB').copy(); dr=ImageDraw.Draw(im)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',fs)
    for cid in cells:
        poly=[ref2shot(M,*pt) for pt in diamond(cid,P)]
        col=color
        if highlight and cid in highlight: col=highlight[cid]
        dr.line(poly+[poly[0]],fill=col,width=width)
        if labels:
            x,y=ref2shot(M,*center(cid,P)); t=str(cid)
            dr.text((x-len(t)*fs*0.3,y-fs*0.55),t,fill=(255,255,255),font=font,stroke_width=2,stroke_fill=(0,0,0))
    return im
