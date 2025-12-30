/* ========= Materials Create Page JS ========= */
/* 只處理新增頁邏輯，不污染其他頁 */

(() => {

  /* ---------- Tree Demo Data ---------- */
  const TREE = {
    name: "全部系統",
    children: [
      {
        name: "磁羅經系統",
        children: [
          {
            name: "羅經櫃 (Binnacle)",
            children: [
              { name: "方位鏡 (Azimuth Circle)", children: [] },
              { name: "磁羅經盒 (Compass Box)", children: [] }
            ]
          }
        ]
      },
      {
        name: "推進系統 (Propulsion System)",
        children: [
          {
            name: "原動機 (Main Engine)",
            children: [
              { name: "氣缸單元", children: [] }
            ]
          }
        ]
      }
    ]
  };

  const treeEl = document.getElementById("materialsTree");
  const pathInput = document.getElementById("path");
  const pathText = document.getElementById("pathText");

  function createEl(tag, cls, html){
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html) el.innerHTML = html;
    return el;
  }

  function renderNode(node, path){
    const row = createEl("div", "treeNode");
    const label = createEl("div", "treeNode__label", node.name);
    const pick = createEl("button", "treeNode__pick", "選取");

    row.append(label, pick);

    pick.onclick = () => {
      const fullPath = [...path, node.name].join(" / ");
      pathInput.value = fullPath;
      pathText.textContent = fullPath;
    };

    const wrap = createEl("div");
    wrap.appendChild(row);

    if (node.children?.length){
      const children = createEl("div", "treeChildren");
      node.children.forEach(c =>
        children.appendChild(renderNode(c, [...path, node.name]))
      );
      wrap.appendChild(children);
    }

    return wrap;
  }

  TREE.children.forEach(n =>
    treeEl.appendChild(renderNode(n, [TREE.name]))
  );

  /* ---------- PN duplicate check (Demo) ---------- */
  const EXISTING = new Set(["BULB-24V-15W-01", "ME-PR-92-01"]);
  const pn = document.getElementById("pn");
  const pnState = document.getElementById("pnState");

  pn?.addEventListener("input", () => {
    const v = pn.value.trim().toUpperCase();
    if (!v) return;

    pnState.innerHTML = EXISTING.has(v)
      ? `<span class="warnBadge">料號已存在</span>`
      : `<span class="okBadge">可用</span>`;
  });

  /* ---------- Actions ---------- */
  function toast(msg){
    alert(msg); // Demo，實務可換成 Bootstrap Toast
  }

  document.getElementById("btnCreate")?.addEventListener("click", () => {
    toast("物料建立成功（Demo）");
  });

  document.getElementById("btnDraft")?.addEventListener("click", () => {
    toast("已儲存草稿（Demo）");
  });

})();
