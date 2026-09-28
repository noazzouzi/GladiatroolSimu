import json
from collections import Counter, defaultdict
from mp import off
d=json.load(open('spawn_events.json'))
ev=d['events']; pls=[a for a,b in d['placements']]; wins=d['windows']
# merge windows within 15s
mw=[]
for t in wins:
    if mw and t-mw[-1]<=15: continue
    mw.append(t)
def fmt(t): return '%d:%02d:%02d'%(t//3600,(t%3600)//60,t%60)
EXP={1:2,2:3,3:3,4:3,5:3,6:3,7:3,8:1,9:5,10:6}
fights=[]
bounds=pls+[10**9]
for fi in range(len(pls)):
    a,b=bounds[fi],bounds[fi+1]
    W=[t for t in mw if a<t<b]; E=[e for e in ev if a<=e['t']<b]
    waves={}
    if E and E[0]['t']-a<120: waves[1]=E[0]
    for wi,t in enumerate(W):
        cand=[e for e in E if 0<e['t']-t<=40]
        if cand: waves[wi+2]=cand[0]
    # W10: spawn not after window, after last window, with >=5 new
    if W:
        late=[e for e in E if e['t']>W[-1]+40 and len(e['new'])>=5]
        if late and len(W)<=8: waves[len(W)+2]=late[0]
    fights.append({'start':a,'windows':W,'waves':waves})
tab=defaultdict(list)
for f in fights:
    print('FIGHT',fmt(f['start']),'windows',len(f['windows']))
    for w in sorted(f['waves']):
        e=f['waves'][w]
        flag='' if len(e['new'])==EXP.get(w,0) else ' (!=%d)'%EXP.get(w,0)
        print('   W%d %s %s new=%s%s'%(w,fmt(e['t']),e['frame'],e['new'],flag))
        tab[w].append(e['new'])
print()
for w in sorted(tab):
    c=Counter(x for s in tab[w] for x in s)
    print('W%d n=%d'%(w,len(tab[w])), ' '.join('%d%s:%d'%(x,off(x),n) for x,n in c.most_common()))
json.dump({'fights':[{'start':f['start'],'windows':f['windows'],'waves':{str(k):v for k,v in f['waves'].items()}} for f in fights]},open('fights_waves.json','w'))
