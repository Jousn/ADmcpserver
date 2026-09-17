# 元器件选型 Agent 详细实现方案

> 本文档为元器件选型 Agent 的详细实现方案，覆盖 Agent 目标、输入参数定义、选型决策引擎、知识库依赖、MCP 工具调用链、输出格式、Altium MCP 集成点、对话流程示例、实现伪代码及降额校核标准表。面向 AI Skills 在 Agent 开发阶段的结构化检索与实现指导。

---

## 1. Agent 目标

结合电源设计知识库与 Altium 元件库符号，根据电路功能需求自动推荐最优器件方案。在满足电气参数与降额要求的前提下，综合权衡性能、成本、供货能力与器件生命周期，输出可信赖的选型报告及替代料方案。

**核心价值：**
- 将元器件选型从人工 3~6 小时缩短至自动化 5 分钟
- 覆盖 MOSFET/二极管/电容/变压器/磁性元件/控制 IC 等全品类器件
- 内置军用 I/II/III 级降额校核，自动规避过应力风险
- 结合宽禁带器件（GaN/SiC）知识库，推荐前沿高效方案
- 自动检索 Altium 库符号并校验封装/原理图符号一致性
- 提供替代料与生命周期评估，规避停产（EOL）风险

---

## 2. 输入参数定义

### 2.1 必需参数

| 参数名 | 类型 | 单位 | 说明 | 示例 |
|--------|------|------|------|------|
| component_type | enum | - | 器件类型：mosfet/diode/capacitor/transformer/ic/inductor/resistor | mosfet |
| circuit_function | enum | - | 电路功能：主开关/同步整流/PFC/整流/滤波/驱动/控制 | primary_switch |
| V_stress | float | V | 关键电压应力（MOSFET 为 Vds，二极管为 Vr，电容为 Vdc） | 100 |
| I_stress | float | A | 关键电流应力（MOSFET/二极管为 Id 平均或峰值，电容为纹波电流） | 50 |
| Vin_range | list | V | 输入电压范围 [min, max]，用于应力计算 | [36, 72] |
| application | enum | - | 应用场景：military/aerospace/industrial/consumer/automotive | military |

> 说明：不同器件类型有专属关键参数，见 2.3 参数矩阵。V_stress 与 I_stress 为最小必需电气应力，Agent 会据此自动推导器件额定值（含降额裕量）。

### 2.2 可选参数（提供默认值）

| 参数名 | 类型 | 单位 | 默认值 | 说明 |
|--------|------|------|--------|------|
| key_params | dict | - | {} | 器件专属关键参数（Rds_on/Vf/容值/ESR/感量等） |
| cost_constraint | enum | - | medium | low/medium/high 成本等级 |
| grade | enum | - | industrial | 军用等级筛选：military_I/military_II/military_III/industrial/consumer |
| derating_level | enum | - | II | 降额等级：I/II/III（军用）/commercial |
| package_preference | list | - | [] | 封装偏好（如 TO-247/D2PAK/QFN） |
| wide_bandgap_allowed | bool | - | true | 是否允许 GaN/SiC 器件 |
| alternate_parts_required | bool | - | true | 是否必须提供替代料方案 |
| min_alternates | int | - | 2 | 替代料最少数量 |
| supplier_preference | list | - | [] | 优先供应商（TI/Infineon/Wolfspeed/Onsemi 等） |
| lifecycle_min_years | int | 年 | 5 | 最小剩余生命周期要求 |
| rohs_required | bool | - | true | 是否要求 RoHS 合规 |
| temperature_range | list | ℃ | [-40, 125] | 工作结温范围 [Tj_min, Tj_max] |
| switching_freq | float | kHz | 0 | 开关频率，影响动态损耗评估，0 表示按典型值 |
| qty_estimate | int | - | 1000 | 预估年用量，影响价格档位与供货评估 |

### 2.3 输入参数 JSON Schema

