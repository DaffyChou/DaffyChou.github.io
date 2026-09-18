#!/usr/bin/env python3
"""從 merged（內部版）產出 final（客戶版）。
   規則：CUSTOMER_BUILD 旗標改 true；移除全球風險區 script 標籤；標題加註客戶版。
   用法：python3 build_final.py [merged.html] [final.html]  （預設同目錄兩檔）"""
import sys, re, io
src = sys.argv[1] if len(sys.argv) > 1 else "voyage-alert-rwd-merged.html"
dst = sys.argv[2] if len(sys.argv) > 2 else "voyage-alert-rwd-final.html"
s = io.open(src, encoding="utf-8").read()
n = s.count("/*@CUSTOMER_BUILD@*/false")
assert n == 1, f"CUSTOMER_BUILD 旗標數量異常：{n}"
s = s.replace("/*@CUSTOMER_BUILD@*/false", "/*@CUSTOMER_BUILD@*/true")
s, k = re.subn(r'\n<script src="risk-zones-global\.js"></script>[^\n]*', "", s)
assert k == 1, "找不到 risk-zones-global.js 標籤"
s = s.replace("<!-- merged 版新增", "<!-- merged 版（客戶版不載入）", 1) if "<!-- merged 版新增" in s else s
io.open(dst, "w", encoding="utf-8").write(s)
print(f"{dst} written ({len(s)//1024} KB); CUSTOMER_BUILD=true, global risk zones removed")
