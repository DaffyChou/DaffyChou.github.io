#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_customer_summary.py — 由內部版 Customer Briefing 後製成「客戶摘要版」

差別 vs Customer Briefing：
  - 分類簡化為 2 類：「資料可取代」(40 艘) / 「設備待優化」(6 艘，依使用者指定)
  - 吻合度大表只保留 5 個欄位：分級 / 中文船名 / 英文船名 / 綜合評分 / 查看地圖
  - 隱藏：可立即取代清單 (s4)、待改善 (s5)
  - 路線圖：3 階段簡化為 2 階段（立即上線 → 設備升級）
  - 保留：兩家資料吻合度與合理性 (s4-fit) + 實際軌跡比對 (s3 map)

用法：
  python generate_customer_summary.py
  python generate_customer_summary.py --src <CB.html> --dst <Summary.html>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


# 7 艘設備待優化的船舶（英文船名為 key）
DEVICE_PRIORITY = [
    ("YM UNIFORMITY",    "結明輪"),
    ("YM INITIATIVE",    "暢明輪"),
    ("YM ENLIGHTENMENT", "維明輪"),
    ("YM EXCELLENCE",    "卓明輪"),
    ("YM CERTAINTY",     "好明輪"),
    ("YM WONDERLAND",    "景明輪"),
    ("YM UNICORN",       "營明輪"),   # 100% AI 補點、整個資料窗口未連線
]
BAD_SET = {en for en, _ in DEVICE_PRIORITY}

COLOR_GOOD = "#27ae60"   # 可取代（綠）
COLOR_BAD  = "#c0392b"   # 設備待優化（紅）


