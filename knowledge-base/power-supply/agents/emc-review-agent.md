# EMC 审查 Agent 详细实现方案

> 本文档为 EMC 审查 Agent 的详细实现方案，覆盖 Agent 目标、输入参数定义、审查规则引擎设计、知识库依赖、MCP 工具调用链、输出格式、Altium MCP 集成点、对话流程示例、实现伪代码及审查规则矩阵。面向 AI Skills 在 Agent 开发阶段的结构化检索与实现指导。

---

## 1. Agent 目标

读取 Altium 原理图与 PCB 设计数据，自动执行电磁兼容（EMC）审查，覆盖传导发射、辐射发射、传导/辐射敏感度及 PCB 布局 EMC 四大维度，输出结构化审查报告与整改建议。

**核心价值：**
- 将 EMC 审查从人工 2 天缩短至自动化 30 分钟
- 同时支持军用 GJB151B 与民用 IEC61000/EN55032 标准审查项
- 基于规则引擎 + 知识库 RAG 双驱动，覆盖 CE/RE/CS/RS 全频段
- 自动定位超标风险点，给出可执行的整改方案（滤波器/屏蔽/接地/吸收），审查结论带风险等级与余量分析

---

## 2. 输入参数定义

### 2.1 必需参数

| 参数名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| schematic_project_id | string | Altium 原理图项目 ID | "PRJ_SCHEM_001" |
| pcb_project_id | string | Altium PCB 项目 ID | "PRJ_PCB_001" |
| standard_type | enum | 审查标准类型 | "GJB151B" |
| application | enum | 应用场景（决定限值平台） | "military" |

> `standard_type` 取值：`GJB151B`（军用）、`IEC61000`（民用，含 EN55032/EN55035）、`CISPR22`、`FCC_Part15`、`auto`（按 application 自动匹配）。

### 2.2 可选参数（提供默认值）

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| review_depth | enum | standard | 审查深度：quick/standard/deep |
| focus_bands | list | [] | 关注频段，如 ["150kHz-1MHz","30MHz-200MHz"]，空为全频段 |
| review_items | list | [] | 指定审查项，如 ["CE102","RE102","CS101"]，空为全部适用项 |
| platform | enum | ground | 军用平台：ground/naval/aircraft/missile（影响限值等级） |
| margin_target_db | float | 6.0 | 目标余量（dB），军标默认 6dB，民标可设 3dB |
| switching_freq_khz | float | 0 | 主开关频率（kHz），0 表示从原理图自动提取 |
| include_pcb_layout | bool | true | 是否执行 PCB 布局 EMC 审查 |
| previous_report_id | string | "" | 上一次审查报告 ID，用于增量审查对比 |

### 2.3 输入参数 JSON Schema

```json
{
  "schematic_project_id": "PRJ_SCHEM_001",
  "pcb_project_id": "PRJ_PCB_001",
  "standard_type": "GJB151B",
  "application": "military",
  "review_depth": "standard",
  "focus_bands": ["150kHz-1MHz", "30MHz-200MHz"],
  "review_items": ["CE102", "RE102", "CS101", "CS114", "RS103"],
  "platform": "ground",
  "margin_target_db": 6.0,
  "switching_freq_khz": 120,
  "include_pcb_layout": true,
  "previous_report_id": ""
}
```

---

## 3. 审查规则引擎设计

规则引擎按 EMI 发射（CE/RE）、EMS 敏感度（CS/RS）、PCB 布局三大类组织，每条规则独立可执行，输出通过/警告/失败三级判定。

### 3.1 EMI 传导发射审查规则

| 规则 ID | 审查项 | 标准对应 | 频段 | 检查方法 | 通过判据 |
|---------|--------|----------|------|----------|----------|
| CE-001 | CE101 低频传导发射 | GJB151B CE101 | 25Hz~10kHz | 提取输入级电感/电容，估算低频阻抗 | 低频阻抗满足限值衰减需求 |
| CE-002 | CE102 开关频率谐波 | GJB151B CE102 | 10kHz~10MHz | 提取开关频率，估算基波与谐波峰值 | 峰值低于限值且余量 ≥ 6dB |
| CE-003 | CE102 差模噪声衰减 | GJB151B CE102 | 150kHz~1MHz | 检查 X 电容容量与差模电感，计算截止频率 | 截止频率 < 最低干扰频率/3 |
| CE-004 | CE102 共模噪声衰减 | GJB151B CE102 | 1MHz~10MHz | 检查共模电感量与 Y 电容，计算共模插入损耗 | 插入损耗 ≥ 40dB @目标频段 |
| CE-005 | EMI 滤波器拓扑完整性 | EN55032 / GJB151B | 150kHz~30MHz | 检查滤波器是否含共模+差模两级 | 覆盖全频段，无双级缺失 |
| CE-006 | Y 电容漏电流校核 | 安规约束 | 50Hz | 按 Y 电容总量计算漏电流 | 民用 < 3.5mA，军用 < 0.5mA |
| CE-007 | X 电容放电电阻 | 安规约束 | - | 校核 R×C 放电时间常数 | 断电 1s 内电压 < 34V |
| CE-008 | 滤波器谐振频率避让 | CS101/CS114 | 25Hz~200MHz | 计算滤波器 LC 谐振频率 | 谐振点不在注入频段内 |

