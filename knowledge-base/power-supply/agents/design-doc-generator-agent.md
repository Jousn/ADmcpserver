# 设计文档生成 Agent 详细实现方案

> 本文档为设计文档生成 Agent 的详细实现方案，覆盖 Agent 目标、输入参数定义、文档模板引擎、知识库依赖、MCP 工具调用链、输出格式、Altium MCP 集成点、对话流程示例、实现伪代码及文档模板章节矩阵。面向 AI Skills 在 Agent 开发阶段的结构化检索与实现指导。

---

## 1. Agent 目标

从 Altium Designer 项目中自动采集原理图、PCB、网络、元件及设计规则数据，结合知识库中的审查清单、EMC 指南、可靠性指南与军/民用标准，自动生成结构化设计文档（设计说明书、评审材料、测试方案、综合报告），统一文档格式，减少人工编写时间，确保文档完整性。

**核心价值：**
- 将设计文档编写从人工 1~3 天缩短至自动化 30 分钟
- 统一文档格式与章节结构，消除风格不一致问题
- 自动从设计数据中提取参数填充模板，减少人工抄写错误
- 覆盖军用电源文档特殊要求（GJB 符合性声明、环境适应性说明、可靠性预计）
- 确保文档与设计数据一致，设计变更后可一键刷新文档

---

## 2. 输入参数定义

### 2.1 必需参数

| 参数名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| project_name | string | 项目名称，用于文档标题与页眉 | "机载28V直流电源模块" |
| doc_type | enum | 文档类型：design_specification / review_material / test_plan / report_all | "report_all" |
| altium_project_id | string | Altium 项目唯一标识，用于调用 MCP 工具采集设计数据 | "PRJ-2026-0042" |

### 2.2 可选参数（提供默认值）

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| doc_format | enum | Markdown | 文档输出格式：Markdown / DOCX / HTML |
| review_level | enum | full | 审查级别：quick（快速）/ standard（标准）/ full（全面） |
| target_standard | enum | auto | 目标标准：auto / military / civilian，auto 表示根据项目元数据自动判定 |
| include_emc_section | bool | true | 是否生成 EMC 设计专章 |
| include_reliability_section | bool | true | 是否生成可靠性设计专章 |
| include_thermal_section | bool | true | 是否生成热设计专章 |
| author | string | "AI Design Assistant" | 文档署名作者 |
| version | string | "1.0" | 文档版本号 |
| output_path | string | "./output" | 文档输出目录 |
| locale | enum | zh-CN | 文档语言：zh-CN / en-US |

