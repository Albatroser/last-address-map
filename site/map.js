// Карта: дома Москвы, жильцы которых были расстреляны. Данные людей: data/moscow_points.json.
// Подложка своя, без тайлов: контуры домов и улицы OpenStreetMap, нарезанные на клетки (data/base/,
// собирает scripts/build_basemap.py). Крупные улицы видны всегда, дома и остальные улицы — с масштаба 15.
const map = L.map('map', { renderer: L.canvas({ tolerance: 6, padding: 0.3 }), maxZoom: 19, minZoom: 10 }).setView([55.7539, 37.6208], 12);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------- подложка ----------
const DETAIL_ZOOM = 15, LABEL_ZOOM = 16, KEEP_CELLS = 60;
const STYLE = {
  building: { color: '#24262b', fillColor: '#1b1d21', fillOpacity: 1, weight: 0.6 },
  street: '#0a0b0c',   // улицы темнее фона: кварталы читаются как светлые острова
  road: '#07080a',     // крупные улицы вблизи, среди домов
  roadFar: '#282b31',  // они же издалека, когда домов нет: светлее фона, иначе не видны
  width: { a: 20, b: 9, p: 12 }, // условная ширина улиц в метрах
};
map.createPane('base').style.zIndex = 250;
const baseR = L.canvas({ pane: 'base', padding: 0.3 });
const labelPane = map.createPane('labels');
labelPane.style.zIndex = 450; labelPane.style.pointerEvents = 'none';

const mpp = () => 156543.03 * Math.cos(map.getCenter().lat * Math.PI / 180) / Math.pow(2, map.getZoom());
const px = k => Math.max(k === 'a' ? 1.4 : 1, STYLE.width[k] / mpp());
// плоский список целых (первая точка от угла o, дальше приращения, единица 1e-5°) → [[lat, lon], ...]
function decode(flat, o) {
  const out = []; let a = Math.round(o[0] * 1e5), b = Math.round(o[1] * 1e5);
  for (let i = 0; i < flat.length; i += 2) { a += flat[i]; b += flat[i + 1]; out.push([a / 1e5, b / 1e5]); }
  return out;
}

const base = { index: null, cells: new Map(), roads: null, roadLines: [], want: new Set() };
const line = (rings, k) => L.polyline(rings, { renderer: baseR, interactive: false, color: k === 'a' ? STYLE.road : STYLE.street, weight: px(k), lineCap: 'round', lineJoin: 'round' });

function loadCell(id) {
  const c = { id, used: 0, layers: null, streets: [], state: 'loading' };
  base.cells.set(id, c);
  fetch('data/base/' + id + '.json').then(r => r.json()).then(t => {
    const s = { b: [], p: [] };
    t.s.forEach(([k, name, flat]) => { const pts = decode(flat, t.o); s[k].push(pts); if (name) c.streets.push({ name, pts }); });
    c.layers = [];
    if (s.b.length) c.layers.push(['b', line(s.b, 'b')]);
    if (s.p.length) c.layers.push(['p', line(s.p, 'p')]);
    if (t.b.length) c.layers.push(['h', L.polygon(t.b.map(f => decode(f, t.o)), Object.assign({ renderer: baseR, interactive: false }, STYLE.building))]);
    c.state = 'ready';
    refreshBase();
  }).catch(() => { c.state = 'failed'; });
}

