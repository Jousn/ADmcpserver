# 可靠性预计 Agent 详细实现方案

> 本文档为可靠性预计 Agent 的详细实现方案，覆盖 Agent 目标、输入参数定义、失效率计算模型、知识库依赖、MCP 工具调用链、输出格式、Altium MCP 集成点、对话流程示例及实现伪代码。面向 AI Skills 在 Agent 开发阶段的结构化检索与实现指导。依据 GJB/Z 299C 应力分析法与 GJB/Z 35 降额准则。

---

## 1. Agent 目标

根据用户输入的 BOM 清单、环境条件和降额等级，按 GJB/Z 299C 应力分析法逐元器件计算工作失效率 λp，汇总系统级 MTBF，并自动生成可靠性预计报告、降额符合性报告与 FMEA 分析表，替代人工查表计算。

**核心价值：**
- 将可靠性预计从人工 4~8 小时缩短至自动化 5 分钟
- 覆盖 GJB/Z 299C 全部主要元器件类别（IC/分立/电容/电阻/磁性/继电器等）
- 自动执行 GJB/Z 35 I/II/III 级降额校核，输出不合规项整改建议
- 内置 FMEA 分析引擎，自动生成 RPN 评估表与薄弱环节清单
- 支持串联/并联/表决可靠性框图建模，适配冗余设计场景

---

## 2. 输入参数定义

### 2.1 必需参数

| 参数名 | 类型 | 单位 | 说明 | 示例 |
|--------|------|------|------|------|
| bom_list | array | - | BOM 清单（含位号、型号、类型、额定参数） | 见 2.3 |
| environment | enum | - | GJB/Z 299C 环境类别 | GF（地面固定） |
| derating_level | enum | - | 降额等级（GJB/Z 35） | II |

**GJB/Z 299C 环境类别枚举值：**

| 代号 | 环境类别 | 典型 πE 值 | 说明 |
|------|----------|-----------|------|
| GB | 地面良好 | 0.5 | 实验室/空调机房 |
| GF | 地面固定 | 1.0 | 固定地面设备 |
| GM | 地面移动 | 6.0 | 车载/便携设备 |
| NSI/NSU | 舰船舱内/外 | 6.0/9.0 | 舱内/露天安装 |
| AI/AU | 航空舱内/外 | 8.0/12.0 | 机舱内/外 |
| AUF | 战斗机 | 15.0 | 战斗机环境 |
| SF/ML | 航天/导弹 | 8.0/30.0 | 轨道飞行/导弹发射 |

### 2.2 可选参数（提供默认值）

| 参数名 | 类型 | 单位 | 默认值 | 说明 |
|--------|------|------|--------|------|
| temp_range | object | ℃ | {min: -40, max: +70} | 工作温度范围 |
| operating_hours | float | h | 8760 | 年工作小时数 |
| maintenance_strategy | enum | - | corrective | corrective/preventive/none |
| redundancy_config | object | - | null | 冗余配置（N+1/2N/表决） |
| mtbf_target | float | h | 20000 | MTBF 目标值 |
| quality_level | enum | - | B1 | 元器件质量等级（A/B1/B2/C） |
| include_fmea | bool | - | true | 是否生成 FMEA 分析 |
| reliability_model | enum | - | series | series/parallel/voting |

### 2.3 输入参数 JSON Schema

```json
{
  "bom_list": [
    {
      "designator": "Q1", "part_number": "IRF1404", "category": "MOSFET",
      "rated_voltage": 40, "rated_current": 162, "rated_power": 200,
      "operating_voltage": 24, "operating_current": 30,
      "operating_power": 3.5, "junction_temp": 95
    },
    {
      "designator": "C12", "part_number": "EEU-FR1V221", "category": "电解电容",
      "rated_voltage": 35, "rated_ripple_current": 1.5,
      "operating_voltage": 12, "operating_ripple_current": 0.9,
      "ambient_temp": 65
    },
    {
      "designator": "U1", "part_number": "UC3843", "category": "IC_线性",
      "pin_count": 8, "junction_temp": 85
    }
  ],
  "environment": "GF", "derating_level": "II",
  "temp_range": {"min": -40, "max": 70},
  "operating_hours": 8760, "mtbf_target": 30000,
  "quality_level": "B1", "include_fmea": true, "reliability_model": "series"
}
```

