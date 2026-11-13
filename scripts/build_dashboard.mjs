#!/usr/bin/env node
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const pow10 = n => 10n ** BigInt(n);
function fail(message) { throw new Error(message); }
function need(test, message) { if (!test) fail(message); }
function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
function isObject(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function id(value, label) {
  if (typeof value === 'number') need(Number.isSafeInteger(value) && value >= 0, `${label}: ID 不是安全整数`);
  const s = String(value ?? '');
  need(/^\d+$/.test(s), `${label}: ID 缺失或不是十进制整数`);
  return BigInt(s).toString();
}
function opaqueId(value, label) {
  need(typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value)), `${label}: 标识类型错误`);
  const s = String(value).trim();
  need(s.length > 0, `${label}: 标识缺失`);
  return s;
}
function integer(value, label) {
  if (typeof value === 'number') need(Number.isSafeInteger(value) && value >= 0, `${label}: 非安全非负整数`);
  const s = String(value ?? '');
  need(/^(0|[1-9]\d*)$/.test(s), `${label}: 非负整数必需`);
  const n = Number(s);
  need(Number.isSafeInteger(n), `${label}: 超出安全整数范围`);
  return n;
}
function decimal(value, label) {
  if (typeof value === 'number') need(Number.isFinite(value) && value >= 0, `${label}: 非负有限金额必需`);
  const s = String(value ?? '');
  need(/^(0|[1-9]\d*)(?:\.\d+)?$/.test(s), `${label}: 非负十进制金额必需`);
  const [whole, fraction = ''] = s.split('.');
  need(fraction.length <= 12, `${label}: 金额精度超过可安全嵌入的 12 位`);
  return { n: BigInt(whole + fraction), scale: fraction.length };
}
function plus(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return { n: a.n * pow10(scale - a.scale) + b.n * pow10(scale - b.scale), scale };
}
function equalDecimal(a, b) { return a.n * pow10(Math.max(a.scale, b.scale) - a.scale) === b.n * pow10(Math.max(a.scale, b.scale) - b.scale); }
function safeNumber(big, label) { need(big <= MAX_SAFE, `${label}: 合计超出浏览器安全整数范围`); return Number(big); }
function dateIso(value, label) {
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${label}: 日期格式必须为 YYYY-MM-DD`);
  const d = new Date(`${value}T00:00:00Z`);
  need(!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value, `${label}: 日期无效`);
  return d;
}
function dateList(start, end) {
  const a = dateIso(start, 'dateStart'), b = dateIso(end, 'dateEnd');
  need(a <= b, '开始日期晚于结束日期');
  const result = [];
  for (let t = a.getTime(); t <= b.getTime(); t += 86400000) {
    need(result.length < 3660, '日期范围超过 3660 天；请缩短后分批生成');
    result.push(new Date(t).toISOString().slice(0, 10));
  }
  return result;
}
function responseJson(x, label, report) {
  need(isObject(x) && x.success === true && x.code === 1, `${label}: MCP 外层响应失败或结构变化`);
  if (report) need(isObject(x.data) && x.data.success === true && x.data.code === 1 && Array.isArray(x.data.data), `${label}: 报表响应失败或 data.data 非数组`);
  return x;
}
function reportParams(item, kind, label, expectedDate, profile) {
  need(isObject(item) && isObject(item.params), `${label}: 缺少 params`);
  const p = item.params;
  const allowed = new Set(['report_date', kind === 'search' ? 'profile_ids' : 'profile_id', 'sponsored_type', 'page', 'length', 'with_ring']);
  for (const key of Object.keys(p)) need(allowed.has(key), `${label}: 禁止的服务端筛选参数 ${key}`);
  need(p.report_date === expectedDate, `${label}: report_date 与快照范围不符`);
  if (kind === 'search') need(Array.isArray(p.profile_ids) && p.profile_ids.length === 1 && id(p.profile_ids[0], `${label}.profile_ids`) === profile, `${label}: 必须单 Profile 请求`);
  else need(id(p.profile_id, `${label}.profile_id`) === profile, `${label}: Profile 不符`);
  need(Array.isArray(p.sponsored_type) && p.sponsored_type.length === 1 && p.sponsored_type[0] === 'sp', `${label}: 必须限定 SP`);
  if (own(p, 'with_ring')) need(p.with_ring === false, `${label}: with_ring 必须为 false`);
  const page = integer(p.page, `${label}.page`), length = integer(p.length, `${label}.length`);
  need(page >= 1 && length >= 1 && length <= (kind === 'search' ? 200 : 1000), `${label}: 分页参数越界`);
  return { page, length };
}
function summaryRow(row, kind) {
  if (kind === 'search') return row.query === null && row.is_asin === null && row.campaign_id === null && row.record_id === null;
  return row.asin === null && row.campaign_id === null && row.ad_id === null;
}
function checkMarker(row, profile, site, label) {
  if (row.profile_id != null) need(id(row.profile_id, `${label}.profile_id`) === profile, `${label}: 行 Profile 与请求不符`);
  if (row.sponsored_type != null) need(row.sponsored_type === 'sp', `${label}: 行广告类型不是 SP`);
  if (row.store_country != null) need(String(row.store_country).toUpperCase() === site, `${label}: 行站点与授权 Profile 不符`);
}
function collectPages(items, kind, profile, dateRange, site) {
  need(items.length > 0, `${kind} Profile ${profile} ${dateRange}: 缺少第 1 页`);
  const byPage = new Map();
  let length = null, count = null, total = null;
  for (const item of items) {
    const label = `${kind} Profile ${profile} ${dateRange} 第 ${item?.params?.page ?? '?'} 页`;
    const p = reportParams(item, kind, label, dateRange, profile);
    need(!byPage.has(p.page), `${label}: 重复页`);
    if (length === null) length = p.length;
    need(length === p.length, `${label}: 同批次页长不一致`);
    const d = responseJson(item.response, label, true).data;
    const reported = integer(d.recordsFiltered, `${label}.recordsFiltered`);
    if (count === null) count = reported;
    need(count === reported, `${label}: recordsFiltered 在页间变化`);
    const summaries = d.data.filter(row => isObject(row) && summaryRow(row, kind));
    const details = d.data.filter(row => !summaryRow(row, kind));
    need(summaries.length === (count === 0 ? Math.min(d.data.length, 1) : 1), `${label}: 总计行数量异常`);
    if (summaries.length) {
      const s = summaries[0];
      const current = { spends: kind === 'search' || s.spends != null ? decimal(s.spends, `${label}.总计.spends`) : null, clicks: kind === 'search' || s.clicks != null ? integer(s.clicks, `${label}.总计.clicks`) : null, orders: kind === 'search' || s.orders != null ? integer(s.orders, `${label}.总计.orders`) : null };
      if (total === null) total = current;
      else need((total.spends === null && current.spends === null || total.spends !== null && current.spends !== null && equalDecimal(total.spends, current.spends)) && total.clicks === current.clicks && total.orders === current.orders, `${label}: 页间总计不一致`);
    }
    byPage.set(p.page, details);
  }
  const expectedPages = Math.max(1, Math.ceil(count / length));
  need(byPage.size === expectedPages, `${kind} Profile ${profile} ${dateRange}: 预期 ${expectedPages} 页，实际 ${byPage.size} 页`);
  const seen = new Set(), rows = [];
  let spendSum = { n: 0n, scale: 0 }, clickSum = 0, orderSum = 0;
  for (let page = 1; page <= expectedPages; page++) {
    const details = byPage.get(page);
    need(details, `${kind} Profile ${profile} ${dateRange}: 缺失第 ${page} 页`);
    const expected = Math.min(length, count - (page - 1) * length);
    need(details.length === expected, `${kind} Profile ${profile} ${dateRange} 第 ${page} 页: 明细应为 ${expected} 条，实际 ${details.length} 条`);
    for (let i = 0; i < details.length; i++) {
      const row = details[i], label = `${kind} Profile ${profile} ${dateRange} 第 ${page} 页第 ${i + 1} 条`;
      need(isObject(row), `${label}: 明细不是对象`);
      checkMarker(row, profile, site, label);
      const record = kind === 'search' ? row.record_id : row.ad_id;
      const key = opaqueId(record, `${label}.${kind === 'search' ? 'record_id' : 'ad_id'}`);
      need(!seen.has(key), `${label}: 明细 ID 重复 ${key}`);
      seen.add(key);
      if (kind === 'search') {
        const spends = decimal(row.spends, `${label}.spends`), clicks = integer(row.clicks, `${label}.clicks`), orders = integer(row.orders, `${label}.orders`);
        spendSum = plus(spendSum, spends); clickSum += clicks; orderSum += orders;
        need(Number.isSafeInteger(clickSum) && Number.isSafeInteger(orderSum), `${label}: 点击或订单合计溢出`);
        need(typeof row.query === 'string' && row.query.trim(), `${label}: query 缺失`);
        need(row.is_asin === 0 || row.is_asin === 1, `${label}: is_asin 只能为数字 0/1`);
        const campaignId = id(row.campaign_id, `${label}.campaign_id`);
        need(row.campaign_name == null || typeof row.campaign_name === 'string', `${label}: campaign_name 类型错误`);
        rows.push({ date: dateRange.slice(0, 10), profileId: profile, query: row.query.trim(), isAsin: row.is_asin, campaignId, campaignName: row.campaign_name?.trim() || campaignId, namePresent: Boolean(row.campaign_name?.trim()), spends, clicks, orders });
      } else {
        need(typeof row.asin === 'string' && /^[A-Z0-9]{10}$/.test(row.asin.trim().toUpperCase()), `${label}: asin 无效`);
        rows.push({ profileId: profile, asin: row.asin.trim().toUpperCase(), campaignId: id(row.campaign_id, `${label}.campaign_id`) });
      }
    }
  }
  need(rows.length === count, `${kind} Profile ${profile} ${dateRange}: 明细数对账失败`);
  if (count === 0) need(total === null || ((total.spends === null || total.spends.n === 0n) && (total.clicks === null || total.clicks === 0) && (total.orders === null || total.orders === 0)), `${kind} Profile ${profile} ${dateRange}: 零明细却有非零总计`);
  else if (kind === 'search') need(total && equalDecimal(total.spends, spendSum) && total.clicks === clickSum && total.orders === orderSum, `${kind} Profile ${profile} ${dateRange}: 明细与报表总计不一致`);
  return rows;
}
function buildPayload(snapshot) {
  need(isObject(snapshot) && snapshot.version === 1, '快照 version 必须为 1');
  need(typeof snapshot.site === 'string' && /^[A-Z]{2}$/.test(snapshot.site), '站点需为两位大写国家代码');
  const dates = dateList(snapshot.dateStart, snapshot.dateEnd);
  need(typeof snapshot.currency === 'string' && /^[A-Z]{3}$/.test(snapshot.currency), 'currency 必须为三位货币代码');
  if (snapshot.site === 'US') need(snapshot.currency === 'USD', 'US 站货币必须为 USD');
  need(typeof snapshot.extractedAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.extractedAt) && !Number.isNaN(Date.parse(snapshot.extractedAt)), 'extractedAt 必须包含时区的 ISO 时间');
  need(snapshot.accountLabel == null || typeof snapshot.accountLabel === 'string', 'accountLabel 必须是已核实的文本');
  const auth = responseJson(snapshot.shopsResponse, 'ad_auth_shops', false);
  need(Array.isArray(auth.data), 'ad_auth_shops 的 data 不是数组');
  const allIds = new Map(), shops = new Map();
  for (const row of auth.data) {
    need(isObject(row) && typeof row.country === 'string', '授权店铺缺少 country');
    const country = row.country.toUpperCase(), profileId = id(row.profile_id, '授权店铺 profile_id');
    if (allIds.has(profileId)) need(allIds.get(profileId) === country, `Profile ${profileId} 站点冲突`);
    allIds.set(profileId, country);
    if (country === snapshot.site) {
      if (!shops.has(profileId)) shops.set(profileId, { profileId, alias: typeof row.alias === 'string' && row.alias.trim() ? row.alias.trim() : `Profile ${profileId}` });
    }
  }
  need(shops.size > 0, `当前领星连接无 ${snapshot.site} 广告授权 Profile`);
  need(Array.isArray(snapshot.searchReports) && Array.isArray(snapshot.productReports), '缺少报表页数组');
  const searchGroups = new Map(), productGroups = new Map();
  for (const item of snapshot.searchReports) {
    const p = item?.params;
    need(isObject(p) && Array.isArray(p.profile_ids) && p.profile_ids.length === 1, '搜索词报表必须是单 Profile 请求');
    const profile = id(p.profile_ids[0], '搜索词报表 Profile');
    need(shops.has(profile), `搜索词报表含非当前站点 Profile ${profile}`);
    const date = String(p.report_date ?? '').match(/^(\d{4}-\d{2}-\d{2}) - \1$/)?.[1];
    need(date && dates.includes(date), `搜索词报表日期不在输入范围: ${p.report_date}`);
    const key = `${profile}|${date}`;
    if (!searchGroups.has(key)) searchGroups.set(key, []);
    searchGroups.get(key).push(item);
  }
  for (const item of snapshot.productReports) {
    const p = item?.params;
    need(isObject(p), '商品报表缺少 params');
    const profile = id(p.profile_id, '商品报表 Profile');
    need(shops.has(profile), `商品报表含非当前站点 Profile ${profile}`);
    if (!productGroups.has(profile)) productGroups.set(profile, []);
    productGroups.get(profile).push(item);
  }
  const search = [], products = [];
  for (const profile of shops.keys()) {
    for (const date of dates) search.push(...collectPages(searchGroups.get(`${profile}|${date}`) || [], 'search', profile, `${date} - ${date}`, snapshot.site));
    products.push(...collectPages(productGroups.get(profile) || [], 'product', profile, `${snapshot.dateStart} - ${snapshot.dateEnd}`, snapshot.site));
  }
  const productCampaigns = new Set(products.map(x => `${x.profileId}|${x.campaignId}`));
  for (const row of search) need(productCampaigns.has(`${row.profileId}|${row.campaignId}`), `Profile ${row.profileId} Campaign ${row.campaignId}: 搜索词有数据但商品报告无关联`);
  const names = new Map();
  for (const row of search) {
    if (!row.namePresent) continue;
    const key = `${row.profileId}|${row.date}|${row.campaignId}`;
    if (names.has(key)) need(names.get(key) === row.campaignName, `Profile ${row.profileId} ${row.date} Campaign ${row.campaignId}: 同日报表名称冲突`);
    names.set(key, row.campaignName);
  }
  const scale = search.reduce((n, row) => Math.max(n, row.spends.scale), 0);
  let totalUnits = 0;
  let totalClicks = 0, totalOrders = 0;
  const records = search.map(row => {
    const units = safeNumber(row.spends.n * pow10(scale - row.spends.scale), '单行花费');
    totalUnits += units;
    totalClicks += row.clicks; totalOrders += row.orders;
    need(Number.isSafeInteger(totalUnits), '搜索词总花费超出浏览器安全整数范围');
    need(Number.isSafeInteger(totalClicks) && Number.isSafeInteger(totalOrders), '搜索词点击或订单总数超出浏览器安全整数范围');
    const { spends, ...rest } = row;
    return { ...rest, units };
  });
  const pairMap = new Map();
  for (const row of products) pairMap.set(`${row.asin}|${row.profileId}|${row.campaignId}`, row);
  const aliases = new Map();
  for (const shop of shops.values()) aliases.set(shop.alias, (aliases.get(shop.alias) || 0) + 1);
  return {
    meta: { site: snapshot.site, currency: snapshot.currency, start: snapshot.dateStart, end: snapshot.dateEnd, extractedAt: snapshot.extractedAt, accountLabel: snapshot.accountLabel?.trim() || '', scale, shopCount: shops.size, source: '领星 MCP SP 搜索词广告报告' },
    shops: [...shops.values()].map(x => ({ ...x, label: aliases.get(x.alias) > 1 ? `${x.alias} · ${x.profileId}` : x.alias })),
    rows: records,
    asinCampaigns: [...pairMap.values()]
  };
}
async function main() {
  const args = process.argv.slice(2);
  need(args.length === 4 && args[0] === '--input' && args[2] === '--output', '用法: node scripts/build_dashboard.mjs --input <快照.json> --output <看板.html>');
  const inputPath = resolve(args[1]), outputPath = resolve(args[3]);
  need(inputPath !== outputPath, '输入和输出路径不能相同');
  const source = JSON.parse(await readFile(inputPath, 'utf8'));
  const payload = buildPayload(source);
  const template = await readFile(resolve(scriptDir, '../assets/dashboard-template.html'), 'utf8');
  need(template.includes('__EMBEDDED_DASHBOARD_JSON__'), 'HTML 模板缺少数据占位符');
  const embedded = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const html = template.replace('__EMBEDDED_DASHBOARD_JSON__', embedded);
  await mkdir(dirname(outputPath), { recursive: true });
  const temp = `${outputPath}.tmp-${process.pid}`;
  try { await writeFile(temp, html, 'utf8'); await rename(temp, outputPath); }
  catch (error) { await rm(temp, { force: true }).catch(() => {}); throw error; }
  console.log(JSON.stringify({ output: outputPath, site: payload.meta.site, dates: [payload.meta.start, payload.meta.end], shops: payload.meta.shopCount, searchRows: payload.rows.length, asinCampaigns: payload.asinCampaigns.length }));
}
main().catch(error => { console.error(`构建失败：${error.message}`); process.exitCode = 1; });
