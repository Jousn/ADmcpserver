# 热分析 Agent 详细实现方案

> 本文档为热分析 Agent 的详细实现方案，覆盖 Agent 目标、输入参数定义、热阻网络模型设计、知识库依赖、MCP 工具调用链、输出格式、Altium MCP 集成点、对话流程示例、实现伪代码及降额校核矩阵。面向 AI Skills 在 Agent 开发阶段的结构化检索与实现指导。通过在设计阶段提前识别热风险，减少样机迭代次数，并预测器件结温。

---

## 1. Agent 目标

基于 Altium 设计文件中的元件参数、PCB 层叠结构、散热方式及环境条件，自动构建功率器件的热阻网络模型，预测稳态与瞬态结温，评估热风险等级，并给出散热器选型与风道优化建议。

**核心价值：**
- 在设计阶段提前识别热风险，将热样机迭代次数从 2~3 轮减少至 0~1 轮
- 自动化结温预测，覆盖 MOSFET / 二极管 / 电容 / 变压器 / 电感全功率器件
- 结合降额标准（GJB/Z 35）自动校核温度降额与功率降额
- 输出散热器选型方案与风道优化建议，指导布局布线

---

## 2. 输入参数定义

### 2.1 必需参数

| 参数名 | 类型 | 单位 | 说明 | 示例 |
|--------|------|------|------|------|
| power_loss_data | object | - | 各器件功率损耗数据（可由 Agent 估算或用户提供） | {Q1: 5.2, D1: 3.1} |
| ambient_temp | float | °C | 环境温度（机箱内实测或设计上限） | 55 |
| cooling_method | enum | - | 散热方式：natural/forced_air/liquid | forced_air |

### 2.2 可选参数（提供默认值）

| 参数名 | 类型 | 单位 | 默认值 | 说明 |
|--------|------|------|--------|------|
| altitude | float | m | 0 | 海拔高度（影响对流换热系数） |
| enclosure_type | enum | - | sealed | sealed/vented/conformal（密封/通风/敷形涂层） |
| pcb_layers | int | - | 4 | PCB 层数（影响铜箔散热能力） |
| copper_weight | float | oz | 1 | 铜厚（1oz/2oz/3oz） |
| airflow_velocity | float | m/s | 0 | 风冷风速（强制风冷时必填） |
| liquid_flow_rate | float | L/min | 0 | 液冷流量（液冷时必填） |
| derating_level | enum | - | II | 降额等级 I/II/III（对应航天/军用/工业） |
| tj_max_override | object | °C | {} | 指定器件结温上限覆盖值 |
| transient_profile | object | - | null | 瞬态负载曲线（脉冲功率/周期） |
| application | enum | - | industrial | military/industrial/consumer/aerospace |

### 2.3 输入参数 JSON Schema

```json
{
  "power_loss_data": {
    "Q1": 5.2,
    "Q2": 5.2,
    "D1": 3.1,
    "T1": 4.5,
    "L1": 1.8
  },
  "ambient_temp": 55,
  "cooling_method": "forced_air",
  "altitude": 2000,
  "enclosure_type": "vented",
  "pcb_layers": 6,
  "copper_weight": 2,
  "airflow_velocity": 3.0,
  "derating_level": "I",
  "application": "military",
  "transient_profile": {
    "duty_cycle": 0.7,
    "period": 0.01,
    "peak_power_multiplier": 1.5
  }
}
```

---

## 3. 热模型设计

### 3.1 热阻网络模型

功率器件的热量传导路径采用串联热阻网络（Cauer / Foster 混合模型）描述，从芯片结温逐级传导至环境。

```
                  RθJC          RθCS           RθSA
  结温 Tj ──[结-壳热阻]──► 壳温 Tc ──[壳-散热器热阻]──► 散热器 Ts ──[散热器-环境热阻]──► 环境温度 Ta
   ▲                                                                                      │
   │                                                                                      │
  芯片发热 Pd ────────────────────────── 热流方向 ──────────────────────────────────────────▶
```

