# altium-mcp 文档索引

> 整理于 2026-11-12。正式文档为 `项目文档-Word/` 8 篇 Word（生成脚本 `scripts/gen-word-docs.cjs`，内容数据 `scripts/word-docs-content.cjs`，md 源按用途归档）。

## 项目文档-Word/（正式文档，Word 格式，v0.2.1 · 2026-11-12）

| 文件 | 内容 |
|------|------|
| 01-项目总览与快速上手.docx | 项目定位、三层架构、53 工具清单、快速上手、STAGE 0-4 工作流、状态与路线图 |
| 02-开发日志汇编.docx | week1 ~ week12 全量周报 + 夜间批次计划附录（2026-07-14 ~ 11-03，由 docs/devlog/ md 自动转换） |
| 03-开发问题与事故汇编.docx | 事故登记总表、关键事故详情（T5/B27-B28/requestId 等）、缺陷模式、pascal-gate 门禁、经验教训十条 |
| 04-内网部署指南.docx | 离线安装、OpenCode 工位挂载（vlmm_qwen）、工程准备、FAQ（DEPLOY.md 的 Word 版） |
| 05-使用说明书.docx | 工具域速查、STAGE 0-4 详解、edit_schematic 16 动作、记忆台账、错误处理 |
| 06-测试与质量报告.docx | 204 单测 21 文件分布、静态门禁、实机验证台账、质量护栏机制、覆盖缺口 |
| 07-EMC 审计功能说明.docx | emc_audit 12 规则全表与默认阈值、三判定维度、报告结构、配置与维护（规则表 V1.0） |
| 08-后续规划与待办.docx | v1.0-rc 待办、待用户决策 5 项、11-12 月里程碑、PCB 范围决策（2027 H1）、风险、EMC×AI 长期方向 |

## devlog/（开发日志 md 源）

week1 ~ week12 周报 + `overnight-20261102-plan.md`（夜间批次计划，含运行日志与待用户决策）+ `README.md`（周期索引）。Word 汇编见上 02 篇；日常流水见仓库根目录 `DEVLOG.md`。

## 技术资料/（技术资料 md）

### 说明书/
- 阶段一_全局架构与核心设计思路 / 阶段二_模块依赖与文件调用关系 / 阶段三_核心业务流程与工作原理

### 参考/
- altium-api-reference-scripts.md —— Altium API 参考摘要（脚本向）
- code-structure.md —— 代码结构与模块说明
- MCP可扩展操作列表.md —— 可扩展操作盘点
- MCP工作流协议.md —— 桥接工作流协议
- MCP工具测试提示词.md —— 工具测试提示词集

### 指南/
- memory-persistence-guide.md —— 记忆持久化
- opencode-deployment-guide.md —— OpenCode 部署
- 知识库扩展指南.md / 知识库入库提示词.md —— 知识库维护
- EMC规则阈值表-V1.0.md —— emc_audit 阈值配置（Word 版见 07 篇）
- edit-schematic-progress.md —— edit_schematic 操作进展

## 归档/（汇报材料与旧版总结）

### 交付物/
9 月五件套（docx+pdf）、7 月总结、8 月规划、`9月汇报材料/` 子目录（逐项材料）。历史生成脚本 `scripts/gen-deliverables.cjs` 的输出目录已同步指向此处。

### 历史/
Altium-MCP-项目开发日志总结报告.docx（8 月版）、10月项目阶段总结报告.md、9月/（进度分析与规划）。

## 其他

- `DEPLOY.md`（本目录根部）：内网部署指南 md 源（Word 版见 04 篇；部署打包流程引用该路径，勿移动）。
- 详版使用说明书：仓库根目录 `altium-mcp_使用说明书.html`（v0.2.0）。
