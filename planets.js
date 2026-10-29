import { supabase } from './supabase.js';
import {
  CALM_MAX, STEADY_MAX, MARGIN, ZONES as BASE_ZONES,
  parseWeek, weekList, previousWeek, studentsForWeek,
  nearText, movedTag, movedText, uniqueInitials, updateViewSwitch, renderSummary,
} from './zones.js';
import { loadCases, caseFor, stageLabel } from './cases.js';

/* ================= SETTINGS =================
   The zone rules (30 / 60 cut-offs, 5-point margin) live in zones.js,
   shared with the list view. Planet colours are only needed here. */
const PLANET_COLOURS = {
  calm:   { color: '#4fd1a5', light: '#c4f7e3', dark: '#06302a' },
  steady: { color: '#9b8dff', light: '#e2dcff', dark: '#1d1552' },
  flare:  { color: '#ff9152', light: '#ffe0bf', dark: '#5b1608' },
};
const ZONES = BASE_ZONES.map(z => ({ ...z, ...PLANET_COLOURS[z.key] }));
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
  weeks: [],         // every week in the data, e.g. [1, 3, 5]
  week: null,
  prevWeek: null,    // the week before, to compare zones with
  labels: new Map(), // student id -> unique initials for this week
  students: [],      // this week's students: { id, name, score, zone, near }
  mode: 'overview',  // 'overview' (zoomed out) or 'zoom' (zoomed in)
  lens: 'near',      // zoomed out: 'near' (near a zone line) or 'moved' (changed zone)
  focus: null,       // which zone is zoomed in
  hover: null,       // last planet the mouse was over
};
let byId = new Map();
let cases = new Map(); // student id -> latest case (Solar Flare case status)

/* ================= DATA ================= */
async function loadStudents() {
  // Case status badges (if the table isn't set up yet, the planets still work without them)
  ({ cases } = await loadCases());

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

  const weeks = weekList(data);
  state.weeks = weeks;

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

  updateViewSwitch(week);

  state.prevWeek = previousWeek(state.weeks, week);
  const { students, skipped } = studentsForWeek(state.allRows, week, state.prevWeek);
  state.students = students;

  byId = new Map(state.students.map(s => [s.id, s]));
  state.labels = uniqueInitials(state.students);
  $('student-names').innerHTML = state.students
    .map(s => `<option value="${esc(s.name)}">`).join('');

  state.skipped = skipped;
  showSummary();

  draw();
}

// Summary chips under the week buttons (an optional note, e.g. "No match for …")
function showSummary(note = null) {
  renderSummary(statusEl, {
    total: state.students.length,
    near: state.students.filter(s => s.near).length,
    moved: state.students.filter(s => s.moved).length,
    prevWeek: state.prevWeek,
    skipped: state.skipped,
    note,
  });
}