### 3.2 各级热阻定义与参考值

| 热阻 | 符号 | 含义 | 典型值范围 | 数据来源 |
|------|------|------|-----------|----------|
| 结-壳热阻 | RθJC | 芯片结到封装外壳 | 0.3~5 °C/W | 器件数据手册 |
| 壳-散热器热阻 | RθCS | 外壳到散热器（含导热界面材料） | 0.1~2 °C/W | 导热材料规格 |
| 散热器-环境热阻 | RθSA | 散热器到环境 | 0.2~20 °C/W | 散热器规格 / 计算 |
| 结-环境热阻 | RθJA | 总热阻（自然冷却无散热器） | 20~100 °C/W | 数据手册 / 计算 |

**典型器件 RθJC 参考值：**

| 器件类型 | 封装 | RθJC 典型值 (°C/W) | 说明 |
|----------|------|---------------------|------|
| MOSFET | TO-220 | 0.5~2.0 | 中功率，常用 |
| MOSFET | D2PAK | 0.4~1.5 | 表贴大功率 |
| MOSFET | DirectFET | 0.5~1.2 | 顶部散热 |
| SiC MOSFET | TO-247 | 0.3~0.8 | 大功率低热阻 |
| 肖特基二极管 | TO-220 | 1.0~3.0 | 单管 |
| 整流桥 | GBJ | 1.5~4.0 | 桥式封装 |
| 电解电容 | - | 10~30 | 自然散热为主 |
| 变压器 | - | 2~8（估算） | 磁芯+绕组复合 |

### 3.3 稳态结温计算公式

```
稳态结温：

  Tj = Ta + Pd × (RθJC + RθCS + RθSA)
     = Ta + Pd × RθJA

其中：
  Tj:    器件结温 (°C)
  Ta:    环境温度 (°C)
  Pd:    器件稳态功耗 (W)
  RθJA:  结到环境总热阻 (°C/W)

计算示例：
  MOSFET Pd=5W, Ta=55°C, RθJC=0.5, RθCS=0.3, RθSA=2.0
  RθJA = 0.5+0.3+2.0 = 2.8 °C/W
  Tj = 55 + 5×2.8 = 69°C
```

### 3.4 瞬态热响应分析

功率器件在脉冲负载下，结温取决于瞬态热阻抗 Zθ(t) 而非稳态热阻。采用 Foster 网络近似：

```
瞬态热阻抗公式（Foster 网络）：

  ZθJC(t) = Σ [Ri × (1 - exp(-t / τi))]    i=1..n

典型单脉冲瞬态热阻抗曲线（归一化）：
  t = 1ms:    ZθJC ≈ 0.10 × RθJC
  t = 10ms:   ZθJC ≈ 0.30 × RθJC
  t = 100ms:  ZθJC ≈ 0.60 × RθJC
  t = 1s:     ZθJC ≈ 0.90 × RθJC
  t = 10s:    ZθJC ≈ RθJC（接近稳态）

瞬态结温计算：

  Tj(t) = Ta + Pd_steady × RθJA + ΔPd × ZθJA(t)

其中：
  Pd_steady:  稳态功耗分量
  ΔPd:        脉冲功率增量
  ZθJA(t):    系统瞬态热阻抗

重复脉冲温升（叠加原理）：
  ΔTj_repeat = ΔPd × ZθJA(t_on) × (1 - exp(-N×T/τ_th)) / (1 - exp(-T/τ_th))
  其中 t_on 为单脉冲持续时间，T 为脉冲周期，N 为脉冲数，τ_th 为热时间常数
```

### 3.5 散热器热阻估算

```
散热器-环境热阻经验公式：

  RθSA ≈ 1 / (h × A_total × η_fin)

其中：
  h:        对流换热系数 (W/m²·°C)
            自然冷却: 5~25
            强制风冷(3m/s): 50~100
            强制风冷(5m/s): 80~150
            液冷: 500~5000
  A_total:  散热器总表面积，含翅片 (m²)
  η_fin:    翅片效率 (0.6~0.9)

海拔修正：h_altitude = h_sea × (1 - 1.1×10⁻⁴ × altitude)，例：2000m → h 衰减约 22%
风速修正（强制风冷）：h_forced ≈ h_natural + 7.5 × v^0.78    (v: 风速 m/s)
```

