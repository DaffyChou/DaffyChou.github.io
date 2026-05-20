#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_reports.py
================
從 JSON 資料檔產出 SDataPro 報告 HTML（Customer Briefing + Full Report）。

工作流程：
  1. python convert_xlsx_to_json.py <input.xlsx> data/<date>.json
  2. python build_reports.py data/<date>.json
  3. 自動產出兩個 HTML：
     - SDataPro_Customer_Briefing_<date>.html
     - SDataPro_Full_Report_<date>.html

用法：
  python build_reports.py <data.json>                       # 用 JSON 中的 date_label 自動命名
  python build_reports.py <data.json> --suffix 20260519     # 指定日期後綴
  python build_reports.py --rebuild-all                     # 從 data/index.json 重建所有

模板來源：
  templates/SDataPro_Customer_Briefing.template.html
  templates/SDataPro_Full_Report.template.html

也可直接用現有的 20260519 HTML 作為模板（若 templates/ 不存在）。
"""

import argparse, json, os, re, sys
from datetime import datetime


def get_template(template_name, script_dir):
    """取得模板 HTML 路徑"""
    tpl_dir = os.path.join(script_dir, 'templates')
    if os.path.exists(os.path.join(tpl_dir, template_name)):
        return os.path.join(tpl_dir, template_name)
    # Fallback: use existing 20260519 HTML
    fallback = template_name.replace('.template.html', '_20260519.html')
    fallback_path = os.path.join(script_dir, fallback)
    if os.path.exists(fallback_path):
        return fallback_path
    return None


def build_one(json_path, template_html_path, output_path, data, is_briefing=True):
    """以模板 + JSON 資料產出單個 HTML"""
    with open(template_html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    vessels = data['vessels']
    tracks = data['tracks']
    global_data = data['global']
    meta = data['meta']
    cats = data['categories']
    ai_ships = data.get('ai_ships', [])
    
    # ============ 1) 替換 VESSELS / TRACKS / GLOBAL ============
    new_vessels_json = json.dumps(vessels, ensure_ascii=False, separators=(', ', ': '))
    html = re.sub(r'(const VESSELS\s*=\s*)\[.*?\](;)',
                  lambda m: m.group(1) + new_vessels_json + m.group(2),
                  html, count=1, flags=re.DOTALL)
    
    new_global_json = json.dumps(global_data, ensure_ascii=False, separators=(', ', ': '))
    html = re.sub(r'(const GLOBAL\s*=\s*)\{.*?\}(;)',
                  lambda m: m.group(1) + new_global_json + m.group(2),
                  html, count=1, flags=re.DOTALL)
    
    new_tracks_json = json.dumps(tracks, ensure_ascii=False, separators=(',', ':'))
    html = re.sub(r'(const TRACKS\s*=\s*)\{.*?\}(;)',
                  lambda m: m.group(1) + new_tracks_json + m.group(2),
                  html, count=1, flags=re.DOTALL)
    
    # ============ 2) 替換 filter constants ============
    for var_name, ship_list in [
        ('QUAL_SHIPS', cats['qual']),
        ('PARTIAL_SHIPS', cats['partial']),
        ('NEAR_SHIPS', cats['near']),
        ('UNQUAL_SHIPS', cats['unqual']),
        ('NODATA_SHIPS', cats['nodata']),
    ]:
        new_arr = json.dumps(ship_list)
        html = re.sub(rf'(const {var_name}\s*=\s*)\[.*?\](;)',
                      lambda m: m.group(1) + new_arr + m.group(2),
                      html, count=1, flags=re.DOTALL)
    
    # ============ 3) 替換 VESSEL_LIST（如有） ============
    vessel_list = [{'en':v['en'], 'zh':v['zh'], 'is_no_data':v['is_no_data'], 'score':v['score']} for v in vessels]
    new_vl_json = json.dumps(vessel_list, ensure_ascii=False, separators=(', ', ': '))
    html = re.sub(r'(const VESSEL_LIST\s*=\s*)\[.*?\](;)',
                  lambda m: m.group(1) + new_vl_json + m.group(2),
                  html, count=1, flags=re.DOTALL)
    
    # ============ 4) 期間文字 ============
    period_label = meta.get('period_label', '')
    period_start = meta.get('period_start', '')
    period_end = meta.get('period_end', '')
    period_days = meta.get('period_days', 0)
    report_date = meta.get('report_date', period_end)
    n_total = meta.get('n_total_records', 0)
    n_valid = meta.get('n_valid_records', 0)
    n_normal = meta.get('n_sd_normal', 0)
    n_filled = meta.get('n_ai_filled', 0)
    
    # 各種期間文字（多種出現方式）
    replacements = {
        # Period label patterns
        r'2026/5/8 12:40-2026/5/14 17:40': period_label,
        r'2026/5/8 14:57-2026/5/18 12:30': period_label,
        # Period start - end
        r'2026/5/8 – 2026/5/14': f'{period_start} – {period_end}',
        r'2026/5/8 – 2026/5/18': f'{period_start} – {period_end}',
        # Days
        r'共 7 天': f'共 {period_days} 天',
        r'共 10 天': f'共 {period_days} 天',
        # Footer
        r'2026/5/8–5/14 之資料窗': f'{period_start}–{period_end} 之資料窗',
        r'2026/5/8–5/18 之資料窗': f'{period_start}–{period_end} 之資料窗',
        # Title
        r'客戶簡報 ｜ 2026/5/19': f'客戶簡報 ｜ {report_date}',
        r'客戶簡報 ｜ 2026/5/15': f'客戶簡報 ｜ {report_date}',
        r'完整報告 ｜ 2026/5/19': f'完整報告 ｜ {report_date}',
        r'完整報告 ｜ 2026/5/15': f'完整報告 ｜ {report_date}',
        r'SDataPro vs 船訊網 分析報告 \(2026-05-19\)': f'SDataPro vs 船訊網 分析報告 ({report_date.replace("/","-")})',
        r'SDataPro vs 船訊網 分析報告 \(2026-05-15\)': f'SDataPro vs 船訊網 分析報告 ({report_date.replace("/","-")})',
        # Report date
        r'報告日期：2026/5/19': f'報告日期：{report_date}',
        r'報告日期：2026/5/15': f'報告日期：{report_date}',
    }
    for pat, sub in replacements.items():
        html = re.sub(pat, sub, html)
    
    # Hero text "基於 ... 共 N 天、46 艘船、X 筆 AIS 資料"
    n_ships = meta['n_ships']
    html = re.sub(
        r'基於 [\d/–\s]+ 共 \d+ 天、\d+ 艘船、[\d,]+ 筆 AIS 資料的逐筆比對分析',
        f'基於 {period_start} – {period_end} 共 {period_days} 天、{n_ships} 艘船、{n_total:,} 筆 AIS 資料的逐筆比對分析',
        html
    )
    
    # 筆數
    html = re.sub(r'<div class="v">[\d,]+ 筆</div>\s*<div class="l">有效比對資料筆數</div>',
                  f'<div class="v">{n_valid:,} 筆</div>\n        <div class="l">有效比對資料筆數</div>', html)
    html = re.sub(r'<div class="v">[\d,]+ 筆</div>\s*<div class="l">原始資料總筆數</div>',
                  f'<div class="v">{n_total:,} 筆</div>\n        <div class="l">原始資料總筆數</div>', html)
    
    # AI 補點筆數（Full Report 才有）
    if not is_briefing:
        html = re.sub(r'<div class="v">[\d,]+ 筆</div>\s*<div class="l">SD 原始有效資料</div>',
                      f'<div class="v">{n_normal:,} 筆</div>\n        <div class="l">SD 原始有效資料</div>', html)
        html = re.sub(r'<div class="v" style="color:#9b59b6">[\d,]+ 筆</div>\s*<div class="l">AI 補點資料</div>',
                      f'<div class="v" style="color:#9b59b6">{n_filled:,} 筆</div>\n        <div class="l">AI 補點資料</div>', html)
    
    # ============ 5) 分類數字 ============
    n_qual, n_near, n_partial, n_unqual, n_nodata = len(cats['qual']), len(cats['near']), len(cats['partial']), len(cats['unqual']), len(cats['nodata'])
    
    # Filter buttons
    button_counts = {'qual': n_qual, 'near': n_near, 'partial': n_partial, 'unqual': n_unqual, 'nodata': n_nodata}
    for cat, count in button_counts.items():
        html = re.sub(rf'(data-cat="{cat}">[^<]+\()(\d+)(\)</button>)',
                      lambda m: m.group(1) + str(count) + m.group(3), html)
    
    # Donut chart data
    html = re.sub(r'data: \[\d+, \d+, \d+, \d+, \d+\]',
                  f'data: [{n_qual}, {n_near}, {n_partial}, {n_unqual}, {n_nodata}]', html, count=1)
    
    # Donut legend counts
    legend_counts = [('#27ae60', n_qual), ('#f39c12', n_near), ('#b9770e', n_partial), ('#c0392b', n_unqual), ('#7f8c8d', n_nodata)]
    for color, count in legend_counts:
        html = re.sub(rf'(<div class="dl-count" style="color:{re.escape(color)}">)\d+(</div>)',
                      lambda m, c=count: m.group(1) + str(c) + m.group(2), html)
    
    # ============ 6) Customer Briefing only: hero bigstat ============
    if is_briefing:
        pct_qual = round(n_qual * 100 / n_ships, 1) if n_ships > 0 else 0
        html = re.sub(r'(<div class="bigstat-main">)\d+(<span class="denom"> / \d+</span>)',
                      lambda m: m.group(1) + str(n_qual) + m.group(2), html)
        html = re.sub(r'(<div class="bigstat-sub-v">)[\d.]+%(</div><div class="bigstat-sub-l">當前取代涵蓋率)',
                      lambda m, p=pct_qual: m.group(1) + f'{p}%' + m.group(2), html)
        # 可立即取代清單標題與內容
        html = re.sub(r'(可立即取代清單（)\d+( 艘 A\+B 級）)',
                      lambda m: m.group(1) + str(n_qual) + m.group(2), html)
        html = re.sub(r'(下表 )\d+( 艘船舶<b>已通過 A\+B 級認定)',
                      lambda m: m.group(1) + str(n_qual) + m.group(2), html)
        # 待改善清單標題
        html = re.sub(r'（\d+ 艘 C 級，1~3 個月內可達標）', f'（{n_near} 艘 C 級，1~3 個月內可達標）', html)
        html = re.sub(r'(下表 )\d+( 艘船舶整體評分)',
                      lambda m: m.group(1) + str(n_near) + m.group(2), html)
        # Phase ranges
        html = re.sub(r'(範圍：)\d+( 艘 A\+B 級船舶)', lambda m: m.group(1) + str(n_qual) + m.group(2), html)
        html = re.sub(r'(範圍：)\d+( 艘接近可取代船（C 級）)', lambda m: m.group(1) + str(n_near) + m.group(2), html)
        html = re.sub(r'(範圍：)\d+( 艘部分資料船)', lambda m: m.group(1) + str(n_partial) + m.group(2), html)
        html = re.sub(r'(範圍：)\d+( 艘待改善 \+ )\d+( 艘無資料)',
                      lambda m: m.group(1) + str(n_unqual) + m.group(2) + str(n_nodata) + m.group(3), html)
    
    # ============ 7) Full Report only: AI ships notice ============
    if not is_briefing and ai_ships:
        ai_html = []
        for s in ai_ships:
            ai_html.append(f'<span style="display:inline-block;background:#f4f0f8;border:1px solid #d6c8e0;color:#5b2c8a;padding:3px 9px;border-radius:10px;font-size:11px;margin:2px;white-space:nowrap"><b>{s["zh"]}</b> {s["fill_pct"]}%</span>')
        # Replace AI ships notice block (simple string find/replace)
        notice_start = html.find('<div style="margin-top:14px;background:#f8f3fc')
        if notice_start > 0:
            notice_end = html.find('</div>\n    </div>', notice_start)
            if notice_end > 0:
                notice_end += len('</div>\n    </div>')
                new_notice = (
                    f'<div style="margin-top:14px;background:#f8f3fc;border:1px solid #d6c8e0;border-left:4px solid #9b59b6;border-radius:8px;padding:11px 14px">'
                    f'<div style="font-size:13px;font-weight:700;color:#5b2c8a;margin-bottom:6px">🤖 使用 AI 補點的船舶（共 {len(ai_ships)} 艘）</div>'
                    f'<div style="font-size:12px;color:#465a70;margin-bottom:6px">下列船舶因 SD 設備在部分時段未回傳資料，由 AI 補點預測填補。括號內為補點佔該船總資料的比例：</div>'
                    f'<div>{"".join(ai_html)}</div>'
                    f'</div>'
                )
                html = html[:notice_start] + new_notice + html[notice_end:]
    
    # ============ 8) 重生表格 tbody ============
    html = rebuild_tables(html, vessels, cats, ai_ships, is_briefing)
    
    # ============ 9) 寫出 ============
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"  ✓ {output_path}: {len(html):,} bytes")


def rebuild_tables(html, vessels, cats, ai_ships, is_briefing):
    """重建 ③ 穩定性表 + ④ 吻合度表 + 可立即取代清單 + 待改善清單"""
    
    # Helper functions
    def cell_cls(p):
        if p is None or p == 0: return 'cell-na'
        if p >= 95: return 'cell-good'
        if p >= 71: return 'cell-warn'
        return 'cell-bad'
    def pct_or_dash(x): return '—' if x is None or x == 0 else f'{x:.1f}%'
    def heat(v, t):
        if v is None: return ('#e9ecef', '#5a6776')
        g, w, b, wt = t
        if v <= g: return ('#d4edda', '#0e4a1c')
        if v <= w: return ('#fff3cd', '#6b4f00')
        if v <= b: return ('#f5c2c7', '#5e1c22')
        if v <= wt: return ('#e07d6f', '#fff')
        return ('#922b21', '#fff')
    def fmt_p(v, s, d=2): return '—' if v is None else f'{v:.{d}f}{s}'
    
    cat_color = {'qual':'#27ae60','near':'#f39c12','partial':'#b9770e','unqual':'#c0392b','nodata':'#7f8c8d'}
    cat_label = {'qual':'A+B 可取代','near':'C 接近','partial':'部分資料','unqual':'D 待改善','nodata':'無資料'}
    def cat_of(v):
        if v['is_no_data']: return 'nodata'
        if v['has_partial']: return 'partial'
        coverage = v['n_real']/v['n_total'] if v['n_total']>0 else 0
        original = v['score']/coverage if coverage>0 else 0
        if original >= 90 and v['comp']['pos'] >= 90: return 'qual'
        if original >= 80: return 'near'
        return 'unqual'
    
    # === ③ Stability table ===
    def status_info(v):
        if v['is_no_data']: return ('無資料', '#7f8c8d', 4)
        if v['has_partial']: return ('部分資料', '#b9770e', 1)
        return ('完整', '#0e4a1c', 0)
    
    stab_rows = []
    for v in sorted(vessels, key=lambda x: (1 if x['is_no_data'] else 0, -x['score'])):
        status, bg, order = status_info(v)
        lat = '—' if v['latency_median'] is None else f"{v['latency_median']:.0f} 分"
        sd_int = '—' if v['sd_interval_med'] is None else f"{v['sd_interval_med']:.0f} 分"
        nodata_attr = ' data-nodata="1"' if order == 4 else ''
        n_real_str = v['n_real'] if v['n_real'] > 0 else '—'
        
        if not is_briefing:
            # Full Report: SD 原始 / 補點 / 總
            n_normal = v.get('sd_normal_count', 0)
            n_filled = v.get('sd_filled_count', 0)
            n_total_sd = n_normal + n_filled
            if v['is_no_data']:
                third_cell = f'<td>—</td>'
            else:
                third_cell = f'<td><span style="font-weight:600">{n_normal:,}</span> <span style="color:#9b59b6"> / {n_filled:,}</span> / <span style="color:#465a70">{n_total_sd:,}</span></td>'
        else:
            # Customer Briefing: 顯示 SD 獨特位置（用 n_real 作 proxy）
            third_cell = f'<td>{n_real_str}</td>'
        
        stab_rows.append(
            f'<tr data-status-order="{order}"{nodata_attr}><td class="ship-zh">{v["zh"]}</td><td class="ship-en">{v["en"]}</td>'
            f'<td><span class="status-pill" style="background:{bg};color:#fff">{status}</span></td>'
            f'<td>{v["n_total"]}</td><td>{n_real_str}</td>'
            f'{third_cell}<td>{lat}</td><td>{sd_int}</td></tr>'
        )
    new_stab_tbody = '\n'.join(stab_rows)
    
    # === ④ Fit table ===
    fit_rows = []
    for v in sorted(vessels, key=lambda x: (1 if x['is_no_data'] else 0, -x['score'])):
        cat_key = cat_of(v)
        cat_td = f'<td data-col="cat" data-cat-key="{cat_key}"><span style="background:{cat_color[cat_key]};color:#fff;padding:3px 9px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap">{cat_label[cat_key]}</span></td>'
        
        # Fill rate column (Full Report only)
        if not is_briefing:
            fill = v.get('sd_filled_count', 0)
            total = v['n_total']
            fill_pct = (fill / total * 100) if total > 0 else 0
            if fill_pct == 0: fill_cell = '<td data-col="fillrate" style="color:#196f3d">0%</td>'
            elif fill_pct < 20: fill_cell = f'<td data-col="fillrate" style="color:#7e5109">{fill_pct:.1f}%</td>'
            elif fill_pct < 50: fill_cell = f'<td data-col="fillrate" style="color:#b9770e;font-weight:600">{fill_pct:.1f}%</td>'
            else: fill_cell = f'<td data-col="fillrate" style="color:#9b59b6;font-weight:700">{fill_pct:.1f}%</td>'
        else:
            fill_cell = ''
        
        if v['is_no_data']:
            row = (f'<tr data-nodata="1">{cat_td}'
                   f'<td class="ship-zh" data-col="zh">{v["zh"]}</td><td class="ship-en" data-col="en">{v["en"]}</td>'
                   f'{fill_cell}'
                   f'<td class="cell-na" data-col="pos">—</td><td class="cell-na" data-col="hdg">—</td>'
                   f'<td class="cell-na" data-col="cog">—</td><td class="cell-na" data-col="sog">—</td>'
                   f'<td class="cell-na" data-col="navi">—</td>'
                   f'<td class="cell-na" data-col="p95pos">—</td><td class="cell-na" data-col="p95hdg">—</td>'
                   f'<td class="cell-na" data-col="p95cog">—</td><td class="cell-na" data-col="p95sog">—</td>'
                   f'<td class="cell-na inv-clickable" data-col="xyinv" data-en="{v["en"]}" data-side="xy">—</td>'
                   f'<td class="cell-na inv-clickable" data-col="sdinv" data-en="{v["en"]}" data-side="sd">—</td>'
                   f'<td data-col="score" style="font-weight:700;color:#922b21">無資料</td>'
                   f'<td data-col="map"><button class="view-map-btn" data-en="{v["en"]}">📍 查看</button></td></tr>')
            fit_rows.append(row)
            continue
        
        c = v['comp']; p = v['p95']
        xy_any = v['xy_inv']['any']
        sd_any = v['sd_inv']['any'] if v['sd_inv'] else None
        pos_bg, pos_fg = heat(p['pos'], (5.5, 50, 500, 5000))
        hdg_bg, hdg_fg = heat(p['hdg'], (5, 30, 90, 180))
        cog_bg, cog_fg = heat(p['cog'], (10, 60, 120, 180))
        sog_bg, sog_fg = heat(p['sog'], (1, 5, 20, 102.3))
        def p_cell(val, bg, fg, suf, col, d=2):
            return f'<td data-col="{col}" style="background:{bg};color:{fg};font-weight:600">{fmt_p(val, suf, d)}</td>'
        def inv_cell(x, col, side):
            if x is None: return f'<td class="cell-na inv-clickable" data-col="{col}" data-en="{v["en"]}" data-side="{side}">—</td>'
            if x >= 30: return f'<td data-col="{col}" class="inv-clickable" data-en="{v["en"]}" data-side="{side}" style="color:#922b21;font-weight:700">{x:.2f}%</td>'
            if x >= 5: return f'<td data-col="{col}" class="inv-clickable" data-en="{v["en"]}" data-side="{side}" style="color:#7e5109">{x:.2f}%</td>'
            return f'<td data-col="{col}" class="inv-clickable" data-en="{v["en"]}" data-side="{side}" style="color:#196f3d">{x:.2f}%</td>'
        score_color = '#0e4a1c' if v['score']>=80 else ('#7e5109' if v['score']>=60 else '#922b21')
        
        row = (f'<tr>{cat_td}'
               f'<td class="ship-zh" data-col="zh">{v["zh"]}</td><td class="ship-en" data-col="en">{v["en"]}</td>'
               f'{fill_cell}'
               f'<td class="{cell_cls(c["pos"])}" data-col="pos">{pct_or_dash(c["pos"])}</td>'
               f'<td class="{cell_cls(c["hdg"])}" data-col="hdg">{pct_or_dash(c["hdg"])}</td>'
               f'<td class="{cell_cls(c["cog"])}" data-col="cog">{pct_or_dash(c["cog"])}</td>'
               f'<td class="{cell_cls(c["sog"])}" data-col="sog">{pct_or_dash(c["sog"])}</td>'
               f'<td class="{cell_cls(c["navistat"])}" data-col="navi">{pct_or_dash(c["navistat"])}</td>'
               f'{p_cell(p["pos"], pos_bg, pos_fg, " km", "p95pos")}'
               f'{p_cell(p["hdg"], hdg_bg, hdg_fg, "°", "p95hdg", 1)}'
               f'{p_cell(p["cog"], cog_bg, cog_fg, "°", "p95cog", 1)}'
               f'{p_cell(p["sog"], sog_bg, sog_fg, " kn", "p95sog")}'
               f'{inv_cell(xy_any, "xyinv", "xy")}{inv_cell(sd_any, "sdinv", "sd")}'
               f'<td data-col="score" style="font-weight:700;color:{score_color}">{v["score"]:.1f}</td>'
               f'<td data-col="map"><button class="view-map-btn" data-en="{v["en"]}">📍 查看</button></td></tr>')
        fit_rows.append(row)
    new_fit_tbody = '\n'.join(fit_rows)
    
    # Replace ③ tbody
    def replace_tbody_in_section(html, section_id, new_tbody):
        start = html.find(f'<div class="section" id="{section_id}">')
        if start < 0: return html
        # Find </table> after section start
        end = html.find('</table>', start) + len('</table>')
        section = html[start:end]
        new_section = re.sub(r'<tbody>\s*(.*?)\s*</tbody>', f'<tbody>\n{new_tbody}\n        </tbody>', section, count=1, flags=re.DOTALL)
        return html[:start] + new_section + html[end:]
    
    html = replace_tbody_in_section(html, 's3-stability', new_stab_tbody)
    html = replace_tbody_in_section(html, 's4-fit', new_fit_tbody)
    
    # === Customer Briefing: 可立即取代清單 (s4) + 待改善清單 (s5) ===
    if is_briefing:
        qual_vessels = sorted([v for v in vessels if v['en'] in cats['qual']], key=lambda x: -x['score'])
        s4_rows = []
        for v in qual_vessels:
            p95 = v['p95']['pos']
            p95_str = f"{p95:.2f}" if p95 is not None else "—"
            s4_rows.append(
                f'<tr>\n  <td class="ship-zh">{v["zh"]}</td>\n  <td class="ship-en">{v["en"]}</td>\n'
                f'  <td class="score-cell">{v["score"]:.1f}</td>\n'
                f'  <td>{v["comp"]["pos"]:.1f}%</td>\n  <td>{v["comp"]["hdg"]:.1f}%</td>\n'
                f'  <td>{v["comp"]["sog"]:.1f}%</td>\n  <td>{v["comp"]["navistat"]:.1f}%</td>\n'
                f'  <td>{p95_str}</td>\n</tr>'
            )
        html = replace_tbody_in_section(html, 's4', '\n'.join(s4_rows))
        
        near_vessels = sorted([v for v in vessels if v['en'] in cats['near']], key=lambda x: -x['score'])
        s5_rows = []
        for v in near_vessels:
            issues = []
            if v['comp']['pos'] < 90: issues.append(f"位置 {v['comp']['pos']:.1f}%")
            if v['comp']['hdg'] < 90: issues.append(f"艏向 {v['comp']['hdg']:.1f}%")
            if v['comp']['sog'] < 95: issues.append(f"船速 {v['comp']['sog']:.1f}%")
            issues_str = " ／ ".join(issues) if issues else "—"
            p95 = v['p95']['pos']
            p95_str = f"{p95:.1f} km" if p95 else "—"
            s5_rows.append(
                f'<tr>\n  <td class="ship-zh">{v["zh"]}</td>\n  <td class="ship-en">{v["en"]}</td>\n'
                f'  <td class="score-cell">{v["score"]:.1f}</td>\n'
                f'  <td class="issue">{issues_str}</td>\n  <td>{p95_str}</td>\n</tr>'
            )
        html = replace_tbody_in_section(html, 's5', '\n'.join(s5_rows))
    
    return html


def main():
    ap = argparse.ArgumentParser(description='Build SDataPro reports from JSON')
    ap.add_argument('json_file', nargs='?', help='JSON file (or --rebuild-all)')
    ap.add_argument('--suffix', help='Override date suffix in output filenames')
    ap.add_argument('--rebuild-all', action='store_true', help='Rebuild from all JSONs in data/')
    ap.add_argument('--output-dir', default='.', help='Output directory (default: current)')
    args = ap.parse_args()
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.abspath(args.output_dir)
    
    cb_tpl = get_template('SDataPro_Customer_Briefing.template.html', script_dir)
    fr_tpl = get_template('SDataPro_Full_Report.template.html', script_dir)
    if not cb_tpl or not fr_tpl:
        print("錯誤：找不到模板 HTML。請確認 templates/ 目錄存在，或將 SDataPro_*_20260519.html 放在指令碼旁。")
        sys.exit(1)
    
    print(f"📋 Customer Briefing 模板: {cb_tpl}")
    print(f"📋 Full Report 模板: {fr_tpl}")
    
    if args.rebuild_all:
        index_path = os.path.join(script_dir, 'data', 'index.json')
        if not os.path.exists(index_path):
            print(f"錯誤：找不到 {index_path}")
            sys.exit(1)
        with open(index_path) as f:
            idx = json.load(f)
        json_files = [os.path.join(script_dir, 'data', d['file']) for d in idx['datasets']]
        print(f"🔄 重建 {len(json_files)} 個資料集...")
    elif args.json_file:
        json_files = [args.json_file]
    else:
        ap.print_help()
        sys.exit(0)
    
    for jf in json_files:
        if not os.path.exists(jf):
            print(f"⚠ 跳過 {jf}（找不到）")
            continue
        with open(jf, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        suffix = args.suffix or data['meta'].get('date_label', '').replace('-', '')
        if not suffix:
            suffix = os.path.basename(jf).replace('.json', '')
        
        print(f"\n📦 處理 {jf} (suffix={suffix})")
        
        cb_out = os.path.join(output_dir, f'SDataPro_Customer_Briefing_{suffix}.html')
        fr_out = os.path.join(output_dir, f'SDataPro_Full_Report_{suffix}.html')
        
        build_one(jf, cb_tpl, cb_out, data, is_briefing=True)
        build_one(jf, fr_tpl, fr_out, data, is_briefing=False)
    
    print("\n✓ 全部完成")


if __name__ == '__main__':
    main()