def main() -> None:
    # Windows console UTF-8 safety
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(here / "SDataPro_Customer_Briefing.html"))
    ap.add_argument("--dst", default=str(here / "SDataPro_Customer_Summary.html"))
    args = ap.parse_args()
    src, dst = Path(args.src), Path(args.dst)

    print(f"讀取：{src}")
    html = src.read_text(encoding="utf-8")

    # 取得船舶清單以做 sanity check
    m = re.search(r"const VESSELS = (\[.*?\]);", html, re.DOTALL)
    if not m:
        raise RuntimeError("找不到 const VESSELS 陣列")
    vessels = json.loads(m.group(1))

    # ★ 從 latest.json 載入「延遲補償後的位置一致率 pos_adj」並覆寫進 VESSELS comp.pos
    # 目的：排除船訊網延遲導致的位置差，讓「資料取代率」反映 SDataPro 本身的位置準確度
    latest_json = here / "data" / "latest.json"
    if latest_json.exists():
        latest = json.loads(latest_json.read_text(encoding="utf-8"))
        adj_map = {v["en"]: v.get("comp", {}).get("pos_adj") for v in latest.get("vessels", [])}
        n_overridden = 0
        for v in vessels:
            adj = adj_map.get(v["en"])
            if adj is not None and v.get("comp") is not None:
                old = v["comp"].get("pos")
                v["comp"]["pos"] = adj          # 把客戶版用到的 comp.pos 改為 pos_adj
                v["comp"]["pos_raw"] = old      # 留一份原始值（除錯用）
                n_overridden += 1
        # 把 VESSELS 改寫回 HTML
        new_vessels_json = json.dumps(vessels, ensure_ascii=False, separators=(', ', ': '))
        html = re.sub(
            r"const VESSELS = \[.*?\];",
            lambda _m: f"const VESSELS = {new_vessels_json};",
            html, count=1, flags=re.DOTALL,
        )
        print(f"  ★ 套用延遲補償的位置一致率（comp.pos_adj）覆寫 {n_overridden} 艘船的 comp.pos")
    else:
        print(f"  ⚠ 找不到 {latest_json}，跳過延遲補償覆寫（客戶版會用原始 comp.pos）")
    all_en = {v["en"] for v in vessels}
    missing_bad = BAD_SET - all_en
    if missing_bad:
        print(f"⚠ 警告：DEVICE_PRIORITY 裡有不在 VESSELS 的船：{missing_bad}")

    good_ships = [v["en"] for v in vessels if v["en"] not in BAD_SET]
    bad_ships  = [v["en"] for v in vessels if v["en"] in BAD_SET]
    n_good, n_bad = len(good_ships), len(bad_ships)
    print(f"  總船數：{len(vessels)} | 可取代：{n_good} | 設備待優化：{n_bad}")

    # ===== 1) Title / hero =====
    html = re.sub(
        r"<title>[^<]*</title>",
        "<title>SDataPro 取代評估 ｜ 客戶摘要</title>",
        html, count=1,
    )
    html = html.replace(
        '<div class="hero-meta">客戶簡報 ｜ CLIENT BRIEFING</div>',
        '<div class="hero-meta">客戶摘要 ｜ CUSTOMER SUMMARY</div>',
    )
    html = re.sub(
        r"<p>基於[^<]*</p>",
        f"<p>46 艘 YM 船舶 AIS 資料比對結果：<b>{n_good} 艘資料可取代</b>，"
        f"<b>{n_bad} 艘設備待優化</b>（7 天逐筆比對、80,040 筆 AIS 資料）</p>",
        html, count=1,
    )

    # ===== 2) Nav：移掉吻合度/可取代清單/待改善連結 =====
    html = re.sub(r'\n?\s*<a href="#s4-fit">吻合度與合理性</a>', "", html)
    html = re.sub(r'\n?\s*<a href="#s4">可取代清單</a>', "", html)
    html = re.sub(r'\n?\s*<a href="#s5">待改善</a>', "", html)

    # ===== 3) Section 2: donut + legend 簡化為 2 類 =====
    html = _rewrite_donut_section(html, n_good, n_bad)

    # ===== 4) 移除 Section 4 (可取代清單)、Section 5 (待改善)、Section 4-fit (兩家資料吻合度) =====
    html = _remove_section(html, "s4")
    html = _remove_section(html, "s5")
    html = _remove_section(html, "s4-fit")

    # ===== 6) Section 6: 路線圖簡化為 2 階段 =====
    html = _rewrite_roadmap(html, n_good, n_bad)

    # ===== 7a) 軌跡地圖 detail panel：移除 9 個欄位 (船訊網點位/SDataPro 點位/SD 位置 / XY 位置/
    # 綜合評分/位置 P95/艏向符合率/船速符合率/航行狀態/位置符合率) =====
    html = _strip_map_stats(html)
    # 把 SD 跟轉率 改成 資料取代率（包含 followbar-label / ms-div label / delayBox 內提及）
    html = html.replace("SD 跟轉率", "資料取代率")
    html = html.replace("跟轉率高", "資料取代率高")
    html = html.replace("位置符合率被拖低", "造成位置差距較大")
    # 移除「資料取代率＝SDataPro 跟上船訊網…」這段 hint
    html = re.sub(
        r'\s*<div class="followbar-hint">[^<]*<b>[^<]*</b>[^<]*<b>[^<]*</b></div>',
        '',
        html,
    )
    # detail panel 兩處的 followRate 改用「位置符合的點位比例」(v.comp.pos)
    html = html.replace(
        "const followRate = followPctRaw.toFixed(1) + '%';",
        "const followRate = (v.comp && v.comp.pos != null ? v.comp.pos : 0).toFixed(1) + '%';",
    )
    html = html.replace(
        "const followPct = followPctRaw.toFixed(1);",
        "const followPct = (v.comp && v.comp.pos != null ? v.comp.pos : 0).toFixed(1);",
    )

    # ===== 7b) followbar 下方加 3 艘船的簡短說明（存明、創明、譽明）=====
    html = _inject_inline_ship_notes(html)

    # ===== 7c) 船舶清單：移除 vtag (完整/部分/無資料) + vscore-pill 改顯示資料取代率 =====
    html = _rewrite_vessel_list_item(html)

    # ===== 7d) 期間卡：移除「有效比對資料筆數」+ 重命名「原始資料總筆數→資料總筆數」 =====
    html = _adjust_period_card(html)

    # ===== 7) Footer =====
    html = re.sub(
        r"<footer>[^<]*",
        f"<footer>  ©2026 摯陞數位科技有限公司 ｜ 涵蓋 46 艘 YM 船舶（"
        f"{n_good} 艘可取代 / {n_bad} 艘設備待優化）｜ 2026/5/15–5/21 之資料窗",
        html, count=1,
    )

    # ===== 8) JS 端：*_SHIPS / 篩選按鈕計數 / 地圖篩選按鈕 =====
    html = _replace_js_array(html, "QUAL_SHIPS", good_ships)
    html = _replace_js_array(html, "PARTIAL_SHIPS", [])
    html = _replace_js_array(html, "NEAR_SHIPS", [])
    html = _replace_js_array(html, "UNQUAL_SHIPS", bad_ships)
    html = _replace_js_array(html, "NODATA_SHIPS", [])
    # 地圖上方的篩選按鈕：把 qual/unqual 換成 2 類用語，其他類設為 0 隱藏
    html = _update_map_filter_buttons(html, n_good, n_bad)

    dst.write_text(html, encoding="utf-8")
    print(f"✅ 產生：{dst}  ({len(html)/1024:.0f} KB)")