---

## 4. 知识库依赖

| 知识库文件 | 用途 | 关键内容 |
|------------|------|----------|
| modules/06-thermal-management.md | 热设计核心知识 | 热阻网络模型、结温计算公式、散热器选型、降额设计准则、瞬态热阻抗 |
| review/reliability-review-guide.md | 可靠性约束参考 | GJB/Z 35 降额等级（I/II/III）、元器件降额参数表、失效率预计 |
| review/design-review-checklist.md | 热设计审查项 | 功率/热降额审查、结温校核、散热方式匹配、电容寿命折算 |
| modules/09-wide-bandgap-devices.md | 宽禁带器件热特性 | SiC/GaN 热阻参数、高频损耗特性 |
| modules/07-magnetic-components.md | 磁性元件热设计 | 变压器铜损/铁损、绕组温升 |
| modules/10-pcb-layout-emc.md | PCB 散热布局 | 铜箔散热、热过孔、风道设计 |

### 知识库检索策略

```
用户输入参数 + Altium 设计数据
    │
    ├─▶ 向量检索: "MOSFET 结温 散热器选型 RθJC" → 06-thermal-management.md
    ├─▶ 元数据过滤: derating_level=I → 筛选航天级降额知识
    ├─▶ 关键词检索: "SiC 热阻 瞬态" → 09-wide-bandgap-devices.md
    ├─▶ 关键词检索: "变压器铜损 温升" → 07-magnetic-components.md
    └─▶ 规则引擎: 降额等级 + Tj_max → 自动校核温度/功率降额
```

---

## 5. MCP 工具调用链

```
┌──────────────────────────────────────────────────────────────┐
│                   工具调用链流程                              │
└──────────────────────────────────────────────────────────────┘

Step 1: 获取所有元件位号
    get_all_designators()
        → 返回: PCB 上所有元件位号列表（Q1, D1, T1, L1, C1...）
        → 用途: 确定热分析对象范围，分批处理

Step 2: 获取元件引脚与网络信息
    get_component_pins(designators=["Q1", "Q2", "D1", "T1", ...])
        → 返回: 每个元件的引脚编号、引脚名称、所属网络
        → 用途: 识别功率路径，定位发热器件，计算导通电流
        → 注意: 大规模 PCB（>100 元件）应分批查询，每批 10~20 个

Step 3: 获取 PCB 层叠结构
    get_pcb_layer_stackup()
        → 返回: 层数、介质厚度、铜厚、材料类型
        → 用途: 评估铜箔散热能力，计算 PCB 散热热阻分量

Step 4: 功率损耗估算
    estimate_power_loss(component_pins, layer_stackup, input_params)
        → 返回: 各器件稳态功耗 Pd（MOSFET/二极管/变压器/电感）
        → 用途: 若用户未提供 power_loss_data，自动估算

Step 5: 热阻网络计算
    build_thermal_network(components, cooling_method, pcb_layers)
        → 返回: 每个器件的 RθJC + RθCS + RθSA 热阻链
        → 用途: 构建热阻网络，计算总热阻 RθJA

Step 6: 结温预测
    calculate_junction_temp(power_loss, thermal_network, ambient_temp)
        → 返回: 各器件稳态结温 Tj + 瞬态峰值结温 Tj_peak
        → 用途: 核心热风险评估

Step 7: 降额校核
    check_derating(tj_results, derating_level, tj_max)
        → 返回: 各器件降额合格/警告/危险状态
        → 用途: 按 GJB/Z 35 自动校核

Step 8: 散热建议生成
    generate_cooling_recommendations(risk_results, cooling_method)
        → 返回: 散热器选型、风道优化、铜箔加厚建议
        → 用途: 输出可执行的散热改进方案

Step 9: 报告生成
    generate_report(template="thermal_analysis", data={...})
        → 返回: 结构化热分析报告（YAML）
```