```json
{
  "component_type": "mosfet",
  "circuit_function": "primary_switch",
  "V_stress": 100,
  "I_stress": 50,
  "Vin_range": [36, 72],
  "application": "military",
  "key_params": {
    "Vds_required": 100,
    "Id_required": 50,
    "Rds_on_target": 10,
    "Qg_target": 50
  },
  "cost_constraint": "medium",
  "grade": "military_II",
  "derating_level": "II",
  "package_preference": ["TO-247", "D2PAK"],
  "wide_bandgap_allowed": true,
  "alternate_parts_required": true,
  "min_alternates": 2,
  "supplier_preference": ["Wolfspeed", "Infineon", "Onsemi"],
  "lifecycle_min_years": 7,
  "rohs_required": true,
  "temperature_range": [-55, 150],
  "switching_freq": 200,
  "qty_estimate": 5000
}
```

### 2.4 器件专属关键参数矩阵

| 器件类型 | 关键参数（key_params） | 说明 |
|----------|------------------------|------|
| mosfet | Vds, Id, Rds_on, Qg, Qgs, Qgd, Eoss, Coss | 含体二极管特性 |
| diode | Vr, If_avg, If_sm, Vf, trr, Qrr, Ir | 区分快恢复/肖特基/SiC SBD |
| capacitor | capacitance, Vdc, ESR, ESL, ripple_current, tan_δ, temp_coeff | 区分陶瓷/铝电解/钽/薄膜 |
| transformer | turns_ratio, Lmag, Lleak, core_material, core_shape, power | 含磁芯损耗 |
| inductor | inductance, Isat, Irms, DCR, core_material | 功率与滤波电感 |
| ic | function, Vin_range, Vout/Iout, switching_freq, package | 控制/驱动 IC |

---

## 3. 选型决策引擎

### 3.1 选型决策树

决策树按功能分类 → 参数匹配 → 降额校核 → 成本评估 → 供货评估 → 生命周期评估的层级逐步收敛。

```
                  ┌──────────────────────────┐
                  │  解析 component_type     │
                  │  + circuit_function      │
                  └────────────┬─────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
   ┌──────────┐          ┌──────────┐           ┌──────────┐
   │ 有源开关 │          │ 无源元件 │           │ 控制/IC  │
   │ MOSFET/  │          │ 二极管/  │           │ 驱动/控制│
   │ 二极管   │          │ 电容/磁件│           │ IC       │
   └────┬─────┘          └────┬─────┘           └────┬─────┘
        │                     │                      │
        ▼                     ▼                      ▼
   ┌─────────────┐      ┌──────────────┐       ┌─────────────┐
   │宽禁带允许?  │      │额定值匹配    │       │功能与引脚   │
   │ GaN/SiC 纳入│      │ V/I/C/L 降额 │       │匹配检索     │
   └──────┬──────┘      └──────┬───────┘       └──────┬──────┘
          │                    │                      │
          └──────────┬─────────┴──────────────────────┘
                     ▼
            ┌────────────────┐
            │  参数匹配筛选  │ ← V/I/C/L ≥ 应力 × 降额系数
            │  (候选集 A)    │
            └───────┬────────┘
                    ▼
            ┌────────────────┐
            │  降额校核      │ ← 军用 I/II/III 级表
            │  (候选集 B)    │
            └───────┬────────┘
                    ▼
            ┌────────────────┐
            │  成本评估      │ ← 单价 × 用量档位
            │  (候选集 C)    │
            └───────┬────────┘
                    ▼
            ┌────────────────┐
            │  供货评估      │ ← 库存/交期/多源
            │  (候选集 D)    │
            └───────┬────────┘
                    ▼
            ┌────────────────┐
            │  生命周期评估  │ ← EOL 风险/剩余年限
            │  (候选集 E)    │
            └───────┬────────┘
                    ▼
            ┌────────────────┐
            │  多维度评分排序│
            │  → 推荐器件    │
            └────────────────┘
```

### 3.2 决策规则表

