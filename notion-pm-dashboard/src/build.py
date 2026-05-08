#!/usr/bin/env python3
"""
Notion 專案管理整合儀表板 - Build Pipeline (Notion REST API 版)

讀取環境變數 NOTION_TOKEN(GitHub Actions secret),呼叫 Notion REST API:
  - 抓 3 個資料庫(專案 / 任務 / 修正清單)
  - 過濾為 11 個白名單專案
  - 計算 KPI / 風險 / 工作量
  - 產出 data/dashboard_data.json
  - 將資料注入 src/template.html + src/script.js → index.html

Usage:
  NOTION_TOKEN=secret_xxx python3 src/build.py

需要 Notion Integration 對 3 個資料庫有讀取權限。
"""
import os
import re
import json
import time
import sys
from datetime import date, datetime, timedelta
from collections import Counter, defaultdict

try:
    import requests
except ImportError:
    print("ERROR: pip install requests", file=sys.stderr)
    sys.exit(1)

# === Config ===
NOTION_TOKEN = os.environ.get('NOTION_TOKEN', '').strip()
if not NOTION_TOKEN:
    print("ERROR: NOTION_TOKEN env var not set", file=sys.stderr)
    sys.exit(1)

HEADERS = {
    'Authorization': f'Bearer {NOTION_TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
}

PROJECT_DB = 'ca4bf515-0233-487b-a522-c98aa232fed3'
TASKS_DB   = '79baaf3d-f9b7-43e2-a639-d8d46574bc15'
BUGS_DB    = '8e2cd067-ce97-479e-9d39-76eca80cff36'

WHITELIST = [
    "【清展】拍照取尺寸專案",
    "【陽明】船舶VR建置開發",
    "【中運】智慧船舶第二期",
    "【中信】構型文件管理平台",
    "【中運】SDataPro",
    "【國產】SRP三期",
    "【長榮】Cirrus郵件稽核系統",
    "【萬海】Cirrus郵件稽核系統",
    "【陽明】戰情室優化項目",
    "【國產】SRP一期",
    "【國產】SRP二期",
]

USER_MAP = {
    "b1d955ab-8ab3-4bdd-a25b-d61cec36959c": "Daffy Chou",
    "1d5d872b-594c-811e-a446-00020d006c14": "Sean",
    "33bd872b-594c-81a1-af26-0002930fdf1a": "Stanley",
    "6a8506e4-8b52-4d78-8128-6925b9b8bc46": "JyunHao",
    "317d872b-594c-81d0-987f-0002857f884f": "Avery",
    "79d9bc70-0acb-4efa-b3c0-d3dffc1c962c": "Rumi",
    "6194df23-2a11-4abc-b2fe-a559b7c71feb": "Oscar",
    "3cce16a4-9b5f-4e7f-8c27-067483a74b7c": "Crane",
    "261d872b-594c-81ac-b880-00023d3fafcc": "James",
    "1b3d872b-594c-8121-96bb-000296f442b3": "柏豪",
    "612fa867-492a-4585-be33-ccf3bea81413": "Vicky",
    "1d6d872b-594c-81df-9016-0002a943b407": "成員 G",
}

DONE_PROJECT = {'結案', '結案(協助後續)', '取消'}
DONE_TASK = {'完成', '正式站上線'}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, 'src', 'template.html')
SCRIPT_JS = os.path.join(ROOT, 'src', 'script.js')
DATA_OUT = os.path.join(ROOT, 'data', 'dashboard_data.json')
INDEX_OUT = os.path.join(ROOT, 'index.html')
LIVE_OUT = os.path.join(ROOT, 'live.html')

TODAY = date.today()


def query_db(db_id, filter_=None, sleep=0.1):
    """Query a Notion database with cursor pagination support."""
    results = []
    cursor = None
    while True:
        body = {'page_size': 100}
        if filter_:
            body['filter'] = filter_
        if cursor:
            body['start_cursor'] = cursor
        url = f'https://api.notion.com/v1/databases/{db_id}/query'
        r = requests.post(url, headers=HEADERS, json=body, timeout=30)
        if r.status_code != 200:
            raise RuntimeError(f'Notion API {r.status_code}: {r.text[:300]}')
        data = r.json()
        results.extend(data.get('results', []))
        if not data.get('has_more'):
            break
        cursor = data.get('next_cursor')
        if not cursor:
            break
        time.sleep(sleep)
    return results


