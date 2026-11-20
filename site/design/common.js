// Общий код трёх прототипов оформления (a.html, b.html, c.html).
// Данные людей: ../data/moscow_points.json (вся Москва, здесь берётся только фрагмент).
// Подложка: arbat_base.json — контуры домов и улицы OpenStreetMap, см. scripts/build_arbat_basemap.py.
(function () {
  const M_LAT = 111195; // метров в градусе широты
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => n.toLocaleString('ru');
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many;
  };
  const people = n => fmt(n) + ' ' + plural(n, 'человек', 'человека', 'человек');
  const dateKey = s => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s || ''); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 99999999; };
  const yearOf = s => { const m = /(\d{4})$/.exec(s || ''); return m ? +m[1] : null; };

  // ---------- загрузка и привязка адресов к контурам домов ----------
  async function load() {
    const [base, all] = await Promise.all([
      fetch('arbat_base.json').then(r => r.json()),
      fetch('../data/moscow_points.json').then(r => r.json()),
    ]);
    const [S, W, N, E] = base.bbox;
    const lat0 = (S + N) / 2, kx = M_LAT * Math.cos(lat0 * Math.PI / 180);
    const xy = (lat, lon) => [(lon - W) * kx, (lat - S) * M_LAT];
    const houses = all.filter(d => d[0] >= S && d[0] <= N && d[1] >= W && d[1] <= E).map((d, i) => ({
      id: i, lat: d[0], lon: d[1], addr: d[2], b: -1,
      people: d[3].map(p => ({ apt: p[0], name: p[1], born: p[2], shot: p[3], burial: p[4], bio: p[5] })),
    }));
    // контуры в метрах + габариты
    const B = base.buildings.map(r => {
      const p = r.map(c => xy(c[0], c[1]));
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      p.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
      return { p, x0, y0, x1, y1 };
    });
    const inside = (p, x, y) => {
      let c = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
      }
      return c;
    };
    const dist = (p, x, y) => {
      let best = 1e9;
      for (let i = 0; i < p.length - 1; i++) {
        const ax = p[i][0], ay = p[i][1], dx = p[i + 1][0] - ax, dy = p[i + 1][1] - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
      }
      return best;
    };
    const NEAR = 25; // м: адресная точка считается относящейся к дому, если лежит не дальше
    houses.forEach(h => {
      const [x, y] = xy(h.lat, h.lon);
      let best = -1, bd = NEAR;
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (x < b.x0 - NEAR || x > b.x1 + NEAR || y < b.y0 - NEAR || y > b.y1 + NEAR) continue;
        if (inside(b.p, x, y)) { best = i; bd = 0; break; }
        const d = dist(b.p, x, y);
        if (d < bd) { bd = d; best = i; }
      }
      h.b = best;
    });
    let total = 0, y0 = 9999, y1 = 0;
    houses.forEach(h => h.people.forEach(p => { total++; const y = yearOf(p.shot); if (y) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }));
    return {
      base, houses, total, years: [y0, y1], near: NEAR,
      hitBuilding(lat, lon) { const [x, y] = xy(lat, lon); for (let i = 0; i < B.length; i++) { const b = B[i]; if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && inside(b.p, x, y)) return i; } return -1; },
    };
  }

  // ---------- карта без тайлов ----------
  function makeMap(base, zoom) {
    const [S, W, N, E] = base.bbox;
    const map = L.map('map', {
      renderer: L.canvas({ padding: 0.6 }), zoomSnap: 0.5, zoomDelta: 0.5, minZoom: 15, maxZoom: 19,
      maxBounds: [[S - 0.002, W - 0.004], [N + 0.002, E + 0.004]], maxBoundsViscosity: 0.9,
      zoomControl: false, attributionControl: false,
    }).setView([55.7497, 37.5915], zoom || 16.5);
    window._map = map; // для отладки из консоли
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    return map;
  }
  const mpp = map => 156543.03 * Math.cos(map.getCenter().lat * Math.PI / 180) / Math.pow(2, map.getZoom());

  // style: { green, street:{a,b,p:{color,m}}, building: i => pathOptions }
  function drawBase(map, base, style) {
    base.green.forEach(r => L.polygon(r, Object.assign({ stroke: false, fillOpacity: 1, interactive: false }, style.green)).addTo(map));
    const W = { a: 20, b: 9, p: 12 }; // условная ширина улиц, м
    const streets = [];
    ['b', 'p', 'a'].forEach(k => base.streets.filter(s => s.k === k).forEach(s => {
      streets.push([k, L.polyline(s.p, { color: style.street[k], interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(map)]);
    }));
    const restyle = () => { const m = mpp(map); streets.forEach(([k, l]) => l.setStyle({ weight: Math.max(1, W[k] / m) })); };
    map.on('zoomend', restyle); restyle();
    return base.buildings.map((r, i) => L.polygon(r, Object.assign({ interactive: false, fillOpacity: 1, weight: 1 }, style.building(i))).addTo(map));
  }

  // ---------- подписи: улицы и произвольные блоки с проверкой наложений ----------
  const short = n => n.replace(/переулок/i, 'пер.').replace(/улица/i, 'ул.').replace(/бульвар/i, 'б-р').replace(/площадь/i, 'пл.')
    .replace(/проезд/i, 'пр.').replace(/Больш(ой|ая)/, 'Б.').replace(/Мал(ый|ая)/, 'М.').replace(/Средн(ий|яя)/, 'Ср.').trim();

  function streetLines(base) {
    const by = {};
    base.streets.forEach(s => { if (s.n) (by[s.n] = by[s.n] || []).push(s.p.slice()); });
    const key = c => c[0] + ',' + c[1], out = [];
    for (const n in by) {
      const lines = by[n];
      let merged = true;
      while (merged) {
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
      const len = l => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot((l[i][0] - l[i - 1][0]) * M_LAT, (l[i][1] - l[i - 1][1]) * M_LAT * 0.563); return s; };
      const best = lines.map(l => [len(l), l]).sort((x, y) => y[0] - x[0])[0];
      out.push({ name: short(n), len: best[0], line: best[1] });
    }
    return out.sort((x, y) => y.len - x.len);
  }

  function Labeler(map) {
    const pane = map.createPane('labels');
    pane.style.zIndex = 450; pane.style.pointerEvents = 'none';
    const ctx = document.createElement('canvas').getContext('2d');
    let boxes = [];
    map.on('zoomstart', () => { pane.style.visibility = 'hidden'; });
    map.on('zoomend', () => { pane.style.visibility = ''; });
    return {
      pane,
      width(text, font) { ctx.font = font; return ctx.measureText(text).width; },
      begin() { pane.textContent = ''; boxes = []; },
      // x,y — левый верхний угол блока в координатах слоя; возвращает false, если место занято
      add(x, y, w, h, html, cls, opt) {
        opt = opt || {};
        let bx = x, by = y, bw = w, bh = h;
        if (opt.rot) { // описанный прямоугольник повёрнутой подписи (поворот вокруг центра)
          const r = opt.rot * Math.PI / 180, cw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r)), ch = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
          bx = x + w / 2 - cw / 2; by = y + h / 2 - ch / 2; bw = cw; bh = ch;
        }
        const pad = opt.pad == null ? 2 : opt.pad;
        if (!opt.force) for (const b of boxes) if (bx < b[0] + b[2] + pad && bx + bw + pad > b[0] && by < b[1] + b[3] + pad && by + bh + pad > b[1]) return false;
        if (!opt.free) boxes.push([bx, by, bw, bh]);
        const d = document.createElement('div');
        d.className = 'lb ' + (cls || '');
        d.style.cssText = 'position:absolute;left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;white-space:nowrap' + (opt.rot ? ';width:' + w.toFixed(1) + 'px;text-align:center;transform:rotate(' + opt.rot.toFixed(1) + 'deg)' : '');
        d.innerHTML = html;
        pane.appendChild(d);
        return true;
      },
      // подписи улиц: одна на улицу, посередине самой длинной непрерывной линии
      streets(lines, font, cls, lineH) {
        const bounds = map.getBounds().pad(0.3);
        lines.forEach(s => {
          const w = this.width(s.name, font);
          if (s.len / mpp(map) < w * 0.9) return;
          let acc = 0, half = s.len / 2, l = s.line;
          for (let i = 1; i < l.length; i++) {
            const seg = Math.hypot((l[i][0] - l[i - 1][0]) * M_LAT, (l[i][1] - l[i - 1][1]) * M_LAT * 0.563);
            if (acc + seg >= half) {
              const t = (half - acc) / (seg || 1), lat = l[i - 1][0] + (l[i][0] - l[i - 1][0]) * t, lon = l[i - 1][1] + (l[i][1] - l[i - 1][1]) * t;
              if (!bounds.contains([lat, lon])) return;
              const p0 = map.latLngToLayerPoint(l[i - 1]), p1 = map.latLngToLayerPoint(l[i]), c = map.latLngToLayerPoint([lat, lon]);
              let a = Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
              if (a > 90) a -= 180; if (a < -90) a += 180;
              this.add(c.x - w / 2, c.y - lineH / 2, w, lineH, esc(s.name), cls, { rot: a || 0.01 });
              return;
            }
            acc += seg;
          }
        });
      },
    };
  }

  // ---------- выбор дома и карточка ----------
  // opts: { data, map, render: house => html, onSelect: (house|null, prev) => void }
  function selection(opts) {
    const { data, map } = opts;
    const sheet = document.getElementById('sheet'), card = document.getElementById('card');
    let cur = null;
    const set = h => {
      const prev = cur; cur = h;
      opts.onSelect(h, prev);
      if (!h) { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); return; }
      card.innerHTML = opts.render(h);
      sheet.scrollTop = 0;
      sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
      const wide = window.matchMedia('(min-width: 760px)').matches;
      requestAnimationFrame(() => map.panInside([h.lat, h.lon], {
        paddingTopLeft: [40, 120],
        paddingBottomRight: wide ? [sheet.offsetWidth + 40, 60] : [40, sheet.offsetHeight + 50],
      }));
    };
    document.getElementById('x').addEventListener('click', () => set(null));
    map.on('click', e => {
      let best = null, bd = 26; // радиус попадания, px
      data.houses.forEach(h => { const d = map.latLngToContainerPoint([h.lat, h.lon]).distanceTo(e.containerPoint); if (d < bd) { bd = d; best = h; } });
      if (!best) {
        const b = data.hitBuilding(e.latlng.lat, e.latlng.lng);
        if (b >= 0) { bd = 1e9; data.houses.forEach(h => { if (h.b === b) { const d = map.latLngToContainerPoint([h.lat, h.lon]).distanceTo(e.containerPoint); if (d < bd) { bd = d; best = h; } } }); }
      }
      set(best);
    });
    return { set, get: () => cur };
  }

  function header(data) {
    document.getElementById('cnt').textContent = fmt(data.houses.length) + ' ' + plural(data.houses.length, 'адрес', 'адреса', 'адресов') +
      ' · ' + people(data.total) + ' · расстрелы ' + data.years[0] + '–' + data.years[1];
  }
  function fail(e) { document.getElementById('cnt').textContent = 'Данные не загрузились: ' + e.message + '. Страницу нужно открывать через веб-сервер.'; console.error(e); }

  window.Proto = { load, makeMap, drawBase, mpp, streetLines, Labeler, selection, header, fail, esc, fmt, plural, people, dateKey, yearOf, M_LAT };
})();