function refreshBase() {
  if (!base.index) return;
  const detail = map.getZoom() >= DETAIL_ZOOM, want = new Set();
  if (detail) {
    const b = map.getBounds(), { cl, co } = base.index;
    for (let a = Math.floor(b.getSouth() / cl + 1e-9); a <= Math.floor(b.getNorth() / cl + 1e-9); a++)
      for (let o = Math.floor(b.getWest() / co + 1e-9); o <= Math.floor(b.getEast() / co + 1e-9); o++)
        if (base.index.set.has(a + '_' + o)) want.add(a + '_' + o);
  }
  base.want = want;
  const now = Date.now();
  want.forEach(id => { const c = base.cells.get(id); if (!c) loadCell(id); else c.used = now; });
  base.cells.forEach(c => {
    if (c.state !== 'ready') return;
    const on = want.has(c.id);
    c.layers.forEach(([, l]) => { if (on && !map.hasLayer(l)) l.addTo(map); if (!on && map.hasLayer(l)) map.removeLayer(l); });
  });
  if (base.cells.size > KEEP_CELLS) { // давно не нужные клетки выбрасываются из памяти
    [...base.cells.values()].filter(c => c.state === 'ready' && !want.has(c.id)).sort((x, y) => x.used - y.used)
      .slice(0, base.cells.size - KEEP_CELLS).forEach(c => base.cells.delete(c.id));
  }
  drawLabels();
}
function restyleBase() {
  if (base.roads) base.roads.setStyle({ weight: px('a'), color: map.getZoom() >= DETAIL_ZOOM ? STYLE.road : STYLE.roadFar });
  base.cells.forEach(c => c.layers && c.layers.forEach(([k, l]) => { if (k !== 'h') l.setStyle({ weight: px(k) }); }));
}

// ---------- подписи улиц: одна на улицу, посередине самой длинной непрерывной линии в кадре ----------
const short = n => n.replace(/переулок/i, 'пер.').replace(/улица/i, 'ул.').replace(/бульвар/i, 'б-р').replace(/площадь/i, 'пл.')
  .replace(/проезд/i, 'пр.').replace(/проспект/i, 'пр-т').replace(/набережная/i, 'наб.').replace(/шоссе/i, 'ш.')
  .replace(/Больш(ой|ая)/, 'Б.').replace(/Мал(ый|ая)/, 'М.').replace(/Средн(ий|яя)/, 'Ср.').trim();
const measure = document.createElement('canvas').getContext('2d');
const LABEL_FONT = '10px system-ui, sans-serif';
function drawLabels() {
  labelPane.textContent = '';
  if (map.getZoom() < LABEL_ZOOM) return;
  const view = map.getBounds().pad(0.2), by = {};
  const take = s => { if (s.pts.some(p => view.contains(p))) (by[s.name] = by[s.name] || []).push(s.pts.slice()); };
  base.want.forEach(id => { const c = base.cells.get(id); if (c && c.state === 'ready') c.streets.forEach(take); });
  base.roadLines.forEach(take);
  const key = p => p[0] + ',' + p[1], boxes = [], m = mpp();
  measure.font = LABEL_FONT;
  Object.keys(by).forEach(name => {
    const lines = by[name];
    let merged = true;
    while (merged) { // куски одной улицы склеиваются по общим концам
      merged = false;
      outer: for (let i = 0; i < lines.length; i++) for (let j = 0; j < lines.length; j++) {
        if (i === j) continue;
        const a = lines[i], b = lines[j];
        let c = null;
        if (key(a[a.length - 1]) === key(b[0])) c = a.concat(b.slice(1));
        else if (key(a[a.length - 1]) === key(b[b.length - 1])) c = a.concat(b.slice(0, -1).reverse());
        else if (key(a[0]) === key(b[0])) c = a.slice().reverse().concat(b.slice(1));
        if (c) { lines[i] = c; lines.splice(j, 1); merged = true; break outer; }
      }
    }
    const pts = lines.map(l => l.map(p => map.latLngToLayerPoint(p)));
    const len = l => { let s = 0; for (let i = 1; i < l.length; i++) s += l[i].distanceTo(l[i - 1]); return s; };
    const best = pts.map(l => [len(l), l]).sort((x, y) => y[0] - x[0])[0];
    const text = short(name), w = measure.measureText(text).width * 1.18 + 8; // капс и разрядка шире обычного набора
    if (best[0] < w * 0.9) return;
    let acc = 0; const l = best[1], half = best[0] / 2;
    for (let i = 1; i < l.length; i++) {
      const seg = l[i].distanceTo(l[i - 1]);
      if (acc + seg >= half) {
        const t = (half - acc) / (seg || 1), x = l[i - 1].x + (l[i].x - l[i - 1].x) * t, y = l[i - 1].y + (l[i].y - l[i - 1].y) * t;
        let ang = Math.atan2(l[i].y - l[i - 1].y, l[i].x - l[i - 1].x) * 180 / Math.PI;
        if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        const r = ang * Math.PI / 180, bw = Math.abs(w * Math.cos(r)) + Math.abs(12 * Math.sin(r)), bh = Math.abs(w * Math.sin(r)) + Math.abs(12 * Math.cos(r));
        const box = [x - bw / 2, y - bh / 2, bw, bh];
        if (boxes.some(b => box[0] < b[0] + b[2] + 2 && box[0] + box[2] + 2 > b[0] && box[1] < b[1] + b[3] + 2 && box[1] + box[3] + 2 > b[1])) return;
        boxes.push(box);
        const d = document.createElement('div');
        d.className = 'st'; d.textContent = text;
        d.style.cssText = 'left:' + (x - w / 2).toFixed(1) + 'px;top:' + (y - 6).toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;transform:rotate(' + ang.toFixed(1) + 'deg)';
        labelPane.appendChild(d);
        return;
      }
      acc += seg;
    }
  });
}