def title_text(p):
    return ''.join(x.get('plain_text', '') for x in p.get('title', []))

def rich_text(p):
    return ''.join(x.get('plain_text', '') for x in p.get('rich_text', []))

def select_name(p):
    s = p.get('select')
    return s.get('name') if s else None

def status_name(p):
    s = p.get('status')
    return s.get('name') if s else None

def date_value(p):
    return p.get('date') or {}

def people_ids(p):
    return [x.get('id') for x in p.get('people', []) if x.get('id')]

def relation_ids(p):
    return [x.get('id') for x in p.get('relation', []) if x.get('id')]

def safe_date(s):
    if not s: return None
    try: return datetime.strptime(s[:10], '%Y-%m-%d').date()
    except Exception: return None

def user_name(uid):
    return USER_MAP.get(uid, f'未知 ({uid[:6]}…)' if uid else '未指派')

def normalize_uuid(s):
    return s.replace('-', '') if s else s

def project_url(pid):
    return f'https://www.notion.so/{normalize_uuid(pid)}'


def process_project(p):
    props = p.get('properties', {})
    name = title_text(props.get('專案名稱', {}))
    category = select_name(props.get('分類', {})) or '未分類'
    status = status_name(props.get('專案進度', {})) or '積壓'
    owner_ids = people_ids(props.get('負責人', {}))
    pm_ids = people_ids(props.get('PM', {}))
    contract = date_value(props.get('合約執行期間', {}))
    contract_start = safe_date(contract.get('start'))
    contract_end = safe_date(contract.get('end'))
    task_ids = relation_ids(props.get('Tasks', {}))
    bug_ids = relation_ids(props.get('🐞 修正清單', {}))
    focus = rich_text(props.get('重點', {}))

    days_overdue = 0
    days_left = None
    if contract_end:
        delta = (TODAY - contract_end).days
        if delta > 0 and status not in DONE_PROJECT:
            days_overdue = delta
        elif delta <= 0:
            days_left = -delta

    pid = normalize_uuid(p['id'])
    return {
        'id': pid,
        'url': p.get('url') or project_url(pid),
        'name': name.strip() or '(未命名)',
        'category': category,
        'status': status,
        'owners': [user_name(x) for x in owner_ids],
        'owner_ids': owner_ids,
        'pm': [user_name(x) for x in pm_ids],
        'pm_ids': pm_ids,
        'contract_start': contract_start.isoformat() if contract_start else None,
        'contract_end': contract_end.isoformat() if contract_end else None,
        'days_overdue': days_overdue,
        'days_left': days_left,
        'task_urls': [project_url(x) for x in task_ids],
        'task_count_total': len(task_ids),
        'bug_urls': [project_url(x) for x in bug_ids],
        'bug_count_total': len(bug_ids),
        'focus': focus.strip(),
        'tasks_loaded': [], 'task_count_loaded': 0,
        'task_done_count': 0, 'task_active_count': 0, 'coverage': 0,
        'task_status_counts': {}, 'bugs': [], 'bug_count_loaded': 0,
        'risk': {'score': 0, 'level': '安全', 'reasons': [], 'open_bug_count': 0},
    }


