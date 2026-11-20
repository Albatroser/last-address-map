"""Векторная подложка для основной карты: контуры домов и улицы Москвы, нарезанные на плитки.

Источник: OpenStreetMap через Overpass API (© участники OpenStreetMap, лицензия ODbL).
Контуры современные: часть домов 1930-х снесена, часть построена позже.

Сетка: клетка 0,01° по широте × 0,02° по долготе (около 1,1 × 1,25 км).
Берутся клетки, где есть хотя бы один адрес из site/data/moscow_points.json, и все их соседи.
Скачивание идёт блоками 4 × 4 клетки; сырые ответы кладутся в data/raw/osm/ (в git не попадают)
и при повторном запуске не скачиваются заново.

Запуск:  python scripts/build_basemap.py            # скачать недостающее и собрать
         python scripts/build_basemap.py --no-fetch  # только собрать из уже скачанного

Результат в site/data/base/:
  index.json      — список клеток, дата выгрузки, размеры сетки
  roads.json      — крупные улицы всей области (для мелких масштабов)
  {a}_{b}.json    — клетка: дома и остальные улицы

Формат клетки: {"o":[lat0,lon0], "b":[контур,...], "s":[[класс, название, линия],...]}.
Контур и линия — плоский список целых: первая точка в единицах 1e-5° от угла клетки o,
дальше приращения (dlat, dlon). Классы улиц: a — крупные, b — обычные, p — пешеходные.
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "osm"
OUT = ROOT / "site" / "data" / "base"
CL, CO, BLK = 0.01, 0.02, 4
ENDPOINTS = ["http://overpass-api.de/api/interpreter", "https://overpass-api.de/api/interpreter"]  # https с этой машины отвечал 502
MAJOR = {"motorway", "trunk", "primary", "secondary", "tertiary",
         "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
MINOR = {"residential", "unclassified", "living_street"}
PED = {"pedestrian"}


def cell_of(lat, lon):
    return math.floor(lat / CL + 1e-9), math.floor(lon / CO + 1e-9)


def wanted_cells():
    pts = json.loads((ROOT / "site" / "data" / "moscow_points.json").read_text(encoding="utf-8"))
    cells = set()
    for d in pts:
        a, b = cell_of(d[0], d[1])
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                cells.add((a + i, b + j))
    return cells


def fetch(block):
    A, B = block
    dst = RAW / f"block_{A}_{B}.json"
    if dst.exists() and dst.stat().st_size > 200:
        return True
    s, w = A * BLK * CL, B * BLK * CO
    bbox = f"{s:.4f},{w:.4f},{s + BLK * CL:.4f},{w + BLK * CO:.4f}"
    q = (f'[out:json][timeout:170];(way["building"]({bbox});'
         f'relation["building"]["type"="multipolygon"]({bbox});way["highway"]({bbox}););out geom;')
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(6):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "map-prototype/0.1"})
            with urllib.request.urlopen(req, timeout=200) as r:
                data = r.read()
            json.loads(data)["elements"]  # ответ должен быть целым JSON
            dst.write_bytes(data)
            print(f"block {A}_{B}: {len(data) // 1024} KB", flush=True)
            return True
        except Exception as e:  # сервер занят, обрыв, неполный ответ — подождать и повторить
            print(f"block {A}_{B}: attempt {attempt + 1} failed: {str(e)[:120]}", flush=True)
            time.sleep(15 * (attempt + 1))
    return False


def enc(geom, lat0, lon0):
    out, pa, pb = [], round(lat0 * 1e5), round(lon0 * 1e5)
    for p in geom:
        a, b = round(p["lat"] * 1e5), round(p["lon"] * 1e5)
        out += [a - pa, b - pb]
        pa, pb = a, b
    return out


def build(cells):
    seen, date = set(), ""
    tiles = {c: {"b": [], "s": []} for c in cells}
    roads = []
    for f in sorted(RAW.glob("block_*.json")):
        raw = json.loads(f.read_text(encoding="utf-8"))
        date = max(date, raw["osm3s"]["timestamp_osm_base"][:10])
        for el in raw["elements"]:
            key = (el["type"], el["id"])
            if key in seen:
                continue
            seen.add(key)
            tags = el.get("tags", {})
            if el["type"] == "relation":
                geoms = [m["geometry"] for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
                kind = "b"
            else:
                geoms = [el["geometry"]] if el.get("geometry") else []
                kind = "b" if "building" in tags else "s"
            for g in geoms:
                c = cell_of(g[0]["lat"], g[0]["lon"])
                if kind == "b":
                    if len(g) >= 4 and c in tiles:
                        tiles[c]["b"].append(enc(g[:-1], c[0] * CL, c[1] * CO))
                    continue
                h = tags.get("highway")
                k = "a" if h in MAJOR else "b" if h in MINOR else "p" if h in PED else None
                if not k or tags.get("area") == "yes" or len(g) < 2:
                    continue
                if k == "a":
                    roads.append([tags.get("name", ""), enc(g, 0, 0)])
                elif c in tiles:
                    tiles[c]["s"].append([k, tags.get("name", ""), enc(g, c[0] * CL, c[1] * CO)])
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    total, nb, names = 0, 0, []
    for (a, b), t in sorted(tiles.items()):
        if not t["b"] and not t["s"]:
            continue
        txt = dump({"o": [round(a * CL, 5), round(b * CO, 5)], "b": t["b"], "s": t["s"]})
        (OUT / f"{a}_{b}.json").write_text(txt, encoding="utf-8")
        total += len(txt.encode("utf-8"))
        nb += len(t["b"])
        names.append(f"{a}_{b}")
    rtxt = dump(roads)
    (OUT / "roads.json").write_text(rtxt, encoding="utf-8")
    (OUT / "index.json").write_text(dump({
        "cl": CL, "co": CO, "cells": names,
        "source": "© участники OpenStreetMap, ODbL; выгрузка " + date,
    }), encoding="utf-8")
    print(f"{len(names)} cells, {nb} buildings, cells {total / 1e6:.1f} MB, "
          f"roads {len(roads)} ways {len(rtxt.encode('utf-8')) / 1e6:.1f} MB, OSM date {date}")


def main():
    cells = wanted_cells()
    blocks = sorted({(a // BLK, b // BLK) for a, b in cells})
    print(len(cells), "cells,", len(blocks), "blocks", flush=True)
    if "--no-fetch" not in sys.argv:
        RAW.mkdir(parents=True, exist_ok=True)
        missing = []
        for i, blk in enumerate(blocks):
            fresh = not (RAW / f"block_{blk[0]}_{blk[1]}.json").exists()
            if not fetch(blk):
                missing.append(blk)
            elif fresh:
                time.sleep(4)  # не нагружать общий сервер
        if missing:
            print("NOT FETCHED:", missing, flush=True)
            sys.exit(1)
    build(cells)


if __name__ == "__main__":
    main()
