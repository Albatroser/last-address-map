"""Геокодирует ленинградские адреса через Photon (photon.komoot.io), результат дописывает в geocache/.
НЕ ДОВЕДЕНО: обработано ~5% адресов, качество совпадений не проверено (есть ложные: неизвестная улица -> «Садовая»).
Вход: data/raw/spb_raw.csv (выборка из victims_flat.csv).
"""
import pandas as pd,re,json,time,urllib.request,urllib.parse,os,sys
D=os.path.dirname(os.path.abspath(__file__))
R=os.path.dirname(D)
s=pd.read_csv(R+'/data/raw/spb_raw.csv',dtype=str,keep_default_na=False)
# Переименования 1930-х -> современные (из общих знаний, не сверено с источником)
REN={'25 Октября':'Невский','Володарского':'Литейный','Герцена':'Большая Морская','Красных Зорь':'Каменноостровский',
'Желябова':'Большая Конюшенная','Халтурина':'Миллионная','Гоголя':'Малая Морская','Майорова':'Вознесенский',
'Красной Конницы':'Кавалергардская','Кр. Конницы':'Кавалергардская','Кр.Конницы':'Кавалергардская','Салтыкова-Щедрина':'Кирочная',
'Плеханова':'Казанская','Дзержинского':'Гороховая','9 Января':'Дворцовая','Урицкого':'Дворцовая','Рошаля':'Адмиралтейский',
'Нахимсона':'Владимирский','Ракова':'Итальянская','Международный':'Московский','Союза Связи':'Почтамтская','Красная':'Галерная',
'Слуцкого':'Таврическая','Красных Командиров':'Измайловский','Огородникова':'Рижский','Газа':'Старо-Петергофский',
'Карла Либкнехта':'Большой','К. Либкнехта':'Большой','Революции':'Троицкая','Лассаля':'Михайловская','Пролеткульта':'Владимирская'}
ABBR=[(r'\bБ\.\s*','Большая '),(r'\bМ\.\s*','Малая '),(r'\bСр\.\s*','Средняя '),(r'\bпр-т\b','проспект'),(r'\bпросп\.\s*','проспект '),
(r'\bпр\.\s*','проспект '),(r'\bнаб\.\s*','набережная '),(r'\bпер\.\s*','переулок '),(r'\bул\.\s*','улица '),(r'\bпл\.\s*','площадь '),
(r'\bш\.\s*','шоссе '),(r'\bбульв\.\s*','бульвар '),(r'\bр\.\s*','реки '),(r'\bкан\.\s*','канала ')]
def norm(a):
    a=re.sub(r'^.*?(?:Ленинград|Петроград|Петербург)[а-я]*\.?,?\s*','',a)
    a=re.sub(r'\bВ\.\s*О\.?,?\s*','',a); a=re.sub(r'\bП\.\s*С\.?,?\s*','',a)
    a=re.sub(r',?\s*кв\.?\s*\S+','',a); a=re.sub(r',?\s*корп\.?\s*\S+','',a)
    m=re.match(r'\s*(.*?)[,\s]+(?:д\.\s*)?(\d+[а-яА-Я]?)(?:[/\-]\S*)?',a)
    if not m: return None
    st,h=m.group(1).strip(' .,'),m.group(2)
    if not st or len(st)<3 or re.search(r'\d{4}',st): return None
    for k,v in REN.items(): st=re.sub(r'(?<![А-Яа-я])'+re.escape(k)+r'(?![А-Яа-я])',v,st)
    for p,r in ABBR: st=re.sub(p,r,st)
    st=re.sub(r'(\d+)\s*(?:-я)?\s*линия',r'\1-я линия',st)
    return re.sub(r'\s+',' ',st).strip()+' '+h
s['q']=s.live_place.map(norm)
C=R+'/geocache/leningrad_photon.jsonl'; done={}
if os.path.exists(C):
    for l in open(C,encoding='utf-8'):
        try: r=json.loads(l); done[r['q']]=r
        except: pass
qs=[q for q in s.q.dropna().unique() if q not in done]
print('queries',s.q.nunique(),'todo',len(qs),flush=True)
import concurrent.futures as cf, threading
lock=threading.Lock()
def one(q):
    url='https://photon.komoot.io/api/?'+urllib.parse.urlencode({'q':q+', Санкт-Петербург','limit':1,'bbox':'29.4,59.6,30.8,60.2'})
    r={'q':q}
    for t in range(4):
        try:
            js=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'repression-memorial-map/0.1'}),timeout=20))
            r.pop('err',None)
            if js.get('features'):
                ft=js['features'][0]; p=ft['properties']; r.update(lon=ft['geometry']['coordinates'][0],lat=ft['geometry']['coordinates'][1],
                    hn=p.get('housenumber',''),street=p.get('street') or p.get('name',''),type=p.get('type',''))
            break
        except Exception as e:
            r['err']=str(e)[:80]; time.sleep(3*(t+1))
    time.sleep(0.4)
    return r
n=0
with open(C,'a',encoding='utf-8') as f, cf.ThreadPoolExecutor(4) as ex:
    for r in ex.map(one,qs):
        with lock:
            f.write(json.dumps(r,ensure_ascii=False)+'\n'); f.flush(); n+=1
            if n%250==0: print(n,flush=True)
print('DONE',flush=True)