---

## 6. 输出格式

Agent 输出结构化热分析报告，包含各器件结温预测、热风险等级、散热器选型建议及风道优化建议。

```yaml
thermal_analysis_report:
  # 1. 分析概要
  summary:
    project: "100W LLC DC-DC Converter"
    ambient_temp: 55
    cooling_method: "forced_air"
    airflow_velocity: 3.0
    derating_level: "I"
    total_power_loss: 19.8
    estimated_efficiency_impact: "热损耗占输出功率 19.8%"

  # 2. 各器件结温预测
  junction_temp_predictions:
    - designator: "Q1"
      component: "SiC MOSFET C3M0120065D"
      power_loss: 5.2
      thermal_resistance:
        Rth_jc: 0.5
        Rth_cs: 0.3
        Rth_sa: 2.0
        Rth_ja: 2.8
      steady_state_tj: 69.6
      transient_peak_tj: 78.2
      tj_max: 175
      derating_ratio: 0.40
      risk_level: "safe"
    - designator: "D1"
      component: "SiC SBD 650V/20A"
      power_loss: 3.1
      thermal_resistance:
        Rth_jc: 1.2
        Rth_cs: 0.4
        Rth_sa: 3.5
        Rth_ja: 5.1
      steady_state_tj: 70.8
      transient_peak_tj: 82.5
      tj_max: 175
      derating_ratio: 0.40
      risk_level: "safe"
    - designator: "T1"
      component: "变压器 PQ2625"
      power_loss: 4.5
      steady_state_temp: 78.5
      risk_level: "warning"
      note: "绕组温升偏高，建议优化绕组结构"

  # 3. 热风险等级汇总
  risk_summary:
    safe: ["Q1", "Q2", "D1", "D2"]
    warning: ["T1"]
    danger: []
    highest_risk_component: "T1"
    recommended_action: "优化变压器绕组结构，或增加局部散热"

  # 4. 散热器选型建议
  heatsink_recommendations:
    - target: "Q1, Q2"
      required_Rth_sa: 2.0
      recommended_part: "AAVID 530002B02500G"
      Rth_sa_at_airflow: 1.8
      material: "铝合金6063"
      fin_height: "25mm"
      mounting: "导热硅脂 + 弹簧螺钉"
      thermal_interface_material: "导热硅脂 1.5 W/m·K，厚度 0.1mm"
    - target: "D1, D2"
      required_Rth_sa: 3.5
      recommended_part: "共享 Q1/Q2 散热器或独立小散热器"
      Rth_sa_at_airflow: 3.2

  # 5. 风道优化建议
  airflow_optimization:
    current_assumption: "3 m/s 均匀风速"
    recommendations:
      - "Q1/Q2 散热器翅片方向应与风向一致（X轴）"
      - "变压器 T1 位于风道下游，建议前移或增加导风舌"
      - "电解电容 C7/C8 避开 Q1 热辐射区，间距 ≥ 20mm"
      - "PCB 进风口侧开散热孔阵列，提升对流效率"
      - "建议风道截面积 ≥ 散热器迎风面积 1.2 倍"

  # 6. 降额校核结果
  derating_check:
    standard: "GJB/Z 35 I级降额"
    results:
      - designator: "Q1"
        temp_derating: "Tj/Tj_max = 0.40 ≤ 0.65 ✓"
        power_derating: "Pd/Pd_rated = 0.26 ≤ 0.50 ✓"
        status: "pass"
      - designator: "T1"
        temp_derating: "78.5°C，绕组温升 23.5K ≤ 60K ✓"
        status: "pass_with_note"
```

---

## 7. 与 Altium MCP 的集成点