map.on('zoomstart', () => { labelPane.style.visibility = 'hidden'; });
map.on('zoomend', () => { labelPane.style.visibility = ''; restyleBase(); });
map.on('moveend', refreshBase);

Promise.all([fetch('data/base/index.json').then(r => r.json()), fetch('data/base/roads.json').then(r => r.json())]).then(([index, roads]) => {
  index.set = new Set(index.cells);
  base.index = index;
  base.roadLines = roads.map(([name, flat]) => ({ name, pts: decode(flat, [0, 0]) }));
  base.roads = line(base.roadLines.map(r => r.pts), 'a').addTo(map);
  restyleBase();
  map.attributionControl.addAttribution('Дома и улицы: ' + index.source + ', контуры современные');
  refreshBase();
}).catch(e => {
  say('Подложка не загрузилась: ' + e.message);
});

// ---------- источники и сообщения об ошибках ----------
map.attributionControl.setPrefix('');
map.attributionControl.addAttribution('Люди и адреса: «Мемориал», mos.memo.ru; координаты — Д. Скугаревский');
const search = document.getElementById('search');
function say(text) { const el = document.getElementById('msg'); el.textContent = text; el.hidden = false; }
// окно дома не должно оставаться под строкой поиска: после штатного сдвига карты проверяем и досдвигаем
map.on('popupopen', e => setTimeout(() => {
  const el = e.popup.getElement(); if (!el) return;
  const ib = search.getBoundingClientRect(), pb = el.getBoundingClientRect();
  if (pb.top < ib.bottom + 8 && pb.left < ib.right && pb.right > ib.left) map.panBy([0, pb.top - ib.bottom - 8]);
}, 350));

// ---------- точки и попап ----------
// Вблизи (масштаб 16 и крупнее) круг такой же, как в исходном дизайне: радиус 3 + √n · 2,2 px.
// Издалека круги сжимаются вдвое на каждые два шага масштаба и теряют обводку,
// чтобы центр города был виден как россыпь точек, а не как сплошное пятно.
const dots = [];
function dotStyle(n) {
  const k = Math.min(1, Math.pow(2, (map.getZoom() - 16) * 0.5));
  return { radius: Math.max(1.1, (3 + Math.sqrt(n) * 2.2) * k), weight: k > 0.6 ? 1 : 0, fillOpacity: k > 0.6 ? 0.45 : 0.6 };
}
let pickedYear = 0; // 0 — все годы
const shown = m => pickedYear ? (m.byYear[pickedYear] || 0) : m.n;
const RED = '#ff3b2f', GREY = '#8d8f94';
// Выбран год: дома, где в этот год кого-то расстреляли, — такие же полупрозрачные красные круги, как на всех годах, поверх остальных
// (размер — по числу за этот год); все прочие дома остаются на месте, но серые (размер — по общему числу).
function redrawDots() {
  const bright = [];
  dots.forEach(m => {
    const n = shown(m), st = dotStyle(pickedYear ? (n || m.n) : n);
    if (!pickedYear) m.setStyle(Object.assign({ color: RED, fillColor: RED, opacity: 1 }, st));
    else if (n) { // год выбран, в доме есть расстрелянные в этот год: такой же полупрозрачный красный круг, как на всех годах
      m.setStyle(Object.assign({ color: RED, fillColor: RED, opacity: 1 }, st, { radius: Math.max(2, st.radius) }));
      bright.push(m);
    } else m.setStyle({ color: GREY, fillColor: GREY, radius: st.radius, weight: 0, fillOpacity: 0.3 }); // остальные — серые
  });
  bright.forEach(m => m.bringToFront());
}
map.on('zoomend', redrawDots);

