import { supabase } from './supabase.js';

// Case status for students in the Solar Flare Zone, stored in the Supabase
// "student_cases" table (see supabase/student_cases.sql).
//
// Rules:
//  - A student in the Solar Flare Zone with no case starts at "New" automatically.
//    Nothing is saved until an adviser moves the case along.
//  - Cases are only for the Solar Flare Zone. In a week where the student is in
//    Calm Orbit or Steady Star, no case is shown (adviser notes cover those students).
//    If they come back into Solar Flare, their case picks up where it left off.
//  - Closed cases are kept as history. An adviser can start a new case.
//  - Every stage change is also written to the student's adviser notes.

export const STAGES = [
  { key: 'new',       label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'meeting',   label: 'Meeting' },
  { key: 'support',   label: 'Support plan' },
  { key: 'closed',    label: 'Closed' },
];

export const stageLabel = key => STAGES.find(s => s.key === key)?.label ?? key;
const stageIndex = key => STAGES.findIndex(s => s.key === key);

// Same key notes.js uses, so the adviser's name is shared
const ADVISER_KEY = 'photosphere-adviser-name';

function adviserName() {
  const typed = document.getElementById('note-author')?.value.trim();
  if (typed) return typed;
  try {
    return localStorage.getItem(ADVISER_KEY) || '';
  } catch {
    return '';
  }
}

// Latest case for each student: Map of student_id -> case row.
// Pass a student id to load just that student. Never throws: on error, returns an empty map.
export async function loadCases(studentId = null) {
  let query = supabase
    .from('student_cases')
    .select('id, student_id, stage, opened_week, updated_by, created_at, updated_at');
  if (studentId !== null) query = query.eq('student_id', String(studentId));
  const { data, error } = await query.order('created_at', { ascending: true });

  const cases = new Map();
  if (error) {
    console.warn('Case status unavailable:', error.message);
    return { cases, error };
  }
  data.forEach(c => cases.set(String(c.student_id), c)); // oldest first, so the latest wins
  return { cases, error: null };
}

// What to show for a student this week: { stage, auto } or null for no badge.
// student needs { id, zone }.
export function caseFor(student, cases) {
  if (student.zone !== 'flare') return null; // cases are only for the Solar Flare Zone
  const row = cases.get(String(student.id));
  if (row && row.stage !== 'closed') return { stage: row.stage, auto: false };
  if (!row) return { stage: 'new', auto: true };
  return null; // closed case: no badge
}

// A small coloured badge, e.g. "Contacted"
export function casePill(info) {
  const pill = document.createElement('span');
  pill.className = `case-pill stage-${info.stage}`;
  pill.textContent = stageLabel(info.stage);
  pill.title = info.auto
    ? 'Case: New (assigned automatically for the Solar Flare Zone)'
    : `Case: ${stageLabel(info.stage)}`;
  return pill;
}

/* ================= Student page: the case path strip ================= */

let ctx = null; // { studentId, zone, zoneName, week, row, onHistory }

const $ = id => document.getElementById(id);

export async function initCaseStrip({ studentId, zone, zoneName, week, onHistory }) {
  ctx = { studentId: String(studentId), zone, zoneName, week, row: null, onHistory };
  const { cases, error } = await loadCases(studentId);
  if (error) {
    // Table not set up yet, or offline: only show the error for students who'd have a case
    if (zone === 'flare') {
      $('case-section').hidden = false;
      $('case-path').innerHTML = '';
      $('case-note').textContent = '';
      setStatus(`Couldn't load case status: ${error.message}`, 'error');
    }
    return;
  }
  ctx.row = cases.get(ctx.studentId) || null;
  renderStrip();
}

function setStatus(text, kind = '') {
  const el = $('case-status');
  el.textContent = text;
  el.className = 'case-status' + (kind ? ' ' + kind : '');
}

function formatWhen(iso) {
  return new Date(iso).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function renderStrip() {
  const { row, zone, zoneName, week } = ctx;
  const section = $('case-section');

  // Cases are only for the Solar Flare Zone
  if (zone !== 'flare') {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const current = row ? row.stage : 'new';
  const currentIdx = stageIndex(current);
  const closed = current === 'closed';

  // The strip
  const path = $('case-path');
  path.innerHTML = '';
  STAGES.forEach((stage, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'case-step';
    btn.dataset.stage = stage.key;
    if (i < currentIdx || (closed && i === currentIdx)) btn.classList.add('done');
    if (i === currentIdx) {
      btn.classList.add('current');
      btn.setAttribute('aria-current', 'step');
    }
    btn.textContent = stage.label;
    btn.title = i === currentIdx ? `Current stage: ${stage.label}` : `Move case to ${stage.label}`;
    btn.disabled = closed; // a closed case is read-only; start a new one instead
    btn.addEventListener('click', () => moveTo(stage.key));
    li.appendChild(btn);
    path.appendChild(li);
  });

  // Who/when line
  const meta = $('case-meta');
  if (row) {
    const by = row.updated_by ? ` by ${row.updated_by}` : '';
    meta.textContent = `Opened for week ${row.opened_week ?? '--'} · updated ${formatWhen(row.updated_at)}${by}`;
  } else {
    meta.textContent = '';
  }

  // Plain-language note under the strip
  const note = $('case-note');
  note.innerHTML = '';
  if (!row) {
    note.textContent = `Assigned automatically: this student is in the Solar Flare Zone in week ${week}. ` +
      'Select a stage to start working on the case.';
  } else if (closed) {
    note.textContent = 'This case is closed. The student is in the Solar Flare Zone this week. ';
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'secondary case-new';
    again.textContent = 'Start a new case';
    again.addEventListener('click', () => moveTo('new', { fresh: true }));
    note.appendChild(again);
  }
}

async function moveTo(stage, { fresh = false } = {}) {
  const { row } = ctx;
  if (!fresh && row && row.stage === stage) return;
  if (!fresh && !row && stage === 'new') return; // already "New" automatically

  const by = adviserName() || null;
  setStatus('Saving...');
  document.querySelectorAll('.case-step').forEach(b => { b.disabled = true; });

  const now = new Date().toISOString();
  const opening = fresh || !row || row.stage === 'closed';
  const request = opening
    ? supabase.from('student_cases')
        .insert({ student_id: ctx.studentId, stage, opened_week: ctx.week, updated_by: by })
    : supabase.from('student_cases')
        .update({ stage, updated_by: by, updated_at: now })
        .eq('id', row.id);

  const { data, error } = await request
    .select('id, student_id, stage, opened_week, updated_by, created_at, updated_at')
    .single();

  if (error) {
    console.error('Error saving case:', error);
    setStatus(`Couldn't update the case: ${error.message}`, 'error');
    renderStrip();
    return;
  }

  ctx.row = data;
  renderStrip();
  setStatus(`Case moved to ${stageLabel(stage)}.`, 'ok');

  // Keep a record in the adviser notes
  const text = opening && stage === 'new'
    ? 'Case opened (New).'
    : `Case moved to ${stageLabel(stage)}.`;
  const { error: noteError } = await supabase
    .from('adviser_notes')
    .insert({ student_id: ctx.studentId, week: ctx.week, note: text, author: by })
    .select('id')
    .single();
  if (noteError) console.warn('Case change not added to notes:', noteError.message);
  else if (ctx.onHistory) ctx.onHistory();
}
