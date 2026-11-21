"""Проверка: арестовывали по районам или по всему городу сразу?

Берёт людей с карты (site/data/moscow_points.json) и их дела (data/moscow/persons_case.csv) и сравнивает дни больших арестов
(не меньше 40 человек с карты) со случайными наборами адресов: разброс адресов вокруг их середины и долю арестов,
рядом с которыми (ближе 300 м) в тот же день был ещё один арест в другом доме. Если бы брали по районам, разброс в такие
дни был бы заметно меньше случайного, а доля соседних арестов — больше. Результат 2026-11-21: разницы нет
(разброс 2,54 км против 2,37 км у случайных наборов; соседние аресты — 25 % против 26 %).
На этом основана фраза слайда «Брали не по районам, а по спискам».

Запуск из корня репозитория: python research/arrest_patterns.py
"""
import csv,io,sys,re,json,math,statistics,random
from collections import Counter,defaultdict
from datetime import date
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
R=str(Path(__file__).resolve().parent.parent)+'/'
P=list(csv.DictReader(io.open(R+'data/moscow/persons.csv',encoding='utf-8',newline='')))
C=list(csv.DictReader(io.open(R+'data/moscow/persons_case.csv',encoding='utf-8',newline='')))
A={r['ADDRESS_ID']:r['ADDRESS'] for r in csv.DictReader(io.open(R+'data/moscow/addresses.csv',encoding='utf-8',newline=''))}
pts=json.load(io.open(R+'site/data/moscow_points.json',encoding='utf-8'))
xy={}; onmap={}
for h in pts:
    for p in h[3]: onmap[(h[2],p[1])]=(h[0],h[1],p)
def d(s):
    m=re.match(r'^(\d{4})-(\d\d)-(\d\d)$',s or '')
    try: return date(int(m.group(1)),int(m.group(2)),int(m.group(3))) if m else None
    except: return None
rows=[]
for p,c in zip(P,C):
    k=(A.get(p['ADDRESS_ID'],''),p['NAME'].strip())
    if k not in onmap or not c['match']: continue
    lat,lon,pp=onmap[k]
    ex=re.search(r'асс+трелян[аы]?\s+(\d{1,2})\.(\d{1,2})\.(\d{4})',p['BIO'])
    rows.append(dict(addr=k[0],name=k[1],lat=lat,lon=lon,nat=pp[7],party=pp[8],job=pp[9],burial=pp[4],arr=d(c['arrest_date']),court=d(c['court_date']),body=c['court_body'],art=c['article'].lower(),reh=c['rehab_date'],shot=date(int(ex.group(3)),int(ex.group(2)),int(ex.group(1))) if ex else None))
print('on map',len(onmap),'with case',len(rows))
ar=[r for r in rows if r['arr']]
# A months
m=Counter(r['arr'].strftime('%Y-%m') for r in ar)
print('MONTHS',' '.join(f"{k}:{m[k]}" for k in sorted(m) if '1936-06'<=k<='1939-06'))
# B top arrest days
dd=Counter(r['arr'] for r in ar)
print('TOP ARREST DAYS',[(str(k),v) for k,v in dd.most_common(12)])
print('weekday',Counter(r['arr'].weekday() for r in ar if r['arr'].year in(1937,1938)))
# C same house same day
hd=Counter((r['addr'],r['arr']) for r in ar)
print('house-day>=2',sum(1 for v in hd.values() if v>=2),'people in them',sum(v for v in hd.values() if v>=2),'>=3',sum(1 for v in hd.values() if v>=3))
print('top house-days',[(k[0],str(k[1]),v) for k,v in hd.most_common(10)])
# same house within 7 days
byh=defaultdict(list)
for r in ar: byh[r['addr']].append(r['arr'])
# D spatial: per busy day, dispersion
def km(a,b): return math.hypot((a[0]-b[0])*111.2,(a[1]-b[1])*111.2*math.cos(math.radians(55.75)))
allp=[(r['lat'],r['lon']) for r in ar]
def spread(ps):
    c=(statistics.mean(p[0] for p in ps),statistics.mean(p[1] for p in ps)); return statistics.median(km(p,c) for p in ps)
print('overall spread km',round(spread(allp),2))
random.seed(1)
busy=[k for k,v in dd.items() if v>=40]
sp=[spread([(r['lat'],r['lon']) for r in ar if r['arr']==k]) for k in busy]
rnd=[spread(random.sample(allp,60)) for _ in range(300)]
print('busy days',len(busy),'spread median',round(statistics.median(sp),2),'min',round(min(sp),2),'max',round(max(sp),2),'| random 60 pts: median',round(statistics.median(rnd),2),'p5',round(sorted(rnd)[15],2),'p95',round(sorted(rnd)[285],2))
# nearest-neighbour same-day vs random: share of arrests having another same-day arrest within 300m
def nn_share(ps,rad=0.3):
    c=0
    for i,p in enumerate(ps):
        if any(i!=j and km(p,q)<rad and km(p,q)>0.0 for j,q in enumerate(ps)): c+=1
    return c/len(ps)
obs=[];exp=[]
for k in busy[:40]:
    ps=[(r['lat'],r['lon']) for r in ar if r['arr']==k]
    obs.append(nn_share(ps)); exp.append(nn_share(random.sample(allp,len(ps))))
print('share with other-house same-day arrest within 300m: observed',round(statistics.mean(obs),3),'random',round(statistics.mean(exp),3))
# distance from Kremlin by period
K=(55.752,37.617)
for per in ['1936','1937-01..06','1937-07..12','1938-01..06','1938-07..12','1939+']:
    def inp(r):
        y,mo=r['arr'].year,r['arr'].month
        return {'1936':y<=1936,'1937-01..06':y==1937 and mo<=6,'1937-07..12':y==1937 and mo>6,'1938-01..06':y==1938 and mo<=6,'1938-07..12':y==1938 and mo>6,'1939+':y>=1939}[per]
    rr=[r for r in ar if inp(r)]
    print(per,len(rr),'median km from Kremlin',round(statistics.median(km((r['lat'],r['lon']),K) for r in rr),2),'party %',round(100*sum(1 for r in rr if re.match(r'член|чл\.|кандидат',r['party']))/len(rr)),'VKVS %',round(100*sum(1 for r in rr if 'вквс' in r['body'].lower() or 'военн' in r['body'].lower())/len(rr)))