def _rewrite_donut_section(html: str, n_good: int, n_bad: int) -> str:
    """把 Section 2 的 5 類 donut + legend 改為 2 類。"""
    # 標題：「📊 46 艘船舶分級分佈」→ 不動
    # 「只有...能完全替代」這段敘述
    html = re.sub(
        r'<b style="color:#27ae60">只有「可立即取代」分類的 \d+ 艘</b>能完全替代船訊網的 AIS 資料來源。[^<]*',
        f'<b style="color:#27ae60">{n_good} 艘船舶的 AIS 資料品質已可由 SDataPro 取代船訊網</b>，'
        f'另有 {n_bad} 艘因設備異常需先優化硬體：',
        html, count=1, flags=re.DOTALL,
    )
    # ul：分類說明列表 → 兩條
    html = re.sub(
        r'<ul style="margin:6px 0 0 22px;padding:0">.*?</ul>',
        '<ul style="margin:6px 0 0 22px;padding:0">'
        f'<li><b style="color:{COLOR_GOOD}">資料可取代（{n_good} 艘）</b>：'
        '一致性符合營運使用，可立即由 SDataPro 為主資料源、船訊網僅留備援。</li>'
        f'<li><b style="color:{COLOR_BAD}">設備待優化（{n_bad} 艘）</b>：'
        '船載設備有訊號間歇/失效情形，需檢修硬體或補裝感測器，完成後即可納入取代範圍。</li>'
        '</ul>',
        html, count=1, flags=re.DOTALL,
    )

    # donut 中央數字（總船舶數）保持 46，不動
    # donut 圖：JS data 改成 [n_good, 0, 0, n_bad, 0]
    html = re.sub(
        r"data: \[\d+, \d+, \d+, \d+, \d+\]",
        f"data: [{n_good}, 0, 0, {n_bad}, 0]",
        html, count=1,
    )

    # legend 5 條 dl-item → 只留 2 條
    # 用 depth-based 解析找出 donut-legend 完整範圍，避免 dl-text 內 </div></div></div> 干擾 regex
    new_legend = (
        '<div class="donut-legend">\n'
        f'        <div class="dl-item" style="border-left-color:{COLOR_GOOD}">\n'
        f'          <span class="dl-dot" style="background:{COLOR_GOOD}"></span>\n'
        '          <div class="dl-text"><div class="dl-cat">資料可取代</div>'
        '<div class="dl-detail">AIS 資料品質達標，可直接以 SDataPro 取代船訊網</div></div>\n'
        f'          <div class="dl-count" style="color:{COLOR_GOOD}">{n_good}</div>\n'
        '        </div>\n'
        f'        <div class="dl-item" style="border-left-color:{COLOR_BAD}">\n'
        f'          <span class="dl-dot" style="background:{COLOR_BAD}"></span>\n'
        '          <div class="dl-text"><div class="dl-cat">設備待優化</div>'
        '<div class="dl-detail">船載設備異常或失效，需檢修硬體後再納入</div></div>\n'
        f'          <div class="dl-count" style="color:{COLOR_BAD}">{n_bad}</div>\n'
        '        </div>\n'
        '      </div>'
    )
    anchor = '<div class="donut-legend">'
    start = html.find(anchor)
    if start >= 0:
        pos = start + len(anchor)
        depth = 1
        while depth > 0 and pos < len(html):
            next_open = html.find('<div', pos)
            next_close = html.find('</div>', pos)
            if next_close < 0:
                break
            if 0 <= next_open < next_close:
                depth += 1
                pos = next_open + 4
            else:
                depth -= 1
                pos = next_close + len('</div>')
        html = html[:start] + new_legend + html[pos:]
    return html


