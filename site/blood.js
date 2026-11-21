// Точки-люди как кровь, с симуляцией жидкости (Илья, 2026-11-21). По умолчанию — только на слайде «Это карта одного города»
// (story.blood === 'city'); на остальных выбранных слайдах — проба, включается адресом ?blood,
// без него они выглядят как обычно.
// Замысел: один человек — одна капля. Капли одного дома и соседних домов сливаются в лужу; капли не сжимаются,
// поэтому площадь лужи растёт с числом людей. Никаких новых сведений слой не добавляет: какие люди видны и каким цветом,
// он берёт у тех же маркеров домов, что и обычные точки (map.js: m.k, m.cols, стиль маркера).
// Как устроено:
//   • частица на человека; у каждой — смещение от адреса дома и скорость;
//   • силы: пружина к адресу (лужа не уплывает), расталкивание соседних частиц (несжимаемость), вязкое трение;
//   • рисунок плоский: кружки на отдельном холсте, поверх — фильтр SVG: размытие и порог по прозрачности сливают
//     кружки в капли с гладким краем. Света, блика и объёма нет; на мышь и на сдвиг карты жидкость не реагирует
//     (первый вариант всё это делал, Илья 2026-11-21: выглядит и ощущается плохо).
// Обычные россыпи точек при этом не рисуются (Flock._updatePath в map.js), но нажатия на дома работают как раньше.
(function () {
  const ALL = new URLSearchParams(location.search).has('blood');
  // На каких слайдах люди рисуются кровью, решает сцена (story.blood, задаётся в story.js; список выбрал Илья 2026-11-21:
  // общий вид города, оба слайда о китайцах, «самый обычный человек», Кремль). На остальных слайдах и на свободной карте —
  // обычные точки: там, где несколько цветов, кровь смешивает их в муть. Кровью рисуются выделенные (красные) люди;
  // остальные на том же слайде остаются мелкими серыми точками, как и без этой пробы.
  // story.pools — источники капель не из домов, [широта, долгота, число людей]; сейчас ни один слайд их не задаёт.
  // свободная карта (вступления нет, story пуст) — кровь всегда (решение Ильи 2026-11-21)
  const on = () => story ? story.blood === 'city' || (ALL && !!story.blood) : true;
  const houses = () => on() && !(story && story.pools);
  window.BLOOD = houses;
  window.BLOOD_POOLS = () => on() && !!(story && story.pools);
  let cleared = true, lastMode = null, poolSrc = null, poolObjs = null;
  const BLOOD = '#b3100c'; // кровь — выделенные (красные) люди
  const KS = 0.004, KR = 0.5, DAMP = 0.78;  // пружина к адресу, расталкивание, трение (за кадр)
  const GOLD = Math.PI * (3 - Math.sqrt(5));

  document.body.insertAdjacentHTML('beforeend',
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="blood-goo" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
    '<feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b"/>' +
    '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -7"/>' +
    '</filter></svg>');
  const blurEl = document.querySelector('#blood-goo feGaussianBlur');

  const pane = map.createPane('blood');
  pane.style.zIndex = 420; pane.style.pointerEvents = 'none'; pane.style.transition = 'opacity .28s ease';
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  cv.className = 'leaflet-zoom-hide';
  cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;filter:url(#blood-goo)';
  pane.appendChild(cv);
  const overlay = map.getPane('overlayPane');

  // состояние частиц: по одной на человека, место в массивах — m._b0 + номер человека в доме
  let N = 0, ox, oy, vx, vy, alive;
  let X, Y, AX, AY, ID, CI, NEXT; // видимые на этом кадре: место на экране, ускорение, номер частицы, номер цвета, цепочка в клетке
  const alloc = () => {
    dots.forEach(m => { m._b0 = N; N += m.n; const p = map.project(m.getLatLng(), 0); m._mx = p.x; m._my = p.y; m._kPrev = 0; m._bst = 0; });
    const M = N * 2; // вторая половина массивов — частицы луж
    ox = new Float32Array(M); oy = new Float32Array(M); vx = new Float32Array(M); vy = new Float32Array(M); alive = new Uint8Array(M);
    X = new Float32Array(M); Y = new Float32Array(M); AX = new Float32Array(M); AY = new Float32Array(M);
    ID = new Int32Array(M); CI = new Uint8Array(M); NEXT = new Int32Array(M);
  };
  let head = new Int32Array(0);

  let lastKey = '', lastSt = 0, still = 0, prevTl = null, prevZ = null, W = 0, H = 0, dprNow = 0;
  const palette = [], palIdx = new Map();
  const DIMMED = '#414246'; // приглушённые точки (GREY в map.js рисуется с прозрачностью 0,4): фильтр слоя делает всё непрозрачным, поэтому цвет заранее смешан с фоном
  const colorOf = c => { c = c === RED ? BLOOD : c === GREY ? DIMMED : c; // не выделенные люди остаются своим серым цветом и мельче, как у обычных точек
    let i = palIdx.get(c); if (i === undefined) { i = palette.length; palette.push(c); palIdx.set(c, i); } return i; };

  function frame() {
    if (!dots.length) return;
    const tStart = performance.now();
    if (!ox) alloc();
    if (!on()) { if (!cleared) { cleared = true; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); alive.fill(0); dots.forEach(m => { m._kPrev = 0; }); lastKey = ''; lastMode = null; } return; }
    cleared = false;
    // источники капель: дома или лужи сцены
    let pools = null;
    if (story && story.pools) {
      if (poolSrc !== story.pools) { poolSrc = story.pools; let b = N; poolObjs = poolSrc.map(([lat, lon, cnt]) => { const p = map.project([lat, lon], 0), o = { n: Math.min(cnt, 2 * N - b), _b0: b, _mx: p.x, _my: p.y, _kPrev: 0, _bst: 0 }; b += o.n; return o; }); }
      pools = poolObjs;
    }
    const mode = pools ? poolSrc : 'houses';
    if (mode !== lastMode) { lastMode = mode; alive.fill(0); dots.forEach(m => { m._kPrev = 0; }); if (poolObjs) poolObjs.forEach(m => { m._kPrev = 0; }); }
    // шаг капель на карте СССР — тот же, с каким там рисуются обычные точки (Scatter в story.js)
    const list = pools || dots, poolStep = 2.6 * Math.max(0.7, Math.min(2.2, 0.75 * Math.pow(2, (map.getZoom() - 3) / 2))), redIdx = colorOf(RED);
    pane.style.opacity = overlay.style.opacity;
    const size = map.getSize(), z = map.getZoom(), sc = Math.pow(2, z), tl = map.getPixelBounds().min;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (W !== size.x || H !== size.y || dprNow !== dpr) { W = size.x; H = size.y; dprNow = dpr; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; still = 0; }
    L.DomUtil.setPosition(cv, map.containerPointToLayerPoint([0, 0]));

    const moved = !prevTl || prevZ !== z || tl.x !== prevTl.x || tl.y !== prevTl.y;
    prevTl = tl; prevZ = z;

    // какие люди видны: то же, что нарисовали бы обычные точки
    let n = 0, st = 0, key = 0;
    const PAD = 60;
    for (let h = 0; h < list.length; h++) {
      const m = list[h], o = m.options;
      const vis = pools || (m._map && o.fillOpacity > 0 && o.opacity !== 0 && (!story || story.lit.has(m)));
      const k = pools ? m.n : vis ? Math.min(m.n, m._count()) : 0, b0 = m._b0;
      for (let i = k; i < m._kPrev; i++) alive[b0 + i] = 0;
      m._kPrev = k;
      if (!k) continue;
      const s = pools ? poolStep : m._step();
      if (m._bst && m._bst !== s) { const f = s / m._bst; for (let i = 0; i < m.n; i++) { ox[b0 + i] *= f; oy[b0 + i] *= f; } } // масштаб сменился — лужа сжимается или растёт вместе с шагом точек
      m._bst = s;
      const hx = m._mx * sc - tl.x, hy = m._my * sc - tl.y;
      const cols = !pools && m.cols && m.cols.length === k ? m.cols : null, c0 = pools ? redIdx : cols ? 0 : colorOf(o.fillColor);
      key += (h + 1) * k + c0;
      if (hx < -PAD || hy < -PAD || hx > W + PAD || hy > H + PAD) continue; // за краем экрана не считаем и не рисуем
      if (s > st) st = s;
      for (let i = 0; i < k; i++) {
        const j = b0 + i;
        if (!alive[j]) { alive[j] = 1; const d = s * 0.6 * Math.sqrt(i), a = i * GOLD; ox[j] = d * Math.cos(a); oy[j] = d * Math.sin(a); vx[j] = vy[j] = 0; } // новая капля падает у адреса, лужа расходится сама
        X[n] = hx + ox[j]; Y[n] = hy + oy[j]; ID[n] = j; CI[n] = cols ? colorOf(cols[i]) : c0; n++;
      }
    }
    if (key + ':' + n !== lastKey || st !== lastSt || moved) still = 0;
    lastKey = key + ':' + n; lastSt = st;
    if (still > 40) return; // жидкость успокоилась — не считаем и не перерисовываем
    if (!n) { ctx.clearRect(0, 0, cv.width, cv.height); still = 99; return; }

    // расталкивание: сетка с клеткой в шаг точек, проверяются только соседние клетки
    const d0 = st * 1.3, cell = d0, gx0 = -PAD - st * 4, gy0 = -PAD - st * 4, gw = Math.ceil((W + 2 * PAD + st * 8) / cell) + 1, gh = Math.ceil((H + 2 * PAD + st * 8) / cell) + 1;
    if (head.length < gw * gh) head = new Int32Array(gw * gh);
    head.fill(-1, 0, gw * gh);
    for (let i = 0; i < n; i++) {
      AX[i] = AY[i] = 0;
      const cx = Math.max(0, Math.min(gw - 1, ((X[i] - gx0) / cell) | 0)), cy = Math.max(0, Math.min(gh - 1, ((Y[i] - gy0) / cell) | 0)), c = cy * gw + cx;
      NEXT[i] = head[c]; head[c] = i;
    }
    const d02 = d0 * d0;
    for (let i = 0; i < n; i++) {
      const cx = Math.max(0, Math.min(gw - 1, ((X[i] - gx0) / cell) | 0)), cy = Math.max(0, Math.min(gh - 1, ((Y[i] - gy0) / cell) | 0));
      for (let yy = cy - 1; yy <= cy + 1; yy++) { if (yy < 0 || yy >= gh) continue;
        for (let xx = cx - 1; xx <= cx + 1; xx++) { if (xx < 0 || xx >= gw) continue;
          for (let j = head[yy * gw + xx]; j >= 0; j = NEXT[j]) {
            if (j <= i) continue;
            let dx = X[j] - X[i], dy = Y[j] - Y[i]; const r2 = dx * dx + dy * dy;
            if (r2 >= d02) continue;
            let r = Math.sqrt(r2);
            if (r < 0.01) { const a = (i * 7 + j * 13) % 628 / 100; dx = Math.cos(a) * 0.01; dy = Math.sin(a) * 0.01; r = 0.01; }
            const f = KR * (1 - r / d0) * d0 * 0.5 / r;
            AX[i] -= dx * f; AY[i] -= dy * f; AX[j] += dx * f; AY[j] += dy * f;
          } } }
    }
    let maxV = 0; const vmax = st * 1.5;
    for (let i = 0; i < n; i++) {
      const j = ID[i];
      const ax = AX[i] - KS * ox[j], ay = AY[i] - KS * oy[j];
      let u = (vx[j] + ax) * DAMP, v = (vy[j] + ay) * DAMP; const sp = Math.hypot(u, v);
      if (sp > vmax) { u *= vmax / sp; v *= vmax / sp; }
      vx[j] = u; vy[j] = v; ox[j] += u; oy[j] += v; X[i] += u; Y[i] += v;
      if (sp > maxV) maxV = sp;
    }
    still = maxV < 0.03 ? still + 1 : 0;

    // рисунок
    // размытие заметно меньше радиуса капли: иначе одиночная капля после порога исчезает совсем (так было в первой пробе),
    // а каждый человек должен оставаться видимым
    const rad = Math.max(1.1, st * 0.8), blur = Math.max(0.5, rad * 0.5);
    if (blurEl.getAttribute('stdDeviation') !== blur.toFixed(2)) blurEl.setAttribute('stdDeviation', blur.toFixed(2));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    for (let c = 0; c < palette.length; c++) {
      let any = false;
      ctx.beginPath();
      const rc = palette[c] === BLOOD ? rad : Math.max(0.9, rad * 0.6);
      for (let i = 0; i < n; i++) { if (CI[i] !== c) continue; any = true; ctx.moveTo(X[i] + rc, Y[i]); ctx.arc(X[i], Y[i], rc, 0, 6.2832); }
      if (any) { ctx.fillStyle = palette[c]; ctx.fill(); }
    }
    window.BLOOD_MS = performance.now() - tStart; window.BLOOD_N = n; // для замера: время кадра и число частиц на экране
  }
  const loop = () => { requestAnimationFrame(loop); frame(); };
  requestAnimationFrame(loop);
  // Во время перелёта камера двигает карту на каждом кадре. Если ждать своего кадра, слой отстаёт от карты на кадр
  // и лужи съезжают со своих мест, поэтому слой пересчитывается сразу вслед за каждым движением карты.
  map.on('move zoom', () => { try { frame(); } catch (e) { console.error(e); } }); // ошибка в пробном слое не должна ломать движение карты
})();
