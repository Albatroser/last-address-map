// Языки сайта: русский (основной), английский, испанский. Переключатель — в правом верхнем углу.
//
// Как устроено. Сайт собирает тексты по-русски, из данных (story.js, map.js). Русскую версию этот файл не трогает.
// Для английского и испанского есть словарь i18n_dict.js: «русский текст» → [английский, испанский]. Им пользуются двумя способами:
//   1) код карты спрашивает перевод сам — I18N.t (строка-шаблон), I18N.tp (слово по числу), I18N.v (значение поля базы),
//      I18N.tl (латиница для имён и адресов);
//   2) всё остальное (вступление, подписи на карте) переводится уже на странице, по блокам:
//      • блок — абзац, кнопка, подпись (ближайший предок текста, внутри которого нет других блоков);
//      • ключ словаря — русский текст блока, где числа заменены на «#», а теги оставлены без атрибутов: «<b>#</b> из них — …»;
//        ключ, который кончается на «…», совпадает с любым текстом, начинающимся так же (чтобы не повторять длинные абзацы);
//      • в переводе те же теги в том же порядке; числа подставляются обратно по порядку («#») или по номеру ({1}, {2});
//        английские — с запятой между тысячами и точкой в дробях; «[one|many]» — слово по числу, которое стоит перед ним;
//      • если для блока целиком перевода нет, переводится каждый его кусок текста отдельно;
//      • элементы страницы не пересоздаются (меняется только текст), поэтому обработчики и ссылки живы;
//      • за новым текстом следит MutationObserver: окна, подписи и счётчики переводятся по мере появления.
// Чего перевод не касается. Записи базы — место работы, место рождения, биография — на других языках пока не показываются
// (в русской версии они есть): это тысячи свободных записей о реальных людях, их перевод — отдельная работа. Переведены только поля
// с закрытым списком значений (место захоронения, национальность, партийность, орган, вынесший приговор) и записи тех людей,
// которые названы на слайдах. Обвинение в окне дома на других языках показано названием группы (как на слайде об обвинениях).
// Имена, адреса и названия улиц переданы латиницей. Названия источников не переводятся.
// Пропуски: если русский текст остался без перевода, он попадает в window.I18N_MISS.
const I18N = (() => {
  const qs = new URLSearchParams(location.search), LANGS = ['ru', 'en', 'es'];
  let lang = qs.get('lang');
  try { if (!LANGS.includes(lang)) lang = localStorage.getItem('lang'); } catch (e) { /* хранилище недоступно */ }
  if (!LANGS.includes(lang)) { const n = (navigator.language || 'ru').toLowerCase(); lang = n.indexOf('es') === 0 ? 'es' : /^(ru|uk|be|kk)/.test(n) ? 'ru' : 'en'; }
  const ru = lang === 'ru', col = lang === 'en' ? 0 : 1;
  document.documentElement.lang = lang;
  const SRC = window.I18N_T || {}, PRE = [];
  if (!ru) Object.keys(SRC).forEach(k => { if (k.slice(-1) === '…') PRE.push([k.slice(0, -1), SRC[k][col]]); });
  const get = k => { if (ru) return undefined; const e = SRC[k]; if (e !== undefined) return e[col]; if (k.length > 30) for (const p of PRE) if (k.indexOf(p[0]) === 0) return p[1]; return undefined; };
  const CYR = /[А-Яа-яЁё]/, NUM = /\d+(?:[  ]\d{3})*(?:,\d+)?/g;
  const INLINE = new Set(['B', 'I', 'SPAN', 'A', 'EM', 'STRONG', 'SMALL', 'U', 'BR', 'SUP', 'SUB']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'CANVAS', 'SVG']);
  const MISS = {};
  const numOut = s => lang === 'en' ? String(s).replace(/[  ]/g, ',').replace(/,(\d{1,2})(?=\D*$)/, '.$1') : String(s);
  // Латиница для имён и адресов: «е» в начале слова и после гласной — ye, окончания -ый/-ий — y.
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const up = (ch, t) => ch === ch.toLowerCase() ? t : t.charAt(0).toUpperCase() + t.slice(1);
  const translit = s => String(s)
    .replace(/(ы|и)й(?![А-Яа-яЁё])/g, (m, a) => a === 'ы' ? 'y' : 'iy')
    .replace(/(^|[^А-Яа-яЁё]|[аеёиоуыэюяъьАЕЁИОУЫЭЮЯЪЬ])([Ее])/g, (m, a, e) => a + up(e, 'ye'))
    .replace(/[А-Яа-яЁё]/g, ch => { const l = ch.toLowerCase(); return up(ch, TR[l] === undefined ? ch : TR[l]); });
  const tl = s => ru ? s : translit(s);
  // подстановка в перевод: «#» — по порядку, {n} — по номеру, [one|many] — по числу, подставленному перед этим
  const fill = (tpl, nums) => { let i = 0, last = '';
    return tpl.replace(/\{(\d+)\}|#|\[([^\[\]|]*)\|([^\[\]|]*)\]/g, (m, k, one, many) => { if (one !== undefined) return String(last).replace(/\s/g, '') === '1' ? one : many;
      const v = nums[k ? +k - 1 : i++]; if (v === undefined) return m; last = v; return numOut(v); }); };
  // строка-шаблон из кода: по-русски возвращается как есть (с подставленными числами)
  const t = (s, ...a) => { const r = get(s); if (r === undefined && !ru) MISS[s] = 1; const tpl = r === undefined ? s : r; return a.length ? fill(tpl, a.map(String)) : tpl; };
  // слово по числу: в русском три формы, в словаре для других языков — пара «[одна форма, много]» под ключом «a|b|c»
  const tp = (n, a, b, c) => { if (ru) { const d = n % 10, h = n % 100; return d === 1 && h !== 11 ? a : d >= 2 && d <= 4 && (h < 10 || h >= 20) ? b : c; }
    const f = get(a + '|' + b + '|' + c); if (!f) { MISS[a + '|' + b + '|' + c] = 1; return c; } return n === 1 ? f[0] : f[1]; };
  // значение поля базы (национальность, место захоронения…): перевод, если значение есть в словаре, иначе как в источнике
  const v = s => { if (ru || !s) return s; const nums = [], k = String(s).replace(NUM, m => { nums.push(m); return '#'; }), r = get(k); return r === undefined ? s : fill(r, nums); };

  // ---------- перевод блоков страницы ----------
  const keyOf = (el, nums) => { let k = '';
    el.childNodes.forEach(n => { if (n.nodeType === 3) k += n.data.replace(NUM, m => { nums.push(m); return '#'; });
      else if (n.nodeType === 1) k += n.tagName === 'BR' ? '<br>' : '<' + n.tagName.toLowerCase() + '>' + keyOf(n, nums) + '</' + n.tagName.toLowerCase() + '>'; });
    return k; };
  const blocky = el => { for (const c of el.children) if (!INLINE.has(c.tagName)) return true; return false; };
  // блок, к которому относится текст: первый не строчный предок; если в нём есть другие блоки — самый верхний строчный предок
  const unitOf = node => { let e = node.parentElement, top = node; if (!e) return null;
    while (INLINE.has(e.tagName) && e.parentElement) { top = e; e = e.parentElement; }
    return blocky(e) ? top : e; };
  const nameCtx = n => { const p = n.parentElement; return !!p && (/^(B|H3|H4)$/.test(p.tagName) || /(^| )(n|name)( |$)/.test(p.className || '')) && n.data.length <= 90; };
  const addrLike = s => s.length < 70 && s.indexOf('·') < 0 && /(^|\s)(ул|пер|пл|наб|просп|ш|пр|туп)\.|б-р|(^|\s)вал(,|$)/.test(s);
  // перенос текста из шаблона перевода в настоящий элемент: элементы остаются те же, меняются только текстовые узлы
  const sync = (real, tpl) => { const els = [...real.children], want = [...tpl.children];
    if (els.length !== want.length || els.some((e, i) => e.tagName !== want[i].tagName)) return false;
    [...real.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); });
    let k = 0, ok = true;
    tpl.childNodes.forEach(n => { if (n.nodeType === 3) real.insertBefore(document.createTextNode(n.data), els[k] || null); else if (n.nodeType === 1) { if (!sync(els[k], n)) ok = false; k++; } });
    return ok; };
  const seg = n => { // один кусок текста: словарь; иначе имя или адрес — латиницей; название источника — как есть
    if (!CYR.test(n.data)) return true;
    const nums = [], k = n.data.replace(NUM, m => { nums.push(m); return '#'; }), m = /^([\s—–·]*)([\s\S]*?)(\s*)$/.exec(k);
    let r = get(k), a = '', z = '';
    if (r === undefined && m[2] !== k) { r = get(m[2]); a = m[1]; z = m[3]; }
    if (r !== undefined) { n.data = a + fill(r, nums) + z; return true; }
    if (n.parentElement && n.parentElement.closest('a[href^="http"], .src')) return true;
    if (nameCtx(n) || addrLike(m[2])) { n.data = translit(n.data); return true; }
    // Запись базы без перевода (работа, место рождения) на других языках не показывается (решение Ильи 2026-11-21):
    // от строки «годы · запись» остаются годы, пустая строка и строка «подпись: запись» скрываются целиком.
    const p = n.parentElement, data = p && p.closest('.pp, .born-list, .row, .line, .job, .ans');
    if (!data) { MISS[k] = 1; return false; }
    const cut = /^(.*\d)\s*·\s*[^·]*$/.exec(n.data);
    n.data = cut ? cut[1] : '';
    if (!n.data.trim()) { if (/(^| )row( |$)/.test(p.className || '') || (p.tagName === 'SPAN' && !p.textContent.trim())) (p.tagName === 'SPAN' ? p : p).style.display = 'none'; else if (p.tagName === 'P' && !p.textContent.trim()) p.style.display = 'none'; else if (n.previousSibling && n.previousSibling.nodeName === 'BR') n.previousSibling.remove(); }
    return true; };
  const done = new WeakMap();
  const unit = u => {
    if (u.nodeType === 3) { if (done.get(u) !== u.data) { seg(u); done.set(u, u.data); } return; }
    if (SKIP.has(u.tagName) || u.closest('[data-noi18n]')) return;
    if (done.get(u) === u.innerHTML || !CYR.test(u.textContent)) return;
    const nums = [], k = keyOf(u, nums), r = get(k);
    let ok = false;
    if (r !== undefined) { const tpl = document.createElement('template'); tpl.innerHTML = fill(r, nums); ok = sync(u, tpl.content); if (!ok) MISS['[теги не совпали] ' + k] = 1; }
    if (!ok) { const w = document.createTreeWalker(u, NodeFilter.SHOW_TEXT), list = []; while (w.nextNode()) list.push(w.currentNode); list.forEach(seg); }
    done.set(u, u.innerHTML);
  };
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const attrs = el => ATTRS.forEach(a => { const val = el.getAttribute && el.getAttribute(a); if (val && CYR.test(val)) { const r = get('@' + val); if (r !== undefined) el.setAttribute(a, r); else MISS['@' + val] = 1; } });
  // числа в подписях и крупных цифрах, где слов нет: по-английски тысячи отделяются запятой
  const THOU = /(\d)[  ](?=\d{3}(?!\d))/g, numFix = n => { if (lang === 'en' && /\d[  ]\d{3}/.test(n.data) && !(n.parentElement && n.parentElement.closest('[data-noi18n]'))) n.data = n.data.replace(THOU, '$1,'); };
  const scan = root => {
    if (root.nodeType === 3) { if (CYR.test(root.data)) { const u = unitOf(root); if (u) unit(u); } else numFix(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
    attrs(root); root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(attrs);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), set = new Set(), nums = [];
    while (w.nextNode()) { const n = w.currentNode; if (n.parentElement && SKIP.has(n.parentElement.tagName)) continue; if (CYR.test(n.data)) { const u = unitOf(n); if (u) set.add(u); } else nums.push(n); }
    nums.forEach(numFix);
    set.forEach(unit);
  };
  const start = () => {
    if (ru) return;
    const title = get('@title'); if (title !== undefined) document.title = title;
    scan(document.body);
    new MutationObserver(list => list.forEach(m => { if (m.type === 'characterData') scan(m.target); else { m.addedNodes.forEach(scan); if (m.addedNodes.length === 0 && m.target.nodeType === 1 && CYR.test(m.target.textContent || '')) scan(m.target); } }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  };

  // ---------- переключатель языка ----------
  const pick = l => { try { localStorage.setItem('lang', l); } catch (e) { /* без запоминания */ } const q = new URLSearchParams(location.search); q.set('lang', l); location.search = q.toString().replace(/=(&|$)/g, '$1'); };
  const sw = () => { const d = document.createElement('div'); d.id = 'lang'; d.setAttribute('data-noi18n', ''); d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Language');
    d.innerHTML = LANGS.map(l => '<button type="button" data-l="' + l + '"' + (l === lang ? ' class="on" aria-current="true"' : '') + '>' + l.toUpperCase() + '</button>').join('');
    d.addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.l !== lang) pick(b.dataset.l); });
    document.body.appendChild(d); };
  const boot = () => { sw(); start(); };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
  return { lang, ru, t, tp, v, tl, translit, num: numOut, MISS };
})();
window.I18N_MISS = I18N.MISS;
