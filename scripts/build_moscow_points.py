"""Собирает site/data/moscow_points.json из data/moscow/*.csv. Нужен только стандартный Python.

Формат: [[lat, lon, "адрес", [человек, ...]], ...], человек — список:
  0 квартира ("" — не указана)   1 ФИО            2 год рождения      3 дата расстрела
  4 место захоронения             5 строка биографии как в источнике (без «род. …» и без адреса)
  6 место рождения                7 национальность 8 партийность       9 работа, должность
Поля 6–9 получены разбором строки 5 и заполнены, только если строка разобралась целиком;
иначе они пустые, а показывать нужно строку 5.

Координаты берутся из addresses_geocoded.csv; отдельные адреса исправлены вручную в data/moscow/coord_overrides.csv.

Запуск из корня репозитория: python scripts/build_moscow_points.py
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

R = Path(__file__).resolve().parent.parent
M = R / "data" / "moscow"


def rows(name):
    with open(M / name, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def norm(s):
    return re.sub(r"\s+", " ", s if s != "" else "nan").strip().lower()  # пустая ячейка — как NaN в прежней сборке


# партийность: с чего может начинаться третий с конца кусок биографии
PARTY = (r"(?:б/п|беспартийн\w*|член\w* [^,]*|чл\. [^,]*|кандидат\w* [^,]*|канд\. [^,]*|бывш\w* [^,]*|искл\w*[^,]*|"
         r"исключ\w*[^,]*|выбыл\w*[^,]*|вышел [^,]*|из ВКП[^,]*|комсомол\w*[^,]*|"
         r"кадет|эсер\w*|меньшевик\w*|анархист\w*|бундов\w*)(?: \([^)]*\))?")
NAT = r"[а-яё][а-яё\-]{2,20}(?: \([^)]*\))?"  # одно слово со строчной буквы, иногда с уточнением в скобках
BIO = re.compile(rf"^(?P<born>.+?), (?P<nat>{NAT}), (?P<party>{PARTY})(?:, (?P<job>.+))?$")
NOT_NAT = {"уезд", "волость", "район", "губ", "обл", "село", "деревня", "хутор", "станция", "местечко"}


def person(p):
    name, b = p["NAME"].strip(), p["BIO"]
    # в источнике 19 имён разорваны на скобке: «Бухвальд Игнат (Исаак» + «Игнатий) Аронович, род. …»
    if name.count("(") != name.count(")"):
        m = re.match(r"^(.*?\)[^,]*), (род\..*)$", b)
        if m:
            name, b = name + ", " + m.group(1), m.group(2)
    by = re.search(r"род\.\s*(?:\d{1,2}\.\d{1,2}\.)?(\d{4})", b)
    ex = re.search(r"асс+трелян[аы]?\s+(\d{1,2}\.\d{1,2}\.\d{4})", b)
    bu = re.search(r"Место захоронения:\s*([^.]+)", b)
    bio = re.sub(r"\.\s*Адрес:.*", "", b)
    bio = re.sub(r"^род\.[^,]*,", "", bio).strip()
    m = BIO.match(bio)
    parts = ["", "", "", ""]
    if m and m.group("nat") not in NOT_NAT:
        born = re.sub(r"^в ", "", m.group("born"))
        parts = [born, m.group("nat"), m.group("party"), m.group("job") or ""]
    apt = p["APT"].replace("\xa0", " ").strip()
    return [apt, name, by.group(1) if by else "", ex.group(1) if ex else "", bu.group(1).strip() if bu else "", bio] + parts


def main():
    ad, pe, gk = rows("addresses.csv"), rows("persons.csv"), rows("addresses_geocoded.csv")
    coords = {}
    for g in gk:
        if g["latitude"] and g["longitude"]:
            coords.setdefault(norm(g["street"]) + "|" + norm(g["house"]), (float(g["latitude"]), float(g["longitude"])))
    # ручные поправки координат: адрес как в addresses.csv -> (широта, долгота); источник и причина — в самом файле
    fixes = {r["address"]: (float(r["latitude"]), float(r["longitude"])) for r in rows("coord_overrides.csv")}
    by_addr = defaultdict(list)
    for p in pe:
        by_addr[p["ADDRESS_ID"]].append(p)
    out, missing, parsed, total = [], 0, 0, 0
    for a in ad:
        key = "|".join(norm(x) for x in re.sub(r",\s*(д\.)", r"|\1", a["ADDRESS"]).split("|", 1))
        if key not in coords:
            missing += 1
            continue
        ppl = [person(p) for p in by_addr[a["ADDRESS_ID"]]]
        total += len(ppl)
        parsed += sum(1 for x in ppl if x[7])
        lat, lon = fixes.get(a["ADDRESS"], coords[key])
        out.append([round(lat, 5), round(lon, 5), a["ADDRESS"], ppl])
    dst = R / "site" / "data" / "moscow_points.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        f.write("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in out) + "\n]\n")
    print("домов:", len(out), "| людей:", total, "из", len(pe), "| адресов без координат:", missing,
          "| координаты исправлены вручную:", len(fixes), "| биография разобрана по полям:", parsed, f"({parsed / total * 100:.1f}%)")


if __name__ == "__main__":
    main()
