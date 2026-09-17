# 开发日志 — 原理图预测性分析与布局优化

> 本文件为工作日志（随手记）。**正式周报在 `docs/devlog/week*-*.md`**（含格式化的背景/实现/Bug 表/里程碑/经验沉淀）。
> 本周期正式总结：`docs/devlog/week9-2026-09-12_to_2026-09-14.md`

## 2026-09-14 (下午) — 第一阶段工具：pin_table + validate_netlist

三阶段流水线（选型/网表 → 放置 → 连线）中连线阶段已闭环，本次补第一阶段：网表设计期的机器支持。
核心思想：网表是全链路单一事实源，写错传播到一切下游——在放置任何元件之前就机器验证它。

### 新增

1. **pin_table**（src/tools/pinTable.ts）：放置前的库引脚定义表——编号、名称、电气类型、朝向、
   引脚长度、推导的 hotspot_dx/dy（与 get_component_info 同一数学）。消除"规划连接关系靠记忆/翻数据手册"。
   重名符号（多库同名 lib_reference，几何可能不同）显式上报 also_in_libraries；引脚号去重（多部件符号重复行）。
2. **validate_netlist**（src/tools/validateNetlist.ts）：黄金网表机器校验，双模式——
   pin-tables 模式（默认，对照真实库引脚）：幻觉引脚 PIN_NOT_ON_COMPONENT（附可用引脚清单）、
   一脚两网 PIN_IN_MULTIPLE_NETS（构造性短路）、逐元件未分配引脚清单（整件遗忘即零分配）、
   电源引脚离电源网、电源网无电源引脚；syntax-only 模式（无库回退）：格式/声明/重复/命名规范。
   返回 frozen_netlist 作为下游 wire_pins / check_connectivity 的比对基准。

### 修复（测试中发现的既有 bug）

**get_library_symbol_reference 从未真正工作过**（index.ts 里的内存缓存兜底即为此而设）：
- 根因一：库文档上用 SchIterator_Create 枚举元件——它枚举的是"当前编辑中的元件"，恒为空。
  正确方法 SchLibIterator_Create（对照 OpenLib/libUtils.pas L166）。影响
  GetLibrarySymbolReference / SearchLibrarySymbol / ListLibraryComponents 共 6 处，全部修复。
- 根因二：Phase 1（聚焦库）抢跑——只要 AD 里恰好聚焦着一个 SchLib，就只枚举它、
  跳过全部工程库。改为工程库优先全量枚举，聚焦库仅作无工程库时的回退。
- 附带：解析库文档改用 GetSchDocumentByPath（焦点无关），OpenDocument kind 字符串三连尝试
  （SchLib/SCHLIB/SCH），pin_length_mils 导出，library_debug 调试字段。
- 修复后实机：611 元件 / 3 个库（此前 0 个）。

### 实测（output/smokeStage10.mjs）

- pin_table 5/5 匹配（Res1/Cap/LED0/SW-PB/Header 2），引脚几何与放置后回读一致（如 LED0 pin1"A" ori=180 len=200）。
- validate_netlist 黄金网表：ok=true，16/16 引脚全覆盖，仅 2 条良性警告（无源电源轨）。
- 故障注入 4/4 拦截：幻觉引脚 D1.9→PIN_NOT_ON_COMPONENT；一脚两网→PIN_IN_MULTIPLE_NETS；
  整件遗忘 R9→零分配清单；畸形引脚引用→PIN_MALFORMED（syntax 模式）。
- 单测 80/80，tsc 零错误。

### 提示词

mcpInstructions 绘图工作流改为三阶段结构：STAGE 1（知识库检索→pin_table→写网表→validate_netlist
冻结）→ STAGE 2（粗放元件）→ STAGE 3（wire_pins→电源对象→check_connectivity 分区比对冻结网表→
optimize_layout→重放标签）。

### 遗留

- 重名符号先到先得（Free Documents 的库先枚举）；放置时应带精确 sch_library_path 消歧
  （validate_netlist 的 note 已提示）。
- IntLib-only 符号仍不可见（需放置后回读），公司库体系调研（九月规划调研3）后考虑持久缓存。

## 2026-09-14 — 实机冒烟测试（AD22 + Sheet1.SchDoc LED 指示灯电路）

配置：X2.EXE = D:\app\AD22\X2.exe（config.json 原已就绪），测试靶 = PCB_Project 的 Sheet1.SchDoc
（8 元件 LED 指示灯，黄金网表 = led-indicator-circuit.yaml）。测试脚本在 output/smokeStage*.mjs。

### 测试结果

