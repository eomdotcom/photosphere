import { supabase } from './supabase.js';

/* ================= SETTINGS =================
   Same cut-offs as dashboard.js and student.html:
   score <= 30 Calm Orbit, <= 60 Steady Star, above 60 Solar Flare Zone. */
const CALM_MAX = 30;
const STEADY_MAX = 60;
// "Near a boundary" = within this many points of 30 or 60
const MARGIN = 5;

const ZONES = [
  { key: 'calm',   name: 'Calm Orbit',       blurb: 'No sign of extra attention needed right now', color: '#4fd1a5', light: '#c4f7e3', dark: '#06302a' },
  { key: 'steady', name: 'Steady Star',      blurb: 'Some signs worth keeping an eye on',          color: '#9b8dff', light: '#e2dcff', dark: '#1d1552' },
  { key: 'flare',  name: 'Solar Flare Zone', blurb: 'Several signs together, worth reviewing soon', color: '#ff9152', light: '#ffe0bf', dark: '#5b1608' },
];
const Z = Object.fromEntries(ZONES.map((z, i) => [z.key, { ...z, i }]));

/* ================= PAGE ELEMENTS ================= */
const $ = id => document.getElementById(id);
const statusEl = $('planet-status');
const weekButtons = $('week-buttons');
const stage = $('stage');
const wrap = $('stage-wrap');
const tip = $('tip');
const side = $('side');
const find = $('find');

const state = {
  allRows: [],       // every row from Supabase, fetched once
  week: null,
  students: [],      // this week's students: { id, name, score, zone, near }
  mode: 'overview',  // 'overview' (zoomed out) or 'zoom' (zoomed in)
  focus: null,       // which zone is zoomed in
  hover: null,       // last planet the mouse was over
};
let byId = new Map();

/* ================= DATA ================= */
// Same as dashboard.js: turns 5, "5" or "Week 5" into 5; blanks become null
function parseWeek(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function zoneFor(score) {
  if (score <= CALM_MAX) return 'calm';
  if (score <= STEADY_MAX) return 'steady';
  return 'flare';
}

// Is this student close enough to 30 or 60 that their zone could change?
function nearBoundary(s) {
  const options = [];
  if (s.zone === 'calm' && s.score > CALM_MAX - MARGIN) {
    options.push({ toward: 'steady', dir: 'up', line: CALM_MAX, dist: CALM_MAX - s.score });
  }
  if (s.zone === 'steady') {
    if (s.score <= CALM_MAX + MARGIN) options.push({ toward: 'calm', dir: 'down', line: CALM_MAX, dist: s.score - CALM_MAX });
    if (s.score > STEADY_MAX - MARGIN) options.push({ toward: 'flare', dir: 'up', line: STEADY_MAX, dist: STEADY_MAX - s.score });
  }
  if (s.zone === 'flare' && s.score <= STEADY_MAX + MARGIN) {
    options.push({ toward: 'steady', dir: 'down', line: STEADY_MAX, dist: s.score - STEADY_MAX });
  }
  if (!options.length) return null;
  options.sort((a, b) => a.dist - b.dist);
  return options[0];
}

const nearText = n =>
  `${n.dist.toFixed(1)} pts ${n.dir === 'up' ? 'under' : 'over'} the ${n.line} line, close to ${Z[n.toward].name}`;

async function loadStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('student_id, student_name, concern_score, week')
    .order('concern_score', { ascending: false })
    .range(0, 9999);

  if (error) {
    console.error('Error loading students:', error);
    statusEl.textContent = 'Could not load students: ' + error.message;
    return;
  }

  state.allRows = data;

  const weeks = [...new Set(
    data.map(row => parseWeek(row.week)).filter(w => w !== null)
  )].sort((a, b) => a - b);

  if (weeks.length === 0) {
    statusEl.textContent = 'No week values found in the data.';
    return;
  }

  weekButtons.innerHTML = '';
  weeks.forEach(week => {
    const btn = document.createElement('button');
    btn.textContent = `Week ${week}`;
    btn.dataset.week = week;
    btn.addEventListener('click', () => showWeek(week));
    weekButtons.appendChild(btn);
  });

  // Coming back from a student page keeps the same week (?week=3)
  const fromUrl = parseWeek(new URLSearchParams(location.search).get('week'));
  showWeek(weeks.includes(fromUrl) ? fromUrl : weeks[0]);
}

