import { CALM_MAX, STEADY_MAX, MARGIN } from './zones.js';

// One "How to read this" strip used on every page, so the wording is always the same.
// Put <div id="help-strip" data-page="list|planets|upload|student"></div> on a page
// and load this file with <script type="module" src="help.js"></script>.
// The first three columns are the same everywhere; the last one explains the current page.
// Numbers come from zones.js, so changing a cut-off updates the help too.

const OPEN_KEY = 'photosphere-help-open'; // remembered across pages

const dot = colour => `<span class="pl-dot" style="--c:var(${colour})"></span>`;

const THIS_PAGE = {
  list: `
    <h3>On this page</h3>
    <p>Pick a week, then show <strong>Everyone</strong>, only those <strong>Near a zone line</strong>,
      or those who <strong>Changed zone</strong>. Click a name to open their details.</p>
    <p class="pl-help-soft">Solar Flare Zone students show their case stage, for example
      <span class="case-pill stage-new">New</span> or <span class="case-pill stage-contacted">Contacted</span>.</p>`,
  planets: `
    <h3>On this page</h3>
    <p>Click a planet or <strong>Everyone</strong> to see every student in a zone, highest score first.
      Hover a name for the score, click it to open their details.</p>
    <p class="pl-help-soft"><strong>Keyboard shortcuts</strong> (press these keys):
      <kbd>+</kbd> zoom in &middot; <kbd>&minus;</kbd> zoom out &middot;
      <kbd>&larr;</kbd> <kbd>&rarr;</kbd> next planet &middot; <kbd>Esc</kbd> back to all planets</p>`,
  upload: `
    <h3>On this page</h3>
    <p>Upload one CSV per week. Uploading a week again replaces only that week.
      <strong>Currently loaded</strong> shows which file each week came from and when.</p>
    <p class="pl-help-soft">Deleting student data keeps adviser notes and cases.</p>`,
  student: `
    <h3>On this page</h3>
    <p>Solar Flare Zone students have a <strong>case</strong>: New &rarr; Contacted &rarr; Meeting &rarr;
      Support plan &rarr; Closed. Click a stage to move the case.</p>
    <p class="pl-help-soft">Adviser notes are shared with every adviser and can't be edited once saved.</p>`,
};

export function renderHelp(el, page) {
  let open = true;
  try { open = localStorage.getItem(OPEN_KEY) !== 'closed'; } catch { /* storage blocked */ }

  el.innerHTML = `
    <details class="pl-help"${open ? ' open' : ''}>
      <summary>How to read this</summary>
      <div class="pl-help-grid">
        <div class="pl-help-item">
          <h3>Zones</h3>
          <p>Each student's concern score places them in one zone:</p>
          <ul>
            <li>${dot('--teal')}<strong>Calm Orbit</strong> ${CALM_MAX} or less</li>
            <li>${dot('--purple')}<strong>Steady Star</strong> above ${CALM_MAX}, up to ${STEADY_MAX}</li>
            <li>${dot('--amber')}<strong>Solar Flare Zone</strong> over ${STEADY_MAX}</li>
          </ul>
        </div>
        <div class="pl-help-item">
          <h3>Zone lines &#9650; &#9660;</h3>
          <p>The <strong>${CALM_MAX}</strong> and <strong>${STEADY_MAX}</strong> cut-offs between zones.
            Students within <strong>${MARGIN} points</strong> of one could cross it with a small change.</p>
          <p class="pl-help-soft">&#9650; just under a line, could move up a zone &middot;
            &#9660; just over a line, could move down. In Planets, their names sit beside the dashed line.</p>
        </div>
        <div class="pl-help-item">
          <h3>Changed zone</h3>
          <p>In a different zone from the week before. Not available for the first week.</p>
          <p class="pl-help-soft">List: "was Calm Orbit" under the name &middot; Planets:
            <span class="moved up">amber</span> moved up a zone, <span class="moved down">teal</span> moved down.</p>
        </div>
        <div class="pl-help-item">${THIS_PAGE[page] || ''}</div>
      </div>
    </details>`;

  // Remember open/closed, so it stays the same on every page
  el.querySelector('details').addEventListener('toggle', e => {
    try { localStorage.setItem(OPEN_KEY, e.target.open ? 'open' : 'closed'); } catch { /* fine */ }
  });
}

const strip = document.getElementById('help-strip');
if (strip) renderHelp(strip, strip.dataset.page);