def process_task(t):
    props = t.get('properties', {})
    name = title_text(props.get('任務名稱', {}))
    status = status_name(props.get('任務進度', {})) or '尚未開始'
    stage = status_name(props.get('階段', {})) or ''
    priority = select_name(props.get('優先', {})) or '中'
    due_d = safe_date(date_value(props.get('任務到期日', {})).get('start'))
    start_d = safe_date(date_value(props.get('開始日期', {})).get('start'))
    done_d = safe_date(date_value(props.get('完成日期', {})).get('start'))
    project_ids = [normalize_uuid(x) for x in relation_ids(props.get('專案', {}))]
    dev_ids = people_ids(props.get('開發人員', {}))
    mgr_ids = people_ids(props.get('主責主管', {}))
    parent_ids = relation_ids(props.get('Parent task', {}))
    sub_ids = relation_ids(props.get('Sub-task', {}))

    days_overdue = 0
    if due_d and status not in DONE_TASK:
        d = (TODAY - due_d).days
        if d > 0:
            days_overdue = d

    tid = normalize_uuid(t['id'])
    return {
        'id': tid,
        'url': t.get('url') or project_url(tid),
        'name': name.strip() or '(未命名)',
        'status': status,
        'stage': stage,
        'priority': priority,
        'due': due_d.isoformat() if due_d else None,
        'start': start_d.isoformat() if start_d else None,
        'done': done_d.isoformat() if done_d else None,
        'days_overdue': days_overdue,
        'project_ids': project_ids,
        'project_urls': [project_url(x) for x in project_ids],
        'devs': [user_name(x) for x in dev_ids],
        'dev_ids': dev_ids,
        'mgrs': [user_name(x) for x in mgr_ids],
        'mgr_ids': mgr_ids,
        'parent_urls': [project_url(x) for x in parent_ids],
        'sub_urls': [project_url(x) for x in sub_ids],
        'is_done': status in DONE_TASK,
        'source': 'api',
    }


def process_bug(b):
    props = b.get('properties', {})
    title = title_text(props.get('問題修正', {}))
    status = status_name(props.get('狀態', {})) or '尚未修正'
    priority = select_name(props.get('優先', {})) or '中'
    project_ids = [normalize_uuid(x) for x in relation_ids(props.get('專案', {}))]
    eng_ids = people_ids(props.get('修正工程師', {}))
    fix_d = safe_date(date_value(props.get('修正日期', {})).get('start'))
    cust = props.get('客戶需求', {}).get('checkbox', False)

    bid = normalize_uuid(b['id'])
    return {
        'id': bid,
        'url': b.get('url') or project_url(bid),
        'title': title.strip() or '(未命名)',
        'status': status,
        'priority': priority,
        'project_ids': project_ids,
        'project_urls': [project_url(x) for x in project_ids],
        'customer_req': cust,
        'engineer': [user_name(x) for x in eng_ids],
        'fix_date': fix_d.isoformat() if fix_d else None,
    }


def compute_risk(p, project_bugs):
    score = 0
    reasons = []
    is_done = p['status'] in DONE_PROJECT
    if p['status'] == '結案(需優化)': score += 3; reasons.append('結案需優化 +3')
    if p['status'] == '暫停': score += 2; reasons.append('暫停中 +2')
    if p['status'] == '積壓' and p['task_count_total'] > 0: score += 1; reasons.append('積壓但有任務 +1')
    if not is_done:
        if p['days_overdue'] > 0:
            score += 3; reasons.append(f"合約已逾期 {p['days_overdue']} 天 +3")
        elif p['days_left'] is not None and p['days_left'] <= 30:
            score += 2; reasons.append(f"合約 {p['days_left']} 天內到期 +2")
    if not p['owners'] and not is_done:
        score += 2; reasons.append('無負責人 +2')
    open_bugs = [b for b in project_bugs if b['status'] not in ('完成', '暫停')]
    if len(open_bugs) > 5: score += 1; reasons.append(f'未結 bug {len(open_bugs)} >5 +1')
    if p['task_count_total'] > 50: score += 1; reasons.append(f'任務量 {p["task_count_total"]} >50 +1')
    level = '高' if score >= 5 else ('中' if score >= 3 else ('低' if score >= 1 else '安全'))
    return {'score': score, 'level': level, 'reasons': reasons, 'open_bug_count': len(open_bugs)}