| 条件 | 推荐策略 | 理由 |
|------|----------|------|
| 有源开关 + 宽禁带允许 + 高频(>200kHz) | 优先 SiC MOSFET / GaN HEMT | 低损耗、高频、高效率 |
| 有源开关 + 低压(<100V) + 低成本 | 优先 Si MOSFET | 成本低，品种丰富 |
| 二极管 + 高压(>600V) + 高频 | 优先 SiC SBD | 零反向恢复，低损耗 |
| 二极管 + 低压整流 + 大电流 | 优先肖特基/同步整流 MOSFET | 低 Vf，高效率 |
| 电容 + 高频纹波大 | 优先 C0G/NP0 陶瓷或薄膜 | 低 ESR，低损耗 |
| 电容 + 大容值储能 | 铝电解/钽聚合物 | 容量密度高 |
| 军用 + 高可靠性 | 优先金属膜/钽/陶瓷，避液体铝电解 | 失效率低，抗振 |
| 磁件 + 高频 | 优先低损耗磁芯（PC95/N97/NP3C） | 降低磁芯损耗 |
| IC + 军用场景 | 筛选军工级（-55~125℃）/SMD 或 DIP | 满足温度与可靠性 |

### 3.3 多维度评分模型

Agent 对候选器件按多维度加权评分，选出最优方案。

| 评分维度 | 权重 | 评分方法 |
|----------|------|----------|
| 参数匹配度 | 25% | 额定值 vs 应力 × 降额系数，裕量越合理分越高 |
| 电气性能 | 20% | Rds_on/Vf/ESR/Qg 等关键参数优于目标值加分 |
| 成本合理性 | 15% | 单价 vs 成本约束等级，越低分越高 |
| 供货能力 | 15% | 库存量、交期、多源供应商数量 |
| 生命周期 | 10% | 剩余生命周期 vs 要求年限，越长分越高 |
| 可靠性/降额裕量 | 10% | 降额校核通过率与裕量 |
| 封装适配 | 5% | 封装偏好匹配，热阻与散热友好性 |

```
总分 = Σ(维度得分 × 权重) ∈ [0, 100]
推荐阈值: 总分 ≥ 75 为推荐器件，< 60 不推荐
```

---

## 4. 知识库依赖

| 知识库文件 | 用途 | 关键内容 |
|------------|------|----------|
| modules/09-wide-bandgap-devices.md | 宽禁带器件选型知识 | GaN/SiC 器件特性、驱动要求、适用拓扑、选型建议 |
| modules/07-magnetic-components.md | 磁性元件选型知识 | 磁芯材料/形状、损耗模型、绕组设计、变压器/电感选型 |
| modules/05-protection-circuits.md | 保护器件选型知识 | TVS/MOV/熔断器选型、过压过流保护参数匹配 |
| review/reliability-review-guide.md | 可靠性与降额约束 | 失效模式、降额准则、寿命预估、温升约束 |
| standards/military-standards.md | 军用标准与筛选 | GJB/MIL-STD 筛选等级、温度等级、质量等级要求 |

### 知识库检索策略

```
用户输入参数
    │
    ├─▶ 向量检索: "MOSFET 100V 50A SiC 军用 选型"
    │            → 匹配 09-wide-bandgap-devices.md
    │
    ├─▶ 元数据过滤: application=military → 筛选军用场景知识
    │
    ├─▶ 关键词检索: "降额 电压 电流 军用 II 级"
    │            → 匹配 review/reliability-review-guide.md
    │
    ├─▶ 规则检索: component_type=transformer
    │            → 匹配 07-magnetic-components.md
    │
    └─▶ 规则引擎: 决策树匹配 → 确定候选器件筛选条件
```

---

## 5. MCP 工具调用链