| 项 | 结果 |
|---|---|
| 脚本内容指纹同步 → AD 重载新 Pascal | PASS（draw_plan 空参数返回新错误码证明新代码生效） |
| T5 add_wire 端点吸附（故意偏移 +8mil） | PASS：snapped=[R1.1, R1.2]，points_csv 端点=引脚热点，拐点不动 |
| T6 place_gnd 吸附（偏移 (5,8)） | PASS：落点=(1100,200)=R1.1，回报 snapped_to |
| T7 wire_pins 逐网重连 5 网 | PASS：5/5 one_net=true 零浮空；编译网表与黄金网表按引脚成员一致 |
| T8 optimize_layout | PASS：47s，5 轮收敛，评分 210→91，交叉 0 拐点 0，网表分区等价 true |
| 终审 check_connectivity | errors=0 warnings=0，16/16 引脚连通 |

### 测试中发现并修复的问题

1. **open_document(PRJPCB) 无效**（既有 bug）：Client.OpenDocument 不会把工程加入工作区，
   Free Documents 下 DM_Compile 返回 0 物理文档 → check_connectivity DM 层空。
   修复：Altium_API.pas ExecuteOpenDocument 改用 WS.DM_OpenProject(path, true)
   （对照 OpenLib/libUtils.pas L721）。**注意：check_connectivity 权威模式需要真实工程打开**。
2. **跨网络引脚热点碰撞无守卫**：实测 Sheet1 上 SW1.2 与 R2.1 同在 (2500,500)（元件放置重叠），
   任何导线接到该点都会把两网短路（T7 首轮 GND∪KEY 合并即此因）。修复：wirePins.planWirePins
   与 optimizeLayout.planFullRewire 增加布线前碰撞检测，命中即抛错并建议挪元件（~300mil）。
3. 诊断辅助：schematic_utils.pas 两处 PROJECT_NOT_FOUND 现在附带枚举到的工程路径明细。

### 已知限制（记录，未修）

