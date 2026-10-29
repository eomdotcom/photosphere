import { supabase } from './supabase.js';

const fileInput = document.getElementById('file');
const status = document.getElementById('status');
const openBtn = document.getElementById('open-dashboard');
const deleteBtn = document.getElementById('delete-data');

// Columns the CSV must have
const ID_COLUMNS = ['student_id', 'student_name', 'week'];

// Columns the database uses to calculate concern_score.
// A missing one would count as 0 and give the wrong score, so the upload is stopped.
const SCORE_COLUMNS = [
  'quiz_attempts',
  'distinct_logins_per_week',
  'avg_days_late',
  'days_since_last_check_in',
  'current_grade',
  'prior_gpa',
];

// Calculated by the database (a generated column), so it can't come from the file
const CALCULATED_COLUMNS = ['concern_score'];

openBtn.addEventListener('click', () => {
  window.location.href = 'dashboard.html';
});

// Deletes only the rows for the given weeks, so other weeks are kept
async function clearWeeks(weeks) {
  const { error } = await supabase
    .from('students')
    .delete()
    .in('week', weeks);
  if (error) throw error;
}

// Deletes every student row. Supabase refuses a delete with no filter,
// so this matches every row that has a student_id.
// Adviser notes and cases are in their own tables and are not touched.
async function clearAll() {
  const { error } = await supabase
    .from('students')
    .delete()
    .not('student_id', 'is', null);
  if (error) throw error;
}

// Shows how many rows are saved and enables the dashboard button
async function refreshStatus() {
  const { count, error } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true });

  if (error) {
    status.textContent = 'Could not check saved data: ' + error.message;
    return;
  }

  if (count > 0) {
    status.textContent = `${count} rows saved in total.`;
    openBtn.disabled = false;
  } else {
    status.textContent = 'No dataset loaded yet.';
    openBtn.disabled = true;
  }
}

// Upload: check the CSV first, then replace only the weeks it contains
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  status.textContent = 'Reading file...';

  try {
    const result = Papa.parse(await file.text(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
    });

    if (result.errors.length) {
      const e = result.errors[0];
      // +2 = 1 for the header line, 1 because rows count from 0
      const where = e.row !== undefined ? `Line ${e.row + 2}: ` : '';
      throw new Error(where + e.message);
    }

    const columns = result.meta.fields || [];

    // Check BEFORE deleting anything, so a bad file can't wipe good data
    if (result.data.length === 0) {
      throw new Error('The CSV has no data rows.');
    }
    const missingIds = ID_COLUMNS.filter(c => !columns.includes(c));
    if (missingIds.length) {
      throw new Error(`The CSV needs these columns: ${missingIds.join(', ')}.`);
    }
    const missingScore = SCORE_COLUMNS.filter(c => !columns.includes(c));
    if (missingScore.length) {
      throw new Error(
        `The CSV is missing columns used for the concern score: ${missingScore.join(', ')}. ` +
        'Nothing was saved.'
      );
    }

    // Drop calculated columns (e.g. concern_score) and turn blanks into nulls
    const ignored = CALCULATED_COLUMNS.filter(c => columns.includes(c));
    const records = result.data.map(row => {
      const record = {};
      for (const key in row) {
        if (CALCULATED_COLUMNS.includes(key)) continue;
        record[key] = row[key] === '' ? null : row[key];
      }
      return record;
    });

    if (records.some(r => r.week === null || r.week === undefined)) {
      throw new Error('Some rows have no week value.');
    }

    // Which weeks does this file contain? e.g. ["3"]
    const weeksInFile = [...new Set(records.map(r => r.week))];

    status.textContent = `Replacing week ${weeksInFile.join(', ')}...`;
    await clearWeeks(weeksInFile);

    const { error } = await supabase.from('students').insert(records);
    if (error) throw error;

    await refreshStatus();
    status.textContent =
      `Saved ${records.length} rows for week ${weeksInFile.join(', ')}, and the database calculated their concern scores. ` +
      (ignored.length ? `(The file's ${ignored.join(', ')} column was ignored.) ` : '') +
      status.textContent;

  } catch (error) {
    console.error(error);
    status.textContent = 'Upload failed: ' + error.message;
  }

  fileInput.value = '';
});

// Delete button: clears every week of student data (notes and cases are kept)
deleteBtn.addEventListener('click', async () => {
  if (!confirm('Delete all student data from Supabase? This cannot be undone.\n\nAdviser notes and cases are kept.')) return;

  try {
    await clearAll();
    await refreshStatus();
  } catch (error) {
    console.error(error);
    status.textContent = 'Delete failed: ' + error.message;
  }
});

// On page load, show what's already saved
refreshStatus();
