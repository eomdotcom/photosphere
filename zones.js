// Shared zone rules for both dashboard views (list and planets).
// Change a cut-off here and both views stay in step.

// score <= 30 Calm Orbit, <= 60 Steady Star, above 60 Solar Flare Zone
export const CALM_MAX = 30;
export const STEADY_MAX = 60;

// "Near a zone line" = within this many points of 30 or 60
export const MARGIN = 5;

export const ZONES = [
  { key: 'calm',   name: 'Calm Orbit',       blurb: 'No sign of extra attention needed right now' },
  { key: 'steady', name: 'Steady Star',      blurb: 'Some signs worth keeping an eye on' },
  { key: 'flare',  name: 'Solar Flare Zone', blurb: 'Several signs together, worth reviewing soon' },
];

export const zoneName = key => ZONES.find(z => z.key === key)?.name ?? key;

// Turns 5, "5" or "Week 5" into the number 5; blanks become null
export function parseWeek(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

// A usable score as a number, or null if blank (a blank must not land in Calm Orbit)
export function readScore(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const score = Number(raw);
  return Number.isNaN(score) ? null : score;
}

export function zoneFor(score) {
  if (score <= CALM_MAX) return 'calm';
  if (score <= STEADY_MAX) return 'steady';
  return 'flare';
}

// Is this student close enough to 30 or 60 that their zone could change?
// Returns null, or { toward, dir: 'up' | 'down', line, dist }
export function nearBoundary({ zone, score }) {
  const options = [];
  if (zone === 'calm' && score > CALM_MAX - MARGIN) {
    options.push({ toward: 'steady', dir: 'up', line: CALM_MAX, dist: CALM_MAX - score });
  }
  if (zone === 'steady') {
    if (score <= CALM_MAX + MARGIN) options.push({ toward: 'calm', dir: 'down', line: CALM_MAX, dist: score - CALM_MAX });
    if (score > STEADY_MAX - MARGIN) options.push({ toward: 'flare', dir: 'up', line: STEADY_MAX, dist: STEADY_MAX - score });
  }
  if (zone === 'flare' && score <= STEADY_MAX + MARGIN) {
    options.push({ toward: 'steady', dir: 'down', line: STEADY_MAX, dist: score - STEADY_MAX });
  }
  if (!options.length) return null;
  options.sort((a, b) => a.dist - b.dist);
  return options[0];
}

// e.g. "2.3 pts under the 30 line, close to Steady Star"
export const nearText = n =>
  `${n.dist.toFixed(1)} pts ${n.dir === 'up' ? 'under' : 'over'} the ${n.line} line, close to ${zoneName(n.toward)}`;

// "Olivia Rodriguez" -> "OR"
export function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// One week's students, ready to show: { id, name, score, zone, near }, highest score first
export function studentsForWeek(rows, week) {
  let skipped = 0;
  const students = [];
  rows
    .filter(row => parseWeek(row.week) === week)
    .forEach(row => {
      const score = readScore(row.concern_score);
      if (score === null) {
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
      students.push(s);
    });
  students.sort((a, b) => b.score - a.score);
  return { students, skipped };
}

// Keeps the List | Planets switch on the same week
export function updateViewSwitch(week) {
  document.querySelectorAll('.view-switch a').forEach(a => {
    const page = a.getAttribute('href').split('?')[0];
    a.setAttribute('href', `${page}?week=${week}`);
  });
}