---

## 3. 失效率计算模型

### 3.1 GJB/Z 299C 应力分析法核心公式

GJB/Z 299C 采用应力分析法，元器件工作失效率 λp 的通用模型为：

```
λp = λb × πE × πQ × πA × πS2 × πR × πC × πT
```

| 符号 | 含义 | 说明 |
|------|------|------|
| λp | 元器件工作失效率 | 最终预计失效率（10⁻⁶/h） |
| λb | 基本失效率 | 与元器件类型、工作温度和电应力比相关 |
| πE | 环境系数 | 取决于 GJB 环境类别（GF=1.0, NSI=6.0, AUF=15.0 等） |
| πQ | 质量系数 | 与质量等级相关（A=0.25, B1=0.5, B2=1.0, C=3.0） |
| πA | 应用系数 | 与电路类型/应用方式相关（线性/开关/高频） |
| πS2 | 电压应力系数 | 工作电压与额定电压之比相关 |
| πR | 阻值/功率系数 | 与阻值范围或额定功率相关 |
| πC | 结构系数 | 复杂度/触点数等 |
| πT | 温度应力系数 | 由 Arrhenius 模型推导，与结温/热点温度相关 |

### 3.2 各类元器件的 π 系数说明

不同元器件类别的失效率模型中 π 系数取用不同，部分系数仅对特定类别有效：

| 元器件类别 | 适用 π 系数 | 说明 |
|-----------|------------|------|
| 单片集成电路 | πE πQ πA πS2 πC πT πL | πL 为成熟系数，πT 由结温查表 |
| 半导体分立器件 | πE πQ πA πS2 πR πT | πT 由结温 Tj 决定 |
| 电阻器 | πE πQ πR | πR 与阻值和额定功率相关 |
| 电容器 | πE πQ πS2 πCV πT | πCV 与电容量相关，πT 由环境温度决定 |
| 变压器/电感 | πE πQ πC πT | πC 由绝缘等级决定，πT 由热点温度决定 |
| 继电器/光耦 | πE πQ πC πCY πF / πS2 πT | 继电器 πCY循环/πF应用，光耦 πT由结温决定 |

### 3.3 主要元器件类型的失效率基准值 λb

以下为地面固定（GF）环境、军级质量（B1）下的典型 λb 基准值参考，实际值需根据工作温度和电应力比查 GJB/Z 299C 对应表格：

| 元器件类型 | λb 范围 (10⁻⁶/h) | 典型 λb (10⁻⁶/h) | 主要应力因子 | 备注 |
|-----------|-------------------|-------------------|-------------|------|
| 硅 MOSFET/三极管 | 0.01 ~ 0.10 | 0.05/0.03 | 结温、电压应力比 | SiC 参考 JEDEC |
| 功率二极管 | 0.01 ~ 0.10 | 0.03 | 结温、IF 应力比 | 快恢复优于普通 |
| 铝电解电容 | 0.05 ~ 0.50 | 0.15 | 环境温度、纹波电流 | 温度每升 10℃ λ 翻倍 |
| 陶瓷/薄膜电容 | 0.005 ~ 0.10 | 0.02/0.04 | 电压应力比 | X7R 优于 Y5V，薄膜自愈 |
| 金属膜电阻 | 0.001 ~ 0.02 | 0.005 | 温度、功率应力比 | 优于碳膜 |
| 线性/电源管理 IC | 0.02 ~ 0.20 | 0.08/0.10 | 结温、引脚数 | 引脚越多 πC 越大 |
| 变压器/电感 | 0.005 ~ 0.05 | 0.02/0.01 | 热点温度 | 绝缘等级决定 |
| 继电器/光耦 | 0.05 ~ 0.50 | 0.15/0.10 | 触点电流/CTR退化 | 机械寿命/退化为主 |
| 连接器 | 0.01 ~ 0.10 | 0.03 | 插拔次数、电流 | 触点数影响 πC |

