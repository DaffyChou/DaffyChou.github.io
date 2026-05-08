// ============================================================
// Notion PM Dashboard - Client Script
// ============================================================
'use strict';

const STATUS_COLOR = {
  '積壓': '#9ca3af', '進行中': '#eab308', '暫停': '#9333ea',
  '結案(需優化)': '#dc2626', '結案': '#16a34a', '結案(協助後續)': '#22c55e',
  '取消': '#6b7280'
};
const CATEGORY_COLOR = {
  '專案': '#3b82f6', '產品': '#eab308', '維運': '#a16207',
  '內部': '#6b7280', '未分類': '#d1d5db'
};
const RISK_COLOR = { '高': '#dc2626', '中': '#f97316', '低': '#eab308', '安全': '#16a34a' };
const TASK_PROGRESS_COLOR = {
  '尚未開始': '#9ca3af', '進行中': '#3b82f6', '測試': '#eab308',
  'PM測試': '#f59e0b', '修正': '#dc2626', '正式站上線': '#9333ea',
  '暫停': '#6b7280', '完成': '#16a34a'
};
const STATUS_PRESETS = {
  active: ['積壓', '進行中', '暫停', '結案(需優化)'],
  all: ['積壓', '進行中', '暫停', '結案(需優化)', '結案', '結案(協助後續)', '取消'],
  clear: []
};

const NOTION_TOOLS = {
  fetch: 'mcp__d90ff493-0a64-4244-9893-ff6cb440ba73__notion-fetch',
  query: 'mcp__d90ff493-0a64-4244-9893-ff6cb440ba73__notion-query-database-view',
};

const PROJECTS_VIEW_URL = 'https://www.notion.so/ca4bf5150233487ba522c98aa232fed3?v=21695573-ebd8-4549-814e-5cf1eb23fc29';
const TASKS_ALL_VIEW_URL = 'https://www.notion.so/79baaf3df9b743e2a639d8d46574bc15?v=62c0fd49-961f-462e-ae3d-b55acaa511a3';
const TASKS_ACTIVE_VIEW_URL = 'https://www.notion.so/79baaf3df9b743e2a639d8d46574bc15?v=1d11e8e6b4828030ba1b000c66597324';
const BUGS_VIEW_URL = 'https://www.notion.so/8e2cd067ce97479e9d3976eca80cff36?v=1ab1e8e6-b482-80a6-8e3e-000cfd953cd1';

const DONE_PROJECT = new Set(['結案', '結案(協助後續)', '取消']);
const DONE_TASK = new Set(['完成', '正式站上線']);

const CACHE_KEY_BULK = 'pm-bulk-tasks';
const CACHE_KEY_FILTER = 'pm-status-filter';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let DATA = null;
let CHARTS = {};
let GRID_INSTANCE = null;
let STATUS_FILTER = null;
let EXPANDED_PROJECTS = new Set();
let WHITELIST_PIDS = null;
let AUTO_LOADED = false;

// ====================== Banner helpers ======================
function showBanner(type, html, autoHide) {
  if (autoHide === undefined) autoHide = 4000;
  const el = document.getElementById('banner-' + type);
  if (!el) return;
  el.innerHTML = html;
  el.classList.add('show');
  if (autoHide) setTimeout(function(){ el.classList.remove('show'); }, autoHide);
}
function hideBanner(type) {
  const el = document.getElementById('banner-' + type);
  if (el) el.classList.remove('show');
}

// ====================== callMcpTool helpers ======================
function extractFetchText(r) {
  if (!r) return null;
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) {
    if (r.length === 0) return null;
    if (typeof r[0] === 'object' && r[0] !== null && 'text' in r[0]) return r[0].text;
    return JSON.stringify(r);
  }
  if (typeof r === 'object') {
    if (Array.isArray(r.content) && r.content.length && r.content[0].text) return r.content[0].text;
    if ('text' in r) return r.text;
    return JSON.stringify(r);
  }
  return String(r);
}

async function callTool(name, args) {
  if (!window.cowork || !window.cowork.callMcpTool) {
    throw new Error('window.cowork.callMcpTool 不可用 (請從 Cowork artifact 開啟)');
  }
  return await window.cowork.callMcpTool(name, args);
}

function parseFetchedTaskPage(rec) {
  try {
    const text = extractFetchText(rec);
    if (!text) return null;
    const m = text.match(/<properties>([\s\S]*?)<\/properties>/);
    if (m) {
      try { return JSON.parse(m[1]); } catch(e) {}
    }
    try { return JSON.parse(text); } catch(e) {}
    return null;
  } catch(e) { return null; }
}

// ====================== Generic utils ======================
function urlToUuid(u) {
  if (!u) return null;
  const m = String(u).replace(/-/g, '').match(/([0-9a-f]{32})/);
  return m ? m[1] : null;
}

function userName(uid) {
  if (!uid) return '未指派';
  const map = (DATA && DATA.meta && DATA.meta.user_map) || {};
  return map[uid] || ('未知 (' + String(uid).substring(0, 6) + '…)');
}

function parseArr(s) {
  if (!s || s === '<omitted />' || s === '[]') return [];
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s); } catch(e) { return []; }
}

function parseUserIds(s) {
  const arr = parseArr(s);
  const out = [];
  for (const u of arr) {
    if (typeof u !== 'string') { out.push(u); continue; }
    if (u.startsWith('user://')) { out.push(u.slice(7)); continue; }
    const m = u.match(/user:\/\/([0-9a-f-]+)/);
    if (m) { out.push(m[1]); continue; }
    out.push(u);
  }
  return out;
}