def _inject_hide_css(html: str) -> str:
    """加 CSS 隱藏吻合度大表多餘欄位 + 整個欄位篩選 toggle 區塊。"""
    extra_css = (
        "\n/* 客戶摘要版：隱藏 s4-fit 多餘欄位（只保留 cat/zh/en/score/map）*/\n"
        '#s4-fit [data-col="pos"],\n'
        '#s4-fit [data-col="hdg"],\n'
        '#s4-fit [data-col="cog"],\n'
        '#s4-fit [data-col="sog"],\n'
        '#s4-fit [data-col="navi"],\n'
        '#s4-fit [data-col="p95pos"],\n'
        '#s4-fit [data-col="fillrate"],\n'
        "#s4-fit #colTogglesFit{display:none !important}\n"
        "/* 客戶摘要版：隱藏顏色判讀說明區（簡化版用不到）*/\n"
        "#s4-fit > .section-body > div:nth-of-type(1){display:none !important}\n"
    )
    return html.replace("</style>", extra_css + "</style>", 1)


def _rewrite_fit_cat_cells(html: str) -> str:
    """逐列重寫吻合度表的 cat cell（依 ship en 屬於 BAD_SET 與否）。"""
    # 每列裡找 <td data-col="map"><button class="view-map-btn" data-en="XXX">
    # 然後改前面的 <td data-col="cat" ...>...</td>
    def _rewrite(match: re.Match) -> str:
        row = match.group(0)
        en_m = re.search(r'data-en="([^"]+)"', row)
        if not en_m:
            return row
        en = en_m.group(1)
        if en in BAD_SET:
            new_cat = (
                '<td data-col="cat" data-cat-key="unqual">'
                f'<span style="background:{COLOR_BAD};color:#fff;padding:3px 9px;'
                'border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap">'
                '設備待優化</span></td>'
            )
        else:
            new_cat = (
                '<td data-col="cat" data-cat-key="qual">'
                f'<span style="background:{COLOR_GOOD};color:#fff;padding:3px 9px;'
                'border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap">'
                '資料可取代</span></td>'
            )
        return re.sub(
            r'<td data-col="cat"[^>]*>.*?</td>',
            lambda _m, c=new_cat: c, row, count=1, flags=re.DOTALL,
        )

    # 只處理 s4-fit section 內的 <tr>
    start = html.find('<div class="section" id="s4-fit">')
    if start < 0:
        return html
    end = html.find('</div>\n</div>', start)
    if end < 0:
        end = len(html)
    body = html[start:end]
    new_body = re.sub(
        r"<tr[^>]*>.*?</tr>",
        _rewrite, body, flags=re.DOTALL,
    )
    return html[:start] + new_body + html[end:]


def _strip_extra_fit_toggles(html: str) -> str:
    """把 colTogglesFit 區塊裡的 checkbox 全部移除（CSS 已經隱藏整個區塊；這裡再做語意清理）"""
    # 已用 CSS display:none，不再額外處理
    return html


def _remove_section(html: str, section_id: str) -> str:
    """刪除指定 id 的整個 <div class="section" id="..."> ... </div> 區塊。"""
    pat = re.compile(
        r'(?:<!--\s*Section[^\n]*?-->\s*)?<div class="section" id="'
        + re.escape(section_id) + r'">',
    )
    m = pat.search(html)
    if not m:
        return html
    # 從 section open 開始往下，配對 div 結束（簡單版：找下一個 "</div>\n</div>" 之後第一個換行）
    start = m.start()
    pos = m.end()
    depth = 1
    while depth > 0 and pos < len(html):
        next_open = html.find("<div", pos)
        next_close = html.find("</div>", pos)
        if next_close < 0:
            break
        if 0 <= next_open < next_close:
            depth += 1
            pos = next_open + 4
        else:
            depth -= 1
            pos = next_close + len("</div>")
    # 吃掉接下來的換行
    while pos < len(html) and html[pos] in "\r\n ":
        pos += 1
    return html[:start] + html[pos:]


