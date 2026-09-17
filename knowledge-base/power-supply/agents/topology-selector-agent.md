# 拓扑选型 Agent 详细实现方案

> 本文档为拓扑选型 Agent 的详细实现方案，覆盖 Agent 目标、输入参数定义、决策树设计、知识库依赖、MCP 工具调用链、输出格式、Altium MCP 集成点、对话流程示例及实现伪代码。面向 AI Skills 在 Agent 开发阶段的结构化检索与实现指导。

---

## 1. Agent 目标

根据用户输入的功率等级、输入输出电压、效率要求、成本约束等参数，自动推荐最优 DC-DC 拓扑方案，并提供关键参数计算、元件选型建议、设计注意事项与替代方案对比。

**核心价值：**
- 将拓扑选型从人工 2~4 小时缩短至自动化 5 分钟
- 覆盖 1W~10kW 全功率段方案
- 结合宽禁带器件（GaN/SiC）知识，推荐前沿方案
- 自动校核设计约束，避免低级选型错误

---

## 2. 输入参数定义

### 2.1 必需参数

| 参数名 | 类型 | 单位 | 说明 | 示例 |
|--------|------|------|------|------|
| Pout | float | W | 输出功率 | 100 |
| Vin_min | float | V | 最小输入电压 | 36 |
| Vin_max | float | V | 最大输入电压 | 72 |
| Vout | float | V | 输出电压 | 12 |
| Iout | float | A | 输出电流（由 Pout/Vout 计算） | 8.33 |

### 2.2 可选参数（提供默认值）

| 参数名 | 类型 | 单位 | 默认值 | 说明 |
|--------|------|------|--------|------|
| efficiency_target | float | % | 90 | 效率目标值 |
| cost_constraint | enum | - | medium | low/medium/high |
| isolation_required | bool | - | true | 是否需要隔离 |
| application | enum | - | industrial | military/industrial/consumer/aerospace |
| size_constraint | enum | - | medium | compact/medium/loose |
| switching_freq | float | kHz | 0（自动选择） | 目标开关频率，0 表示自动 |
| output_channels | int | - | 1 | 输出路数 |
| wide_bandgap_allowed | bool | - | true | 是否允许使用 GaN/SiC |
| Vin_type | enum | - | dc | ac/dc（AC 输入时需提供 Vin_AC 范围） |

### 2.3 输入参数 JSON Schema

```json
{
  "Pout": 100,
  "Vin_min": 36,
  "Vin_max": 72,
  "Vout": 12,
  "efficiency_target": 92,
  "cost_constraint": "medium",
  "isolation_required": true,
  "application": "military",
  "size_constraint": "compact",
  "wide_bandgap_allowed": true,
  "output_channels": 1,
  "Vin_type": "dc"
}
```

---

## 3. 决策树设计

决策树按功率等级 → 隔离要求 → 拓扑类型 → 控制方式的层级逐步收敛。

```
                          ┌─ Pout < 1W ─────────▶ LDO / 电荷泵
                          │
                          ├─ 1W~25W ───────────▶ 非隔离 Buck/Boost
                          │    │                  ┌─ 隔离否 → Buck/Boost/Buck-Boost
                          │    └─ 隔离? ─────────┤
                          │                       └─ 隔离是 → 反激(Flyback)
                          │
                          ├─ 25W~100W ─────────▶ ┌─ 隔离否 → Buck(同步整流)/Boost
                          │    │                  │
                          │    └─ 隔离? ─────────┼─ 隔离是 → 正激(Forward)
                          │                       │           双管正激(2Switch Forward)
                          │                       └─ 多路 → 反激(多路耦合)
   输入功率 ──────────────┤
                          │
                          ├─ 100W~250W ────────▶ ┌─ 隔离否 → 大电流 Buck(多相)
                          │    │                  │
                          │    └─ 隔离? ─────────┼─ 软开关 → LLC 谐振
                          │                       ├─ 硬开关 → 双管正激(同步整流)
                          │                       └─ 多路 → 双管正激 + 后级 VR
                          │
                          ├─ 250W~1000W ───────▶ ┌─ 高效率优先 → LLC 半桥/全桥
                          │    │                  │
                          │    └─ 隔离(必须) ────┼─ 宽输入范围 → 移相全桥(PSFB)
                          │                       └─ 多路 → 移相全桥 + 后级 VR
                          │
                          └─ > 1000W ──────────▶ 全桥 + LLC / 移相全桥
                               │
                               └─ GaN/SiC ─────▶ 高频 LLC (>500kHz)
```

### 3.1 决策规则表

