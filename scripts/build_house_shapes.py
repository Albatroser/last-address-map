"""Контуры и этажность пяти самых больших домов — для объёмных домов во вступлении (site/story.js).

Источник: OpenStreetMap через Overpass API (© участники OpenStreetMap, лицензия ODbL).
Контуры и этажность современные: здания могли быть перестроены или надстроены после 1930-х годов.

Какие здания OSM относятся к дому, выбрано вручную по адресным тегам (2026-11-21):
  Серафимовича, 2      — «Дом на набережной» (way 42766224), кинотеатр «Ударник» и корпус с адресом «улица Серафимовича 2»;
  Тверская, 36 («Люкс») — нынешнее здание «Тверская улица 10» (старая нумерация, см. site/data/house_notes.json);
  Долгоруковская, 5    — здание с адресом «Долгоруковская улица 5»;
  Воронцово Поле, 3    — все строения с адресом «улица Воронцово Поле 3 с…» (усадьба);
  Большая Почтовая, 18 — корпуса «Большая Почтовая улица 18/20 к…» и «18» (Будёновский посёлок).
Этажность — тег building:levels; где его нет, взято 2 этажа. Высота этажа в рисунке — 3,3 м (условность).

Сырые ответы Overpass лежат в data/raw/osm_houses/ (в git не попадают) и повторно не скачиваются.
Запуск:  python scripts/build_house_shapes.py
Результат: site/data/house_shapes.json — {адрес: {"b": [[этажей, [[lat, lon], ...]], ...]}}
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "osm_houses"
OUT = ROOT / "site" / "data" / "house_shapes.json"
HOUSES = [  # адрес в базе, шаблон адреса OSM, отдельные объекты OSM по номеру
    ("Серафимовича ул., д.2", None, {42766224, 42766192, 146966444}),
    ("Тверская ул., д.36", None, {31560937}),
    ("Долгоруковская ул., д.5", r"^Долгоруковская улица 5$", set()),
    ("Воронцово Поле ул., д.3", r"^улица Воронцово Поле 3( |$)", set()),
    ("Почтовая Б. ул., д.18", r"^Большая Почтовая улица 18(/20 к\d+|)$", set()),
]


def fetch(i, lat, lon):
    dst = RAW / f"h{i}.json"
    if not dst.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        q = (f'[out:json][timeout:60];(way["building"](around:260,{lat},{lon});relation["building"](around:260,{lat},{lon});'
             f'way["building:part"](around:260,{lat},{lon}););out tags geom;')
        req = urllib.request.Request("http://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode(),
                                     headers={"User-Agent": "map-research-script/1.0"})
        dst.write_bytes(urllib.request.urlopen(req, timeout=90).read())
        time.sleep(4)
    return json.loads(dst.read_text(encoding="utf-8"))["elements"]


def relation(rid):
    """Отношение целиком: в общем ответе Overpass участники отношений не приходят."""
    dst = RAW / f"rel_{rid}.json"
    if not dst.exists():
        req = urllib.request.Request("http://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": f"[out:json][timeout:60];relation({rid});out geom;"}).encode(),
                                     headers={"User-Agent": "map-research-script/1.0"})
        dst.write_bytes(urllib.request.urlopen(req, timeout=90).read())
        time.sleep(4)
    els = json.loads(dst.read_text(encoding="utf-8"))["elements"]
    return els[0] if els else {"type": "relation", "members": []}


def rings(e):
    if e["type"] == "relation" and not e.get("members"):
        e = relation(e["id"])
    if e["type"] == "way":
        return [[[round(p["lat"], 6), round(p["lon"], 6)] for p in e.get("geometry", [])]]
    parts = [[[round(p["lat"], 6), round(p["lon"], 6)] for p in m["geometry"]] for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    done = []  # внешний контур отношения может быть разбит на несколько линий — сшиваем их концами
    while parts:
        r = parts.pop(0)
        while r[0] != r[-1]:
            nxt = next((q for q in parts if q[0] == r[-1] or q[-1] == r[-1]), None)
            if nxt is None:
                break
            parts.remove(nxt)
            r += (nxt if nxt[0] == r[-1] else nxt[::-1])[1:]
        done.append(r)
    return done


def main():
    pts = json.loads((ROOT / "site" / "data" / "moscow_points.json").read_text(encoding="utf-8"))
    out = {}
    for i, (addr, pat, ids) in enumerate(HOUSES):
        d = next(x for x in pts if x[2] == addr)
        b = []
        for e in fetch(i, d[0], d[1]):
            t = e.get("tags", {})
            if "building:part" in t:
                continue
            key = (t.get("addr:street", "") + " " + t.get("addr:housenumber", "")).strip()
            if e["id"] in ids or (pat and re.search(pat, key)):
                lv = t.get("building:levels", "")
                levels = int(float(lv)) if re.fullmatch(r"\d+(\.\d+)?", lv) else 2
                for r in rings(e):
                    if len(r) >= 4:
                        b.append([levels, r])
        out[addr] = {"b": b}
        print(addr, "зданий", len(b), "этажей", sorted({x[0] for x in b}))
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(OUT, OUT.stat().st_size, "байт")


if __name__ == "__main__":
    main()