def _rewrite_roadmap(html: str, n_good: int, n_bad: int) -> str:
    """3 階段 → 2 階段路線圖。"""
    total = n_good + n_bad
    pct1 = round(n_good * 100 / total) if total else 0
    new_roadmap = (
        '<div class="section" id="s6">\n'
        '  <div class="section-head">🗺️ 後續取代路線圖（2 階段）</div>\n'
        '  <div class="section-body">\n'
        f'    <p class="lead">先以 {n_good} 艘資料品質達標的船舶立即切換，剩餘 {n_bad} 艘'
        '完成設備優化後納入，預計 100% 取代船訊網 AIS 資料來源。</p>\n'
        '    <div class="roadmap">\n'
        '      <div class="phase p1">\n'
        '        <div class="phase-num">PHASE 1</div>\n'
        '        <div class="phase-name">立即切換</div>\n'
        '        <div class="phase-time">⏰ 立即執行</div>\n'
        f'        <div class="phase-target">範圍：{n_good} 艘資料可取代船舶</div>\n'
        '        <div class="phase-action">由 SDataPro 為主資料源、船訊網僅留備援。<br>'
        f'預期：取代涵蓋率 → <b>{pct1}%</b></div>\n'
        '      </div>\n'
        '      <div class="phase p2">\n'
        '        <div class="phase-num">PHASE 2</div>\n'
        '        <div class="phase-name">設備優化後納入</div>\n'
        '        <div class="phase-time">⏰ 依硬體進度</div>\n'
        f'        <div class="phase-target">範圍：{n_bad} 艘設備待優化船舶</div>\n'
        '        <div class="phase-action">檢修船載感測器／補裝缺漏設備／優化傳輸鏈路，'
        '完成後納入取代範圍。<br>預期：取代涵蓋率 → <b>100%</b></div>\n'
        '      </div>\n'
        '    </div>\n'
        '  </div>\n'
        '</div>'
    )
    # ★ 用 depth-based 解析找出 s6 完整範圍（避免 non-greedy regex 留下孤兒 </div>）
    anchor = '<div class="section" id="s6">'
    start = html.find(anchor)
    if start < 0:
        return html
    pos = start + len(anchor)
    depth = 1
    while depth > 0 and pos < len(html):
        next_open = html.find('<div', pos)
        next_close = html.find('</div>', pos)
        if next_close < 0:
            break
        if 0 <= next_open < next_close:
            depth += 1
            pos = next_open + 4
        else:
            depth -= 1
            pos = next_close + len('</div>')
    return html[:start] + new_roadmap + html[pos:]


def _strip_map_stats(html: str) -> str:
    """逐行移除 mapStats / mapStatsBox 裡指定欄位的 <div class="ms"> 區塊。

    這些欄位都是「<div class="ms">...<div class="l">LABEL...</div></div>」的單行結構；
    用 line-based 過濾最穩。"""
    # label 完整字面（或前綴）→ 凡含到就整行移除
    drop_labels = (
        '<div class="l">船訊網點位</div>',
        '<div class="l">SDataPro 點位</div>',
        '<div class="l">SD 位置 / XY 位置',   # 後面接動態 ⚠卡住/⚠稀疏，用前綴
        '<div class="l">綜合評分</div>',
        '<div class="l">位置 P95</div>',
        '<div class="l">艏向符合率</div>',
        '<div class="l">船速符合率</div>',
        '<div class="l">航行狀態</div>',
        '<div class="l">位置符合率</div>',
    )
    out = []
    for line in html.splitlines(keepends=True):
        if '<div class="ms">' in line and any(lbl in line for lbl in drop_labels):
            continue
        out.append(line)
    return ''.join(out)


def _adjust_period_card(html: str) -> str:
    """期間卡：
       - 移除「有效比對資料筆數」整個 period-item
       - 「原始資料總筆數」改名為「資料總筆數」
    """
    # 1) 移除「有效比對資料筆數」block（含外層的 <div class="period-item">...</div>）
    html = re.sub(
        r'\s*<div class="period-item">\s*<div class="v">[^<]+</div>\s*<div class="l">有效比對資料筆數</div>\s*</div>',
        '',
        html, count=1,
    )
    # 2) Rename label
    html = html.replace(
        '<div class="l">原始資料總筆數</div>',
        '<div class="l">資料總筆數</div>',
    )
    return html