// Окно дома. Сверху сводка: сколько человек, квартир, какие годы.
// Ниже люди по дате расстрела. У каждого три слоя: имя и годы жизни; кем был; остальное мельче.
// Человек: [кв, ФИО, год рождения, дата расстрела, место захоронения, биография, место рождения, национальность, партийность, работа]
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many; };
const yearOf = s => +(/(\d{4})$/.exec(s || '') || [])[1] || 0;
const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const dateKey = s => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s || ''); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 99999999; };
function popupHtml(addr, people) {
  const ppl = people.slice().sort((a, b) => dateKey(a[3]) - dateKey(b[3]));
  const inApt = {}; ppl.forEach(p => { if (p[0]) inApt[p[0]] = (inApt[p[0]] || 0) + 1; });
  const apts = Object.keys(inApt).length;
  const years = ppl.map(p => yearOf(p[3])).filter(Boolean);
  const y0 = Math.min(...years), y1 = Math.max(...years);
  let sum = ppl.length + ' ' + plural(ppl.length, 'человек', 'человека', 'человек');
  if (apts) sum += ' · ' + apts + ' ' + plural(apts, 'квартира', 'квартиры', 'квартир');
  if (years.length) sum += ' · ' + (y0 === y1 ? y0 : y0 + '–' + y1);
  // если на таймлайне выбран год: сначала расстрелянные в этот год, остальные ниже и серым
  const inYear = pickedYear ? ppl.filter(p => yearOf(p[3]) === pickedYear) : ppl;
  const rows = pickedYear ? inYear.concat(ppl.filter(p => yearOf(p[3]) !== pickedYear)) : ppl;
  let sepDone = false;
  if (pickedYear) sum = 'в ' + pickedYear + ' году — ' + inYear.length + ' из ' + ppl.length + ' · ' + sum;
  return '<div class="pp"><h3>' + esc(addr) + '</h3><div class="sum">' + sum + '</div>' +
    rows.map(([apt, name, by, ex, bur, bio, born, nat, party, job]) => {
      const dim = pickedYear && yearOf(ex) !== pickedYear;
      const rest = [
        apt ? 'кв. ' + esc(apt) + (inApt[apt] > 1 ? ' (в этой квартире расстреляно ' + inApt[apt] + ')' : '') : '',
        bur ? 'захоронение: ' + esc(bur) : '',
        born ? 'род.: ' + esc(born) : '', esc(nat || ''), esc(party || ''),
      ].filter(Boolean).join(' · ');
      const sep = dim && !sepDone ? (sepDone = true, '<div class="other">Расстреляны в другие годы</div>') : '';
      return sep + '<div class="p' + (dim ? ' dim' : '') + '"><div><span class="n">' + esc(name) + '</span> <span class="life">' + (by ? by + ' – ' : 'расстрел ') + esc(ex) + '</span></div>' +
        '<div class="job">' + esc(nat ? job : bio) + '</div><div class="m">' + rest + '</div></div>';
    }).join('') + '</div>';
}
fetch('data/moscow_points.json').then(r => r.json()).then(D => {
  let people = 0;
  // окно дома не должно уходить под строку поиска; на узком экране оно ещё и уже
  const popupOpts = { maxWidth: Math.min(360, window.innerWidth - 50), autoPanPaddingTopLeft: [10, search.offsetHeight + 24] };
  const houses = [];
  D.forEach(([lat, lon, addr, ppl]) => {
    people += ppl.length;
    const m = L.circleMarker([lat, lon], Object.assign({ color: '#ff3b2f', fillColor: '#ff3b2f' }, dotStyle(ppl.length)));
    m.n = ppl.length; m.byYear = {}; dots.push(m);
    ppl.forEach(q => { const y = yearOf(q[3]); if (y) m.byYear[y] = (m.byYear[y] || 0) + 1; });
    m.bindPopup(() => popupHtml(addr, ppl), popupOpts);
    m.addTo(map);
    houses.push({ addr, m, key: ' ' + norm(addr) + ' ' });
  });
  const fmt = n => n.toLocaleString('ru');

  // ---------- поиск по адресу: улицы и дома, но только те, что есть на карте ----------
  const q = document.getElementById('q'), hits = document.getElementById('hits');
  const SKIP = new Set(['улица', 'ул', 'переулок', 'пер', 'дом', 'д', 'проспект', 'просп', 'пр', 'бульвар', 'бул', 'площадь', 'пл', 'набережная', 'наб', 'шоссе', 'ш', 'проезд', 'корп', 'корпус', 'стр', 'строение', 'москва']);
  // улица — часть адреса до «, д.»; у неё список домов и общее число людей
  const streets = new Map();
  houses.forEach(h => {
    const name = h.addr.split(/,\s*д\./)[0].trim();
    if (!streets.has(name)) streets.set(name, { street: name, key: ' ' + norm(name) + ' ', list: [], n: 0 });
    const st = streets.get(name); st.list.push(h); st.n += h.m.n;
  });
  const score = (key, words) => {
    let sc = 0;
    for (const w of words) {
      if (/^\d/.test(w)) { // номер: целое слово лучше, чем начало слова
        if (key.includes(' ' + w + ' ')) sc += 3; else if (key.includes(' ' + w)) sc += 1; else return 0;
      } else if (key.includes(' ' + w)) sc += 4; else if (key.includes(w)) sc += 1; else return 0; // начало слова в названии важнее всего
    }
    return sc;
  };
  const rank = (items, words, name) => items.map(x => [score(x.key, words), x]).filter(x => x[0])
    .sort((a, b) => b[0] - a[0] || name(a[1]).length - name(b[1]).length || name(a[1]).localeCompare(name(b[1]), 'ru')).map(x => x[1]);
  function find(text) {
    const words = norm(text).split(' ').filter(w => w && !SKIP.has(w));
    if (!words.length) return [];
    const hs = rank(houses, words, h => h.addr);
    // пока в запросе нет номера дома, сначала идут улицы целиком
    const sts = words.some(w => /^\d/.test(w)) ? [] : rank([...streets.values()], words, t => t.street).slice(0, 4);
    return sts.concat(hs).slice(0, 8);
  }
  function go(x) {
    hits.textContent = ''; found = []; q.blur();
    if (x.street) { // улица: показать все её дома на карте
      q.value = x.street;
      map.closePopup();
      map.fitBounds(L.latLngBounds(x.list.map(h => h.m.getLatLng())), { paddingTopLeft: [40, 80], paddingBottomRight: [40, 60], maxZoom: 17, animate: false });
    } else {
      q.value = x.addr;
      map.setView(x.m.getLatLng(), Math.max(map.getZoom(), 17), { animate: false });
      x.m.openPopup();
    }
  }
  let found = [], active = 0;
  const mark = () => [...hits.children].forEach((b, k) => b.classList.toggle('on', k === active));
  q.oninput = () => {
    found = find(q.value); active = 0;
    hits.textContent = '';
    if (!q.value.trim()) return;
    if (!found.length) { hits.innerHTML = '<div class="none">Такой улицы или адреса нет среди домов на карте</div>'; return; }
    found.forEach((x, k) => {
      const b = document.createElement('button');
      b.innerHTML = x.street
        ? esc(x.street) + ' <span>вся улица · ' + x.list.length + ' ' + plural(x.list.length, 'дом', 'дома', 'домов') + ' · ' + x.n + ' чел.</span>'
        : esc(x.addr) + ' <span>' + x.m.n + ' чел.</span>';
      b.onclick = () => go(x);
      b.onmouseenter = () => { active = k; mark(); };
      hits.appendChild(b);
    });
    mark();
  };
  q.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!found.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length;
      mark();
    } else if (e.key === 'Enter' && found.length) go(found[active]);
    else if (e.key === 'Escape') { hits.textContent = ''; found = []; q.blur(); }
  };
  q.onfocus = () => { if (q.value.trim() && !hits.children.length) q.oninput(); };
  map.on('click', () => { hits.textContent = ''; found = []; });
  search.hidden = false;

  // ---------- общий таймлайн: ползунок по годам; выбранный год выделяется на карте, остальные дома бледнеют ----------
  const byYear = {}, housesIn = {};
  dots.forEach(m => Object.keys(m.byYear).forEach(y => { byYear[y] = (byYear[y] || 0) + m.byYear[y]; housesIn[y] = (housesIn[y] || 0) + 1; }));
  const ys = Object.keys(byYear).map(Number), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const strip = document.getElementById('time-strip'), slider = document.getElementById('time-range'), head = document.getElementById('time-head'), panel = document.getElementById('time-panel');
  const ppl = n => fmt(n) + ' ' + plural(n, 'человек', 'человека', 'человек'), hs = n => fmt(n) + ' ' + plural(n, 'дом', 'дома', 'домов');
  function pick(y) { // y = 0 — все годы
    pickedYear = y;
    redrawDots();
    map.closePopup();
    slider.classList.toggle('idle', !y);
    [...strip.children].forEach(c => c.classList.toggle('on', +c.dataset.y === y));
    const n = byYear[y] || 0;
    head.innerHTML = !y ? '<b>' + y0 + '–' + y1 + '</b> — все годы. Двигайте ползунок, чтобы выделить год на карте.'
      : '<b>' + y + '</b> — ' + (n ? ppl(n) + ', ' + hs(housesIn[y]) : 'в базе нет расстрелянных с известным адресом') + ' <button id="time-all">Все годы</button>';
    const all = document.getElementById('time-all'); if (all) all.onclick = () => pick(0);
  }
  // линия под ползунком: по одинаковой клетке на год, без цвета по числу расстрелянных (так решил Илья)
  for (let y = y0; y <= y1; y++) {
    const c = document.createElement('i');
    c.dataset.y = y; c.title = y;
    strip.appendChild(c);
  }
  slider.min = y0; slider.max = y1; slider.value = y0;
  slider.oninput = () => pick(+slider.value);
  slider.onpointerdown = () => { if (!pickedYear) pick(+slider.value); }; // первое нажатие на ползунок сразу выбирает год под ним
  const ticks = document.getElementById('time-ticks');
  for (let y = y0; y <= y1; y++) {
    if (y % 5 && y !== y0 && y !== y1) continue;
    const t = document.createElement('span');
    t.textContent = y; t.style.left = ((y - y0) / (y1 - y0) * 100) + '%';
    ticks.appendChild(t);
  }
  const btn = document.getElementById('time-btn');
  btn.hidden = false;
  btn.onclick = () => {
    panel.hidden = !panel.hidden;
    btn.textContent = panel.hidden ? 'Таймлайн' : 'Скрыть таймлайн';
    if (panel.hidden && pickedYear) pick(0); // закрытый таймлайн не должен незаметно менять карту
  };
  pick(0);
}).catch(e => {
  say('Данные не загрузились: ' + e.message + '. Страницу нужно открывать через веб-сервер, а не как файл.');
});