### 3.4 系统级 MTBF 计算

| 可靠性模型 | 公式 | 适用场景 |
|-----------|------|----------|
| 串联模型 | λs = Σ λpi ，MTBF = 1 / λs | 无冗余系统，所有单元串联 |
| 并联模型（N 重） | MTBF = (1/λ) × (1 + 1/2 + ... + 1/N) | N 重并联冗余 |
| N+1 冗余 | MTBF ≈ (N+1)·M / [(N+1)·λ^N] | N+1 并联冗余 |
| 表决模型（K/N） | R(t) = Σ C(N,i)·R^i·(1-R)^(N-i) | N 中取 K 表决系统 |

---

## 4. 知识库依赖

| 知识库文件 | 用途 | 关键内容 |
|------------|------|----------|
| review/reliability-review-guide.md | 可靠性预计核心方法 | GJB/Z 299C 失效率公式、π 系数定义、MTBF 计算模型、降额参数表、FMEA 模板、寿命分析 |
| standards/military-standards.md | 军用标准参数库 | GJB/Z 299C 元器件失效率基准值、πE 环境系数表、πQ 质量系数表、GJB/Z 35 降额准则、MTBF 目标值参考 |
| review/design-review-checklist.md | 降额校核审查项 | 元器件选型降额检查项、军用专项审查（MTBF 预计、元器件等级）、审查风险分级 |

### 知识库检索策略

```
用户输入参数
    │
    ├─▶ 元数据过滤: environment=GF, derating_level=II → military-standards.md πE/πQ 系数表
    ├─▶ 向量检索: "MOSFET 失效率 λb 应力比" → reliability-review-guide.md 失效率章节
    ├─▶ 关键词检索: "降额 II 级 电解电容 纹波电流" → reliability-review-guide.md 降额参数表
    └─▶ 规则引擎: 元器件类型 → 查 λb 表 + π 系数组合 → 计算引擎逐元器件计算 λp
```

---

## 5. MCP 工具调用链

```
Step 1: get_all_designators(project_id)
    → 返回所有元件位号列表 → 确定需计算的元器件全集

Step 2: get_component_pins(designator)
    → 返回引脚数量、封装信息 → 确定 IC 的 πC 结构系数

Step 3: get_schematic_data(project_id)
    → 返回元件参数、工作电压/电流、网络连接 → 提取电应力参数

Step 4: classify_components(component_list)
    → 按类别分组（MOSFET/电容/IC/电阻...）→ 为每类选择失效率模型

Step 5: calculate_failure_rate(component, environment, derating_level)
    → 返回逐元器件 λp 值 + π 系数明细 → 核心计算，查 λb 表 + π 系数表

Step 6: calculate_system_mtbf(failure_rates, reliability_model)
    → 返回系统失效率 λs + MTBF 值 → 按可靠性框图模型汇总

Step 7: generate_fmea(component_list, failure_rates, criticality)
    → 返回 FMEA 分析表（含 S/O/D/RPN）→ 识别薄弱环节与改进措施

Step 8: generate_report(template="reliability_prediction",
                       data={mtbf, failure_rates, derating, fmea})
    → 返回结构化可靠性预计报告
```

---

## 6. 输出格式

Agent 输出结构化可靠性预计报告，包含以下部分：