def gen_suggestions(projects, tasks, bugs):
    high = [p for p in projects if p['risk']['level'] == '高']
    med = [p for p in projects if p['risk']['level'] == '中']
    overdue_t = [t for t in tasks if t['days_overdue'] > 0 and not t['is_done']]
    no_owner = [p for p in projects if not p['owners'] and p['status'] not in DONE_PROJECT]
    paused = [p for p in projects if p['status'] == '暫停']
    high_bug = [p for p in projects if p['risk']['open_bug_count'] > 5]
    needs_optim = [p for p in projects if p['status'] == '結案(需優化)']
    sug = []
    if high:
        names = ', '.join(p['name'] for p in high[:5])
        sug.append({'level': '高', 'title': f'立即處理 {len(high)} 個高風險專案',
                    'detail': f'優先檢視:{names}{"…" if len(high)>5 else ""}。建議召開風險會議,確認任務 owner、資源分配與里程碑。'})
    if no_owner:
        names = ', '.join(p['name'] for p in no_owner[:5])
        sug.append({'level': '高', 'title': f'指派 {len(no_owner)} 個未指派負責人的專案',
                    'detail': f'缺 owner:{names}。請於本週指派負責人並更新 Notion。'})
    if overdue_t:
        sug.append({'level': '高', 'title': f'處理 {len(overdue_t)} 筆逾期任務',
                    'detail': f'發現 {len(overdue_t)} 筆逾期任務未完成,建議按逾期天數排序逐一處理。'})
    if needs_optim:
        names = ', '.join(p['name'] for p in needs_optim[:5])
        sug.append({'level': '中', 'title': f'優化 {len(needs_optim)} 個結案需優化專案',
                    'detail': f'結案但需後續優化:{names}。安排技術檢視,排定優化時程。'})
    if paused:
        names = ', '.join(p['name'] for p in paused[:5])
        sug.append({'level': '中', 'title': f'盤點 {len(paused)} 個暫停專案',
                    'detail': f'暫停中:{names}。確認是否可重啟、轉移或結案,避免長期僵滯。'})
    if high_bug:
        names = ', '.join(f"{p['name']}({p['risk']['open_bug_count']})" for p in high_bug[:5])
        sug.append({'level': '中', 'title': f'清理 {len(high_bug)} 個 bug 量高專案',
                    'detail': f'未結 bug 過多:{names}。排定 bug bash 或專人專案修正。'})
    if med:
        sug.append({'level': '低', 'title': f'觀察 {len(med)} 個中風險專案',
                    'detail': '建議每週同步進度,提前介入避免升級為高風險。'})
    if not sug:
        sug.append({'level': '低', 'title': '目前無重大風險',
                    'detail': '建議持續維持每週同步機制,確保專案進度透明可見。'})
    return sug


