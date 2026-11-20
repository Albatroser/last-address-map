"""Собирает victims_flat.csv (одна строка = один человек) из 40 таблиц диска lists.memo.ru.
Запуск: python scripts/build_victims_flat.py data/raw/lists_csv data/raw/victims_flat.csv
"""
import csv, sys, os
C=sys.argv[1].rstrip('/')+'/'; out=sys.argv[2]  # C = папка с 40 исходными csv, out = итоговый файл
def dic(n):
    d={}
    with open(C+n+'.csv',encoding='cp1251',newline='') as f:
        next(f)
        for line in f:
            k,_,v=line.rstrip('\r\n').partition(';'); d[k]=v
    return d
fn=dic('fnames'); nm=dic('names'); ln=dic('lnames'); geo=dic('geoplace'); nat=dic('nations'); wk=dic('works')
so=dic('sudorg'); st=dic('stat'); pr=dic('prigovor'); ag=dic('ages')
bk={}
with open(C+'books.csv',encoding='cp1251') as f:
    next(f)
    for line in f:
        a=line.rstrip('\r\n').split(';'); bk[a[0]]=a[1] if len(a)>1 else ''
def dt(s):
    try: v=int(s)
    except: return ''
    if v<=0: return ''
    d=v&31; m=(v>>5)&15; y=((v>>9)&255)+1800
    return f"{y:04d}"+(f"-{m:02d}" if m else '')+(f"-{d:02d}" if m and d else '')
n=0
with open(C+'persons.csv',encoding='cp1251',newline='') as f, open(out,'w',encoding='utf-8-sig',newline='') as o:
    w=csv.writer(o); next(f)
    w.writerow(['person_id','last_name','first_name','patronymic','gender','birth_date','birth_place','nationality','work','live_place','arrest_date','court_body','court_date','article','sentence','executed','death_date','rehab_date','source_book','age'])
    for line in f:
        a=line.rstrip('\r\n').split(';')
        if len(a)!=20: continue
        w.writerow([a[0],fn.get(a[1],''),nm.get(a[2],''),ln.get(a[3],''),a[19],dt(a[4]),geo.get(a[5],''),nat.get(a[6],''),wk.get(a[7],''),geo.get(a[8],''),dt(a[9]),so.get(a[10],''),dt(a[11]),st.get(a[12],''),pr.get(a[13],''),'1' if a[14]=='T' else '0',dt(a[15]),dt(a[16]),bk.get(a[17],''),ag.get(a[18],'')])
        n+=1
print('rows',n)