function showWeek(week) {
  state.week = week;
  weekButtons.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.week) === week);
  });
  history.replaceState(null, '', `?week=${week}`);

  const rows = state.allRows.filter(row => parseWeek(row.week) === week);
  let skipped = 0;
  state.students = [];

  rows.forEach(row => {
    const raw = row.concern_score;
    const score = Number(raw);
    // A blank score must not land in Calm Orbit (same rule as the dashboard)
    if (raw === null || raw === '' || Number.isNaN(score)) {
      skipped++;
      return;
    }
    const s = {
      id: String(row.student_id),
      name: row.student_name || `Student ${row.student_id}`,
      score,
      zone: zoneFor(score),
    };
    s.near = nearBoundary(s);
    state.students.push(s);
  });

  byId = new Map(state.students.map(s => [s.id, s]));
  $('student-names').innerHTML = state.students
    .map(s => `<option value="${esc(s.name)}">`).join('');

  const nearCount = state.students.filter(s => s.near).length;
  statusEl.textContent = `Showing week ${week}: ${state.students.length} students, ` +
    `${nearCount} within ${MARGIN} points of a zone line` +
    (skipped ? ` (${skipped} skipped, no score)` : '');

  draw();
}

/* ================= HELPERS ================= */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const initials = name => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const studentUrl = s => `student.html?id=${encodeURIComponent(s.id)}&week=${state.week}`;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));

// Students grouped by zone, highest score first
function zoneLists() {
  const lists = { calm: [], steady: [], flare: [] };
  state.students.forEach(s => lists[s.zone].push(s));
  Object.values(lists).forEach(list => list.sort((a, b) => b.score - a.score));
  return lists;
}
const countNear = list => list.filter(s => s.near).length;

/* ================= DRAWING ================= */
function draw() {
  hideTip();
  if (state.mode === 'zoom') drawZoom(state.focus);
  else drawOverview();
  drawSide();
  syncButtons();
}