```yaml
reliability_prediction_report:
  # 1. 系统级 MTBF 汇总
  system_summary:
    standard: "GJB/Z 299C"
    method: "应力分析法"
    environment: "GF（地面固定）"
    derating_level: "II"
    reliability_model: "串联模型"
    total_components: 86
    system_failure_rate: 28.5  # 10⁻⁶/h
    system_mtbf: 35088  # 小时
    mtbf_target: 30000
    status: pass
    margin_percent: 16.96

  # 2. 各器件失效率列表（Top 贡献最大）
  component_failure_rates:
    - {designator: "C12", category: "铝电解电容", part: "EEU-FR1V221",
       lambda_b: 0.150, pi_E: 1.0, pi_Q: 0.5, pi_S2: 1.2, pi_T: 3.5,
       pi_CV: 1.1, lambda_p: 0.347, contribution: "12.18%"}
    - {designator: "Q1", category: "MOSFET", part: "IRF1404",
       lambda_b: 0.050, pi_E: 1.0, pi_Q: 0.5, pi_A: 2.0, pi_S2: 1.0,
       pi_R: 1.5, pi_T: 4.2, lambda_p: 0.315, contribution: "11.05%"}
    - {designator: "U1", category: "电源管理IC", part: "UC3843",
       lambda_b: 0.100, pi_E: 1.0, pi_Q: 0.5, pi_A: 1.5, pi_C: 1.2,
       pi_T: 2.8, lambda_p: 0.252, contribution: "8.84%"}

  # 3. 降额符合性报告
  derating_compliance:
    level: "II"
    total_checked: 86
    compliant: 83
    non_compliant: 3
    items:
      - {designator: "C12", parameter: "纹波电流降额 0.78", required: "≤0.75",
         action: "更换为 330uF/35V 规格"}
      - {designator: "D5", parameter: "反向电压降额 0.72", required: "≤0.70",
         action: "更换为 FR207 或增加钳位电路"}
      - {designator: "R3", parameter: "功率降额 0.65", required: "≤0.60",
         action: "更换为 2W 封装电阻"}

  # 4. FMEA 分析表
  fmea_analysis:
    total_items: 24
    high_rpn_count: 2    # RPN ≥ 150
    medium_rpn_count: 5  # 100 ≤ RPN < 150
    max_rpn: 150
    items:
      - {id: 1, device: "Q1 主功率MOS管", mode: "击穿短路",
         effect: "输出过压，后级损坏", S: 10, O: 3, D: 5, rpn: 150,
         action: "增加 OVP 保护，优化散热，提高 Vds 降额"}
      - {id: 2, device: "C12 输出电解电容", mode: "容量下降/ESR增大",
         effect: "系统不稳定，精度下降", S: 6, O: 5, D: 4, rpn: 120,
         action: "提高降额，选长寿命电容（105℃/5000h）"}
      - {id: 3, device: "U1 反馈光耦", mode: "CTR 退化",
         effect: "输出电压漂移", S: 7, O: 4, D: 5, rpn: 140,
         action: "选高 CTR 余量光耦，增加反馈裕量"}

  # 5. 关键可靠性薄弱环节
  critical_weak_points:
    - {rank: 1, component: "C12 铝电解电容",
       issue: "失效率贡献最高(12.18%)，降额不合规",
       recommendation: "更换大规格电容并优化纹波电流分配", priority: "高"}
    - {rank: 2, component: "Q1 主功率 MOS 管",
       issue: "结温95℃偏高，失效率贡献11.05%",
       recommendation: "增大散热器面积，降低开关损耗", priority: "高"}
    - {rank: 3, component: "U1 反馈光耦",
       issue: "FMEA RPN=140，CTR长期退化风险",
       recommendation: "选高 CTR 余量型号，预留反馈裕量", priority: "中"}

  # 6. 改进建议汇总
  recommendations:
    - "C12 电解电容更换为 330uF/35V（105℃/5000h）"
    - "Q1 MOSFET 增大散热器，目标结温 ≤ 85℃"
    - "D5/R3 降额不合规器件更换高规格型号"
    - "建议对 Q1/C12/U1 三个薄弱环节进行加速寿命试验验证"
```

---

## 7. 与 Altium MCP 的集成点

