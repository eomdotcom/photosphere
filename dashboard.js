import { supabase } from './supabase.js';
import {
  ZONES, parseWeek, weekList, previousWeek, studentsForWeek,
  nearText, movedTag, movedText, initials, updateViewSwitch, renderSummary,
} from './zones.js';

let allRows = [];        // every row from Supabase, fetched once
let weeks = [];          // every week in the data, e.g. [1, 3, 5]
let currentWeek = null;
let filter = 'all';      // 'all', 'near' (near a zone line) or 'moved' (changed zone since last week)

const statusEl = document.getElementById('dashboard-status');
const weekButtons = document.getElementById('week-buttons');
const findInput = document.getElementById('find');
const filterButtons = document.querySelectorAll('[data-filter]');

const lists = {
  calm: document.getElementById('calm-students'),
  steady: document.getElementById('steady-students'),
  flare: document.getElementById('flare-students'),
};
const counts = {
  calm: document.getElementById('calm-count'),
  steady: document.getElementById('steady-count'),
  flare: document.getElementById('flare-count'),
};

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

  allRows = data;

  // 1. Read every value in the week column, keep unique ones, sort them
  weeks = weekList(data);

  if (weeks.length === 0) {
    statusEl.textContent = 'No week values found in the data.';
    return;
  }

  // 2. One button per week
  weekButtons.innerHTML = '';
  weeks.forEach(week => {
    const btn = document.createElement('button');
    btn.textContent = `Week ${week}`;
    btn.dataset.week = week;
    btn.addEventListener('click', () => showWeek(week));
    weekButtons.appendChild(btn);
  });

  // 3. Start on the week in the URL (?week=3), or the earliest week
  const fromUrl = parseWeek(new URLSearchParams(location.search).get('week'));
  showWeek(weeks.includes(fromUrl) ? fromUrl : weeks[0]);
}

function showWeek(week) {
  currentWeek = week;

  // Highlight the clicked button
  weekButtons.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.week) === week);
  });

  // Remember the week in the URL, and in the List | Planets switch
  history.replaceState(null, '', `?week=${week}`);
  updateViewSwitch(week);

  syncMovedButton();
  render();
}

// One student as a row: initials, name, score, and a near-line marker
function makeRow(s) {
  const li = document.createElement('li');
  const link = document.createElement('a');
  link.href = `student.html?id=${encodeURIComponent(s.id)}&week=${currentWeek}&from=list`;

  const ini = document.createElement('span');
  ini.className = 'ini';
  ini.setAttribute('aria-hidden', 'true');
  ini.textContent = initials(s.name);

  // Name, plus a "was Calm Orbit" line underneath, but only in the "Changed zone" filter
  // (kept out of the normal list so it stays simple)
  const who = document.createElement('span');
  who.className = 'who';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = s.name;
  who.appendChild(name);
  if (s.moved && filter === 'moved') {
    const moved = document.createElement('span');
    moved.className = 'moved ' + s.moved;
    moved.textContent = movedTag(s);
    moved.title = movedText(s);
    who.appendChild(moved);
  }

  const score = document.createElement('span');
  score.className = 'score';
  score.textContent = s.score.toFixed(2);

  const near = document.createElement('span');
  near.className = 'near';
  if (s.near) {
    near.classList.add(s.near.dir === 'up' ? 'to-up' : 'to-down');
    near.title = nearText(s.near);
    near.textContent = s.near.dir === 'up' ? '▲' : '▼';
    // Screen readers hear the full sentence instead of the arrow
    near.setAttribute('aria-label', nearText(s.near));
  }

  link.append(ini, who, score, near);
  li.appendChild(link);
  return li;
}

function emptyRow(text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  return li;
}

function render() {
  const prevWeek = previousWeek(weeks, currentWeek);
  const { students, skipped } = studentsForWeek(allRows, currentWeek, prevWeek);
  const query = findInput.value.trim().toLowerCase();
  let shownTotal = 0;

  ZONES.forEach(z => {
    const inZone = students.filter(s => s.zone === z.key);
    const shown = inZone.filter(s =>
      (filter === 'all' || (filter === 'near' && s.near) || (filter === 'moved' && s.moved)) &&
      (!query || s.name.toLowerCase().includes(query))
    );
    shownTotal += shown.length;

    lists[z.key].innerHTML = '';
    if (shown.length) {
      shown.forEach(s => lists[z.key].appendChild(makeRow(s)));
    } else if (!inZone.length) {
      lists[z.key].appendChild(emptyRow('No students in this zone this week'));
    } else if (query) {
      lists[z.key].appendChild(emptyRow('No matches here'));
    } else if (filter === 'moved') {
      lists[z.key].appendChild(emptyRow('No one moved into this zone'));
    } else {
      lists[z.key].appendChild(emptyRow('No one near a zone line'));
    }

    // "50", or "7 of 50" when a filter or search is on
    counts[z.key].textContent = shown.length === inZone.length
      ? inZone.length
      : `${shown.length} of ${inZone.length}`;
  });

  renderSummary(statusEl, {
    total: students.length,
    near: students.filter(s => s.near).length,
    moved: students.filter(s => s.moved).length,
    prevWeek,
    skipped,
    note: query ? `${shownTotal} matching “${findInput.value.trim()}”` : null,
  });
}

// Everyone | Near a zone line | Changed zone
function setFilter(value) {
  filter = value;
  filterButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === value)));
}

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    setFilter(btn.dataset.filter);
    render();
  });
});

// "Changed zone" needs an earlier week to compare with
function syncMovedButton() {
  const btn = document.querySelector('[data-filter="moved"]');
  const prevWeek = previousWeek(weeks, currentWeek);
  btn.disabled = prevWeek === null;
  btn.title = prevWeek === null
    ? `Week ${currentWeek} is the first week, so there's nothing to compare with`
    : `Students whose zone is different from week ${prevWeek}`;
  if (btn.disabled && filter === 'moved') setFilter('all');
}

// Search filters as you type
findInput.addEventListener('input', () => {
  if (currentWeek !== null) render();
});

loadStudents();