def _rewrite_vessel_list_item(html: str) -> str:
    """改寫 buildVesselList 內每個 item：
       - 移除 vtag (完整/部分/無資料)
       - vscore-pill 改顯示「資料取代率」= v.comp.pos（位置符合的點位比例，5 km 內視為符合）
       - cls 依資料取代率分色：≥95 good / ≥80 warn / <80 bad
       - 同時把船舶列表的排序改成依資料取代率（降冪）
    """
    # 1) 改 sort 鍵：原本 sort by score desc，改 sort by 取代率 desc
    html = html.replace(
        "const sorted = [...VESSELS].sort((a,b) => b.score - a.score);",
        "const sorted = [...VESSELS].sort((a,b) => _calcReplaceRate(b) - _calcReplaceRate(a));",
        1,
    )
    # 2) 在 getFilteredVessels 之前插入 _calcReplaceRate helper
    helper = (
        "\nfunction _calcReplaceRate(v){\n"
        "  // 資料取代率 = 位置符合的點位比例 (v.comp.pos)\n"
        "  // 引擎已逐筆比對 XY/SD 位置，5 km 內視為「符合」\n"
        "  if (v.is_no_data) return 0;\n"
        "  return (v.comp && v.comp.pos != null) ? v.comp.pos : 0;\n"
        "}\n"
    )
    html = html.replace("function getFilteredVessels()", helper + "function getFilteredVessels()", 1)

    # 3) 改 item 渲染：移除 vtag、vscore-pill 改顯示取代率
    old = (
        "    const cls = classify(v);\n"
        "    let tag = '';\n"
        "    if (v.is_no_data) tag = '<span class=\"vtag vtag-no\">無資料</span>';\n"
        "    else if (v.has_partial) tag = '<span class=\"vtag vtag-partial\">部分</span>';\n"
        "    else tag = '<span class=\"vtag vtag-full\">完整</span>';\n"
        "    item.innerHTML = `\n"
        "      <div class=\"vn\">\n"
        "        <span class=\"vn-zh\">${v.zh}</span>\n"
        "        <span class=\"vn-en\">${v.en}</span>\n"
        "        ${tag}\n"
        "      </div>\n"
        "      <span class=\"vscore-pill ${cls}\">${v.score.toFixed(1)}</span>`;"
    )
    new = (
        "    const _replaceRate = _calcReplaceRate(v);\n"
        "    const cls = v.is_no_data ? 'bad' : (_replaceRate >= 95 ? 'good' : (_replaceRate >= 80 ? 'warn' : 'bad'));\n"
        "    item.innerHTML = `\n"
        "      <div class=\"vn\">\n"
        "        <span class=\"vn-zh\">${v.zh}</span>\n"
        "        <span class=\"vn-en\">${v.en}</span>\n"
        "      </div>\n"
        "      <span class=\"vscore-pill ${cls}\">${_replaceRate.toFixed(1)}%</span>`;"
    )
    if old in html:
        return html.replace(old, new, 1)
    return html


