// word-docs-content.cjs — 项目文档-Word 系列内容（01/03/04/05/06/07/08）
// 素材来源：CHANGELOG.md、DEVLOG.md、docs/devlog/ 周报、docs/DEPLOY.md、
//           docs/指南/EMC规则阈值表-V1.0.md、docs/历史/10月项目阶段总结报告.md、
//           2026-11-12 全量测试实跑（21 文件 204 例）、dist 注册工具实测（53 个）。
'use strict';

const {
  p, h1, h2, h3, h4, bullet, numItem, quote, codeBlock, makeTable, numberer,
} = require('./word-docs-lib.cjs');

const DOC_DATE = '2026-11-12';
const VERSION = 'v0.2.1';

// =====================================================================
// 01 项目总览与快速上手
// =====================================================================
function build01() {
  const children = [];

  children.push(h1('1 项目定位'));
  children.push(p('altium-mcp 是一套 **MCP 服务器（stdio 协议）+ Altium Designer DelphiScript 桥接**，让 MCP 客户端（OpenCode / Claude Desktop / 任意 stdio 客户端 / 内网 AI 网关）通过自然语言操控 Altium Designer：自动绘制原理图、机器审计、EMC 规则审查与 PCB 辅助操作。'));
  children.push(p(`当前版本 **${VERSION}**（2026-11-03 夜间批次），注册 MCP 工具 **53 个**（dist 注册实测），单元测试 **204 例全绿**（21 个测试文件），完全离线运行，无任何外网依赖。`));
  children.push(h2('1.1 核心设计纪律'));
  children.push(bullet('**确定性优先**——规则判定、坐标计算、网络连通性裁决全部由确定性代码完成；AI 只做规划与解释，不做数值裁决。'));
  children.push(bullet('**写后读回验证**——所有写操作强制独立读回验证，不信任 success:true。'));
  children.push(bullet('**网表单一事实源**——validate_netlist 冻结黄金网表，wire_pins / check_connectivity 均与之比对；漏网、错网直接报错。'));
  children.push(bullet('**不编造 API 参数**——DelphiScript 侧所有 API 用法必须有项目内生产先例或官方参考库依据。'));

  children.push(h1('2 系统架构'));
  children.push(makeTable(
    ['层', '实现', '职责'],
    [
      ['MCP 服务器（Node.js）', 'dist/index.js，stdio 传输', '工具注册、schema 校验、路由/布局算法、知识库与记忆、审计规则引擎'],
      ['文件桥接层', 'request.json / response.json + workspace 文件锁 + requestId 协议', '进程间通信；每条请求 UTF-16LE+BOM 编码（中文参数安全进入 AD）'],
      ['Altium DelphiScript', 'X2.EXE 启动的脚本工程（altium-scripts/）', 'AD 对象操作：放置/变换/布线/编译/PCB；首次调用自动同步到 workspace'],
    ],
  ));

  children.push(h1('3 工具清单（53 个，按域分组）'));
  children.push(makeTable(
    ['工具域', '数量', '工具'],
    [
      ['状态与连接', '3', 'get_server_status · configure_altium_exe · altium_ping'],
      ['原理图读取', '5', 'get_schematic_data · get_all_designators · get_component_pins · get_all_pin_hotspots · get_workspace_projects'],
      ['审计与验证', '5', 'check_connectivity · analyze_schematic_quality · emc_audit · validate_netlist · compile_project'],
      ['规划辅助', '3', 'pin_table · design_ledger · list_module_templates'],
      ['原理图写入', '4', 'instantiate_module · edit_schematic · wire_pins · optimize_layout'],
      ['库与记忆', '6', 'get_library_symbol_reference · search_library_symbol · import_library_components · refresh_memory_cache · get_memory_status · get_knowledge_base_stats'],
      ['知识库检索', '1', 'search_knowledge_base'],
      ['视图与文档', '4', 'open_document · zoom_view · take_view_screenshot · file_mode_capabilities'],
      ['PCB 读取', '10', 'get_pcb_layers · get_pcb_rules · get_all_nets · get_pcb_layer_stackup · get_selected_components · pcb_component · pcb_drc · pcb_board_info · pcb_polygon_info · pcb_net_info'],
      ['PCB 写入', '7', 'set_component_position · move_components · create_net_class · set_pcb_layer_visibility · pcb_edit · layout_duplicator · layout_duplicator_apply'],
      ['输出与报告', '4', 'get_output_job_containers · run_output_jobs · overlap_report · generate_report'],
      ['符号创建', '1', 'create_schematic_symbol'],
    ],
  ));
  children.push(p('注：分组为便于查阅的口径划分，以 dist/index.js 注册总数 53 为准（2026-11-12 实测）。', { size: 18, color: '666666' }));

  children.push(h1('4 快速上手'));
  children.push(h2('4.1 环境要求'));
  children.push(makeTable(
    ['项', '要求'],
    [
      ['操作系统', 'Windows 10 / 11'],
      ['Altium Designer', 'AD22 实测（脚本走标准 API，AD19+ 大概率兼容）'],
      ['Node.js', '≥ 20（唯一外部依赖；内网可离线安装）'],
      ['外网', '不需要——完全离线运行'],
    ],
  ));
  children.push(h2('4.2 安装（内网）'));
  const n01 = numberer();
  children.push(n01('解压部署包（如 altium-mcp-intranet-20261103-final.zip）到无中文无空格目录，如 D:\\tools\\altium-mcp。'));
  children.push(n01('安装 Node.js ≥ 20（离线安装包）。'));
  children.push(n01('创建 C:\\Users\\<用户>\\.altium-mcp\\config.json：altiumExePath 指向 X2.EXE 完整路径，workspaceRoot 为桥接工作目录（可省略，默认 ~/.altium-mcp/workspace）。路径反斜杠双写 \\\\。'));
  children.push(n01('MCP 客户端挂载（OpenCode / Claude Desktop，详见 04 部署指南）。'));
  children.push(n01('自检：node scripts\\smoke-intranet.mjs，预期 ping: ok 与工具清单数量。'));
  children.push(h2('4.3 工程前提（重要）'));
  children.push(bullet('目标工程（.PrjPcb）必须处于打开状态——Free Documents 下编译结果为空，check_connectivity 权威验证不可用。'));
  children.push(bullet('符号库（.SchLib）必须 **Add Existing Document 加入工程**（只放目录里不算）。'));
  children.push(bullet('首次对某工程使用，先跑 pin_table 验证符号可见。'));

  children.push(h1('5 核心工作流（STAGE 0 ~ 4）'));
  children.push(makeTable(
    ['阶段', '动作', '关键工具'],
    [
      ['STAGE 0 检索与方案', '检索绘图方法论，产出布局方案（轨道/朝向/间距）', 'search_knowledge_base（schematic-design 分类）'],
      ['STAGE 1 网表冻结', '查真实引脚 → 建网表 → 机器校验（严格引脚覆盖）', 'pin_table → validate_netlist'],
      ['STAGE 2 放置', '锚点引脚精确落点（免疫偏心原点旋转）；成套模块一次生成', 'edit_schematic(place_component, anchor_pin) · instantiate_module'],
      ['STAGE 3 布线与终审', '逐网布线（自动路由/避障/结点）→ 电源端口 → 编译器级审计', 'wire_pins · place_power_port → check_connectivity（分区比对冻结网表）'],
      ['STAGE 4 EMC 审计', '12 条确定性规则（输入滤波/去耦/接地/吸收/栅极/晶振/接口 ESD）', 'emc_audit'],
      ['收尾', '全部修改不自动保存——确认后使用者在 AD 里 Ctrl+S', '—'],
    ],
  ));
  children.push(p('长会话用 design_ledger 存取设计状态，防约束丢失。详见 05 使用说明书。'));

  children.push(h1('6 当前状态与路线图'));
  children.push(makeTable(
    ['项', '状态（2026-11-12）'],
    [
      ['版本', 'v0.2.1（2026-11-03 夜间批次收官）'],
      ['工具 / 测试', '53 工具 · 204 单测全绿 · tsc 干净 · pascal-gate 门禁上线'],
      ['部署包', 'altium-mcp-intranet-20261103-final.zip（staging 独立自检 PASS）'],
      ['v1.0-rc 进行中', '编排层（src/orchestration/）已编码未接入注册表；试点产品与 EMC 阈值终值待公司输入'],
      ['v1.0 发布', '计划 2026-11-23 ~ 11-27（功能冻结、文档定稿、评审）'],
      ['PCB 智能设计', '列入 2027 H1（决策依据见 08 规划篇）'],
    ],
  ));

  children.push(h1('7 文档索引'));
  children.push(makeTable(
    ['位置', '内容'],
    [
      ['docs/项目文档-Word/', '本系列 8 篇 Word 正式文档'],
      ['docs/devlog/', '开发日志 md 源（week1 ~ week12 周报 + 夜间批次计划 + README 索引）'],
      ['docs/技术资料/', '说明书（架构三篇）/ 参考（API、代码结构）/ 指南（EMC 阈值、记忆、部署、知识库）'],
      ['docs/归档/', '汇报材料（7/8/9 月 docx+pdf）/ 旧版总结'],
      ['docs/DEPLOY.md', '内网部署指南 md 源（Word 版见 04 篇）'],
      ['docs/README.md', '文档目录索引'],
    ],
  ));

  return { title: 'altium-mcp 项目总览与快速上手', subtitle: '自然语言驱动的 Altium 原理图自动化', metas: [['版本', VERSION], ['日期', DOC_DATE], ['规模', '53 工具 · 204 单测 · 21 测试文件'], ['系列', 'docs/项目文档-Word 系列 01']] , children, header: 'altium-mcp 项目总览 01' };
}

