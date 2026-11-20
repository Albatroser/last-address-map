// Вступление перед свободной картой — «зеркало»: посетитель отвечает на два вопроса о себе
// (возраст, занятие), и после каждого ответа карта показывает расстрелянных с такими же данными.
// Третий вопрос, «Где ты живёшь?», убран по решению Ильи (2026-11-20) как лишний.
// Кнопок «Дальше» нет: следующий вопрос появляется после ответа. В конце — весь город, оговорки, свободная карта.
// Все числа считаются из data/moscow_points.json (их загружает map.js); тексты о людях — только поля базы.
// Проверка: ?map открывает карту сразу, без вступления.
(function () {
  const params = new URLSearchParams(location.search);
  const veil = document.getElementById('story-veil'), box = document.getElementById('story'), skip = document.getElementById('story-skip');
  function finish() { // вступление снято, карта свободна
    story = null;
    dots.forEach(m => { m.options.interactive = true; });
    document.body.classList.remove('story-on');
    [veil, box, skip].forEach(el => el.remove());
    redrawDots();
  }
  if (params.has('map') || params.has('min')) { finish(); return; }
  skip.onclick = finish;

  // Всего людей в базе «Расстрелы в Москве» (data/moscow/persons.csv, число из README.md).
  // На карте только те, у чьих домов есть координаты; разница показывается на последнем экране.
  const TOTAL_IN_BASE = 11789;
  const CITY = [55.7539, 37.6208];
  const fmt = n => n.toLocaleString('ru');
  const people = n => fmt(n) + ' ' + plural(n, 'человек', 'человека', 'человек');
  const homes = n => fmt(n) + ' ' + plural(n, 'дом', 'дома', 'домов');
  const shotVerb = n => plural(n, 'расстрелян', 'расстреляны', 'расстреляны');

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

  const wide = () => window.innerWidth >= 760;
  // вопросы занимают левую часть экрана (на телефоне — верхнюю); карту нужно показывать в оставшейся
  const PAD = () => wide() ? { paddingTopLeft: [box.offsetWidth + 30, 50], paddingBottomRight: [40, 40] }
    : { paddingTopLeft: [24, Math.min(box.offsetHeight, window.innerHeight * 0.62) + 20], paddingBottomRight: [24, 30] };
  // rows — люди, подошедшие под ответы: в окне дома выделены только они; без rows выделены все жильцы
  const light = (list, rows) => { map.closePopup(); story = { lit: new Set(list), big: list.length <= 400, match: rows ? new Set(rows.map(x => x.p)) : null }; redrawDots(); };
  // весь город в свободной от вопросов части экрана
  const cityView = () => {
    map.setView(CITY, wide() ? 12 : 11, { animate: false });
    const p = PAD().paddingTopLeft;
    map.panBy(wide() ? [-p[0] / 2, 0] : [0, -p[1] / 2], { animate: false });
  };
  const housesOf = rows => [...new Set(rows.map(x => x.m))];

  window.startStory = function () {
    // все люди на карте: дом, запись, возраст в год расстрела (по году рождения, точность — год), занятие
    const P = [];
    dots.forEach(m => m.ppl.forEach(p => {
      const y = yearOf(p[3]), born = +p[2];
      P.push({ m, p, age: y && born ? y - born : null, job: ' ' + norm(p[7] ? p[9] : p[5]) + ' ' });
    }));
    const ages = P.map(x => x.age).filter(a => a !== null && a > 0);
    const ageMin = Math.min(...ages), ageMax = Math.max(...ages);
    // запись, о которой в базе заполнено больше полей; при равенстве — первая по алфавиту
    const filled = p => [p[2], p[9], p[6], p[7], p[0]].filter(Boolean).length;
    const best = rows => rows.slice().sort((a, b) => filled(b.p) - filled(a.p) || a.p[1].localeCompare(b.p[1], 'ru'))[0];
    // Карточка человека: всё, что есть о нём в базе, без сокращений и добавлений.
    const card = x => {
      const [apt, name, born, shot, burial, bio, place, nat, party, job] = x.p;
      const row = (k, v) => v ? '<p class="row"><span>' + k + '</span>' + esc(v) + '</p>' : '';
      return '<div class="name">' + esc(name) + '</div>' +
        '<p>' + (born ? born + ' – ' : 'расстрел ') + esc(shot) + '</p>' +
        (nat ? '<p>' + esc(job) + '</p>' + row('Место рождения', place) + row('Национальность', nat) + row('Партийность', party)
          : '<p>' + esc(bio) + '</p>') +
        row('Адрес', x.m.addr + (apt ? ', кв. ' + apt : '')) + row('Захоронение', burial);
    };

    const S = { same: null, job: null, person: null }; // ответы: ровесники, занятие, показанный человек
    story = { lit: new Set(), big: true }; redrawDots();
    // Пока идут вопросы, карта живая: горящие дома можно нажимать, карту — двигать. Погашенные дома не нажимаются.
    veil.classList.add('clear', 'pass');
    box.className = 'panel'; box.innerHTML = '';
    // окно дома не должно оказаться под колонкой вопросов
    map.on('popupopen', e => setTimeout(() => {
      const el = story && box.className === 'panel' && e.popup.getElement(); if (!el) return;
      const note = el.querySelector('.note'), pb = (note && wide() ? note : el).getBoundingClientRect(), bb = box.getBoundingClientRect();
      if (wide()) { if (pb.left < bb.right + 10) map.panBy([pb.left - bb.right - 10, 0]); }
      else if (el.getBoundingClientRect().top < bb.bottom + 10) map.panBy([0, el.getBoundingClientRect().top - bb.bottom - 10]);
    }, 450));
    const block = html => {
      const d = document.createElement('div'); d.className = 'block'; d.innerHTML = html;
      box.appendChild(d);
      setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      return d;
    };

    // ---------- 0. Что это за карта ----------
    // Посетитель должен сразу понять, на что смотрит: это не уголовная хроника, а государственный террор.
    // Основания формулировок: годы — крайние годы расстрелов в данных; «политический террор в СССР» — так называется
    // база «Мемориала», из которой взяты люди («Жертвы политического террора в СССР», см. data/raw/README.md);
    // число — люди на карте. Описание базы на mos.memo.ru открыть не удалось, формулировки утверждает Илья.
    const allYears = P.map(x => yearOf(x.p[3])).filter(Boolean);
    block('<p class="where">Москва, ' + Math.min(...allYears) + '–' + Math.max(...allYears) + '</p>' +
      // Мысль Ильи (2026-11-20): государство убивало тех, кого считало врагами, и врагом мог оказаться любой.
      // Записана простыми фразами: прежний вариант Илья назвал претенциозным.
      '<p>В эти годы государство расстреливало людей, которых считало <b class="foe">врагами</b>.</p>' +
      '<p><b class="foe">Врагом</b> мог оказаться кто угодно: инженер, учитель, рабочий, студент.</p>' +
      '<p>На карте дома ' + fmt(P.length) + ' расстрелянных. Имена и адреса собрал «Мемориал».</p>' +
      '<p><b class="foe">Врагом</b> мог стать и ты.</p>'); // последняя фраза — слова Ильи

    // ---------- 1. Возраст ----------
    const a = block('<label class="q" for="s-age">Сколько тебе лет?</label><input id="s-age" type="number" inputmode="numeric" min="1" max="120" autocomplete="off"><div class="ans"></div>');
    const ageIn = a.querySelector('input'), ageAns = a.querySelector('.ans');
    let ageTimer = 0, jobBlock = null;
    const answerAge = () => {
      const v = Math.round(+ageIn.value);
      if (!v || v < 1 || v > 120) return;
      S.same = P.filter(x => x.age === v);
      const n = S.same.length;
      // когда: годы расстрелов этих людей и сколько из них пришлось на 1937–1938
      const ys = S.same.map(x => yearOf(x.p[3])), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const peak = ys.filter(y => y === 1937 || y === 1938).length;
      ageAns.innerHTML = n
        ? '<div class="big">' + fmt(n) + '</div><p>' + plural(n, 'человек', 'человека', 'человек') + ' ' + shotVerb(n) + ' в твоём возрасте — в ' + v + ' ' + plural(v, 'год', 'года', 'лет') + '.</p>' +
          '<p>' + (y0 === y1 ? plural(n, 'Расстрелян', 'Расстреляны', 'Расстреляны') + ' в ' + y0 + ' году.'
            : 'Их расстреливали с ' + y0 + ' по ' + y1 + ' год' + (peak ? ', ' + (peak === n ? 'всех' : fmt(peak)) + ' — в 1937 и 1938' : '') + '.') + '</p>' +
          '<p class="quiet">На карте — их дома, на них можно нажать. Возраст посчитан по году рождения, с точностью до года.</p>'
        : '<p>Среди расстрелянных нет твоих ровесников.</p><p class="quiet">Самому младшему было ' + ageMin + ', самому старшему — ' + ageMax + '.</p>';
      if (S.job) answerJob(); // занятие уже выбрано — пересчитать под новый возраст
      else { light(housesOf(S.same), S.same); cityView(); }
      if (!jobBlock) askJob();
    };
    ageIn.oninput = () => { clearTimeout(ageTimer); ageTimer = setTimeout(answerAge, 700); };
    ageIn.onkeydown = e => { if (e.key === 'Enter') { clearTimeout(ageTimer); answerAge(); ageIn.blur(); } };
    cityView();
    if (wide()) ageIn.focus();

    // ---------- 2. Занятие ----------
    let jobAns = null;
    function askJob() {
      jobBlock = block('<div class="q">Кем ты работаешь?</div><div class="chips">' +
        JOBS.map((j, k) => '<button data-k="' + k + '">' + j[0] + '</button>').join('') + '</div><div class="ans"></div>');
      jobAns = jobBlock.querySelector('.ans');
      const chips = [...jobBlock.querySelectorAll('.chips button')];
      chips.forEach(b => {
        b.onclick = () => {
          const j = JOBS[+b.dataset.k];
          chips.forEach(c => c.classList.toggle('on', c === b));
          S.job = { many: j[1], test: x => j[2].test(x.job) };
          answerJob();
        };
      });
    }
    function answerJob() {
      const all = P.filter(S.job.test), mine = S.same.filter(S.job.test);
      const rows = mine.length ? mine : all;
      S.person = rows.length ? best(rows) : null;
      jobAns.innerHTML = (mine.length
        ? '<div class="big">' + fmt(mine.length) + '</div><p>из них занимались тем же, что и ты.</p>'
        : all.length ? '<p>Твоих ровесников среди них нет. Но тем же, что и ты, занимались ' + fmt(all.length) + ' расстрелянных.</p>' : '<p>В базе таких нет.</p>') +
        (all.length ? '<p class="quiet">' + S.job.many[0].toUpperCase() + S.job.many.slice(1) + (mine.length ? '. Всех возрастов — ' + fmt(all.length) : '') +
          '. Подсчёт грубый: по словам в описании человека.</p>' : '') +
        (S.person ? '<p class="lead">' + 'Один из них:' + '</p>' + card(S.person) : '');
      light(housesOf(rows.length ? rows : S.same), rows.length ? rows : S.same);
      cityView();
      const b = document.createElement('button'); b.textContent = 'Показать всех'; b.onclick = pullBack;
      jobAns.appendChild(b);
    }

    // ---------- 3. Весь город: остальные дома загораются, счётчик растёт; если посетитель приблизил карту, камера сначала плавно отходит ----------
    function pullBack() {
      const z0 = map.getZoom(), to = L.latLng(CITY), z1 = wide() ? 12 : 11;
      map.closePopup(); veil.classList.remove('pass'); // отъезд идёт сам, карту в это время трогать нельзя
      story.big = false; story.match = null; redrawDots();
      box.className = 'sheet';
      box.innerHTML = '<div><div class="big" id="story-n">0</div><p id="story-t">человек</p><button disabled>Дальше</button></div>';
      const b = box.querySelector('button'), num = document.getElementById('story-n');
      b.onclick = caveats;
      let sum = 0; story.lit.forEach(m => { sum += m.n; });
      num.textContent = fmt(sum);
      const add = m => { if (story.lit.has(m)) return; story.lit.add(m); sum += m.n; m.setStyle(storyStyle(m)); };
      const done = () => {
        document.getElementById('story-t').textContent = plural(sum, 'человек', 'человека', 'человек') + ' · ' + homes(dots.length);
        b.disabled = false;
      };
      // Плавный отъезд. Сам по себе Leaflet во время полёта не перерисовывает холст, а сжимает готовую картинку,
      // поэтому камерой управляет этот код, и на каждом кадре всё рисуется заново:
      // - точки — штатным холстом Leaflet (быстро, около 6 мс);
      // - подложка так не успевает (перепроецировать 187 тысяч точек улиц — около 80 мс, а растрировать их одной
      //   линией на каждом кадре не успевает видеокарта), поэтому её холст на время полёта гаснет, а крупные улицы
      //   заранее рисуются в несколько картинок, по одной на каждый шаг масштаба, и в полёте только масштабируются.
      // Дома и мелкие улицы на время полёта пропадают: при отдалении дальше масштаба 15 они пропали бы и так.
      const dotR = map.getRenderer(dots[0]), baseCanvas = baseR._container, size = map.getSize();
      const tail = () => { // дома за краями кадра загораются последними, от центра к окраинам
        if (!story) return; // вступление пропущено
        redrawDots();
        const rest = dots.filter(m => !story.lit.has(m)).sort((x, y) => to.distanceTo(x.getLatLng()) - to.distanceTo(y.getLatLng()));
        if (!rest.length) return done();
        const chunk = Math.ceil(rest.length / 30);
        let i = 0;
        const timer = setInterval(() => {
          if (!story) return clearInterval(timer);
          rest.slice(i, i + chunk).forEach(add);
          i += chunk;
          num.textContent = fmt(sum);
          if (i >= rest.length) { clearInterval(timer); done(); }
        }, 45);
      };
      if (z0 - z1 < 0.5) { map.setView(to, z1, { animate: false }); return tail(); } // отъезжать некуда

      // Камера отдаляется вокруг одной неподвижной точки экрана: так вид в начале полёта — нынешний, в конце — весь город.
      const s = Math.pow(2, z1 - z0), c0 = map.project(map.getCenter(), z0), c1 = map.project(to, z1);
      const anchor = c0.multiplyBy(s).subtract(c1).divideBy(1 - s); // смещение неподвижной точки от центра экрана, px
      const A0 = c0.add(anchor); // она же в пикселях мира на масштабе z0
      const centerAt = Z => A0.multiplyBy(Math.pow(2, Z - z0)).subtract(anchor); // центр экрана в пикселях мира на масштабе Z

      // Улицы одной линией, в пикселях масштаба 12 относительно центра города.
      const C12 = map.project(to, 12), path = new Path2D();
      base.roadLines.forEach(r => {
        let lx = 0, ly = 0;
        r.pts.forEach((p, i) => {
          const q = map.project(p, 12), x = q.x - C12.x, y = q.y - C12.y;
          if (!i) path.moveTo(x, y);
          else if (i < r.pts.length - 1 && Math.abs(x - lx) + Math.abs(y - ly) < 0.4) return; // точки ближе 0,4 px пропускаются
          else path.lineTo(x, y);
          lx = x; ly = y;
        });
      });
      // Картинка для шага z покрывает всё, что видно при масштабах от z до z+1, и нарисована с разрешением масштаба z+1.
      const mppAt = z => 156543.03 * Math.cos(to.lat * Math.PI / 180) / Math.pow(2, z);
      const levels = {};
      for (let z = z1; z < z0; z++) {
        const hi = Math.min(z + 1, z0), half = size.divideBy(2), k = Math.pow(2, z + 1 - 12);
        const rect = Z => { const c = centerAt(Z), f = Math.pow(2, z + 1 - Z); return [c.subtract(half).multiplyBy(f), c.add(half).multiplyBy(f)]; };
        const a = rect(z), b = rect(hi);
        const min = L.point(Math.min(a[0].x, b[0].x), Math.min(a[0].y, b[0].y)), max = L.point(Math.max(a[1].x, b[1].x), Math.max(a[1].y, b[1].y));
        const r = Math.min(1, 4096 / Math.max(max.x - min.x, max.y - min.y)); // не больше 4096 px по стороне
        const c = document.createElement('canvas'), g = c.getContext('2d');
        c.width = Math.ceil((max.x - min.x) * r); c.height = Math.ceil((max.y - min.y) * r);
        g.setTransform(k * r, 0, 0, k * r, (C12.x * k - min.x) * r, (C12.y * k - min.y) * r);
        g.lineWidth = 2 * Math.max(1.4, STYLE.width.a / mppAt(z)) / k; // на масштабе z улица той же ширины, что в подложке
        g.strokeStyle = STYLE.roadFar; g.lineCap = g.lineJoin = 'round';
        g.stroke(path);
        levels[z] = { c, min, r };
      }
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = size.x * dpr; cv.height = size.y * dpr;
      cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;pointer-events:none';
      map.getContainer().insertBefore(cv, map.getContainer().firstChild);
      const drawRoads = Z => {
        const z = Math.max(z1, Math.min(Math.ceil(z0) - 1, Math.floor(Z))), lv = levels[z];
        const f = Math.pow(2, Z - (z + 1)), tl = centerAt(Z).subtract(size.divideBy(2)); // левый верхний угол экрана в пикселях мира
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size.x, size.y);
        ctx.drawImage(lv.c, lv.min.x * f - tl.x, lv.min.y * f - tl.y, lv.c.width * f / lv.r, lv.c.height * f / lv.r);
      };
      const frame = Z => {
        if (story) {
          const view = map.getBounds();
          dots.forEach(m => {
            if (!story.lit.has(m)) { if (!view.contains(m.getLatLng())) return; story.lit.add(m); sum += m.n; }
            const st = storyStyle(m);
            m._radius = st.radius; // без setStyle: он просит перерисовку на каждую точку, а холст и так рисуется целиком
            Object.assign(m.options, st);
          });
          num.textContent = fmt(sum);
        }
        dotR._postponeUpdatePaths = true; dotR._reset();
        drawRoads(Z);
      };
      drawRoads(z0);
      baseCanvas.style.transition = 'opacity .4s'; baseCanvas.style.opacity = 0;
      const T = Math.max(2500, Math.min(6000, (z0 - z1) * 1100));
      let t0 = 0;
      map._moveStart(true, false); // дальше — то же, что делает flyTo: вид меняется без перерисовки подложки
      const step = now => {
        if (!t0) t0 = now;
        const t = Math.min(1, (now - t0) / T), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // плавный разгон и остановка
        const Z = z0 + (z1 - z0) * e;
        map._move(map.unproject(centerAt(Z), Z), Z, { flyTo: true });
        frame(Z);
        if (t < 1) return requestAnimationFrame(step);
        map._move(to, z1)._moveEnd(true);
        // Leaflet перерисовал подложку под новый вид: она возвращается, временный холст убирается
        baseCanvas.style.transition = 'opacity .3s'; baseCanvas.style.opacity = 1;
        setTimeout(() => { cv.remove(); baseCanvas.style.transition = ''; }, 350);
        tail();
      };
      // два кадра паузы: картинки улиц успевают нарисоваться до начала движения
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(step)));
    }

    // ---------- 4. Оговорки ----------
    function caveats() {
      veil.style.transitionDuration = ''; veil.classList.remove('clear'); veil.classList.add('dim');
      box.className = 'center';
      box.innerHTML = '<div><p>На карте ' + people(P.length) + '. Это не все.</p>' +
        '<p>Здесь только расстрелянные, только в Москве и только те, чей адрес известен. Ещё ' + people(TOTAL_IN_BASE - P.length) +
        ' из той же базы на карту не попали: их адреса не удалось найти.</p>' +
        '<p class="quiet">Данные: «Мемориал», база «Расстрелы в Москве».</p><button>Смотреть карту</button></div>';
      box.querySelector('button').onclick = finish;
    }
  };
  if (window.storyData) window.startStory(); // данные загрузились раньше этого файла
})();
