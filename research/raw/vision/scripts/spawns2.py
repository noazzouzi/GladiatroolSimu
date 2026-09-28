import json,sys
from collections import Counter
res={}
for f in sys.argv[1:]: res.update(json.load(open(f)))
for k,v in res.items(): v['name']=k
fr=sorted(res.values(),key=lambda r:r['t'])
GL=set(json.load(open('/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/big/d3/spike_cells.json')))
def fmt(t): return '%d:%02d:%02d'%(t//3600,(t%3600)//60,t%60)
def reds(r,thr=0.45): return set(int(c) for c,v in r['R'].items() if v>=thr)
def blues(r,thr=0.2): return set(int(c) for c,v in r['B'].items() if v>=thr)
def valid(r): return r['win']<0.5 and r.get('lum',140)>110 and len(reds(r,0.35))<=10
V=[r for r in fr if valid(r)]
events=[]
k=1
while k<len(V)-3:
    cur=reds(V[k],0.4)
    cp=Counter(); nd=0
    for d in range(1,7):
        if k-d<0 or V[k]['t']-V[k-d]['t']>30: break
        cp.update(reds(V[k-d],0.3)); nd+=1
    P=set(x for x,n in cp.items() if n>=2)|(reds(V[k-1],0.3) if V[k]['t']-V[k-1]['t']<=30 else set())
    cand=cur-P
    nxt=[V[k+d] for d in range(1,4) if V[k+d]['t']-V[k]['t']<=8]
    new=set(x for x in cand if sum(x in reds(r,0.4) for r in nxt)>=min(2,len(nxt)))
    ng=len([x for x in new if x in GL])
    if len(new)>=2 and ng*2<len(new):
        gone=set(x for x in P if x not in cur and all(x not in reds(r,0.3) for r in nxt[:1]))
        events.append({'t':V[k]['t'],'frame':V[k]['name'],'new':sorted(new),'gone':sorted(gone),'prev':sorted(P),'dt_prev':V[k]['t']-V[k-1]['t']})
        k+=3
    else: k+=1
PL={286,287,314,315}
pl=[r['t'] for r in V if len(blues(r)&PL)>=3 and not reds(r,0.35)]
starts=[]
for t in pl:
    if not starts or t-starts[-1][1]>30: starts.append([t,t])
    else: starts[-1][1]=t
wins=[r['t'] for r in fr if r['win']>=0.95]
wstarts=[]
for t in wins:
    if not wstarts or t-wstarts[-1]>5: wstarts.append(t)
dims=[r['t'] for r in fr if r.get('lum',140)<100 and r['win']<0.5]
json.dump({'events':events,'placements':starts,'windows':wstarts},open('spawn_events.json','w'))
allev=[('P',a,None) for a,b in starts]+[('W',t,None) for t in wstarts]+[('S',e['t'],e) for e in events]
allev.sort(key=lambda x:x[1])
for typ,t,e in allev:
    if typ=='S': print('   SPAWN %s %s new=%s gone=%s prev=%s'%(fmt(t),e['frame'],e['new'],e['gone'],e['prev']))
    elif typ=='W': print('  window',fmt(t))
    else: print('PLACEMENT',fmt(t))