### 2.3 输入参数 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["project_name", "doc_type", "altium_project_id"],
  "properties": {
    "project_name": { "type": "string", "minLength": 1, "maxLength": 200,
      "description": "项目名称，用于文档标题" },
    "doc_type": { "type": "string",
      "enum": ["design_specification", "review_material", "test_plan", "report_all"],
      "description": "文档类型，report_all 表示生成综合报告（含全部三类文档）" },
    "altium_project_id": { "type": "string", "minLength": 1,
      "description": "Altium 项目唯一标识" },
    "doc_format": { "type": "string", "enum": ["Markdown", "DOCX", "HTML"], "default": "Markdown" },
    "review_level": { "type": "string", "enum": ["quick", "standard", "full"], "default": "full" },
    "target_standard": { "type": "string", "enum": ["auto", "military", "civilian"], "default": "auto" },
    "include_emc_section": { "type": "boolean", "default": true },
    "include_reliability_section": { "type": "boolean", "default": true },
    "include_thermal_section": { "type": "boolean", "default": true },
    "author": { "type": "string", "default": "AI Design Assistant" },
    "version": { "type": "string", "default": "1.0" },
    "output_path": { "type": "string", "default": "./output" },
    "locale": { "type": "string", "enum": ["zh-CN", "en-US"], "default": "zh-CN" }
  }
}
```

---

## 3. 文档模板引擎

文档模板引擎基于章节模板定义 + 数据占位符 + 条件块渲染机制，根据 `doc_type` 加载对应模板，将采集到的设计数据与知识库内容填充至占位符，渲染条件章节（如军用 GJB 声明块仅在 `target_standard=military` 时输出）。

### 3.1 设计说明书模板结构

| 章节 | 内容描述 | 关键数据来源 | 条件 |
|------|----------|--------------|------|
| 1. 概述 | 项目背景、设计目标、应用场景、文档范围 | 用户输入 + 项目元数据 | 始终输出 |
| 2. 技术指标 | 输入输出参数、效率、纹波、调整率、保护功能清单 | 原理图元件参数 + 设计规格 | 始终输出 |
| 3. 系统架构 | 整体功能框图、功率级与控制级划分、信号流向 | 原理图顶层连接关系 | 始终输出 |
| 4. 电路设计 | 各功能单元电路说明（EMI/PFC/DC-DC/保护/控制） | 原理图网表 + 元件属性 | 始终输出 |
| 5. PCB 设计 | 层叠结构、布局策略、关键布线规则、地平面划分 | PCB 层数据 + 设计规则 | 始终输出 |
| 6. EMC 设计 | EMI 滤波器设计、屏蔽接地、标准符合性分析 | EMC 指南 + PCB 数据 | include_emc_section |
| 7. 可靠性设计 | 降额设计、MTBF 预计、FMEA、环境适应性 | 可靠性指南 + BOM | include_reliability_section |
| 8. 测试方案 | 测试项目清单、测试条件、合格判据、设备清单 | 测试鉴定指南 + 标准库 | 始终输出 |
| 附录 A | GJB 符合性声明与标准对照表 | 军用标准库 | target_standard=military |
| 附录 B | BOM 清单与元件降额表 | BOM 数据 + 降额标准 | 始终输出 |
| 附录 C | 环境适应性说明（温度/振动/湿热/盐雾） | 军用标准环境试验项 | target_standard=military |

### 3.2 评审材料模板结构

| 章节 | 内容描述 | 关键数据来源 |
|------|----------|--------------|
| 1. 评审概述 | 评审目的、范围、依据标准、评审级别 | 用户输入 + 标准库 |
| 2. 设计合规性矩阵 | 逐条对照审查清单的通过/整改/不适用状态 | 设计审查清单 + 设计数据 |
| 3. 电气安全审查结果 | 安规间距、绝缘耐压、接地连续性核查结果 | 审查清单第1章 + PCB 规则 |
| 4. 拓扑与元器件审查结果 | 拓扑匹配、降额、生命周期、单一来源审查 | 审查清单第2~3章 + BOM |
| 5. EMC 审查结果 | 传导/辐射发射与敏感度审查、整改建议 | EMC 审查指南 + PCB 数据 |
| 6. 可靠性审查结果 | MTBF 预计、FMEA、冗余设计审查 | 可靠性指南 + BOM |
| 7. 风险项汇总 | 高风险项清单、整改责任人与计划 | 以上审查结果汇总 |
| 8. 评审结论 | 通过 / 有条件通过 / 不通过，附整改要求 | 综合判定 |

### 3.3 测试方案模板结构

| 章节 | 内容描述 | 关键数据来源 |
|------|----------|--------------|
| 1. 测试概述 | 测试目的、阶段划分、样本数量、通过判据 | 测试鉴定指南 |
| 2. 研发测试方案 | 功能测试清单、环境预测试项目与方法 | 测试鉴定指南第2章 |
| 3. 型式试验方案 | 安全合规、EMC 合规、环境定型测试项 | 测试鉴定指南 + 标准库 |
| 4. 可靠性鉴定方案 | 寿命验证、MTBF 验证、环境适应性试验 | 测试鉴定指南 + 可靠性指南 |
| 5. 军用专项测试 | GJB151B EMC 测试项、GJB150A 环境试验项 | 军用标准库 |
| 6. 测试设备清单 | 所需仪器、量程、精度要求 | 测试鉴定指南 |
| 7. 测试计划表 | 测试顺序、工期估算、资源分配 | 自动排程生成 |

### 3.4 模板渲染机制

模板渲染分三步执行：**(1) 章节定义加载** — 从 YAML 配置加载固定章节与条件章节（如 `{% if target_standard == 'military' %} GJB声明 {% endif %}`）；**(2) 数据占位符替换** — 将设计数据与知识库片段填入 `{{ project_name }}`、`{{ layer_stackup }}` 等占位符，并通过 `{% for item in bom %}` 循环自动生成表格；**(3) 格式渲染输出** — 按目标格式输出 Markdown（.md）、DOCX（python-docx 生成 .docx）或 HTML（Jinja2 模板生成 .html）。

---

## 4. 知识库依赖

| 知识库文件 | 用途 | 关键内容 |
|------------|------|----------|
| review/design-review-checklist.md | 评审材料合规性矩阵生成 | 电气安全、拓扑选型、元器件、保护功能、控制环路、热设计、EMC、可制造性审查项与通过标准 |
| review/emc-review-guide.md | EMC 设计专章与 EMC 审查结果填充 | 传导/辐射发射审查要点、EMI 滤波器设计、屏蔽接地、CE/RE 整改速查 |
| review/reliability-review-guide.md | 可靠性设计专章与 MTBF 预计 | GJB/Z 299C 失效率计算、降额设计、FMEA、冗余设计、寿命分析 |
| review/test-qualification-guide.md | 测试方案章节与测试项清单 | 研发测试、型式试验、可靠性鉴定、生产筛选各阶段测试项目与方法 |
| standards/military-standards.md | 军用 GJB 符合性声明与军用专项测试 | GJB 151B EMC 限值、GJB 150A 环境试验、GJB/Z 299C 可靠性预计 |
| standards/civilian-standards.md | 民用标准符合性分析 | IEC 61000 系列、安规标准、能效标准、认证流程 |

### 知识库检索策略

检索按四层路由执行：**(1) 标准判定** — `target_standard=auto` 时查询项目元数据，军用加载 `military-standards.md` 并启用 GJB 附录，民用加载 `civilian-standards.md` 启用认证流程章节；**(2) 文档类型路由** — `doc_type` 决定加载设计说明书/评审材料/测试方案模板集（`report_all` 加载全部三套）；**(3) 知识片段检索** — 按章节主题检索，如 "EMC 滤波器 传导发射" 匹配 `emc-review-guide.md`，"MTBF 失效率计算 GJB" 匹配 `reliability-review-guide.md`，"GJB151B CE102 限值" 匹配 `military-standards.md`，"稳压精度 负载调整率 测试" 匹配 `test-qualification-guide.md`；**(4) 审查项映射** — `design-review-checklist.md` 各章节映射为评审材料合规矩阵。

---

## 5. MCP 工具调用链

```
┌──────────────────────────────────────────────────────────────────┐
│                   工具调用链流程                                   │
└──────────────────────────────────────────────────────────────────┘