| 条件 | 推荐拓扑 | 理由 |
|------|----------|------|
| Pout < 25W，隔离，多路 | 反激 | 成本最低，多路输出简单 |
| 25W < Pout < 100W，隔离，单路 | 双管正激 | 效率优于反激，可靠钳位 |
| 100W < Pout < 250W，高效率 | LLC 半桥 | ZVS 软开关，效率 > 95% |
| 100W < Pout < 250W，宽输入 | 移相全桥 | 移相控制适应宽范围 |
| 250W < Pout < 1000W | LLC 全桥 | 大功率高效率首选 |
| Pout > 1000W，宽禁带允许 | 高频 LLC + SiC | 极高效率，高功率密度 |
| 非隔离，Pout < 100W | 同步 Buck | 简单高效，成本低 |
| 非隔离，Pout > 100W | 多相 Buck | 均流散热，降低纹波 |

---

## 4. 知识库依赖

| 知识库文件 | 用途 | 关键内容 |
|------------|------|----------|
| 03-dc-dc-topology.md | 拓扑选型核心知识 | 各拓扑功率范围、效率、优缺点、适用场景 |
| 09-wide-bandgap-devices.md | 宽禁带器件知识 | GaN/SiC 器件特性、适用拓扑、驱动要求 |
| design-review-checklist.md | 拓扑选型审查项 | 功率等级匹配、隔离要求、效率目标校核 |
| review/emc-review-guide.md | EMC 约束参考 | 拓扑对 EMC 的影响（硬开关 vs 软开关） |
| review/reliability-review-guide.md | 可靠性约束参考 | 拓扑复杂度对 MTBF 的影响 |

### 知识库检索策略

```
用户输入参数
    │
    ├─▶ 向量检索: "Pout=100W 隔离 高效率 拓扑" → 匹配 03-dc-dc-topology.md
    │
    ├─▶ 元数据过滤: application=military → 筛选军用场景知识
    │
    ├─▶ 关键词检索: "GaN LLC 高频" → 匹配 09-wide-bandgap-devices.md
    │
    └─▶ 规则引擎: 决策树匹配 → 确定候选拓扑集合
```

---

## 5. MCP 工具调用链

```
┌──────────────────────────────────────────────────────────────┐
│                   工具调用链流程                              │
└──────────────────────────────────────────────────────────────┘

Step 1: 读取现有设计（如有）
    get_schematic_data(project_id)
        → 返回: 现有原理图拓扑、元件参数
        → 用途: 验证现有设计或作为参考

Step 2: 知识库检索
    knowledge_search(query="Pout=100W 隔离 高效率 DC-DC拓扑",
                     filters={application: military})
        → 返回: 候选拓扑列表 + 知识片段

Step 3: 决策树推理
    reasoning_engine(input_params, knowledge_results)
        → 返回: 推荐拓扑 + 置信度 + 替代方案

Step 4: 参数计算
    calculate_topology_params(topology="LLC_half_bridge",
                              Pout=100, Vin=48, Vout=12)
        → 返回: 谐振频率、品质因数、变比、Lr/Cr 等

Step 5: 元件搜索
    search_library_symbol(keyword="MOSFET SiC 650V",
                          filters={Vds_min: 650, Id_min: 20})
        → 返回: Altium 库中匹配元件列表

Step 6: 报告生成
    generate_report(template="topology_recommendation",
                    data={topology, params, components, notes})
        → 返回: 结构化推荐报告
```

---

## 6. 输出格式

Agent 输出结构化推荐报告，包含以下部分：

```yaml
topology_recommendation:
  # 1. 推荐拓扑方案
  recommended:
    topology: "LLC 半桥谐振"
    confidence: 0.92
    rationale: "100W 隔离需求 + 92% 效率目标 + 军用场景 → LLC 软开关最优"

  # 2. 关键参数计算
  key_parameters:
    transformer_ratio: "4:1"
    resonant_frequency: "120 kHz"
    quality_factor: "0.8"
    Lr: "15 uH"        # 谐振电感
    Cr: "58 nF"        # 谐振电容
    Lm: "150 uH"       # 励磁电感
    switching_freq_range: "90~150 kHz"
    dead_time: "150 ns"

  # 3. 元件选型建议
  component_suggestions:
    primary_mosfet:
      type: "SiC MOSFET"
      part: "C3M0120065D (Wolfspeed)"
      Vds: "650V"
      Id: "22A"
      Rds_on: "12mΩ"
      reason: "高效率、高频特性优，军用级可靠"
    rectifier:
      type: "同步整流 MOSFET"
      part: "BSC010NE2LSI (Infineon)"
      Vds: "25V"
      Id: "100A"
      Rds_on: "1.0mΩ"
    transformer_core:
      material: "PC95 (TDK)"
      shape: "PQ2625"

  # 4. 设计注意事项
  design_notes:
    - "LLC 工作在感性区，确保 ZVS 条件"
    - "谐振电容需选 C0G/NP0 材质，承受高频电流"
    - "变压器绕组采用三明治绕法，减小漏感"
    - "同步整流需防止反向电流，设置关断延迟"
    - "军用场景需加固变压器绝缘，满足 GJB 要求"

  # 5. 替代方案对比
  alternatives:
    - topology: "双管正激 + 同步整流"
      efficiency: "93%"
      cost: "低 15%"
      complexity: "中等"
      pros: "控制简单，可靠性强"
      cons: "效率略低于 LLC，硬开关 EMI 较大"
    - topology: "移相全桥(PSFB)"
      efficiency: "94%"
      cost: "高 20%"
      complexity: "高"
      pros: "宽输入范围适应性好，ZVS"
      cons: "控制复杂，环流损耗大"

  # 6. 与现有设计对比（如有）
  existing_design_check:
    found: true
    current_topology: "反激"
    recommendation: "建议升级为 LLC，效率提升约 5%，功率密度提升 30%"
```