function safeDate(s) {
  if (!s || s === '<omitted />') return null;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch(e) { return null; }
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ====================== Process raw → record ======================
function processSingleTask(t, sourceTag) {
  if (!sourceTag) sourceTag = 'fetched';
  const t_url = t.url || '';
  const t_id = urlToUuid(t_url);
  if (!t_id) return null;
  const project_urls = parseArr(t['專案']);
  const project_ids = project_urls.map(urlToUuid);
  const dev_ids = parseUserIds(t['開發人員']);
  const mgr_ids = parseUserIds(t['主責主管']);
  const due = safeDate(t['date:任務到期日:start']);
  const start = safeDate(t['date:開始日期:start']);
  const done = safeDate(t['date:完成日期:start']);
  const status = t['任務進度'] || '尚未開始';
  let days_overdue = 0;
  if (due && !DONE_TASK.has(status)) {
    const today = new Date(todayStr());
    const dd = new Date(due);
    const diff = Math.floor((today - dd) / (1000 * 60 * 60 * 24));
    if (diff > 0) days_overdue = diff;
  }
  return {
    id: t_id,
    url: t_url,
    name: (t['任務名稱'] || '').trim() || '(未命名)',
    status: status,
    stage: t['階段'] || '',
    priority: t['優先'] || '中',
    due: due, start: start, done: done,
    days_overdue: days_overdue,
    project_ids: project_ids,
    project_urls: project_urls,
    devs: dev_ids.map(userName),
    dev_ids: dev_ids,
    mgrs: mgr_ids.map(userName),
    mgr_ids: mgr_ids,
    parent_urls: parseArr(t['Parent task']),
    sub_urls: parseArr(t['Sub-task']),
    is_done: DONE_TASK.has(status),
    source: sourceTag,
  };
}

function processSingleProject(r) {
  const url = r.url || '';
  const id = urlToUuid(url);
  const owner_ids = parseUserIds(r['負責人']);
  const pm_ids = parseUserIds(r['PM']);
  const contract_start = safeDate(r['date:合約執行期間:start']);
  const contract_end = safeDate(r['date:合約執行期間:end']);
  const status = r['專案進度'] || '積壓';
  const task_urls = parseArr(r['Tasks']);
  const bug_urls = parseArr(r['🐞 修正清單']);
  let days_overdue = 0, days_left = null;
  if (contract_end) {
    const today = new Date(todayStr());
    const ce = new Date(contract_end);
    const diff = Math.floor((today - ce) / (1000 * 60 * 60 * 24));
    if (diff > 0 && !DONE_PROJECT.has(status)) days_overdue = diff;
    else if (diff <= 0) days_left = -diff;
  }
  return {
    id: id, url: url,
    name: (r['專案名稱'] || '').trim() || '(未命名)',
    category: r['分類'] || '未分類',
    status: status,
    owners: owner_ids.map(userName), owner_ids: owner_ids,
    pm: pm_ids.map(userName), pm_ids: pm_ids,
    contract_start: contract_start, contract_end: contract_end,
    days_overdue: days_overdue, days_left: days_left,
    task_urls: task_urls, task_count_total: task_urls.length,
    bug_urls: bug_urls, bug_count_total: bug_urls.length,
    focus: (r['重點'] || '').trim(),
    tasks_loaded: [], task_count_loaded: 0,
    task_done_count: 0, task_active_count: 0, coverage: 0,
    task_status_counts: {}, bugs: [], bug_count_loaded: 0,
    risk: { score: 0, level: '安全', reasons: [], open_bug_count: 0 },
  };
}

function processSingleBug(r) {
  const url = r.url || '';
  const id = urlToUuid(url);
  const project_urls = parseArr(r['專案']);
  return {
    id: id, url: url,
    title: (r['問題修正'] || '').trim() || '(未命名)',
    status: r['狀態'] || '尚未修正',
    priority: r['優先'] || '中',
    project_ids: project_urls.map(urlToUuid),
    project_urls: project_urls,
    customer_req: r['客戶需求'] === '__YES__',
    engineer: parseUserIds(r['修正工程師']).map(userName),
    fix_date: safeDate(r['date:修正日期:start']),
  };
}

function computeRiskClient(p, bugs) {
  let score = 0;
  const reasons = [];
  const isDone = DONE_PROJECT.has(p.status);
  if (p.status === '結案(需優化)') { score += 3; reasons.push('結案需優化 +3'); }
  if (p.status === '暫停') { score += 2; reasons.push('暫停中 +2'); }
  if (p.status === '積壓' && p.task_count_total > 0) { score += 1; reasons.push('積壓但有任務 +1'); }
  if (!isDone) {
    if (p.days_overdue > 0) { score += 3; reasons.push('合約已逾期 ' + p.days_overdue + ' 天 +3'); }
    else if (p.days_left !== null && p.days_left <= 30) { score += 2; reasons.push('合約 ' + p.days_left + ' 天內到期 +2'); }
  }
  if ((!p.owners || p.owners.length === 0) && !isDone) { score += 2; reasons.push('無負責人 +2'); }
  const openBugs = bugs.filter(function(b){ return b.status !== '完成' && b.status !== '暫停'; });
  if (openBugs.length > 5) { score += 1; reasons.push('未結 bug ' + openBugs.length + ' >5 +1'); }
  if (p.task_count_total > 50) { score += 1; reasons.push('任務量 ' + p.task_count_total + ' >50 +1'); }
  let level = '安全';
  if (score >= 5) level = '高';
  else if (score >= 3) level = '中';
  else if (score >= 1) level = '低';
  return { score: score, level: level, reasons: reasons, open_bug_count: openBugs.length };
}

// ====================== Init / orchestration ======================
function init() {
  const dataEl = document.getElementById('dashboard-data');
  try {
    DATA = JSON.parse(dataEl.textContent);
  } catch(e) {
    showBanner('error', '初始資料解析失敗:' + e.message, 0);
    return;
  }

  WHITELIST_PIDS = new Set((DATA.meta.whitelist_project_ids || []).concat(DATA.projects.map(function(p){ return p.id; })));
  applyWhitelistFilter();
  tryRestoreCache();
  loadFilterFromStorage();
  if (!STATUS_FILTER) STATUS_FILTER = STATUS_PRESETS.active.slice();

  document.getElementById('meta-line').textContent =
    '資料時間:' + DATA.meta.data_freshness + ' · 今日:' + DATA.meta.today + ' · 樣本任務:' + DATA.tasks.length;

  let waited = 0;
  const tryRender = function() {
    if (typeof Chart !== 'undefined') {
      renderAll();
      maybeAutoLoad();
    } else if (waited < 300) {
      waited++;
      if (waited === 50) showBanner('info', '⏳ 正在等待 Chart.js 從 CDN 載入… (' + (waited*0.1).toFixed(1) + 's)', 0);
      setTimeout(tryRender, 100);
    } else {
      showBanner('error', 'Chart.js 載入逾時 (30s)。圖表將不顯示,但其他資料仍會渲染。請檢查網路或重新整理。', 0);
      renderAll();
      maybeAutoLoad();
    }
  };
  tryRender();
}

function applyWhitelistFilter() {
  if (!WHITELIST_PIDS || WHITELIST_PIDS.size === 0) return;
  DATA.tasks = DATA.tasks.filter(function(t){
    return (t.project_ids || []).some(function(pid){ return WHITELIST_PIDS.has(pid); });
  });
  DATA.bugs = DATA.bugs.filter(function(b){
    return (b.project_ids || []).some(function(pid){ return WHITELIST_PIDS.has(pid); });
  });
}

function maybeAutoLoad() {
  if (AUTO_LOADED) return;
  AUTO_LOADED = true;
  const expected = (DATA.coverage && DATA.coverage.total_expected_tasks) || 0;
  const missing = expected - DATA.tasks.length;
  if (missing < 5) return;
  if (!window.cowork || !window.cowork.callMcpTool) {
    showBanner('error', '⚠️ window.cowork.callMcpTool 不可用 - 自動載入無法執行。請從 Cowork artifact 開啟。', 0);
    return;
  }
  // Aggressive: only skip if coverage already ≥95%
  if (expected > 0 && DATA.tasks.length >= expected * 0.95) return;
  showBanner('info',
    '<span class="spinner"></span> 自動載入中:補抓 ' + missing + ' 筆缺少的任務 (約 1-3 分鐘),完成後將自動更新所有區塊…', 0);
  setTimeout(function(){ loadAllTasks(true); }, 800);
}

function renderAll() {
  recomputeAggregates();
  renderKpi();
  renderProjStatusChart();
  renderProjCategoryChart();
  renderProjRiskChart();
  renderCoverageBanner();
  renderStatusChips();
  renderProjectTree();
  renderTaskGrid();
  renderWorkload();
  renderMemberTasks();
  renderToTrack();
  renderRiskList();
  renderSuggestions();
}

// ====================== Recompute ======================
function recomputeAggregates() {
  if (WHITELIST_PIDS && WHITELIST_PIDS.size) {
    DATA.tasks = DATA.tasks.filter(function(t){
      return (t.project_ids || []).some(function(pid){ return WHITELIST_PIDS.has(pid); });
    });
    DATA.bugs = DATA.bugs.filter(function(b){
      return (b.project_ids || []).some(function(pid){ return WHITELIST_PIDS.has(pid); });
    });
  }
  const tasks = DATA.tasks;
  const total_tasks = tasks.length;
  const done = tasks.filter(function(t){ return t.is_done; }).length;
  const inprog = tasks.filter(function(t){ return t.status === '進行中'; }).length;
  const notstart = tasks.filter(function(t){ return t.status === '尚未開始'; }).length;
  const overdue = tasks.filter(function(t){ return t.days_overdue > 0 && !t.is_done; }).length;
  DATA.kpi.task_sample_size = total_tasks;
  DATA.kpi.task_done = done;
  DATA.kpi.task_inprog = inprog;
  DATA.kpi.task_notstart = notstart;
  DATA.kpi.task_overdue = overdue;
  DATA.kpi.completion_rate = total_tasks ? +((done / total_tasks) * 100).toFixed(1) : 0;

  const psc = {}, pcc = {}, prc = {};
  DATA.projects.forEach(function(p){
    psc[p.status] = (psc[p.status] || 0) + 1;
    pcc[p.category] = (pcc[p.category] || 0) + 1;
    prc[p.risk.level] = (prc[p.risk.level] || 0) + 1;
  });
  DATA.kpi.project_status = psc;
  DATA.kpi.project_category = pcc;
  DATA.kpi.risk_level_counts = prc;

  // Workload with primary project
  const wl = {};
  tasks.forEach(function(t){
    t.devs.forEach(function(dev){
      if (!wl[dev]) wl[dev] = { name: dev, '完成': 0, '進行中': 0, '尚未開始': 0, '暫停': 0, '其他': 0, overdue: 0, total: 0, _proj: {} };
      const s = t.status;
      if (s === '完成') wl[dev]['完成']++;
      else if (s === '進行中') wl[dev]['進行中']++;
      else if (s === '尚未開始') wl[dev]['尚未開始']++;
      else if (s === '暫停') wl[dev]['暫停']++;
      else wl[dev]['其他']++;
      wl[dev].total++;
      if (t.days_overdue > 0 && !t.is_done) wl[dev].overdue++;
      for (let i = 0; i < t.project_ids.length; i++) {
        const pid = t.project_ids[i];
        const p = DATA.projects.find(function(x){ return x.id === pid; });
        if (p) wl[dev]._proj[p.name] = (wl[dev]._proj[p.name] || 0) + 1;
      }
    });
  });
  Object.values(wl).forEach(function(w){
    const entries = Object.entries(w._proj).sort(function(a,b){ return b[1] - a[1]; });
    w.primary_project = entries[0] ? entries[0][0] : '';
    w.primary_count = entries[0] ? entries[0][1] : 0;
    w.project_dist = Object.fromEntries(entries.slice(0, 3));
    delete w._proj;
  });
  DATA.workload = Object.values(wl).sort(function(a,b){ return b.total - a.total; });

  // To-track
  const toTrack = [];
  tasks.forEach(function(t){
    const flags = [];
    if (t.days_overdue > 0 && !t.is_done) flags.push('逾期');
    if (t.status === '修正') flags.push('修正中');
    if (t.status === '測試' || t.status === 'PM測試') flags.push('測試卡關');
    if (t.priority === '高' && !t.is_done) flags.push('高優未完成');
    if (flags.length) {
      let pname = '(無專案)';
      for (let i = 0; i < t.project_ids.length; i++) {
        const pid = t.project_ids[i];
        const p = DATA.projects.find(function(x){ return x.id === pid; });
        if (p) { pname = p.name; break; }
      }
      toTrack.push({
        id: t.id, url: t.url, name: t.name, status: t.status,
        priority: t.priority, project: pname, devs: t.devs,
        days_overdue: t.days_overdue, due: t.due, flags: flags,
      });
    }
  });
  toTrack.sort(function(a,b){ return b.days_overdue - a.days_overdue; });
  DATA.to_track = toTrack.slice(0, 30);

  // Per-project task counts
  const tasksByProj = {};
  tasks.forEach(function(t){
    t.project_ids.forEach(function(pid){
      (tasksByProj[pid] = tasksByProj[pid] || []).push(t);
    });
  });
  DATA.projects.forEach(function(p){
    const arr = tasksByProj[p.id] || [];
    p.tasks_loaded = arr;
    p.task_count_loaded = arr.length;
    p.task_done_count = arr.filter(function(t){ return t.is_done; }).length;
    p.task_active_count = arr.length - p.task_done_count;
    p.coverage = p.task_count_total ? +((arr.length / p.task_count_total) * 100).toFixed(1) : 100;
    const sc2 = {};
    arr.forEach(function(t){ sc2[t.status] = (sc2[t.status] || 0) + 1; });
    p.task_status_counts = sc2;
  });

  const projWithTasks = DATA.projects.filter(function(p){ return p.task_count_total > 0; });
  DATA.coverage = {
    full: projWithTasks.filter(function(p){ return p.coverage >= 99.9; }).length,
    partial: projWithTasks.filter(function(p){ return p.coverage > 0 && p.coverage < 99.9; }).length,
    zero: projWithTasks.filter(function(p){ return p.coverage < 0.1; }).length,
    no_tasks: DATA.projects.filter(function(p){ return p.task_count_total === 0; }).length,
    total_loaded_tasks: tasks.length,
    total_expected_tasks: DATA.projects.reduce(function(s,p){ return s + p.task_count_total; }, 0),
  };
}

// ====================== KPI ======================
function renderKpi() {
  const k = DATA.kpi;
  const high = k.risk_level_counts['高'] || 0;
  const med = k.risk_level_counts['中'] || 0;
  const cards = [
    { label: '專案總數', value: k.total_projects, sub: '已分類', cls: 'accent' },
    { label: '整體任務完成率', value: k.completion_rate + '%', sub: '(' + k.task_done + '/' + k.task_sample_size + ' 樣本)', cls: 'success' },
    { label: '高風險專案', value: high, sub: high ? '需立即處理' : '✓', cls: high ? 'danger' : '' },
    { label: '中風險專案', value: med, sub: '建議追蹤', cls: med ? 'warning' : '' },
    { label: '已完成任務', value: k.task_done, sub: '樣本內', cls: 'success' },
    { label: '進行中任務', value: k.task_inprog, sub: '樣本內', cls: 'accent' },
    { label: '尚未開始', value: k.task_notstart, sub: '樣本內', cls: '' },
    { label: '逾期任務', value: k.task_overdue, sub: '需追蹤', cls: k.task_overdue ? 'danger' : '' },
  ];
  const html = cards.map(function(c){
    return '<div class="kpi-card ' + c.cls + '"><div class="label">' + c.label + '</div><div class="value">' + c.value + '</div><div class="sub">' + c.sub + '</div></div>';
  }).join('');
  document.getElementById('kpi-grid').innerHTML = html;
}

// ====================== Charts ======================
function destroyChart(key) {
  if (CHARTS[key]) { try { CHARTS[key].destroy(); } catch(e) {} CHARTS[key] = null; }
}

function makeDoughnut(canvasId, labels, data, colors) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  CHARTS[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: function(ctx){ const total = data.reduce(function(a,b){ return a+b; },0); return ctx.label + ': ' + ctx.parsed + ' (' + (ctx.parsed/total*100).toFixed(1) + '%)'; } } }
      }
    }
  });
}