Step 1: get_schematic_data(project_id)
    → 返回: 原理图页结构、元件连接关系、网络名称
    → 用途: 提取电路架构、功能单元划分、技术指标参数

Step 2: get_pcb_layers(project_id)
    → 返回: 层叠定义、铜厚、介质厚度、信号/电源/地平面分配
    → 用途: 填充 PCB 设计章节，分析层叠策略与阻抗控制

Step 3: get_all_nets(project_id)
    → 返回: 网络名称列表、网络分类（电源/地/信号）、连接元件
    → 用途: 生成系统架构框图数据、电路设计章节网络说明

Step 4: get_all_designators(project_id)
    → 返回: 元件位号列表、元件类型分类、参考设计ator分组
    → 用途: 生成 BOM 清单、元器件降额表、功能单元元件统计

Step 5: get_pcb_rules(project_id)
    → 返回: 线宽/间距规则、过孔规则、布线规则、物理约束
    → 用途: 填充 PCB 设计章节规则表、电气安全间距核查

Step 6: knowledge_search + template_engine.fill
    → 检索 EMC/可靠性/测试/标准知识片段，填充至模板占位符
    → 返回: 填充后的文档章节内容

Step 7: document_generator.render(filled_sections, doc_format)
    → 渲染输出: Markdown / DOCX / HTML 文档文件