| 集成点 | MCP 工具 | 用途 | 调用时机 |
|--------|----------|------|----------|
| 获取器件位号 | get_all_designators | 枚举原理图所有元件位号 | Agent 启动时，确定计算范围 |
| 获取引脚信息 | get_component_pins | 查询 IC 引脚数/封装，用于 πC 结构系数 | 元件分类阶段 |
| 读取原理图参数 | get_schematic_data | 提取工作电压/电流/功率等电应力参数 | 失效率计算前，获取应力数据 |
| 读取 BOM 数据 | get_bom_data | 获取 BOM 清单（型号、额定值、数量） | BOM 输入阶段 |
| 获取网络表 | get_net_list | 验证元件连接关系，识别冗余拓扑 | 可靠性框图建模阶段 |
| 获取元件属性 | get_component_properties | 查询额定电压/电流/功率等降额基准 | 降额校核阶段 |

### 集成流程图

```
Altium Designer
    │
    ├──▶ [项目已打开?]
    │      ├─ 是 → get_all_designators → get_component_pins
    │      │        → get_schematic_data → 提取电应力参数
    │      │        → 失效率计算 → MTBF 汇总
    │      └─ 否 → 提示用户提供 BOM 清单（手动输入或上传）
    │
    ├──▶ [降额校核] → get_bom_data → 获取额定参数 → 降额校核 → 合规性报告
    │
    ├──▶ [冗余拓扑识别] → get_net_list → 分析并联/ORing → 可靠性框图建模
    │
    └──▶ [报告生成] → 输出可靠性预计报告（MTBF + 降额 + FMEA）
```

---

## 8. 对话流程示例

```
用户: 帮我预计当前设计的 MTBF，环境条件是地面固定（GF），
      降额按 II 级，目标 MTBF 要达到 30000 小时。

Agent: 收到，正在从 Altium 读取设计数据并进行可靠性预计...

[Step 1] 数据采集:
  - get_all_designators → 86 个元件，get_schematic_data → 电应力参数
  - get_bom_data → 额定值与质量等级
  - 环境: GF（πE=1.0），降额: II 级，质量: B1（πQ=0.5）

[Step 2] 元件分类: MOSFET 4, 二极管 8, 铝电解电容 6, 陶瓷电容 22,
  电阻 28, IC 5, 变压器/电感 4, 光耦 2, 连接器 3, 其他 4 → 合计 86

[Step 3] 逐元器件失效率计算（GJB/Z 299C 应力分析法）:
  Q1 MOSFET (IRF1404): λb=0.050, πE=1.0, πQ=0.5, πA=2.0, πS2=1.0,
    πR=1.5, πT=4.2(Tj=95℃) → λp = 0.315 × 10⁻⁶/h
  C12 铝电解电容 (220uF/35V): λb=0.150, πE=1.0, πQ=0.5, πS2=1.2,
    πCV=1.1, πT=3.5(T=65℃) → λp = 0.347 × 10⁻⁶/h

[Step 4] 系统 MTBF 汇总:
  串联模型: λs = Σλpi = 28.5 × 10⁻⁶/h
  MTBF = 1/λs = 35088h（目标 30000h，余量 16.96%）→ 达标

[Step 5] 降额校核: 检查 86 项，合规 83 项，不合规 3 项
  · C12 纹波电流降额 0.78（要求≤0.75）
  · D5 反向电压降额 0.72（要求≤0.70）
  · R3 功率降额 0.65（要求≤0.60）

[Step 6] FMEA: 分析 24 项，高风险 2 项（Q1 RPN=150, C12 RPN=120），中风险 5 项

[Step 7] 改进建议:
  1. C12 → 更换 330uF/35V（105℃/5000h），预计 MTBF +4000h
  2. Q1 → 增大散热器，目标 Tj ≤ 85℃
  3. D5/R3 → 更换高规格器件满足降额

预计报告已生成，需要我输出完整 YAML 报告或详细整改方案吗？
```

---

## 9. 实现伪代码