// =====================================================================
// 03 开发问题与事故汇编（充实重写）
// =====================================================================
function build03() {
  const children = [];

  children.push(h1('1 事故登记总表'));
  children.push(p('按时间序收录项目主要事故与缺陷。B 编号为缺陷台账登记号，T 编号为 2026-11-02 夜间批次任务号。详细叙述见第 2 节，结构性模式见第 3 节。'));
  children.push(makeTable(
    ['日期', '编号', '事故', '根因', '处置', '状态'],
    [
      ['09-14', '—', 'open_document 打开 .PrjPcb 无效，工程进不了工作区', 'Client.OpenDocument 不加载工程，Free Documents 下 DM_Compile 返回 0 物理文档', 'Altium_API.pas 改用 WS.DM_OpenProject(path, true)', '已修复'],
      ['09-12~14', 'B27/B28', '库枚举恒为 0（get_library_symbol_reference 从未真正工作）', 'SchIterator_Create 枚举的是"当前编辑元件"恒空，应为 SchLibIterator_Create；且聚焦库抢跑跳过工程库', '6 处调用点全部替换 + 工程库优先全量枚举', '已修复（实机 611 元件 / 3 库）'],
      ['09-14', '—', '跨网络引脚热点碰撞无守卫，元件重叠导致布线短路', 'SW1.2 与 R2.1 同点位重叠，任何导线接到该点即短路两网', 'wire_pins / optimize_layout 增加布线前碰撞检测，命中即抛错并建议挪元件', '已修复'],
      ['09 月', '—', '引脚浮空事件：错误参数进入执行层', '早期把精确坐标算术交给模型，1 mil 误差即浮空', '几何职责全部收回工具端（服务端吸附/wire_pins），编排层"不猜原则"', '已修复'],
      ['10-08', '—', 'emc_audit S032 逻辑缺陷：>1nF 电容被负载电容过滤器排除导致误报"缺失"', '两个过滤器串联语义冲突', '改为对地电容一律计存在，>1nF 单独出"疑似误放"提示', '已修复（测试抓出）'],
      ['11-02', '审查 P1', '42 条审查发现（TS 21 + Pascal 21）', '详见第 2、3 节', '6 个 P1 夜间批次落地 5 个半', '基本闭环'],
      ['11-02', 'T5', 'TEncoding.UTF8 编译拒绝；ADODB/CreateObject 触发 Error 对话框并阻塞全部 RunScript', '脚本引擎不支持 TEncoding；疑似 COM 实例化安全弹框', '请求方向改 UTF-16LE+BOM 落地（零 .pas 改动实机 PASS）；响应方向 BLOCKED 待实机读对话框文案', '半修复'],
      ['11-02', '审查 P1#2', '响应串台：超时后旧响应串成下一次调用的结果', 'request/response 无关联 ID', 'requestId 协议（TS + Pascal 双端），实机验证回带一致', '已修复'],
      ['11-02', '审查 P1#6', '大图审计分钟到小时级', '逐元件单次桥接往返取引脚热点', 'get_all_pin_hotspots 批量命令，实机 1738ms 全表 vs 旧路径单元件 1372ms', '已修复'],
      ['11-02', 'T6', 'add_via 永远落 (1,1)；add_text italic 时 Y 被覆盖', '坐标参数被 tenting 布尔载体 / italic 载体覆盖（多副本单点修复模式第三起）', '载体改独立变量 + 坐标调用点重解析', '已修复'],
      ['11-03', '—', 'smoke 首验假失败（跑的是旧 dist）', '改 src 后未重新 tsc 构建，--noEmit 只查类型不出产物', '纪律固化：改 src 后凡实机验证必先 tsc 构建', '已固化'],
      ['11-03', 'T9', '门禁测试样例污染（红测试下两次 amend）', '样例注释含 then/try 命中行级检查；R1 正则漏 <> nil 变体', '样例去关键词；全量回归前置到 amend 之前', '已修复'],
      ['08-31 发现', '—', '磁盘 .PrjPcb 实锤缺成员（冷启动 DM 层枚举 0 根因）', '8-31 保存的工程文件只含 Sheet2+PCB2，9 月加入的 Sheet1/3 从未保存进工程', '待用户在 AD 里打开工程 Ctrl+S 一次（列入待决策）', '待处置'],
    ],
  ));

  children.push(h1('2 关键事故详情'));

  children.push(h2('2.1 DelphiScript 引擎能力边界（T5 实证）'));
  children.push(p('**现象一：TEncoding 编译拒绝。** 在 .pas 中使用 TEncoding.UTF8 相关 API，ping 触发脚本工程整体编译失败——DelphiScript 引擎不支持该类型，且一处语法/类型错误瘫痪整个脚本工程（全部命令排队超时）。'));
  children.push(p('**现象二：COM 实例化触发 Error 对话框。** ADODB.Stream 与 CreateObject 方案同样触发——疑似脚本引擎对 COM 创建的安全弹框，无人值守时只能看到无文本对话框，且阻塞后续全部 RunScript 调用（每次调用排队直至超时）。'));
  children.push(p('**处置流程（实战沉淀）：** 用 WM_CLOSE 关闭 "Error" 窗口即可解堵；彻底楔死则杀 X2.EXE 冷启动恢复。'));
  children.push(p('**绕开方案（已验证）：** request.json 改写 **UTF-16LE + BOM**——Pascal TStringList 自动识别 BOM，零 .pas 改动实机 PASS，中文参数"进"方向打通。响应方向待实机读一次 Error 对话框 / Messages 面板文案后定方案（候选：TEncoding 不支持 / COM 安全弹框 / CreateObject 受限）。'));

  children.push(h2('2.2 库枚举双重根因（B27/B28）'));
  children.push(p('get_library_symbol_reference 及其上层（SearchLibrarySymbol / ListLibraryComponents 共 6 处）从未真正工作过，靠内存缓存兜底掩盖。两个根因叠加：'));
  const n03a = numberer();
  children.push(n03a('库文档上用 SchIterator_Create 枚举元件——它枚举的是"当前编辑中的元件"，恒为空；正确方法是 SchLibIterator_Create（对照 OpenLib/libUtils.pas L166）。'));
  children.push(n03a('Phase 1（聚焦库）抢跑——只要 AD 里恰好聚焦着一个 SchLib 就只枚举它、跳过全部工程库；改为工程库优先全量枚举，聚焦库仅作无工程库时的回退。'));
  children.push(p('修复后实机验证：611 元件 / 3 个库（此前 0 个）。附带改进：解析库文档改用 GetSchDocumentByPath（焦点无关），OpenDocument kind 字符串三连尝试（SchLib/SCHLIB/SCH）。'));

  children.push(h2('2.3 PCB 写载体覆盖（多副本模式第三起）'));
  children.push(p('add_track 坐标覆盖修复后，add_via 与 add_text **原样带病**：add_via 坐标被 tenting 布尔载体覆盖（过孔永远落 (1,1)）；add_text 的 italic 载体覆盖 Y 坐标。载体改独立变量 + 坐标调用点重解析。这是"多副本单点修复"模式的第三起同类事故——同构代码在多个 .pas 间存在近似拷贝，修一处漏两处，促成 pascal-gate 静态门禁上线。'));

  children.push(h2('2.4 requestId 响应串台'));
  children.push(p('request/response 文件对原本无关联 ID：调用 A 超时后，其迟到的响应会被下一次调用 B 当作自己的结果消费——症状是"拿到上一条命令的返回"。修复：每条请求带自增关联 ID，Pascal 端原样回写；轮询校验不匹配视为 stale 继续等待。实机验证：请求带 1 → 响应回带 1。'));

  children.push(h2('2.5 open_document(.PrjPcb) 无效'));
  children.push(p('Client.OpenDocument 不会把工程加入工作区：Free Documents 下 DM_Compile 返回 0 物理文档 → check_connectivity 的 DM 编译层为空。修复：ExecuteOpenDocument 改用 WS.DM_OpenProject(path, true)（对照 OpenLib/libUtils.pas L721）。**推论：check_connectivity 权威模式需要真实工程打开**。'));

  children.push(h2('2.6 跨网络引脚热点碰撞'));
  children.push(p('实测发现 SW1.2 与 R2.1 同在 (2500,500)（元件放置重叠）——任何导线接到该点都会把两网短路（wire_pins 首轮 GND∪KEY 合并即此因）。修复：布线规划前碰撞检测，命中即抛错并建议挪元件（约 300 mil），规划失败零写入。'));

  children.push(h2('2.7 磁盘工程文件缺成员'));
  children.push(p('8-31 保存的 .PrjPcb 只含 Sheet2+PCB2，9 月会话加入的 Sheet1/3 从未保存进工程文件——AD 界面上看着都在，冷启动后 DM 层枚举为 0 的根因。已列入待用户决策：AD 打开工程后 Ctrl+S 一次持久化成员。'));

  children.push(h2('2.8 流程与测试类'));
  children.push(bullet('**smoke 跑旧 dist（T4 首验假失败）**：改 src 后必须先 tsc 构建——--noEmit 只查类型不出产物；smoke 跑的是 dist。'));
  children.push(bullet('**门禁样例污染（T9）**：测试样例的注释携带被检关键词（then/try）会命中行级匹配；正则规则要对照事故原文逐字符核（初版漏了 <> nil 变体）。'));
  children.push(bullet('**红测试下禁止 amend**：两次 amend 都发生在红测试状态——全量回归必须放在 amend 之前。'));
  children.push(bullet('**vitest 不查类型**：选项名误用 snake_case（min_severity）静默失效，表现为"过滤不生效"而非报错——tsc 必须单独跑。'));

  children.push(h1('3 缺陷模式与结构性风险'));

  children.push(h2('3.1 多副本单点修复（最高频模式）'));
  children.push(p('三向项目解析器、库枚举逻辑、引脚解析等在 schematic_utils.pas / schematic_edit.pas / pcb_utils.pas 间存在多份近似拷贝。add_track 修复后 add_via/add_text 原样带病是第三起同类事故。对策：能收敛单源就收敛；收敛不了的建 pascal-gate 静态门禁兜底；**改 Pascal 须逐副本 diff**。'));

  children.push(h2('3.2 Pascal 无编译兜底'));
  children.push(p('DelphiScript 只能实机编译，且一处语法错误瘫痪整个脚本工程。对策：任何 .pas 改动后必须桥接 ping 冒烟（ping 会整体编译）；提交前跑 node scripts/pascal-gate.cjs；语句级修改安全、新语法构造（TEncoding/COM）高风险需用户在场。'));

  children.push(h2('3.3 长会话约束丢失'));
  children.push(p('多轮对话后模型可能遗忘早期约束（网络划分、禁入区、未完成网）。对策：design_ledger 外置设计状态（load before stages / save after），不靠对话记忆。'));

  children.push(h1('4 pascal-gate 静态门禁'));
  children.push(p('2026-11-03 上线（scripts/pascal-gate.cjs，npm run gate:pascal）。四条规则源自真实事故：'));
  children.push(makeTable(
    ['规则', '检查内容', '事故来源'],
    [
      ['R1', 'if/where 缺 then（行级）', 'B29 同款编译失败'],
      ['R2', 'JSON 字符串拼接未转义', '请求参数注入引号破坏 JSON'],
      ['R3', 'ANSI 文件 IO（AssignFile/Reset/Rewrite 无编码保证）', '中文参数乱码家族'],
      ['R4', 'PreProcess 后 10 行内无 try', '对话框阻塞类事故'],
    ],
  ));
  children.push(p('基线 14 条违例与 2026-11-02 审查发现交叉验证一致。测试样例不得携带被检关键词。'));

  children.push(h1('5 经验教训清单'));
  const n03b = numberer();
  children.push(n03b('改 Pascal 须逐副本 diff——多副本漂移是最高频事故源，能收敛单源就收敛。'));
  children.push(n03b('改 src 后凡实机验证必须先 tsc 构建 dist（smoke 跑 dist）。'));
  children.push(n03b('测试样例的注释不要携带被检关键词（then/try 会污染行级匹配）；正则规则对照事故原文逐字符核。'));
  children.push(n03b('红测试下禁止 amend 提交——全量回归放在 amend 之前。'));
  children.push(n03b('写命令后必须独立读回验证，绝不信任 success:true。'));
  children.push(n03b('长会话依赖 design_ledger 落盘约束，不靠对话记忆。'));
  children.push(n03b('vitest 不查类型——选项名拼错静默失效，tsc 必须单独跑。'));
  children.push(n03b('几何职责（吸附/路由/碰撞）留在工具端，不交给模型算坐标。'));
  children.push(n03b('识别不了就返回 unknown 并附原因，绝不猜测坐标/位号/网络名（9 月引脚浮空事件教训）。'));
  children.push(n03b('DelphiScript 新语法构造（TEncoding/COM）高风险——先小样实机验证再上主线，且需用户在场。'));

  return { title: 'altium-mcp 开发问题与事故汇编', subtitle: '事故登记 · 关键事故详情 · 缺陷模式 · 门禁 · 经验教训', metas: [['版本', VERSION + ' 时点'], ['日期', DOC_DATE], ['来源', '周报 / DEVLOG / 审查记录 / 夜间批次实录'], ['系列', 'docs/项目文档-Word 系列 03']], children, header: 'altium-mcp 问题与事故汇编 03' };
}