```

数据采集阶段（Step 1~5）按序执行，结果汇总至 `DesignDataAggregator`；知识检索（Step 6）针对各章节主题并行检索；最终模板填充与渲染按文档类型依次输出。

---

## 6. 输出格式

Agent 根据文档类型输出一个或多个结构化文档，以下为各文档类型的 YAML 结构定义。

### 6.1 设计说明书结构

```yaml
design_specification:
  meta: { title: "机载28V直流电源模块 设计说明书", doc_number: "DS-PRJ-2026-0042-V1.0",
          author: "张工", version: "1.0", date: "2026-08-04" }

  overview:
    project_background: "本项目为机载设备提供28V直流供电..."
    design_objectives: ["输入: 28VDC (22~32V宽范围)", "输出: 12V/10A, 120W",
                         "满载效率 ≥ 95%", "满足 GJB 151B EMC 要求"]
    application_scenario: "机载电子设备供电"

  technical_specs:
    input: { voltage_range: "22~32 VDC", max_current: "6.5 A" }
    output: { voltage: "12 V", current: "10 A", power: "120 W", ripple: "< 50 mV", regulation: "±1%" }
    efficiency: { full_load: "≥ 95%", half_load: "≥ 94%" }
    protection: ["过压保护 (OVP): 13.5V", "过流保护 (OCP): 12A", "过温保护 (OTP): 85℃"]

  system_architecture:
    block_diagram: "[自动生成功能框图]"
    power_stages: ["EMI滤波", "DC-DC (LLC半桥)", "同步整流", "输出滤波"]
    control_stages: ["PWM控制 (UCC25600)", "反馈环路", "保护逻辑"]
    signal_flow: "输入→EMI滤波→主开关→变压器→整流→输出滤波→负载"

  circuit_design:
    emi_filter: { components: ["L1,L2 共模电感", "CX1 X电容", "CY1,CY2 Y电容"], notes: "..." }
    dc_dc_stage: { topology: "LLC半桥谐振", switching_freq: "120kHz", key_components: "..." }
    rectification: { type: "同步整流", mosfet: "BSC010NE2LSI", notes: "..." }
    protection_circuits: { ovp: "...", ocp: "...", otp: "..." }
    control_loop: { controller: "UCC25600", compensation: "Type II", bandwidth: "10kHz" }

  pcb_design:
    layer_stackup:
      - { layer: 1, type: "信号层", copper: "1oz" }
      - { layer: 2, type: "地层", copper: "1oz" }
      - { layer: 3, type: "电源层", copper: "2oz" }
      - { layer: 4, type: "信号层", copper: "1oz" }
    layout_strategy: "功率级与控制级分区布置，EMI滤波器靠近输入端口"
    design_rules: { min_track_width: "0.2mm", min_clearance: "0.15mm", power_track_width: "2.0mm (@10A)" }

  emc_design:  # 条件章节
    conducted_emission: { filter_design: "...", expected_margin: ">6dB" }
    radiated_emission: { layout_measures: "开关节点面积最小化", shielding: "机壳屏蔽" }
    standard_compliance: "GJB 151B CE102/RE102"

  reliability_design:  # 条件章节
    derating: { capacitors: "电压降额 ≥ 20%", mosfets: "Vds降额 ≥ 30%, Id降额 ≥ 30%" }
    mtbf_prediction: { method: "GJB/Z 299C 应力分析法", result: "MTBF ≥ 50000h" }
    fmea: "[自动生成的失效模式分析表]"
    environmental_adaptability: { operating_temp: "-55℃~+85℃", vibration: "GJB 150A 振动试验",
                                  humidity: "GJB 150A 湿热试验" }

  test_plan: { development_test: "[功能测试清单引用]", type_test: "[安全+EMC+环境型式试验]",
               reliability_qualification: "[MTBF验证 + 环境耐久]" }

  appendices: { gjb_compliance: "[GJB标准符合性声明对照表]",
                bom_list: "[自动生成BOM清单]",
                environmental_adaptability: "[GJB 150A环境适应性说明]" }
```

### 6.2 评审材料结构

```yaml
review_material:
  meta:
    title: "机载28V直流电源模块 设计评审材料"
    review_level: "full"
    review_date: "2026-08-04"

  overview:
    purpose: "对设计进行全面评审，确认满足技术指标与标准要求"
    scope: "电气安全/拓扑/元器件/保护/EMC/可靠性"
    basis_standards: ["GJB 151B-2013", "GJB 150A-2009", "GJB/Z 299C"]

  compliance_matrix:
    - { id: "ELEC-01", item: "一次/二次电气间隙", status: "PASS", actual: "4.0mm", required: "3.2mm", risk: "低" }
    - { id: "ELEC-02", item: "绝缘耐压", status: "PASS", actual: "1500VAC/1min", required: "1500VAC", risk: "低" }
    - { id: "TOP-01", item: "功率等级匹配", status: "PASS", actual: "LLC 120W", required: "100~250W", risk: "低" }
    - { id: "COMP-01", item: "电压降额", status: "PASS", actual: "80%", required: "≥20%", risk: "低" }
    - { id: "EMC-01", item: "CE102传导发射", status: "WARN", actual: "裕量4dB", required: "裕量≥6dB", risk: "中" }

  review_sections:
    electrical_safety: { result: "通过", items: 8, passed: 8, warnings: 0, failures: 0 }
    topology_components: { result: "通过", items: 12, passed: 11, warnings: 1, failures: 0 }
    emc: { result: "有条件通过", items: 10, passed: 7, warnings: 3, failures: 0, actions: "增加共模电感量" }
    reliability: { result: "通过", items: 8, passed: 8, warnings: 0, failures: 0 }

  risk_summary:
    - { id: "EMC-01", severity: "中", action: "增大共模电感", owner: "李工", due: "2026-08-10" }

  conclusion:
    result: "有条件通过"
    conditions: ["完成EMC整改后提交复评"]