```
┌──────────────────────────────────────────────────────────────┐
│                   工具调用链流程                              │
└──────────────────────────────────────────────────────────────┘

Step 1: 库符号搜索
    search_library_symbol(keyword="MOSFET SiC 650V 50A",
                          filters={component_type: "mosfet",
                                   Vds_min: 650,
                                   Id_min: 50})
        → 返回: Altium 库中匹配器件列表（含型号/封装/符号 ID）

Step 2: 获取库符号引用与详细参数
    get_library_symbol_reference(symbol_id="<symbol_ref>")
        → 返回: 元件完整参数表、封装、引脚、供应商信息

Step 3: 知识库检索
    knowledge_search(query="MOSFET 100V 50A SiC 军用 降额 选型",
                     filters={application: military,
                              component_type: mosfet})
        → 返回: 宽禁带器件特性、降额准则、军用筛选标准

Step 4: 降额校核
    derating_check(device_ratings, circuit_stress, derating_level="II")
        → 返回: 电压/电流/功率/温度降额校核结果（通过/不通过 + 裕量）

Step 5: 成本评估
    cost_assessment(unit_price, qty_estimate, cost_constraint)
        → 返回: 总成本、成本等级匹配度评分

Step 6: 供货与生命周期评估
    supplier_assessment(suppliers, stock, lead_time)
    lifecycle_assessment(part_status, eol_date, lifecycle_min_years)
        → 返回: 供货风险评分、生命周期剩余年限

Step 7: 多维度评分与推荐器件列表生成
    score_and_rank(candidates)
    generate_report(template="component_recommendation",
                    data={recommended, alternates, derating, comparison})
        → 返回: 结构化选型报告（YAML）
```

---

## 6. 输出格式

Agent 输出结构化选型报告，包含以下部分：

```yaml
component_recommendation:
  # 1. 推荐器件
  recommended:
    component_type: "mosfet"
    part_number: "C3M0060065D"
    manufacturer: "Wolfspeed"
    confidence: 0.90
    rationale: "100V/50A 应力 + 军用 II 级降额 → 需 650V/50A 以上 SiC MOSFET，
                该型号 Rds_on 低、宽禁带高频特性优、军用级可靠"

  # 2. 关键参数
  key_parameters:
    technology: "SiC MOSFET"
    Vds: "650V"
    Id_continuous: "50A"
    Id_pulse: "120A"
    Rds_on: "60mΩ @ 25℃ / 90mΩ @ 150℃"
    Qg: "28nC"
    Eoss: "8.5uJ"
    package: "TO-247-3"
    tj_range: "-55℃ ~ +175℃"
    rohs: true

  # 3. 价格与供货
  pricing_supply:
    unit_price: "$3.85"
    price_break_1k: "$3.20"
    price_break_10k: "$2.75"
    cost_grade: "medium"
    suppliers:
      - name: "Digi-Key"
        stock: 12500
        lead_time: "1-2 周"
      - name: "Mouser"
        stock: 8200
        lead_time: "2-3 周"
      - name: "Arrow"
        stock: 5400
        lead_time: "3-4 周"
    multi_source: true

  # 4. 供货状态与生命周期
  supply_status:
    part_status: "Active（量产中）"
    lifecycle_remaining: "> 8 年"
    eol_risk: "低"
    nrnd_flag: false

  # 5. 选型对比表
  comparison_table:
    - part: "C3M0060065D (Wolfspeed)"
      tech: "SiC"
      Vds: "650V"
      Rds_on: "60mΩ"
      Qg: "28nC"
      price: "$3.85"
      score: 88
    - part: "SCT3017AL (Rohm)"
      tech: "SiC"
      Vds: "650V"
      Rds_on: "45mΩ"
      Qg: "60nC"
      price: "$4.20"
      score: 84
    - part: "IPW60R045CP (Infineon)"
      tech: "Si"
      Vds: "650V"
      Rds_on: "45mΩ"
      Qg: "90nC"
      price: "$2.10"
      score: 72

  # 6. 替代料方案
  alternate_parts:
    - part_number: "SCT3017AL"
      manufacturer: "Rohm"
      reason: "同等 SiC，Rds_on 更低，可作为第二货源"
      compatibility: "封装 TO-247 兼容，驱动电平兼容"
    - part_number: "C2M0045170D"
      manufacturer: "Wolfspeed"
      reason: "同厂 1700V 高压款，裕量更大"
      compatibility: "TO-247，引脚兼容，需复核驱动"

  # 7. 降额校核结果
  derating_check:
    derating_level: "II（军用）"
    voltage_stress: "100V / 650V = 15.4%"
      → 要求 ≤ 60%，通过（裕量大）
    current_stress: "50A / 50A = 100%"
      → 要求 ≤ 60%（即额定需 ≥ 83A），不通过，建议升档
    power_stress: "P=I^2×R=150W @ 100℃ → 额定 200W，75%，通过"
    temperature_stress: "Tj_max 175℃，工作 130℃，74%，通过"
    recommendation: "电流降额不足，建议改选 Id ≥ 83A 型号或并联使用"

  # 8. 选型注意事项
  selection_notes:
    - "SiC MOSFET 需专用驱动器（Vgs_on=18~20V），不可直接用 Si 驱动"
    - "TO-247 封装热阻 θjc=0.5℃/W，需配置适当散热器"
    - "军用场景建议选 -55℃ 起步的 HTRB 加固款"
    - "高 dv/dt（>50V/ns）需关注米勒效应与串扰，建议 -5V 关断"
```