```python
class ReliabilityPredictionAgent:
    """可靠性预计 Agent - 基于 GJB/Z 299C 应力分析法"""

    def __init__(self):
        self.kb = KnowledgeBase()
        self.mcp = AltiumMCPClient()
        self.fr_engine = FailureRateEngine()
        self.mtbf_calc = MTBFCalculator()
        self.fmea_gen = FMEAGenerator()
        self.derating = DeratingChecker()

    def run(self, user_input: dict) -> dict:
        """Agent 主流程"""
        # Step 1: 参数校验与补全
        params = self.validate_params(user_input)
        # Step 2: 从 Altium 获取设计数据（或使用用户提供的 BOM）
        bom = self.fetch_design_data(params)
        # Step 3: 逐元器件失效率计算
        failure_rates = []
        for comp in bom:
            lp = self.fr_engine.calculate(comp, params["environment"],
                                          params["quality_level"])
            failure_rates.append({
                "designator": comp["designator"],
                "category": comp["category"],
                "lambda_p": lp,
                "breakdown": self.fr_engine.last_breakdown
            })
        # Step 4: 系统 MTBF 汇总
        sys_result = self.mtbf_calc.calculate(
            failure_rates, params["reliability_model"],
            params.get("redundancy_config"))
        # Step 5: 降额符合性校核
        derating_report = self.derating.check(bom, params["derating_level"])
        # Step 6: FMEA 分析（可选）
        fmea_report = None
        if params["include_fmea"]:
            fmea_report = self.fmea_gen.generate(
                bom, failure_rates, sys_result["mtbf"])
        # Step 7: 薄弱环节识别与报告生成
        weak_points = self.identify_weak_points(
            failure_rates, derating_report, fmea_report)
        return self.generate_report(sys_result, failure_rates,
            derating_report, fmea_report, weak_points, params)

    def validate_params(self, user_input: dict) -> dict:
        """参数校验与默认值补全"""
        for key in ["bom_list", "environment", "derating_level"]:
            if key not in user_input:
                raise ValueError(f"缺少必需参数: {key}")
        valid_env = ["GB","GF","GM","NSI","NSU","AI","AU","AUF","SF","ML"]
        if user_input["environment"] not in valid_env:
            raise ValueError(f"无效环境类别，可选: {valid_env}")
        defaults = {"temp_range": {"min": -40, "max": 70},
            "operating_hours": 8760, "mtbf_target": 20000,
            "quality_level": "B1", "include_fmea": True,
            "reliability_model": "series", "redundancy_config": None}
        return {**defaults, **user_input}

    def fetch_design_data(self, params: dict) -> list:
        """从 Altium MCP 获取设计数据"""
        if params.get("bom_list"):
            return params["bom_list"]
        bom = []
        for des in self.mcp.get_all_designators():
            pins = self.mcp.get_component_pins(des)
            sch = self.mcp.get_schematic_data(des)
            bom.append({"designator": des, "pin_count": pins.get("count"),
                "category": self.infer_category(pins, sch),
                "rated_voltage": sch.get("rated_voltage"),
                "operating_voltage": sch.get("operating_voltage"),
                "junction_temp": sch.get("junction_temp")})
        return bom

class FailureRateEngine:
    """失效率计算引擎 - GJB/Z 299C 应力分析法: λp=λb×πE×πQ×πA×πS2×πR×πC×πT"""

    def __init__(self):
        self.kb = KnowledgeBase()
        self.last_breakdown = {}

    def calculate(self, comp, environment, quality_level):
        """计算单个元器件工作失效率 λp"""
        cat = comp["category"]
        t = comp.get("junction_temp", comp.get("ambient_temp", 70))
        lb = self.kb.query("lambda_b_table", category=cat, temp=t)
        pE = self.kb.query("pi_E_table", env=environment)
        pQ = self.kb.query("pi_Q_table", level=quality_level)
        pA = self.kb.query("pi_A_table", category=cat,
                           app=self.infer_application(comp))
        pS2 = self.calc_stress_ratio(comp)
        pR = self.kb.query("pi_R_table", category=cat,
                           rating=comp.get("rated_power"))
        pC = self.kb.query("pi_C_table", category=cat,
                           pins=comp.get("pin_count"))
        pT = self.kb.query("pi_T_table", category=cat, temp=t)
        lp = lb * pE * pQ * pA * pS2 * pR * pC * pT
        self.last_breakdown = {"lambda_b": lb, "pi_E": pE, "pi_Q": pQ,
            "pi_A": pA, "pi_S2": pS2, "pi_R": pR, "pi_C": pC,
            "pi_T": pT, "lambda_p": lp}
        return lp

class MTBFCalculator:
    """系统 MTBF 汇总计算器"""

    def calculate(self, failure_rates, model, redundancy=None):
        if model == "series":
            return self._series(failure_rates)
        elif model == "parallel":
            return self._parallel(failure_rates, redundancy)

    def _series(self, fr):
        """串联模型: λs=Σλpi, MTBF=1/λs"""
        lam_s = sum(f["lambda_p"] for f in fr)
        return {"model": "串联模型", "system_failure_rate": round(lam_s, 4),
                "mtbf": round(1e6 / lam_s, 1)}

    def _parallel(self, fr, redundancy):
        """并联冗余: MTBF=(1/λ)×(1+1/2+...+1/N)"""
        n = redundancy.get("n", 2)
        lam = fr[0]["lambda_p"]
        mtbf = (1e6 / lam) * sum(1/i for i in range(1, n + 1))
        return {"model": f"{n}重并联冗余",
                "system_failure_rate": round(1e6 / mtbf, 4),
                "mtbf": round(mtbf, 1)}

class FMEAGenerator:
    """FMEA 分析生成器"""

    def generate(self, bom, failure_rates, system_mtbf):
        sorted_fr = sorted(failure_rates, key=lambda x: x["lambda_p"],
                           reverse=True)
        items = [self._analyze(c) for c in sorted_fr[:24]]
        return {"total_items": len(items),
                "high_rpn_count": sum(1 for i in items if i["rpn"] >= 150),
                "medium_rpn_count": sum(1 for i in items
                                        if 100 <= i["rpn"] < 150),
                "items": items}

    def _analyze(self, comp):
        mode = self.infer_failure_mode(comp["category"])
        S = self.assess_severity(comp, mode)
        O = self.assess_occurrence(comp["lambda_p"])
        D = self.assess_detection(comp["category"])
        return {"device": comp["designator"], "failure_mode": mode,
                "severity_S": S, "occurrence_O": O, "detection_D": D,
                "rpn": S * O * D,
                "action": self.recommend_action(comp, mode, S, O, D)}

class DeratingChecker:
    """降额符合性校核 - GJB/Z 35"""
    TABLE = {
        "MOSFET": {"voltage": {"I":0.6,"II":0.7,"III":0.8},
                   "current": {"I":0.5,"II":0.6,"III":0.7}},
        "电解电容": {"voltage": {"I":0.7,"II":0.75,"III":0.8},
                    "ripple": {"I":0.7,"II":0.75,"III":0.8}},
        "电阻": {"power": {"I":0.5,"II":0.6,"III":0.7}}}

    def check(self, bom, level):
        non_compliant = []
        for comp in bom:
            cat = comp["category"]
            if cat not in self.TABLE:
                continue
            for param, limits in self.TABLE[cat].items():
                actual = self.get_stress_ratio(comp, param)
                limit = limits.get(level)
                if actual and limit and actual > limit:
                    non_compliant.append({
                        "designator": comp["designator"],
                        "parameter": f"{param}降额 {actual:.2f}",
                        "required": f"≤{limit}（{level}级）"})
        return {"total_checked": len(bom), "non_compliant": non_compliant}
```

