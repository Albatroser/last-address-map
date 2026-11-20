// Вступление перед свободной картой: одна лента с прокруткой поверх карты, без кнопок «Дальше».
// Порядок (задал Илья 2026-11-20): что тогда происходило → «это карта одного города» (загораются все дома) →
// вопросы о посетителе (возраст, занятие; карта оставляет дома подошедших людей) → таблички «Последнего адреса» →
// свободная карта. Прокрутка управляет картой: какая карточка на экране, такие дома и горят, а к сценам
// с конкретными людьми и местами камера перелетает (flyCamera в map.js).
// ЧЕРНОВИК: исторические сведения в первых карточках НЕ СВЕРЕНЫ с источниками (см. docs/concept.md) —
// в таком виде публиковать нельзя; об этом сказано и на самой странице.
// Все числа о людях на карте считаются из data/moscow_points.json (их загружает map.js); тексты о людях — только поля базы.
// Проверка: ?map открывает карту сразу, без вступления.
(function () {
  const params = new URLSearchParams(location.search);
  const veil = document.getElementById('story-veil'), box = document.getElementById('story'), skip = document.getElementById('story-skip');
  const mapEl = document.getElementById('map');
  const HANDLERS = ['scrollWheelZoom', 'dragging', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'];
  let unhook = () => {};
  function finish() { // вступление снято, карта свободна
    story = null;
    dots.forEach(m => { m.options.interactive = true; });
    document.body.classList.remove('story-on');
    unhook();
    flight++; // идущий перелёт камеры останавливается
    document.body.classList.remove('story-move');
    const op = map.getPane('overlayPane'); op.style.transition = ''; op.style.opacity = '';
    document.querySelectorAll('.place').forEach(el => el.remove());
    HANDLERS.forEach(h => map[h] && map[h].enable());
    [veil, box, skip].forEach(el => el.remove());
    map.closePopup();
    redrawDots();
  }
  if (params.has('map') || params.has('min')) { finish(); return; }
  skip.onclick = finish;

  const CITY = [55.7539, 37.6208];
  const fmt = n => n.toLocaleString('ru');
  const shotVerb = n => plural(n, 'расстрелян', 'расстреляны', 'расстреляны');
  const wide = () => window.innerWidth >= 760;

  // Занятия: широкие блоки, чтобы современный человек нашёл свой («дизайнер» → «Медиа, искусство, дизайн»).
  // Отбор грубый — по словам в поле «кем был» (а если строка биографии не разобрана — по всей строке);
  // один человек может попасть в несколько блоков (начальник цеха, инженер). Хотя бы в один блок попадают
  // 9 588 человек из 10 839 (подсчёт 2026-11-20 теми же словами по site/data/moscow_points.json).
  // [подпись на кнопке, как назвать этих людей, слова]
  const JOBS = [
    ['Инженер, техника, IT', 'инженеры, техники, конструкторы', /инженер|техник|конструктор|технолог|механик|чертежник|проектировщ|электрик|военинж/],
    ['Рабочий, мастер', 'рабочие и мастера', /рабоч|слесар|токар|монтер|грузчик|столяр|плотник|кузнец|маляр|штукатур|каменщик|сварщик| мастер |бригадир|сторож|кладовщик|дворник|вахтер|истопник|кочегар/],
    ['Транспорт', 'шофёры, машинисты, диспетчеры', /шофер|водител|машинист |кондуктор|диспетчер|вагоновожат|летчик|пилот|извозчик|стрелочник/],
    ['Образование, наука', 'учителя, преподаватели, научные работники', /учител|преподават|педагог|профессор|доцент|научн|аспирант|лектор|воспитател/],
    ['Медицина', 'врачи и медики', /врач|фельдшер|медсестр|санитар|аптек|провизор|хирург|ветеринар/],
    ['Финансы, учёт', 'бухгалтеры, экономисты, плановики', /бухгалтер|экономист|счетовод|кассир|финанс|планов|ревизор|статистик|товаровед|банк/],
    ['Руководитель', 'директора, начальники, заведующие', /директор|начальник|заведующ|управляющ|председател|руководител|заместител| зам | зав /],
    ['Офис, юрист', 'служащие: секретари, инспекторы, юристы', /секретар|инспектор|референт|делопроизвод|юрисконсульт|юрист|адвокат|защитник|консультант|инструктор|агент|уполномоч|машинистк|переводчи|библиотек/],
    ['Военный, полиция', 'военные и сотрудники органов', /ркка|полковник|майор|капитан|лейтенант|комбриг|комдив|комкор|командир|красноармеец|военн|нквд|милици|гугб|госбезопасност|комендант|разведыват|интендант/],
    ['Журналист, редактор', 'журналисты, редакторы, корреспонденты', /журналист|редактор|корреспондент|репортер|публицист|фельетонист|литсотрудник/],
    ['Искусство, дизайн', 'художники, артисты, писатели, архитекторы, полиграфисты', /писател|литератор|поэт|художник|артист|музыкант|актер|актрис|режиссер|архитектор|фотограф|типограф|полиграф|композитор|певец|певиц|скульптор|оформител|гравер/],
    ['Торговля, сервис', 'работники торговли и обслуживания', /продав|магазин|торг|официант|повар|парикмахер|буфет|столов|портн|сапожник|пекар|заготов/],
    ['Учусь', 'студенты и учащиеся', /студент|учащ|слушател|курсант/],
    ['Не работаю', 'без работы, пенсионеры, домохозяйки', /без определенных занятий|безработн|пенсионер|домохозяйк|домашняя хозяйка|иждивен|инвалид|не работал/],
  ];

  window.startStory = function () {
    // все люди на карте: дом, запись, возраст в год расстрела (по году рождения, точность — год), занятие
    const P = [];
    dots.forEach(m => m.ppl.forEach(p => {
      const y = yearOf(p[3]), born = +p[2];
      P.push({ m, p, age: y && born ? y - born : null, job: ' ' + norm(p[7] ? p[9] : p[5]) + ' ' });
    }));
    const ages = P.map(x => x.age).filter(a => a !== null && a > 0);
    const ageMin = Math.min(...ages), ageMax = Math.max(...ages);
    const housesOf = rows => [...new Set(rows.map(x => x.m))];
    // запись, о которой в базе заполнено больше полей; при равенстве — первая по алфавиту
    const filled = p => [p[2], p[9], p[6], p[7], p[0]].filter(Boolean).length;
    const best = rows => rows.slice().sort((a, b) => filled(b.p) - filled(a.p) || a.p[1].localeCompare(b.p[1], 'ru'))[0];
    // Человек: всё, что есть о нём в базе, без сокращений и добавлений.
    const person = x => {
      const [apt, name, born, shot, burial, bio, place, nat, party, job] = x.p;
      const row = (k, v) => v ? '<p class="row"><span>' + k + '</span>' + esc(v) + '</p>' : '';
      return '<div class="name">' + esc(name) + '</div>' +
        '<p>' + (born ? born + ' – ' : 'расстрел ') + esc(shot) + '</p>' +
        (nat ? '<p>' + esc(job) + '</p>' + row('Место рождения', place) + row('Национальность', nat) + row('Партийность', party)
          : '<p>' + esc(bio) + '</p>') +
        row('Адрес', x.m.addr + (apt ? ', кв. ' + apt : '')) + row('Захоронение', burial);
    };

    const sec = (html, cls, scene) => '<section class="step' + (cls ? ' ' + cls : '') + '"' + (scene ? ' data-scene="' + scene + '"' : '') + '><div class="card">' + html + '</div></section>';

    // ---------- сцены с перелётами: конкретные люди и места (придумал Илья 2026-11-20) ----------
    // Камера прилетает к дому или улице, на карте горят только они. Всё считается из данных карты.
    const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const dayOf = d => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(d || ''); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; };
    const dayText = k => (k % 100) + ' ' + MONTHS[Math.floor(k / 100) % 100 - 1] + ' ' + Math.floor(k / 10000) + ' года';
    const ppl = n => fmt(n) + ' ' + plural(n, 'человек', 'человека', 'человек');
    const houseText = a => a.replace(/,\s*д\./, ', ');
    const foe = w => '<b class="foe">' + w + '</b>';
    const topDay = rows => { // самый частый день расстрела среди этих людей: [день, сколько]
      const by = {}; rows.forEach(x => { const d = dayOf(x.p[3]); if (d) by[d] = (by[d] || 0) + 1; });
      const d = Object.keys(by).map(Number).sort((a, b) => by[b] - by[a] || a - b)[0];
      return [d, by[d] || 0, by];
    };
    const aged = P.filter(x => x.age > 0), youngest = aged.filter(x => x.age === ageMin), oldest = aged.filter(x => x.age === ageMax);
    // улица — часть адреса до «, д.»; выбирается та, где номера домов с расстрелянными занимают наибольшую долю
    // от самого большого номера (среди улиц, где таких номеров не меньше 15). Сколько домов стояло на улице тогда, в данных нет.
    const st = {}, numOf = m => +(/д\.\s*(\d+)/.exec(m.addr) || [])[1] || 0;
    dots.forEach(m => {
      const name = m.addr.split(/,\s*д\./)[0].trim(), x = st[name] = st[name] || { name, list: [], n: 0, nums: new Set() };
      x.list.push(m); x.n += m.n; if (numOf(m)) x.nums.add(numOf(m));
    });
    const share = x => x.nums.size / Math.max(...x.nums);
    const street = Object.values(st).filter(x => x.nums.size >= 15).sort((a, b) => share(b) - share(a))[0];
    // Кремль: адреса вида «Кремль, д.N»
    const kremlin = P.filter(x => /^Кремль,/.test(x.m.addr)).sort((a, b) => dayOf(a.p[3]) - dayOf(b.p[3]) || a.p[1].localeCompare(b.p[1], 'ru'));
    const krGuard = kremlin.filter(x => /кремл/i.test(x.p[9] || x.p[5])).length, krD = topDay(kremlin);
    const krNext = krD[2][krD[0] + 1] ? krD[0] + 1 : krD[2][krD[0] - 1] ? krD[0] - 1 : 0; // соседний день, если расстреливали и в него
    const krTwo = krNext ? [Math.min(krD[0], krNext), krD[1] + krD[2][krNext]] : null;
    const brief = x => '<p class="line"><b>' + esc(x.p[1]) + '</b><br>' + esc(x.p[7] ? x.p[9] : x.p[5]) + '</p>';
    // школьники: в описании человека прямо сказано, что он учащийся школы или класса
    const pupils = P.filter(x => /учащ\S* (\d+-го класса|школы)/i.test(x.p[7] ? x.p[9] : x.p[5]));
    // партийность — поле базы. Член ВКП(б): запись начинается с «член ВКП» (то же правило, что в справках о домах, map.js)
    const partyOf = x => { const t = x.p[8] || '';
      return /^член ВКП/.test(t) ? 'in' : /^кандидат/.test(t) ? 'cand' : /^(бывш\S* член\S* ВКП|исключ\S* из ВКП|искл\. из ВКП)/.test(t) ? 'ex' : /^б\/п/.test(t) ? 'no' : 'other'; };
    const party = { in: [], cand: [], ex: [], no: [], other: [] }; P.forEach(x => party[partyOf(x)].push(x));
    // сто квадратов: доли округлены так, чтобы в сумме вышло ровно сто (остаток — тем, у кого дробная часть больше)
    const waffle = (() => {
      const keys = ['in', 'cand', 'ex', 'no', 'other'], raw = keys.map(k => party[k].length / P.length * 100), n = raw.map(Math.floor);
      raw.map((v, i) => [v - n[i], i]).sort((a, b) => b[0] - a[0]).slice(0, 100 - n.reduce((a, b) => a + b, 0)).forEach(([, i]) => { n[i]++; });
      return '<div class="grid waffle">' + keys.map((k, i) => ('<i class="' + k + '"></i>').repeat(n[i])).join('') + '</div>';
    })();
    const leg = (k, text) => '<p class="leg"><i class="' + k + '"></i>' + text + ' — ' + fmt(party[k].length) + '</p>';
    // Места на карте, которых нет в базе. НЕ СВЕРЕНО: названия и роль мест написаны по памяти, координаты приблизительные
    // (тоже по памяти, не по источнику). Источники, которые удалось найти: о Военной коллегии на Никольской, 23 —
    // «Новая газета» (https://novayagazeta.ru/articles/2008/04/03/38594-pulya-v-serdtse-moskvy); о Бутовском полигоне
    // (20 762 расстрелянных с 8 августа 1937 по 19 октября 1938) — Большая российская энциклопедия
    // (https://bigenc.ru/c/butovskii-poligon-a7de44). О тюрьмах, Коммунарке и Донском источник не найден.
    const JAILS = [
      [55.7608, 37.6272, 'Лубянка: внутренняя тюрьма НКВД'], [55.7836, 37.5958, 'Бутырская тюрьма'],
      [55.7636, 37.7064, 'Лефортовская тюрьма'], [55.7372, 37.6606, 'Таганская тюрьма'],
      [55.7585, 37.6243, 'Никольская, 23: Военная коллегия'],
    ];
    // места захоронения — как они названы в базе; число у каждого считается из данных карты
    const GRAVES = { 'Бутово': [55.5333, 37.5944], 'Коммунарка': [55.5786, 37.4560], 'Донское': [55.7143, 37.6010],
      'Ваганьковское кладбище': [55.7686, 37.5497], 'Яузская больница': [55.7490, 37.6520] };
    const inGrave = {}; P.forEach(x => { inGrave[x.p[4]] = (inGrave[x.p[4]] || 0) + 1; });
    const graveList = Object.keys(GRAVES).filter(k => inGrave[k]).sort((a, b) => inGrave[b] - inGrave[a]);
    // линии от дома к месту захоронения его жильцов (одна на пару «дом — место»)
    const graveLines = []; dots.forEach(m => { new Set(m.ppl.map(q => q[4])).forEach(g => { if (GRAVES[g]) graveLines.push([m.getLatLng(), GRAVES[g]]); }); });
    // национальность — поле базы; латыши, поляки, немцы — три самые большие группы, по которым шли «национальные операции»
    const natOf = x => { const t = (x.p[7] || '').trim().toLowerCase(); return /^латыш/.test(t) ? 'lat' : /^(поляк|полька)/.test(t) ? 'pol' : /^(немец|немка)/.test(t) ? 'ger' : ''; };
    const nats = { lat: [], pol: [], ger: [] }; P.forEach(x => { const k = natOf(x); if (k) nats[k].push(x); });
    const natRows = nats.lat.concat(nats.pol, nats.ger), natMax = Math.max(nats.lat.length, nats.pol.length, nats.ger.length);
    const natBar = (k, label) => '<div class="hbar"><span>' + label + '</span><i style="width:' + (nats[k].length / natMax * 100).toFixed(1) + '%"></i><b>' + fmt(nats[k].length) + '</b></div>';
    // дома со справками (site/data/house_notes.json — это дома, где расстреляно 20 человек и больше), от самых больших
    // Из них Илья убрал дома, не связанные с властью (отбор ручной, по названиям справок, 2026-11-21);
    // дома политкаторжан и дом иностранных специалистов он оставил.
    const NOT_OWN = new Set(['Капельский пер., д.13', 'Лестева ул., д.11', 'Мира просп., д.66', 'Арбат ул., д.51', 'Тверская ул., д.26',
      'Усачева ул., д.29', 'Мытная ул., д.23', 'Академика Петровского ул., д.16а', 'Басманная Нов. ул., д.10', 'Тверская-Ямская 3-я ул., д.12']);
    const bigHouses = dots.filter(m => m.note && !NOT_OWN.has(m.addr)).sort((a, b) => b.n - a.n);
    const scenes = {
      nations: { list: housesOf(natRows), rows: natRows, city: true },
      jail: { list: [], rows: null, zoom: 13, pts: JAILS.map(j => [j[0], j[1]]), places: JAILS.map(j => [j[0], j[1], j[2]]) },
      shoot: { list: dots, rows: null, zoom: 11, pts: graveList.map(k => GRAVES[k]).concat([[55.80, 37.62]]), lines: graveLines,
        places: graveList.map(k => [GRAVES[k][0], GRAVES[k][1], k + ' — ' + fmt(inGrave[k])]) },
      party: { list: housesOf(party.in), rows: party.in, city: true },
      young: { list: housesOf(youngest), rows: youngest, zoom: 17 },
      old: { list: housesOf(oldest), rows: oldest, zoom: 16 },
      street: { list: street.list, rows: null, zoom: 17 },
      house: { list: bigHouses, rows: null, zoom: 14 },
      kremlin: { list: housesOf(kremlin), rows: null, zoom: 16 },
    };
    // Порядок сцен (утверждает Илья, 2026-11-20): сначала люди — любой возраст, потом «даже свои», потом масштаб.
    const sceneHtml =
      // кто эти враги: любой возраст
      sec('<p>' + foe('Врагом') + ' мог оказаться подросток. Самому младшему было ' + ageMin + ' ' + plural(ageMin, 'год', 'года', 'лет') + '.</p>' + youngest.map(person).join('') +
        (pupils.length ? '<p class="lead">' + ({ 2: 'Двое', 3: 'Трое', 4: 'Четверо', 5: 'Пятеро' }[pupils.length] || pupils.length) + ' ' + foe('врагов') + ' ещё учились в школе.</p>' +
          pupils.map(x => '<p class="line"><b>' + esc(x.p[1]) + '</b><br>' + (x.p[2] ? x.p[2] + ' – ' : '') + esc(x.p[3]) + ' · ' + esc(x.p[7] ? x.p[9] : x.p[5]) + '<br>' + esc(houseText(x.m.addr)) + '</p>').join('') : ''), 'scene', 'young') +
      sec('<p>' + foe('Врагом') + ' мог оказаться и старик. ' + (oldest.length > 1 ? 'Самым старшим было ' : 'Самому старшему было ') + ageMax + '.</p>' + oldest.map(person).join('<p class="gap"></p>'), 'scene', 'old') +
      // Национальные операции. Число по стране — С. А. Кривенко, С. Б. Прудовский, «Статистика национальных операций НКВД
      // 1937–1938 гг.», по пересказу в «Новой газете» (https://novayagazeta.ru/articles/2021/09/09/natsionalizm-po-stalinski):
      // приговорено 346 850 человек, из них 247 137 — к расстрелу. Первоисточник не открывали; названия операций — по памяти.
      sec('<p>Возраст ничего не решал. А национальность решала: забирали и просто за неё.</p>' +
        '<p>В 1937 и 1938 годах НКВД вёл «национальные операции»: польскую, немецкую, латышскую и другие. По ним к расстрелу приговорили 247 тысяч человек по всей стране.</p>' +
        '<div class="hbars">' + natBar('lat', 'латыши') + natBar('pol', 'поляки') + natBar('ger', 'немцы') + '</div>' +
        '<p class="quiet">Столько их среди ' + fmt(P.length) + ' человек на этой карте. На карте горят их дома.</p>', 'scene', 'nations') +
      // кто эти враги: даже свои
      sec('<p>Партийный билет не спасал: больше трети ' + foe('врагов') + ' сами были членами правящей партии.</p>' + waffle +
        leg('in', 'члены ВКП(б)') + leg('cand', 'кандидаты в члены') + leg('ex', 'бывшие и исключённые') + leg('no', 'беспартийные') + leg('other', 'другие партии и нет сведений') +
        '<p class="quiet">Сто квадратов — все ' + fmt(P.length) + ' человек на карте. На карте горят дома членов ВКП(б).</p>', 'scene', 'party') +
      (kremlin.length ? sec('<p>Не помогала и близость к власти. ' + foe('Враги') + ' жили прямо в Кремле.</p><p>Но это не те, о ком ты подумал.</p>' +
        '<p>' + ppl(kremlin.length)[0].toUpperCase() + ppl(kremlin.length).slice(1) + '. ' + krGuard + ' из них служили в комендатуре и охране Кремля.</p>' +
        kremlin.slice(0, 5).map(brief).join('') + (kremlin.length > 5 ? '<p class="quiet">И ещё ' + (kremlin.length - 5) + '. Нажми на точку, чтобы увидеть всех.</p>' : '') +
        (krTwo ? '<p>' + krTwo[1] + ' из них расстреляны за два дня: ' + (krTwo[0] % 100) + ' и ' + dayText(krTwo[0] + 1) + '.</p>' : ''), 'scene', 'kremlin') : '') +
      sec('<p>А больше всего ' + foe('врагов') + ' жило в домах, которые строили и отводили для своих: правительства, наркоматов, армии, Коминтерна.</p>' +
        bigHouses.slice(0, 5).map(m => '<p class="line"><b>' + fmt(m.n) + ' — ' + esc(m.note.title) + '</b><br>' + esc(houseText(m.addr)) + '</p>').join('') +
        '<p>На карте — ' + bigHouses.length + ' таких ' + plural(bigHouses.length, 'дом', 'дома', 'домов') + '. Из них вместе — ' + ppl(bigHouses.reduce((a, m) => a + m.n, 0)) + '.</p>' +
        '<p class="quiet">Среди них — дома бывших политкаторжан и дом иностранных специалистов. О каждом есть справка с источниками: нажми на дом.</p>', 'scene', 'house') +
      // сколько: целый дом, целая улица
      sec('<p>На некоторых улицах ' + foe('враги') + ' жили почти в каждом доме.</p>' +
        '<p><b>' + esc(street.name.replace(/\.$/, '')) + '.</b> Номера домов здесь идут до ' + Math.max(...street.nums) + '. Расстрелянные жили в домах под ' + street.nums.size + ' из них.</p>' +
        '<p>Всего с этой улицы — ' + ppl(street.n) + '.</p><p class="quiet">Сколько домов стояло на улице в те годы, в данных нет. На горящие дома можно нажать.</p>', 'scene', 'street');
    box.className = 'tale';
    box.innerHTML =
      // ---------- что тогда происходило (черновик, факты не сверены) ----------
      sec('<p class="where">Москва, 1930-е годы</p><p>Страной единолично правит Сталин.</p>' +
        '<p>Власть ищет <b class="foe">врагов</b>. Врагом могут объявить за происхождение, за национальность, за неосторожное слово, по доносу соседа. Или просто потому, что нужно выполнить план.</p>' +
        '<p class="cue">Листай вниз ↓</p>' +
        '<p class="draft">Черновик. Исторические сведения в этом тексте не сверены с источниками.</p>', 'first') +
      // ---------- весь город ----------
      sec('<p>Это карта одного города.</p><div class="big white" data-n>0</div><p data-l>человек</p>' +
        '<p class="quiet">Каждая точка — дом, где жил расстрелянный. Имена и адреса собрал «Мемориал».</p>', 'city') +
      sceneHtml +
      sec('<p>Дальше со всеми происходило одно и то же.</p><p>Арестованного держат в тюрьме: на Лубянке, в Бутырской, Лефортовской, Таганской.</p>' +
        '<p>Суда нет. Дело решают без него самого, без защитника, без права обжаловать: заочно — «тройка» из трёх человек, или за несколько минут — Военная коллегия на Никольской, 23.</p>' +
        '<p class="quiet">На карте — тюрьмы и дом Военной коллегии.</p>', 'scene', 'jail') +
      sec('<p>Приговор — расстрел.</p><p>Его исполняют в ближайшие дни. Семье ничего не сообщают.</p>' +
        '<p>Расстреливают за городом, в Бутове и Коммунарке, и в самой Москве. Тела расстрелянных в городе сжигают в крематории на Донском кладбище.</p>' +
        '<p class="quiet">Линии идут от домов к местам захоронения, которые записаны в базе: ' + graveList.map(k => esc(k) + ' — ' + fmt(inGrave[k])).join(', ') + '.</p>', 'scene', 'shoot') +
      // ---------- посетитель: возраст ----------
      // «Врагом мог стать и ты» — слова Ильи
      sec('<p><b class="foe">Врагом</b> мог оказаться кто угодно: инженер, учитель, рабочий, студент.</p><p><b class="foe">Врагом</b> мог стать и ты.</p>' +
        '<label class="q" for="s-age">Сколько тебе лет?</label><input id="s-age" type="number" inputmode="numeric" min="1" max="120" autocomplete="off"><div class="ans"></div>', 'ask age') +
      // ---------- посетитель: занятие ----------
      sec('<div class="q">Кем ты работаешь?</div><div class="chips">' + JOBS.map((j, k) => '<button data-k="' + k + '">' + j[0] + '</button>').join('') + '</div><div class="ans"></div>', 'ask job') +
      // ---------- финал: таблички ----------
      sec('', 'ask fin');
    const $ = s => box.querySelector(s);
    const city = $('.city'), ageS = $('.age'), jobS = $('.job'), finS = $('.fin'), steps = [...box.querySelectorAll('.step')];

    // ---------- карта под лентой ----------
    veil.classList.add('clear', 'pass');
    HANDLERS.forEach(h => map[h] && map[h].disable()); // колёсико листает ленту, а не приближает карту
    // Мышью карту можно двигать и приближать (перетаскивание, двойной щелчок, кнопки + и −): на следующем слайде
    // камера сама вернётся куда нужно. На телефоне палец листает ленту, поэтому там карта неподвижна.
    const canMove = window.matchMedia('(pointer: fine)').matches;
    if (canMove) { map.dragging.enable(); map.doubleClickZoom.enable(); }
    document.body.classList.toggle('story-move', canMove);
    map.closePopup();
    // город — чуть правее середины экрана, слева от него идёт текст (на телефоне — посередине)
    const z = wide() ? 12 : 11, shift = wide() ? 0.1 : 0;
    map.setView(map.unproject(map.project(CITY, z).subtract([map.getSize().x * shift, 0]), z), z, { animate: false });
    const cityView = [map.getCenter(), z];
    // вид для сцены: её дома — в свободной от текста части экрана (справа; на телефоне — сверху)
    const viewOf = sc => {
      const size = map.getSize(), b = L.latLngBounds(sc.pts || sc.list.map(m => m.getLatLng()));
      const tl = L.point(wide() ? Math.min(540, size.x * 0.46) : 24, 70), br = L.point(wide() ? 50 : 24, wide() ? 60 : size.y * 0.5);
      const zz = Math.max(map.getMinZoom(), Math.min(sc.zoom, map.getBoundsZoom(b, false, tl.add(br))));
      return [map.unproject(map.project(b.getCenter(), zz).subtract(tl.subtract(br).divideBy(2)), zz), zz];
    };
    let viewKey = 'city';
    // посетитель сам сдвинул или приблизил карту — на следующем слайде камера возвращается, даже если вид тот же
    let userMoved = false, inFlight = false, lastAct = null;
    const onUserMove = () => { if (!inFlight) userMoved = true; };
    map.on('dragend zoomend', onUserMove);
    // дополнения сцены: подписанные места, которых нет в базе, и линии от домов к местам захоронения
    let extraOf = null, extraLayers = [];
    const extras = sc => {
      if (extraOf === sc) return;
      extraOf = sc;
      extraLayers.forEach(l => map.removeLayer(l)); extraLayers = [];
      if (!sc) return;
      if (sc.lines) extraLayers.push(L.polyline(sc.lines, { renderer: map.getRenderer(dots[0]), interactive: false, color: '#ff3b2f', weight: 1, opacity: 0.035 }).addTo(map));
      (sc.places || []).forEach(([lat, lon, label]) => extraLayers.push(L.marker([lat, lon], { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'place', iconSize: [0, 0], html: '<i></i><span>' + esc(label) + '</span>' }) }).addTo(map)));
    };
    const order = dots.slice().sort((a, b) => L.latLng(CITY).distanceTo(a.getLatLng()) - L.latLng(CITY).distanceTo(b.getLatLng()));
    const nEl = city.querySelector('[data-n]'), lEl = city.querySelector('[data-l]');

    const S = { same: null, rows: null, ver: 0 }; // ответы: ровесники; люди, подошедшие и по занятию; номер ответа
    let key = '', litN = 0, people = 0, queued = false;
    // rows — люди, подошедшие под ответы: в окне дома выделены только они; без rows выделены все жильцы
    // Набор горящих домов меняется не скачком: слой с домами гаснет, набор подменяется, слой проявляется.
    // Вместе с домами так же появляются и исчезают линии к местам захоронения (они нарисованы на том же слое).
    const dotPane = map.getPane('overlayPane');
    dotPane.style.transition = 'opacity .28s ease';
    let fadeT = 0, wantX = null; // wantX — дополнения сцены, которые нужно показать вместе с её домами
    const setLit = (k, list, rows) => {
      if (key === k) return;
      key = k; map.closePopup();
      clearTimeout(fadeT);
      dotPane.style.opacity = 0;
      fadeT = setTimeout(() => {
        story = { lit: new Set(list), big: list.length <= 400, match: rows ? new Set(rows.map(x => x.p)) : null };
        redrawDots();
        extras(wantX);
        dotPane.style.opacity = 1;
      }, 290);
    };
    const ageState = () => S.same ? setLit('age' + S.ver, housesOf(S.same), S.same) : setLit('all', dots, null);
    const jobState = () => S.rows ? setLit('job' + S.ver, housesOf(S.rows), S.rows) : ageState();
    const update = () => {
      queued = false;
      if (!story) return; // вступление пропущено
      const vh = box.clientHeight, top = el => el.getBoundingClientRect().top, mark = vh * 0.6;
      // какая карточка сейчас главная: последняя, чей верх поднялся выше 60 % высоты экрана
      let act = steps[0];
      for (const el of steps) { if (top(el) < mark) act = el; else break; }
      const sc = scenes[act.dataset.scene];
      wantX = sc || null;
      // камера: к сцене — перелёт к её домам, иначе — вид на весь город
      const vk = sc && !sc.city ? act.dataset.scene : 'city';
      if (vk !== viewKey || (userMoved && act !== lastAct)) {
        viewKey = vk; userMoved = false;
        const v = vk === 'city' ? cityView : viewOf(sc);
        inFlight = true;
        flyCamera(v[0], v[1], { done: () => { setTimeout(() => { inFlight = false; }, 50); } });
      }
      lastAct = act;
      if (sc) return setLit('scene:' + act.dataset.scene, sc.list, sc.rows);
      if (top(finS) < mark) return setLit('all', dots, null);
      if (top(jobS) < mark) return jobState();
      if (top(ageS) < mark) return ageState();
      // «карта одного города»: дома загораются от центра к окраинам, пока карточка входит в экран; назад — гаснут
      const q = Math.max(0, Math.min(1, (vh * 0.75 - top(city)) / (vh * 0.45))), want = Math.round(q * q * order.length);
      if (key !== 'grow') {
        key = 'grow'; map.closePopup();
        clearTimeout(fadeT); wantX = null; extras(null); dotPane.style.opacity = 1; // здесь дома загораются сами, по прокрутке
        story = { lit: new Set(order.slice(0, want)), big: false, match: null };
        litN = want; people = order.slice(0, want).reduce((sum, m) => sum + m.n, 0);
        redrawDots();
      }
      for (; litN < want; litN++) { const m = order[litN]; story.lit.add(m); people += m.n; m.options.interactive = true; m.setStyle(storyStyle(m)); }
      for (; litN > want; litN--) { const m = order[litN - 1]; story.lit.delete(m); people -= m.n; m.options.interactive = false; m.setStyle(storyStyle(m)); }
      nEl.textContent = fmt(people);
      lEl.textContent = plural(people, 'человек', 'человека', 'человек') + (litN === order.length ? ' · ' + fmt(order.length) + ' ' + plural(order.length, 'дом', 'дома', 'домов') : '');
    };
    // пересчёт — на ближайшем кадре; если кадров нет (вкладка в фоне), то по таймеру
    const ask = () => { if (queued) return; queued = true; requestAnimationFrame(() => { if (queued) update(); }); setTimeout(() => { if (queued) update(); }, 150); };
    box.addEventListener('scroll', ask, { passive: true });
    // Лента пропускает нажатия к карте (кроме самих карточек), поэтому колёсико ведёт этот код, а не браузер:
    // так прокрутка одинаково плавная над текстом и над картой. Палец над картой тоже листает ленту.
    const popup = e => e.target.closest && e.target.closest('.leaflet-popup');
    let target = 0, moving = false, last = 0, put = 0; // put — куда ленту поставил этот код в прошлый раз
    const glide = now => { // лента догоняет цель; скорость считается по времени, а не по кадрам
      const d = target - box.scrollTop, k = 1 - Math.exp(-Math.min(200, now - last) / 80);
      last = now;
      if (!moving) return; // прокрутку перехватили (палец, клавиши)
      if (Math.abs(d) < 0.6) { box.scrollTop = target; moving = false; return; }
      box.scrollTop += Math.abs(d * k) < 1 ? Math.sign(d) * Math.min(1, Math.abs(d)) : d * k; // не меньше пикселя за кадр, иначе застрянет на округлении
      put = box.scrollTop;
      requestAnimationFrame(glide);
    };
    // ленту сдвинул кто-то другой (палец, клавиши) — плавное движение прекращается, цель — там, где лента сейчас
    box.addEventListener('scroll', () => { if (moving && Math.abs(box.scrollTop - put) > 3) moving = false; if (!moving) target = box.scrollTop; }, { passive: true });
    const onWheel = e => {
      if (popup(e)) return; // длинный список в окне дома листается сам
      e.preventDefault();
      target = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, target + (e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY)));
      if (!moving) { moving = true; put = box.scrollTop; last = performance.now(); requestAnimationFrame(glide); }
    };
    let touchY = null;
    const onTouchStart = e => { moving = false; target = box.scrollTop; touchY = !box.contains(e.target) && !popup(e) ? e.touches[0].clientY : null; };
    const onTouchMove = e => { if (touchY === null) return; const y = e.touches[0].clientY; box.scrollTop += touchY - y; touchY = y; };
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('resize', ask);
    unhook = () => {
      document.removeEventListener('wheel', onWheel); document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove); window.removeEventListener('resize', ask);
    };

    // ---------- возраст ----------
    const ageIn = $('#s-age'), ageAns = ageS.querySelector('.ans');
    let ageTimer = 0, job = null;
    const answerAge = () => {
      const v = Math.round(+ageIn.value);
      if (!v || v < 1 || v > 120) return;
      S.same = P.filter(x => x.age === v); S.ver++;
      const n = S.same.length;
      // когда: годы расстрелов этих людей и сколько из них пришлось на 1937–1938
      const ys = S.same.map(x => yearOf(x.p[3])), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const peak = ys.filter(y => y === 1937 || y === 1938).length;
      ageAns.innerHTML = n
        ? '<div class="big">' + fmt(n) + '</div><p>' + plural(n, 'человек', 'человека', 'человек') + ' ' + shotVerb(n) + ' в твоём возрасте — в ' + v + ' ' + plural(v, 'год', 'года', 'лет') + '.</p>' +
          '<p>' + (y0 === y1 ? plural(n, 'Расстрелян', 'Расстреляны', 'Расстреляны') + ' в ' + y0 + ' году.'
            : 'Их расстреливали с ' + y0 + ' по ' + y1 + ' год' + (peak ? ', ' + (peak === n ? 'всех' : fmt(peak)) + ' — в 1937 и 1938' : '') + '.') + '</p>' +
          '<p class="quiet">На карте остались их дома, на них можно нажать. Возраст посчитан по году рождения, с точностью до года.</p>'
        : '<p>Среди расстрелянных нет твоих ровесников.</p><p class="quiet">Самому младшему было ' + ageMin + ', самому старшему — ' + ageMax + '.</p>';
      if (job) answerJob(); else update();
    };
    ageIn.oninput = () => { clearTimeout(ageTimer); ageTimer = setTimeout(answerAge, 700); };
    ageIn.onkeydown = e => { if (e.key === 'Enter') { clearTimeout(ageTimer); answerAge(); ageIn.blur(); } };

    // ---------- занятие ----------
    const jobAns = jobS.querySelector('.ans'), chips = [...jobS.querySelectorAll('.chips button')];
    chips.forEach(b => {
      b.onclick = () => {
        const j = JOBS[+b.dataset.k];
        chips.forEach(c => c.classList.toggle('on', c === b));
        job = { many: j[1], test: x => j[2].test(x.job) };
        answerJob();
      };
    });
    function answerJob() {
      const all = P.filter(job.test), mine = S.same ? S.same.filter(job.test) : [];
      const rows = mine.length ? mine : all, one = rows.length ? best(rows) : null;
      S.rows = rows.length ? rows : null; S.ver++;
      jobAns.innerHTML = (mine.length ? '<div class="big">' + fmt(mine.length) + '</div><p>из твоих ровесников занимались тем же, что и ты.</p>'
        : !all.length ? '<p>В базе таких нет.</p>'
        : S.same ? '<p>Твоих ровесников среди них нет. Но тем же, что и ты, занимались ' + fmt(all.length) + ' расстрелянных.</p>'
        : '<div class="big">' + fmt(all.length) + '</div><p>' + plural(all.length, 'расстрелянный занимался', 'расстрелянных занимались', 'расстрелянных занимались') + ' тем же, что и ты.</p>') +
        (all.length ? '<p class="quiet">' + job.many[0].toUpperCase() + job.many.slice(1) + (mine.length ? '. Всех возрастов — ' + fmt(all.length) : '') +
          '. Подсчёт грубый: по словам в описании человека.</p>' : '') +
        (one ? '<p class="lead">Один из них:</p>' + person(one) : '');
      update();
    }

    // ---------- финал: таблички «Последнего адреса» ----------
    // У кого из людей на карте они есть — data/last_address.json (собирает scripts/build_last_address.py по таблице
    // на сайте проекта; способ сопоставления описан там). Если файл не загрузился, финал обходится без строк о табличках.
    // Текст утверждён Ильёй 2026-11-20. «Любой человек, не только родственник» — из инструкции проекта:
    // https://www.poslednyadres.ru/zayavka/ (туда же ведёт ссылка).
    const fin = plaques => {
      // Коротко (просил Илья 2026-11-21): есть табличка — нет таблички — поставь. Оговорка о том, кого нет на карте, — мелкой строкой.
      finS.querySelector('.card').innerHTML = (plaques
        ? '<p class="cta">У ' + fmt(plaques) + ' расстрелянных на доме есть табличка «Последнего адреса».</p>' +
          '<p class="cta">У ' + fmt(P.length - plaques) + ' — нет.</p>' +
          '<p class="cta">Поставить её может любой.</p>'
        : '<p class="cta">На карте ' + fmt(P.length) + ' расстрелянных.</p>') +
        '<div class="go">' + (plaques ? '<a class="btn" href="https://www.poslednyadres.ru/zayavka/" target="_blank" rel="noopener">Как поставить табличку</a>' : '') +
        '<button>Смотреть карту</button></div>' +
        '<p class="quiet note">На карте только Москва и только те, чей адрес известен. Данные: «Мемориал», база «Расстрелы в Москве»' + (plaques ? '; таблички — сайт «Последнего адреса», 20.11.2026' : '') + '.</p>';
      finS.querySelector('button').onclick = finish;
    };
    fin(0);
    fetch('data/last_address.json').then(r => r.json()).then(d => {
      const set = new Set(d.people);
      fin(P.filter(x => set.has(x.p[1] + '|' + (x.p[2] || ''))).length);
    }).catch(() => {});

    story = { lit: new Set(), big: false, match: null }; redrawDots(); // в начале все дома погашены
    box.scrollTop = 0;
    update();
  };
  if (window.storyData) window.startStory(); // данные загрузились раньше этого файла
})();