// Fixed star field so it looks the same every time
function seeded(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const STARS = (() => {
  const r = seeded(42);
  let out = '<g aria-hidden="true">';
  for (let i = 0; i < 110; i++) {
    out += `<circle cx="${(r() * 1200).toFixed(0)}" cy="${(r() * 640).toFixed(0)}" r="${(r() * 1.3 + 0.3).toFixed(2)}" fill="#cdd8ff" opacity="${(r() * 0.5 + 0.1).toFixed(2)}"/>`;
  }
  return out + '</g>';
})();

function defs() {
  return `<defs>${ZONES.map(z => `
    <radialGradient id="pg-${z.key}" cx="36%" cy="30%" r="78%">
      <stop offset="0%" stop-color="${z.light}"/>
      <stop offset="38%" stop-color="${z.color}"/>
      <stop offset="100%" stop-color="${z.dark}"/>
    </radialGradient>`).join('')}
    <radialGradient id="shade" cx="32%" cy="28%" r="82%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity=".55"/>
    </radialGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <text class="chart-ref" x="18" y="26" aria-hidden="true">CHART REF: ARC-42 // SEC. 09</text>`;
}

let clipId = 0;
function planet(z, x, y, r, { count = 0, mini = false, label }) {
  const id = `clip${clipId++}`;
  const sw = mini ? 2 : 4;
  const ring = z.key === 'steady' ? { rx: r * 1.62, ry: r * 0.32 } : null;
  return `<g class="planet${mini ? ' mini' : ''}" data-zone="${z.key}" role="button" tabindex="0"
      aria-label="${esc(label)}" transform="translate(${x} ${y})">
    <circle r="${r + 20}" fill="${z.color}" opacity=".24" filter="url(#glow)"/>
    ${z.key === 'flare' ? `<circle r="${r + 9}" fill="none" stroke="${z.color}" stroke-width="${mini ? 3 : 6}" stroke-dasharray="2 10" stroke-linecap="round" opacity=".75"/>` : ''}
    ${ring ? `<ellipse transform="rotate(-16)" rx="${ring.rx}" ry="${ring.ry}" fill="none" stroke="${z.light}" stroke-opacity=".35" stroke-width="${sw}"/>` : ''}
    <clipPath id="${id}"><circle r="${r}"/></clipPath>
    <circle r="${r}" fill="url(#pg-${z.key})"/>
    <g clip-path="url(#${id})" opacity=".16">
      <ellipse cy="${-r * 0.38}" rx="${r * 1.3}" ry="${r * 0.08}" fill="#fff"/>
      <ellipse cy="${r * 0.12}" rx="${r * 1.3}" ry="${r * 0.05}" fill="#fff"/>
      <ellipse cy="${r * 0.55}" rx="${r * 1.3}" ry="${r * 0.12}" fill="#000"/>
    </g>
    <circle r="${r}" fill="url(#shade)"/>
    <ellipse cx="${-r * 0.38}" cy="${-r * 0.42}" rx="${r * 0.22}" ry="${r * 0.11}" fill="#fff" opacity=".3"
      transform="rotate(-32 ${-r * 0.38} ${-r * 0.42})"/>
    ${ring ? `<path transform="rotate(-16)" d="M ${-ring.rx} 0 A ${ring.rx} ${ring.ry} 0 0 0 ${ring.rx} 0" fill="none" stroke="${z.light}" stroke-opacity=".85" stroke-width="${sw}"/>` : ''}
    <circle class="planet-sel" r="${r + 7}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 6"/>
    ${mini ? '' : `
      <text class="planet-count" y="${(r * 0.1).toFixed(1)}" font-size="${Math.round(r * 0.46)}">${count}</text>
      <text class="planet-unit" y="${(r * 0.4).toFixed(1)}" font-size="${Math.max(11, Math.round(r * 0.15))}">student${count === 1 ? '' : 's'}</text>`}
  </g>`;
}

// One student as an initials chip. It's a real link to their details page.
function chip(s, x, y, r) {
  const z = Z[s.zone];
  const n = s.near;
  const nz = n ? Z[n.toward] : null;
  const label = `${s.name}, score ${s.score.toFixed(2)}, ${z.name}${n ? `, ${nearText(n)}` : ''}. Open student details.`;
  const arrow = n
    ? (n.dir === 'up' ? 'M -3 1.6 L 0 -2.6 L 3 1.6 Z' : 'M -3 -1.6 L 0 2.6 L 3 -1.6 Z')
    : '';
  const br = Math.max(6.5, r * 0.42);
  return `<a class="chip" href="${esc(studentUrl(s))}" data-id="${esc(s.id)}" aria-label="${esc(label)}"
      transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" style="--zc:${z.color}">
    ${n ? `<circle class="halo" r="${r + 5}" style="stroke:${nz.color}"/>` : ''}
    <circle class="chip-focus" r="${r + 8}"/>
    <circle class="chip-bg" r="${r}"/>
    <text class="chip-ini" dy=".35em" font-size="${Math.round(r * 0.68)}">${esc(initials(s.name))}</text>
    ${n ? `<g transform="translate(${(r * 0.8).toFixed(1)} ${(-r * 0.8).toFixed(1)})">
      <circle r="${br}" fill="${nz.color}" stroke="#0a1230" stroke-width="1.5"/>
      <path d="${arrow}" fill="#0a1230" transform="scale(${(br / 6.5).toFixed(2)})"/>
    </g>` : ''}
  </a>`;
}

/* ---- Zoomed out: three planets + only the students near a zone line ---- */
const OVERVIEW = { calm: { x: 230, y: 290 }, steady: { x: 600, y: 290 }, flare: { x: 970, y: 290 } };
const radiusFor = n => 52 + Math.min(58, Math.sqrt(n) * 8.5);
const MAX_PER_SIDE = 7;

function drawOverview() {
  const lists = zoneLists();
  let svg = defs() + STARS;

  ZONES.forEach(z => {
    const list = lists[z.key];
    const p = OVERVIEW[z.key];
    const r = radiusFor(list.length);
    const R = r + 46;
    const near = countNear(list);

    svg += `<circle class="orbit" cx="${p.x}" cy="${p.y}" r="${R}"/>`;
    svg += planet(z, p.x, p.y, r, {
      count: list.length,
      label: `${z.name}: ${list.length} students, ${near} near a zone line. Show everyone in this zone.`,
    });

    // Near-line students sit on the side of the orbit that faces the zone they're close to
    const groups = {};
    list.filter(s => s.near).forEach(s => (groups[s.near.toward] ||= []).push(s));

    Object.entries(groups).forEach(([toward, group]) => {
      group.sort((a, b) => a.near.dist - b.near.dist);
      const centre = Z[toward].i > z.i ? 0 : 180; // right side or left side
      const step = 25;
      const shown = group.slice(0, MAX_PER_SIDE);
      const extra = group.length - shown.length;
      const slot = k => centre + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step);

      shown.forEach((s, k) => {
        const a = slot(k) * Math.PI / 180;
        svg += chip(s, p.x + R * Math.cos(a), p.y + R * Math.sin(a), 18);
      });

      if (extra > 0) {
        const a = slot(shown.length) * Math.PI / 180;
        svg += `<g class="more" role="button" tabindex="0" data-zone="${z.key}"
            aria-label="${extra} more near a zone line in ${esc(z.name)}. Show everyone."
            transform="translate(${(p.x + R * Math.cos(a)).toFixed(1)} ${(p.y + R * Math.sin(a)).toFixed(1)})">
          <circle r="18"/><text dy=".35em">+${extra}</text></g>`;
      }
    });

    svg += `<text class="lbl-name" x="${p.x}" y="502">${esc(z.name)}</text>`;
    svg += `<text class="lbl-sub" x="${p.x}" y="526">${near ? `${near} near a zone line` : 'No one near a zone line'}</text>`;
  });

  svg += `<text class="hint" x="600" y="606">Only students close to a zone line are shown. Select a planet or press + to see everyone.</text>`;
  stage.innerHTML = svg;
}