// =====================================================================
// 04 内网部署指南
// =====================================================================
function build04() {
  const children = [];

  children.push(h1('1 环境要求'));
  children.push(makeTable(
    ['项', '要求'],
    [
      ['操作系统', 'Windows 10 / 11'],
      ['Altium Designer', 'AD22 实测（脚本走标准 API，AD19+ 大概率兼容）'],
      ['Node.js', '≥ 20（唯一外部依赖；内网可离线安装 node）'],
      ['外网', '**不需要**——本包完全离线运行'],
    ],
  ));

  children.push(h1('2 离线拷贝清单（外网机 → 内网工位）'));
  children.push(p('把以下内容整体打包带入内网（即发布包，npm run build 后打包，推荐直接用 altium-mcp-intranet-20261103-final.zip）：'));
  children.push(...codeBlock('dist/（必须，编译产物入口 index.js）\nnode_modules/（必须，仅 @modelcontextprotocol/sdk + zod 及依赖）\naltium-scripts/  knowledge-base/  templates/  schemas/  docs/  package.json  README.md\n\n不需要拷贝：src/、tests/、node_modules/.cache、.git（如有）'));

  children.push(h1('3 安装步骤'));
  const n04a = numberer();
  children.push(n04a('解压本包到任意目录，例如 D:\\tools\\altium-mcp（路径不要含中文/空格更稳）。'));
  children.push(n04a('安装 Node.js ≥ 20（如内网无 node，用离线安装包）。'));
  children.push(n04a('创建配置文件 C:\\Users\\<用户>\\.altium-mcp\\config.json：'));
  children.push(...codeBlock('{\n  "altiumExePath": "D:\\\\app\\\\AD22\\\\X2.EXE",\n  "workspaceRoot": "C:\\\\Users\\\\<用户>\\\\.altium-mcp\\\\workspace"\n}'));
  children.push(bullet('altiumExePath：本机 Altium 主程序完整路径（AD 没在运行时服务器会拉起它）'));
  children.push(bullet('workspaceRoot：桥接工作目录（默认 ~/.altium-mcp/workspace，可不填）'));
  children.push(bullet('路径里的反斜杠必须写成 \\\\'));
  children.push(n04a('验证安装（可选但推荐）：'));
  children.push(...codeBlock('cd /d D:\\tools\\altium-mcp\nnode scripts\\smoke-intranet.mjs'));
  children.push(p('预期输出 ping: ok 与工具清单数量。首次调用会自动把 altium-scripts 同步到 workspace，无需手动操作。'));

  children.push(h1('4 MCP 客户端接入（stdio）'));
  children.push(p('客户端配置中添加服务器，command 用 node 的完整路径，args 指向包内入口：'));
  children.push(...codeBlock('// Claude Desktop：%APPDATA%\\Claude\\claude_desktop_config.json\n{\n  "mcpServers": {\n    "altium": {\n      "command": "node",\n      "args": ["D:\\\\tools\\\\altium-mcp\\\\dist\\\\index.js"]\n    }\n  }\n}'));
  children.push(h2('4.1 内网 OpenCode 工位挂载（本公司标准方式）'));
  children.push(p('内网已部署 OpenCode 且已挂金蝶云 MCP 的工位，在 opencode.json 的 mcp 段**追加**（既有 kingdee 挂载不动）：'));
  children.push(...codeBlock('{\n  "mcp": {\n    "altium": {\n      "type": "local",\n      "command": ["node", "D:\\\\tools\\\\altium-mcp\\\\dist\\\\index.js"],\n      "environment": {}\n    }\n  },\n  "provider": {\n    "models": { "vlmm_qwen": {} }\n  }\n}'));
  children.push(p('模型指向内网大模型 http://192.168.10.200:6006/v1（OpenAI 兼容，模型名 vlmm_qwen，API Key 任意串）。'));
  children.push(quote('**function-calling 注意**：整条自然语言链路依赖模型稳定调用 MCP 工具。vlmm_qwen 对 function-calling 的支持须在部署首日实测（问"现在打开的工程里有哪些元件"，观察是否真的调用了 get_schematic_data）；若不稳定，使用 src/orchestration/ 提供的确定性编排（关键词→动作序列，不依赖模型），或在提示词中加入编排器输出的预规划动作序列。'));

  children.push(h1('5 使用前的工程准备（重要）'));
  const n04b = numberer();
  children.push(n04b('目标工程必须处于打开状态（或在 config 指定后由工具拉起 AD）。Free Documents 里游离的图纸编译结果为空，check_connectivity 等权威验证不可用。'));
  children.push(n04b('符号库（.SchLib）必须加入工程（不是只放在工程目录）：库枚举/引脚表/模板预检只认工程文档列表成员。在 AD 里右键工程 → Add Existing Document，或调用桥接命令 add_document_to_project。标准库位置 C:\\Users\\Public\\Documents\\Altium\\AD22\\Library\\。'));
  children.push(n04b('首次对某工程使用时，建议让 AI 先跑 pin_table 验证符号可见。'));

  children.push(h1('6 核心使用范式'));
  children.push(p('对 AI 的绘图请求，服务器内置了纪律（详见 05 使用说明书）：'));
  const n04c = numberer();
  children.push(n04c('**STAGE 0**：search_knowledge_base（schematic-design 分类是画图方法论）→ 产出布局方案（轨道/朝向/间距）。'));
  children.push(n04c('**STAGE 1**：pin_table 查真实引脚 → 建网表 → validate_netlist（严格引脚覆盖：漏网直接报错）；design_ledger 存取设计状态。'));
  children.push(n04c('**STAGE 2**：place_component（anchor_pin 让指定引脚精确落点，免疫 AD 偏心原点旋转）；成套模块用 instantiate_module。'));
  children.push(n04c('**STAGE 3**：逐网 wire_pins（自动路由/避障/结点/验证）→ 电源端口/标签 → check_connectivity（编译器级审计，分区比对冻结网表）。'));
  children.push(n04c('**STAGE 4**：emc_audit 原理图 EMC 审计（12 条规则，输出证据链与 checks_passed 轨迹）。'));
  children.push(n04c('全部修改**不会自动保存**——确认后由使用者在 AD 里 Ctrl+S。'));

  children.push(h1('7 常见问题'));
  children.push(makeTable(
    ['现象', '原因与处置'],
    [
      ['ping 超时', 'AD 未运行且拉起失败（检查 config 的 altiumExePath）；或 AD 弹了脚本错误框——用 WM_CLOSE 关 "Error" 窗口解堵，顽固情况杀 X2.EXE 冷启动；一般是脚本损坏，重新解压 altium-scripts'],
      ['库枚举 0 / 模板预检失败', 'SchLib 没加进工程（见第 5 节）'],
      ['SCHEMATIC_NOT_IN_OPEN_PROJECTS', '图纸不在打开的工程里（Free Documents）——用 open_document 打开 .PrjPcb'],
      ['保存的图丢了', '工具不自动保存；在 AD 里 Ctrl+S'],
      ['每次调用弹错误框', '脚本工程编译失败——ping 也会超时；重新同步或检查 workspace\\AltiumScript'],
      ['中文参数乱码', '20261103 包已内置 UTF-16LE+BOM 请求编码，无需再配置；若响应方向中文异常属已知 T5 待办'],
    ],
  ));

  children.push(h1('8 包内容'));
  children.push(...codeBlock('altium-mcp/\n├── dist/               编译产物（入口 dist/index.js）\n├── node_modules/       运行依赖（仅 @modelcontextprotocol/sdk + zod 及其依赖）\n├── altium-scripts/     DelphiScript 桥接脚本（首次调用自动同步到 workspace）\n├── knowledge-base/     设计知识库（含检索索引 kb-index.json）\n├── templates/          模块模板（buck-input-stage 等）\n├── schemas/            接口 schema 文档\n├── scripts/            smoke-intranet.mjs 自检脚本\n├── docs/               开发日志与本文档\n├── package.json\n└── README.md'));

  return { title: 'altium-mcp 内网部署指南', subtitle: '离线安装 · MCP 客户端挂载 · 工程准备 · 常见问题', metas: [['版本', VERSION + '（对应部署包 20261103-final）'], ['日期', DOC_DATE], ['来源', 'docs/DEPLOY.md（md 源）'], ['系列', 'docs/项目文档-Word 系列 04']], children, header: 'altium-mcp 内网部署指南 04' };
}

