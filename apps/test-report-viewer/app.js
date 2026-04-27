// ── Drag and drop ──────────────────────────────────────────────────────────
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.zip')) loadZip(file);
  else alert('Please drop a .zip file.');
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadZip(fileInput.files[0]);
});

// ── Global state ──────────────────────────────────────────────────────────
let allTcs = [];
let totalTestCount = 0;
let runLogText = null;
let runSummaryText = null;
let loadedFileName = '';

// ── Reset ──────────────────────────────────────────────────────────────────
function resetViewer() {
  document.getElementById('dropzone').style.display = '';
  document.getElementById('report').style.display = 'none';
  document.getElementById('filter-bar').style.display = 'none';
  fileInput.value = '';
  allTcs = [];
  totalTestCount = 0;
  runLogText = null;
  runSummaryText = null;
  loadedFileName = '';
  document.querySelectorAll('video source[data-blob]').forEach(s => URL.revokeObjectURL(s.src));
}

// ── Lightbox ───────────────────────────────────────────────────────────────
function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('show');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('show');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// ── Parse run timestamp from filename ─────────────────────────────────────
function parseTs(filename) {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
  if (!m) return filename;
  const [, date, time] = m;
  const [y, mo, d] = date.split('-');
  const [h, mi, s] = time.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[+mo-1]} ${y}, ${h}:${mi}:${s}`;
}

// ── Status helpers ─────────────────────────────────────────────────────────
function badge(status) {
  const s = (status || 'UNKNOWN').toUpperCase();
  const cls = s === 'PASS' ? 'b-pass' : s === 'FAIL' || s === 'ERROR' ? 'b-fail' : s === 'WARN' ? 'b-warn' : 'b-skip';
  return `<span class="badge ${cls}">${status}</span>`;
}
function icon(status) {
  const s = (status || '').toUpperCase();
  return s === 'PASS' ? '✔' : s === 'FAIL' || s === 'ERROR' ? '✘' : s === 'WARN' ? '⚠' : '–';
}

// ── Regex escape helper ───────────────────────────────────────────────────
function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ── Category helper ───────────────────────────────────────────────────────
function getCategory(id) {
  if (id.includes('--')) return id.split('--')[0];
  return 'legacy';
}

function detectPlatform(tcs, filename) {
  const buildVariant = (tcs.find(t => t.meta.buildVariant !== 'unknown')?.meta.buildVariant || '').toLowerCase();
  const file = (filename || '').toLowerCase();
  if (buildVariant.includes('ios') || file.includes('_ios_')) return 'iOS';
  return 'Android';
}

// ── Main zip loader ────────────────────────────────────────────────────────
async function loadZip(file) {
  const loading = document.getElementById('loading');
  loading.classList.add('show');

  try {
    const zip = await JSZip.loadAsync(file);

    // Detect test IDs - support: category--name, TC-XXX, or any bare ID
    const idPattern = /(?:^|\/)([\w][\w-]*(?:--[\w][\w-]*)?|TC-\d+)_(?:result|meta)\.json$/;

    // Detect optional subdirectory prefix
    const firstTcFile = Object.keys(zip.files).find(f => idPattern.test(f));
    const prefixMatch = firstTcFile ? firstTcFile.match(/^(.*\/)?(?:[\w][\w-]*(?:--[\w][\w-]*)?|TC-\d+)_(?:result|meta)\.json$/) : null;
    const prefix = prefixMatch && prefixMatch[1] ? prefixMatch[1] : '';

    // Collect TC IDs from result + meta files
    const tcIds = [...new Set(
      Object.keys(zip.files)
        .map(f => f.match(idPattern)?.[1])
        .filter(Boolean)
    )].sort();

    if (tcIds.length === 0) {
      loading.classList.remove('show');
      alert('No result files found in this zip.\nExpected files matching {id}_result.json (e.g. core--app-launch_result.json)');
      return;
    }

    // Load all TC data (JSON + screenshots + video)
    const tcs = await Promise.all(tcIds.map(id => loadTc(zip, id, prefix)));
    allTcs = tcs;
    loadedFileName = file.name;

    // Load run log and summary from the zip
    const runLogFile = zip.file(`${prefix}run_log.txt`) || Object.values(zip.files).find(f => f.name.endsWith('run_log.txt'));
    const runSummaryFile = zip.file(`${prefix}run_summary.txt`) || Object.values(zip.files).find(f => f.name.endsWith('run_summary.txt'));
    runLogText = runLogFile ? await runLogFile.async('string') : null;
    runSummaryText = runSummaryFile ? await runSummaryFile.async('string') : null;

    const runDt = parseTs(file.name);
    const platform = detectPlatform(tcs, file.name);
    const buildVariant = tcs.find(t => t.meta.buildVariant !== 'unknown')?.meta.buildVariant ?? 'unknown';

    const total   = tcs.length;
    const passed  = tcs.filter(t => t.result.status?.toUpperCase() === 'PASS').length;
    const failed  = tcs.filter(t => ['FAIL','ERROR'].includes(t.result.status?.toUpperCase())).length;
    const warned  = tcs.filter(t => t.result.status?.toUpperCase() === 'WARN').length;
    const skipped = total - passed - failed - warned;
    totalTestCount = total;

    // Total run duration
    const totalDurationS = tcs.reduce((sum, t) => sum + (t.meta.duration_s ?? 0), 0);
    const durMin = Math.floor(totalDurationS / 60);
    const durSec = totalDurationS % 60;
    const durStr = durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`;

    // Render
    document.getElementById('report-title').textContent = `IA SDK ${platform} — E2E Test Report`;
    document.getElementById('meta').textContent =
      `Run: ${runDt}  ·  Platform: ${platform}  ·  Build: ${buildVariant}  ·  Duration: ${durStr}  ·  ${file.name}`;

    document.getElementById('summary').innerHTML = [
      summaryCard('total', total,   'Total'),
      summaryCard('pass',  passed,  'Passed'),
      summaryCard('fail',  failed,  'Failed'),
      summaryCard('warn',  warned,  'Warned'),
      summaryCard('skip',  skipped, 'Skipped'),
    ].join('');

    // General summary
    const overallStatus = failed > 0 ? 'FAIL' : warned > 0 ? 'WARN' : 'PASS';
    const overallCls = overallStatus === 'PASS' ? 'pass' : overallStatus === 'FAIL' ? 'fail' : 'warn';
    const tcLines = tcs.map(tc => {
      const s = (tc.result.status || 'UNKNOWN').toUpperCase();
      const ic = s === 'PASS' ? '✔' : s === 'FAIL' || s === 'ERROR' ? '✘' : s === 'WARN' ? '⚠' : '–';
      const note = tc.result.notes ? ` — ${tc.result.notes}` : '';
      return `${ic} ${tc.id}: ${tc.result.name || tc.id}${note}`;
    }).join('\n');
    document.getElementById('overall-summary').innerHTML =
      `<div class="overall-hdr overall-${overallCls}">Overall: ${overallStatus} (${passed}/${total} passed) — ${durStr}</div>` +
      `<pre class="overall-pre">${escHtml(tcLines)}</pre>`;

    // Render run log section (collapsible)
    renderRunLog();

    // Group TCs by category and render
    renderGroupedCards(tcs);

    // Show filter bar
    document.getElementById('filter-bar').style.display = 'flex';
    applyFilters();

    // Cards start open — trigger video load for all visible videos
    document.querySelectorAll('video.tc-video').forEach(v => v.load());

    loading.classList.remove('show');
    dropzone.style.display = 'none';
    document.getElementById('report').style.display = 'block';

  } catch (err) {
    loading.classList.remove('show');
    console.error(err);
    alert('Failed to read zip file.\n\n' + err.message);
  }
}