/* ---- Zoomed in: everyone in one zone, in compact rings ---- */
function ringLayout(n, first, step, spacing) {
  if (!n) return [];
  const caps = [];
  let total = 0;
  let r = first;
  while (total < n) {
    const c = Math.floor(2 * Math.PI * r / spacing);
    caps.push({ r, c });
    total += c;
    r += step;
  }
  let left = n;
  return caps.map((cap, i) => {
    const k = i === caps.length - 1 ? left : Math.min(cap.c, Math.round(n * cap.c / total));
    left -= k;
    return { ...cap, k };
  });
}

function drawZoom(key) {
  const lists = zoneLists();
  const z = Z[key];
  const list = lists[key];
  let svg = defs() + STARS;

  // The other two planets, small, in the corners (click to switch)
  const others = ZONES.filter(o => o.key !== key);
  const corners = [{ x: 110, y: 112 }, { x: 1090, y: 112 }];
  others.forEach((o, j) => {
    const p = corners[j];
    const n = lists[o.key].length;
    svg += planet(o, p.x, p.y, 34, { mini: true, label: `Switch to ${o.name}, ${n} students` });
    svg += `<text class="mini-name" x="${p.x}" y="${p.y + 62}">${esc(o.name)}</text>`;
    svg += `<text class="mini-sub" x="${p.x}" y="${p.y + 80}">${n} students</text>`;
  });

  const cx = 600, cy = 330, pr = 92, cr = 15;
  const rings = ringLayout(list.length, 145, 37, 37);
  rings.forEach(rg => { svg += `<circle class="orbit" cx="${cx}" cy="${cy}" r="${rg.r}"/>`; });
  svg += planet(z, cx, cy, pr, { count: list.length, label: `${z.name}, ${list.length} students. Back to boundary view.` });

  let idx = 0;
  rings.forEach((rg, ri) => {
    for (let j = 0; j < rg.k; j++) {
      const a = (-90 + (j + (ri % 2) * 0.5) * 360 / rg.k) * Math.PI / 180;
      svg += chip(list[idx], cx + rg.r * Math.cos(a), cy + rg.r * Math.sin(a), cr);
      idx++;
    }
  });

  if (!list.length) svg += `<text class="lbl-sub" x="${cx}" y="${cy + pr + 50}">No students in this zone this week</text>`;
  svg += `<text class="lbl-title" x="${cx}" y="42">${esc(z.name)}</text>`;
  svg += `<text class="lbl-sub" x="${cx}" y="66">Highest score at the top of the inner ring, then clockwise</text>`;
  stage.innerHTML = svg;
}