### 3.2 EMI 辐射发射审查规则

| 规则 ID | 审查项 | 标准对应 | 频段 | 检查方法 | 通过判据 |
|---------|--------|----------|------|----------|----------|
| RE-001 | RE101 磁场辐射 | GJB151B RE101 | 25Hz~100kHz | 检查磁性元件屏蔽与布局间距 | 磁场强度低于限值 |
| RE-002 | RE102 开关节点面积 | GJB151B RE102 | 10kHz~18GHz | 从 PCB 提取开关节点铜皮面积 | 面积最小化，减小天线效应 |
| RE-003 | RE102 开关边沿速率 | GJB151B RE102 | 30MHz~1GHz | 检查驱动电阻与吸收电路 | dv/dt 与 di/dt 在损耗与 EMI 间平衡 |
| RE-004 | RE102 时钟谐波 | GJB151B RE102 | 30MHz~1GHz | 提取控制芯片时钟频率，估算谐波 | 谐波峰值低于限值 6dB |
| RE-005 | RE102 屏蔽体完整性 | GJB151B RE102 | 200MHz~18GHz | 检查机壳缝隙与孔洞尺寸 | 最大缝隙 < λ/20（最高频率） |
| RE-006 | RE102 线缆辐射 | EN55032 / GJB151B | 30MHz~1GHz | 检查线缆滤波与共模电流抑制 | 线缆加装磁环/共模电感 |
| RE-007 | RE102 返回路径连续性 | PCB 规则 | 30MHz~1GHz | 检查高频信号返回电流路径 | 无跨分割地平面走线 |

### 3.3 EMS 敏感度审查规则

| 规则 ID | 审查项 | 标准对应 | 频段/条件 | 检查方法 | 通过判据 |
|---------|--------|----------|-----------|----------|----------|
| CS-001 | CS101 低频传导敏感度 | GJB151B CS101 | 30Hz~150kHz | 检查输入级低频阻抗与电压裕量 | 注入下功能正常，输出纹波无异常增量 |
| CS-002 | CS114 集束电流注入 | GJB151B CS114 | 10kHz~200MHz | 检查共模电感高频阻抗与 Y 电容旁路 | 注入曲线下信号端口功能正常 |
| CS-003 | CS115 脉冲激励 | GJB151B CS115 | 50ns 脉冲 | 检查 TVS/去耦电容/光耦隔离 | 快速瞬态下无误触发 |
| CS-004 | CS106 尖峰注入 | GJB151B CS106 | 电源线尖峰 | 检查输入端 MOV/GDT/TVS 组合 | 无复位、无损坏 |
| CS-005 | EFT 电快速瞬变 | IEC61000-4-4 | ±2kV 电源线 | 检查去耦电容与控制电路隔离 | 功能正常，无误动作 |
| CS-006 | Surge 浪涌 | IEC61000-4-5 | ±4kV 线地 | 检查 MOV+GDT+TVS 多级保护 | 无损坏，功能正常 |
| RS-001 | RS103 辐射敏感度 | GJB151B RS103 | 2MHz~40GHz | 检查屏蔽效能与敏感电路保护 | 规定场强（10~200V/m）下功能正常 |
| RS-002 | RS103 接口滤波 | GJB151B RS103 | 2MHz~40GHz | 检查信号接口 TVS/滤波器 | 瞬态干扰不损坏接口器件 |
| RS-003 | IEC61000-4-3 辐射抗扰 | IEC61000-4-3 | 80MHz~6GHz | 检查屏蔽与反馈电路防扰 | 3~10V/m 下输出精度不超差 |
| RS-004 | ESD 静电放电 | IEC61000-4-2 | ±8kV 接触 | 检查接口 ESD 保护与接地 | 放电后功能正常 |

### 3.4 PCB 布局 EMC 审查规则

