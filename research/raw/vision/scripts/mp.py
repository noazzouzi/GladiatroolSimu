def mp(i):
    a,r=divmod(i,28)
    return (a+r, r-a) if r<14 else (a+1+r-14, r-14-a)
def cid(x,y): return (x-y)*14 + y + (x-y)//2
C=mp(300)
def off(i): x,y=mp(i); return (x-C[0], y-C[1])
if __name__=='__main__':
    import sys
    for s in sys.argv[1:]:
        print(s, off(int(s)))
