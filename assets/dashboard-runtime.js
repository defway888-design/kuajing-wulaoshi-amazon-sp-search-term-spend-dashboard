"use strict";
const payload = JSON.parse(document.getElementById("dashboardData").textContent);
const raw = payload.rows, meta = payload.meta, asinCampaigns = payload.asinCampaigns;
const shops = payload.shops, shopNames = new Map(shops.map(x => [x.profileId, x.label]));
const el = id => document.getElementById(id);
const dateStart = el("dateStart"), dateEnd = el("dateEnd"), site = el("site"), shop = el("shop"), advertisedAsin = el("advertisedAsin");
const orderSortAsc = el("orderSortAsc"), orderSortDesc = el("orderSortDesc"), list = el("list"), status = el("status");
const empty = el("empty"), scale = el("scale"), tip = el("tooltip"), filterError = el("filterError"), footnote = el("footnote");
const detailDialog = el("detailDialog"), detailTitle = el("detailTitle"), detailKicker = el("detailKicker"), detailScope = el("detailScope");
const detailRows = el("detailRows"), detailClose = el("detailClose"), detailChart = el("detailChart");
const detailSuggestions = el("detailSuggestions"), detailSuggestionsTitle = el("detailSuggestionsTitle");
const detailReminder = el("detailReminder"), detailTooltip = el("detailTooltip");
const unit = 10 ** meta.scale;
const minor = new Intl.NumberFormat("en-US", { style: "currency", currency: meta.currency }).resolvedOptions().maximumFractionDigits;
let base = 0, orderBase = 0, currentRows = [], activeSort = "desc";
dateStart.min = meta.start; dateStart.max = meta.end; dateStart.value = meta.start;
dateEnd.min = meta.start; dateEnd.max = meta.end; dateEnd.value = meta.end;
site.add(new Option(meta.site, meta.site));
shop.add(new Option("全部店铺", ""));
for (const item of shops) shop.add(new Option(item.label, item.profileId));
el("spendHeader").textContent = "花费 (" + meta.currency + ")";
el("detailSpendLegend").textContent = "花费（" + meta.currency + "）";
el("detailSpendHeader").textContent = "花费 (" + meta.currency + ")";
document.title = "跨境吴老师｜" + (meta.accountLabel ? meta.accountLabel + " " : "") + meta.site + " SP 搜索词花费占比看板";
function money(amount) { return (amount / unit).toLocaleString("en-US", { minimumFractionDigits: minor, maximumFractionDigits: minor }); }
function percent(amount) { return base ? (amount / base * 100).toFixed(2) + "%" : "—"; }
function orderPercent(orders) { return orderBase ? (orders / orderBase * 100).toFixed(2) + "%" : "—"; }
function key(row) { return row.query.trim().toLocaleLowerCase("en-US") + "|" + row.isAsin; }
function hideTip() { tip.hidden = true; }
function moveTip(x, y) {
  const b = tip.getBoundingClientRect(), pad = 12, gap = 14;
  tip.style.left = Math.max(pad, Math.min(x + gap, window.innerWidth - b.width - pad)) + "px";
  let top = y - b.height - gap;
  if (top < pad) top = Math.min(y + gap, window.innerHeight - b.height - pad);
  tip.style.top = Math.max(pad, top) + "px";
}
function showTip(row, x, y) {
  tip.replaceChildren();
  const name = document.createElement("div"); name.className = "tip-name"; name.textContent = row.term; tip.appendChild(name);
  for (const [label, value] of [["类别", row.type === 1 ? "搜索 ASIN" : "文字搜索词"], ["花费", meta.currency + " " + money(row.units)], ["花费占比", percent(row.units)], ["广告订单", String(row.orders)], ["广告订单占比", orderPercent(row.orders)]]) {
    const line = document.createElement("div"), l = document.createElement("span"), v = document.createElement("strong");
    line.className = "tip-row"; l.textContent = label; v.textContent = value; line.append(l, v); tip.appendChild(line);
  }
  tip.hidden = false; moveTip(x, y);
}
const svgNS = "http://www.w3.org/2000/svg";
function svgNode(name, attributes, label) {
  const node = document.createElementNS(svgNS, name);
  for (const [k, v] of Object.entries(attributes)) node.setAttribute(k, String(v));
  if (label !== undefined) node.textContent = label;
  return node;
}
function detailRate(g) { return g.clicks ? g.orders / g.clicks : null; }
function detailRateText(g) { const r = detailRate(g); return r === null ? "—" : (r * 100).toFixed(2) + "%"; }
function hideDetailTooltip() { detailTooltip.hidden = true; }
function showDetailTooltip(g, x, y) {
  detailTooltip.replaceChildren();
  const name = document.createElement("div"); name.className = "tip-name"; name.textContent = g.name; detailTooltip.appendChild(name);
  for (const [label, value] of [["花费", meta.currency + " " + money(g.units)], ["加权转化率", detailRateText(g)]]) {
    const line = document.createElement("div"), l = document.createElement("span"), v = document.createElement("strong");
    line.className = "tip-row"; l.textContent = label; v.textContent = value; line.append(l, v); detailTooltip.appendChild(line);
  }
  detailTooltip.hidden = false;
  const box = detailTooltip.getBoundingClientRect(), pad = 14;
  detailTooltip.style.left = Math.max(pad, Math.min(x + 14, innerWidth - box.width - pad)) + "px";
  detailTooltip.style.top = Math.max(pad, Math.min(y - box.height - 14, innerHeight - box.height - pad)) + "px";
}
function bindDetailTooltip(node, group) {
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", group.name + "，花费 " + meta.currency + " " + money(group.units) + "，加权转化率 " + detailRateText(group));
  node.addEventListener("pointerenter", e => showDetailTooltip(group, e.clientX, e.clientY));
  node.addEventListener("pointermove", e => showDetailTooltip(group, e.clientX, e.clientY));
  node.addEventListener("pointerleave", hideDetailTooltip);
  node.addEventListener("focus", () => { const b = node.getBoundingClientRect(); showDetailTooltip(group, b.left + b.width / 2, b.top + b.height / 2); });
  node.addEventListener("blur", hideDetailTooltip);
}
function drawDetailChart(groups) {
  detailChart.replaceChildren(); hideDetailTooltip();
  const width = Math.max(420, groups.length * 160 + 180), height = 440, m = { top: 30, right: 78, bottom: 130, left: 82 };
  const iw = width - m.left - m.right, ih = height - m.top - m.bottom;
  const spendTop = Math.max(1, ...groups.map(g => g.units / unit)) * 1.18;
  const rateTop = Math.max(.01, ...groups.map(g => detailRate(g) ?? 0)) * 1.18;
  const step = iw / groups.length, barWidth = Math.min(58, step * .55);
  const x = i => m.left + step * (i + .5), ys = v => m.top + ih - v / spendTop * ih, yr = v => m.top + ih - v / rateTop * ih;
  detailChart.setAttribute("viewBox", "0 0 " + width + " " + height); detailChart.style.minWidth = width + "px";
  for (let t = 0; t <= 4; t++) {
    const y = m.top + ih * t / 4;
    detailChart.appendChild(svgNode("line", { class: "grid-line", x1: m.left, y1: y, x2: m.left + iw, y2: y }));
    detailChart.appendChild(svgNode("text", { class: "chart-label", x: m.left - 10, y: y + 4, "text-anchor": "end" }, meta.currency + " " + money(Math.round(spendTop * (4 - t) / 4 * unit))));
    detailChart.appendChild(svgNode("text", { class: "chart-label", x: m.left + iw + 10, y: y + 4 }, (rateTop * (4 - t) / 4 * 100).toFixed(1) + "%"));
  }
  for (const [x1, y1, x2, y2] of [[m.left, m.top, m.left, m.top + ih], [m.left + iw, m.top, m.left + iw, m.top + ih], [m.left, m.top + ih, m.left + iw, m.top + ih]]) {
    detailChart.appendChild(svgNode("line", { class: "axis-line", x1, y1, x2, y2 }));
  }
  groups.forEach((g, i) => {
    const y = ys(g.units / unit), bar = svgNode("rect", { class: "spend-bar", x: x(i) - barWidth / 2, y, width: barWidth, height: Math.max(1, m.top + ih - y), rx: 3 });
    bindDetailTooltip(bar, g); detailChart.appendChild(bar);
  });
  let segment = [];
  const flush = () => { if (segment.length > 1) detailChart.appendChild(svgNode("path", { class: "rate-line", d: segment.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ") })); segment = []; };
  groups.forEach((g, i) => { const r = detailRate(g); if (r === null) flush(); else segment.push([x(i), yr(r)]); }); flush();
  groups.forEach((g, i) => {
    const r = detailRate(g); if (r === null) return;
    const point = svgNode("circle", { class: "rate-point", cx: x(i), cy: yr(r), r: 4.5 });
    const hit = svgNode("circle", { class: "point-hit", cx: x(i), cy: yr(r), r: 16 });
    bindDetailTooltip(hit, g); detailChart.append(point, hit);
  });
  groups.forEach((g, i) => {
    const tx = x(i), y = m.top + ih + 20, short = g.name.length > 20 ? g.name.slice(0, 19) + "…" : g.name;
    const label = svgNode("text", { class: "chart-label", x: tx, y, transform: "rotate(40 " + tx + " " + y + ")" }, short);
    label.appendChild(svgNode("title", {}, g.name)); detailChart.appendChild(label);
  });
}
function recommendation(g, groups, type) {
  const negative = type === 1 ? "否定投放" : "否定关键词";
  if (g.clicks === 0) return { kind: "check", title: "数据待核对", reason: g.orders ? "零点击却有广告订单；请核对源报告和归因回填。" : "当前没有点击，转化率无法计算；先核对报告记录。" };
  if (g.orders === 0 && g.clicks >= 20) return { kind: "pause", title: "暂停／活动级否定候选", reason: g.clicks + " 次点击尚无广告订单；先核对后续转化与归因窗口，再评估是否仅在本 Campaign 暂停或添加" + negative + "。" };
  if (g.orders === 0 && g.clicks >= 10) return { kind: "limit", title: "降低出价／限流", reason: g.clicks + " 次点击尚无广告订单；可谨慎降低本 Campaign 出价并继续观察。" };
  if (g.clicks < 20) return { kind: "test", title: "保留测试", reason: g.clicks + " 次点击，样本未达到 20 次；继续积累数据，暂不据此倾斜流量。" };
  const peers = groups.filter(x => x.profileId === g.profileId && x.clicks >= 20).sort((a, b) => (detailRate(b) ?? -1) - (detailRate(a) ?? -1));
  if (peers.length > 1 && peers[0] === g && detailRate(g) >= (detailRate(peers[1]) ?? 0) * 1.5 && detailRate(g) - (detailRate(peers[1]) ?? 0) >= .02) {
    return { kind: "push", title: "主推观察候选", reason: "同店铺内转化率领先；须先核对推广商品可比性，再决定是否倾斜流量。" };
  }
  return { kind: "test", title: "保留测试", reason: groups.filter(x => x.profileId === g.profileId).length === 1 ? "当前店铺只有一个 Campaign，缺少跨活动对照；维持测试并复核后续效果。" : "当前 Campaign 间的转化差异或样本量不足以支持明确倾斜；继续观察。" };
}
function renderDetailSuggestions(groups, type) {
  detailSuggestions.replaceChildren(); const buckets = new Map();
  for (const g of groups) {
    const advice = recommendation(g, groups, type), bucket = buckets.get(advice.kind) || { title: advice.title, items: [] };
    bucket.items.push({ g, advice }); buckets.set(advice.kind, bucket);
  }
  for (const kind of ["push", "test", "limit", "pause", "check"]) {
    const bucket = buckets.get(kind); if (!bucket) continue;
    const box = document.createElement("div"), badge = document.createElement("span");
    box.className = "detail-suggestion-group"; badge.className = "detail-badge " + kind; badge.textContent = bucket.title; box.appendChild(badge);
    for (const { g, advice } of bucket.items) {
      const p = document.createElement("p"), name = document.createElement("strong");
      p.className = "detail-suggestion-item"; name.textContent = g.name;
      p.append(name, document.createTextNode("：花费 " + meta.currency + " " + money(g.units) + "，转化率 " + detailRateText(g) + "。" + advice.reason));
      box.appendChild(p);
    }
    detailSuggestions.appendChild(box);
  }
  detailReminder.hidden = !buckets.has("pause");
}
function showDetails(item) {
  const groups = new Map();
  for (const row of currentRows) {
    if (key(row) !== item.key) continue;
    const groupKey = row.profileId + "|" + row.campaignId;
    const g = groups.get(groupKey) || { profileId: row.profileId, campaignId: row.campaignId, name: row.campaignName, date: row.date, namePresent: row.namePresent, units: 0, clicks: 0, orders: 0 };
    g.units += row.units; g.clicks += row.clicks; g.orders += row.orders;
    if (row.namePresent && (row.date > g.date || !g.namePresent)) { g.date = row.date; g.name = row.campaignName; g.namePresent = true; }
    groups.set(groupKey, g);
  }
  if (!groups.size) return;
  hideTip(); detailRows.replaceChildren();
  const entries = [...groups.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  for (const g of entries) {
    g.name = g.name + (shops.length > 1 ? " · " + shopNames.get(g.profileId) : "");
    const tr = document.createElement("tr");
    for (const value of [g.name, money(g.units), detailRateText(g)]) { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); }
    detailRows.appendChild(tr);
  }
  detailKicker.textContent = item.type === 1 ? "搜索 ASIN 的 Campaign 明细" : "搜索词的 Campaign 明细";
  detailSuggestionsTitle.textContent = item.type === 1 ? "当前搜索 ASIN 优化建议" : "当前搜索词优化建议";
  detailTitle.textContent = item.term;
  const selectedAsin = advertisedAsin.value.trim().toUpperCase();
  detailScope.textContent = dateStart.value + " 至 " + dateEnd.value + " · " + (shop.value ? shopNames.get(shop.value) : "全部店铺") + (selectedAsin ? " · ASIN " + selectedAsin : " · 全部 ASIN") + " · 按 Campaign 花费降序";
  drawDetailChart(entries); renderDetailSuggestions(entries, item.type);
  detailDialog.showModal(); detailDialog.scrollTop = 0;
}
function setScale(visible) {
  const highest = base ? Math.max(0, ...visible.map(r => r.units / base * 100)) : 0;
  const maxPercent = Math.max(2, Math.ceil(highest / 2) * 2), maxShare = maxPercent / 100;
  scale.replaceChildren();
  for (let i = 0; i <= 4; i++) {
    const mark = document.createElement("span");
    mark.textContent = (maxPercent * i / 4).toFixed(maxPercent % 4 === 0 ? 0 : 1) + "%";
    scale.appendChild(mark);
  }
  return maxShare;
}
function showInvalid(message) {
  if (detailDialog.open) detailDialog.close();
  currentRows = []; hideTip(); filterError.textContent = message; filterError.hidden = false;
  list.replaceChildren(); list.hidden = true; empty.hidden = false; empty.textContent = "请调整筛选条件后查看图表。";
  status.textContent = "筛选条件无效"; base = 0; orderBase = 0; scale.replaceChildren();
}
function render() {
  if (detailDialog.open) detailDialog.close(); hideTip();
  const start = dateStart.value, end = dateEnd.value, selectedAsin = advertisedAsin.value.trim().toUpperCase();
  orderSortAsc.setAttribute("aria-pressed", String(activeSort === "orders_asc"));
  orderSortDesc.setAttribute("aria-pressed", String(activeSort === "orders_desc"));
  if (!start || !end || start < meta.start || end > meta.end || start > end) return showInvalid("日期须位于 " + meta.start + " 至 " + meta.end + "，且开始日期不能晚于结束日期。");
  if (site.value !== meta.site || (shop.value && !shopNames.has(shop.value))) return showInvalid("当前离线数据仅包含 " + meta.site + " 站点已提取的店铺。");
  if (selectedAsin && !/^[A-Z0-9]{10}$/.test(selectedAsin)) return showInvalid("请输入完整的 10 位 ASIN；清空输入框可查看全部 ASIN 数据。");
  let campaignSet = null;
  if (selectedAsin) {
    campaignSet = new Set(asinCampaigns.filter(x => x.asin === selectedAsin && (!shop.value || x.profileId === shop.value)).map(x => x.profileId + "|" + x.campaignId));
    if (!campaignSet.size) return showInvalid("本次广告商品报告未找到 " + selectedAsin + " 在当前店铺范围内的关联 Campaign。");
  }
  filterError.hidden = true; filterError.textContent = "";
  currentRows = raw.filter(r => r.date >= start && r.date <= end && (!shop.value || r.profileId === shop.value) && (!campaignSet || campaignSet.has(r.profileId + "|" + r.campaignId)));
  const grouped = new Map();
  for (const r of currentRows) {
    const k = key(r), g = grouped.get(k) || { key: k, type: r.isAsin, units: 0, orders: 0, variants: new Map() };
    g.units += r.units; g.orders += r.orders; g.variants.set(r.query, (g.variants.get(r.query) || 0) + r.units); grouped.set(k, g);
  }
  const visible = [...grouped.values()];
  for (const g of visible) g.term = [...g.variants].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  base = visible.reduce((n, r) => n + r.units, 0); orderBase = visible.reduce((n, r) => n + r.orders, 0);
  const spendSort = (a, b) => b.units - a.units || a.key.localeCompare(b.key);
  visible.sort(activeSort === "orders_asc" ? (a, b) => a.orders - b.orders || spendSort(a, b) : activeSort === "orders_desc" ? (a, b) => b.orders - a.orders || spendSort(a, b) : spendSort);
  const maxShare = setScale(visible), fragment = document.createDocumentFragment();
  visible.forEach((row, index) => {
    const wrapper = document.createElement("div"); wrapper.setAttribute("role", "listitem");
    const item = document.createElement("button"); item.type = "button"; item.className = "bar-row bar-grid"; item.setAttribute("aria-haspopup", "dialog");
    item.setAttribute("aria-label", (index + 1) + "，" + row.term + "，" + (row.type === 1 ? "搜索 ASIN" : "文字搜索词") + "，花费 " + meta.currency + " " + money(row.units) + "，花费占比 " + percent(row.units) + "，广告订单占比 " + orderPercent(row.orders) + "；点击查看各 Campaign 的花费和转化率");
    const rank = document.createElement("span"); rank.className = "rank"; rank.textContent = String(index + 1);
    const term = document.createElement("span"); term.className = "term"; term.textContent = row.term; term.title = row.term;
    const track = document.createElement("div"); track.className = "track";
    if (row.units > 0 && base > 0) { const bar = document.createElement("div"); bar.className = "bar" + (row.type === 1 ? " asin" : ""); bar.style.width = Math.max(.15, row.units / base / maxShare * 100) + "%"; track.appendChild(bar); }
    const share = document.createElement("span"); share.className = "value"; share.textContent = percent(row.units);
    const spend = document.createElement("span"); spend.className = "spend"; spend.textContent = money(row.units);
    const orderShare = document.createElement("span"); orderShare.className = "order-share"; orderShare.textContent = orderPercent(row.orders);
    item.append(rank, term, track, share, spend, orderShare);
    item.addEventListener("pointerenter", e => showTip(row, e.clientX, e.clientY));
    item.addEventListener("pointermove", e => { if (!tip.hidden) moveTip(e.clientX, e.clientY); });
    item.addEventListener("pointerleave", hideTip);
    item.addEventListener("focus", () => { const b = item.getBoundingClientRect(); showTip(row, b.left + b.width / 2, b.top + b.height / 2); });
    item.addEventListener("blur", hideTip); item.addEventListener("click", () => showDetails(row));
    wrapper.appendChild(item); fragment.appendChild(wrapper);
  });
  list.replaceChildren(fragment); list.scrollTop = 0;
  status.replaceChildren();
  const count = document.createElement("strong"); count.textContent = String(visible.length);
  status.append(document.createTextNode("显示 "), count, document.createTextNode(" 条 · " + (selectedAsin ? "关联 Campaign 搜索词花费" : "站点 SP 搜索词花费") + " " + meta.currency + " " + money(base)));
  empty.hidden = visible.length !== 0; list.hidden = visible.length === 0; empty.textContent = "当前筛选范围内没有搜索词花费。";
  footnote.textContent = "来源：领星 MCP 的 SP 搜索词广告报告（" + meta.extractedAt + " 提取）。日期范围 " + start + " 至 " + end + "；花费占比以当前搜索词花费 " + meta.currency + " " + money(base) + " 为分母；广告订单占比以当前展示的文字搜索词及搜索 ASIN 广告订单 " + orderBase + " 单为分母，零订单时显示“—”。" + (selectedAsin ? "输入 ASIN " + selectedAsin + "：展示其关联 Campaign 的全部搜索词花费和订单；不同 ASIN 视图不可相加。" : "ASIN 留空：展示站点全部 SP 搜索词花费和订单。") + " 本看板仅含当前领星连接的 " + meta.site + " 站点、" + (shop.value ? shopNames.get(shop.value) : "全部已授权店铺") + "，历史商品关联采用本次商品报告快照；订单可能回填。";
}
for (const control of [dateStart, dateEnd, site, shop]) control.addEventListener("change", render);
advertisedAsin.addEventListener("input", render);
orderSortAsc.addEventListener("click", () => { activeSort = activeSort === "orders_asc" ? "desc" : "orders_asc"; render(); });
orderSortDesc.addEventListener("click", () => { activeSort = activeSort === "orders_desc" ? "desc" : "orders_desc"; render(); });
detailClose.addEventListener("click", () => detailDialog.close());
detailDialog.addEventListener("click", e => { if (e.target === detailDialog) detailDialog.close(); });
detailDialog.addEventListener("close", hideDetailTooltip);
detailDialog.querySelector(".detail-chart-scroll").addEventListener("scroll", hideDetailTooltip, { passive: true });
list.addEventListener("scroll", hideTip, { passive: true });
window.addEventListener("scroll", hideTip, { passive: true });
window.addEventListener("resize", hideTip, { passive: true });
render();