/* ---- Side panel: the same students as a plain list ---- */
function row(s) {
  const z = Z[s.zone];
  const n = s.near;
  return `<li><a href="${esc(studentUrl(s))}" data-id="${esc(s.id)}" style="--c:${z.color}">
    <span class="pl-ini" aria-hidden="true">${esc(initials(s.name))}</span>
    <span class="pl-name">${esc(s.name)}</span>
    <span class="pl-score">${s.score.toFixed(2)}</span>
    <span class="pl-arrow" style="--c:${n ? Z[n.toward].color : 'transparent'}" ${n ? `title="${esc(nearText(n))}"` : ''}>${n ? (n.dir === 'up' ? '&#9650;' : '&#9660;') : ''}<span class="sr-only">${n ? ', ' + esc(nearText(n)) : ''}</span></span>
  </a></li>`;
}

function drawSide() {
  const lists = zoneLists();
  let h = '';

  if (state.mode === 'overview') {
    h += `<h2>Near a zone line</h2>
      <p>Within ${MARGIN} points of ${CALM_MAX} or ${STEADY_MAX}, so their zone could change. A reason to look, not a verdict.</p>`;
    const pairs = [['calm', 'steady'], ['steady', 'calm'], ['steady', 'flare'], ['flare', 'steady']];
    let any = false;
    pairs.forEach(([from, to]) => {
      const group = lists[from]
        .filter(s => s.near && s.near.toward === to)
        .sort((a, b) => a.near.dist - b.near.dist);
      if (!group.length) return;
      any = true;
      h += `<h3><span class="pl-dot" style="--c:${Z[from].color}"></span>${Z[from].name}
        <span class="pl-soft">close to</span> ${Z[to].name}</h3>
        <ul class="pl-rows">${group.map(row).join('')}</ul>`;
    });
    if (!any) h += `<p class="pl-empty">No one is within ${MARGIN} points of a zone line this week.</p>`;
    h += `<div class="pl-zone-btns">${ZONES.map(z => `
      <button class="pl-zone-btn" data-zone="${z.key}" style="--c:${z.color}">
        <span class="pl-dot"></span>See everyone in ${z.name}<span class="n">${lists[z.key].length}</span>
      </button>`).join('')}</div>`;
    h += `<p class="pl-keys"><kbd>+</kbd> / <kbd>&minus;</kbd> zoom &middot; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> switch planet when zoomed in &middot; <kbd>Esc</kbd> back</p>`;
  } else {
    const z = Z[state.focus];
    const list = lists[state.focus];
    h += `<button class="pl-btn pl-back" data-action="out">&larr; Boundary view</button>`;
    h += `<h2>${z.name}</h2><p>${z.blurb}. ${list.length} student${list.length === 1 ? '' : 's'}, highest score first.</p>`;
    h += list.length
      ? `<ul class="pl-rows">${list.map(row).join('')}</ul>`
      : `<p class="pl-empty">No students in this zone this week.</p>`;
  }

  side.innerHTML = h;
  side.scrollTop = 0;
}