| 集成点 | MCP 工具 | 用途 | 调用时机 |
|--------|----------|------|----------|
| 获取元件位号 | get_all_designators | 获取 PCB 全部元件位号列表 | Agent 启动，确定热分析范围 |
| 获取元件引脚 | get_component_pins | 获取元件引脚编号/名称/网络，定位功率路径 | 元件识别阶段（分批查询） |
| 获取层叠结构 | get_pcb_layer_stackup | 获取层数/铜厚/介质，评估 PCB 散热能力 | 热阻网络构建阶段 |
| 获取 PCB 网络 | get_all_nets | 获取网络列表，识别功率网络（VIN/VOUT/SW） | 功率路径分析阶段 |
| 获取原理图数据 | get_schematic_data | 获取元件参数（Vds/Id/Rds_on/Vf） | 功率损耗估算阶段 |
| 获取 BOM | get_bom_data | 获取完整物料清单及参数 | 器件热参数查询阶段 |

### 集成流程图

```
Altium Designer (聚焦 .PcbDoc)
    │
    ├──▶ [Agent 启动]
    │      │
    │      └──▶ get_all_designators → 获取全部位号
    │              │
    │              └──▶ 筛选功率器件（Q*/D*/T*/L*）
    │
    ├──▶ [元件详细信息]
    │      │
    │      └──▶ get_component_pins(分批) → 引脚网络
    │              │
    │              └──▶ get_all_nets → 识别功率网络
    │
    ├──▶ [热阻网络构建]
    │      │
    │      └──▶ get_pcb_layer_stackup → 铜厚/层数
    │              │
    │              └──▶ 计算铜箔散热分量
    │
    ├──▶ [器件参数查询]
    │      │
    │      └──▶ get_schematic_data / get_bom_data → Rds_on/Vf/RθJC
    │              │
    │              └──▶ 代入功率损耗公式
    │
    └──▶ [报告生成]
           │
           └──▶ 输出热分析报告（含散热器选型与风道建议）
```

---

## 8. 对话流程示例

```
用户: 帮我分析这个 100W LLC 电源的热设计，环境温度 55°C，强制风冷 3m/s，
      军用 I 级降额，PCB 已经在 Altium 里打开了。

Agent: 收到，正在读取 Altium 设计文件并进行热分析...

[Step 1] 读取 PCB 元件:
  - 调用 get_all_designators() → 发现 47 个元件
  - 筛选功率器件: Q1, Q2 (主MOSFET), D1, D2 (整流), T1 (变压器), L1 (谐振电感)

[Step 2] 读取引脚与网络:
  - get_component_pins(["Q1","Q2","D1","D2","T1","L1"])
  - 识别功率网络: VIN(48V), SW(开关节点), VOUT(12V)
  - 主开关电流路径: VIN → Q1/Q2 → T1原边 → D1/D2 → VOUT

[Step 3] 读取 PCB 层叠:
  - get_pcb_layer_stackup() → 6层板，2oz铜厚
  - 内层 GND 可辅助散热，估算铜箔热阻分量

[Step 4] 功率损耗估算:
  - Q1/Q2 (SiC MOSFET): Pd = 5.2W × 2 = 10.4W
    · 导通损耗: 3.1W (Rds_on 随温度修正)
    · 开关损耗: 1.8W (ZVS 下较低)
    · 驱动损耗: 0.3W
  - D1/D2 (SiC SBD): Pd = 3.1W × 2 = 6.2W
  - T1 (变压器): Pd = 4.5W (铜损2.8W + 铁损1.7W)
  - 总损耗: 21.1W → 效率约 82.6%（偏低，需优化）

[Step 5] 热阻网络计算:
  - Q1: RθJC=0.5, RθCS=0.3, RθSA=2.0 → RθJA=2.8°C/W
  - D1: RθJC=1.2, RθCS=0.4, RθSA=3.5 → RθJA=5.1°C/W
  - T1: 估算综合热阻 5.2°C/W

[Step 6] 结温预测:
  - Q1: Tj = 55 + 5.2×2.8 = 69.6°C (瞬态峰值 78.2°C)
  - D1: Tj = 55 + 3.1×5.1 = 70.8°C (瞬态峰值 82.5°C)
  - T1: T绕组 = 55 + 4.5×5.2 = 78.5°C

[Step 7] 降额校核 (I级):
  - Q1: Tj/Tj_max = 69.6/175 = 0.40 ≤ 0.65 ✓ 安全
  - D1: Tj/Tj_max = 70.8/175 = 0.40 ≤ 0.65 ✓ 安全
  - T1: 绕组温升 23.5K ≤ 60K ✓ 但偏高 → 警告

[Step 8] 散热建议:
  - Q1/Q2: 推荐 AAVID 530002B02500G，RθSA=1.8°C/W@3m/s
  - T1: 建议优化三明治绕组结构，或前移至风道上游
  - 风道: 翅片方向与风向一致，电容远离热源

风险汇总: 4个器件安全，1个警告（T1），0个危险。
需要我进一步优化变压器绕组结构，或搜索 Altium 库中的替代散热器吗？
```