function renderProjStatusChart() {
  const psc = DATA.kpi.project_status;
  const labels = Object.keys(psc);
  const data = labels.map(function(l){ return psc[l]; });
  const colors = labels.map(function(l){ return STATUS_COLOR[l] || '#94a3b8'; });
  makeDoughnut('chart-proj-status', labels, data, colors);
}
function renderProjCategoryChart() {
  const pcc = DATA.kpi.project_category;
  const labels = Object.keys(pcc);
  const data = labels.map(function(l){ return pcc[l]; });
  const colors = labels.map(function(l){ return CATEGORY_COLOR[l] || '#94a3b8'; });
  destroyChart('chart-proj-category');
  const ctx = document.getElementById('chart-proj-category');
  if (!ctx) return;
  CHARTS['chart-proj-category'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 11 } } } }
    }
  });
}
function renderProjRiskChart() {
  const prc = DATA.kpi.risk_level_counts;
  const order = ['高', '中', '低', '安全'];
  const labels = order.filter(function(k){ return prc[k]; });
  const data = labels.map(function(l){ return prc[l]; });
  const colors = labels.map(function(l){ return RISK_COLOR[l]; });
  makeDoughnut('chart-proj-risk', labels, data, colors);
}

// ====================== Coverage banner ======================
function renderCoverageBanner() {
  const c = DATA.coverage;
  const pct = c.total_expected_tasks ? ((c.total_loaded_tasks / c.total_expected_tasks) * 100).toFixed(1) : 0;
  const html =
    '<div><b>📦 樣本覆蓋率</b></div>' +
    '<div>已載入 <b>' + c.total_loaded_tasks + '</b> / 預期 <b>' + c.total_expected_tasks + '</b> 任務 (' + pct + '%)</div>' +
    '<div>✓ 完整覆蓋 <b>' + c.full + '</b> · 部分覆蓋 <b>' + c.partial + '</b> · 0 覆蓋 <b>' + c.zero + '</b> · 無任務 <b>' + c.no_tasks + '</b></div>' +
    '<div style="margin-left:auto;"><span style="color:var(--text-mute); font-size:11.5px;">點專案旁的 🔍 補載缺少任務</span></div>';
  document.getElementById('coverage-banner').innerHTML = html;

  const zeroList = DATA.projects.filter(function(p){ return p.task_count_total > 0 && p.coverage < 0.1; });
  const ze = document.getElementById('zero-coverage-list');
  if (zeroList.length === 0) {
    ze.style.display = 'none';
  } else {
    ze.style.display = '';
    const links = zeroList.slice(0, 12).map(function(p){
      return '<a href="' + p.url + '" target="_blank">' + escapeHtml(p.name) + ' (' + p.task_count_total + ')</a>';
    }).join('');
    ze.innerHTML = '<b>🔍 0 覆蓋專案 (' + zeroList.length + ')</b> · 點擊在 Notion 開啟:<br>' + links +
      (zeroList.length > 12 ? ' <span style="color:#854d0e;">…還有 ' + (zeroList.length - 12) + ' 個</span>' : '');
  }
  document.getElementById('task-tab-badge').textContent = DATA.tasks.length + ' 筆樣本';
}