```

### 6.3 测试方案结构

```yaml
test_plan:
  meta: { title: "机载28V直流电源模块 测试方案",
          test_stages: ["研发测试", "型式试验", "可靠性鉴定", "生产筛选"] }

  development_test:
    functional_tests:
      - { item: "稳压精度", method: "全输入×全负载矩阵", criteria: "军用±1%", equipment: "电子负载+万用表" }
      - { item: "满载效率", method: "Pin/Pout扫描", criteria: "≥95%", equipment: "功率分析仪" }
      - { item: "瞬态响应", method: "25%~75%阶跃", criteria: "过冲<5%,恢复<200μs", equipment: "电子负载+示波器" }
    environmental_pretest:
      - { item: "温度扫描", range: "-40℃~+85℃,步进10℃", criteria: "全指标达标" }

  type_test:
    safety_compliance: ["绝缘耐压", "接地连续性", "泄漏电流"]
    emc_compliance:
      - { standard: "GJB 151B", item: "CE102", criteria: "10kHz~10MHz 传导发射限值" }
      - { standard: "GJB 151B", item: "RE102", criteria: "10kHz~18GHz 辐射发射限值" }
      - { standard: "GJB 151B", item: "CS101", criteria: "传导敏感度" }
    environmental_qualification:
      - { standard: "GJB 150A", item: "高温工作", condition: "+85℃ 4h" }
      - { standard: "GJB 150A", item: "低温工作", condition: "-55℃ 4h" }
      - { standard: "GJB 150A", item: "振动", condition: "5~2000Hz" }

  reliability_qualification:
    mtbf_verification: { method: "定时截尾", sample_size: 5, duration: "2000h", criteria: "失效数≤1" }
    environmental_endurance: ["温度循环", "湿热", "盐雾"]

  military_specific:
    - { standard: "GJB 151B", item: "RS103 辐射敏感度", field: "10~200V/m" }
    - { standard: "GJB 151B", item: "CS115 脉冲激励", pulse: "5A, 30ns" }
    - { standard: "GJB 150A", item: "冲击", condition: "后峰锯齿 30g" }

  equipment_list:
    - { name: "可编程交流源", model: "Chroma 61505", range: "300VAC/5A" }
    - { name: "电子负载", model: "Chroma 63804", range: "0~80A" }
    - { name: "功率分析仪", model: "Yokogawa WT3000", accuracy: "0.02%" }
    - { name: "EMI接收机", model: "R&S ESR7", range: "9kHz~7GHz" }

  test_schedule:
    - { phase: "研发测试", duration: "2周", start: "2026-08-10", end: "2026-08-24" }
    - { phase: "型式试验", duration: "4周", start: "2026-08-25", end: "2026-09-22" }
    - { phase: "可靠性鉴定", duration: "12周", start: "2026-09-23", end: "2026-12-15" }
```

---

## 7. 与 Altium MCP 的集成点

| 集成点 | MCP 工具 | 用途 | 调用时机 |
|--------|----------|------|----------|
| 读取原理图 | get_schematic_data | 获取电路拓扑、元件参数、连接关系，填充电路设计章节 | Agent 启动数据采集阶段 |
| 读取 PCB 层叠 | get_pcb_layers | 获取层叠结构、铜厚、平面分配，填充 PCB 设计章节 | 数据采集阶段（紧接原理图） |
| 读取全部网络 | get_all_nets | 获取网络分类与连接，生成系统架构框图数据 | 数据采集阶段 |
| 读取全部位号 | get_all_designators | 获取元件清单与分类，生成 BOM 与降额表 | 数据采集阶段 |
| 读取设计规则 | get_pcb_rules | 获取线宽/间距/过孔规则，填充 PCB 规则表与安规核查 | 数据采集阶段 |
| 知识库检索 | knowledge_search | 检索 EMC/可靠性/测试/标准知识片段填充文档 | 模板填充阶段（并行） |
| 文档生成 | document_generator | 渲染最终文档文件（Markdown/DOCX/HTML） | 文档输出阶段 |

集成流程：数据采集阶段依次调用 5 个 MCP 工具获取原理图/PCB层叠/网络/位号/设计规则，汇总至 `DesignDataAggregator`；随后根据 `include_emc_section`、`include_reliability_section` 和 `target_standard` 条件，并行检索对应知识库片段填充模板章节；最终由 `document_generator` 按 `doc_format` 渲染输出文档文件。

---

## 8. 对话流程示例

```
用户: 帮我为当前 Altium 项目"机载28V直流电源模块"生成全套设计文档，
      目标标准是军用，输出 DOCX 格式，需要全面审查。

Agent: 收到您的需求，正在从 Altium 项目中采集设计数据并生成文档...