---

## 9. 实现伪代码

```python
class ThermalAnalysisAgent:
    """热分析 Agent"""

    def __init__(self):
        self.knowledge_base = KnowledgeBase()
        self.mcp_client = AltiumMCPClient()
        self.calculator = ThermalCalculator()

    def run(self, user_input: dict) -> dict:
        """Agent 主流程"""

        # Step 1: 参数校验与补全
        params = self.validate_and_complete_params(user_input)

        # Step 2: 读取 Altium 设计数据
        design_data = self.read_design_data()

        # Step 3: 知识库检索
        knowledge = self.knowledge_base.search(
            query="MOSFET 结温 散热器选型 RθJC 降额",
            filters={"application": params["application"]},
            top_k=10
        )

        # Step 4: 功率损耗估算（若用户未提供）
        if not params.get("power_loss_data"):
            params["power_loss_data"] = self.estimate_power_loss(
                design_data, params
            )

        # Step 5: 构建热阻网络
        thermal_networks = self.build_thermal_networks(
            design_data, params
        )

        # Step 6: 结温计算（稳态 + 瞬态）
        tj_results = self.calculate_junction_temp(
            params["power_loss_data"],
            thermal_networks,
            params["ambient_temp"],
            params.get("transient_profile")
        )

        # Step 7: 降额校核
        derating_results = self.check_derating(
            tj_results, params["derating_level"]
        )

        # Step 8: 散热建议
        cooling_recs = self.generate_cooling_recommendations(
            tj_results, derating_results, params
        )

        # Step 9: 生成报告
        report = self.generate_report(
            summary=self.build_summary(params),
            tj_predictions=tj_results,
            risk_summary=self.summarize_risk(derating_results),
            heatsink_recs=cooling_recs["heatsinks"],
            airflow_recs=cooling_recs["airflow"],
            derating_check=derating_results
        )
        return report

    def read_design_data(self) -> dict:
        """通过 MCP 读取 Altium 设计数据"""
        data = {}

        # 获取所有元件位号
        data["designators"] = self.mcp_client.get_all_designators()

        # 筛选功率器件（分批查询引脚）
        power_devices = self.filter_power_devices(data["designators"])
        batch_size = 15
        pin_data = {}
        for i in range(0, len(power_devices), batch_size):
            batch = power_devices[i:i + batch_size]
            pins = self.mcp_client.get_component_pins(
                designators=batch
            )
            pin_data.update(pins)
        data["pins"] = pin_data

        # 获取层叠结构
        data["stackup"] = self.mcp_client.get_pcb_layer_stackup()

        # 获取原理图参数（Rds_on/Vf 等）
        schematic = self.mcp_client.get_schematic_data(
            include_queries=["components"]
        )
        data["component_params"] = schematic["components"]

        return data

    def build_thermal_networks(self, design_data: dict, params: dict) -> dict:
        """为每个功率器件构建热阻网络"""
        networks = {}
        cooling = params["cooling_method"]
        altitude = params.get("altitude", 0)
        airflow = params.get("airflow_velocity", 0)

        for desig, pins in design_data["pins"].items():
            comp_params = design_data["component_params"].get(desig, {})

            # RθJC: 从器件参数获取（MOSFET 典型 0.5~2.0，二极管 1.0~3.0）
            rth_jc = comp_params.get("Rth_jc", 1.0)

            # RθCS: 导热界面材料（导热硅脂 0.1~0.5，导热垫 0.5~2.0）
            rth_cs = comp_params.get("Rth_cs", 0.3)

            # RθSA: 散热器-环境（含海拔/风速修正，铜箔分量）
            rth_sa = self.calculate_rth_sa(
                cooling=cooling,
                altitude=altitude,
                airflow=airflow,
                stackup=design_data["stackup"]
            )

            networks[desig] = {
                "Rth_jc": rth_jc,
                "Rth_cs": rth_cs,
                "Rth_sa": rth_sa,
                "Rth_ja": rth_jc + rth_cs + rth_sa
            }
        return networks

    def calculate_junction_temp(self, power_loss: dict,
                                networks: dict, ta: float,
                                transient: dict = None) -> list:
        """计算各器件稳态与瞬态结温"""
        results = []
        for desig, pd in power_loss.items():
            if desig not in networks:
                continue
            rth_ja = networks[desig]["Rth_ja"]

            # 稳态结温: Tj = Ta + Pd × RθJA
            tj_steady = ta + pd * rth_ja

            # 瞬态峰值结温（若有脉冲负载）
            tj_peak = tj_steady
            if transient:
                zth = self.calc_transient_impedance(
                    rth_ja, transient
                )
                delta_p = pd * (transient.get("peak_power_multiplier", 1) - 1)
                tj_peak = tj_steady + delta_p * zth

            results.append({
                "designator": desig,
                "power_loss": pd,
                "Rth_ja": rth_ja,
                "tj_steady": tj_steady,
                "tj_peak": tj_peak
            })
        return results

    def select_heatsink(self, required_rth_sa: float,
                        cooling: str, airflow: float) -> dict:
        """散热器选型：按所需 RθSA 检索匹配散热器"""
        candidates = self.knowledge_base.search_heatsink(
            max_rth_sa=required_rth_sa,
            cooling=cooling,
            airflow=airflow
        )
        if not candidates:
            return {"recommendation": "无匹配散热器，建议改为液冷或增加风量"}
        best = candidates[0]
        return {
            "part": best["part_number"],
            "Rth_sa": best["rth_sa_at_airflow"],
            "material": best["material"],
            "fin_height": best["fin_height"]
        }

    def check_derating(self, tj_results: list, level: str) -> list:
        """按 GJB/Z 35 降额等级校核（I/II/III 级）"""
        derating_ratio = {"I": 0.65, "II": 0.70, "III": 0.80}[level]
        results = []
        for r in tj_results:
            tj_max = self.lookup_tj_max(r["designator"])
            ratio = r["tj_peak"] / tj_max
            if ratio <= derating_ratio:
                risk = "safe"
            elif ratio <= derating_ratio + 0.10:
                risk = "warning"
            else:
                risk = "danger"
            results.append({
                "designator": r["designator"],
                "tj": r["tj_peak"],
                "tj_max": tj_max,
                "derating_ratio": ratio,
                "limit": derating_ratio,
                "risk_level": risk
            })
        return results

    def calculate_rth_sa(self, cooling: str, altitude: float,
                         airflow: float, stackup: dict) -> float:
        """计算散热器-环境热阻（含海拔/风速修正）"""
        # 对流换热系数：自然10，风冷 10+7.5×v^0.78，液冷1000
        h = {"natural": 10.0, "forced_air": 10.0 + 7.5 * airflow**0.78,
             "liquid": 1000.0}.get(cooling, 10.0)
        h *= (1 - 1.1e-4 * altitude)           # 海拔修正
        rth_sa_pcb = 1.0 / (h * self.estimate_copper_area(stackup) * 0.7)
        rth_sa_hs = {"natural": 4.0, "forced_air": 2.0, "liquid": 0.3}.get(cooling, 4.0)
        return min(rth_sa_pcb, rth_sa_hs)      # 铜箔与散热器并联取小值
```