def _inject_inline_ship_notes(html: str) -> str:
    """在地圖點船 detail panel 的 followbar 進度條下方，插入 3 艘船的簡短說明。
    透過：
      1. 在 JS 區塊頂部宣告一個 const SUMMARY_SHIP_NOTES 對照表（en → HTML 片段）
      2. 在 followbar-row 之後注入 ${SUMMARY_SHIP_NOTES[v.en] || ''}
    """
    notes_decl = (
        "\nconst SUMMARY_SHIP_NOTES = {\n"
        # ── 3 艘特殊狀況（仍歸「資料可取代」）──
        "  'YM CONTINUITY': '<div class=\"ship-note\">📡 本期內網路有短暫不穩，'\n"
        "    + '<b>網路不穩時即時以補點維持航跡顯示</b>；網路恢復後 AIS 資料回傳，'\n"
        "    + '再進行補資料修正。</div>',\n"
        "  'YM EVOLUTION': '<div class=\"ship-note\">📡 本期內網路有短暫不穩，'\n"
        "    + '<b>網路不穩時即時以補點維持航跡顯示</b>；網路恢復後 AIS 資料回傳，'\n"
        "    + '再進行補資料修正。</div>',\n"
        "  'YM CREDIBILITY': '<div class=\"ship-note ship-note-warn\">🇮🇷 位於'\n"
        "    + '<b>波斯灣阿聯酋海域</b>，屬已知 GPS 干擾區（受區域衝突影響）。'\n"
        "    + '<b>SDataPro 設備運作正常、資料持續回傳</b>，'\n"
        "    + '但所在區域 GPS 訊號被外部干擾。</div>',\n"
        # ── 7 艘設備待優化（措辭已軟化）──\n"
        "  'YM INITIATIVE': '<div class=\"ship-note ship-note-warn\">⚙ <b>SD 設備整段資料期未回傳</b>，'\n"
        "    + 'SD 點位數即等於 AI 補點數量，建議檢測或替換設備。</div>',\n"
        "  'YM EXCELLENCE': '<div class=\"ship-note ship-note-warn\">⚙ <b>SD 設備整段資料期未回傳</b>，'\n"
        "    + 'SD 點位數即等於 AI 補點數量，建議檢測或替換設備。</div>',\n"
        "  'YM ENLIGHTENMENT': '<div class=\"ship-note ship-note-warn\">⚙ <b>SD 設備整段資料期未回傳</b>，'\n"
        "    + 'SD 點位數即等於 AI 補點數量，建議檢測或替換設備。</div>',\n"
        "  'YM CERTAINTY': '<div class=\"ship-note ship-note-warn\">⚙ <b>SD 設備間歇性回傳</b>（時好時壞），'\n"
        "    + '多數時間由 AI 補點，建議巡檢連線穩定性（電源／天線／接觸）。</div>',\n"
        "  'YM UNIFORMITY': '<div class=\"ship-note ship-note-warn\">⚙ <b>SD 設備整段資料期未回傳</b>，'\n"
        "    + 'SD 點位數即等於 AI 補點數量，建議檢測或替換設備。</div>',\n"
        "  'YM WONDERLAND': '<div class=\"ship-note ship-note-warn\">⚙ <b>SD 設備整段資料期未回傳</b>，'\n"
        "    + 'SD 點位數即等於 AI 補點數量，建議檢測或替換設備。</div>',\n"
        "  'YM UNICORN': '<div class=\"ship-note ship-note-warn\">⚙ <b>SD 設備整段資料期未回傳</b>，'\n"
        "    + 'SD 點位數即等於 AI 補點數量，建議檢測或替換設備。</div>',\n"
        "};\n"
    )
    note_css = (
        "\n.ship-note{font-size:12px;color:#1a3a5c;background:#eef3f8;border-left:3px solid #2d6a9f;"
        "border-radius:4px;padding:8px 10px;margin-top:8px;line-height:1.7}\n"
        ".ship-note-warn{border-left-color:#c0392b;background:#fdedec;color:#5e1c22}\n"
    )
    html = html.replace("</style>", note_css + "</style>", 1)
    html = re.sub(
        r"(const VESSELS\s*=)",
        notes_decl + r"\1",
        html, count=1,
    )
    # followbar-row 結尾後插入 ${SUMMARY_SHIP_NOTES[v.en] || ''}
    html = html.replace(
        '<div class="followbar-value" style="color:${followColor}">${followRate}</div>\n'
        '      </div>\n'
        '    </div>`}',
        '<div class="followbar-value" style="color:${followColor}">${followRate}</div>\n'
        '      </div>\n'
        '      ${SUMMARY_SHIP_NOTES[v.en] || \'\'}\n'
        '    </div>`}',
        1,
    )
    return html


