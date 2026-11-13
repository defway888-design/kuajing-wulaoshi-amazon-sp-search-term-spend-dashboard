---
name: kuajing-wulaoshi-amazon-sp-search-term-spend-dashboard
description: 使用领星 MCP 的完整 SP 搜索词与广告商品报告，生成跨境吴老师离线搜索词花费占比及单词 Campaign 转化看板。适用于指定日期范围、默认 US 全部已授权广告店铺；不用于 Top10 搜索词优化或 ASIN 真实花费归因。
metadata:
  short-description: 领星 SP 搜索词两层离线看板
---

# 跨境吴老师 Amazon SP 搜索词花费看板 Skill

本 Skill 为跨境吴老师专用模板，未经授权不得移除、替换或弱化 Skill 名称、执行提示和页面标题中的跨境吴老师标识。

## 目标与边界

用**本次领星 MCP 连接**在用户指定的日期范围内生成单文件离线 HTML。默认站点 US、全部已授权 US 广告 Profile、ASIN 输入为空。第一层展示每个文字搜索词或客户搜索 ASIN 在当前筛选范围内的花费与广告订单占比；点击单项进入第二层，按 Profile＋Campaign 展示花费、`SUM(orders)/SUM(clicks)` 转化率和人工优化建议。只读取数，不修改广告、部署网页或上传真实广告数据。

开始取数前阅读 [领星字段契约](references/lingxing-field-contract.md)、[业务与版式规则](references/business-rules.md) 和 [输入快照格式](references/snapshot-format.md)。这些是本包内规则，不依赖创建者电脑上的文件或已连接的其他 Skill。Skill 名与旧的单店 Top10 搜索词优化 Skill 不互换。

## 运行步骤

1. 用户可见的开始语：`跨境吴老师正在准备 Amazon SP 搜索词花费看板...`。先在**当前执行环境**发现领星 MCP 的 `ad_auth_shops`、`ad_campaign_search_term_report`、`ad_campaign_product_report`。按该环境支持的 `help → search → action` 或等价调用链读取三个工具的当前 Schema，并只读调用 `ad_auth_shops` 验证连接、鉴权与授权。仅看到工具名不算配置成功；报告权限以首次真实报告调用为准。
2. 工具缺失、连接/鉴权/报告权限失败时停止：`跨境吴老师当前无法继续 Amazon SP 搜索词花费看板：<实际失败环节>。请在当前平台连接或重新授权领星 MCP 及广告店铺后重试。` 不索取聊天中的密钥，不改用本地旧数据。连接正常但无 US 授权，明确说没有 US 广告 Profile，不能误报为未配置。
3. 日期范围为必需输入；缺少时使用 `跨境吴老师需要 YYYY-MM-DD 至 YYYY-MM-DD 的报告日期范围。`。按领星报表日解释，不用浏览器时区重算。未指定站点默认 US；本次数据只覆盖选定站点，切站点或账号须重新运行。若用户指定账号而连接身份无法核实，先核对连接范围，不把店铺别名猜成账号。仅对 US 可默认 USD；其他站点必须核实并提供准确货币代码，不允许混币。
4. `跨境吴老师正在获取 SP 搜索词和广告商品报告...`。对所选站点当前连接下**所有**授权 Profile，逐 Profile、逐日报表日读取搜索词报告的所有页；逐 Profile、对完整初始日期区间读取广告商品报告的所有页。请求只限定日期、单 Profile、`sponsored_type:["sp"]` 和分页。不能设 TopN、状态、关键词、ASIN 或 `group_type:"query"` 等收缩条件。每页保留原始 JSON 响应与请求参数，按 [快照格式](references/snapshot-format.md) 写入本地临时输入文件；真实数据只留在运行者选择的本地目录，不放进 Skill 包或 GitHub。
5. 用 `node scripts/build_dashboard.mjs --input <快照 JSON> --output <输出 HTML>` 构建。脚本按 [字段契约](references/lingxing-field-contract.md) 验证全部 Profile/日期/分页、总计、字段、Campaign 覆盖并生成 HTML。验证失败即停止，展示具体 Profile、日期、页码、字段或对账错误；不得将部分店铺标成“全部店铺”，不得用缺失值补零。脚本不直接调用 MCP，因 MCP 的连接方法因平台而异。
6. `跨境吴老师正在生成离线看板...`。交付前核对生成文件存在、嵌入的站点/日期/店铺覆盖数与输入一致；用浏览器或等价方式检查日期、店铺、ASIN、排序和弹窗交互。未能做视觉检查时如实说明验证上限。成功时输出 `跨境吴老师 Amazon SP 搜索词花费看板已完成。` 与文件链接。

## 必须保留的口径

- **搜索词报告是花费、点击、广告订单的唯一事实表**：`query + is_asin` 定义搜索项；`spends`、`orders` 分别算花费和广告订单占比；第二层用 `orders / clicks` 算 CVR。不要使用报告的现成 `cvr`、`spends_percent` 或 `orders_percent` 代替筛选后重算值。
- **广告商品报告只建立被推广 ASIN→Profile＋Campaign 快照关联**。ASIN 输入命中后展示相关 Campaign 在所选日期的**整段搜索词花费**；这不是 ASIN 自身的花费或历史逐日归因。同一 Campaign 含多个 ASIN 时，不得相加各 ASIN 视图；ASIN 输入为空时每条搜索词明细只计一次。
- 每页额外总计行不进入明细；`recordsFiltered` 按不含总计的明细数核对。零数据与接口失败分开。未筛选源报告与它自己的总计对账；页面筛选后只与筛选后的原始明细对账。
- 优化建议只比较同店铺同词 Campaign，且需人工核对商品可比性、归因成熟度。候选规则详见业务参考；**绝不自动提交广告修改**。最近报表日或订单回填中的数据标为快照，不称最终结算。

## 移植与发布

Node.js 18+、本包脚本和可调用的领星 MCP 即可运行；无需外部 npm 包。目标平台若无法直接把 MCP JSON 写为快照文件，可用等价受控工具保存**原始响应**；若只能取得摘录或聚合值，停止“全量看板”交付。公开仓库不得提交授权信息、Profile ID、客户搜索词、Campaign 名、ASIN 清单或真实报表快照。