[Step 1] 参数解析:
  - 项目名称: 机载28V直流电源模块
  - 文档类型: report_all（综合报告：设计说明 + 评审材料 + 测试方案）
  - 目标标准: 军用（GJB 系列）
  - 输出格式: DOCX
  - 审查级别: 全面（full）

[Step 2] 设计数据采集:
  - 读取原理图 → 提取拓扑(LLC半桥)、元件(47个)、网络(32个)
  - 读取 PCB 层叠 → 4层板(信号/地/电源/信号)，电源层2oz铜厚
  - 读取全部网络 → 分类: 电源网络12个/地网络4个/信号网络16个
  - 读取全部位号 → 元件清单: MOSFET 4个/电容15个/变压器1个/控制IC 2个...
  - 读取设计规则 → 最小线宽0.2mm/最小间距0.15mm/电源线宽2.0mm@10A

[Step 3] 知识库检索:
  - 军用标准 → GJB 151B EMC限值、GJB 150A 环境试验项
  - EMC审查指南 → 传导/辐射发射审查要点
  - 可靠性指南 → GJB/Z 299C 失效率计算方法
  - 测试鉴定指南 → 研发/型式/可靠性测试项清单
  - 设计审查清单 → 8大类审查项合规性矩阵

[Step 4] 文档生成:
  [4.1] 设计说明书 — 概述/技术指标/系统架构/电路设计/PCB设计 + EMC设计专章(CE102/RE102) + 可靠性设计专章(MTBF≥50000h, FMEA) + 附录A(GJB符合性声明) + 附录C(环境适应性: -55~85℃/振动/湿热/盐雾)
  [4.2] 评审材料 — 合规性矩阵: 38项审查, 35项通过, 3项警告; 风险项: CE102裕量4dB(需≥6dB)→增大共模电感; 结论: 有条件通过
  [4.3] 测试方案 — 研发测试(12项功能+温度扫描) + 型式试验(GJB 151B EMC + GJB 150A环境) + 可靠性鉴定(MTBF验证5台/2000h) + 总工期18周

[Step 5] 输出完成:
  - 设计说明书: 机载28V直流电源模块_设计说明书_V1.0.docx
  - 评审材料: 机载28V直流电源模块_评审材料_V1.0.docx
  - 测试方案: 机载28V直流电源模块_测试方案_V1.0.docx