以下规则引用 `modules/10-pcb-layout-emc.md` 第 8 节 EMC 布局检查规则表，完整矩阵见第 10 节。

| 规则 ID | 对应 EMC 规则 | 审查内容 | 检查方法 | 通过判据 |
|---------|--------------|----------|----------|----------|
| PCB-001 | EMC-01 | EMI 滤波器输入输出线禁止平行 | PCB 网络拓扑分析 | 输入输出走线无平行耦合段 |
| PCB-002 | EMC-02 | 开关节点铜箔面积最小化 | 提取开关节点多边形面积 | 面积 < 设计阈值（按拓扑） |
| PCB-003 | EMC-03 | 高 di/dt 回路面积最小化 | 计算关键回路包围面积 | Buck < 2cm²，全桥 < 5cm² |
| PCB-005 | EMC-05 | Y 电容引线总长度 | 网络走线长度统计 | 引线总长 < 10mm |
| PCB-007 | EMC-07 | 散热器接大地（PE） | 网络连通性检查 | 散热器网络连接到 PE |
| PCB-009 | EMC-09 | 输出功率线与反馈线分离 | 走线拓扑检查 | 功率与反馈无并行/交叉 |
| PCB-011 | 叠层完整性 | 每信号层紧邻完整参考面 | 层叠结构分析 | 信号层均紧邻 GND/PWR 平面 |
| PCB-012 | 地平面分割 | 信号不跨分割地平面 | 返回路径分析 | 无跨分割走线 |

---

## 4. 知识库依赖

| 知识库文件 | 用途 | 关键内容 |
|------------|------|----------|
| review/emc-review-guide.md | EMC 审查核心指南 | CE/RE/CS/RS 审查要点、屏蔽/接地/线缆审查、GJB151B vs IEC61000 差异、常见 EMC 问题与整改方案 |
| modules/01-emi-filter.md | EMI 滤波器设计知识 | 共模/差模噪声机理、滤波器拓扑、共模电感设计、X/Y 电容选型、插入损耗计算、GJB151B 测试项对应 |
| modules/10-pcb-layout-emc.md | PCB 布局 EMC 规则 | 叠层设计、功率回路最小化、接地策略、高频走线、EMC 布局检查规则表（EMC-01~EMC-10） |
| standards/military-standards.md | 军用标准限值 | GJB151B 测试项目与限值（CE102/CS101/CS114/RE102/RS103）、降额准则、环境适应性 |
| standards/civilian-standards.md | 民用标准限值 | IEC61000-4 系列抗扰度、EN55032 发射限值、安规间距、认证流程 |

### 知识库检索策略

```
输入参数 (standard_type, application, review_items)
    ├─▶ 元数据过滤: standard_type=GJB151B → 加载 military-standards.md 限值表
    ├─▶ 向量检索: "CE102 共模噪声 滤波器设计" → 匹配 01-emi-filter.md + emc-review-guide.md
    ├─▶ 关键词检索: "PCB 开关节点 回路面积" → 匹配 10-pcb-layout-emc.md
    ├─▶ 规则映射: review_items=["CE102"] → 加载 CE-001~CE-008 规则集
    └─▶ 整改案例检索: 超标项 → "CE 高频超标 共模电感 Y电容" → 匹配整改方案
```

---

## 5. MCP 工具调用链

```
Step 1: get_schematic_data(project_id)
    → 返回: 原理图网络表、元件参数、拓扑结构
    → 用途: 提取 EMI 滤波器元件、开关频率、保护电路

Step 2: get_pcb_layers(project_id)
    → 返回: 层叠结构、铜厚、叠层顺序
    → 用途: 叠层完整性审查、参考面连续性检查

Step 3: get_all_nets(project_id)
    → 返回: 网络列表、网络类、网络属性
    → 用途: 识别开关节点、功率网络、敏感信号网络

Step 4: get_component_pins(component_ref)
    → 返回: 引脚网络连接、引脚位置坐标
    → 用途: 计算回路面积、检查 Y 电容引线长度

Step 5: rule_engine.evaluate(schematic, pcb, nets, rules)
    → 返回: 每条规则的判定结果（pass/warn/fail）+ 风险等级

Step 6: generate_rectification(fail_items, knowledge_base)
    → 返回: 针对每个失败项的具体整改方案 + 验证方法

Step 7: generate_report(template="emc_review", data={results, rectifications})
    → 返回: 结构化 EMC 审查报告（YAML/Markdown）
```

---

## 6. 输出格式

