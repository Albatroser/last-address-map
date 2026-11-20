"""Собирает site/data/last_address.json: у кого из людей на карте есть табличка «Последнего адреса».

Источник — таблица установленных в Москве табличек на сайте проекта:
https://www.poslednyadres.ru/installed_tables/ (адрес, имя, текст таблички).
Человек с карты считается найденным, если в таблице есть табличка с теми же словами в ФИО
(порядок слов не важен, ё = е) и тем же годом рождения («Родился в ГГГГ» в тексте таблички;
если года на табличке нет, достаточно ФИО). Разночтения в написании имён не учитываются,
поэтому часть табличек может остаться ненайденной — число занижено, а не завышено.

Нужен только стандартный Python. Запуск из корня репозитория: python scripts/build_last_address.py
Страница скачивается заново; чтобы взять сохранённую копию: python scripts/build_last_address.py файл.html
"""
import datetime, html, json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://www.poslednyadres.ru/installed_tables/"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) > 1:
        page = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        page = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", errors="replace")
    clean = lambda x: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()
    words = lambda s: frozenset(re.sub(r"[^а-я ]", "", s.lower().replace("ё", "е")).split())
    plaques = []  # (адрес, имя, текст)
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S)
        if len(tds) >= 3:
            plaques.append([clean(x) for x in tds[:3]])
    if len(plaques) < 500:
        sys.exit("В таблице меньше 500 строк: страница изменилась или не загрузилась")
    by_name = {}
    for addr, name, text in plaques:
        m = re.search(r"Родился\s+в\s+(\d{4})", text)
        by_name.setdefault(words(name), []).append(m.group(1) if m else None)
    pts = json.loads((ROOT / "site" / "data" / "moscow_points.json").read_text(encoding="utf-8"))
    found = []
    for lat, lon, addr, ppl in pts:
        for p in ppl:
            years = by_name.get(words(p[1]))
            if years and any(y is None or y == str(p[2]) for y in years):
                found.append(p[1] + "|" + str(p[2] or ""))
    out = {
        "_comment": "Люди с карты, у которых есть табличка «Последнего адреса». Собирает scripts/build_last_address.py, способ подсчёта описан там.",
        "source": URL,
        "date": datetime.date.today().isoformat(),
        "plaques_moscow": len(plaques),
        "addresses_moscow": len({p[0] for p in plaques}),
        "people": sorted(set(found)),
    }
    (ROOT / "site" / "data" / "last_address.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("табличек в Москве:", out["plaques_moscow"], "· адресов:", out["addresses_moscow"], "· людей с карты с табличкой:", len(found), "· уникальных ключей:", len(out["people"]))


main()