- **Pascal JSON 行解析器不处理 4 连反斜杠**：request.json 中路径若含双反斜杠实际值
  （JSON 文本 4 个 `\`），解析后反斜杠丢失 → 路径匹配失败。正常 MCP 客户端
  （JSON.stringify 单反斜杠实际值）不受影响；手写测试脚本注意转义层数。
- optimize_layout 重布线后旧网络标签/电源端口可能悬空或挂错网络（实测 GND 被 LED2 旧标签
  改名）：需要在优化后重放 net label / power port。模型工作流应包含此步。
- take_view_screenshot 在本机 AD22 返回 window_found:false（既有问题，未修）。
- Free Documents 模式下 DM 编译层不可用（几何回退层工作正常）。

## 2026-09-12 — P0 双修复：服务端端点吸附 + A*路由器/爬山法晋升为 MCP 工具

背景：AI 绘制原理图时"连接错误、布局难看"的根因分析结论——工具层把精确坐标算术交给了模型
（add_wire 无吸附，1 mil 误差即浮空；布线/布局寻优算法躺在 trash/test/ 未进工具面），提示词在
用大段 CRITICAL 规则补偿工具层缺失的容错。本次把几何职责全部收回工具端。

### 一、Pascal 端（altium-scripts/schematic_edit.pas）

1. **add_wire 服务端端点吸附**：折线首末点（电气端点）在容差内（默认 20 mil，参数
   snap_tolerance_mils，0 关闭，上限 50）吸附到最近引脚热点/电源端口；中间拐点永不吸附
   （防止拐点误触无关引脚造成短路）；非吸附点全部对齐 10 mil 栅格；零长段自动跳过；
   响应回报实际绘制坐标 points_csv + 每次吸附明细 snapped[]（含 from/to/target）。
2. **place_power_port / place_gnd / place_vcc 吸附**：端口位置吸附到最近引脚热点
   （默认 25 mil，上限 60），响应回报最终 x/y 与 snapped_to。
3. **draw_plan 批量动作**：一次桥接调用依次执行 transforms_csv（元件变换）→
   delete_wires_all（删全部导线+junction）→ wires_csv（多段折线，精确坐标不吸附）→
   junctions_csv。数组元素内部分号分隔（桥接行解析器会剥掉所有引号和逗号，逗号无法存活）。
4. 吸附目标收集 SchEditCollectSnapTargets：可见引脚热点（与 SchEditGetComponentInfo 同一数学，
   已对照 Connectivity.pas/Form_AlignPins.pas）+ 电源端口位置（ISch_Label 接口读 Location，
   schematic_utils.pas 已验证模式）。全部 API 用法有项目内生产先例，无臆造参数。

### 二、Node 端（src/tools/）

1. **schematicRouter.ts** — 从 trash/test/fixAndApply.mjs、optimizePlacement.mjs 提取的路由器核心：
   segRel 线段关系（none/cross/touch/overlap）、网络感知 Dijkstra（转向惩罚 80、障碍余量 700）、
   曼哈顿 MST、T 接 junction 检测、computeWireNets、partitionOf 电气等价签名。
   新增 chooseGrid 自适应网格（100/50/20/10 mil 取最大可整除者），解决原路由器
   "引脚不在 100 网格即抛 off-grid" 的死穴。
2. **wirePins.ts** — 新 MCP 工具 wire_pins(net_name, pins=["R1.2","D1.1",...])：
   模型只给拓扑；工具自己读引脚热点 → MST → A* 避障布线（异网导线/引脚为障碍，本网已布线可搭接）
   → 自动 junction → 单次 draw_plan 落地 → 复核"所有列出引脚落同一网络"。
   规划失败时零写入（画之前全在内存里算完）。
3. **optimizeLayout.ts** — 新 MCP 工具 optimize_layout：内存爬山（4 旋转 × ±100/200/300 mil
   平移，元件重叠约束，复用 analyzeSchematicQuality 估算器）→ draw_plan 应用变换 →
   重读真实引脚坐标 → 删全部导线按基线网表全图重布 → junction → 网表分区等价验证。
   重布规划失败自动回滚（恢复原变换+原导线+junction）；验证不过则明确报告 DO NOT SAVE。

### 三、提示词（mcpInstructions.ts / toolDefinitions.ts）

1. 绘图工作流改为：放元件 → R0 引脚覆盖表 → 逐网 wire_pins → 电源对象（自动吸附）→
   check_connectivity 硬门 → optimize_layout 收尾。
2. 删除"2 引脚符号默认水平"的错误断言（R2 与实战教训 YAML 矛盾；真实情况按符号各异），
   改为指向 get_library_symbol_reference 引脚朝向数据。
3. 显式声明坐标系约定：Y 轴向上、原点左下、旋转逆时针（此前未声明，模型按屏幕坐标系理解
   会上下颠倒）。
4. "1 mil 浮空"类对抗性约束降级为背景说明——容错已由工具端承接。

### 四、验证

- tsc 构建零错误；vitest 70/70 通过（新增 schematicRouter.test.ts 14 例 +
  wirePins.test.ts 6 例：segRel 分类、网格选择、避障绕行、同网搭接、包围盒无路报错、
  T 接 junction、网表分区、planWirePins 端到端纯函数测试）。
- 两处测试预期错误被路由器语义纠正：X 交叉是安全的（电气不连），40mil 不在网格线上的
  "盒子"挡不住路由——按网格对齐重构测试几何后符合预期。
- Pascal 端无法本地编译，全部改动仅使用项目内已有生产先例的 API 模式；
  **待 Altium 实机冒烟测试**：add_wire 吸附回报、draw_plan 全链路、wire_pins 端到端。

### 五、遗留

- net label 无吸附（place 时仍需精确坐标）——下一步可加。
- wire_pins 目前每次一网；多网批量入口（YAML 计划一次提交）待做。
- 爬山法可升级模拟退火/随机重启（原遗留项不变）。

日期：2026-09-04
目标：在保证电路功能（引脚连接）不变的前提下，实现原理图绘制的预测性分析与精细化（Phase 1 预测引擎 + Phase 2 布局优化）。

## 一、新建的代码文件

### MCP 源码（src/）

1. **[src/tools/analyzeSchematicQuality.ts](src/tools/analyzeSchematicQuality.ts)** — 预测性分析引擎（Phase 1 核心）
   - 新 MCP 工具 `analyze_schematic_quality` 的实现
   - 纯内存几何模拟，不改动 AD 文档：
     - 当前布局指标：异网交叉数、总拐点数、总线长、导线穿体次数、逐网络绕行比（实际线长 / 曼哈顿 MST）
     - 假想布局评估：传入 transforms（元件位置/旋转）后在沙箱中重新模拟引脚坐标，用同一模型估算评分，实现前后公平对比
     - 旋转建议：对每个元件尝试 0/90/180/270 四个角度，报告能改善评分的旋转（典型场景：电解电容转 180° 使正负极直连）
   - 关键函数：`analyzeSchematicQuality(input, { transforms, suggestRotations })`
   - 变换语义：绕元件原点旋转 + 平移，键名为 `x_mils / y_mils / rotation_deg`

2. **[src/tools/schematicAuditData.ts](src/tools/schematicAuditData.ts)** — 共享取数模块
   - 供 check_connectivity 与 analyze_schematic_quality 复用
   - 三层数据：DM 层编译网络（权威网络划分）、图纸几何（元件/导线/电源端口/网络标签/连接点）、逐元件引脚热点坐标
   - 修复记录：引脚数据从 `result.details.pins` 读取；Altium Y 轴向上导致导出高度为负，已用 `Math.abs()` 归一化

### 测试/执行脚本（tests/）

3. **[tests/fixAndApply.mjs](tests/fixAndApply.mjs)** — "先旋转、后审计、再连线"核心流程脚本
   - PHASE 0 恢复原图（快照回滚）
   - PHASE 1a 应用旋转方案（不动导线）→ 1b 重读引脚坐标审计 → 1c 生成导线重锚定方案 → 1d 删除错位线并重连
   - PHASE 2 电气等价性验证（网络划分必须与原电路一致）
   - 内置网络感知 A* 路由器（100-mil 网格）：Dijkstra + 转向惩罚，障碍物检测区分异网 overlap/touch/cross，避免异网导线共线重叠造成短路
   - 修复记录：`segRel` 共线但不相交的线段曾被误判为 touch 导致路由阻塞，已增加 collinear-disjoint 判断

4. **[tests/optimizePlacement.mjs](tests/optimizePlacement.mjs)** — Phase 2 布局优化脚本（爬山法）
   - PHASE 0 快照当前已验证图纸（恢复点）
   - PHASE 1 纯内存爬山搜索：候选邻居 = 4 个旋转 × 6 个平移增量（±100/200/300 mil），用估算器评分，含元件重叠约束
   - PHASE 2 应用最优变换（移动 + 旋转）
   - PHASE 3 删除全部导线，基于新引脚位置全图重布线（MST 分边 + A* 路由）
   - PHASE 4 同网 T 型接触点自动放置 junction
   - PHASE 5 电气等价性验证
   - 修复记录：变换参数键名错误（`x/y/rotation` 应为 `x_mils/y_mils/rotation_deg`）曾导致评估恒等于现状，已修正；路由搜索边界余量从 400 扩至 700 mil 解决 VCC 网络路由失败

5. **[tests/analyzeSchematicQuality.test.ts](tests/analyzeSchematicQuality.test.ts)** — 单元测试（评分器、变换模拟）

6. **[tests/unitRoute.test.mjs](tests/unitRoute.test.mjs)** — 路由算法单元测试（segRel 线段关系判断等）

7. **[tests/sheetQuality.mjs](tests/sheetQuality.mjs)** — 图纸质量评估脚本

8. **[tests/verifyQuality.mjs](tests/verifyQuality.mjs)** — 电气验证 + 质量复核脚本

9. **[tests/applyRotations.mjs](tests/applyRotations.mjs)** — 早期旋转方案应用脚本（被 fixAndApply.mjs 取代）

## 二、修改的既有文件

| 文件 | 修改内容 |
|---|---|
| [src/tools/checkConnectivity.ts](src/tools/checkConnectivity.ts) | 导出 `buildGeometricClusters`（几何网络聚类）供分析引擎复用 |
| [src/index.ts](src/index.ts) | 注册新工具 `analyze_schematic_quality` |
| [src/toolDefinitions.ts](src/toolDefinitions.ts) | 添加工具描述常量 `DESCRIPTION_ANALYZE_SCHEMATIC_QUALITY` |
| [src/mcpInstructions.ts](src/mcpInstructions.ts) | 使用指南中补充新工具说明 |

## 三、执行结果（2026-09-04）

1. **fixAndApply.mjs（Phase 1 落地）**
   - 旋转方案：Rb2→180°、Q2→90°、C1→180°、Q1→90°、Rc2→0°、Rc1→0°、LED2→0°、Rb1→90°、C2→0°
   - 重连导线 24 条，最终 73 条导线
   - 电气等价性验证通过（8 个网络划分与原电路完全一致），errors=0, warnings=0

2. **optimizePlacement.mjs（Phase 2 落地）**
   - 爬山法 12 轮迭代，估算评分 594 → 292（约降低 50%）
   - 调整了 Q1/Q2/Rb1/Rb2/LED1/LED2/Rc2 的位置与角度
   - 全图重布线 18 条导线，无需 junction
   - 电气等价性验证通过（网络划分与原电路完全一致），errors=0, warnings=0

## 四、工作流程结论

按用户确认的两步流程：
1. **判断怎么放置位置以及旋转角度** — 内存沙箱估算器 + 爬山法搜索最优变换，期间不碰 AD 文档
2. **保证对应的引脚连接成功** — 变换应用后重读实际引脚坐标，网络感知 A* 重布线，最后用网络划分比对做电气等价性验证，功能不变才认可结果

## 五、遗留事项

- 路由器目前固定 100-mil 网格，可增加自适应步长选项
- junction 的删除能力（重布线前清理旧连接点）待补充
- 爬山法可升级为模拟退火/多次随机重启以跳出局部最优