---

## 7. 与 Altium MCP 的集成点

| 集成点 | MCP 工具 | 用途 | 调用时机 |
|--------|----------|------|----------|
| 库符号搜索 | search_library_symbol | 按型号/参数检索 Altium 库中可用器件 | 参数解析后，候选器件筛选阶段 |
| 获取符号引用 | get_library_symbol_reference | 查询元件完整参数、引脚、封装与供应商信息 | 候选器件参数确认阶段 |
| 获取元件属性 | get_component_properties | 查询具体器件电气参数（Vds/Id/Rds_on/Vf） | 参数匹配与降额校核阶段 |
| 读取现有设计 | get_schematic_data | 获取当前原理图中已使用器件 | Agent 启动时（如有打开项目） |
| 读取 BOM | get_bom_data | 获取现有 BOM 进行成本对比与重复利用评估 | 成本评估与替代料阶段 |
| 创建原理图符号 | create_schematic_symbol | 为推荐的新器件创建原理图符号 | 用户确认推荐器件后 |
| 创建 PCB 封装 | create_pcb_footprint | 为推荐器件创建或匹配 PCB 封装 | 推荐器件落地阶段 |
| 读取网络表 | get_net_list | 验证现有器件连接关系与应力分析 | 设计校核阶段 |
| 校验符号-封装一致性 | validate_symbol_footprint | 确认原理图符号与 PCB 封装引脚映射一致 | 器件落地前校验 |

### 集成流程图

```
Altium Designer
    │
    ├──▶ [项目已打开?]
    │      ├─ 是 → get_schematic_data → 提取现有器件与应力
    │      │        │
    │      │        └──▶ 与推荐器件对比 → 输出替换/复用建议
    │      │
    │      └─ 否 → 跳过，直接进入选型流程
    │
    ├──▶ [参数解析完成]
    │      │
    │      └──▶ search_library_symbol → 搜索匹配器件
    │              │
    │              └──▶ get_library_symbol_reference → 获取详细参数
    │                      │
    │                      └──▶ 降额校核 → 确认器件满足军用降额要求
    │
    └──▶ [推荐器件确认]
           │
           └──▶ create_schematic_symbol → 落地到原理图
                   │
                   └──▶ validate_symbol_footprint → 一致性校验
```

---

## 8. 对话流程示例