---

## 10. 降额校核矩阵

依据 GJB/Z 35《元器件降额准则》及知识库 review/reliability-review-guide.md，对不同器件类型执行温度降额与功率降额校核。

### 10.1 降额等级与适用场景

| 降额等级 | 适用场景 | 结温降额要求 | 可靠性要求 |
|----------|----------|-------------|------------|
| I 级 | 航天/高可靠 | Tj ≤ 0.65 × Tj_max | 极高，失效率最低 |
| II 级 | 军用/工业高可靠 | Tj ≤ 0.70 × Tj_max | 高可靠性 |
| III 级 | 一般工业/民用 | Tj ≤ 0.80 × Tj_max | 常规可靠性 |

### 10.2 器件类型降额标准矩阵

| 器件类型 | 温度降额（I/II/III） | 功率降额（I/II/III） | Tj_max 参考 | 关键校核点 |
|----------|---------------------|---------------------|-------------|-----------|
| MOSFET（硅） | ≤0.65/0.70/0.80 × Tj_max | ≤0.50/0.65/0.75 × Pd_rated | 150~175°C | 结温 + Rds_on 温升 |
| MOSFET（SiC） | ≤0.65/0.70/0.80 × Tj_max | ≤0.50/0.65/0.75 × Pd_rated | 175~200°C | 高频开关损耗 |
| MOSFET（GaN） | ≤0.60/0.65/0.75 × Tj_max | ≤0.50/0.60/0.70 × Pd_rated | 150°C | 热阻对封装敏感 |
| 二极管（肖特基） | ≤0.65/0.70/0.80 × Tj_max | ≤0.50/0.65/0.75 × Pd_rated | 125~175°C | 反向漏电流温升 |
| 二极管（SiC SBD） | ≤0.65/0.70/0.80 × Tj_max | ≤0.50/0.65/0.75 × Pd_rated | 175°C | 浪涌电流 |
| 整流桥 | ≤0.65/0.70/0.80 × Tj_max | ≤0.50/0.65/0.75 × Pd_rated | 150°C | 单管结温均衡 |
| 电解电容 | 105°C 下降至 85°C 使用 | 纹波电流 ≤0.70/0.80/0.90 × Ir_rated | 85/105°C | 寿命折算（每降10°C寿命×2） |
| 薄膜电容 | ≤0.65/0.70/0.80 × Tj_max | 电压降额 ≤0.6/0.7/0.8 × Vr | 85~125°C | 自身发热 ΔT ≤ 10K |
| 变压器/电感 | 绕组温升 ≤40/50/60K | 电流密度按绝缘等级 | A/E/B/F/H 级 | 铜损+铁损平衡，热点温度 |
| 电阻（功率） | ≤0.65/0.70/0.80 × Tj_max | ≤0.50/0.65/0.75 × P_rated | 150~175°C | 瞬态脉冲功率 |

### 10.3 电容寿命折算公式

```
电解电容寿命折算（Arrhenius 法则）：

  L2 = L1 × 2^((T1 - T2) / 10)

  L1: 额定温度 T1 下标称寿命（如 105°C/2000h）
  L2: 工作温度 T2 下实际寿命
  示例: 标称 105°C/5000h，实际 75°C → L2 = 5000×2^3 = 40000h ≈ 4.6 年
```

### 10.4 降额校核流程

```
器件结温结果 → 查询器件类型匹配矩阵
    │
    ├─▶ 温度降额: Tj/Tj_max ≤ 降额比例? → pass / fail / warning
    ├─▶ 功率降额: Pd/Pd_rated ≤ 降额比例? → pass / fail / warning
    ├─▶ 电容专项: 寿命折算 ≥ 设计要求年限?
    └─▶ 输出: 各器件降额状态 + 风险等级（safe/warning/danger）
```

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08 | 初始版本，建立热分析 Agent 完整实现方案 | AI Knowledge Base |
