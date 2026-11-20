# data/raw — сырые данные (не в git)

Сюда кладутся большие исходники. В репозиторий они не попадают (.gitignore).
Сейчас они лежат на компьютере Ильи: `D:\GoogleDrive\Projects\Repression`.

| Файл | Что это | Откуда |
|---|---|---|
| `lists_csv/` (40 csv, 378 МБ) | диск «Жертвы политического террора в СССР», cp1251, разделитель `;` | архив `data/lists.memo.ru-disk/lists.memo.ru-disk.zip` в https://github.com/nextgis/memorial_data |
| `victims_flat.csv` (940 МБ) | одна строка = один человек, 2 704 599 строк, UTF-8 | `python scripts/build_victims_flat.py data/raw/lists_csv data/raw/victims_flat.csv` |
| `spb_raw.csv` (4,6 МБ) | 11 359 записей с ленинградским адресом, выборка из victims_flat.csv | отбор по словам «Ленинград/Петроград/Петербург» + признаки адреса (ул., пер., кв. …) |