```
用户: 帮我选一个主开关 MOSFET，输入 36~72V，主开关承受 100V/50A，
      军用，开关频率 200kHz，要替代料。

Agent: 收到您的需求，正在检索 Altium 库与知识库...

[Step 1] 参数解析:
  - 器件类型: MOSFET（主开关）
  - 电压应力: 100V
  - 电流应力: 50A
  - 应用场景: 军用
  - 开关频率: 200kHz
  - 降额等级: II（军用默认）
  - 宽禁带: 允许（默认）

[Step 2] 应力推导与降额:
  - 军用 II 级电压降额 ≤ 60% → Vds ≥ 100/0.6 = 167V，取 650V 档（SiC 主流）
  - 军用 II 级电流降额 ≤ 60% → Id ≥ 50/0.6 = 83A
  - 高频 200kHz → 优先低 Qg、低 Eoss 的 SiC MOSFET
  - 知识库匹配: 09-wide-bandgap-devices.md 推荐 SiC MOSFET 优于 Si MOSFET

[Step 3] Altium 库搜索:
  - search_library_symbol("MOSFET SiC 650V 83A")
  - get_library_symbol_reference → 获取参数与封装
  - 候选: C3M0060065D / SCT3017AL / C2M0080120D

[Step 4] 降额校核:
  - C3M0060065D: 电压 100/650=15.4% 通过；电流 50/50=100% 不通过 → 升档
  - C2M0080120D (1200V/80A): 电压 8.3% 通过；电流 62.5% 仍超 60% → 并联或升档
  - 改选 Wolfspeed C3M0025065D (650V/100A): 电流 50% 通过，推荐

[Step 5] 多维度评分:
  - 参数匹配度 92 / 电气性能 88 / 成本 70 / 供货 85 / 生命周期 90 / 可靠性 88
  - 总分 87，达推荐阈值

[Step 6] 推荐结果:
  - 首选: Wolfspeed C3M0025065D（650V/100A/Rds_on 25mΩ）
  - 替代料 1: Rohm SCT3083AL（650V/120A，同厂第二货源）
  - 替代料 2: Infineon IMW65R048D1（650V/48A，低档备选，需并联）

[Step 7] 注意事项:
  - SiC MOSFET 需专用驱动器（Vgs_on=18~20V）
  - 高 dv/dt 需关注米勒效应，建议 -5V 关断
  - TO-247 封装需配置散热器（θjc=0.35℃/W）

需要我把推荐的器件符号直接创建到 Altium 原理图中吗？
```

---

## 9. 实现伪代码

