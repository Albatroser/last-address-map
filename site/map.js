// Черновая карта: дома Москвы, жильцы которых были расстреляны. Данные: data/moscow_points.json
const map = L.map('map', { preferCanvas: true }).setView([55.7539, 37.6208], 12);

// Подложки. CARTO требует ключ, OSM блокирует часть запросов — поэтому выбор вручную, справа вверху.
const INVERT = 'invert(1) hue-rotate(180deg) brightness(.8) contrast(.9) grayscale(.6)';
const TILES = {
  'Esri тёмная': ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', '&copy; Esri', ''],
  'Esri улицы': ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', '&copy; Esri', INVERT],
  'Яндекс': ['https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=ru_RU', '&copy; Яндекс', INVERT],
  'OpenStreetMap': ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap', INVERT],
};
const layers = {};
for (const k in TILES) {
  const t = TILES[k];
  layers[k] = L.tileLayer(t[0], { maxZoom: 19, attribution: t[1] });
  layers[k]._filter = t[2];
}
L.control.layers(layers, null, { position: 'topright', collapsed: false }).addTo(map);
map.on('baselayerchange', e => {
  document.querySelector('.leaflet-tile-pane').style.filter = e.layer._filter;
  document.getElementById('tl').textContent = 'Подложка: ' + e.name;
});
layers['Esri тёмная'].addTo(map);
document.getElementById('tl').textContent = 'Подложка: Esri тёмная (сменить — справа вверху)';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

fetch('data/moscow_points.json').then(r => r.json()).then(D => {
  let people = 0;
  D.forEach(([lat, lon, addr, ppl]) => {
    people += ppl.length;
    const m = L.circleMarker([lat, lon], { radius: 3 + Math.sqrt(ppl.length) * 2.2, color: '#ff3b2f', weight: 1, fillColor: '#ff3b2f', fillOpacity: .45 });
    m.bindPopup(() => '<div class="pp"><h3>' + esc(addr) + ' — ' + ppl.length + ' чел.</h3>' +
      ppl.map(([apt, name, by, ex, bur, job]) => '<div class="p"><span class="n">' + esc(name) + '</span>' + (by ? ', ' + by + ' г.р.' : '') +
        '<br>кв. ' + esc(apt) + ' · расстрелян(а) ' + esc(ex) + (bur ? ' · ' + esc(bur) : '') + '<br><span class="m">' + esc(job) + '</span></div>').join('') + '</div>', { maxWidth: 360 });
    m.addTo(map);
  });
  document.getElementById('cnt').textContent = D.length.toLocaleString('ru') + ' домов, ' + people.toLocaleString('ru') + ' человек (из 11 789: у остальных нет координат)';
}).catch(e => {
  document.getElementById('cnt').textContent = 'Данные не загрузились: ' + e.message + '. Страницу нужно открывать через веб-сервер, а не как файл.';
});
