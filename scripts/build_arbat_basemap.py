"""Собирает лёгкую векторную подложку района Арбата для прототипов оформления (site/design/).

Источник: OpenStreetMap через Overpass API (© участники OpenStreetMap, лицензия ODbL).
Сырой ответ Overpass в git не хранится. Получить его:

  curl -A "map-prototype/0.1" --data-urlencode 'data=[out:json][timeout:90];(
    way["building"](55.7440,37.5790,55.7570,37.6060);
    relation["building"]["type"="multipolygon"](55.7440,37.5790,55.7570,37.6060);
    way["highway"](55.7440,37.5790,55.7570,37.6060);
    way["leisure"~"park|garden"](55.7440,37.5790,55.7570,37.6060);
    way["natural"="water"](55.7440,37.5790,55.7570,37.6060););out geom;' \
    http://overpass-api.de/api/interpreter -o arbat_raw.json

Запуск: python scripts/build_arbat_basemap.py arbat_raw.json
Результат: site/design/arbat_base.json

Контуры домов современные (выгрузка 2026-11-20): часть домов 1930-х снесена, часть построена позже.
"""
import json
import sys
from pathlib import Path

BBOX = [55.7440, 37.5790, 55.7570, 37.6060]  # юг, запад, север, восток
MAJOR = {"motorway", "trunk", "primary", "secondary", "tertiary",
         "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
MINOR = {"residential", "unclassified", "living_street"}
PED = {"pedestrian"}


def ring(geom):
    return [[round(p["lat"], 5), round(p["lon"], 5)] for p in geom]


def main():
    raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    buildings, streets, green, water = [], [], [], []
    for el in raw["elements"]:
        tags = el.get("tags", {})
        if el["type"] == "relation":
            for m in el.get("members", []):
                if m.get("role") == "outer" and m.get("geometry") and len(m["geometry"]) >= 4:
                    buildings.append(ring(m["geometry"]))
            continue
        geom = el.get("geometry")
        if not geom:
            continue
        if "building" in tags:
            if len(geom) >= 4:
                buildings.append(ring(geom))
        elif "highway" in tags:
            h = tags["highway"]
            k = "a" if h in MAJOR else "b" if h in MINOR else "p" if h in PED else None
            if k and tags.get("area") != "yes":
                streets.append({"k": k, "n": tags.get("name", ""), "p": ring(geom)})
        elif tags.get("leisure") in ("park", "garden"):
            if len(geom) >= 4:
                green.append(ring(geom))
        elif tags.get("natural") == "water":
            if len(geom) >= 4:
                water.append(ring(geom))
    out = {
        "bbox": BBOX,
        "source": "© участники OpenStreetMap, ODbL; выгрузка " + raw["osm3s"]["timestamp_osm_base"][:10],
        "buildings": buildings, "streets": streets, "green": green, "water": water,
    }
    dst = Path(__file__).resolve().parent.parent / "site" / "design" / "arbat_base.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(buildings), "buildings,", len(streets), "street segments,", len(green), "green,", len(water), "water;",
          dst.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