Agent 输出结构化 EMC 审查报告，采用 YAML 格式，包含审查项列表、通过/整改项/风险等级及具体整改方案。

```yaml
emc_review_report:
  # 1. 审查基本信息
  meta:
    project_id: "PRJ_PCB_001"
    schematic_project_id: "PRJ_SCHEM_001"
    standard: "GJB151B"
    platform: "ground"
    review_depth: "standard"
    switching_freq: "120 kHz"
    margin_target_db: 6.0

  # 2. 审查总览
  summary:
    total_items: 32
    passed: 24
    warnings: 4
    failed: 4
    overall_risk: "high"          # low/medium/high
    pass_rate: "75%"
    estimated_ce_margin_db: 4     # CE 最差余量
    estimated_re_margin_db: -3    # RE 超标 3dB（负值表示超标）
    high_risk_items: ["CE-002 谐波余量不足", "RE-002 节点面积超标", "PCB-003 回路面积超标"]

  # 3. 审查项明细
  review_items:
    - rule_id: "CE-002"
      category: "CE"
      item: "CE102 开关频率谐波"
      standard_ref: "GJB151B CE102"
      frequency_band: "10kHz~10MHz"
      status: "fail"
      risk_level: "high"
      detail: "120kHz 基波余量 6dB；240kHz 二次谐波估算 72dBuV，
               限值 74dBuV，余量仅 2dB"
      evidence: "开关频率=120kHz，X电容=0.47uF，差模电感=10uH"

    - rule_id: "RE-002"
      category: "RE"
      item: "RE102 开关节点面积"
      standard_ref: "GJB151B RE102"
      frequency_band: "30MHz~1GHz"
      status: "fail"
      risk_level: "high"
      detail: "MOSFET 漏极开关节点铜皮 380mm²，推荐 < 200mm²，
               预估 120MHz 谐波超标约 3dB"
      evidence: "节点 NET=SW_NODE, area=380mm²"

    - rule_id: "PCB-003"
      category: "PCB"
      item: "高 di/dt 回路面积"
      standard_ref: "PCB-EMC-03"
      status: "fail"
      risk_level: "high"
      detail: "Buck 输入回路面积 3.2cm²，超出阈值 2.0cm²"
      evidence: "回路: Cin→Q1→D1, area=3.2cm²"

    - rule_id: "CS-001"
      category: "CS"
      item: "CS101 低频传导敏感度"
      standard_ref: "GJB151B CS101"
      status: "pass"
      risk_level: "low"
      detail: "输入级电感 100uH，低频阻抗充足，电压裕量满足"

  # 4. 整改建议
  rectifications:
    - target_rule: "CE-002"
      priority: "P0"
      problem: "开关频率谐波余量不足（二次谐波仅 2dB）"
      solutions:
        - solution: "增大 X 电容至 1.0uF，差模电感增至 22uH"
          effect: "差模截止频率 73kHz→34kHz，240kHz 衰减 +12dB"
          cost_impact: "低"
        - solution: "启用控制芯片频率抖动（dithering）功能"
          effect: "窄带谐波能量分散，准峰值降低 3~6dB"
          cost_impact: "无额外成本"
      verification: "频谱仪复测 CE102 全频段，确认余量 ≥ 6dB"

    - target_rule: "RE-002"
      priority: "P0"
      problem: "开关节点面积过大导致辐射超标"
      solutions:
        - solution: "缩小开关节点铜皮至 180mm²"
          effect: "辐射场强降低约 6dB"
          cost_impact: "无"
        - solution: "开关节点增加 RC 吸收（100Ω+470pF）+ 局部屏蔽罩接地"
          effect: "抑制高频振铃，辐射降低 10~15dB"
          cost_impact: "中，需结构配合"
      verification: "半电波暗室复测 RE102 30MHz~1GHz"

    - target_rule: "PCB-003"
      priority: "P0"
      problem: "Buck 输入回路面积超标（3.2cm² vs 2.0cm²）"
      solutions:
        - solution: "输入电容紧靠 MOSFET，并联 0.1uF 陶瓷电容"
          effect: "回路面积降至 1.5cm²，寄生电感减半"
          cost_impact: "低，需改板"
      verification: "重新提取 PCB 回路面积并复算"
```

---

## 7. 与 Altium MCP 的集成点

