"""Собирает site/data/moscow_points.json из data/moscow/*.csv.
Формат: [[lat, lon, "адрес", [[кв, ФИО, год_рождения, дата_расстрела, место_захоронения, биография], ...]], ...]
Запуск из корня репозитория: python scripts/build_moscow_points.py
"""
import json, re, os
import pandas as pd

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = R + '/data/moscow/'
ad = pd.read_csv(M + 'addresses.csv'); pe = pd.read_csv(M + 'persons.csv'); gk = pd.read_csv(M + 'addresses_geocoded.csv')
norm = lambda s: re.sub(r'\s+', ' ', str(s)).strip().lower()
gk['key'] = gk.street.map(norm) + '|' + gk.house.map(norm)
ad['key'] = ad.ADDRESS.str.replace(r',\s*(д\.)', r'|\1', regex=True).map(lambda s: '|'.join(norm(x) for x in s.split('|', 1)))
m = ad.merge(gk[['key', 'latitude', 'longitude']].dropna().drop_duplicates('key'), on='key', how='left')

def short(b):
    b = str(b)
    by = re.search(r'род\.\s*(?:\d{1,2}\.\d{1,2}\.)?(\d{4})', b)
    ex = re.search(r'асс+трелян[аы]?\s+(\d{1,2}\.\d{1,2}\.\d{4})', b)
    bu = re.search(r'Место захоронения:\s*([^.]+)', b)
    job = re.sub(r'\.\s*Адрес:.*', '', b); job = re.sub(r'^род\.[^,]*,', '', job).strip()
    return [by.group(1) if by else '', ex.group(1) if ex else '', bu.group(1).strip() if bu else '', job[:160]]

g = pe.groupby('ADDRESS_ID'); out = []
for _, r in m[m.latitude.notna()].iterrows():
    ppl = [[str(p.APT), p.NAME] + short(p.BIO) for p in g.get_group(r.ADDRESS_ID).itertuples()]
    out.append([round(r.latitude, 5), round(r.longitude, 5), r.ADDRESS, ppl])
os.makedirs(R + '/site/data', exist_ok=True)
with open(R + '/site/data/moscow_points.json', 'w', encoding='utf-8') as f:
    f.write('[\n' + ',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in out) + '\n]\n')
print('домов:', len(out), '| людей:', sum(len(x[3]) for x in out), 'из', len(pe), '| адресов без координат:', int(m.latitude.isna().sum()))