---

## 7. 与 Altium MCP 的集成点

| 集成点 | MCP 工具 | 用途 | 调用时机 |
|--------|----------|------|----------|
| 读取现有设计 | get_schematic_data | 获取当前原理图拓扑与参数 | Agent 启动时（如有打开项目） |
| 搜索库元件 | search_library_symbol | 查找推荐拓扑所需元件 | 参数计算后，元件选型阶段 |
| 获取元件属性 | get_component_properties | 查询具体元件参数（Vds/Id/Rds_on） | 元件筛选阶段 |
| 读取 BOM | get_bom_data | 获取现有 BOM 进行成本对比 | 替代方案分析阶段 |
| 读取网络表 | get_net_list | 验证现有拓扑连接关系 | 设计校核阶段 |

### 集成流程图

```
Altium Designer
    │
    ├──▶ [项目已打开?]
    │      ├─ 是 → get_schematic_data → 提取现有拓扑
    │      │        │
    │      │        └──▶ 与推荐方案对比 → 输出升级建议
    │      │
    │      └─ 否 → 跳过，直接进入推荐流程
    │
    ├──▶ [参数计算完成]
    │      │
    │      └──▶ search_library_symbol → 搜索匹配元件
    │              │
    │              └──▶ get_component_properties → 获取详细参数
    │                      │
    │                      └──▶ 降额校核 → 确认元件满足要求
    │
    └──▶ [报告生成]
           │
           └──▶ 输出推荐报告（含可直接放入 Altium 的元件信息）
```

---

## 8. 对话流程示例

```
用户: 帮我设计一个 100W 的 DC-DC 电源，输入 36~72V，输出 12V，
      效率要求 92% 以上，军用，体积要紧凑。

Agent: 收到您的需求，正在分析最优拓扑方案...

[Step 1] 参数解析:
  - 输出功率: 100W
  - 输入电压: 36~72V DC（2:1 宽范围）
  - 输出电压: 12V / 8.33A
  - 效率目标: ≥92%
  - 应用场景: 军用
  - 尺寸约束: 紧凑

[Step 2] 拓扑决策:
  - 功率 100W + 隔离需求 + 高效率 → 候选: LLC半桥 / 双管正激 / 移相全桥
  - 宽输入范围 (2:1) → LLC 在宽范围下效率下降，需评估
  - 军用紧凑 → 优先高频软开关减少体积

[Step 3] 推荐: LLC 半桥谐振（置信度 92%）
  理由: 100W 功率段 LLC 可实现 ZVS/ZCS，效率 95%+，军用高频减小体积

[Step 4] 关键参数:
  - 变压器变比: 4:1
  - 谐振频率: 120kHz
  - Lr=15uH, Cr=58nF, Lm=150uH
  - 开关频率范围: 90~150kHz

[Step 5] 元件推荐:
  - 主开关: SiC MOSFET C3M0120065D (650V/22A/12mΩ)
  - 同步整流: BSC010NE2LSI (25V/100A/1.0mΩ)
  - 变压器磁芯: PQ2625 / PC95

[Step 6] 注意事项:
  - 宽输入(2:1)下 LLC 低增益端效率会下降约 2~3%，
    建议在 36V 输入时验证增益裕量是否足够
  - 如宽范围效率不达标，备选方案: 移相全桥(PSFB)

需要我进一步计算环路补偿参数，或搜索 Altium 元件库中的可用器件吗？
```

---

## 9. 实现伪代码