```python
class ComponentSelectorAgent:
    """元器件选型 Agent"""

    def __init__(self):
        self.knowledge_base = KnowledgeBase()
        self.mcp_client = AltiumMCPClient()
        self.derating_engine = DeratingEngine()
        self.scorer = MultiDimScorer()

    def run(self, user_input: dict) -> dict:
        """Agent 主流程"""

        # Step 1: 参数校验与补全
        params = self.validate_and_complete_params(user_input)

        # Step 2: 尝试读取现有 Altium 设计
        existing_design = None
        if self.mcp_client.has_open_project():
            schematic = self.mcp_client.get_schematic_data()
            existing_design = self.analyze_existing_components(schematic)

        # Step 3: 知识库检索（宽禁带/磁性/保护/可靠性/军用标准）
        query = self.build_search_query(params)
        knowledge_results = self.knowledge_base.search(
            query=query,
            filters={"application": params["application"],
                     "component_type": params["component_type"]},
            top_k=10
        )

        # Step 4: Altium 库符号搜索 + 详细参数获取
        candidates = self.search_components(params, knowledge_results)

        # Step 5: 降额校核（军用 I/II/III 级）
        derating_level = params.get("derating_level", "II")
        checked = []
        for dev in candidates:
            result = self.derating_check(dev, params, derating_level)
            if result["passed"]:
                dev["derating"] = result
                checked.append(dev)

        # Step 6: 成本评估
        for dev in checked:
            dev["cost_score"] = self.cost_assessment(
                dev["unit_price"], params["qty_estimate"],
                params["cost_constraint"]
            )

        # Step 7: 供货与生命周期评估
        for dev in checked:
            dev["supply_score"] = self.supplier_assessment(dev["suppliers"])
            dev["lifecycle_score"] = self.lifecycle_assessment(
                dev["part_status"], dev.get("eol_date"),
                params["lifecycle_min_years"]
            )

        # Step 8: 多维度评分与排序
        for dev in checked:
            dev["total_score"] = self.scorer.score(dev, params)

        checked.sort(key=lambda x: x["total_score"], reverse=True)

        if not checked:
            return {"error": "无器件通过降额校核，建议放宽参数或升级额定档"}

        recommended = checked[0]
        alternates = checked[1:1 + params["min_alternates"]]

        # Step 9: 替代料搜索（若要求）
        if params.get("alternate_parts_required"):
            alternates = self.search_alternate_parts(
                recommended, params, alternates
            )

        # Step 10: 生成报告
        report = self.generate_report(
            recommended=recommended,
            alternates=alternates,
            comparison=checked,
            derating=recommended["derating"],
            params=params
        )
        return report

    def validate_and_complete_params(self, user_input: dict) -> dict:
        """参数校验与默认值补全"""
        required = ["component_type", "circuit_function",
                    "V_stress", "I_stress", "application"]
        for key in required:
            if key not in user_input:
                raise ValueError(f"缺少必需参数: {key}")

        defaults = {
            "key_params": {},
            "cost_constraint": "medium",
            "grade": "industrial",
            "derating_level": "II",
            "package_preference": [],
            "wide_bandgap_allowed": True,
            "alternate_parts_required": True,
            "min_alternates": 2,
            "supplier_preference": [],
            "lifecycle_min_years": 5,
            "rohs_required": True,
            "temperature_range": [-40, 125],
            "switching_freq": 0,
            "qty_estimate": 1000,
        }
        params = {**defaults, **user_input}
        # 军用场景自动提升降额等级
        if params["application"] in ("military", "aerospace"):
            params["derating_level"] = params.get("derating_level", "II")
            params["temperature_range"] = params.get(
                "temperature_range", [-55, 150])
        return params

    def search_components(self, params: dict, knowledge: list) -> list:
        """通过 MCP 搜索 Altium 元件库"""
        keyword = self.build_keyword(params, knowledge)
        results = self.mcp_client.search_library_symbol(
            keyword=keyword,
            filters=self.build_filters(params)
        )
        candidates = []
        for sym in results:
            detail = self.mcp_client.get_library_symbol_reference(
                symbol_id=sym["symbol_id"]
            )
            candidates.append(detail)
        return candidates

    def derating_check(self, device: dict, params: dict,
                       level: str) -> dict:
        """降额校核（电压/电流/功率/温度）"""
        rules = self.derating_engine.get_rules(
            component_type=params["component_type"], level=level
        )
        v_ratio = params["V_stress"] / device["Vds_rated"]
        i_ratio = params["I_stress"] / device["Id_rated"]
        p_ratio = self.estimate_power(device, params) / device["P_rated"]
        t_ratio = params["temperature_range"][1] / device["Tj_max"]

        passed = (v_ratio <= rules["voltage"]
                  and i_ratio <= rules["current"]
                  and p_ratio <= rules["power"]
                  and t_ratio <= rules["temperature"])
        return {
            "passed": passed,
            "voltage_ratio": v_ratio, "voltage_limit": rules["voltage"],
            "current_ratio": i_ratio, "current_limit": rules["current"],
            "power_ratio": p_ratio, "power_limit": rules["power"],
            "temperature_ratio": t_ratio,
            "temperature_limit": rules["temperature"],
        }

    def search_alternate_parts(self, recommended: dict,
                               params: dict, found: list) -> list:
        """搜索替代料：同功能、参数相当、封装兼容"""
        alternates = list(found)
        if len(alternates) < params["min_alternates"]:
            more = self.mcp_client.search_library_symbol(
                keyword=f"alternate {recommended['technology']}",
                filters={"Vds_min": recommended["Vds_rated"],
                         "Id_min": recommended["Id_rated"] * 0.9}
            )
            alternates.extend(more[:params["min_alternates"]])
        return alternates[:params["min_alternates"]]
```

---

## 10. 降额校核标准表

降额校核是军用高可靠设计的核心环节。下表列出不同器件类型在军用 I/II/III 级与商用级下的降额要求（应力占额定值比例上限）。

