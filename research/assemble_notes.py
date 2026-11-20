"""Собирает site/data/house_notes.json из результатов поиска источников (research/result*.json, verify_existing.json).

Что куда пошло, решено вручную 2026-11-20 после чтения отчётов:
- SKIP — дома, по которым справки нет: источник не найден или держится на одной слабой строке.
- EDIT — правки текста: убраны фразы, которые сам исполнитель пометил как не подтверждённые источником.
Запуск из корня репозитория: python research/assemble_notes.py
"""
import json
from pathlib import Path

R = Path(__file__).resolve().parent
SKIP = {
    "Бутырский Вал ул., д.5": "источник не найден",
    "Тульская М. ул., д.2": "только городские новости о капремонте; связь адреса 1930-х с нынешним комплексом 2/1 не подтверждена",
    "Коптельский 1-й пер., д.9": "одна фраза в Википедии со ссылкой на мемуары",
    "Серпуховская Б. ул., д.46": "одна строка в Википедии; принадлежность дома 46 к названному комплексу не подтверждена",
}
EDIT = {
    "Солянка ул., д.1": [(" В советское время почти все квартиры были заселены коммунально.", "")],
    "Мира просп., д.66": [(" В доме были коммунальные квартиры.", "")],
    "Басманная Нов. ул., д.10": [(" В советское время оставался жилым: в 1920-х годах здесь жил венгерский писатель Мате Залка, в 1930–1940-х — поэт-песенник Алексей Фатьянов; в 1980-х годах дом расселили.",
                                  " Чем дом был в 1930-е годы и почему среди его жильцов столько расстрелянных, в найденных источниках не сказано.")],
    "Смоленский б-р, д.17": [("по указанию наркома тяжёлой промышленности Орджоникидзе", "по указанию Орджоникидзе")],
    "Софийская наб., д.34": [("было надстроено несколькими этажами.", "было надстроено несколькими этажами. Чем оно было в 1930-е годы — жильём или общежитием, — в найденных источниках не сказано.")],
}


def main():
    notes = {"_comment": ("Справки о домах, где расстреляно 20 человек и больше. Ключ — адрес как в moscow_points.json. "
                          "Собрано research/assemble_notes.py 2026-11-20 из research/result*.json и verify_existing.json; "
                          "там же дословные цитаты из источников и сомнения по каждому дому. "
                          "Числа расстрелянных и членов ВКП(б) в справку подставляет map.js из данных.")}
    for r in json.loads((R / "verify_existing.json").read_text(encoding="utf-8")):
        notes[r["address"]] = {"title": r["proposed_title"], "text": r["proposed_text"], "sources": r["sources"]}
    skipped = []
    for i in range(1, 6):
        for r in json.loads((R / f"result{i}.json").read_text(encoding="utf-8")):
            a = r["address"]
            if a in SKIP or not r.get("found"):
                skipped.append(a)
                continue
            text = r["text"]
            for old, new in EDIT.get(a, []):
                assert old in text, (a, old)
                text = text.replace(old, new)
            notes[a] = {"title": r["title"], "text": text, "sources": r["sources"]}
    dst = R.parent / "site" / "data" / "house_notes.json"
    dst.write_text(json.dumps(notes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("справок:", len(notes) - 1, "| без справки:", len(skipped), skipped)
    print("самая длинная:", max(len(v["text"]) for k, v in notes.items() if k != "_comment"))


if __name__ == "__main__":
    main()