评审材料中发现1项中风险项（CE102裕量不足），已在文档中标注整改建议。
是否需要我针对该风险项进一步生成 EMC 整改方案？
```

---

## 9. 实现伪代码

```python
class DesignDocGeneratorAgent:
    """设计文档生成 Agent"""

    def __init__(self):
        self.knowledge_base = KnowledgeBase()
        self.mcp_client = AltiumMCPClient()
        self.template_engine = TemplateEngine()
        self.doc_generator = DocumentGenerator()
        self.data_aggregator = DesignDataAggregator()

    def run(self, user_input: dict) -> dict:
        """Agent 主流程"""
        params = self.validate_and_complete_params(user_input)          # Step 1: 参数校验
        if params["target_standard"] == "auto":                          # Step 2: 标准判定
            params["target_standard"] = self.detect_standard(params)
        design_data = self.collect_design_data(params["altium_project_id"])  # Step 3: 数据采集
        knowledge_fragments = self.retrieve_knowledge(params, design_data)   # Step 4: 知识检索
        documents = self.generate_documents(params, design_data, knowledge_fragments)  # Step 5: 模板填充
        output_files = self.render_and_save(documents, params)           # Step 6: 渲染输出
        return {"status": "success", "files": output_files,
                "risk_summary": self.extract_risk_summary(documents)}

    def validate_and_complete_params(self, user_input: dict) -> dict:
        """参数校验与默认值补全"""
        for key in ["project_name", "doc_type", "altium_project_id"]:
            if key not in user_input:
                raise ValueError(f"缺少必需参数: {key}")
        valid_doc_types = ["design_specification", "review_material", "test_plan", "report_all"]
        if user_input["doc_type"] not in valid_doc_types:
            raise ValueError(f"无效的文档类型: {user_input['doc_type']}")
        defaults = {
            "doc_format": "Markdown", "review_level": "full",
            "target_standard": "auto", "include_emc_section": True,
            "include_reliability_section": True, "include_thermal_section": True,
            "author": "AI Design Assistant", "version": "1.0",
            "output_path": "./output", "locale": "zh-CN",
        }
        return {**defaults, **user_input}

    def detect_standard(self, params: dict) -> str:
        """根据项目元数据自动判定军用/民用标准"""
        metadata = self.mcp_client.get_project_metadata(params["altium_project_id"])
        if metadata.get("application") in ["military", "aerospace"]:
            return "military"
        return "civilian"

    def collect_design_data(self, project_id: str) -> dict:
        """通过 MCP 工具链采集设计数据"""
        design_data = {
            "schematic": self.mcp_client.get_schematic_data(project_id),
            "pcb_layers": self.mcp_client.get_pcb_layers(project_id),
            "nets": self.mcp_client.get_all_nets(project_id),
            "designators": self.mcp_client.get_all_designators(project_id),
            "pcb_rules": self.mcp_client.get_pcb_rules(project_id),
        }
        return self.data_aggregator.aggregate(design_data)

    def retrieve_knowledge(self, params: dict, design_data: dict) -> dict:
        """并行检索知识库片段"""
        standard = params["target_standard"]
        fragments = {}

        # 标准库检索
        if standard == "military":
            fragments["standards"] = self.knowledge_base.search(
                query="GJB 151B GJB 150A 军用电源标准限值",
                source="standards/military-standards.md", top_k=10)
        else:
            fragments["standards"] = self.knowledge_base.search(
                query="IEC 61000 安规 能效 民用标准",
                source="standards/civilian-standards.md", top_k=10)

        # 审查清单（评审材料必需）
        fragments["review_checklist"] = self.knowledge_base.search(
            query="电气安全 拓扑选型 元器件降额 保护功能 审查清单",
            source="review/design-review-checklist.md", top_k=15)

        # 条件章节知识检索
        conditional_sources = [
            ("emc", "传导发射 辐射发射 EMI滤波器 EMC审查",
             "review/emc-review-guide.md", 10, params["include_emc_section"]),
            ("reliability", "MTBF 失效率 降额 FMEA 可靠性预计",
             "review/reliability-review-guide.md", 10, params["include_reliability_section"]),
        ]
        for key, query, source, top_k, enabled in conditional_sources:
            if enabled:
                fragments[key] = self.knowledge_base.search(
                    query=query, source=source, top_k=top_k)

        # 测试指南检索
        fragments["test"] = self.knowledge_base.search(
            query="研发测试 型式试验 可靠性鉴定 测试方案",
            source="review/test-qualification-guide.md", top_k=12)

        return fragments

    def generate_documents(self, params: dict, design_data: dict,
                           knowledge: dict) -> dict:
        """根据文档类型加载模板并填充"""
        doc_set = {
            "design_specification": ["design_specification"],
            "review_material": ["review_material"],
            "test_plan": ["test_plan"],
            "report_all": ["design_specification", "review_material", "test_plan"],
        }[params["doc_type"]]

        documents = {}
        for doc_kind in doc_set:
            template = self.template_engine.load_template(
                doc_kind, params["target_standard"])
            documents[doc_kind] = self.template_engine.fill(
                template=template, design_data=design_data,
                knowledge=knowledge, params=params)
        return documents

    def render_and_save(self, documents: dict, params: dict) -> list:
        """渲染文档为目标格式并保存"""
        title_map = {"design_specification": "设计说明书",
                     "review_material": "评审材料", "test_plan": "测试方案"}
        output_files = []
        for doc_kind, content in documents.items():
            title = f"{params['project_name']}_{title_map[doc_kind]}_V{params['version']}"
            file_path = self.doc_generator.render(
                content=content, title=title, fmt=params["doc_format"],
                output_dir=params["output_path"], author=params["author"])
            output_files.append(file_path)
        return output_files

    def extract_risk_summary(self, documents: dict) -> dict:
        """从评审材料中提取风险汇总"""
        if "review_material" not in documents:
            return {}
        review = documents["review_material"]
        risks = review.get("risk_summary", [])
        return {
            "total_risks": len(risks),
            "high_risk_count": sum(1 for r in risks if r["severity"] == "高"),
            "medium_risk_count": sum(1 for r in risks if r["severity"] == "中"),
            "conclusion": review.get("conclusion", {}).get("result", ""),
        }