/* ================= HELPERS ================= */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const studentUrl = s => `student.html?id=${encodeURIComponent(s.id)}&week=${state.week}&from=planets`;
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
  wrap.classList.toggle('zoomed', state.mode === 'zoom');
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
// Covers the widest chart (MAX_W), so wide screens get stars right to the edge
const STARS = (() => {
  const r = seeded(42);
  let out = '<g aria-hidden="true">';
  for (let i = 0; i < 230; i++) {
    out += `<circle cx="${(r() * 2600 - 200).toFixed(0)}" cy="${(r() * 640).toFixed(0)}" r="${(r() * 1.3 + 0.3).toFixed(2)}" fill="#cdd8ff" opacity="${(r() * 0.5 + 0.1).toFixed(2)}"/>`;
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
  </defs>`;
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
    ${mini ? '' : (r < 70
      ? `<text class="planet-count" dy=".35em" font-size="${Math.round(r * 0.6)}">${count}</text>`
      : `<text class="planet-count" y="${(r * 0.1).toFixed(1)}" font-size="${Math.round(r * 0.46)}">${count}</text>
      <text class="planet-unit" y="${(r * 0.4).toFixed(1)}" font-size="${Math.round(r * 0.17)}">student${count === 1 ? '' : 's'}</text>`)}
  </g>`;
}

// One student as an initials chip (zoomed in). It's a real link to their details page.
// Same initials as the side panel and list; the score is in the tooltip and side panel.
function chip(s, x, y, r) {
  const z = Z[s.zone];
  const ini = state.labels.get(s.id);
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
    <text class="chip-ini" dy=".35em" font-size="${Math.round(r * (ini.length > 2 ? 0.62 : 0.78))}">${esc(ini)}</text>
    ${n ? `<g transform="translate(${(r * 0.8).toFixed(1)} ${(-r * 0.8).toFixed(1)})">
      <circle r="${br}" fill="${nz.color}" stroke="#0a1230" stroke-width="1.5"/>
      <path d="${arrow}" fill="#0a1230" transform="scale(${(br / 6.5).toFixed(2)})"/>
    </g>` : ''}
  </a>`;
}

// "Julian Harris" -> "Julian H." (falls back to the full name if two would look the same)
function shortNames(students) {
  const short = s => {
    const parts = s.name.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  };
  const counts = {};
  students.forEach(s => { counts[short(s)] = (counts[short(s)] || 0) + 1; });
  return new Map(students.map(s => [s.id, counts[short(s)] > 1 ? s.name : short(s)]));
}

// A name pill beside a zone line (zoomed out).
// side: 'left' or 'right' of the line. Its gap from the line shows how far the score is from it.
const PILL_H = 32;
function pill(s, label, lineX, y, side) {
  const z = Z[s.zone];
  const n = s.near;
  const gap = 6 + (Math.min(n.dist, MARGIN) / MARGIN) * 30; // 0 pts -> hugs the line, 5 pts -> 36px away
  const w = Math.round(label.length * 8.6 + 24);
  const x = side === 'left' ? lineX - gap - w : lineX + gap;
  const aria = `${s.name}, score ${s.score.toFixed(2)}, ${z.name}, ${nearText(n)}. Open student details.`;
  return `<a class="chip pill" href="${esc(studentUrl(s))}" data-id="${esc(s.id)}" aria-label="${esc(aria)}"
      transform="translate(${x.toFixed(1)} ${(y - PILL_H / 2).toFixed(1)})" style="--zc:${z.color}">
    <rect class="chip-focus" x="-5" y="-5" width="${w + 10}" height="${PILL_H + 10}" rx="${(PILL_H + 10) / 2}"/>
    <rect class="chip-bg" width="${w}" height="${PILL_H}" rx="${PILL_H / 2}"/>
    <text class="pill-text" x="${w / 2}" y="${PILL_H / 2}" dy=".35em">${esc(label)}</text>
  </a>`;
}

/* ---- Zoomed out: three planets, and the students near each zone line beside that line ---- */
/* The chart is always the same height. Its width W follows the shape of the card, so on a
   wide screen the planets and zone lines spread out to fill it instead of shrinking into
   the middle. Positions are fractions of W (they match the original 1200-wide layout). */
const CHART_H = 590; // drawn from y = 10 to 600 (trims empty space, so text is a bit bigger)
const CHART_TOP = 10;
const MIN_W = 1200;
const MAX_W = 2200;
let W = MIN_W;
const OVERVIEW = { calm: { y: 270 }, steady: { y: 270 }, flare: { y: 270 } };
const radiusFor = n => 38 + Math.min(22, Math.sqrt(n) * 3.5);
const ZONE_LINES = [
  { value: CALM_MAX,   below: 'calm',   above: 'steady' },
  { value: STEADY_MAX, below: 'steady', above: 'flare' },
];
function layout() {
  // Ends keep a fixed gap so the outer planets never touch the edge
  const edge = 105 + (W - MIN_W) * 0.06;
  OVERVIEW.calm.x = edge;
  OVERVIEW.steady.x = W / 2;
  OVERVIEW.flare.x = W - edge - 15;
  ZONE_LINES[0].x = W * (350 / 1200);
  ZONE_LINES[1].x = W * (850 / 1200);
}
layout();
const MAX_PER_SIDE = 7;
const PILL_STEP = 38;

// Students who changed zone across this line, ending up in zoneKey.
// A jump of two zones (Calm <-> Solar Flare) is shown at the line next to the new zone.
function crossedTo(line, zoneKey) {
  return state.students.filter(s => {
    if (!s.moved || s.zone !== zoneKey) return false;
    const from = Z[s.prev.zone].i, to = Z[s.zone].i;
    const lineIdx = ZONE_LINES.indexOf(line);       // 0 = 30 line (between 0 and 1), 1 = 60 line
    const crossed = to > from ? to - 1 : to;        // the line next to the new zone
    return crossed === lineIdx;
  });
}

// A name pill for someone who changed zone: arrow + name, coloured by direction
function movedPill(s, label, lineX, y, side) {
  const z = Z[s.zone];
  const text = label; // direction is shown by colour (amber up, teal down), not arrows
  const w = Math.round(text.length * 8.6 + 24);
  const x = side === 'left' ? lineX - 6 - w : lineX + 6;
  const aria = `${s.name}, ${movedText(s)}, now in ${z.name}. Open student details.`;
  return `<a class="chip pill moved-pill ${s.moved}" href="${esc(studentUrl(s))}" data-id="${esc(s.id)}" aria-label="${esc(aria)}"
      transform="translate(${x.toFixed(1)} ${(y - PILL_H / 2).toFixed(1)})" style="--zc:${z.color}">
    <rect class="chip-focus" x="-5" y="-5" width="${w + 10}" height="${PILL_H + 10}" rx="${(PILL_H + 10) / 2}"/>
    <rect class="chip-bg" width="${w}" height="${PILL_H}" rx="${PILL_H / 2}"/>
    <text class="pill-text" x="${w / 2}" y="${PILL_H / 2}" dy=".35em">${esc(text)}</text>
  </a>`;
}

function drawOverview() {
  const lists = zoneLists();
  const names = shortNames(state.students);
  let svg = defs() + STARS;

  // The planets
  ZONES.forEach(z => {
    const list = lists[z.key];
    const p = OVERVIEW[z.key];
    const near = countNear(list);
    svg += planet(z, p.x, p.y, radiusFor(list.length), {
      count: list.length,
      label: `${z.name}: ${list.length} students, ${near} near a zone line. Show everyone in this zone.`,
    });
    svg += `<text class="lbl-name" x="${p.x}" y="452">${esc(z.name)}</text>`;
    svg += `<text class="lbl-sub" x="${p.x}" y="480">${list.length} student${list.length === 1 ? '' : 's'}</text>`;
    const movedIn = list.filter(s => s.moved).length;
    if (state.prevWeek !== null && state.lens === 'moved') {
      svg += `<text class="lbl-moved" x="${p.x}" y="506">${movedIn ? `${movedIn} new since week ${state.prevWeek}` : `No change since week ${state.prevWeek}`}</text>`;
    }
  });

  // The zone lines. Beside each line: near-line students, or (Changed zone) students who crossed it
  const moved = state.lens === 'moved';
  ZONE_LINES.forEach(line => {
    const left = moved
      ? crossedTo(line, line.below)
      : lists[line.below].filter(s => s.near && s.near.toward === line.above);
    const right = moved
      ? crossedTo(line, line.above)
      : lists[line.above].filter(s => s.near && s.near.toward === line.below);

    svg += `<text class="line-num" x="${line.x}" y="88">${line.value}</text>`;
    svg += `<text class="line-cap" x="${line.x}" y="110">zone line</text>`;
    svg += `<line class="zone-line" x1="${line.x}" y1="124" x2="${line.x}" y2="420"/>`;

    if (!left.length && !right.length) {
      svg += `<text class="line-cap" x="${line.x}" y="275">${moved ? 'No one crossed this line' : `No one within ${MARGIN} points`}</text>`;
      return;
    }

    [[left, 'left', line.below], [right, 'right', line.above]].forEach(([group, side, zoneKey]) => {
      if (!group.length) return;
      if (moved) group.sort((a, b) => b.score - a.score);
      else group.sort((a, b) => a.near.dist - b.near.dist);
      const shown = group.slice(0, MAX_PER_SIDE);
      const extra = group.length - shown.length;
      const rows = shown.length + (extra > 0 ? 1 : 0);
      const top = OVERVIEW.steady.y - ((rows - 1) * PILL_STEP) / 2;

      shown.forEach((s, k) => {
        svg += moved
          ? movedPill(s, names.get(s.id), line.x, top + k * PILL_STEP, side)
          : pill(s, names.get(s.id), line.x, top + k * PILL_STEP, side);
      });

      if (extra > 0) {
        const y = top + shown.length * PILL_STEP;
        const x = side === 'left' ? line.x - 6 - 90 : line.x + 6;
        svg += `<g class="more" role="button" tabindex="0" data-zone="${zoneKey}"
            aria-label="${extra} more ${moved ? 'moved into' : `near the ${line.value} line in`} ${esc(Z[zoneKey].name)}. Show everyone."
            transform="translate(${x} ${(y - PILL_H / 2).toFixed(1)})">
          <rect width="90" height="${PILL_H}" rx="${PILL_H / 2}"/>
          <text x="45" y="${PILL_H / 2}" dy=".35em">+${extra} more</text></g>`;
      }
    });
  });

  // (explanations live in the help strip under the chart)
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
  const corners = [{ x: 110, y: 112 }, { x: W - 110, y: 112 }];
  others.forEach((o, j) => {
    const p = corners[j];
    const n = lists[o.key].length;
    svg += planet(o, p.x, p.y, 34, { mini: true, label: `Switch to ${o.name}, ${n} students` });
    svg += `<text class="mini-name" x="${p.x}" y="${p.y + 66}">${esc(o.name)}</text>`;
    svg += `<text class="mini-sub" x="${p.x}" y="${p.y + 88}">${n} students</text>`;
  });

  const cx = W / 2, cy = 340, pr = 88, cr = 18;
  const rings = ringLayout(list.length, 140, 44, 44);
  rings.forEach(rg => { svg += `<circle class="orbit" cx="${cx}" cy="${cy}" r="${rg.r}"/>`; });
  svg += planet(z, cx, cy, pr, { count: list.length, label: `${z.name}, ${list.length} students. Back to all planets.` });

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
// Name, plus the case stage badge for Solar Flare / open cases
function nameWithCase(s) {
  const info = caseFor(s, cases);
  const name = `<span class="pl-name">${esc(s.name)}</span>`;
  if (!info) return name;
  const title = info.auto ? 'Case: New (assigned automatically for the Solar Flare Zone)' : `Case: ${stageLabel(info.stage)}`;
  return `<span class="name-line">${name}<span class="case-pill stage-${info.stage}" title="${esc(title)}">${esc(stageLabel(info.stage))}</span></span>`;
}

function row(s, { showNear = true } = {}) {
  const z = Z[s.zone];
  const n = showNear ? s.near : null;
  return `<li><a href="${esc(studentUrl(s))}" data-id="${esc(s.id)}" style="--c:${z.color}">
    <span class="pl-ini${state.labels.get(s.id).length > 2 ? ' ini-3' : ''}" aria-hidden="true">${esc(state.labels.get(s.id))}</span>
    <span class="pl-who">${nameWithCase(s)}${s.moved ? `<span class="moved ${s.moved}" title="${esc(movedText(s))}">${esc(movedTag(s))}</span>` : ''}</span>
    <span class="pl-score">${s.score.toFixed(2)}</span>
    <span class="pl-arrow" style="--c:${n ? Z[n.toward].color : 'transparent'}" ${n ? `title="${esc(nearText(n))}"` : ''}>${n ? (n.dir === 'up' ? '&#9650;' : '&#9660;') : ''}<span class="sr-only">${n ? ', ' + esc(nearText(n)) : ''}</span></span>
  </a></li>`;
}

function drawSide() {
  const lists = zoneLists();
  let h = '';

  if (state.mode === 'overview') {
    // The chart already shows who's near a line / who moved; the panel shows who needs action
    const flare = lists.flare;
    h += `<h2>Needs action</h2>
      <p>Students in the Solar Flare Zone this week, highest score first, with their case stage.</p>`;
    h += flare.length
      ? `<ul class="pl-rows">${flare.map(s => row(s, { showNear: false })).join('')}</ul>`
      : `<p class="pl-empty">No one is in the Solar Flare Zone this week.</p>`;
  } else {
    const z = Z[state.focus];
    const list = lists[state.focus];
    h += `<button class="pl-btn pl-back" data-action="out">&larr; All planets</button>`;
    h += `<h2>${z.name}</h2><p>${z.blurb}. ${list.length} student${list.length === 1 ? '' : 's'}, highest score first.</p>`;
    h += list.length
      ? `<ul class="pl-rows">${list.map(row).join('')}</ul>`
      : `<p class="pl-empty">No students in this zone this week.</p>`;
  }

  side.innerHTML = h;
  side.scrollTop = 0;
}

// Highlight whichever view is showing: Everyone (zoomed in), Near a zone line, Changed zone
function syncButtons() {
  const movedBtn = $('lens-moved');
  const noEarlier = state.prevWeek === null;
  movedBtn.disabled = noEarlier;
  if (noEarlier && state.lens === 'moved') state.lens = 'near';

  $('zoom-in').setAttribute('aria-pressed', String(state.mode === 'zoom'));
  $('zoom-out').setAttribute('aria-pressed', String(state.mode === 'overview' && state.lens === 'near'));
  movedBtn.setAttribute('aria-pressed', String(state.mode === 'overview' && state.lens === 'moved'));
}

// Switch the zoomed-out view between "Near a zone line" and "Changed zone"
async function showLens(lens) {
  state.lens = lens;
  if (state.mode === 'zoom') await zoomOut();
  else draw();
}

/* ================= ZOOM =================
   Only the view zooms. The student chips themselves never move or animate. */
const full = () => [0, CHART_TOP, W, CHART_H];
let viewBox = full();
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
  const w = h * W / CHART_H;
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
  setViewBox(full());
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
  await animateViewBox(full(), 360);
  if (hadFocus) focusPlanet(key);
  busy = false;
}

/* ================= TOOLTIP + HIGHLIGHT ================= */
function showTip(a) {
  const s = byId.get(a.dataset.id);
  if (!s) return;
  tip.innerHTML = `<strong>${esc(s.name)}</strong>Score ${s.score.toFixed(2)} &middot; ${esc(Z[s.zone].name)}` +
    (s.near ? `<span class="t-near">${esc(nearText(s.near))}</span>` : '') +
    (s.moved ? `<span class="t-moved ${s.moved}">${esc(movedText(s))}</span>` : '') +
    (caseFor(s, cases) ? `<span class="t-case">Case: ${esc(stageLabel(caseFor(s, cases).stage))}</span>` : '') +
    `<span class="t-open">Click to open student details &rarr;</span>`;
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
$('zoom-out').addEventListener('click', () => showLens('near'));
$('lens-moved').addEventListener('click', () => showLens('moved'));

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
    showSummary(`No student matching “${find.value.trim()}” this week`);
    return;
  }
  showSummary();
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

// Fit the chart to the card: wider card -> wider chart (same height, so text keeps its size)
const narrow = matchMedia('(max-width: 960px)');
function fitChart() {
  const box = wrap.getBoundingClientRect();
  const next = narrow.matches || !box.height
    ? MIN_W
    : Math.round(Math.min(MAX_W, Math.max(MIN_W, CHART_H * box.width / box.height)));
  if (Math.abs(next - W) < 4) return;
  W = next;
  layout();
  if (busy) return; // the zoom finishes on the new size
  setViewBox(full());
  if (state.week !== null) draw();
}
new ResizeObserver(fitChart).observe(wrap);

syncButtons();
loadStudents();