---

## 10. 元器件失效率参考表

以下为 GJB/Z 299C 地面固定环境（GF, πE=1.0）、B1 质量等级（πQ=0.5）下的元器件失效率参考表。

### 10.1 半导体器件

| 元器件类型 | λb (10⁻⁶/h) | πA（应用） | πS2（电压应力 S=0.6） | πT（Tj=85℃） | 关键说明 |
|-----------|-------------|-----------|----------------------|-------------|----------|
| 硅 NPN/PNP 三极管 | 0.03/0.04 | 1.0（线性）/ 3.0（开关） | 1.0 | 2.5 | VCE/IC/功率三参数降额 |
| 硅 MOSFET | 0.05 | 2.0（开关） | 1.0 | 4.2 | SiC 参考 JEDEC，πR 与功率相关 |
| 功率二极管（普通/快恢复） | 0.03/0.02 | 1.0 | 1.0 | 2.0 | 快恢复优于普通 |
| 肖特基/稳压二极管 | 0.03/0.05 | 1.0 | 1.0/1.2 | 2.5/1.8 | 肖特基高温漏电大 |

### 10.2 电容器

| 元器件类型 | λb (10⁻⁶/h) | πS2（S=0.6） | πCV | πT（Ta=65℃） | 关键说明 |
|-----------|-------------|-------------|-----|-------------|----------|
| 铝电解电容 | 0.15 | 1.5 | 1.0~1.5 | 3.5 | 温度每升 10℃ λ 翻倍 |
| 陶瓷电容（X7R/COG） | 0.02/0.005 | 1.0/0.8 | 1.0~1.3 | 1.5/1.2 | COG/NP0 最稳定，X7R 次之 |
| 薄膜/钽电容 | 0.04/0.08 | 1.0 | 1.0~1.5 | 2.0/2.5 | 薄膜自愈性，钽电压降额严格 |