| 器件类型 | 降额项 | 军用 I 级 | 军用 II 级 | 军用 III 级 | 商用级 |
|----------|--------|-----------|------------|-------------|--------|
| MOSFET（Si/SiC/GaN） | 电压 Vds | ≤ 50% | ≤ 60% | ≤ 70% | ≤ 80% |
| MOSFET | 电流 Id | ≤ 50% | ≤ 60% | ≤ 70% | ≤ 80% |
| MOSFET | 功耗 P | ≤ 50% | ≤ 60% | ≤ 70% | ≤ 80% |
| MOSFET | 结温 Tj | ≤ 110℃ | ≤ 115℃ | ≤ 120℃ | ≤ 125℃ |
| 二极管（普通/SiC SBD） | 反向电压 Vr | ≤ 50% | ≤ 60% | ≤ 70% | ≤ 80% |
| 二极管 | 正向电流 If | ≤ 50% | ≤ 60% | ≤ 70% | ≤ 80% |
| 二极管 | 浪涌电流 Ifsm | ≤ 60% | ≤ 70% | ≤ 80% | ≤ 90% |
| 二极管 | 结温 Tj | ≤ 110℃ | ≤ 115℃ | ≤ 120℃ | ≤ 125℃ |
| 陶瓷电容（MLCC） | 直流电压 Vdc | ≤ 50% | ≤ 60% | ≤ 70% | ≤ 80% |
| 铝电解电容 | 直流电压 Vdc | ≤ 70% | ≤ 75% | ≤ 80% | ≤ 85% |
| 钽电容 | 直流电压 Vdc | ≤ 50% | ≤ 60% | ≤ 70% | ≤ 80% |
| 薄膜电容 | 直流电压 Vdc | ≤ 60% | ≤ 70% | ≤ 75% | ≤ 85% |
| 电容（通用） | 纹波电流 Ir | ≤ 60% | ≤ 70% | ≤ 80% | ≤ 90% |
| 电容（通用） | 额定温度 | 降 25℃ | 降 20℃ | 降 15℃ | 降 10℃ |
| 变压器/电感 | 电流（磁通密度） | Bm ≤ 70% Bs | Bm ≤ 80% Bs | Bm ≤ 85% Bs | Bm ≤ 90% Bs |
| 变压器/电感 | 温升 | ≤ 25℃ | ≤ 30℃ | ≤ 35℃ | ≤ 40℃ |
| 电阻（金属膜/绕线） | 功耗 P | ≤ 50% | ≤ 60% | ≤ 70% | ≤ 80% |
| 电阻 | 电压 V | ≤ 60% | ≤ 70% | ≤ 80% | ≤ 90% |
| 控制/驱动 IC | 电源电压 | ≤ 80% | ≤ 85% | ≤ 90% | ≤ 95% |
| IC | 输出电流 | ≤ 60% | ≤ 70% | ≤ 80% | ≤ 90% |
| IC | 结温 Tj | ≤ 105℃ | ≤ 110℃ | ≤ 115℃ | ≤ 125℃ |

### 军用级器件筛选标准

除降额外，军用场景还需满足以下筛选标准（参照 standards/military-standards.md）：

| 筛选维度 | 军用 I 级 | 军用 II 级 | 军用 III 级 |
|----------|-----------|------------|-------------|
| 工作温度 | -55℃ ~ +125℃ | -55℃ ~ +105℃ | -40℃ ~ +85℃ |
| 质量等级 | BGA/883 全检 | B 级筛选 | B-1 级 |
| 老化筛选 | 100% 高温老炼 | 抽样老炼 | 不强制 |
| PIND 检测 | 必做 | 抽样 | 不要求 |
| 密封性 | 气密封装 | 气密/塑封 | 塑封允许 |
| 抗辐照 | 总剂量 ≥ 100krad | ≥ 30krad | 不要求 |
| 可追溯性 | 全程单批追溯 | 批次追溯 | 不强制 |
| 宽禁带器件 | SiC/GaN 可用，需 100% 筛选 | SiC/GaN 可用 | 视情况 |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08 | 初始版本，建立元器件选型 Agent 完整实现方案 | AI Knowledge Base |