// ── Render grouped cards ──────────────────────────────────────────────────
function renderGroupedCards(tcs) {
  // Group by category
  const groups = {};
  tcs.forEach(tc => {
    const cat = getCategory(tc.id);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(tc);
  });

  // Sort categories alphabetically, but "legacy" at the end
  const catOrder = Object.keys(groups).sort((a, b) => {
    if (a === 'legacy') return 1;
    if (b === 'legacy') return -1;
    return a.localeCompare(b);
  });

  let html = '';
  catOrder.forEach(cat => {
    const catTcs = groups[cat];
    const catPassed = catTcs.filter(t => t.result.status?.toUpperCase() === 'PASS').length;
    const catFailed = catTcs.filter(t => ['FAIL','ERROR'].includes(t.result.status?.toUpperCase())).length;
    const catWarned = catTcs.filter(t => t.result.status?.toUpperCase() === 'WARN').length;
    const catTotal  = catTcs.length;

    const catStatus = catFailed > 0 ? 'fail' : catWarned > 0 ? 'warn' : 'pass';
    const catBadge  = catFailed > 0 ? badge('FAIL') : catWarned > 0 ? badge('WARN') : badge('PASS');

    let statsText = `${catPassed}/${catTotal} passed`;
    if (catFailed > 0) statsText += `  ·  ${catFailed} failed`;
    if (catWarned > 0) statsText += `  ·  ${catWarned} warned`;

    const catId = 'cat-' + cat.replace(/[^a-zA-Z0-9_-]/g, '_');

    html += `<div class="cat-group cat-${catStatus}" id="${catId}" data-category="${escHtml(cat)}">
      <div class="cat-hdr" onclick="toggleCat('${catId}')">
        <span class="cat-tog" id="cattog-${catId}">▼</span>
        <span class="cat-name">${escHtml(cat)}</span>
        <span class="cat-stats">—  ${statsText}</span>
        ${catBadge}
      </div>
      <div class="cat-body" id="catbody-${catId}">
        ${catTcs.map(tc => tcCard(tc)).join('')}
      </div>
    </div>`;
  });

  document.getElementById('cards').innerHTML = html;
}

