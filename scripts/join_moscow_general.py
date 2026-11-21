"""Сшивает московскую базу (data/moscow/persons.csv, «Расстрелы в Москве») с общей базой «Мемориала»
(data/raw/victims_flat.csv, «Жертвы политического террора в СССР») и пишет data/moscow/persons_case.csv.

Зачем: в московской базе нет даты ареста, органа, вынесшего приговор, обвинения и даты реабилитации; в общей базе они есть.

Как сопоставляются записи:
  1. ключ — фамилия, имя, отчество (без регистра, «ё» = «е», без скобок и лишних пробелов) и год рождения;
  2. среди записей общей базы с таким ключом берутся те, у которых дата смерти совпадает с датой расстрела из московской базы;
     если таких нет, но запись по ключу одна и дата смерти у неё не указана — берётся она (в столбце match это «key»);
  3. один человек в общей базе может быть записан несколько раз (из разных книг памяти); поля берутся из первой записи,
     где они заполнены, а источники перечисляются все.
Если по ключу ничего не нашлось или даты расходятся, человек остаётся без дела (match пустой). Ничего не достраивается.

Столбцы результата: ADDRESS_ID, NAME, match (date | key | ""), n (сколько записей общей базы слито), arrest_date, court_body,
court_date, article, sentence, rehab_date, source_book.

Запуск из корня репозитория: python scripts/join_moscow_general.py
"""
import csv
import re
from collections import defaultdict
from pathlib import Path

R = Path(__file__).resolve().parent.parent
csv.field_size_limit(10 ** 9)


def norm(s):
    s = re.sub(r"\([^)]*\)", " ", s.lower().replace("ё", "е"))
    return re.sub(r"[^а-яa-z\- ]", " ", s).split()


def main():
    with open(R / "data" / "moscow" / "persons.csv", encoding="utf-8", newline="") as f:
        people = list(csv.DictReader(f))
    want = defaultdict(list)  # ключ -> номера московских записей
    info = []
    for i, p in enumerate(people):
        name, b = p["NAME"].strip(), p["BIO"]
        by = re.search(r"род\.\s*(?:\d{1,2}\.\d{1,2}\.)?(\d{4})", b)
        ex = re.search(r"асс+трелян[аы]?\s+(\d{1,2})\.(\d{1,2})\.(\d{4})", b)
        exd = f"{ex.group(3)}-{int(ex.group(2)):02d}-{int(ex.group(1)):02d}" if ex else ""
        w = norm(name)
        key = (" ".join(w[:3]), by.group(1) if by else "")
        info.append((key, exd))
        if len(w) >= 2 and key[1]:
            want[key].append(i)
    found = defaultdict(list)
    with open(R / "data" / "raw" / "victims_flat.csv", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            key = (" ".join(norm(row["last_name"]) + norm(row["first_name"]) + norm(row["patronymic"])), row["birth_date"][:4])
            if key in want:
                found[key].append(row)
    fields = ["arrest_date", "court_body", "court_date", "article", "sentence", "rehab_date"]
    stat = defaultdict(int)
    with open(R / "data" / "moscow" / "persons_case.csv", "w", encoding="utf-8", newline="") as o:
        w = csv.writer(o)
        w.writerow(["ADDRESS_ID", "NAME", "match", "n"] + fields + ["source_book"])
        for p, (key, exd) in zip(people, info):
            cand = found.get(key, [])
            same = [r for r in cand if exd and r["death_date"] == exd]
            how = "date" if same else ""
            if not same and len(cand) == 1 and not cand[0]["death_date"]:
                same, how = cand, "key"
            stat[how or ("none" if not cand else "mismatch")] += 1
            vals = [next((r[k].strip() for r in same if r[k].strip()), "") for k in fields]
            books = "; ".join(dict.fromkeys(r["source_book"].strip() for r in same if r["source_book"].strip()))
            w.writerow([p["ADDRESS_ID"], p["NAME"].strip(), how, len(same)] + vals + [books])
    print(len(people), dict(stat))


if __name__ == "__main__":
    main()