// ====================== Status chips ======================
function renderStatusChips() {
  const psc = DATA.kpi.project_status;
  const order = ['積壓', '進行中', '暫停', '結案(需優化)', '結案', '結案(協助後續)', '取消'];
  const html = order.filter(function(s){ return psc[s]; }).map(function(s){
    const active = STATUS_FILTER.includes(s);
    const color = STATUS_COLOR[s];
    const style = active ? 'background:' + color + ';border-color:' + color + ';' : '';
    return '<span class="chip ' + (active ? 'active' : '') + '" style="' + style + '" onclick="toggleStatus(\'' + s + '\')">' +
      s + ' <span class="count">' + psc[s] + '</span></span>';
  }).join('');
  document.getElementById('status-chips').innerHTML = html;
}

function toggleStatus(s) {
  if (STATUS_FILTER.includes(s)) {
    STATUS_FILTER = STATUS_FILTER.filter(function(x){ return x !== s; });
  } else {
    STATUS_FILTER = STATUS_FILTER.concat([s]);
  }
  saveFilterToStorage();
  renderStatusChips();
  renderProjectTree();
}

function setStatusPreset(key) {
  STATUS_FILTER = (STATUS_PRESETS[key] || []).slice();
  saveFilterToStorage();
  renderStatusChips();
  renderProjectTree();
}

