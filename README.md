# 跨境吴老师 Amazon SP 搜索词花费看板 Skill

在领星 MCP 中读取完整的 Sponsored Products 搜索词和广告商品报告，生成可离线打开的两层 HTML 看板：先看搜索项花费与广告订单占比，再查看单个搜索项在各 Campaign 下的花费、转化率和优化建议。

## 适用场景

- 按指定日期范围分析某站点、某店铺或全部授权店铺的 SP 搜索词花费。
- 以输入的 ASIN 查看关联 Campaign 的完整搜索词花费。此视图是 Campaign 关联范围，**不是 ASIN 自身花费或逐日归因**。
- 不用于 Top10 关键词筛选、其他广告类型、自动修改广告或发布线上看板。

## 运行前准备

- 在运行 Skill 的 AI Agent 环境中配置并授权领星 MCP 的广告报表能力。Skill 会先检查实际连接和权限；无需在聊天中提供密钥。
- 提供报告日期范围，格式为 `YYYY-MM-DD 至 YYYY-MM-DD`。未指定站点时默认美国站点及其全部已授权广告店铺；ASIN 默认为空。
- 构建脚本需要 Node.js 18 或更新版本，不需要额外 npm 包。

## 首次安装

本仓库为公开仓库。无需向发布者提供 GitHub 用户名、接受仓库邀请或提供令牌。点击下方代码块的复制按钮，将整段指令发给支持安装 GitHub Skill 的 AI Agent：

```text
请从 https://github.com/defway888-design/kuajing-wulaoshi-amazon-sp-search-term-spend-dashboard 安装跨境吴老师 Amazon SP 搜索词花费看板 Skill。
```

安装后按所用平台的方式刷新或重新加载 Skill。若平台不支持直接安装 GitHub Skill，可将本仓库文件作为项目规则导入；执行入口仍为 `SKILL.md`，并须保留相对目录结构。

## 启动方式

```text
使用跨境吴老师 Amazon SP 搜索词花费看板 Skill，分析 2026-11-01 至 2026-11-10 的 SP 搜索词花费，生成离线看板。
```

也可以在指令中指定站点、店铺和 ASIN。更换账号或站点时需重新读取该连接下的报表。

## 执行结果与失败边界

成功后交付一个本地单文件 HTML：第一层按搜索词或客户搜索 ASIN 展示花费和广告订单占比；点击单项后，在第二层查看各店铺与 Campaign 的花费、转化率图和人工优化建议。首层可输入 ASIN、筛选日期与店铺，并在广告订单占比列标题处切换升序或降序。

领星 MCP 未配置、未授权、报告权限不足、分页/总计不完整或必需字段缺失时停止，不以旧数据、部分店铺或缺失值代替完整结果。

## 使用边界与安全

- 搜索词报告是花费、点击和广告订单的唯一事实表；广告商品报告仅用于建立被推广 ASIN 与 Campaign 的关联。
- 优化建议须人工核对商品可比性及订单归因回填情况，Skill 不提交广告更改。
- 不要把凭据、Profile ID、客户搜索词、Campaign 名、ASIN 清单、真实报表快照或生成的真实看板提交到本公开仓库。

## 仓库文件

- [`SKILL.md`](SKILL.md)：执行入口、前置检查与交付流程。
- [`agents/openai.yaml`](agents/openai.yaml)：支持该格式的平台所用的显示信息与启动提示。
- [`references/lingxing-field-contract.md`](references/lingxing-field-contract.md)：领星 MCP 字段、请求、分页和指标口径。
- [`references/business-rules.md`](references/business-rules.md)：两层看板的筛选、图表与优化建议规则。
- [`references/snapshot-format.md`](references/snapshot-format.md)：原始 MCP 响应的本地快照结构。
- [`scripts/build_dashboard.mjs`](scripts/build_dashboard.mjs)：校验快照并生成离线看板。
- [`assets/dashboard-template.html`](assets/dashboard-template.html)：离线页面模板。

## 版本更新记录

### v1.0.0｜2026-11-13（北京时间）

- 首次发布：完整 SP 搜索词读取契约、ASIN 与 Campaign 关联边界、两层离线 HTML 看板与异常停机规则。
- 影响范围：业务规则、执行脚本、页面交付及安装文档。
