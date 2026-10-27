import { supabase } from './supabase.js';

// Adviser notes for one student, stored in the Supabase "adviser_notes" table
// (see supabase/adviser_notes.sql). Notes are shared with every adviser and
// can't be edited or deleted from the app.

const TABLE = 'adviser_notes';
const MAX_LENGTH = 2000;
const AUTHOR_KEY = 'photosphere-adviser-name';

const section = document.getElementById('notes-section');
const form = document.getElementById('note-form');
const authorInput = document.getElementById('note-author');
const textarea = document.getElementById('notes');
const saveBtn = document.getElementById('save-note');
const statusEl = document.getElementById('note-status');
const countEl = document.getElementById('note-count');
const weekEl = document.getElementById('note-week');
const listEl = document.getElementById('note-list');

let studentId = null;
let currentWeek = null;

// Call once the student has loaded
export function initNotes(id) {
  studentId = String(id);
  section.hidden = false;

  // Remember the adviser's name on this computer, so they don't retype it
  try {
    authorInput.value = localStorage.getItem(AUTHOR_KEY) || '';
  } catch { /* storage blocked: just leave it empty */ }

  updateCount();
  loadNotes();
}

// The week the adviser is looking at (saved with each note)
export function setNotesWeek(week) {
  currentWeek = week ?? null;
  weekEl.textContent = currentWeek ?? '--';
}

// Reload the list (e.g. after a case stage change adds a note)
export function reloadNotes() {
  if (studentId) loadNotes();
}

async function loadNotes() {
  showListMessage('Loading notes...');

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, week, note, author, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading notes:', error);
    showListMessage(`Couldn't load notes: ${error.message}`);
    return;
  }

  listEl.innerHTML = '';
  if (!data.length) {
    showListMessage('No notes yet. Notes you save appear here for every adviser.');
    return;
  }
  data.forEach(note => listEl.appendChild(noteItem(note)));
}

function showListMessage(text) {
  listEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'note-empty';
  li.textContent = text;
  listEl.appendChild(li);
}

// e.g. "Week 3 · 28 Oct 2026, 12:40 pm · Rafael"
function noteItem(note) {
  const li = document.createElement('li');
  li.className = 'note';

  const meta = document.createElement('p');
  meta.className = 'note-meta';
  const when = new Date(note.created_at).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const bits = [];
  if (note.week !== null && note.week !== undefined) bits.push(`Week ${note.week}`);
  bits.push(when);
  bits.push(note.author ? note.author : 'Unnamed adviser');
  meta.textContent = bits.join(' · ');

  const body = document.createElement('p');
  body.className = 'note-body';
  body.textContent = note.note; // textContent, so a note can never inject HTML

  li.append(meta, body);
  return li;
}

function updateCount() {
  const length = textarea.value.length;
  countEl.textContent = `${length} / ${MAX_LENGTH}`;
  saveBtn.disabled = textarea.value.trim().length === 0;
}

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = 'note-status' + (kind ? ' ' + kind : '');
}

textarea.addEventListener('input', () => {
  updateCount();
  if (statusEl.textContent) setStatus('');
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const text = textarea.value.trim();
  if (!text || !studentId) return;

  const author = authorInput.value.trim();
  try {
    localStorage.setItem(AUTHOR_KEY, author);
  } catch { /* storage blocked: fine */ }

  saveBtn.disabled = true;
  setStatus('Saving...');

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ student_id: studentId, week: currentWeek, note: text, author: author || null })
    .select('id, week, note, author, created_at')
    .single();

  if (error) {
    console.error('Error saving note:', error);
    setStatus(`Couldn't save: ${error.message}. Your note is still here, so you can try again.`, 'error');
    updateCount();
    return;
  }

  // Show it at the top straight away
  if (listEl.querySelector('.note-empty')) listEl.innerHTML = '';
  listEl.prepend(noteItem(data));

  textarea.value = '';
  updateCount();
  setStatus('Note saved.', 'ok');
});