function saveFilterToStorage() {
  try { localStorage.setItem(CACHE_KEY_FILTER, JSON.stringify(STATUS_FILTER)); } catch(e) {}
}
function loadFilterFromStorage() {
  try {
    const v = localStorage.getItem(CACHE_KEY_FILTER);
    if (v) STATUS_FILTER = JSON.parse(v);
  } catch(e) {}
}

// ====================== Project tree ======================
function renderProjectTree() {
  const filtered = DATA.projects.filter(function(p){ return STATUS_FILTER.includes(p.status); });
  const html = filtered.map(function(p){
    const expanded = EXPANDED_PROJECTS.has(p.id);
    const sColor = STATUS_COLOR[p.status] || '#94a3b8';
    const rColor = RISK_COLOR[p.risk.level] || '#94a3b8';
    const activeTasks = (p.tasks_loaded || []).filter(function(t){ return !t.is_done && t.status !== '暫停'; });
    const taskCount = activeTasks.length;
    const tasksHtml = activeTasks.map(function(t){
      const tc = TASK_PROGRESS_COLOR[t.status] || '#94a3b8';
      const overdueClass = t.days_overdue > 0 ? 'overdue' : '';
      const dueText = t.due ? (t.days_overdue > 0 ? '逾期 ' + t.days_overdue + ' 天' : '到期 ' + t.due) : '無期限';
      const devs = t.devs.length ? t.devs.join(', ') : '未指派';
      return '<div class="task-row ' + overdueClass + '">' +
        '<span class="status-dot" style="background:' + tc + '"></span>' +
        '<a href="' + t.url + '" target="_blank">' + escapeHtml(t.name) + '</a>' +
        '<span style="color:var(--text-mute); font-size:11px;">' + escapeHtml(devs) + '</span>' +
        '<span class="due">' + dueText + '</span></div>';
    }).join('') || '<div style="padding:6px 4px; color:var(--text-mute); font-size:12px;">(此樣本無活躍任務,可能全部已完成或暫停)</div>';

    const covBadge = (p.coverage < 99.9 && p.task_count_total > 0)
      ? '<span class="badge-count" title="樣本覆蓋率">cov ' + p.coverage + '%</span>' : '';

    return '<div class="proj-row">' +
      '<div class="proj-head" onclick="toggleProj(\'' + p.id + '\')">' +
        '<span class="toggle">' + (expanded ? '▼' : '▶') + '</span>' +
        '<span class="badge badge-status" style="background:' + sColor + '">' + p.status + '</span>' +
        '<span class="badge badge-risk" style="background:' + rColor + '">' + p.risk.level + '</span>' +
        '<span class="name"><a href="' + p.url + '" target="_blank" onclick="event.stopPropagation()">' + escapeHtml(p.name) + '</a></span>' +
        '<span class="badge-count">活躍 ' + taskCount + ' / 全部 ' + p.task_count_total + '</span>' +
        covBadge +
        '<span class="proj-actions" onclick="event.stopPropagation()">' +
          '<button onclick="forceUpdateProject(\'' + p.id + '\', false)" title="補載缺少任務">🔍</button>' +
          '<button onclick="forceUpdateProject(\'' + p.id + '\', true)" title="重抓所有任務">🔄</button>' +
        '</span>' +
      '</div>' +
      '<div class="proj-tasks ' + (expanded ? 'expanded' : '') + '" id="proj-tasks-' + p.id + '">' + tasksHtml + '</div>' +
    '</div>';
  }).join('') || '<div style="padding:20px; text-align:center; color:var(--text-mute);">沒有符合條件的專案 (請調整 chip 篩選)</div>';
  document.getElementById('proj-tree').innerHTML = html;
}

function toggleProj(pid) {
  if (EXPANDED_PROJECTS.has(pid)) EXPANDED_PROJECTS.delete(pid);
  else EXPANDED_PROJECTS.add(pid);
  renderProjectTree();
}

// ====================== Task grid ======================
function renderTaskGrid() {
  const target = document.getElementById('task-grid');
  if (!target) return;
  if (typeof gridjs === 'undefined') {
    target.innerHTML = '<div style="padding:20px; color:var(--text-mute);">Grid.js 未載入</div>';
    return;
  }
  target.innerHTML = '';
  const rows = DATA.tasks.map(function(t){
    let pname = '';
    for (let i = 0; i < t.project_ids.length; i++) {
      const pid = t.project_ids[i];
      const p = DATA.projects.find(function(x){ return x.id === pid; });
      if (p) { pname = p.name; break; }
    }
    return [
      gridjs.html('<a href="' + t.url + '" target="_blank">' + escapeHtml(t.name) + '</a>'),
      pname,
      t.status,
      t.priority,
      t.devs.join(', '),
      t.due || '',
      t.days_overdue > 0 ? String(t.days_overdue) : '',
    ];
  });
  GRID_INSTANCE = new gridjs.Grid({
    columns: ['任務', '專案', '狀態', '優先', '負責人', '到期', '逾期天'],
    data: rows,
    search: true,
    sort: true,
    pagination: { limit: 25 },
    style: { table: { 'font-size': '12.5px' }, th: { 'font-weight': '600' } },
    language: {
      search: { placeholder: '🔍 搜尋任務…' },
      pagination: { previous: '上一頁', next: '下一頁', showing: '顯示', to: '到', of: '共', results: '筆' },
      noRecordsFound: '無符合任務',
    }
  }).render(target);
}

function switchTab(name) {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(function(t){ t.classList.toggle('active', t.dataset.tab === name); });
  document.getElementById('tab-grouped').classList.toggle('active', name === 'grouped');
  document.getElementById('tab-grid').classList.toggle('active', name === 'grid');
  setTimeout(function(){
    Object.values(CHARTS).forEach(function(c){ if (c && c.resize) c.resize(); });
  }, 100);
}