// ── Load one TC ────────────────────────────────────────────────────────────
async function loadTc(zip, id, prefix = '') {
  const p = name => zip.file(`${prefix}${name}`);

  // Result JSON
  let result = { id, name: id, status: 'ERROR', steps: [], error: 'No result.json in zip.' };
  const resultFile = p(`${id}_result.json`);
  if (resultFile) {
    try { result = JSON.parse(await resultFile.async('string')); }
    catch (e) { result.error = 'Could not parse result JSON: ' + e.message; }
  }

  // Meta JSON
  let meta = { duration_s: 0, build_variant: 'unknown' };
  const metaFile = p(`${id}_meta.json`);
  if (metaFile) {
    try { meta = JSON.parse(await metaFile.async('string')); }
    catch (_) {}
  }

  // Screenshots referenced in steps (load as base64)
  const screenshots = {};
  const ssPromises = (result.steps || [])
    .map(s => s.screenshot)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i) // deduplicate
    .map(async name => {
      const f = p(name);
      if (f) screenshots[name] = 'data:image/png;base64,' + await f.async('base64');
    });
  await Promise.all(ssPromises);

  // Also load all PNG files for this TC (for gallery view)
  // Escape hyphens in ID for regex use
  const allScreenshots = await Promise.all(
    Object.keys(zip.files)
      .filter(f => new RegExp(`(?:^|/)${escRegex(id)}_.*\\.png$`).test(f))
      .sort()
      .map(async path => {
        const name = path.replace(/^.*\//, '');
        const data = 'data:image/png;base64,' + await zip.file(path).async('base64');
        return { name, data };
      })
  );

  // Video (load as blob URL — skip if >150MB to avoid OOM)
  let videoUrl = null;
  let videoSkipped = false;
  const videoFile = p(`${id}_video.mp4`);
  if (videoFile) {
    const raw = videoFile._data;
    const sizeMb = ((raw?.uncompressedSize ?? raw?.compressedSize ?? 0)) / (1024 * 1024);
    if (sizeMb > 150) {
      videoSkipped = true;
    } else {
      const ab = await videoFile.async('arraybuffer');
      const blob = new Blob([ab], { type: 'video/mp4' });
      videoUrl = URL.createObjectURL(blob);
    }
  }

  // SDK logcat
  let sdkLogs = null;
  const logsFile = p(`${id}_sdk_logs.txt`);
  if (logsFile) {
    sdkLogs = await logsFile.async('string');
  }

  // Debug viewer export logs
  let debugLogs = null;
  const debugLogsFile = p(`${id}_debug_logs.json`);
  if (debugLogsFile) {
    try { debugLogs = JSON.parse(await debugLogsFile.async('string')); } catch (_) {}
  }

  return { id, result, meta, screenshots, allScreenshots, videoUrl, videoSkipped, sdkLogs, debugLogs };
}

// ── Render helpers ─────────────────────────────────────────────────────────
function summaryCard(cls, n, label) {
  return `<div class="sc ${cls}"><div class="num">${n}</div><div class="lbl">${label}</div></div>`;
}

