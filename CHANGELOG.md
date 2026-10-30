# Changelog

## Unreleased — v1.0-rc 进行中（2026-10-27/28 夜间批次）

- **内网部署包 20261030**：`altium-mcp-intranet-20261030.zip`（6.65MB/3603 项，staging 独立自检 PASS：51 工具含 emc_audit、桥接 ping ok、serverInfo v0.2.0）。修复 serverInfo 版本号硬编码 0.1.0——现从 package.json 读取；kb-index.json 重建（内容不变，仅生成时间戳）。
- **编排层（`src/orchestration/`，新增，未接入工具注册表）**：`intents.ts` 确定性中文命令解析（放置/移动/旋转/网络标签/GND/VCC/文本/删除/元件查询/EMC 审计 10 类意图；无法识别返回 unknown，绝不猜测坐标与位号）；`planner.ts` 意图→工具调用计划展开，每条计划经 `editSchematicInputSchema` / `emcAuditInputSchema` 真实校验，不合格即丢弃并产出告警；`prompts.ts` LLM 规划提示词（20 个 action 白名单、只输出 JSON 数组、不确定输出空数组）与确定性兜底说明；`index.ts` 统一导出。
- **测试**：新增 `tests/orchestration.test.ts` 19 例（意图解析、schema 校验闭环、枚举一致性探针）；全量 176/176 通过（原基线 157 无回归）；`tsc --noEmit` 通过。
- **文档**：`altium-mcp_使用说明书.html` 更新至 v0.2.0（新增 4.11 EMC 审计节含 12 规则表；edit_schematic 操作表补齐 delete_object/get_component_info 等；错误表补页面定位/位号/库安装三行；新增脚本编译错误上报流程 bridge_user_reported_error.txt）；`docs/DEPLOY.md` 更新（版本头注、§1.1 离线拷贝清单、§3.1 内网 OpenCode 工位挂载与 vlmm_qwen .200:6006 对接及 function-calling 首日实测注意事项、§5 STAGE 4 emc_audit）。
- 后续（rc 前待办）：编排层接入 MCP 工具注册（`plan_edits` 工具或 instructions 集成）、真实产品演示、稳定性和性能优化。

## 0.2.0 (2026-10-25)

- `emc_audit` tool: deterministic schematic-side EMC rule engine (L1 of the EMC×AI plan) — 12 rules over the compiled netlist + component parameters (input filter completeness CM-choke/X-cap/Y-cap with value thresholds, IC rail decoupling, multi-ground bridging, magnetics snubbers, MOSFET gate series R, crystal load caps, connector ESD). Reports findings with evidence + checks_passed audit trail; thresholds and net-name recognition (NET_PATTERNS) configurable. 37 unit tests.
- `fetchSchematicAuditData` now carries `componentParameters` (designator → parameter map) from the Pascal `get_schematic_data` components bucket.

## 0.1.0

- Initial TypeScript MCP server (stdio) for Trae.
- Windows bridge: `request.json` / `response.json`, workspace lock, Altium `X2.EXE` launch line.
- Bundled DelphiScript project (MIT-derived from coffeenmusic/altium-mcp) plus `ping` command.
- Tools: status, configure executable, ping, PCB layers/rules/nets/stackup, designators, component pins, file-mode capability report.
- JSON Schema for bridge request/response under `schemas/`.
- Vitest unit tests for helpers.