// ====================== Workload ======================
function renderWorkload() {
  const wl = DATA.workload || [];
  const labels = wl.map(function(w){ return w.name; });
  const cols = ['完成', '進行中', '尚未開始', '暫停'];
  const datasets = cols.map(function(c){
    return {
      label: c,
      data: wl.map(function(w){ return w[c] || 0; }),
      backgroundColor: TASK_PROGRESS_COLOR[c] || '#94a3b8',
      borderWidth: 0,
    };
  });
  destroyChart('chart-workload');
  const ctx = document.getElementById('chart-workload');
  if (ctx) {
    CHARTS['chart-workload'] = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
        scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true, ticks: { font: { size: 11 } } } }
      }
    });
  }

  const tbody = document.querySelector('#workload-table tbody');
  tbody.innerHTML = wl.map(function(w){
    const distTooltip = Object.entries(w.project_dist || {}).map(function(kv){ return kv[0] + ': ' + kv[1]; }).join('\n');
    const primaryHtml = w.primary_project
      ? '<div title="' + escapeHtml(distTooltip) + '" style="font-size:12px;">' +
          '<div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px;">' + escapeHtml(w.primary_project) + '</div>' +
          '<div style="color:var(--text-mute); font-size:11px;">' + w.primary_count + '/' + w.total + ' 筆</div>' +
        '</div>'
      : '<span style="color:var(--text-mute);">-</span>';
    const overdueHtml = w.overdue > 0 ? '<span class="tag danger">' + w.overdue + '</span>' : '0';
    return '<tr>' +
      '<td><b>' + escapeHtml(w.name) + '</b></td>' +
      '<td>' + primaryHtml + '</td>' +
      '<td>' + w['進行中'] + '</td>' +
      '<td>' + w['尚未開始'] + '</td>' +
      '<td>' + w['完成'] + '</td>' +
      '<td>' + overdueHtml + '</td>' +
      '<td><b>' + w.total + '</b></td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="7" style="text-align:center; color:var(--text-mute); padding:20px;">無資料</td></tr>';
}

// ====================== Member tasks (per-person active task list) ======================
function renderMemberTasks() {
  const container = document.getElementById('member-tasks');
  if (!container) return;
  const wl = (DATA.workload || []).slice();
  const HIDDEN = new Set(['完成', '暫停']);
  const badgeEl = document.getElementById('member-task-badge');

  let totalActive = 0;
  const html = wl.map(function(w){
    const personTasks = DATA.tasks.filter(function(t){
      return t.devs.indexOf(w.name) >= 0 && !HIDDEN.has(t.status);
    });
    personTasks.sort(function(a,b){
      if ((b.days_overdue||0) !== (a.days_overdue||0)) return (b.days_overdue||0) - (a.days_overdue||0);
      const sa = a.status, sb = b.status;
      const order = {'修正':0,'測試':1,'PM測試':2,'進行中':3,'尚未開始':4,'正式站上線':5};
      const oa = order[sa] !== undefined ? order[sa] : 9;
      const ob = order[sb] !== undefined ? order[sb] : 9;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });
    totalActive += personTasks.length;

    if (personTasks.length === 0) {
      return '<details class="member-group">' +
        '<summary><b>' + escapeHtml(w.name) + '</b>' +
          '<span class="person-counts">無活躍任務 (進行中/完成/總計 = ' + w['進行中'] + '/' + w['完成'] + '/' + w.total + ')</span>' +
        '</summary>' +
        '<div class="empty">此成員目前無活躍任務</div>' +
      '</details>';
    }

    const overdueCount = personTasks.filter(function(t){ return t.days_overdue > 0; }).length;
    const rows = personTasks.map(function(t){
      let pname = '';
      for (let i = 0; i < t.project_ids.length; i++) {
        const pid = t.project_ids[i];
        const p = DATA.projects.find(function(x){ return x.id === pid; });
        if (p) { pname = p.name; break; }
      }
      const overdueHtml = t.days_overdue > 0
        ? '<span class="tag danger">是 (' + t.days_overdue + ' 天)</span>'
        : '<span style="color:var(--text-mute);">否</span>';
      const statusBg = TASK_PROGRESS_COLOR[t.status] || '#94a3b8';
      const dueText = t.due ? ' · 到期 ' + t.due : '';
      return '<tr>' +
        '<td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(pname) + '</td>' +
        '<td><a href="' + t.url + '" target="_blank">' + escapeHtml(t.name) + '</a><span style="color:var(--text-mute); font-size:11px;">' + dueText + '</span></td>' +
        '<td><span class="tag" style="background:' + statusBg + '; color:#fff;">' + t.status + '</span></td>' +
        '<td>' + overdueHtml + '</td>' +
      '</tr>';
    }).join('');

    const overdueBadge = overdueCount > 0
      ? '<span class="tag danger" style="margin-left:6px;">逾期 ' + overdueCount + '</span>'
      : '';
    const primaryHtml = w.primary_project
      ? '<span class="person-primary" title="' + escapeHtml(w.primary_project) + '">主要:' + escapeHtml(w.primary_project) + '</span>'
      : '';

    return '<details class="member-group">' +
      '<summary>' +
        '<b>' + escapeHtml(w.name) + '</b>' +
        '<span class="person-counts">活躍 ' + personTasks.length + ' · 總任務 ' + w.total + '</span>' +
        overdueBadge +
        primaryHtml +
      '</summary>' +
      '<table class="simple" style="margin:6px 8px;">' +
        '<thead><tr><th style="width:200px;">專案</th><th>任務</th><th style="width:100px;">狀態</th><th style="width:120px;">逾期</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</details>';
  }).join('');

  container.innerHTML = html || '<div class="empty">無人員資料</div>';
  if (badgeEl) badgeEl.textContent = totalActive + ' 筆活躍 · ' + wl.length + ' 人';
}

// ====================== To-track ======================
function renderToTrack() {
  const allowed = new Set(DATA.projects.map(function(p){ return p.name; }));
  const tt = (DATA.to_track || []).filter(function(t){ return allowed.has(t.project); });
  const tbody = document.querySelector('#totrack-table tbody');
  tbody.innerHTML = tt.map(function(t){
    const flagHtml = t.flags.map(function(f){
      const cls = (f === '逾期' || f === '修正中') ? 'danger' : (f === '高優未完成' ? 'warning' : 'purple');
      return '<span class="tag ' + cls + '">' + f + '</span>';
    }).join('');
    const statusBg = TASK_PROGRESS_COLOR[t.status] || '#94a3b8';
    const overdueText = t.days_overdue > 0 ? '<b style="color:#dc2626;">' + t.days_overdue + ' 天</b>' : '-';
    return '<tr>' +
      '<td><a href="' + t.url + '" target="_blank">' + escapeHtml(t.name) + '</a></td>' +
      '<td>' + escapeHtml(t.project) + '</td>' +
      '<td class="status"><span class="tag" style="background:' + statusBg + '; color:#fff;">' + t.status + '</span></td>' +
      '<td>' + escapeHtml(t.devs.join(', ') || '-') + '</td>' +
      '<td class="due">' + (t.due || '-') + '</td>' +
      '<td class="overdue">' + overdueText + '</td>' +
      '<td>' + flagHtml + '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="7" style="text-align:center; color:var(--text-mute); padding:20px;">目前無待追蹤任務 ✓</td></tr>';
}

// ====================== Risk list ======================
function renderRiskList() {
  const order = { '高': 0, '中': 1, '低': 2, '安全': 3 };
  const sorted = DATA.projects.slice().sort(function(a,b){
    const oa = order[a.risk.level] !== undefined ? order[a.risk.level] : 9;
    const ob = order[b.risk.level] !== undefined ? order[b.risk.level] : 9;
    if (oa !== ob) return oa - ob;
    return b.risk.score - a.risk.score;
  });
  const html = sorted.filter(function(p){ return p.risk.level !== '安全'; }).slice(0, 30).map(function(p){
    const reasons = (p.risk.reasons || []).map(function(r){ return '<span>· ' + escapeHtml(r) + '</span>'; }).join('');
    return '<div class="risk-card ' + p.risk.level + '">' +
      '<div class="rh">' +
        '<span class="badge badge-risk" style="background:' + RISK_COLOR[p.risk.level] + '">' + p.risk.level + ' (' + p.risk.score + ')</span>' +
        '<span class="badge badge-status" style="background:' + (STATUS_COLOR[p.status] || '#94a3b8') + '; color:#fff;">' + p.status + '</span>' +
        '<span class="name"><a href="' + p.url + '" target="_blank">' + escapeHtml(p.name) + '</a></span>' +
        '<span style="font-size:11.5px; color:var(--text-mute);">負責人:' + escapeHtml(p.owners.join(', ') || '無') + '</span>' +
      '</div>' +
      '<div class="reasons">' + (reasons || '<span>(無)</span>') + '</div>' +
    '</div>';
  }).join('') || '<div style="padding:20px; text-align:center; color:var(--text-mute);">目前無風險專案 ✓</div>';
  document.getElementById('risk-list').innerHTML = html;
}

// ====================== Suggestions ======================
function renderSuggestions() {
  const sug = DATA.suggestions || [];
  const html = sug.map(function(s){
    const dot = RISK_COLOR[s.level] ? '<span style="color:' + RISK_COLOR[s.level] + ';">●</span> ' : '';
    return '<div class="suggest-card ' + s.level + '">' +
      '<div class="title">' + dot + escapeHtml(s.title) + '</div>' +
      '<div class="detail">' + escapeHtml(s.detail) + '</div>' +
    '</div>';
  }).join('');
  document.getElementById('suggest-list').innerHTML = html;
}

// ====================== Cache ======================
function tryRestoreCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY_BULK);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (!cached || !cached.ts || Date.now() - cached.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_BULK);
      return;
    }
    if (cached.tasks && Array.isArray(cached.tasks)) {
      const wl = WHITELIST_PIDS;
      const cachedFiltered = wl ? cached.tasks.filter(function(t){
        return (t.project_ids || []).some(function(pid){ return wl.has(pid); });
      }) : cached.tasks;
      const map = {};
      DATA.tasks.forEach(function(t){ map[t.id] = t; });
      cachedFiltered.forEach(function(t){ map[t.id] = t; });
      DATA.tasks = Object.values(map);
      const dropped = cached.tasks.length - cachedFiltered.length;
      const msg = '🗃️ 已從快取還原 ' + cachedFiltered.length + ' 筆任務' +
        (dropped > 0 ? '(過濾掉 ' + dropped + ' 筆非白名單)' : '') +
        ' (' + new Date(cached.ts).toLocaleString() + ')';
      showBanner('info', msg, 4000);
    }
  } catch(e) { console.warn('cache restore failed', e); }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY_BULK, JSON.stringify({ ts: Date.now(), tasks: DATA.tasks }));
  } catch(e) { console.warn('cache save failed', e); }
}