// =====================================================================
// 05 使用说明书
// =====================================================================
function build05() {
  const children = [];

  children.push(h1('1 概述与约定'));
  children.push(p('本手册面向日常使用者，说明通过 MCP 客户端（自然语言）驱动 Altium Designer 绘制与审计原理图的操作范式。详尽的界面级操作说明见根目录《altium-mcp_使用说明书.html》（v0.2.0 详版），本篇为 Word 重排精炼版并更新至 v0.2.1。'));
  children.push(h2('1.1 全局约定'));
  children.push(bullet('**坐标系**：mil 单位；Y 轴向上、原点左下、旋转逆时针（模型按屏幕坐标系理解会上下颠倒，工具描述已显式声明）。'));
  children.push(bullet('**不自动保存**：全部修改停留在 AD 内存，确认后由使用者在 AD 里 Ctrl+S。'));
  children.push(bullet('**写操作注解**：写类工具带 destructive/update 注解；只读工具 readOnly——客户端可按注解控制审批。'));
  children.push(bullet('**错误即停**：验证失败（如 check_connectivity 报错）时禁止保存，先按报告修复。'));

  children.push(h1('2 工具域速查'));
  children.push(p('53 个工具按域分组（完整清单见 01 总览篇第 3 节），日常绘图最常用：'));
  children.push(makeTable(
    ['场景', '常用工具组合'],
    [
      ['看现状', 'get_workspace_projects → get_schematic_data / get_all_designators → zoom_view'],
      ['画图（推荐全流程）', 'search_knowledge_base → pin_table → validate_netlist → place_component(anchor_pin) / instantiate_module → wire_pins → place_power_port → check_connectivity'],
      ['修图', 'analyze_schematic_quality（旋转/平移建议）→ optimize_layout（自动重布+分区等价验证）'],
      ['改局部', 'edit_schematic（16 动作，见第 4 节）'],
      ['EMC 审查', 'compile_project（如需刷新编译层）→ emc_audit'],
      ['查库', 'search_library_symbol / get_library_symbol_reference / pin_table'],
      ['台账', 'design_ledger（load/save 设计状态）'],
      ['PCB 辅助', 'get_pcb_* 读取族 · pcb_edit / move_components 写入族 · pcb_drc · generate_report'],
    ],
  ));

  children.push(h1('3 核心工作流（STAGE 0 ~ 4）详解'));

  children.push(h2('STAGE 0 检索与方案'));
  children.push(p('先 search_knowledge_base（query 如 "schematic-design buck 输入级 布局"）取绘图方法论，产出布局方案：功能块分区、元件轨道、朝向、间距。**不要跳过直接堆元件**。'));

  children.push(h2('STAGE 1 引脚与网表冻结'));
  const n05a = numberer();
  children.push(n05a('pin_table 查询元件真实引脚（编号/名称/电气类型/朝向/hotspot 坐标）——重名符号显式上报 also_in_libraries，放置时应带精确 sch_library_path 消歧。'));
  children.push(n05a('基于真实引脚写网表（每元件每引脚归网）。'));
  children.push(n05a('validate_netlist 机器校验：幻觉引脚（PIN_NOT_ON_COMPONENT）、一脚两网（PIN_IN_MULTIPLE_NETS）、整件遗忘（零分配清单）、电源引脚离电源网等直接报错。'));
  children.push(n05a('校验通过返回 frozen_netlist——下游 wire_pins / check_connectivity 的比对基准。'));

  children.push(h2('STAGE 2 放置'));
  const n05b = numberer();
  children.push(n05b('place_component 带 **anchor_pin**：让指定引脚的热点精确落在坐标上，免疫 AD 偏心原点旋转误差。'));
  children.push(n05b('成套功能块（如 buck 输入级）用 instantiate_module 一次生成（templates/ 内置模块模板）。'));
  children.push(n05b('放完可用 get_all_pin_hotspots 批量取全图纸引脚表（一次桥接往返，大图秒级）。'));

  children.push(h2('STAGE 3 布线与终审'));
  const n05c = numberer();
  children.push(n05c('逐网 wire_pins：只给拓扑（引脚清单），工具自动 MST → A* 避障路由 → 自动 junction → 单次落地 → 复核全引脚同网；规划失败零写入。'));
  children.push(n05c('电源端口/网络标签（place_power_port / place_net_label，带服务端吸附）。'));
  children.push(n05c('check_connectivity 终审：编译器级审计，网表分区与 frozen_netlist 比对——不一致即 DO NOT SAVE。'));
  children.push(n05c('（可选）optimize_layout 收尾：内存爬山优化布局 → 全图重布 → 网表分区等价验证；验证不过明确报告不保存。注意：优化重布后需重放网络标签/电源端口（旧标签可能悬空）。'));

  children.push(h2('STAGE 4 EMC 审计'));
  children.push(p('emc_audit 对编译网表 + 元件参数跑 12 条确定性规则（详见 07 专篇）。报告含证据链与 checks_passed 台账，可直接进评审存档。'));

  children.push(h1('4 edit_schematic 动作集（16 个）'));
  children.push(makeTable(
    ['动作', '说明'],
    [
      ['place_component', '放置元件（支持 anchor_pin 锚点引脚落点）'],
      ['set_component_transform', '移动/旋转元件'],
      ['set_component_parameters', '改参数（Value/Comment 等）'],
      ['add_text / place_net_label / place_power_port / place_vcc / add_port', '文本、网络标签、电源端口（GND/VCC 别名）、端口'],
      ['place_wire / add_bus / add_bus_entry / add_junction / add_rectangle', '导线（别名）、总线、总线入口、结点、矩形'],
      ['delete_object', '删除（位号/点选/矩形/整页四种定位）'],
      ['draw_plan', '批量：transforms_csv → delete_wires_all → wires_csv → junctions_csv 一次桥接调用'],
      ['get_component_info', '读元件信息（引脚热点与放置后回读一致）'],
    ],
  ));

  children.push(h1('5 记忆与台账'));
  children.push(bullet('**design_ledger**：外置设计状态（冻结网表、未完成网、禁入区、约束）——长会话每次 STAGE 前 load、阶段后 save，防约束丢失。'));
  children.push(bullet('**双层记忆**：memory/short-term/（会话级：元件位置、引脚网络、元件知识库）+ memory/long-term/（跨会话：设计规则、库摘要、引脚映射）。导入库元件用 import_library_components（按 lib_reference 去重、来源追踪）。'));

  children.push(h1('6 错误处理'));
  children.push(bullet('桥接错误带错误码（如 SCHEMATIC_NOT_IN_OPEN_PROJECTS / PIN_NOT_ON_COMPONENT / ALT_LAUNCH_FAILED），按码处置。'));
  children.push(bullet('脚本工程编译失败时：bridge_user_reported_error.txt 会携带报错（页面定位/位号/库安装三行格式），或 ping 超时——处置见 04 部署指南 FAQ。'));
  children.push(bullet('写命令全部"先规划后写入，规划失败零写入"；执行后强制读回验证。'));

  children.push(h1('7 常见问题'));
  children.push(bullet('画完的图位置怪/上下颠倒——检查是否用了 anchor_pin；确认坐标约定（Y 向上）。'));
  children.push(bullet('布线报碰撞——元件重叠，先挪开约 300 mil 再布。'));
  children.push(bullet('重布后标签悬空——optimize_layout 后需重放 net label / power port（工作流内置此步）。'));
  children.push(bullet('其余部署类问题见 04 部署指南第 7 节 FAQ。'));

  return { title: 'altium-mcp 使用说明书', subtitle: '操作范式 · 工具速查 · 工作流详解 · 错误处理', metas: [['版本', VERSION], ['日期', DOC_DATE], ['详版', '根目录 altium-mcp_使用说明书.html（v0.2.0）'], ['系列', 'docs/项目文档-Word 系列 05']], children, header: 'altium-mcp 使用说明书 05' };
}

