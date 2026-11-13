# 领星 MCP 字段契约（运行时必读）

本 Skill 的数据源只有三个只读工具。以下 `response` 指 MCP `action` 返回的 `content` 中 `type:"text"` 项解析成的 JSON；先检查外层 `success === true, code === 1`，报表还检查 `response.data.success === true, response.data.code === 1`。执行平台返回路径与此不同、字段改名或值类型无法无损解析时，停止并核验，不自动猜别名。

| 工具 | 必需请求 | 行路径 | 作用 |
| --- | --- | --- | --- |
| `ad_auth_shops` | `{}` | `response.data[*]` | 授权站点与 Profile 清单。 |
| `ad_campaign_search_term_report` | `report_date:"D - D"`, `profile_ids:[Profile ID]`, `sponsored_type:["sp"]`, `page`, `length≤200` | `response.data.data[*]` | 花费、点击、订单的唯一事实表。 |
| `ad_campaign_product_report` | `report_date:"起日 - 止日"`, `profile_id:Profile ID`, `sponsored_type:["sp"]`, `page`, `length≤1000` | `response.data.data[*]` | 被推广 ASIN→Campaign 快照关联。 |

两个报表均可传 `with_ring:false`。`report_date` 格式严格为 `YYYY-MM-DD - YYYY-MM-DD`；搜索词逐日报表日，商品报表为本次完整初始区间。调用前重新读取三个工具实际 `search` Schema。不得传 `group_type:"query"`、`query`、`asin`、`search_text`、`campaign_id`、`ad_group_id`、状态、数值阈值、投放方式或 TopN 过滤。报告 `profile_id` 参数是整数，授权列表返回值实测是十进制字符串：只在可无损转换为运行语言安全整数时转换；内部键一直用字符串。

## `ad_auth_shops` 的字段

| `response.data[*]` 字段 | 用途与异常 |
| --- | --- |
| `country` | 非空站点代码；默认选 `US`。同一 Profile 冲突站点则停止。 |
| `profile_id` | 非空、可无损解析的整数 ID；按 `(country, profile_id)` 去重，内部 Profile 键。不能用 `sid`、`store_id` 替代。 |
| `alias` | 仅显示店铺名称；空时显示 Profile ID；重复别名附 ID。不是归并键或账号身份。 |

“账号”是当前 MCP 连接的可验证授权范围。该店铺列表没有已核验的账号 ID，不能从 `alias` 推断账号；用户指定账号但连接身份无法核实时，先核对连接范围。无 US Profile 与 MCP 未配置是两种错误。

## 搜索词明细的字段及唯一操作

路径均为 `response.data.data[*].字段`，仅指**明细行**。

| 字段 | 校验 | 操作 |
| --- | --- | --- |
| `query` | 非空字符串，去首尾空白后非空 | 客户搜索内容。与 `is_asin` 构成第一层分组键；英文不区分大小写。同键多种原词形，取合计花费最高者显示，同额按固定字典序。这里的 ASIN 是**客户搜索 ASIN**。 |
| `is_asin` | 数值 `0` 或 `1` | `0` 文字搜索词，`1` 客户搜索 ASIN。也决定否定关键词/否定投放候选类型。 |
| `spends` | 非负十进制数值或十进制字符串，非空 | 第一层花费、花费占比分子和分母；第二层 Campaign 花费。按源精度定点十进制累加，展示时按货币精度舍入。 |
| `orders` | 非负整数或整数字符串 | 第一层广告订单占比分子和分母；第二层 CVR 分子和建议的订单门槛。不是买家去重订单。 |
| `clicks` | 非负整数或整数字符串 | 第二层 CVR 分母和建议点击量门槛；源总计对账。 |
| `campaign_id` | 非空、无损转换为字符串的 ID | 与**请求 Profile ID**组成稳定 Campaign 身份，用于第二层聚合和 ASIN 关联；不能按名称合并。 |
| `campaign_name` | 可空 | 显示；空时显示 ID。同 ID 跨日改名取所选日期范围最近报表日名称，同一 Profile＋日期＋ID 内有冲突名称则异常。 |
| `profile_id` | 非空时与请求 Profile 一致 | 可用已验证的单 Profile 请求上下文填缺失值，冲突则停止；不能从店铺名猜测。 |
| `sponsored_type`、`store_country` | 非空时分别为 `sp`、授权站点 | 与请求筛选交叉核验，冲突则停止。 |
| `record_id` | 明细非空，同 Profile＋报表日内唯一 | 页间重叠检查；同 ID 可在其他日期出现，不能跨日去重。 |

逐日日期只取单日 `report_date` 请求上下文，不用提取时间或浏览器日期。`cvr`、`orders_percent`、`spends_percent`、`ad_units`、`direct_orders`、`indirect_orders`、`keyword_text`、`targeting_text` 等**不参与看板公式**。CVR 必须重算 `SUM(orders)/SUM(clicks)`，不可平均源 `cvr`。

## 广告商品明细的字段及唯一操作

路径均为 `response.data.data[*].字段`，仅指**明细行**。

| 字段 | 校验 | 操作 |
| --- | --- | --- |
| `asin` | 非空 10 位字母数字，匹配前大写 | **被推广 ASIN** 输入的唯一匹配字段；不得用搜索词 `query` 代替。 |
| `campaign_id` | 非空、无损转字符串 | 与请求 Profile ID 组成 ASIN→Profile＋Campaign 集合。 |
| `ad_id` | 非空，同 Profile＋请求区间分页内唯一 | 页间重叠检查；同 Campaign 多条商品广告仅映射一次。 |
| `profile_id`、`sponsored_type`、`store_country` | 非空时与请求 Profile/SP/站点一致 | 交叉核验；冲突停止。 |
| `campaign_name` | 可空 | 辅助显示，不参与关联键。 |

商品行的 `spends`、`orders`、`clicks`、`cvr`、`spends_percent`、`orders_percent`、`ad_group_id` 均**不进入搜索词指标**。选 ASIN 时，把命中商品行去重为 Profile＋Campaign 集合，然后选这些 Campaign 在当前日期范围内的**全部搜索词明细**。未输 ASIN 时不展开商品关系，每条搜索词明细只计一次。商品报表日期参数不证明商品历史生效区间；页面仅显示快照关联的 Campaign 代理花费，不称 ASIN 自身花费或逐日归因。

## 每页总计与对账

实测报表每页 `length` 条明细之外另有一条重复总计。搜索词总计满足 `query,is_asin,campaign_id,record_id` 全为 `null`；商品总计满足 `asin,campaign_id,ad_id` 全为 `null`。仅同时符合这些特征才剔除；其他缺维度行是异常。`response.data.recordsFiltered` 实测为不含总计的明细数；对每个 Profile＋请求日期/区间，取第 1 页到 `ceil(recordsFiltered/length)` 页，零明细也要有第 1 页。每页计数、总计值须一致，明细 ID 不得重复；累计明细数须等于 `recordsFiltered`。零明细时允许空列表或全零总计；零明细但非零总计、计数缺失或分页不稳则停止。

搜索词报告**未加页面筛选**时，逐 Profile＋报表日把 `spends,clicks,orders` 明细和与本报表总计核对。商品报告的总计只用于自身核验。页面筛选后，只在筛选后的搜索词原始明细、第一层和第二层之间核对，不能拿未筛选源总计直接比较。每个有搜索词明细的 Profile＋Campaign 必须在该 Profile 的完整商品报表中有至少一条关联，否则 ASIN 输入覆盖不完整并停止。此覆盖检查不能证明历史每日商品归属。