| 集成点 | MCP 工具 | 用途 | 调用时机 |
|--------|----------|------|----------|
| 读取原理图 | get_schematic_data | 获取网络表、元件参数、拓扑结构 | Agent 启动时，提取滤波器与开关参数 |
| 读取 PCB 层叠 | get_pcb_layers | 获取叠层结构、铜厚、层数 | 叠层完整性审查阶段 |
| 获取所有网络 | get_all_nets | 获取网络列表与网络类 | 识别开关节点、功率/信号网络分类 |
| 获取元件引脚 | get_component_pins | 获取引脚坐标与网络连接 | 计算回路面积、Y 电容引线长度 |
| 获取元件属性 | get_component_properties | 查询电容容值、电感量、耐压 | 滤波器参数校核阶段 |
| 读取 PCB 多边形 | get_pcb_polygons | 获取铜皮区域形状与面积 | 开关节点面积审查阶段 |
| 读取 BOM | get_bom_data | 获取完整物料清单 | 元件参数批量提取阶段 |
| 读取网络表 | get_net_list | 验证网络连通性 | 接地连续性与返回路径审查 |

### 集成流程

```
启动审查 → get_schematic_data + get_bom_data → 提取 EMI 滤波器/开关频率/保护电路
         → get_pcb_layers → 叠层完整性 + 参考面连续性
         → get_all_nets → 网络分类（功率/开关/敏感/接地）
         → get_pcb_polygons → 开关节点面积计算
         → get_component_pins → 回路面积 + Y 电容引线长度
         → 规则引擎逐条执行 CE/RE/CS/RS/PCB 规则 → 输出 pass/warn/fail
         → 知识库检索整改案例 → 输出方案 + 验证方法
```

---

## 8. 对话流程示例

```
用户: 帮我审查这个军用 DC-DC 电源的 EMC 设计，标准按 GJB151B，
      原理图项目 PRJ_SCHEM_001，PCB 项目 PRJ_PCB_001，
      重点关注传导发射和辐射发射。

Agent: 收到，正在按 GJB151B 标准执行 EMC 审查...

[Step 1] 读取设计数据:
  - 原理图项目: PRJ_SCHEM_001
  - PCB 项目: PRJ_PCB_001
  - 审查标准: GJB151B（陆军地面平台）
  - 审查深度: standard
  - 关注频段: 10kHz~10MHz（CE102）、10kHz~18GHz（RE102）

[Step 2] 提取关键参数:
  - 拓扑: LLC 半桥谐振
  - 开关频率: 120kHz
  - EMI 滤波器: 共模电感 2mH + X电容 0.47uF + Y电容 2.2nF
  - PCB 层数: 6 层（L2/L5 为 GND）
  - 开关节点: SW_NODE（MOSFET 漏极）

[Step 3] 规则引擎审查（共 18 条适用规则）:
  - CE 传导发射: 8 条规则 → 5 通过 / 1 警告 / 2 失败
  - RE 辐射发射: 7 条规则 → 4 通过 / 1 警告 / 2 失败
  - PCB 布局 EMC: 3 条规则 → 2 通过 / 1 失败

[Step 4] 审查结果:
  失败项（P0 优先整改）:
  1. [CE-002] CE102 开关频率谐波余量不足
     - 240kHz 二次谐波估算 72dBuV，限值 74dBuV，余量仅 2dB
  2. [RE-002] RE102 开关节点面积超标
     - 节点面积 380mm²（推荐 < 200mm²），预估 120MHz 超标 3dB
  3. [PCB-003] Buck 输入回路面积超标
     - 回路面积 3.2cm²（阈值 2.0cm²）

  警告项（P1 关注）:
  4. [CE-004] 共模插入损耗不足（35dB vs 目标 40dB）
  5. [RE-004] 控制芯片时钟谐波接近限值

[Step 5] 整改建议:
  针对 CE-002: 增大 X 电容至 1.0uF + 差模电感 22uH（240kHz 衰减 +12dB）；
               启用频率抖动（准峰值 -3~6dB）
  针对 RE-002: 缩小开关节点铜皮至 180mm²（辐射 -6dB）；
               增加 RC 吸收 + 局部屏蔽罩接地（辐射 -10~15dB）
  针对 PCB-003: 输入电容紧靠 MOSFET，并联 0.1uF 陶瓷电容（回路 3.2→1.5cm²）

[Step 6] 风险评估:
  - 总体风险等级: 高
  - 通过率: 67%（12/18）
  - 建议: 优先整改 3 项 P0 后重新审查，再进行 EMC 暗室测试

完整审查报告已生成。是否需要我导出整改后的原理图修改建议，
或针对某一项失败项做更深入的分析？
```

---

## 9. 实现伪代码