```python
class TopologySelectorAgent:
    """拓扑选型 Agent"""

    def __init__(self):
        self.knowledge_base = KnowledgeBase()
        self.mcp_client = AltiumMCPClient()
        self.decision_tree = TopologyDecisionTree()
        self.calculator = TopologyCalculator()

    def run(self, user_input: dict) -> dict:
        """Agent 主流程"""

        # Step 1: 参数校验与补全
        params = self.validate_and_complete_params(user_input)

        # Step 2: 尝试读取现有 Altium 设计
        existing_design = None
        if self.mcp_client.has_open_project():
            schematic = self.mcp_client.get_schematic_data()
            existing_design = self.analyze_existing_topology(schematic)

        # Step 3: 知识库检索
        query = self.build_search_query(params)
        knowledge_results = self.knowledge_base.search(
            query=query,
            filters={"application": params["application"]},
            top_k=10
        )

        # Step 4: 决策树推理
        candidates = self.decision_tree.evaluate(params, knowledge_results)

        # Step 5: 参数计算（对每个候选拓扑）
        scored_candidates = []
        for topology in candidates:
            calc_result = self.calculator.calculate(topology, params)
            score = self.score_topology(topology, calc_result, params)
            scored_candidates.append({
                "topology": topology,
                "params": calc_result,
                "score": score
            })

        # 排序选最优
        scored_candidates.sort(key=lambda x: x["score"], reverse=True)
        best = scored_candidates[0]
        alternatives = scored_candidates[1:3]

        # Step 6: 元件搜索
        components = self.search_components(best, params)

        # Step 7: 生成报告
        report = self.generate_report(
            recommended=best,
            alternatives=alternatives,
            components=components,
            existing_design=existing_design,
            params=params
        )

        return report

    def validate_and_complete_params(self, user_input: dict) -> dict:
        """参数校验与默认值补全"""
        required = ["Pout", "Vin_min", "Vin_max", "Vout"]
        for key in required:
            if key not in user_input:
                raise ValueError(f"缺少必需参数: {key}")

        defaults = {
            "efficiency_target": 90,
            "cost_constraint": "medium",
            "isolation_required": True,
            "application": "industrial",
            "size_constraint": "medium",
            "wide_bandgap_allowed": True,
            "output_channels": 1,
        }
        params = {**defaults, **user_input}
        params["Iout"] = params["Pout"] / params["Vout"]
        params["Vin_ratio"] = params["Vin_max"] / params["Vin_min"]
        return params

    def search_components(self, best: dict, params: dict) -> list:
        """通过 MCP 搜索 Altium 元件库"""
        components = []
        # 搜索主开关 MOSFET
        mosfet_results = self.mcp_client.search_library_symbol(
            keyword=f"MOSFET {best['mosfet_type']}",
            filters={"Vds_min": best["Vds_required"],
                     "Id_min": best["Id_required"]}
        )
        components.extend(mosfet_results[:3])
        return components
```

### 决策树流程图（ASCII）

```
                    ┌─────────────┐
                    │  输入参数   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Vin_type?   │
                    └──┬───────┬──┘
                  AC  │       │  DC
              ┌────────┘       └────────┐
              ▼                         ▼
      ┌──────────────┐          ┌──────────────┐
      │ 加 PFC 前级  │          │ 直接 DC-DC   │
      │ (Boost PFC)  │          │ 拓扑选型     │
      └──────┬───────┘          └──────┬───────┘
             │                         │
             └────────┬────────────────┘
                      ▼
              ┌───────────────┐
              │ Pout 分档     │
              └──┬───┬───┬────┘
                 │   │   │
        <25W ───┘   │   └─── >1000W
         │         │          │
         ▼         ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │反激/   │ │LLC/    │ │全桥LLC │
    │Buck    │ │正激/   │ │+SiC   │
    │        │ │PSFB    │ │       │
    └───┬────┘ └───┬────┘ └───┬────┘
        │          │          │
        ▼          ▼          ▼
    ┌────────────────────────────┐
    │  隔离? → 效率? → 成本?     │
    │  → 宽禁带? → 控制方式?     │
    └─────────────┬──────────────┘
                  ▼
          ┌───────────────┐
          │ 输出推荐拓扑   │
          │ + 候选方案集   │
          └───────────────┘
```

---

## 10. 评分模型

Agent 对候选拓扑按多维度加权评分，选出最优方案。

| 评分维度 | 权重 | 评分方法 |
|----------|------|----------|
| 效率匹配 | 25% | 效率预估 vs 目标，差值越小分越高 |
| 功率适配 | 20% | 拓扑推荐功率范围与需求匹配度 |
| 成本合理性 | 15% | BOM 成本估算 vs 约束等级 |
| 复杂度/可靠性 | 15% | 元件数越少越可靠，控制越简单越好 |
| 体积/功率密度 | 10% | 开关频率与磁性元件体积 |
| EMC 友好性 | 10% | 软开关 > 硬开关，低 dv/dt 优先 |
| 宽范围适应 | 5% | 输入电压比适应能力 |

```
总分 = Σ(维度得分 × 权重) ∈ [0, 100]
推荐阈值: 总分 ≥ 75 为推荐方案，< 60 不推荐
```

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08 | 初始版本，建立拓扑选型 Agent 完整实现方案 | AI Knowledge Base |