// =====================================================================
// 06 测试与质量报告
// =====================================================================
function build06() {
  const children = [];

  children.push(h1('1 总览'));
  children.push(p(`截至 ${DOC_DATE}（${VERSION}）：**21 个测试文件 / 204 个用例全绿**（vitest 实跑 5.24s），tsc --noEmit 类型检查通过，pascal-gate 静态门禁通过。测试演进：9 月中 54 例 → 10-08 EMC 后 157 → 10-27/28 编排层后 176 → 11-03 夜间批次后 204。`));

  children.push(h1('2 单测分布（2026-11-12 实跑）'));
  children.push(makeTable(
    ['测试文件', '用例数', '覆盖对象'],
    [
      ['emcAudit.test.ts', '37', '12 规则触发/通过/跳过、网分类、容值阻值解析、flyback 参考板、过滤'],
      ['schematicRouter.test.ts', '21', 'segRel 线段关系、网格选择、避障绕行、T 接 junction、网表分区'],
      ['orchestration.test.ts', '19', '10 类意图解析、schema 校验闭环、枚举一致性探针'],
      ['moduleTemplates.test.ts', '17', '模块模板实例化、锚点引脚、预检'],
      ['editSchematic.test.ts', '16', '16 动作 schema、参数校验、锚点重写'],
      ['checkConnectivity.test.ts', '12', '双层架构（DM 编译层/几何回退层）、分区比对、规则 R5/R6'],
      ['designLedger.test.ts', '12', '台账存取、约束落盘'],
      ['analyzeSchematicQuality.test.ts', '9', '评分器、变换模拟、旋转建议'],
      ['bridgeResponse.test.ts', '8', '响应轮询、未就绪重试、BOM 剥离、stale 判定'],
      ['validateNetlist.test.ts', '7', '幻觉引脚、一脚两网、零分配、电源网、syntax 模式'],
      ['wirePins.test.ts', '6', '端到端纯函数：规划、搭接、包围盒无路'],
      ['bridgeLock.test.ts', '5', '文件锁竞争、超时、陈锁 ESRCH'],
      ['launchAltium.test.ts', '4', '启动进程观测、退出码判定（坏路径快速失败）'],
      ['requestEncoding.test.ts', '4', 'UTF-16LE+BOM 编码、BOM 剥离'],
      ['pascalGate.test.ts', '3', '四规则命中/放行'],
      ['workspaceLayout.test.ts', '4', 'workspace 目录布局、指纹同步'],
      ['pinTable.test.ts', '10', '引脚表、hotspot 数学、重名符号'],
      ['getSchematicData.test.ts', '3', '取数映射、参数携带'],
      ['schematicAuditData.test.ts', '3', '审计取数、批量优先/失败回退'],
      ['designators.test.ts', '2', '位号枚举'],
      ['helpers.test.ts', '2', '通用辅助'],
    ],
  ));

  children.push(h1('3 静态门禁（pascal-gate）'));
  children.push(p('DelphiScript 无本地编译器，静态门禁兜底四类真实事故模式（详见 03 问题篇第 4 节）：R1 缺 then / R2 JSON 拼接未转义 / R3 ANSI 文件 IO / R4 PreProcess 后 10 行内无 try。基线 14 条违例与 11-02 审查发现交叉验证一致。npm run gate:pascal 运行。'));

  children.push(h1('4 实机验证台账'));
  children.push(makeTable(
    ['日期', '验证项', '结果'],
    [
      ['09-14', 'LED 指示灯电路端到端（8 元件黄金网表）', 'PASS：脚本指纹同步生效；add_wire 端点吸附（偏移 +8mil → snapped=[R1.1,R1.2]）；place_gnd 吸附；wire_pins 5 网全通零浮空；optimize_layout 47s 5 轮收敛评分 210→91（交叉 0 拐点 0）；终审 errors=0 warnings=0，16/16 引脚连通'],
      ['09-14', '故障注入 4/4', '幻觉引脚 D1.9、一脚两网、整件遗忘 R9、畸形引脚引用——全部拦截'],
      ['09-15', 'P0 模块模板（buck-input-stage）实机验收', 'PASS（week10）'],
      ['09-22', '内网部署包 staging 独立自检', 'PASS（桥接 ping ok + 工具清单）'],
      ['11-03', 'requestId 回带（T4）', 'PASS：请求带 1 → 响应回带 1，串台机制封死'],
      ['11-03', '批量引脚热点（T8，Sheet2 4 元件 8 引脚）', 'PASS：批量 1 次往返 1738ms 全表 vs 旧路径单元件 1372ms；坐标/名称/隐藏位完全一致'],
      ['11-03', 'UTF-16LE+BOM 请求（T5 进方向）', 'PASS：Pascal TStringList 自动识别 BOM，smoke 全过，中文参数安全进入'],
      ['11-03', '库枚举修复回归', 'PASS：611 元件 / 3 库（修复前 0）'],
      ['11-03', '部署包 20261103-final staging 自检', 'PASS 后出包'],
    ],
  ));

  children.push(h1('5 质量护栏机制'));
  children.push(makeTable(
    ['机制', '作用'],
    [
      ['zod schema 全量校验', '每条工具入参经真实 schema 校验；编排层产出的每条计划同样校验后才产出——不合格丢弃并告警，杜绝半猜参数进执行层'],
      ['写后读回验证', '所有写操作强制独立读回，不信任 success:true'],
      ['冻结网表比对', 'validate_netlist 冻结 → wire_pins/check_connectivity 比对，漏网错网直接报错'],
      ['网表分区等价验证', 'optimize_layout 重布前后电气等价（网络划分一致）才认可，否则报告 DO NOT SAVE'],
      ['布线前碰撞检测', '跨网络引脚热点重叠即抛错（防短路），规划失败零写入'],
      ['requestId 协议', '响应关联 ID 校验，stale 响应继续等待——串台封死'],
      ['严格引脚覆盖', 'validate_netlist 逐元件未分配引脚清单，整件遗忘即零分配报告'],
      ['设计台账 design_ledger', '约束/网表/禁入区外置落盘，长会话防丢失'],
      ['静态门禁 + 全量回归', 'gate:pascal 四规则；vitest 204 例 + tsc 双闸'],
    ],
  ));

  children.push(h1('6 覆盖缺口与改进方向'));
  children.push(bullet('Pascal 端（.pas）无单测——只能实机冒烟（ping 编译）+ 静态门禁兜底；考虑引入脚本级自检命令。'));
  children.push(bullet('编排层（orchestration）已 19 例单测但未接入 MCP 注册表——接入后需补端到端链路测试。'));
  children.push(bullet('emc_audit 实机链路与真实图纸误报率验证未做（需真实产品图纸，列入待办）。'));
  children.push(bullet('MCP SDK v2 迁移时机待评估（列入待决策）。'));

  return { title: 'altium-mcp 测试与质量报告', subtitle: '204 单测 · 静态门禁 · 实机验证台账 · 质量护栏', metas: [['版本', VERSION], ['日期', DOC_DATE + '（全量实跑）'], ['结论', '21 文件 204 例全绿 · 5.24s · tsc 干净'], ['系列', 'docs/项目文档-Word 系列 06']], children, header: 'altium-mcp 测试与质量报告 06' };
}