```

---

## 10. 文档模板章节矩阵

下表列出每种文档类型的完整章节结构、数据来源与填充方式标记（A=自动从设计数据填充，K=从知识库填充，M=需人工补充/确认）。

| 文档类型 | 章节编号 | 章节名称 | 数据来源 | 填充方式 | 军用专项 |
|----------|----------|----------|----------|----------|----------|
| 设计说明书 | 1 | 概述 | 用户输入 + 项目元数据 | A | - |
| 设计说明书 | 2 | 技术指标 | 原理图元件参数 + 设计规格 | A | - |
| 设计说明书 | 3 | 系统架构 | 原理图网表 (get_all_nets) | A | - |
| 设计说明书 | 4 | 电路设计 | 原理图数据 (get_schematic_data) | A+M | - |
| 设计说明书 | 5 | PCB 设计 | PCB层叠 + 设计规则 | A | - |
| 设计说明书 | 6 | EMC 设计 | EMC指南 + PCB数据 | A+K | GJB 151B 符合性 |
| 设计说明书 | 7 | 可靠性设计 | 可靠性指南 + BOM | A+K | GJB/Z 299C MTBF |
| 设计说明书 | 8 | 测试方案 | 测试鉴定指南 + 标准库 | A+K | GJB 150A 环境试验 |
| 设计说明书 | 附录A | GJB 符合性声明 | 军用标准库 | K | 是 |
| 设计说明书 | 附录B | BOM清单与降额表 | 位号数据 + 降额标准 | A | - |
| 设计说明书 | 附录C | 环境适应性说明 | 军用标准库 | K | 是（-55~85℃/振动/湿热/盐雾） |
| 评审材料 | 1 | 评审概述 | 用户输入 + 标准库 | A+K | GJB 标准依据 |
| 评审材料 | 2 | 设计合规性矩阵 | 审查清单 + 设计数据 | A+K | 军用审查项 |
| 评审材料 | 3 | 电气安全审查结果 | 审查清单 + PCB规则 | A | 安规间距核查 |
| 评审材料 | 4 | 拓扑与元器件审查 | 审查清单 + BOM | A | 降额/生命周期 |
| 评审材料 | 5 | EMC 审查结果 | EMC指南 + PCB数据 | A+K | CE102/RE102 核查 |
| 评审材料 | 6 | 可靠性审查结果 | 可靠性指南 + BOM | A+K | MTBF/FMEA |
| 评审材料 | 7 | 风险项汇总 | 以上审查结果汇总 | A | - |
| 评审材料 | 8 | 评审结论 | 综合判定 | M | - |
| 测试方案 | 1 | 测试概述 | 测试鉴定指南 | K | - |
| 测试方案 | 2 | 研发测试方案 | 测试鉴定指南第2章 | K | 军用指标更严 |
| 测试方案 | 3 | 型式试验方案 | 测试指南 + 标准库 | K | GJB 151B/150A |
| 测试方案 | 4 | 可靠性鉴定方案 | 测试指南 + 可靠性指南 | K | MTBF验证 |
| 测试方案 | 5 | 军用专项测试 | 军用标准库 | K | 是（RS103/CS115等） |
| 测试方案 | 6 | 测试设备清单 | 测试鉴定指南 | K | - |
| 测试方案 | 7 | 测试计划表 | 自动排程生成 | A | - |

### 填充方式说明

| 标记 | 含义 | 说明 |
|------|------|------|
| A | 自动填充 | 直接从 Altium MCP 采集的设计数据提取，无需人工干预 |
| K | 知识库填充 | 从知识库文档检索相关片段，嵌入文档对应章节 |
| M | 人工补充 | 需要设计工程师确认或补充的内容，文档中以 `[待补充]` 标记 |
| A+K | 混合填充 | 设计数据与知识库内容结合，先填数据再补充知识说明 |
| A+M | 数据自动 + 人工确认 | 数据自动提取，但关键结论需人工审核确认 |

### 军用电源文档特殊要求清单

| 特殊要求 | 所在章节 | 依据标准 | 内容说明 |
|----------|----------|----------|----------|
| GJB 符合性声明 | 附录A | GJB 151B/150A/Z 299C | 逐条对照 GJB 标准条款，声明符合性与证据 |
| 环境适应性说明 | 附录C / 可靠性设计 | GJB 150A-2009 | 工作温度范围、振动冲击、湿热、盐雾、低气压适应性 |
| EMC 军用限值对照 | EMC设计 / 评审材料 | GJB 151B-2013 | CE102/RE102/CS101/CS114/RS103 等测试项限值与设计裕量 |
| 可靠性预计报告 | 可靠性设计 | GJB/Z 299C | 应力分析法逐元件失效率计算，系统 MTBF 汇总 |
| 元器件质量等级 | 评审材料 / 附录B | GJB/Z 299C | 元器件质量等级（B1/B2/A）声明与筛选要求 |
| 电磁脉冲防护 | EMC设计（可选） | GJB 151B RS105 | 瞬态电磁场（50kV/m）防护设计说明 |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08 | 初始版本，建立设计文档生成 Agent 完整实现方案 | AI Knowledge Base |
