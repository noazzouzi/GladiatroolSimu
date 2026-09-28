import json,sys
from collections import Counter
from mp import off
res={}
import glob
for f in glob.glob('src_det_*.json'): res.update(json.load(open(f)))
for k,v in res.items(): v['name']=k
byt={v['t']:v for v in res.values()}
plan=json.load(open('src_plan.json'))['plan']
GL=set(json.load(open('/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/big/d3/spike_cells.json')))
def fmt(t): return '%d:%02d:%02d'%(t//3600,(t%3600)//60,t%60)
def reds(r,thr=0.45): return set(int(c) for c,v in r['R'].items() if v>=thr)
def blues(r,thr=0.25): return set(int(c) for c,v in r['B'].items() if v>=thr)
def gifts(r,thr=0.15): return set(int(c) for c,v in r['G'].items() if v>=thr)
def valid(r): return r['win']<0.5 and r.get('lum',140)>110 and len(reds(r,0.35))<=10
EXP={1:2,2:3,3:3,4:3,5:3,6:3,7:3,8:1,9:5,10:6}
out=[]
for f in plan:
    frec={'fight':f['fight'],'waves':[]}
    for nm,s,e in f['items']:
        w=int(nm[1:])
        fr=[byt[t] for t in range(s,e+1) if t in byt]
        # window position
        wi=[i for i,r in enumerate(fr) if r['win']>=0.95]
        if w==1:
            # after placement: first valid frames with >=2 reds
            start=0
        else:
            start=(wi[-1]+1) if wi else None
        if start is None:
            frec['waves'].append({'wave':w,'err':'no window'}); continue
        # before: valid frames before window start
        before_idx=[i for i in range((wi[0] if wi else 0)) if valid(fr[i])][-6:]
        cb=Counter(); [cb.update(reds(fr[i],0.35)) for i in before_idx]
        B=set(x for x,n in cb.items() if n>=max(1,len(before_idx)//3))
        # after: first valid frames after window with reds changed
        after_idx=[i for i in range(start,len(fr)) if valid(fr[i])]
        # find first frame where new reds (not in B) appear, then take 3 frames
        found=None
        for j,i in enumerate(after_idx):
            nw=reds(fr[i],0.4)-B
            if len(nw)>=1 and (len(nw)>=EXP[w] or j+2<len(after_idx) and len(reds(fr[after_idx[j+1]],0.4)-B)>=len(nw)):
                found=j; break
        if found is None:
            frec['waves'].append({'wave':w,'before':sorted(B),'err':'no spawn found'}); continue
        sel=after_idx[found:found+4]
        ca=Counter(); [ca.update(reds(fr[i],0.4)) for i in sel]
        A=set(x for x,n in ca.items() if n>=2 or len(sel)==1)
        new=sorted(A-B)
        G=set(); [G.update(gifts(fr[i])) for i in sel]
        Bl=set(); [Bl.update(blues(fr[i])) for i in sel]
        frec['waves'].append({'wave':w,'t':fr[sel[0]]['t'],'frame':fr[sel[0]]['name'],'before_frame':fr[before_idx[-1]]['name'] if before_idx else None,'before':sorted(B),'after':sorted(A),'new':new,'gift':sorted(G),'blue':sorted(Bl)})
    out.append(frec)
json.dump(out,open('srcwaves.json','w'))
from collections import defaultdict
tab=defaultdict(list)
for f in out:
    print('FIGHT',fmt(f['fight']))
    for w in f['waves']:
        if 'err' in w: print('   W%d ERR %s'%(w['wave'],w['err'])); continue
        flag='' if len(w['new'])==EXP[w['wave']] else ' (!=%d)'%EXP[w['wave']]
        print('   W%-2d %s %-9s new=%s%s gift=%s players=%s'%(w['wave'],fmt(w['t']),w['frame'],w['new'],flag,w['gift'],w['blue']))
        tab[w['wave']].append(w['new'])
for w in sorted(tab):
    c=Counter(x for s in tab[w] for x in s)
    print('W%d n=%d'%(w,len(tab[w])),' '.join('%d%s:%d'%(x,off(x),n) for x,n in c.most_common()))