def main():
    print(f'[{datetime.now().isoformat()}] Notion fetch start')

    raw_projects = query_db(PROJECT_DB)
    print(f'  Projects: {len(raw_projects)} total')
    all_projects = [process_project(p) for p in raw_projects]
    keep_projects = [p for p in all_projects if any(p['name'].startswith(w) for w in WHITELIST)]
    print(f'  Whitelisted: {len(keep_projects)}')
    keep_pids = set(p['id'] for p in keep_projects)

    all_tasks = {}
    for p in keep_projects:
        pid = p['id']
        dashed = '-'.join([pid[:8], pid[8:12], pid[12:16], pid[16:20], pid[20:32]])
        rows = query_db(TASKS_DB, filter_={'property': '專案', 'relation': {'contains': dashed}})
        for r in rows:
            t = process_task(r)
            if t and t['id'] not in all_tasks:
                all_tasks[t['id']] = t
        print(f'  [{p["name"]}] {len(rows)} tasks')
    keep_tasks = list(all_tasks.values())

    raw_bugs = query_db(BUGS_DB)
    keep_bugs = []
    for b in raw_bugs:
        bug = process_bug(b)
        if any(pid in keep_pids for pid in bug['project_ids']):
            keep_bugs.append(bug)
    print(f'  Bugs (whitelisted): {len(keep_bugs)}')

    tasks_by_proj = defaultdict(list)
    for t in keep_tasks:
        for pid in t['project_ids']:
            if pid in keep_pids:
                tasks_by_proj[pid].append(t)
    bugs_by_proj = defaultdict(list)
    for b in keep_bugs:
        for pid in b['project_ids']:
            if pid in keep_pids:
                bugs_by_proj[pid].append(b)

    for p in keep_projects:
        arr = tasks_by_proj.get(p['id'], [])
        p['tasks_loaded'] = arr
        p['task_count_loaded'] = len(arr)
        p['task_done_count'] = sum(1 for t in arr if t['is_done'])
        p['task_active_count'] = len(arr) - p['task_done_count']
        p['coverage'] = round(len(arr)/p['task_count_total']*100, 1) if p['task_count_total'] else 100.0
        p['task_status_counts'] = dict(Counter(t['status'] for t in arr))
        p['bugs'] = bugs_by_proj.get(p['id'], [])
        p['bug_count_loaded'] = len(p['bugs'])
        p['risk'] = compute_risk(p, p['bugs'])

    keep_projects.sort(key=lambda p: (-p['risk']['score'], p['name']))

    total = len(keep_projects)
    psc = Counter(p['status'] for p in keep_projects)
    pcc = Counter(p['category'] for p in keep_projects)
    prc = Counter(p['risk']['level'] for p in keep_projects)
    total_t = len(keep_tasks)
    t_done = sum(1 for t in keep_tasks if t['is_done'])
    t_inprog = sum(1 for t in keep_tasks if t['status'] == '進行中')
    t_notstart = sum(1 for t in keep_tasks if t['status'] == '尚未開始')
    t_overdue = sum(1 for t in keep_tasks if t['days_overdue'] > 0 and not t['is_done'])
    rate = round(t_done/total_t*100, 1) if total_t else 0

    wl = defaultdict(lambda: {'完成':0,'進行中':0,'尚未開始':0,'暫停':0,'其他':0,'overdue':0,'total':0,'_proj':Counter()})
    for t in keep_tasks:
        for dev in t['devs']:
            w = wl[dev]
            s = t['status']
            if s == '完成': w['完成'] += 1
            elif s == '進行中': w['進行中'] += 1
            elif s == '尚未開始': w['尚未開始'] += 1
            elif s == '暫停': w['暫停'] += 1
            else: w['其他'] += 1
            w['total'] += 1
            if t['days_overdue'] > 0 and not t['is_done']: w['overdue'] += 1
            for pid in t['project_ids']:
                if pid in keep_pids:
                    pn = next((x['name'] for x in keep_projects if x['id'] == pid), None)
                    if pn: w['_proj'][pn] += 1
    workload_list = []
    for k, v in wl.items():
        primary = v['_proj'].most_common(1)
        workload_list.append({
            'name': k,
            **{x: v[x] for x in ['完成','進行中','尚未開始','暫停','其他','overdue','total']},
            'primary_project': primary[0][0] if primary else '',
            'primary_count': primary[0][1] if primary else 0,
            'project_dist': dict(v['_proj'].most_common(3)),
        })
    workload_list.sort(key=lambda x: -x['total'])

    to_track = []
    for t in keep_tasks:
        flags = []
        if t['days_overdue'] > 0 and not t['is_done']: flags.append('逾期')
        if t['status'] == '修正': flags.append('修正中')
        if t['status'] in ('測試','PM測試'): flags.append('測試卡關')
        if t['priority'] == '高' and not t['is_done']: flags.append('高優未完成')
        if flags:
            pname = '(無專案)'
            for pid in t['project_ids']:
                if pid in keep_pids:
                    pname = next((x['name'] for x in keep_projects if x['id'] == pid), pname)
                    break
            to_track.append({**{k: t[k] for k in ['id','url','name','status','priority','devs','days_overdue','due']},
                             'project': pname, 'flags': flags})
    to_track.sort(key=lambda x: -x['days_overdue'])
    to_track = to_track[:30]

    proj_w_t = [p for p in keep_projects if p['task_count_total'] > 0]
    coverage = {
        'full': sum(1 for p in proj_w_t if p['coverage'] >= 99.9),
        'partial': sum(1 for p in proj_w_t if 0 < p['coverage'] < 99.9),
        'zero': sum(1 for p in proj_w_t if p['coverage'] < 0.1),
        'no_tasks': sum(1 for p in keep_projects if p['task_count_total'] == 0),
        'total_loaded_tasks': total_t,
        'total_expected_tasks': sum(p['task_count_total'] for p in keep_projects),
    }

    data = {
        'meta': {
            'generated_at': datetime.now().isoformat(),
            'today': TODAY.isoformat(),
            'data_freshness': f"{TODAY.isoformat()} (GitHub Actions)",
            'user_map': USER_MAP,
            'whitelist_project_ids': sorted(keep_pids),
        },
        'kpi': {
            'total_projects': total,
            'completion_rate': rate,
            'risk_level_counts': dict(prc),
            'task_sample_size': total_t,
            'task_done': t_done,
            'task_inprog': t_inprog,
            'task_notstart': t_notstart,
            'task_overdue': t_overdue,
            'project_status': dict(psc),
            'project_category': dict(pcc),
        },
        'task_stats': {
            'status': dict(Counter(t['status'] for t in keep_tasks)),
            'priority': dict(Counter(t['priority'] for t in keep_tasks)),
            'stage': dict(Counter(t['stage'] for t in keep_tasks if t['stage'])),
        },
        'workload': workload_list,
        'to_track': to_track,
        'suggestions': gen_suggestions(keep_projects, keep_tasks, keep_bugs),
        'projects': keep_projects,
        'tasks': keep_tasks,
        'bugs': keep_bugs,
        'coverage': coverage,
    }

    os.makedirs(os.path.dirname(DATA_OUT), exist_ok=True)
    with open(DATA_OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    print(f'[{datetime.now().isoformat()}] dashboard_data.json saved ({os.path.getsize(DATA_OUT):,} bytes)')

    with open(TEMPLATE, 'r', encoding='utf-8') as f:
        template = f.read()
    with open(SCRIPT_JS, 'r', encoding='utf-8') as f:
        script = f.read()

    data_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str)
    data_for_embed = data_str.replace('</', '<\\/')
    base_html = template.replace('__DATA_PLACEHOLDER__', data_for_embed).replace('__SCRIPT_PLACEHOLDER__', script)

    public_extras_css = (
        'body.static-mode .btn[onclick*="reloadFromNotion"],\n'
        'body.static-mode .btn[onclick*="loadAllTasks"],\n'
        'body.static-mode .btn[onclick*="diagnoseMode"],\n'
        'body.static-mode .proj-actions { display: none !important; }\n'
        'body.static-mode header.top h1::after {\n'
        '  content: " · 公開靜態版";\n'
        '  font-size: 13px;\n'
        '  font-weight: 400;\n'
        '  opacity: 0.85;\n'
        '}\n'
    )
    public_init = (
        '<script>\n'
        '(function(){\n'
        '  function checkStatic() {\n'
        '    if (!window.cowork || !window.cowork.callMcpTool) {\n'
        '      document.body.classList.add("static-mode");\n'
        '      window.AUTO_LOADED = true;\n'
        '      setTimeout(function(){\n'
        '        var el = document.getElementById("banner-info");\n'
        '        if (el) {\n'
        '          el.innerHTML = "🌐 公開靜態版 · 顯示 " + (window.DATA && window.DATA.tasks ? window.DATA.tasks.length : "?") + " 筆任務";\n'
        '          el.classList.add("show");\n'
        '        }\n'
        '      }, 500);\n'
        '    }\n'
        '  }\n'
        '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", checkStatic);\n'
        '  else checkStatic();\n'
        '})();\n'
        '</script>\n'
    )
    public_html = base_html.replace('</style>', public_extras_css + '</style>').replace('</body>', public_init + '</body>')

    with open(INDEX_OUT, 'w', encoding='utf-8') as f:
        f.write(public_html)
    print(f'  index.html: {os.path.getsize(INDEX_OUT):,} bytes')
    with open(LIVE_OUT, 'w', encoding='utf-8') as f:
        f.write(base_html)
    print(f'  live.html:  {os.path.getsize(LIVE_OUT):,} bytes')

    print('\n=== Summary ===')
    print(f'Projects: {total}')
    print(f'Tasks: {total_t} (done {t_done}, in-prog {t_inprog}, not-started {t_notstart}, overdue {t_overdue})')
    print(f'Bugs: {len(keep_bugs)}')
    print(f'Risk: 高 {prc.get("高",0)} / 中 {prc.get("中",0)} / 低 {prc.get("低",0)} / 安全 {prc.get("安全",0)}')
    print(f'Completion rate: {rate}%')


if __name__ == '__main__':
    main()
