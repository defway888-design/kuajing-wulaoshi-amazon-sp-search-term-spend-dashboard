# 构建输入快照格式（运行时必读）

`scripts/build_dashboard.mjs` 不调用 MCP。执行 Agent 先按字段契约完成真实只读调用，然后把**每一页的完整业务 JSON**写成一个 UTF-8 快照文件。不要把快照提交到公开 Skill 仓库。结构：

```json
{
  "version": 1,
  "site": "US",
  "currency": "USD",
  "dateStart": "YYYY-MM-DD",
  "dateEnd": "YYYY-MM-DD",
  "extractedAt": "ISO-8601 timestamp",
  "accountLabel": "可选；仅填写已核实的连接/账号名称",
  "shopsResponse": { "success": true, "code": 1, "data": [] },
  "searchReports": [
    { "params": { "report_date": "YYYY-MM-DD - YYYY-MM-DD", "profile_ids": [123456], "sponsored_type": ["sp"], "page": 1, "length": 200 }, "response": { "success": true, "code": 1, "data": { "success": true, "code": 1, "recordsFiltered": 0, "data": [] } } }
  ],
  "productReports": [
    { "params": { "report_date": "YYYY-MM-DD - YYYY-MM-DD", "profile_id": 123456, "sponsored_type": ["sp"], "page": 1, "length": 1000 }, "response": { "success": true, "code": 1, "data": { "success": true, "code": 1, "recordsFiltered": 0, "data": [] } } }
  ]
}
```

上述 `123456` 和空 `data` 只展示形状，**不是可用于生成的业务样本**。`shopsResponse`、每页 `response` 都是 MCP `action` 的 `content[type=text].text` 解析结果，保留完整 `data.data`、`recordsFiltered`、总计行及全部字段；不要仅抄选定的指标、不要把 CallToolResult 外层直接放入。`searchReports` 需覆盖每个已授权目标站点 Profile × 用户输入范围的每个报表日 × 全部分页；`productReports` 需覆盖每个 Profile 的完整初始区间 × 全部分页。页码从 1 连续，页长同一批次固定；零明细也要记录第 1 页的真实成功响应。

`accountLabel` 是可选显示值，不能用店铺别名猜测。US 的 `currency` 为 USD；其他站点需核实货币后填写。脚本生成的 HTML 仅嵌入验证后的必要展示字段，不嵌入 MCP 原始响应或授权信息。命令：

```text
node scripts/build_dashboard.mjs --input <本地快照.json> --output <本地看板.html>
```

该命令应从 Skill 根目录运行；`--output` 指向本次交付的本地 `.html` 文件，必须位于 Skill 包目录之外。构建成功后，脚本打印绝对 `output` 路径；运行者须打开并交付**该文件**，不可改交模板、旧的 CA 样例或 GitHub 源码。失败时非零退出，输出错误上下文，不生成“部分成功”的 HTML。