// =====================================================================
// 07 EMC 审计功能说明
// =====================================================================
function build07() {
  const children = [];

  children.push(h1('1 定位'));
  children.push(p('emc_audit 是 EMC×AI 四层方案（L1 规则 / L2 RAG / L3 预测 / L4 优化）的 **L1 落地**：原理图侧确定性 EMC 规则引擎，v0.2.0 引入（2026-10-08），37 单测。核心纪律：**LLM 不做数值裁决**——规则判定全部由确定性代码完成（编译网表 + 元件参数 + 命名约定），LLM 只消费报告生成整改建议。'));
  children.push(p('市面对照：商业侧（Ansys SimAI / Cadence Sigrity Optimality）走仿真代理路线，Flux.ai 走 LLM 审查路线；开源侧无现成 EMC 专家系统——L1 属自建资产。'));

  children.push(h1('2 三个判定维度'));
  children.push(bullet('**编译网表**：DM 层 pin_nets（权威网络划分，需真实工程打开）。'));
  children.push(bullet('**元件参数**：Value / Description / Comment 关键词（Pascal get_schematic_data parameters 桶直通）。'));
  children.push(bullet('**命名约定**：NET_PATTERNS 正则识别电源轨/地/AC 输入等网络（可按公司命名规范配置，误报时改这里而非弃用工具）。'));

  children.push(h1('3 规则全表（12 条，v1.0 默认阈值）'));
  children.push(p('转录自 src/tools/emcAudit.ts EMC_RULE_CATALOG 与《EMC 规则阈值表 V1.0》（2026-10-28）。**终值待 EMC 工程师确认（计划 11-13）**，确认后升版并同步配置。'));
  children.push(h2('3.1 传导（conducted）'));
  children.push(makeTable(
    ['规则', '检查内容', '级别', '默认阈值/判定', '参数名'],
    [
      ['EMC-S001', 'AC 输入侧未识别到共模电感（FL 前缀，或 Value/Description 含 common mode/CM choke/共模）', 'warning', '存在性检查', '—'],
      ['EMC-S002', 'L-N 之间未识别到 X 电容', 'warning', '存在性检查', '—'],
      ['EMC-S003', 'X 电容容值超常规范围', 'info', '> 2.2 uF 提示（常规 0.047–2.2uF 量级）', 'x_cap_max_uf'],
      ['EMC-S004', '存在 PE 网络但未识别到 Y 电容', 'warning', '存在性检查', '—'],
      ['EMC-S005', 'Y 电容容值偏大（漏电流风险）', 'warning', '> 4.7 nF 提示；无法解析降级 info', 'y_cap_max_nf'],
    ],
  ));
  children.push(h2('3.2 去耦（decoupling）'));
  children.push(makeTable(
    ['规则', '检查内容', '级别', '默认阈值/判定', '参数名'],
    [
      ['EMC-S010', '电源轨上无去耦电容（每个含 IC 引脚的电源轨）', 'warning', '存在性检查', '—'],
      ['EMC-S011', '电源轨缺少高频小电容', 'info', '仅有 ≥1 uF 且无 ≤0.47 uF 小电容时提示', 'hf_decoupling_max_uf'],
    ],
  ));
  children.push(h2('3.3 接地 / 开关 / 接口'));
  children.push(makeTable(
    ['规则', '类别', '检查内容', '级别', '判定'],
    [
      ['EMC-S020', 'grounding', '多接地系统（PGND/SGND/AGND 等 ≥2 个地网络）未识别到桥接元件', 'info', '检查 0Ω 电阻/磁珠/Y 电容桥接存在性；非隔离需单点连接，隔离需 Y 电容共模回路'],
      ['EMC-S030', 'switching', '变压器/功率电感绕组未识别到吸收网络', 'info', '检查 R-C 串联 / C 直跨 / 二极管钳位支路；CM choke 与磁珠排除'],
      ['EMC-S031', 'switching', 'MOSFET 栅极网络上无串联电阻', 'info', 'G 脚网络电阻存在性（变压器直接驱动属例外）'],
      ['EMC-S032', 'interface', '晶振两脚未识别到对地负载电容', 'warning', '两个振荡网络各查对地电容；>1nF 单独提示疑似误放去耦电容'],
      ['EMC-S040', 'interface', '连接器信号网络直达 IC 且无 ESD/滤波元件', 'info', '检查 TVS/二极管对地或串联电阻/磁珠（上限 20 条防刷屏）'],
    ],
  ));

  children.push(h1('4 解析能力'));
  children.push(bullet('容值：100nF / 0.1uF/50V X7R / 4n7 / 103(EIA) / 47。'));
  children.push(bullet('阻值：10k / 0R / 4R7 / 1M。'));
  children.push(bullet('磁珠判定保守：仅按 600R@100MHz 阻抗描述不判磁珠，需 ferrite/bead/磁珠 关键词或 FB 前缀。'));

  children.push(h1('5 报告结构'));
  children.push(bullet('**findings[]**：rule_id / category / severity / message / evidence / recommendation——每条发现带证据链。'));
  children.push(bullet('**checks_passed[]**：记录"查过且通过"的规则与摘要——审计轨迹完整，不只报错（延续台账纪律）。'));
  children.push(bullet('**notes**：skip 说明（如几何回退降级、网络不可识别）。'));
  children.push(bullet('建议文本只引用通用实践（Ott《EMC Engineering》等），**不编造标准条款号**，数值限值提示"以目标标准为准"。'));

  children.push(h1('6 配置入口'));
  children.push(bullet('阈值：emc_audit 输入参数 thresholds.{x_cap_max_uf, y_cap_max_nf, hf_decoupling_max_uf}。'));
  children.push(bullet('网络名识别：NET_PATTERNS 导出常量（按公司网络命名规范适配）。'));
  children.push(bullet('过滤：类别过滤、严重级过滤（min_severity）、规则目录输出。'));

  children.push(h1('7 使用与维护'));
  children.push(bullet('**何时调用**：STAGE 4（绘图收尾）或对既有图纸审查；需要编译层时先 compile_project。'));
  children.push(bullet('**助手职责边界**：AI 消费报告做解释与整改建议，不改判定结果；发现疑似误报先调 NET_PATTERNS/阈值复跑，仍异常再报人工。'));
  children.push(bullet('**级别调整原则**：error 仅用于已造成过事故的模式（当前 12 条无 error 默认级，待按公司事故史决定是否升级）。'));
  children.push(bullet('**修订同步**：阈值修订须同步——本表版本号 ↑、emc_audit 调用配置、说明书 4.11 节引用、"孙金亮确认"列。'));

  children.push(h1('8 测试与待实测'));
  children.push(p('37 单测覆盖：网分类 15 断言、容值/阻值解析、元件分类（含 Q 前缀被 MHz 值覆写为晶振的边界）、12 规则各自触发/通过/跳过三分支、flyback 参考板整板报告、类别/严重级过滤、规则目录、几何回退降级、排序。'));
  children.push(bullet('[ ] 实机调用走完整桥接链路（compile_project → emc_audit），确认 componentParameters 实际键名。'));
  children.push(bullet('[ ] 公司真实图纸验证 12 条规则误报率，据实调 NET_PATTERNS 与阈值。'));
  children.push(bullet('[ ] 大图纸逐元件取数耗时可接受性确认（预计与 check_connectivity 同量级）。'));

  return { title: 'altium-mcp EMC 审计功能说明', subtitle: 'emc_audit 12 条确定性规则 · 阈值配置 · 报告结构', metas: [['版本', '规则表 V1.0（2026-10-28）'], ['日期', DOC_DATE], ['状态', 'L1 已编码 37 单测；实机实测待做；阈值终值待确认（11-13）'], ['系列', 'docs/项目文档-Word 系列 07']], children, header: 'altium-mcp EMC 审计说明 07' };
}