function clearCacheAndReload() {
  try {
    localStorage.removeItem(CACHE_KEY_BULK);
    localStorage.removeItem(CACHE_KEY_FILTER);
  } catch(e) {}
  showBanner('info', '✓ 已清除快取,重新載入頁面…', 1500);
  setTimeout(function(){ location.reload(); }, 800);
}

// ====================== Reload from Notion ======================
function parseQueryResp(r) {
  try {
    const text = extractFetchText(r);
    if (!text) return null;
    return JSON.parse(text);
  } catch(e) {
    console.error('parseQueryResp', e, r);
    return null;
  }
}

function indexBugsAndCompute() {
  const bugsByProj = {};
  DATA.bugs.forEach(function(b){
    b.project_ids.forEach(function(pid){
      (bugsByProj[pid] = bugsByProj[pid] || []).push(b);
    });
  });
  DATA.projects.forEach(function(p){
    p.bugs = bugsByProj[p.id] || [];
    p.bug_count_loaded = p.bugs.length;
    p.risk = computeRiskClient(p, p.bugs);
  });
}

async function reloadFromNotion() {
  hideBanner('error'); hideBanner('success');
  showBanner('info', '<span class="spinner"></span> 正在從 Notion 重新拉取…', 0);
  try {
    const projResp = await callTool(NOTION_TOOLS.query, { view_url: PROJECTS_VIEW_URL });
    const tasksResp = await callTool(NOTION_TOOLS.query, { view_url: TASKS_ALL_VIEW_URL });
    const tasksActiveResp = await callTool(NOTION_TOOLS.query, { view_url: TASKS_ACTIVE_VIEW_URL });
    const bugsResp = await callTool(NOTION_TOOLS.query, { view_url: BUGS_VIEW_URL });

    const projData = parseQueryResp(projResp);
    const taskAllData = parseQueryResp(tasksResp);
    const taskActiveData = parseQueryResp(tasksActiveResp);
    const bugsData = parseQueryResp(bugsResp);

    if (!projData || !taskAllData) {
      hideBanner('info');
      showBanner('error', '無法解析 Notion 回應(請按 🔬 診斷模式查看格式)', 0);
      return;
    }

    const taskMap = {};
    DATA.tasks.forEach(function(t){ taskMap[t.id] = t; });
    [].concat(taskAllData.results || [], (taskActiveData ? taskActiveData.results : []) || []).forEach(function(rt){
      const t = processSingleTask(rt, 'reload');
      if (t) taskMap[t.id] = t;
    });
    DATA.tasks = Object.values(taskMap);

    // Note: We keep the original whitelisted projects, not replace
    // (User explicitly asked to filter to 11 projects)
    if (bugsData) DATA.bugs = bugsData.results.map(processSingleBug);
    applyWhitelistFilter();
    indexBugsAndCompute();

    DATA.meta.data_freshness = '剛剛更新 (' + new Date().toLocaleString('zh-TW') + ')';
    document.getElementById('meta-line').textContent =
      '資料時間:' + DATA.meta.data_freshness + ' · 樣本任務:' + DATA.tasks.length;
    saveCache();
    renderAll();
    hideBanner('info');
    showBanner('success', '✓ 重新拉取完成:' + DATA.projects.length + ' 專案 / ' + DATA.tasks.length + ' 任務 / ' + DATA.bugs.length + ' 修正');
  } catch(e) {
    hideBanner('info');
    console.error(e);
    showBanner('error', '重新拉取失敗:' + (e && e.message || e), 0);
  }
}

