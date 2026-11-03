# Changelog

## 0.2.1 (2026-11-03 夜间批次)

- **桥接可靠性**: lock.ts 业务异常不再被当锁竞争重放（真实错误直接向上传播）；响应轮询改"未就绪即重试"（防半写 response.json 假失败）；陈锁仅 ESRCH 判定删除（EPERM 视为活锁）；launchAltiumRunScript 挂 exit 退出码——坏 exe 路径快速报 ALT_LAUNCH_FAILED（原为 120s 超时死路径）。
- **requestId 协议**: 每条请求带自增关联 ID，Pascal 端原样回写；轮询校验不匹配视为 stale 继续等待——杜绝超时后旧响应串台成下一次调用的结果。
- **PCB 写修复**: add_via 坐标被 tenting 布尔载体覆盖（过孔永远落 (1,1)）与 add_text italic 载体覆盖 Y 坐标——载体改独立变量 + 坐标调用点重解析；RunOutputJobs 的 OpenDocument nil 先判空再 Focus（修必然 AV），GeneratedFiles 分支补 DisableDialog。
- **性能**: 新增 get_all_pin_hotspots 批量引脚热点命令——一次桥接往返取全图纸引脚表（实机验证 1738ms 全表 vs 旧路径单元件 1372ms），fetchSchematicAuditData 批量优先/失败回退；wire_pins / optimize_layout / 审计工具在大图上从分钟级压到秒级。
- **协议正确性**: pcb_edit(21)/pcb_component(14)/open_document(8)/zoom_view(6)/generate_report(5)/pcb_net_info(2) 六工具 schema 从自由 string 收紧为 z.enum（值全部从 Pascal 分发链核实）；pcb_net_info 注解改 MixedSelect（select 改选择态非只读）。
- **Token 经济**: 服务器 instructions 29,434→7,932 字符（-73%，删除与工具描述重复段，保留行为纪律）；库查询限流（limit 默认 50/上限 200 + total/truncated 标记 + 最小查询长度 2）。
- **编码（部分）**: request.json 改写 UTF-16LE+BOM——Pascal 自动识别 BOM，中文参数可安全进入 Altium（响应方向待 Pascal 侧方案，见仓库计划文件 T5 BLOCKED 节）；response/错误片段读取防御性剥离 BOM。
- **工程**: 新增 pascal-gate.cjs 静态门禁（B29 缺 then/JSON 未转义/ANSI 文件IO/PreProcess 无 try 四规则，gate:pascal 脚本）；serverInfo 版本号改读 package.json；kb-index 重建。
- 测试 176→204（+28：锁/快照/launch/请求编码/审计数据批量回退/门禁），全绿 + tsc 干净；实机验证 requestId 回带、批量热点与旧路径结果一致、桥接 smoke PASS。

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