// =====================================================================
// 08 后续规划与待办
// =====================================================================
function build08() {
  const children = [];

  children.push(h1('1 当前状态'));
  children.push(p(`${VERSION}（2026-11-03 夜间批次收官）：审查驱动的正确性加固与性能修复——6 个 P1 落地 5 个半、pascal-gate 门禁上线、Token 瘦身（instructions -73%）、批量引脚热点实机验证；204 单测全绿；部署包 altium-mcp-intranet-20261103-final.zip 产出。`));

  children.push(h1('2 v1.0-rc 待办'));
  children.push(bullet('编排层接入 MCP 工具注册——建议以 **plan_edits 只读工具**形态暴露计划，执行仍走既有工具（保持审计粒度）；src/orchestration/ 已编码（10 类确定性意图 + schema 校验闭环 + LLM 规划提示词）。'));
  children.push(bullet('真实产品演示——试点产品确定后做模块实例化演示（依赖沈鹏程 11-06 前定产品）。'));
  children.push(bullet('稳定性与性能优化。'));

  children.push(h1('3 待用户决策（夜间批次遗留）'));
  children.push(makeTable(
    ['#', '事项', '说明'],
    [
      ['1', 'T5 响应方向编码方案', '需实机读一次 Error 对话框 / Messages 面板文案（候选：TEncoding 不支持 / COM 安全弹框 / CreateObject 受限）；当前 report-only'],
      ['2', 'PrjPcb 保存', 'AD 打开工程后 Ctrl+S 一次，持久化 Sheet1/3 成员（冷启动 DM 层枚举 0 的根因）'],
      ['3', 'GitHub push', 'dev 分支夜间提交约 15 个待推（走 127.0.0.1:10808 SOCKS）'],
      ['4', 'emc_audit 实机实测', '需真实产品图纸（与试点产品确定联动）'],
      ['5', '编排层接入方式 + MCP SDK v2 迁移时机', '接入形态见第 2 节；SDK v2 评估后定'],
    ],
  ));

  children.push(h1('4 11-12 月里程碑（v1.0 收尾）'));
  children.push(makeTable(
    ['周', '里程碑'],
    [
      ['11.2 - 11.6', '试点产品确定（沈鹏程，11.6 前）；编排层接入 MCP 注册（plan_edits）'],
      ['11.9 - 11.20', '真实产品模块实例化演示；EMC 规则阈值定稿（孙金亮，11.13）'],
      ['11.23 - 11.27', '**v1.0 发布**：功能冻结、稳定性优化、说明书/部署文档定稿、评审'],
      ['12.1 - 12.11', '验收材料与组织验收；在研板只读分析演示（替代新投板）'],
      ['12.14 - 12.25', 'ERP 受控归档、项目总结报告'],
    ],
  ));
  children.push(p('依赖输入：试点产品（11.6）、EMC 阈值终值（11.13）、标准库路径与命名规范。'));

  children.push(h1('5 PCB 侧范围决策（2027 H1）'));
  children.push(p('**决策：PCB 智能设计（自动布局布线、自然语言布线、AI 规则检查修正）及测试板串联验证列入 2027 H1**，本期 v1.0 交付聚焦原理图智能设计正式化。依据：'));
  const n08 = numberer();
  children.push(n08('零基础的现实——PCB 写侧无任何代码；原理图侧达到当前可用度投入约 3.5 个月（含引脚热点、路由、验证等硬问题），11 月剩余窗口不足以做出"可试运行"的 PCB 模块，硬做将同时拖垮原理图侧收尾。'));
  children.push(n08('工作量测算——任务表 11-12 月剩余研发量与实际可投入人力缺口 3-4 倍（2026-10-27《实际进度盘点与保底执行计划》）。'));
  children.push(n08('制度接口——顺延可通过任务表既有的"根据试点效果确定 2027 年全面推广方案"通道落地（11 月评审），无需变更立项框架。'));

  children.push(h1('6 风险'));
  children.push(makeTable(
    ['风险', '对策'],
    [
      ['vlmm_qwen function-calling 不稳定', '编排层确定性兜底已就位（不依赖模型也能执行短命令）；部署首日实测决定主入口'],
      ['试点产品不定导致演示悬空', '里程碑滑动即缩减演示范围，v1.0 发布不受阻'],
      ['AD 版本升级破坏 DelphiScript API', 'workspace 内容指纹同步机制 + 回归测试清单（204 例）'],
    ],
  ));

  children.push(h1('7 长期方向（EMC×AI 四层）'));
  children.push(bullet('**L1 规则引擎**（已完成编码，待实机闭环）——见 07 专篇。'));
  children.push(bullet('**L2 整改案例库 RAG**——内网 Qwen 已有向量库基础设施，知识库目录可加 emc 分类；待启动。'));
  children.push(bullet('**L3 预测**——布局级 EMC 预测（数据依赖实机积累）。'));
  children.push(bullet('**L4 优化**——规则反馈闭环进 optimize_layout。'));
  children.push(bullet('规则扩展候选：RCD 吸收具体拓扑识别、接口网络分类细化、PCB 侧规则（回流地孔/跨分割，需 PCB 数据桥接支持）。'));
  children.push(bullet('模板族扩展：buck-power-stage 模板固化、系列骨架与跨图纸契约、公司产品模板族反推。'));

  return { title: 'altium-mcp 后续规划与待办', subtitle: 'v1.0-rc 待办 · 待决策事项 · 里程碑 · 风险 · 长期方向', metas: [['版本', VERSION + ' 时点'], ['日期', DOC_DATE], ['来源', 'CHANGELOG / 夜间批次计划 / 10 月阶段总结报告'], ['系列', 'docs/项目文档-Word 系列 08']], children, header: 'altium-mcp 后续规划 08' };
}

module.exports = { build01, build03, build04, build05, build06, build07, build08, DOC_DATE, VERSION };
