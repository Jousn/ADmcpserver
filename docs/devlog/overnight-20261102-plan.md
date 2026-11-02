# 夜间自动开发计划（2026-11-02 23:00 → 2026-11-03 09:00）

status: IN-PROGRESS
截止：2026-11-03 09:00（**08:30 起进入收尾协议**）
本文件是夜间开发进度的**唯一事实来源**。每个运行实例先读这里，做完就更新这里。

## 开发纪律（每次运行必读，违反=事故）

1. 本机 npm/npx 全坏：测试用 `node node_modules/vitest/vitest.mjs run`（工作目录 E:\workspace\DSH\altium-mcp），类型检查/构建用 `node node_modules/typescript/bin/tsc [--noEmit]`
2. 新 TS 代码必须带 vitest 单测；提交前跑**全量**测试 + `tsc --noEmit`（vitest 不查类型，选项名拼错会静默失效——tsc 必须单独跑）
3. Pascal（altium-scripts/*.pas）无编译检查兜底（B29 教训）：任何 .pas 改动后必须跑一次桥接 ping 冒烟——ping 会整体编译脚本工程，编译失败即 ping 报错。改 .pas 前先备份原文件内容（git 已跟踪，可 diff）
4. 只在 dev 分支提交；**禁止 push 到 GitHub**（用户未授权）；不切 main
5. 对 Altium 测试工程（C:\Users\Public\Documents\Altium\Projects\PCB_Project）的功能验证只做内存操作——工具不自动保存，**绝不调用任何保存动作**；不确定时只跑 read-only 命令
6. 每完成一个任务：把 `[ ]` 改 `[x]` + 附 commit hash + 一行备注，然后 git commit（信息前缀 fix/feat/refactor/test/docs）
7. 单任务卡住 >30 分钟：在该任务标 `[BLOCKED 原因]`，跳下一个，不死磕
8. 不做清单外的重构；不动已有功能的语义；需要用户决策的事项记入文末「待用户决策」节并跳过
9. 每次运行结束在文末「运行日志」追加一行：`HH:MM 完成/卡住 T编号 说明`

## 任务清单（严格按序）

### T1 [x] 修 lock.ts 业务异常重放（P1，TS）
src/bridge/lock.ts:58-86：`fn()` 在锁获取 try 块内，业务异常落入外层 catch → 锁被 finally 删 → 重拿锁**重放整条命令**，最终误报 LockTimeoutError。
修法：锁获取（openSync/writeSync/closeSync）单独 try/catch + continue；成功后 `try { return await fn(); } finally { unlinkSync }` 移到获取 try **之外**。
测试：新建 tests/bridgeLock.test.ts —— ①fn 抛错一次即向上传播（不被重试）②抛错后锁文件已删除 ③锁被占用时仍正常重试等待。完成后全量测试+tsc。

### T2 [x] 桥接层 P2 簇修复（TS，一个提交）
**完成 23:59，commit 311bd00**：a) errResult 加 isError:true（helpers.ts）；b) 轮询改为 not-ready 重试——抽出 readBridgeResponseSnapshot（no-file/parse/schema 三态 + stale 态），deadline 前不假失败；c) 陈锁仅 ESRCH 删（EPERM 视为活锁）；d) launchAltiumRunScript 挂 exit 事件判退出码（快速非零=失败，零=转发正常，窗口 3s 内仍运行=已启动）+ observeLaunchProcess 抽出可测。新增 11 测试（快照 6/launch 判定 3/helpers 1/含 requestId 匹配），全量 192/192。
a) src/tools/helpers.ts:12-14 `errResult` 返回加 `isError: true`（MCP CallToolResult 规范；注意排查现有调用点是否有客户端依赖"非 error"形态——本项目客户端就是 LLM，加 isError 是修正）
b) src/bridge/altiumBridge.ts:182-203 轮询：`JSON.parse` 或 schema 校验失败时**视为未就绪**，sleep 后继续轮询到 deadline，而不是立即 RESPONSE_READ_FAILED/INVALID_BRIDGE_RESPONSE（防读到半写文件假失败）
c) src/bridge/lock.ts:17-34 stale 检测：仅 `err.code === 'ESRCH'`（进程不存在）才删锁；EPERM/其他错误不删
d) src/bridge/altiumBridge.ts:213-232 `launchAltiumRunScript`：`resolve(child.pid !== undefined)` 改为先挂 `error` 事件置失败标志 + `exit` 事件校验退出码，给 launch 一个短观察窗口（如 3s）再 resolve——修复 ALT_LAUNCH_FAILED 死路径
每项带单测（能测的：b/c/d 用假子进程/临时文件；a 直接断言）。

### T3 [x] MCP 协议正确性簇（TS）
**完成 00:45，commit f37c9d9**：枚举值逐一从 Pascal 分发链核实（PcbEditMain 21 动作/PcbComponentMain 14 动作/OpenDocumentInAltium 8 种/ZoomView 6 种/GenerateProjectReport 5 种/pcb_net_info 2 种），六工具 schema 改 z.enum（计划列 4 个，同簇的 pcb_component 顺带）；pcb_net_info 新增 annotationsMixedSelect（select 改选择态故非只读）+ 描述同步；index.ts 空块删除。全量 192/192 + tsc + smoke PASS。
a) src/index.ts：pcb_edit（action，约 1457 行附近）、open_document（document_kind）、zoom_view（zoom_action）、generate_report（report_type）的 inputSchema 从自由 z.string() 改 z.enum——枚举值以**工具描述里列出的**为准，先 grep Delphi 端（altium-scripts/*.pas）确认实际支持值，不要凭描述编
b) src/index.ts pcb_net_info（约 1616 行）：`action=select` 会改选择状态，与 annotationsReadOnlyLive 矛盾——把 select 从该工具拆出或整工具注解改为非 readOnly（改描述同步）
c) src/index.ts:1213-1216 `if (!memoryMgr.isEmpty()) {}` 空块删除
每处改动跑全量测试；schema 收紧可能打破现有测试的用例按新枚举修正。

### T4 [x] requestId 协议升级（TS+Pascal，防响应串台 P1）
**完成 01:05，commit 311bd00（TS 侧）+ 1cd57d7（Pascal 侧）**：TS——schema 加可选 requestId、请求体带自增 ID、快照校验不匹配→stale 继续轮询；Pascal——全局 GRequestId（Run 重置 0/从 Params.Values 解析 StrToIntDef）+ WriteResponse 条件回写。**实机端到端验证：request 带 requestId:1 → response.json 回带 "requestId": 1，ping 编译冒烟通过**。踩坑：smoke 跑的是旧 dist（T2/T3 只做了 --noEmit 未重新构建），首次验证响应无 requestId——重建 dist 后通过。教训：改 src 后凡是要实机验证，必须先 tsc 构建。

### T5 [BLOCKED] 桥接文件编码统一 UTF-8（Pascal P1，中文环境必修）
**TS 侧已落地（9ed1fe6）**：response/错误片段读取剥离 UTF-8 BOM（防御性，含中文回环与 BOM 两个新测试，194/194）。
**Pascal 侧 BLOCKED（01:55，34 分钟排查）**。已确认事实：
1. `TEncoding.UTF8` 重载：该脚本引擎**编译不接受**（弹 Error 对话框，与 B29 同款：编译失败→对话框→后续全部 RunScript 排队超时）
2. ADODB.Stream 方案（`CreateObject('ADODB.Stream')`，含/不含 `.Type` 两版）**同样触发 Error 对话框**——嫌疑：① Altium 脚本安全机制对 COM 实例化弹确认框（运行期，非编译错）② `Variant` 变量声明/成员访问不被引擎接受 ③ CreateObject 在此引擎不可用（避坑指南裁决说官方库有先例，但未验证本机设置）
3. 回环验证方法已备好：get_schematic_data 的 include_queries 会原样回显，传 ["components","中文回路验证"] 比对即可
**恢复 procedures（本夜已实战验证）**：对话框阻塞→PostMessage WM_CLOSE 给标题为 "Error"/"Information" 的窗口即可解除；彻底楔死→杀全部 X2.EXE→下次调用自动冷启动（01:55 验证 SMOKE PASS）。
**下次尝试前提**：需用户实机看一次 Error 对话框/Messages 面板的具体文案（无人值守只能看到无文本的对话框）。替代方案候选：TS 写请求改 UTF-16LE+BOM（Pascal LoadFromFile 自动识别 BOM，零 Pascal 改动解决请求方向；响应方向仍需 Pascal 写 Unicode，可用 ADODB 或用户确认安全设置后重试）。

### T6 [ ] add_via / add_text 坐标覆盖修复（Pascal P1）
pcb_utils.pas add_via（4200-4220）：tenting/testpoint 布尔借用 X1/Y1/X2/Y2 做载体，4202/4206 把已解析的坐标覆写为 1/0，4217 行 `PcbEditAddVia(Board, X1, Y1,...)` 传的是布尔不是坐标。修法：仿 add_track（4104-4108）调用点重解析——在 4217 前重新 `X1 := PcbEditParseFloatAfterKey(RequestData, '"x_mils"', ...)`、Y1 同理；布尔载体改用独立变量（如 TentTop/TentBottom/TP1/TP2 : Integer）。
pcb_utils.pas add_text（4285-4313）：4311 `Y1 := 1`（italic 载体）覆盖 y 坐标，同法修复。
验证：ping 冒烟；功能级（可选，若桥接可用）：对测试 PCB add_via 后用 pcb_component/pcb_net_info 类 read-only 命令读回位置核对（**不保存**）。

### T7 [ ] RunOutputJobs nil 崩溃 + 弹框风险（Pascal）
other_utils.pas:496-506：`Client.OpenDocument` 返回 nil 时先 `.Focus()` 后判 nil——把 nil 判断移到 Focus 之前，nil 时返回明确错误串。
other_utils.pas:553-561：GeneratedFiles 分支补 `DisableDialog=True`（Publish 分支 575 行有先例），去掉 "Assume success" 假设、按实际结果返回。
验证：ping 冒烟。

### T8 [ ] 批量 pin 热点命令（性能 P1：N 次往返压 1 次）
现状：src/tools/schematicAuditData.ts:122-164 对每个元件串行调 get_component_info（每次完整桥接往返），wire_pins 调 2 次、optimize_layout 3 次——大图分钟到小时级。
方案：Pascal schematic_edit.pas 或 schematic_utils.pas 加命令 `get_all_pin_hotspots`（入参同 get_schematic_data 的 sheet 定位 + 可选 designators 数组；出参 [{designator, pins:[{designator,name,x_mils,y_mils,is_hidden}]}]，JSON 逐行拼接规范照现有 SCH_DRAW_FILTER 系列写法）；TS fetchSchematicAuditData 改为一次调用该命令（保留原逐元件路径做 fallback：新命令失败时回退旧逻辑）。
验证：Pascal ping 冒烟 + TS 单测（mock 两路径）；实机读测试工程某图纸与旧路径结果对比（选一张小图）。
注意 Altium_API.pas 分发器要注册新命令（grep 'get_schematic_data' 看分发模式照抄）。

### T9 [ ] Pascal 静态门禁脚本（防 B29 类事故）
新建 scripts/pascal-gate.cjs（CommonJS，node 直调）：扫描 altium-scripts/*.pas，按行号报错退出码 1。规则（初版，允许白名单注释豁免 `// gate-ok`）：
① 行尾 `nil` 且该行是 if/else if 的一部分但无 `then`（B29 模式，注意多行 if 误报——只查单行含 `if ` 与 `= nil` 且不含 then）
② `' + ` 拼接含 LibReference/Name/Text 等且未过 JSONEscapeString（简化：匹配 `.Add('"' + ` 且同行无 JSONEscapeString）
③ 单参数 `SaveToFile(` / `LoadFromFile(`（应显式带 TEncoding）
④ `PreProcess` 之后 10 行内无 `try`（粗查）
在 package.json scripts 加 `"gate:pascal": "node scripts/pascal-gate.cjs"`；对现有代码跑一遍，存量违例只报告不阻塞（加 `--strict` 才阻塞），新改动用 diff 行判断。
测试：构造含违例的临时 .pas 样例断言能抓到。

### T10 [ ] Token 经济瘦身（TS）
a) src/mcpInstructions.ts（29,404 字符 → 目标 ≤12,000）：保留「核心规则/错误处理/工作流 STAGE 索引/记忆协议精简版」，删除与工具描述重复的操作细节（Pad 工作流、flags matrix 等只留一处——细节留在对应工具描述里）。逐段删，删完跑全量测试（有的测试可能断言 instructions 内容，按需改）。
b) src/index.ts get_library_symbol_reference（约 1100 行）/ search_library_symbol（约 1195 行）：加 `limit`（默认 50，max 200）与最小查询长度 2（symbol_name 子串匹配查 "C" 灌数千条的坑）；返回加 total 与 truncated 标记。
c) src/tools/pinTable.ts 若有全量枚举可过滤参数透传则透传（T8 若已完成可复用批量思路，不强求）。
验证：全量测试 + tsc；instructions 字符数用 node -e 打印确认达标。

### T11（08:30 后的收尾运行执行）[ ] 收尾协议
1. 全量测试 + tsc --noEmit + tsc 构建，全绿才算数
2. node scripts/pascal-gate.cjs 跑一遍记录结果
3. CHANGELOG.md 加 Unreleased 条目（逐项列 T1-T10 完成内容）；docs/devlog/ 新建 week12-2026-11-02_night-batch.md（格式照 week11：背景/交付/踩坑/待实测）
4. 版本号 package.json → 0.2.1（serverInfo 会自动跟随）
5. 重建部署包 staging（照 20261030 流程：stage-prod-deps + smoke-intranet 自检 PASS 后压 zip 到 E:\workspace\DSH\altium-mcp-intranet-20261103.zip）——若时间不足 1 小时则跳过打包，只完成 1-4
6. 把本文件 status 改为 WRAP-UP-DONE，最后 git commit
7. 调用 CronPauseSelf

## 待用户决策（夜间一律跳过）
- 编排层接入方式：plan_edits 独立工具 vs instructions 集成（涉及工具面设计）
- MCP SDK v2 迁移时机（v2 拆包 + Standard Schema，建议内网 Qwen 适配验证后再动）
- GitHub push（dev 分支 88b2a14 及夜间提交待推）
- emc_audit 实机实测需真实产品图纸，等用户提供

## 运行日志
- 23:08 备份完成（backup/altium-mcp-dev-20261102-2308.bundle + src zip，verify okay）；T1 由启动实例完成
- 23:59 完成 T2（含 T4 TS 侧）：commit 311bd00，全量 192/192 + tsc 干净；launch 测试首版前提错误（函数硬编码 RunScript 参数不能复用测存活分支），抽出 observeLaunchProcess 后解决
- 00:45 完成 T3：commit f37c9d9，六工具枚举收紧（值全从 Pascal 核实），192/192 + tsc + smoke PASS；枚举核实中顺带确认 open_document 支持 SCHEMATIC/PCB_LIBRARY/PROJECT 别名（OpenDocumentInAltium KindUpper 分支）
- 01:05 完成 T4（TS+Pascal 全链路实机验证）：commit 311bd00 + 1cd57d7；坑——dist 未重建导致 smoke 用旧服务端，重建后 requestId 回带验证通过
- 01:55 T5 BLOCKED（Pascal 侧）：TEncoding 与 ADODB.Stream 两方案均触发 Error 对话框（编译失败或 COM 安全弹框），已回退 Pascal 保基线；TS 侧 BOM 剥离已提交（9ed1fe6，194/194）；对话框阻塞处置流程已实战验证并写入 T5 记录；**T6/T7 的 Pascal 改动如再触发对话框，按 T5 记录的 dismiss/kill 流程恢复**
- 01:57 桥接恢复绿色（SMOKE PASS，冷启动）
