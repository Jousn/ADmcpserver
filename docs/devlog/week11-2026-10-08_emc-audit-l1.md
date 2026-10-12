# Altium Designer MCP 服务器开发日志

> 项目：altium-mcp
> 开发日期：2026-10-08
> 主题：EMC×AI 四层方案 L1 落地——emc_audit 确定性原理图 EMC 规则引擎（12 规则 + 37 单测）

---

## 背景

2026-09-30 完成 EMC×AI 调研与四层架构设计（L1 规则 / L2 RAG / L3 预测 / L4 优化），本次经用户确认后启动 L1。核心结论先于编码确定：**LLM 不做数值裁决**——规则判定全部由确定性代码完成（编译网表 + 元件参数 + 命名约定），LLM 只消费报告生成整改建议。这条纪律与 Delphi 脚本审查中"不编造 API 参数"同源。

市面对照（调研结论）：商业侧 Ansys SimAI / Cadence Sigrity Optimality 走仿真代理路线；Flux.ai AI Design Reviews 走 LLM 审查路线；开源侧无现成"EMC 专家系统"，KiCad+Python 自写规则是社区主流——L1 属于自建资产，无平替可抄。

## 交付内容

### 1. 数据层扩展（schematicAuditData.ts）

发现 Pascal 端 `GetSchematicData`（schematic_utils.pas:1770 附近）**本来就导出** components 桶的 `parameters` 对象（Name→Text，含 Value/Description/Comment），但 TS 侧 `fetchSchematicAuditData` 映射 QualityComponent 时把它丢掉了。本次扩展 `SchematicAuditData` 增加 `componentParameters: Record<designator, Record<name, text>>`，从原始 JSON 直通带出。`analyzeConnectivity` / `analyzeSchematicQuality` 等既有消费者不受影响（结构化类型增量字段）。

### 2. emc_audit 规则引擎（src/tools/emcAudit.ts，纯函数零副作用）

12 条 v1 规则，三个判定维度：**编译网表**（DM 层 pin_nets）、**元件参数**（Value/Description 关键词）、**命名约定**（NET_PATTERNS 正则，可配置）：

| 规则 | 类别 | 严重级 | 判定逻辑 |
|---|---|---|---|
| S001 AC 输入无共模电感 | conducted | warning | 有 L/N 网但无 FL 前缀或参数含 common mode/共模 的元件 |
| S002 L-N 无 X 电容 | conducted | warning | 无 C 两脚分接 L、N |
| S003 X 电容值超限 | conducted | info | 解析 Value > 2.2uF（可配） |
| S004 有 PE 无 Y 电容 | conducted | warning | 无 C 一脚 PE、一脚地/N |
| S005 Y 电容值偏大 | conducted | warning | >4.7nF（可配）；无法解析降级 info |
| S010 电源轨无去耦 | decoupling | warning | 含 IC 引脚的轨上无轨→地电容 |
| S011 轨缺高频小电容 | decoupling | info | 轨上仅 ≥0.47uF 大电容（可配） |
| S020 多地无桥接 | grounding | info | ≥2 个地网且无 0Ω/磁珠/Y 电容桥（隔离设计提示性，非错误） |
| S030 磁件无吸收 | switching | info | 变压器/功率电感网络对间无 R-C 串联/C 直跨/D 钳位；CM choke 与磁珠排除 |
| S031 栅极无串阻 | switching | info | 晶体管 G 脚网络上无任何 R |
| S032 晶振无负载电容 | interface | warning | 振荡网两测对地电容缺失；>1nF 疑似误放去耦单独提示 |
| S040 接口无 ESD 防护 | interface | info | 连接器信号网直达 IC 且无 TVS/对地 D/串阻/磁珠（上限 20 条防刷屏） |

容值解析支持 `100nF / 0.1uF/50V X7R / 4n7 / 103(EIA) / 47`；阻值支持 `10k / 0R / 4R7 / 1M`。电阻仅按 `600R@100MHz` 阻抗描述不判磁珠（保守，需 ferrite/bead/磁珠 关键词或 FB 前缀）。

报告结构延续台账纪律：`findings[]`（rule_id/category/severity/message/evidence/recommendation）+ **`checks_passed[]`（记录"查过且通过"的规则与摘要，不只报错）** + skip 说明进 notes。建议文本只引用通用实践（Ott 等），**不编造标准条款号**，数值限值提示"以目标标准为准"。阈值（X 2.2uF / Y 4.7nF / HF 0.47uF）与网络命名识别（NET_PATTERNS 导出常量）全部可配置，公司规范不同时改配置不改代码。

### 3. 工具注册

- `toolDefinitions.ts`：DESCRIPTION_EMC_AUDIT（与现有工具描述同风格）
- `index.ts`：`emc_audit` 工具，readOnlyLive 注解，复用 fetchSchematicAuditData（check_connectivity 的 DM 层 + get_schematic_data + 逐元件 get_component_info），跑 runEmcAudit 纯函数
- `mcpInstructions.ts`：新增 "EMC Rule Audit" 使用段（何时调用、助手职责边界、误报时改 NET_PATTERNS 而非弃用工具）

### 4. 测试

`tests/emcAudit.test.ts` 37 个用例：网分类 15 断言、容值/阻值解析、元件分类（含 Q 前缀被 MHz 值覆写为晶振的边界）、12 规则各自的触发/通过/跳过三分支、flyback 参考板整板报告、类别过滤、严重级过滤、规则目录、几何回退降级、严重级排序。

**全量 157/157 通过**（原 120 + 新 37），`tsc --noEmit` 零错误。

## 踩坑与修正（本次实录）

1. **S032 逻辑缺陷**（测试抓出）：>1nF 的振荡网电容先被"负载电容过滤器"排除导致该侧误报"缺失"，而非"疑似误放"。修正为：对地电容一律计存在，>1nF 单独出疑似提示——语义更准确。
2. **测试侧两个笔误**：runEmcAudit 选项误用 snake_case（`min_severity`，vitest/esbuild 不做类型检查所以静默失效）、S005 unparseable 分支的 evidence 字段名是 `designators`（数组）而非 `designator`。均修正。教训重申：**vitest 不查类型，选项名错误表现为"过滤不生效"而非报错**，tsc 必须单独跑。
3. S010/S011 pass 摘要原先用全部电源轨数量而非实际含 IC 轨数量，台账口径不准，已改为 checkedRails 计数。

## 待实测（本机无 Altium，未宣称成功）

- [ ] 实机调用 emc_audit 走完整桥接链路（compile_project → emc_audit），确认 componentParameters 从 Pascal parameters 桶到 TS 的实际键名（预计 Value/Description，以实测为准）
- [ ] 用公司真实图纸验证 12 条规则的误报率，据实调 NET_PATTERNS 与阈值
- [ ] 确认大图纸逐元件 get_component_info 的耗时可接受（复用现有审计链路，预计与 check_connectivity 同量级）

## 下一步（待用户定优先级）

1. L1 实测闭环（上表三项）
2. L2：EMC 整改案例库 RAG（内网 Qwen 已有向量库基础设施，知识库目录可加 emc 分类）
3. 规则扩展候选：RCD 吸收具体拓扑识别、接口网络分类细化、PCB 侧规则（回流地孔/跨分割）需 PCB 数据桥接支持
