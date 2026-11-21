// Объёмный вид дома для вступления: камера опускается с высоты карты до уровня глаз и смотрит на здание.
// Рисуется на отдельном холсте поверх карты, обычным 2D-контекстом: каждое здание — призма по контуру,
// грани сортируются по дальности и закрашиваются (без библиотек). Это стилизация, а не фотография:
//   • нужный дом — по контурам и этажности из data/house_shapes.json (OpenStreetMap), высота этажа 3,3 м;
//   • окружающие дома — контуры из подложки (data/base/), высоты у них в данных нет, взята условная 10–18 м;
//   • облик фасадов не воспроизводится: на стенах только линии этажей.
// Используется из story.js: View3D.show({ map, rings, center }), View3D.hide().
const View3D = (() => {
  const FLOOR = 3.3, FOV = 50 * Math.PI / 180, EYE = 2.2;
  let cv = null, ctx = null, raf = 0, token = 0;
  const ensure = () => {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.id = 'view3d';
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:690;pointer-events:none;opacity:0;transition:opacity .7s ease';
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    cv.addEventListener('click', () => { if (onPick) onPick(); });
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix = (a, b, t) => a + (b - a) * t, ease = t => t * t * (3 - 2 * t);
  const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

  let onPick = null;
  function show({ map, rings, center, onClick }) {
    ensure();
    onPick = onClick || null; // нажатие на вид дома (мышью) открывает список жильцов
    cv.style.pointerEvents = onPick && window.matchMedia('(pointer: fine)').matches ? 'auto' : 'none'; cv.style.cursor = onPick ? 'pointer' : '';
    const my = ++token;
    const lat0 = center[0], lon0 = center[1], kx = Math.cos(lat0 * Math.PI / 180);
    const toM = q => [(q[1] - lon0) * 111320 * kx, (q[0] - lat0) * 111320]; // метры: x — восток, y — север
    // нужный дом
    const target = rings.map(([levels, ring]) => ({ h: levels * FLOOR, levels, pts: ring.slice(0, ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? -1 : undefined).map(toM), own: true }));
    const all = target.reduce((a, b) => a.concat(b.pts), []);
    const cx0 = all.reduce((a, p) => a + p[0], 0) / all.length, cy0 = all.reduce((a, p) => a + p[1], 0) / all.length;
    const ext = Math.max(...all.map(p => Math.hypot(p[0] - cx0, p[1] - cy0))), H = Math.max(...target.map(b => b.h));
    const prisms = target.slice();
    // окружение — из клеток подложки вокруг дома
    const ids = new Set(); [-1, 0, 1].forEach(i => [-1, 0, 1].forEach(j => ids.add(Math.floor((lat0 + i * 0.004) / 0.01 + 1e-9) + '_' + Math.floor((lon0 + j * 0.007) / 0.02 + 1e-9))));
    const loads = [...ids].map(id => fetch('data/base/' + id + '.json').then(r => r.json()).then(t => {
      t.b.forEach((f, n) => {
        const pts = decode(f, t.o).map(toM), c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
        if (Math.hypot(c[0] - cx0, c[1] - cy0) > Math.max(420, ext * 1.8)) return;
        if (target.some(b => inside(c, b.pts) || b.pts.some(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < 6))) return; // это сам дом
        if (pts.some(p => target.some(b => inside(p, b.pts)))) return;
        prisms.push({ h: 10 + ((n * 37 + pts.length * 11) % 9), pts, own: false, c });
      });
    }).catch(() => {}));

    Promise.all(loads).then(() => {
      if (my !== token) return;
      // с какой стороны смотреть: там, где между камерой и домом меньше всего чужих зданий; при равенстве — с юга
      const fp0 = (cv.clientHeight / 2) / Math.tan(FOV / 2);
      // расстояние: дом должен занять свободную от текста часть кадра (около 0,36 ширины экрана в каждую сторону)
      const D = Math.max(60, Math.min(430, ext * fp0 / (0.36 * cv.clientWidth)));
      const eye = Math.max(EYE, D * 0.03); // издалека камера стоит чуть выше, иначе большой дом сливается в полоску
      let best = null;
      for (let k = 0; k < 16; k++) {
        const az = Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8; // от юга по сторонам
        const px = cx0 + Math.sin(az) * D, py = cy0 + Math.cos(az) * D;
        let block = 0;
        prisms.forEach(b => { if (b.own) return; const t = Math.max(0, Math.min(1, ((b.c[0] - px) * (cx0 - px) + (b.c[1] - py) * (cy0 - py)) / (D * D)));
          const d = Math.hypot(b.c[0] - (px + (cx0 - px) * t), b.c[1] - (py + (cy0 - py) * t)); if (d < 30 && t < 0.9) block += 1; if (Math.hypot(b.c[0] - px, b.c[1] - py) < 25) block += 3; });
        if (!best || block < best.block) best = { block, px, py };
      }
      // то, что стоит между камерой и домом и загораживает его, не рисуется
      const bx = cx0 - best.px, by = cy0 - best.py;
      for (let i = prisms.length - 1; i >= 0; i--) { const b = prisms[i]; if (b.own) continue;
        const t = ((b.c[0] - best.px) * bx + (b.c[1] - best.py) * by) / (D * D), d = Math.hypot(b.c[0] - (best.px + bx * t), b.c[1] - (best.py + by * t));
        const nearCam = b.pts.some(q => Math.hypot(q[0] - best.px, q[1] - best.py) < Math.max(60, D * 0.25)); // здание вплотную к камере закрыло бы полкадра
        if (nearCam || (t > -0.1 && t < 1 && d < ext * Math.max(0.25, t) + 25)) prisms.splice(i, 1); }
      const W = () => cv.clientWidth, Hh = () => cv.clientHeight;
      const mpp = 40075016.686 * kx / Math.pow(2, map.getZoom() + 8);
      const startPt = map.latLngToContainerPoint([lat0 + cy0 / 111320, lon0 + cx0 / (111320 * kx)]);
      const t0 = performance.now() + 900; // сначала карта подлетает к дому, потом камера опускается
      setTimeout(() => { if (my === token) cv.style.opacity = 1; }, 700);
      const frame = now => {
        if (my !== token) return;
        const dpr = window.devicePixelRatio || 1, w = W(), h = Hh();
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const fpx = (h / 2) / Math.tan(FOV / 2), h0 = mpp * fpx;
        const raw = Math.max(0, Math.min(1, (now - t0) / 4200)), t = ease(raw), sway = Math.sin((now - t0) / 5200) * 0.06 * (raw >= 1 ? 1 : raw);
        // камера: из точки над домом — к точке на земле перед домом; высота падает быстрее в конце
        const ex = best.px + Math.cos((now - t0) / 5200) * 0 + (cy0 - best.py) * sway, ey = best.py - (cx0 - best.px) * sway;
        const C = [mix(cx0, ex, t), mix(cy0 - 0.01, ey, t), mix(h0, eye, Math.pow(t, 0.75))];
        const T = [cx0, cy0, mix(0, H * 0.42, t)];
        const f = norm(sub(T, C)), upHint = norm([0, 1 - t, t]);
        const r = norm(cross(f, upHint)), u = cross(r, f);
        const pcx = mix(startPt.x, w >= 760 ? w * 0.66 : w * 0.5, t), pcy = mix(startPt.y, w >= 760 ? h * 0.56 : h * 0.36, t);
        const cam = p => { const d = sub(p, C); return [dot(d, r), dot(d, u), dot(d, f)]; };
        const NEAR = 0.6;
        const clip = poly => { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ina = a[2] > NEAR, inb = b[2] > NEAR;
          if (ina) out.push(a); if (ina !== inb) { const k = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, NEAR]); } } return out; };
        const scr = p => [pcx + fpx * p[0] / p[2], pcy - fpx * p[1] / p[2]];
        // небо и земля
        const hz = pcy + fpx * (f[2] / Math.max(0.05, Math.hypot(f[0], f[1]))) * (t > 0.3 ? 1 : 0); // линия горизонта, когда камера уже наклонилась
        ctx.fillStyle = '#0e0f11'; ctx.fillRect(0, 0, w, h);
        if (t > 0.3 && hz > 0) { const g = ctx.createLinearGradient(0, 0, 0, Math.min(h, hz)); g.addColorStop(0, '#07070a'); g.addColorStop(1, '#17181d'); ctx.globalAlpha = Math.min(1, (t - 0.3) * 3); ctx.fillStyle = g; ctx.fillRect(0, 0, w, Math.min(h, hz)); ctx.globalAlpha = 1; }
        // грани
        const faces = [];
        prisms.forEach(b => {
          const n = b.pts.length, top = b.pts.map(p => cam([p[0], p[1], b.h])), bot = b.pts.map(p => cam([p[0], p[1], 0]));
          for (let i = 0; i < n; i++) { const j = (i + 1) % n, q = [bot[i], bot[j], top[j], top[i]];
            let lines = null;
            if (b.own) { lines = []; for (let k = 1; k < b.levels; k++) { const z = k * FLOOR; lines.push([cam([b.pts[i][0], b.pts[i][1], z]), cam([b.pts[j][0], b.pts[j][1], z])]); } }
            faces.push({ q, z: (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4, own: b.own, wall: true, lines }); }
          faces.push({ q: top, z: top.reduce((a, p) => a + p[2], 0) / n + 0.01, own: b.own, wall: false });
        });
        faces.sort((a, b) => b.z - a.z);
        faces.forEach(fc => {
          const q = clip(fc.q); if (q.length < 3) return;
          ctx.beginPath(); q.forEach((p, i) => { const s = scr(p); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath();
          ctx.fillStyle = fc.own ? (fc.wall ? '#2b1210' : '#1d1e23') : (fc.wall ? '#15161a' : '#1b1c20'); ctx.fill();
          ctx.lineWidth = fc.own ? 1.4 : 1; ctx.strokeStyle = fc.own ? '#ff3b2f' : '#2b2d33'; ctx.stroke();
          if (fc.lines) { ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,59,47,.28)'; ctx.beginPath();
            fc.lines.forEach(l => { const c = clip([l[0], l[1]]); if (c.length === 2) { const a = scr(c[0]), d = scr(c[1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(d[0], d[1]); } }); ctx.stroke(); }
        });
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }
  function hide() { token++; cancelAnimationFrame(raf); onPick = null; if (cv) { cv.style.opacity = 0; cv.style.pointerEvents = 'none'; } }
  return { show, hide };
})();