### 10.3 电阻器、集成电路与机电元件

| 元器件类型 | λb (10⁻⁶/h) | πR/πC | πT（85℃） | 关键说明 |
|-----------|-------------|-------|-----------|----------|
| 金属膜/碳膜/线绕电阻 | 0.005/0.015/0.03 | R≥1MΩ→1.5/2.0 | 1.2/1.5/1.3 | 金属膜最优，线绕大功率 |
| 片式电阻（厚膜） | 0.003 | R≥1MΩ→1.5 | 1.1 | SMT 主流，失效率低 |
| 线性/数字 IC | 0.08/0.05 | pin>24→2.0 | 2.8/2.0 | 引脚数/门数影响 πC |
| 电源管理 IC | 0.10 | pin>16→1.5 | 3.0 | 高温失效率高 |
| 电源变压器/电感 | 0.02/0.01 | F级→1.5 | 2.5/2.0 | 热点温度为主应力 |
| 继电器（电磁） | 0.15 | 触点≥6→2.0 | - | πCY 循环次数, πF 应用 |
| 光耦 | 0.10 | 1.0 | 3.0 | CTR 退化为主要机理 |
| 连接器 | 0.03 | 触点>100→3.0 | - | πK 插拔次数系数 |

### 10.4 GJB/Z 35 降额系数速查表

| 元器件类型 | 参数 | I 级 | II 级 | III 级 |
|-----------|------|------|-------|--------|
| MOSFET/IGBT | Vds/Id/Pd/Tj | 0.6/0.5/0.5/100℃ | 0.7/0.6/0.6/115℃ | 0.8/0.7/0.65/125℃ |
| 二极管 | VR/IF | 0.6/0.5 | 0.7/0.65 | 0.8/0.75 |
| 铝电解电容 | 电压/纹波电流 | 0.7/0.7 | 0.75/0.75 | 0.8/0.8 |
| 陶瓷电容 | 工作电压 | 0.50 | 0.60 | 0.70 |
| 电阻器 | 功耗 | 0.50 | 0.60 | 0.70 |
| 变压器/电感 | 电流/热点温度 | 0.6/85℃ | 0.7/100℃ | 0.8/115℃ |
| 光耦 | 正向电流 IF | 0.50 | 0.60 | 0.70 |

### 10.5 质量系数 πQ 速查表

| 质量等级 | πQ 值 | 说明 |
|----------|-------|------|
| A（军级/宇航级） | 0.25 | JANTXV 以上，100% 筛选 |
| B1（军级） | 0.50 | JANTX，部分筛选 |
| B2（工业级） | 1.00 | 工业级筛选 |
| C（民用级） | 3.00 | 基本无筛选 |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08 | 初始版本，建立可靠性预计 Agent 完整实现方案 | AI Knowledge Base |