function tcCard(tc) {
  const status = (tc.result.status || 'UNKNOWN').toUpperCase();
  const steps  = tc.result.steps || [];

  // Steps rows
  let rows = '';
  if (steps.length === 0) {
    rows = `<tr><td colspan="5" class="no-steps">No steps recorded.</td></tr>`;
  } else {
    steps.forEach((step, i) => {
      const ss = step.screenshot && tc.screenshots[step.screenshot]
        ? `<img class="ss" src="${tc.screenshots[step.screenshot]}" alt="${step.screenshot}"
               onclick="openLightbox(this.src)" loading="lazy">`
        : step.screenshot
          ? `<div class="no-ss">📷 ${step.screenshot}<br><small>(not in zip)</small></div>`
          : '';
      rows += `<tr class="sr sr-${(step.status||'').toLowerCase()}">
        <td class="sn">${i+1}</td>
        <td>${step.name || ''}</td>
        <td>${badge(step.status)}</td>
        <td class="snotes">${step.notes || ''}</td>
        <td class="sss">${ss}</td>
      </tr>`;
    });
  }

  // Video
  const videoHtml = tc.videoUrl
    ? `<video controls width="280" class="tc-video" preload="auto" data-blob="1"><source src="${tc.videoUrl}" type="video/mp4"></video>`
    : tc.videoSkipped
      ? `<p class="no-video">🎥 Recording too large to load in browser (&gt;150 MB)</p>`
      : `<p class="no-video">🎥 No recording in zip</p>`;

  const errorHtml = tc.result.error
    ? `<div class="err-box">⚠ ${tc.result.error}</div>` : '';

  // Findings
  const findingsText = tc.result.notes
    || (steps.length > 0 ? steps.map((s, i) => `${i+1}. [${s.status||'?'}] ${s.name}${s.notes ? ': ' + s.notes : ''}`).join('\n') : null);
  const findingsHtml = findingsText
    ? `<div class="findings"><h4>Findings</h4><pre class="findings-pre">${escHtml(findingsText)}</pre></div>`
    : '';

  // Investigation / Adaptive retry (Claude + Appium re-execution of failed Maestro tests)
  let investigationHtml = '';
  if (tc.result.investigation) {
    const inv = tc.result.investigation;
    let parsed = inv;
    if (typeof inv === 'string') {
      try { parsed = JSON.parse(inv); } catch (_) { parsed = { diagnosis: inv }; }
    }

    const retryStatus = parsed.retryStatus || '';
    const diagText = parsed.diagnosis || parsed;
    const completedAll = parsed.completedAllSteps;
    const selectorChanges = parsed.selectorChanges || [];
    const provider = parsed.provider || '';
    const providerAttempts = parsed.providerAttempts || [];
    // Legacy fields from old investigation format
    const fixText = parsed.suggested_fix || '';
    const actualText = parsed.actual_text || '';

    // Retry status badge
    const retryBadgeCls = retryStatus === 'PASS' ? 'b-pass' : retryStatus === 'FAIL' ? 'b-fail' : 'b-warn';
    const retryBadge = retryStatus
      ? `<span class="badge ${retryBadgeCls}" style="margin-left: 8px;">Retry: ${retryStatus}</span>`
      : '';
    const completedLabel = completedAll === true
      ? '<span style="color: var(--pass); font-size: .75rem; margin-left: 8px;">✔ All steps completed</span>'
      : completedAll === false
        ? '<span style="color: var(--warn); font-size: .75rem; margin-left: 8px;">⚠ Not all steps completed</span>'
        : '';
    const providerLabel = provider
      ? `<span style="color: var(--sub); font-size: .75rem; margin-left: 8px;">Provider: ${escHtml(provider)}</span>`
      : '';

    // Selector changes table
    let selectorHtml = '';
    if (selectorChanges.length > 0) {
      const rows = selectorChanges.map(sc =>
        `<tr><td>${escHtml(sc.step || '')}</td><td><code>${escHtml(sc.expected || '')}</code></td><td><code>${escHtml(sc.actual || '')}</code></td></tr>`
      ).join('');
      selectorHtml = `<div style="margin-top: 10px;">
        <p style="color: var(--sub); font-size: .75rem; font-weight: 600; margin: 0 0 4px;">Selector Changes (Maestro YAML needs updating):</p>
        <div class="dlog-scroll" style="max-height: 160px;">
          <table class="dlog-table"><thead><tr><th>Step</th><th>Maestro Expected</th><th>Actual on Screen</th></tr></thead>
          <tbody>${rows}</tbody></table>
        </div>
      </div>`;
    }

    let attemptsHtml = '';
    if (providerAttempts.length > 0) {
      const attemptRows = providerAttempts.map((a, idx) => {
        const status = a.exitCode === 0 ? 'PASS' : (a.timeout ? 'TIMEOUT' : 'FAIL');
        const snippet = a.outputSnippet ? escHtml(a.outputSnippet) : '';
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escHtml(a.provider || '')}</td>
          <td>${a.exitCode ?? ''}</td>
          <td>${status}</td>
          <td><code>${escHtml(a.outputFile || '')}</code></td>
          <td>${snippet}</td>
        </tr>`;
      }).join('');
      attemptsHtml = `<div style="margin-top: 10px;">
        <p style="color: var(--sub); font-size: .75rem; font-weight: 600; margin: 0 0 4px;">AI Retry Attempts</p>
        <div class="dlog-scroll" style="max-height: 220px;">
          <table class="dlog-table">
            <thead><tr><th>#</th><th>Provider</th><th>Exit</th><th>Status</th><th>Output File</th><th>Snippet</th></tr></thead>
            <tbody>${attemptRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    investigationHtml = `<div class="findings" style="border-left: 3px solid var(--accent); padding-left: 12px; margin-top: 14px;">
      <h4>🔁 Claude + Appium Adaptive Retry${retryBadge}${completedLabel}${providerLabel}</h4>
      <pre class="findings-pre">${escHtml(typeof diagText === 'string' ? diagText : JSON.stringify(diagText, null, 2))}</pre>
      ${selectorHtml}
      ${attemptsHtml}
      ${fixText ? `<p style="color: var(--sub); font-size: .78rem; margin: 8px 0 0;"><b>Suggested fix:</b> ${escHtml(fixText)}</p>` : ''}
      ${actualText ? `<p style="color: var(--sub); font-size: .78rem; margin: 4px 0 0;"><b>Actual text found:</b> <code>${escHtml(actualText)}</code></p>` : ''}
    </div>`;
  }

  // Gallery
  const stepsScreenshots = new Set((tc.result.steps || []).map(s => s.screenshot).filter(Boolean));
  const extraScreenshots = (tc.allScreenshots || []).filter(s => !stepsScreenshots.has(s.name));
  const galleryHtml = extraScreenshots.length > 0
    ? `<div class="gallery"><h4>Screenshots</h4>${extraScreenshots.map(s =>
        `<img class="ss" src="${s.data}" alt="${s.name}" title="${s.name}" onclick="openLightbox(this.src)" loading="lazy">`
      ).join('')}</div>`
    : '';

  // Debug viewer export logs
  let debugLogsHtml = '';
  if (tc.debugLogs) {
    const netLogs = (tc.debugLogs.networkLogs || []);
    const dbgLogs = (tc.debugLogs.debugLogs || []);
    const analyticsLogs = (tc.debugLogs.analyticsLogs || []);
    const netRows = netLogs.map(e =>
      `<tr><td>${e.timestamp||''}</td><td><b>${e.method||''}</b></td><td class="url-cell">${escHtml(e.url||'')}</td><td>${e.responseCode??''}</td><td>${e.durationMs!=null?e.durationMs+'ms':''}</td><td>${e.error?'⚠ '+escHtml(e.error):''}</td></tr>`
    ).join('');
    const dbgRows = dbgLogs.map(e =>
      `<tr><td>${e.timestamp||''}</td><td>${e.type||''}</td><td>${escHtml(e.tag||'')}</td><td>${escHtml(e.message||'')}</td></tr>`
    ).join('');
    const analyticsRows = analyticsLogs.map(e =>
      `<tr><td>${e.timestamp||''}</td><td>${e.eventType||''}</td><td>${escHtml(e.title||'')}</td><td>${escHtml(e.description||'')}</td></tr>`
    ).join('');
    debugLogsHtml = `<div class="debug-logs-section">
      <h4>Debug Viewer Export (${netLogs.length} network · ${dbgLogs.length} debug · ${analyticsLogs.length} analytics)</h4>
      ${netLogs.length > 0 ? `<p class="dlog-label">Network Requests</p>
      <div class="dlog-scroll"><table class="dlog-table"><thead><tr><th>Time</th><th>Method</th><th>URL</th><th>Code</th><th>Duration</th><th>Error</th></tr></thead><tbody>${netRows}</tbody></table></div>` : ''}
      ${dbgLogs.length > 0 ? `<p class="dlog-label">Debug Logs</p>
      <div class="dlog-scroll"><table class="dlog-table"><thead><tr><th>Time</th><th>Type</th><th>Tag</th><th>Message</th></tr></thead><tbody>${dbgRows}</tbody></table></div>` : ''}
      ${analyticsLogs.length > 0 ? `<p class="dlog-label">Analytics Events</p>
      <div class="dlog-scroll"><table class="dlog-table"><thead><tr><th>Time</th><th>Type</th><th>Title</th><th>Description</th></tr></thead><tbody>${analyticsRows}</tbody></table></div>` : ''}
    </div>`;
  }

  // SDK logs section
  const safeId = tc.id.replace(/'/g, "\\'");
  const logId = `logs-${tc.id}`;
  const logHtml = tc.sdkLogs != null
    ? `<div class="logs-section">
        <div class="logs-toggle" id="ltog-${tc.id}" onclick="toggleLogs('${safeId}')">
          <span class="arrow">▶</span> SDK Logs (${tc.sdkLogs.split('\n').length} lines)
        </div>
        <pre class="logs-pre" id="${logId}">${escHtml(tc.sdkLogs)}</pre>
      </div>`
    : `<div class="logs-section"><span class="logs-none">No SDK logs in zip for this TC.</span></div>`;

  const summaryLine = tc.result.notes
    ? `<div class="tc-summary">${escHtml(tc.result.notes)}</div>` : '';

  // Determine the status class for data attribute used in filtering
  const statusUpper = status;
  let statusFilter = 'other';
  if (statusUpper === 'PASS') statusFilter = 'pass';
  else if (statusUpper === 'FAIL' || statusUpper === 'ERROR') statusFilter = 'fail';
  else if (statusUpper === 'WARN') statusFilter = 'warn';

  return `<div class="tc-card tc-${status.toLowerCase()}" id="${tc.id}" data-status="${statusFilter}" data-tcid="${escHtml(tc.id)}" data-tcname="${escHtml(tc.result.name || tc.id)}">
    <div class="tc-hdr" onclick="toggle('${safeId}')">
      <span class="tc-id">${tc.id}</span>
      <span class="tc-name">${tc.result.name || tc.id}</span>
      ${badge(status)}
      <span class="tc-dur">⏱ ${tc.meta.duration_s ?? 0}s</span>
      <span class="tc-tog" id="tog-${tc.id}">▼</span>
    </div>
    ${summaryLine}
    <div class="tc-body" id="body-${tc.id}">
      <div class="cols">
        <div class="steps-col">
          ${errorHtml}
          <table class="st">
            <thead><tr><th>#</th><th>Step</th><th>Status</th><th>Notes</th><th>Screenshot</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="vid-col"><h4>Recording</h4>${videoHtml}</div>
      </div>
      ${findingsHtml}
      ${investigationHtml}
      ${galleryHtml}
      ${debugLogsHtml}
      ${logHtml}
    </div>
  </div>`;
}

// ── Toggle card open/close ─────────────────────────────────────────────────
function toggle(id) {
  const body = document.getElementById('body-' + id);
  const tog  = document.getElementById('tog-' + id);
  if (!body) return;
  body.classList.toggle('closed');
  tog?.classList.toggle('closed');
  // Trigger video load when card is opened
  if (!body.classList.contains('closed')) {
    body.querySelectorAll('video').forEach(v => v.load());
  }
}

// ── Toggle category open/close ────────────────────────────────────────────
function toggleCat(catId) {
  const body = document.getElementById('catbody-' + catId);
  const tog  = document.getElementById('cattog-' + catId);
  if (!body) return;
  body.classList.toggle('closed');
  tog?.classList.toggle('closed');
  // Trigger video load when category is opened
  if (!body.classList.contains('closed')) {
    body.querySelectorAll('video.tc-video').forEach(v => v.load());
  }
}

// ── Toggle SDK logs ────────────────────────────────────────────────────────
function toggleLogs(id) {
  document.getElementById('logs-' + id)?.classList.toggle('open');
  document.getElementById('ltog-' + id)?.classList.toggle('open');
}

// ── Filter logic ──────────────────────────────────────────────────────────
function applyFilters() {
  const searchText = (document.getElementById('filterSearch')?.value || '').toLowerCase();
  const checkedStatuses = new Set(
    [...document.querySelectorAll('.filter-status:checked')].map(cb => cb.value)
  );

  let shown = 0;
  const cards = document.querySelectorAll('.tc-card');
  cards.forEach(card => {
    const tcId = (card.getAttribute('data-tcid') || '').toLowerCase();
    const tcName = (card.getAttribute('data-tcname') || '').toLowerCase();
    const tcStatus = card.getAttribute('data-status') || 'other';

    const matchesSearch = !searchText || tcId.includes(searchText) || tcName.includes(searchText);
    const matchesStatus = checkedStatuses.has(tcStatus);
    const visible = matchesSearch && matchesStatus;

    card.style.display = visible ? '' : 'none';
    if (visible) shown++;
  });

  // Hide category groups if all their tests are hidden
  document.querySelectorAll('.cat-group').forEach(group => {
    const visibleCards = group.querySelectorAll('.tc-card:not([style*="display: none"])');
    group.style.display = visibleCards.length > 0 ? '' : 'none';
  });

  document.getElementById('showingCount').textContent = `showing ${shown} of ${totalTestCount} tests`;
}

// ── Expand / Collapse All ─────────────────────────────────────────────────
function expandAll() {
  // Open all category bodies
  document.querySelectorAll('.cat-body').forEach(b => b.classList.remove('closed'));
  document.querySelectorAll('.cat-tog').forEach(t => t.classList.remove('closed'));
  // Open all test card bodies
  document.querySelectorAll('.tc-body').forEach(b => {
    b.classList.remove('closed');
    b.querySelectorAll('video.tc-video').forEach(v => v.load());
  });
  document.querySelectorAll('.tc-tog').forEach(t => t.classList.remove('closed'));
}

function collapseAll() {
  // Close all test card bodies (keep category headers visible)
  document.querySelectorAll('.tc-body').forEach(b => b.classList.add('closed'));
  document.querySelectorAll('.tc-tog').forEach(t => t.classList.add('closed'));
}

// ── Run log section ──────────────────────────────────────────────────────
function renderRunLog() {
  const el = document.getElementById('run-log-section');
  if (!runLogText) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  const lineCount = runLogText.split('\n').length;
  document.getElementById('run-log-line-count').textContent = `${lineCount} lines`;
  document.getElementById('run-log-content').textContent = runLogText;
}

function toggleRunLog() {
  document.getElementById('run-log-content')?.classList.toggle('open');
  document.getElementById('run-log-toggle')?.classList.toggle('open');
}

// ── Export dropdown ──────────────────────────────────────────────────────
function toggleExportMenu() {
  const menu = document.getElementById('export-menu');
  menu.classList.toggle('show');
}
// Close dropdown when clicking outside
document.addEventListener('click', e => {
  const menu = document.getElementById('export-menu');
  if (!menu) return;
  if (!e.target.closest('.export-dropdown')) menu.classList.remove('show');
});

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTs() { return new Date().toISOString().replace(/[:.]/g, '-'); }

// ── Export: Debug Viewer Logs (network, debug, analytics from the SDK) ──
function exportDebugViewerLogs() {
  document.getElementById('export-menu').classList.remove('show');
  if (allTcs.length === 0) return;

  const allLogs = { exportedAt: new Date().toISOString(), source: loadedFileName, tests: [] };

  allTcs.forEach(tc => {
    if (!tc.debugLogs) return;
    const entry = {
      testId: tc.id,
      testName: tc.result.name || tc.id,
      status: tc.result.status,
      networkLogs: tc.debugLogs.networkLogs || [],
      debugLogs: tc.debugLogs.debugLogs || [],
      analyticsLogs: tc.debugLogs.analyticsLogs || [],
    };
    allLogs.tests.push(entry);
  });

  if (allLogs.tests.length === 0) {
    alert('No debug viewer logs found in this report.\nEnsure the app was built with the DebugLogExportReceiver.');
    return;
  }

  downloadFile(
    JSON.stringify(allLogs, null, 2),
    `debug-viewer-logs_${exportTs()}.json`,
    'application/json'
  );
}

// ── Export: ADB / SDK Logs (logcat output per test) ─────────────────────
function exportAdbLogs() {
  document.getElementById('export-menu').classList.remove('show');
  if (allTcs.length === 0) return;

  const sections = [];
  let hasLogs = false;

  allTcs.forEach(tc => {
    if (!tc.sdkLogs) return;
    hasLogs = true;
    sections.push('════════════════════════════════════════════════════');
    sections.push(`  ${tc.id} [${(tc.result.status || '?').toUpperCase()}]`);
    sections.push('════════════════════════════════════════════════════');
    sections.push(tc.sdkLogs);
    sections.push('');
  });

  // Append run log if available
  if (runLogText) {
    sections.push('════════════════════════════════════════════════════');
    sections.push('  Run Log (test runner output)');
    sections.push('════════════════════════════════════════════════════');
    sections.push(runLogText);
    hasLogs = true;
  }

  if (!hasLogs) {
    alert('No SDK/ADB logs found in this report.');
    return;
  }

  downloadFile(
    sections.join('\n'),
    `adb-sdk-logs_${exportTs()}.txt`,
    'text/plain'
  );
}

// ── Export: Full Report (everything in one file) ────────────────────────
function exportFullReport() {
  document.getElementById('export-menu').classList.remove('show');
  if (allTcs.length === 0) return;

  const sections = [];

  sections.push('═══════════════════════════════════════════════════');
  sections.push('  IA SDK E2E Test Report — Full Export');
  sections.push(`  Source: ${loadedFileName}`);
  sections.push(`  Exported: ${new Date().toLocaleString()}`);
  sections.push('═══════════════════════════════════════════════════');
  sections.push('');

  const passed = allTcs.filter(t => t.result.status?.toUpperCase() === 'PASS').length;
  const failed = allTcs.filter(t => ['FAIL','ERROR'].includes(t.result.status?.toUpperCase())).length;
  sections.push(`Results: ${passed} passed, ${failed} failed, ${allTcs.length} total`);
  sections.push('');

  if (runSummaryText) {
    sections.push('── Claude Summary ──');
    sections.push(runSummaryText.trim());
    sections.push('');
  }

  // Per-test results
  sections.push('═══════════════════════════════════════════════════');
  sections.push('  Per-Test Results');
  sections.push('═══════════════════════════════════════════════════');

  allTcs.forEach(tc => {
    const status = (tc.result.status || 'UNKNOWN').toUpperCase();
    const icon = status === 'PASS' ? '✔' : status === 'FAIL' || status === 'ERROR' ? '✘' : '⚠';
    sections.push('');
    sections.push(`── ${icon} ${tc.id} [${status}] ──`);
    if (tc.result.name) sections.push(`  Name: ${tc.result.name}`);
    if (tc.result.notes) sections.push(`  Notes: ${tc.result.notes}`);
    if (tc.result.error) sections.push(`  Error: ${tc.result.error}`);
    sections.push(`  Duration: ${tc.meta.duration_s ?? 0}s`);

    const steps = tc.result.steps || [];
    if (steps.length > 0) {
      sections.push('  Steps:');
      steps.forEach((s, i) => {
        const sIcon = (s.status || '').toUpperCase() === 'PASS' ? '✔' : (s.status || '').toUpperCase() === 'FAIL' ? '✘' : '–';
        let line = `    ${i+1}. [${sIcon}] ${s.name || ''}`;
        if (s.notes) line += ` — ${s.notes}`;
        sections.push(line);
      });
    }

    if (tc.result.investigation) {
      let inv = tc.result.investigation;
      if (typeof inv === 'string') { try { inv = JSON.parse(inv); } catch (_) { inv = { diagnosis: inv }; } }
      sections.push('  Retry:');
      if (inv.retryStatus) sections.push(`    Status: ${inv.retryStatus}`);
      if (inv.provider) sections.push(`    Provider: ${inv.provider}`);
      if (inv.diagnosis) sections.push(`    Diagnosis: ${typeof inv.diagnosis === 'string' ? inv.diagnosis : JSON.stringify(inv.diagnosis)}`);
      if (inv.selectorChanges?.length > 0) {
        sections.push('    Selector changes:');
        inv.selectorChanges.forEach(c => sections.push(`      [${c.step}] "${c.expected}" → "${c.actual}"`));
      }
      if (inv.providerAttempts?.length > 0) {
        sections.push('    Attempts:');
        inv.providerAttempts.forEach((a, idx) => {
          sections.push(`      ${idx + 1}. ${a.provider || 'unknown'} exit=${a.exitCode ?? '?'} timeout=${a.timeout ? 'yes' : 'no'} output=${a.outputFile || '-'}`);
        });
      }
    }

    // Debug viewer summary per test
    if (tc.debugLogs) {
      const net = (tc.debugLogs.networkLogs || []).length;
      const dbg = (tc.debugLogs.debugLogs || []).length;
      const ana = (tc.debugLogs.analyticsLogs || []).length;
      sections.push(`  Debug Viewer: ${net} network, ${dbg} debug, ${ana} analytics`);
    }
  });

  // Run log
  if (runLogText) {
    sections.push('');
    sections.push('═══════════════════════════════════════════════════');
    sections.push('  Run Log (test runner output)');
    sections.push('═══════════════════════════════════════════════════');
    sections.push(runLogText);
  }

  // SDK logs
  allTcs.forEach(tc => {
    if (tc.sdkLogs) {
      sections.push('');
      sections.push(`── SDK Logs: ${tc.id} ──`);
      sections.push(tc.sdkLogs);
    }
  });

  downloadFile(
    sections.join('\n'),
    `e2e-full-report_${exportTs()}.txt`,
    'text/plain'
  );
}

// ── HTML escape ────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Theme toggle ──────────────────────────────────────────────────────────
// Cycles: Auto → Light → Dark → Auto.
// "Auto" removes the data-theme attribute so the @media prefers-color-scheme
// rule kicks in. "Light"/"Dark" set it explicitly, overriding the system.
function cycleTheme() {
  const root = document.documentElement;
  const current = localStorage.getItem('e2e-theme'); // null | 'light' | 'dark'
  let next;
  if (current === null)         next = 'light';
  else if (current === 'light') next = 'dark';
  else                          next = null; // back to auto

  if (next) {
    root.setAttribute('data-theme', next);
    localStorage.setItem('e2e-theme', next);
  } else {
    root.removeAttribute('data-theme');
    localStorage.removeItem('e2e-theme');
  }
  updateThemeButtons();
}

function updateThemeButtons() {
  const saved = localStorage.getItem('e2e-theme');
  let icon, label;
  if (saved === 'light')      { icon = '☀️'; label = 'Light'; }
  else if (saved === 'dark')  { icon = '🌙'; label = 'Dark'; }
  else                        { icon = '🌗'; label = 'Auto'; }

  ['drop', 'bar'].forEach(loc => {
    const iconEl = document.getElementById('theme-icon-' + loc);
    const labelEl = document.getElementById('theme-label-' + loc);
    if (iconEl) iconEl.textContent = icon;
    if (labelEl) labelEl.textContent = label;
  });
}

updateThemeButtons();