def _insert_special_notes_DEPRECATED(html: str) -> str:
    """[DEPRECATED] 已被 _inject_inline_ship_notes 取代（改在 followbar 下方加 inline 說明）。"""
    return html
    _unused = '''
<!-- Section 7: 特殊狀況船舶說明 -->
<div class="section" id="s7-notes">
  <div class="section-head">🔍 特殊狀況船舶說明（3 艘）</div>
  <div class="section-body">
    <p class="lead">下列 3 艘船舶雖然位置一致率較低，但實際資料品質可用，仍歸於「資料可取代」分類：</p>

    <div style="background:#f4f7fb;border:1px solid #d6dde4;border-left:5px solid #2d6a9f;border-radius:8px;padding:14px 18px;margin-bottom:12px">
      <div style="font-weight:800;color:#1a3a5c;font-size:15px;margin-bottom:6px">🚢 存明輪 YM CONTINUITY</div>
      <div style="font-size:13px;color:#1a3a5c;line-height:1.8">
        資料區間內網路曾不穩，但<b>SDataPro 後續恢復回傳、AI 補點位置正確</b>。
        <ul style="margin:6px 0 0 22px;padding:0">
          <li>網路不穩時段：<b>2026/5/15 16:35 ~ 5/19 17:45</b>（4 天 1 小時，由 AI 補點 1167 筆）</li>
          <li>後續驗證：5/19 17:45 之後 SDataPro 恢復回傳，補點位置與實際軌跡<b>吻合</b></li>
          <li>結論：屬資料窗口內的暫時性網路問題，SDataPro 設備本身正常運作</li>
        </ul>
      </div>
    </div>

    <div style="background:#f4f7fb;border:1px solid #d6dde4;border-left:5px solid #2d6a9f;border-radius:8px;padding:14px 18px;margin-bottom:12px">
      <div style="font-weight:800;color:#1a3a5c;font-size:15px;margin-bottom:6px">🚢 創明輪 YM EVOLUTION</div>
      <div style="font-size:13px;color:#1a3a5c;line-height:1.8">
        資料區間內網路曾不穩，但<b>SDataPro 後續恢復回傳、AI 補點位置正確</b>。
        <ul style="margin:6px 0 0 22px;padding:0">
          <li>網路不穩時段：<b>2026/5/20 11:35 ~ 5/21 17:30</b>（1 天 5 小時，由 AI 補點 360 筆）</li>
          <li>後續驗證：網路恢復後回傳資料證實 AI 補點位置<b>正確</b></li>
          <li>結論：屬資料窗口內的暫時性網路問題，SDataPro 設備本身正常運作</li>
        </ul>
      </div>
    </div>

    <div style="background:#f4f7fb;border:1px solid #d6dde4;border-left:5px solid #c0392b;border-radius:8px;padding:14px 18px;margin-bottom:0">
      <div style="font-weight:800;color:#1a3a5c;font-size:15px;margin-bottom:6px">🚢 譽明輪 YM CREDIBILITY</div>
      <div style="font-size:13px;color:#1a3a5c;line-height:1.8">
        位於<b>波斯灣阿聯酋海域（阿布達比/杜拜外海）</b>，屬已知 GPS 干擾區（受區域衝突影響）。
        <b style="color:#c0392b">SDataPro 設備本身運作正常、資料持續回傳沒有中斷</b>，但所在區域 GPS 訊號被外部干擾，導致接收到的位置不準。
        <ul style="margin:6px 0 0 22px;padding:0">
          <li>資料區間內 GPS 正常時段：<b>5/19 01:50 ~ 05:40</b>、<b>5/20 18:05 ~ 5/21 03:35</b>（共 162 筆真實 GPS 位置）</li>
          <li>其餘時段 GPS 受干擾，由 AI 補點預測位置（1578 筆）</li>
          <li>結論：屬外部干擾，非設備問題；建議在 KPI 統計時將此類戰爭區船舶單獨標註</li>
        </ul>
      </div>
    </div>
  </div>
</div>
'''
    # 插入到 s3 (Map) 之後、s6 (Roadmap) 之前
    anchor = '<!-- Section 6: Roadmap -->'
    if anchor in html:
        return html.replace(anchor, special + '\n' + anchor, 1)
    # fallback: 插在 s6 直接前面
    pos = html.find('<div class="section" id="s6">')
    if pos > 0:
        return html[:pos] + special + '\n' + html[pos:]
    return html


def _replace_js_array(html: str, name: str, ships: list[str]) -> str:
    new = json.dumps(ships, ensure_ascii=False)
    return re.sub(
        rf"(const\s+{re.escape(name)}\s*=\s*)\[[^\]]*\](;)",
        lambda m: m.group(1) + new + m.group(2),
        html, count=1,
    )


def _update_map_filter_buttons(html: str, n_good: int, n_bad: int) -> str:
    """軌跡地圖上方的 filter 按鈕：把 qual/unqual 改成新用語、隱藏其他類。"""
    # 替換 data-cat 對應的計數
    def repl_count(cat: str, count: int):
        nonlocal html
        html = re.sub(
            rf'(data-cat="{cat}">[^<]*?\()\d+(\)</button>)',
            lambda m: m.group(1) + str(count) + m.group(2),
            html,
        )
    repl_count("qual", n_good)
    repl_count("near", 0)
    repl_count("partial", 0)
    repl_count("unqual", n_bad)
    repl_count("nodata", 0)
    return html


if __name__ == "__main__":
    main()