function syncButtons() {
  $('zoom-out').disabled = state.mode === 'overview';
  $('zoom-in').disabled = state.mode === 'zoom';
}

/* ================= ZOOM =================
   Only the view zooms. The student chips themselves never move or animate. */
const FULL = [0, 0, 1200, 640];
let viewBox = [...FULL];
let busy = false;

const setViewBox = v => {
  viewBox = v;
  stage.setAttribute('viewBox', v.map(n => n.toFixed(2)).join(' '));
};

function animateViewBox(to, ms) {
  if (reduceMotion) { setViewBox(to); return Promise.resolve(); }
  const from = [...viewBox];
  const t0 = performance.now();
  return new Promise(done => {
    const tick = t => {
      const k = Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      setViewBox(from.map((f, i) => f + (to[i] - f) * e));
      if (k < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
}

const boxAround = (x, y, R) => {
  const h = R * 2;
  const w = h * 1200 / 640;
  return [x - w / 2, y - h / 2, w, h];
};

const focusPlanet = key =>
  stage.querySelector(`.planet[data-zone="${key}"]:not(.mini)`)?.focus({ preventScroll: true });

// Which zone "+" opens if no planet is picked: the one with most students near a line
function defaultZone() {
  const lists = zoneLists();
  const weight = k => countNear(lists[k]) * 100 + lists[k].length;
  return ZONES.map(z => z.key).sort((a, b) => weight(b) - weight(a))[0];
}

const focusInside = () => wrap.contains(document.activeElement) || side.contains(document.activeElement);

async function zoomTo(key) {
  if (busy || (state.mode === 'zoom' && state.focus === key)) return;
  busy = true;
  hideTip();
  const hadFocus = focusInside();
  stage.classList.add('fading');
  if (state.mode === 'overview') {
    const p = OVERVIEW[key];
    await animateViewBox(boxAround(p.x, p.y, radiusFor(zoneLists()[key].length) + 80), 320);
  } else {
    await wait(reduceMotion ? 0 : 150);
  }
  state.mode = 'zoom';
  state.focus = key;
  setViewBox(FULL);
  draw();
  stage.classList.remove('fading');
  if (hadFocus) focusPlanet(key);
  busy = false;
}

async function zoomOut() {
  if (busy || state.mode === 'overview') return;
  busy = true;
  const key = state.focus;
  const hadFocus = focusInside();
  state.mode = 'overview';
  state.focus = null;
  draw();
  const p = OVERVIEW[key];
  setViewBox(boxAround(p.x, p.y, radiusFor(zoneLists()[key].length) + 80));
  await animateViewBox(FULL, 360);
  if (hadFocus) focusPlanet(key);
  busy = false;
}

/* ================= TOOLTIP + HIGHLIGHT ================= */
function showTip(a) {
  const s = byId.get(a.dataset.id);
  if (!s) return;
  tip.innerHTML = `<strong>${esc(s.name)}</strong>Score ${s.score.toFixed(2)} &middot; ${esc(Z[s.zone].name)}` +
    (s.near ? `<span class="t-near">${esc(nearText(s.near))}</span>` : '') +
    `<span class="t-open">Open student details &rarr;</span>`;
  const r = a.getBoundingClientRect();
  const w = wrap.getBoundingClientRect();
  const below = r.top - w.top < 110;
  tip.classList.toggle('below', below);
  tip.style.left = `${Math.min(Math.max(r.left + r.width / 2 - w.left, 130), w.width - 130)}px`;
  tip.style.top = `${below ? r.bottom - w.top : r.top - w.top}px`;
  tip.classList.add('show');
}

function hideTip() {
  tip.classList.remove('show');
}

// Hovering a name in the list lights up the matching chip, and the other way round
function highlight(id) {
  document.querySelectorAll('.is-hot').forEach(el => el.classList.remove('is-hot'));
  if (!id) return;
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach(el => el.classList.add('is-hot'));
}

/* ================= EVENTS ================= */
stage.addEventListener('pointerover', e => {
  const a = e.target.closest('.chip');
  if (a) { showTip(a); highlight(a.dataset.id); }
  const p = e.target.closest('.planet');
  if (p && !p.classList.contains('mini')) state.hover = p.dataset.zone;
});
stage.addEventListener('pointerout', e => {
  if (e.target.closest('.chip') && !e.relatedTarget?.closest?.('.chip')) { hideTip(); highlight(null); }
});
stage.addEventListener('focusin', e => {
  const a = e.target.closest('.chip');
  if (a) { showTip(a); highlight(a.dataset.id); }
});
stage.addEventListener('focusout', () => { hideTip(); highlight(null); });

function activate(el) {
  const zone = el.dataset.zone;
  if (state.mode === 'zoom' && zone === state.focus) zoomOut();
  else zoomTo(zone);
}
stage.addEventListener('click', e => {
  const el = e.target.closest('.planet, .more');
  if (el) activate(el);
});
stage.addEventListener('keydown', e => {
  const el = e.target.closest('.planet, .more');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(el); }
});
// Ctrl + scroll (or trackpad pinch) zooms; plain scroll still scrolls the page
stage.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  if (e.deltaY < 0 && state.mode === 'overview') {
    zoomTo(e.target.closest('.planet')?.dataset.zone || state.hover || defaultZone());
  } else if (e.deltaY > 0) {
    zoomOut();
  }
}, { passive: false });

side.addEventListener('click', e => {
  const zb = e.target.closest('.pl-zone-btn');
  if (zb) zoomTo(zb.dataset.zone);
  if (e.target.closest('[data-action="out"]')) zoomOut();
});
side.addEventListener('pointerover', e => highlight(e.target.closest('a[data-id]')?.dataset.id));
side.addEventListener('pointerleave', () => highlight(null));
side.addEventListener('focusin', e => highlight(e.target.closest('a[data-id]')?.dataset.id));

$('zoom-in').addEventListener('click', () => zoomTo(state.hover || defaultZone()));
$('zoom-out').addEventListener('click', zoomOut);

document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    if (state.mode === 'overview') zoomTo(state.hover || defaultZone());
  } else if (e.key === '-' || e.key === '_' || e.key === 'Escape') {
    if (state.mode === 'zoom') { e.preventDefault(); zoomOut(); }
  } else if (state.mode === 'zoom' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !side.contains(e.target)) {
    e.preventDefault();
    const i = Z[state.focus].i;
    const d = e.key === 'ArrowRight' ? 1 : -1;
    zoomTo(ZONES[(i + d + ZONES.length) % ZONES.length].key);
  }
});

// Search: jump to a student's planet and point them out
async function findStudent() {
  const q = find.value.trim().toLowerCase();
  if (!q) return;
  const s = state.students.find(s => s.name.toLowerCase() === q) ||
            state.students.find(s => s.name.toLowerCase().includes(q));
  if (!s) {
    statusEl.textContent = `No student matching "${find.value}" in week ${state.week}.`;
    return;
  }
  await zoomTo(s.zone);
  const a = stage.querySelector(`.chip[data-id="${CSS.escape(s.id)}"]`);
  if (a) {
    a.classList.add('found');
    a.focus({ preventScroll: true });
    showTip(a);
    setTimeout(() => a.classList.remove('found'), 3000);
  }
}
find.addEventListener('input', () => {
  const q = find.value.trim().toLowerCase();
  if (state.students.some(s => s.name.toLowerCase() === q)) findStudent();
});
find.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); findStudent(); }
});

syncButtons();
loadStudents();