```python
class EMCReviewAgent:
    """EMC 审查 Agent"""

    def __init__(self):
        self.knowledge_base = KnowledgeBase()
        self.mcp_client = AltiumMCPClient()
        self.rule_engine = EMCRuleEngine()
        self.rectification_generator = RectificationGenerator()

    def run(self, user_input: dict) -> dict:
        """Agent 主流程"""
        # Step 1: 参数校验与补全
        params = self.validate_and_complete_params(user_input)
        # Step 2: 读取 Altium 设计数据
        design_data = self.fetch_design_data(params)
        # Step 3: 确定适用审查规则集
        rules = self.rule_engine.select_rules(
            standard=params["standard_type"], platform=params["platform"],
            review_items=params["review_items"],
            include_pcb=params["include_pcb_layout"])
        # Step 4: 执行规则引擎审查
        review_results = self.rule_engine.evaluate(design_data, rules, params)
        # Step 5: 生成整改建议
        rectifications = self.rectification_generator.generate(
            failed_items=self._extract_failed(review_results),
            design_data=design_data, knowledge_base=self.knowledge_base)
        # Step 6: 风险评估与报告生成
        summary = self.assess_risk(review_results)
        report = self.generate_report(
            params=params, design_data=design_data,
            review_results=review_results,
            rectifications=rectifications, summary=summary)
        return report

    def validate_and_complete_params(self, user_input: dict) -> dict:
        """参数校验与默认值补全"""
        required = ["schematic_project_id", "pcb_project_id",
                    "standard_type", "application"]
        for key in required:
            if key not in user_input:
                raise ValueError(f"缺少必需参数: {key}")
        defaults = {"review_depth": "standard", "focus_bands": [],
                    "review_items": [], "platform": "ground",
                    "margin_target_db": 6.0, "include_pcb_layout": True,
                    "switching_freq_khz": 0, "previous_report_id": ""}
        params = {**defaults, **user_input}
        if params["standard_type"] == "auto":
            params["standard_type"] = ("GJB151B" if params["application"]
                == "military" else "IEC61000")
        return params

    def fetch_design_data(self, params: dict) -> dict:
        """通过 MCP 读取 Altium 设计数据"""
        design = {"schematic": self.mcp_client.get_schematic_data(
                      params["schematic_project_id"]),
                  "bom": self.mcp_client.get_bom_data(
                      params["schematic_project_id"])}
        if params["include_pcb_layout"]:
            pid = params["pcb_project_id"]
            design["pcb_layers"] = self.mcp_client.get_pcb_layers(pid)
            design["nets"] = self.mcp_client.get_all_nets(pid)
            design["polygons"] = self.mcp_client.get_pcb_polygons(pid)
            design["component_pins"] = self._fetch_key_component_pins(
                design["schematic"])
        design["switching_freq"] = self._extract_switching_freq(
            design["schematic"], params)
        return design


class EMCRuleEngine:
    """EMC 审查规则引擎"""
    # 规则注册表: rule_id -> handler 方法名（完整映射见第 10 节规则矩阵）
    RULE_REGISTRY = {
        "CE-001": "_check_ce101", "CE-002": "_check_ce102_harmonic",
        "CE-003": "_check_ce102_dm", "CE-004": "_check_ce102_cm",
        "CE-005": "_check_filter_topology", "CE-006": "_check_y_cap_leakage",
        "CE-007": "_check_x_cap_discharge", "CE-008": "_check_filter_resonance",
        "RE-001": "_check_re101", "RE-002": "_check_re102_node_area",
        "RE-003": "_check_re102_edge_rate", "RE-004": "_check_re102_clock",
        "RE-005": "_check_shielding", "RE-006": "_check_cable_radiation",
        "RE-007": "_check_return_path",
        "CS-001": "_check_cs101", "CS-002": "_check_cs114",
        "CS-003": "_check_cs115", "CS-004": "_check_cs106",
        "RS-001": "_check_rs103",
        "PCB-001": "_check_emc01_filter_io", "PCB-002": "_check_emc02_node_area",
        "PCB-003": "_check_emc03_loop_area", "PCB-005": "_check_emc05_ycap_lead",
    }

    def select_rules(self, standard, platform, review_items, include_pcb):
        """根据标准与参数选择适用规则"""
        rules = []
        for rule_id in self.RULE_REGISTRY:
            cat = rule_id.split("-")[0]
            if review_items and not self._item_matches(rule_id, review_items):
                continue
            if cat == "PCB" and not include_pcb:
                continue
            if not self._standard_matches(rule_id, standard):
                continue
            rules.append(rule_id)
        return rules

    def evaluate(self, design_data, rules, params):
        """逐条执行规则，返回结果列表"""
        results = []
        for rule_id in rules:
            handler = getattr(self, self.RULE_REGISTRY[rule_id])
            result = handler(design_data, params)
            results.append({"rule_id": rule_id, "status": result["status"],
                            "risk_level": result["risk"], "detail": result["detail"],
                            "evidence": result.get("evidence", ""),
                            "margin_db": result.get("margin_db")})
        return results

    def _check_ce102_cm(self, design, params):
        """CE-004: 共模噪声衰减审查（示例规则）"""
        l_cm = self._extract_component_value(design, "common_mode_choke")
        c_y = self._extract_component_value(design, "y_capacitor")
        if l_cm is None or c_y is None:
            return {"status": "fail", "risk": "high",
                    "detail": "未找到共模电感或 Y 电容，滤波器不完整"}
        fc_cm = 1 / (2 * 3.14159 * (l_cm / 2) * c_y)
        il_1mhz = self._calc_insertion_loss(l_cm, c_y, 1e6)
        target_il = 40  # dB
        if il_1mhz >= target_il + params["margin_target_db"]:
            status, risk = "pass", "low"
        elif il_1mhz >= target_il:
            status, risk = "warn", "medium"
        else:
            status, risk = "fail", "high"
        return {"status": status, "risk": risk,
                "detail": f"共模电感 {l_cm*1e3:.1f}mH, Y电容 {c_y*1e9:.1f}nF, "
                          f"截止频率 {fc_cm/1e3:.1f}kHz, "
                          f"1MHz插入损耗 {il_1mhz:.1f}dB (目标 {target_il}dB)",
                "evidence": f"L_cm={l_cm*1e3}mH, C_y={c_y*1e9}nF",
                "margin_db": il_1mhz - target_il}


class RectificationGenerator:
    """整改建议生成器 — 按失败项检索知识库整改案例并生成结构化方案"""

    RECTIFICATION_MAP = {  # 关键词 -> 整改方向速查
        "CE 低频超标": "增大 X 电容，加差模电感",
        "CE 高频超标": "增大共模电感，加 Y 电容",
        "RE 节点超标": "缩小节点面积，加 RC 吸收，加屏蔽罩",
        "RE 线缆超标": "线缆加磁环，共模电感抑制",
        "回路面积超标": "输入电容紧靠开关管，并联陶瓷电容",
        "屏蔽不足": "改善搭接，加导电衬垫，360°接地",
    }

    def generate(self, failed_items, design_data, knowledge_base):
        """为每个失败项检索知识库并生成整改建议"""
        rectifications = []
        for item in failed_items:
            cases = knowledge_base.search(
                query=self._build_query(item, design_data), top_k=3,
                filters={"category": "rectification"})
            rectifications.append({
                "target_rule": item["rule_id"],
                "priority": self._calc_priority(item),
                "problem": item["detail"],
                "solutions": [{"solution": c["action"],
                               "effect": c["estimated_effect_db"],
                               "cost_impact": c["cost_level"]} for c in cases],
                "verification": self._get_verification_method(item),
            })
        return rectifications
```