// ====================== Per-project force update ======================
async function forceUpdateProject(pid, forceAll) {
  const p = DATA.projects.find(function(x){ return x.id === pid; });
  if (!p) return;
  hideBanner('error'); hideBanner('success');
  let urls = p.task_urls;
  if (!forceAll) {
    const have = new Set(p.tasks_loaded.map(function(t){ return t.url; }));
    urls = p.task_urls.filter(function(u){ return !have.has(u); });
  }
  if (!urls.length) {
    showBanner('info', p.name + ': 已是最新 (無遺漏任務)');
    return;
  }
  showBanner('info', '<span class="spinner"></span> ' + p.name + ': 載入 ' + urls.length + ' 筆任務…', 0);
  try {
    const fetched = await fetchUrlsConcurrent(urls, 10);
    let added = 0;
    fetched.forEach(function(rec){
      const parsed = parseFetchedTaskPage(rec);
      if (parsed) {
        const t = processSingleTask(Object.assign({}, parsed, { url: parsed.url || rec._url }), 'fetched');
        if (t) {
          const idx = DATA.tasks.findIndex(function(x){ return x.id === t.id; });
          if (idx >= 0) DATA.tasks[idx] = t; else DATA.tasks.push(t);
          added++;
        }
      }
    });
    saveCache();
    renderAll();
    hideBanner('info');
    showBanner('success', '✓ ' + p.name + ': 新增/更新 ' + added + ' 筆任務');
  } catch(e) {
    hideBanner('info');
    showBanner('error', p.name + ' 載入失敗:' + (e.message || e), 0);
  }
}

async function fetchUrlsConcurrent(urls, concurrency) {
  if (!concurrency) concurrency = 10;
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const myIdx = idx++;
      const u = urls[myIdx];
      try {
        const r = await callTool(NOTION_TOOLS.fetch, { id: u });
        if (r) r._url = u;
        results[myIdx] = r;
      } catch(e) {
        console.warn('fetch failed', u, e);
        results[myIdx] = null;
      }
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, urls.length); i++) workers.push(worker());
  await Promise.all(workers);
  return results.filter(Boolean);
}

// ====================== Bulk full load ======================
async function loadAllTasks(silent) {
  hideBanner('error'); hideBanner('success');
  const allUrls = [];
  DATA.projects.forEach(function(p){ p.task_urls.forEach(function(u){ allUrls.push(u); }); });
  const have = new Set(DATA.tasks.map(function(t){ return t.url; }));
  const todoUrls = allUrls.filter(function(u){ return !have.has(u); });

  if (!todoUrls.length) {
    if (!silent) showBanner('info', '✓ 所有任務都已載入,無需動作');
    return;
  }
  if (!silent && !confirm('即將載入 ' + todoUrls.length + ' 筆任務 (預估 ' + Math.ceil(todoUrls.length / 10 * 0.5) + ' 分鐘),繼續嗎?')) return;

  let processed = 0;
  showBanner('info', '<span class="spinner"></span> 全量載入中:0 / ' + todoUrls.length + '…', 0);

  const batchSize = 50;
  for (let i = 0; i < todoUrls.length; i += batchSize) {
    const batch = todoUrls.slice(i, i + batchSize);
    const fetched = await fetchUrlsConcurrent(batch, 10);
    fetched.forEach(function(rec){
      const parsed = parseFetchedTaskPage(rec);
      if (parsed) {
        const t = processSingleTask(Object.assign({}, parsed, { url: parsed.url || rec._url }), 'bulk');
        if (t) {
          const idx = DATA.tasks.findIndex(function(x){ return x.id === t.id; });
          if (idx >= 0) DATA.tasks[idx] = t; else DATA.tasks.push(t);
        }
      }
    });
    processed += batch.length;
    showBanner('info', '<span class="spinner"></span> 全量載入中:' + processed + ' / ' + todoUrls.length + '…', 0);
  }

  saveCache();
  renderAll();
  hideBanner('info');
  showBanner('success', '✓ 全量載入完成,新增/更新 ' + processed + ' 筆任務 (24h 已快取)');
}

// ====================== Diagnostic ======================
async function diagnoseMode() {
  hideBanner('error'); hideBanner('success');
  showBanner('info', '<span class="spinner"></span> 診斷中…', 0);
  const out = [];
  out.push('=== 診斷報告 ===');
  out.push('時間:' + new Date().toISOString());
  out.push('window.cowork:' + (typeof window.cowork));
  out.push('callMcpTool:' + (typeof (window.cowork && window.cowork.callMcpTool)));
  out.push('白名單專案:' + DATA.projects.length);
  out.push('已載入任務:' + DATA.tasks.length);

  if (window.cowork && window.cowork.callMcpTool) {
    try {
      const r = await callTool(NOTION_TOOLS.query, { view_url: PROJECTS_VIEW_URL });
      window.__diagResp = r;
      out.push('--- query response (typeof = ' + typeof r + ') ---');
      const txt = extractFetchText(r);
      out.push('extractFetchText length:' + (txt ? txt.length : 'null'));
      if (txt) {
        out.push('first 300 chars: ' + txt.substring(0, 300));
        try {
          const j = JSON.parse(txt);
          out.push('parsed: results=' + (j.results ? j.results.length : 'n/a') + ' has_more=' + j.has_more);
        } catch(e) {
          out.push('JSON.parse failed:' + e.message);
        }
      }
    } catch(e) {
      out.push('callTool error: ' + e.message);
    }
  }
  hideBanner('info');
  alert(out.join('\n'));
}


// ====================== Window resize ======================
window.addEventListener('resize', function(){
  Object.values(CHARTS).forEach(function(c){ if (c && c.resize) c.resize(); });
});

// Bootstrap
let _booted = false;
function _bootOnce() {
  if (_booted) return;
  _booted = true;
  init();
}
document.addEventListener('DOMContentLoaded', _bootOnce);
window.addEventListener('load', _bootOnce);
if (document.readyState === 'complete') _bootOnce();
else if (document.readyState === 'interactive') setTimeout(_bootOnce, 50);