---

## 10. 审查规则矩阵

下表汇总全部审查规则、严重等级与检查方法，作为规则引擎的完整索引。

| 规则 ID | 类别 | 审查项 | 标准对应 | 严重等级 | 检查方法 | 判定依据 |
|---------|------|--------|----------|----------|----------|----------|
| CE-001 | CE | CE101 低频传导 | GJB151B CE101 | 高 | 输入级低频阻抗估算 | 阻抗满足限值衰减 |
| CE-002 | CE | CE102 开关谐波 | GJB151B CE102 | 高 | 开关频率谐波峰值估算 | 余量 ≥ 6dB |
| CE-003 | CE | CE102 差模衰减 | GJB151B CE102 | 高 | X电容+差模电感截止频率 | fc < f_noise/3 |
| CE-004 | CE | CE102 共模衰减 | GJB151B CE102 | 高 | 共模电感+Y电容插入损耗 | IL ≥ 40dB |
| CE-005 | CE | 滤波器拓扑完整性 | EN55032/GJB151B | 高 | 检查共模+差模两级 | 双级齐全 |
| CE-006 | CE | Y电容漏电流 | 安规约束 | 高 | 漏电流计算 | 民用<3.5mA/军用<0.5mA |
| CE-007 | CE | X电容放电电阻 | 安规约束 | 中 | R×C 时间常数 | 1s 内 < 34V |
| CE-008 | CE | 滤波器谐振避让 | CS101/CS114 | 高 | LC 谐振频率计算 | 不在注入频段内 |
| RE-001 | RE | RE101 磁场辐射 | GJB151B RE101 | 中 | 磁性元件屏蔽与间距 | 低于磁场限值 |
| RE-002 | RE | RE102 节点面积 | GJB151B RE102 | 高 | PCB 多边形面积提取 | 面积最小化 |
| RE-003 | RE | RE102 边沿速率 | GJB151B RE102 | 高 | 驱动电阻与吸收检查 | dv/dt 平衡 |
| RE-004 | RE | RE102 时钟谐波 | GJB151B RE102 | 中 | 时钟频率谐波估算 | 余量 ≥ 6dB |
| RE-005 | RE | 屏蔽体完整性 | GJB151B RE102 | 高 | 缝隙/孔洞尺寸检查 | 缝隙 < λ/20 |
| RE-006 | RE | 线缆辐射 | EN55032/GJB151B | 高 | 线缆滤波与共模抑制 | 磁环/共模电感到位 |
| RE-007 | RE | 返回路径连续性 | PCB 规则 | 高 | 返回路径分析 | 无跨分割走线 |
| CS-001 | CS | CS101 传导敏感度 | GJB151B CS101 | 高 | 低频阻抗与电压裕量 | 注入下功能正常 |
| CS-002 | CS | CS114 集束注入 | GJB151B CS114 | 中 | 共模高频阻抗检查 | 端口功能正常 |
| CS-003 | CS | CS115 脉冲激励 | GJB151B CS115 | 中 | TVS/去耦/隔离检查 | 无误触发 |
| CS-004 | CS | CS106 尖峰注入 | GJB151B CS106 | 高 | MOV/GDT/TVS 组合检查 | 无复位损坏 |
| CS-005 | CS | EFT 抗扰 | IEC61000-4-4 | 高 | 去耦与隔离检查 | ±2kV 功能正常 |
| CS-006 | CS | Surge 抗扰 | IEC61000-4-5 | 高 | 多级保护检查 | ±4kV 无损坏 |
| RS-001 | RS | RS103 辐射敏感度 | GJB151B RS103 | 高 | 屏蔽效能与敏感电路 | 场强下功能正常 |
| RS-002 | RS | 接口滤波 | GJB151B RS103 | 中 | 接口 TVS/滤波检查 | 瞬态不损坏 |
| RS-003 | RS | 辐射抗扰（民用） | IEC61000-4-3 | 中 | 屏蔽与反馈防扰 | 3~10V/m 不超差 |
| RS-004 | RS | ESD 静电放电 | IEC61000-4-2 | 高 | ESD 保护与接地 | ±8kV 功能正常 |
| PCB-001 | PCB | 滤波器输入输出隔离 | EMC-01 | 高 | 网络拓扑分析 | 无平行耦合 |
| PCB-002 | PCB | 开关节点面积 | EMC-02 | 高 | 多边形面积提取 | < 设计阈值 |
| PCB-003 | PCB | 回路面积最小化 | EMC-03 | 高 | 回路包围面积计算 | Buck<2cm²/全桥<5cm² |
| PCB-004 | PCB | 敏感信号间距 | EMC-04 | 高 | 走线间距检查 | > 5mm |
| PCB-005 | PCB | Y电容引线长度 | EMC-05 | 高 | 走线长度统计 | < 10mm |
| PCB-006 | PCB | 变压器下方无信号 | EMC-06 | 中 | 区域规则检查 | 无控制信号 |
| PCB-007 | PCB | 散热器接大地 | EMC-07 | 高 | 网络连通性检查 | 连接 PE |
| PCB-008 | PCB | 时钟走在地层间 | EMC-08 | 中 | 层叠与走线层检查 | 位于两 GND 间 |
| PCB-009 | PCB | 功率/反馈分离 | EMC-09 | 高 | 走线拓扑检查 | 无并行交叉 |
| PCB-010 | PCB | 连接器保护 | EMC-10 | 中 | 元件位置检查 | 5mm 内有 TVS |
| PCB-011 | PCB | 叠层完整性 | 叠层规则 | 高 | 层叠结构分析 | 信号层紧邻参考面 |
| PCB-012 | PCB | 地平面不跨分割 | 接地规则 | 高 | 返回路径分析 | 无跨分割走线 |

> 严重等级定义：高=直接导致 EMC 测试失败或安全风险，必须整改；中=余量不足存在超标风险，建议整改（P1）；低=余量充足，记录备查。

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08 | 初始版本，建立 EMC 审查 Agent 完整实现方案 | AI Knowledge Base |
