# Altium MCP 工作流协议

> 本文件定义 MCP 工具调用的完整工作流：何时使用工具、何时引用知识库、何时调用 Skill、如何管理记忆。
> 所有输出语言跟随用户查询语言。

---

## 一、总览：四层资源体系

```
用户需求
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  层1: 工作流协议（本文件）                                │
│  定义阶段检测 → 工具选择 → 知识库调用 → Skill 触发规则     │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  层2: MCP 工具 │  层3: 知识库  │  层4: Skill  │  层5: 记忆    │
│  40 个工具     │  5 大类 60 文件│  12 个 Skill │  TRAE 内置    │
│  直接操作 AD   │  向量检索     │  专项分析    │  上下文缓存   │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 二、设计阶段检测

### 阶段判断规则

| 用户关键词 | 加载阶段 | 主要目标 |
|-----------|---------|---------|
| 需求、功能、指标、规格、选型、方案 | F: 需求分析 | 分解需求 → 匹配知识库 → BOM 预估 |
| 原理图、schematic、连线、网络、画原理图 | G: 原理图设计 | 放置元件 → 连线 → 审查 |
| 布局、layout、放置、分区、排列 | H: PCB 布局 | 功能分区 → 元件布局 → 审查 |
| 布线、走线、routing、差分、阻抗 | I: PCB 布线 | 电源→差分→时钟→模拟→数字 |
| DRC、检查、验证、审查、Gerber、输出 | J: 设计验证 | DRC → 审查 → 报告 → 输出 |

### 阶段间衔接检查

```
F → G: 需求分析报告已生成？BOM 已预估？库符号已确认？
G → H: ERC 通过？所有网络已命名？封装已分配？
H → I: 所有元件已放置？功能分区已完成？布局审查通过？
I → J: 所有网络已连接？差分对已匹配？布线审查通过？
```

---

## 三、知识库调用规则

### 何时调用知识库

| 场景 | 触发条件 | 调用的知识库 |
|------|---------|-------------|
| 用户描述电路功能需求 | 提到电源/MCU/运放/接口/保护 | classic-circuits/ |
| 用户询问设计规则 | 提到去耦/接地/走线宽度/差分/EMC | design-rules/ |
| 用户需要选型 | 提到运放/电容/MOSFET/连接器选型 | component-selection/ |
| 用户设置 DRC 规则 | 提到高速/模拟/电源/混合信号规则 | drc-templates/ |
| 用户设计电源电路 | 提到 LDO/Buck/Boost/PFC/拓扑 | power-supply/ |
| AI 需要验证设计 | 审查去耦/接地/EMC/热设计 | design-rules/ + drc-templates/ |

### 如何调用知识库

**方式 1: 向量检索（推荐，自动）**

当检测到上述场景时，AI 自动调用 `search_knowledge_base` 工具：

```
search_knowledge_base(
  query: "LDO design capacitor selection",  // 用户的意图或问题
  category: "classic-circuits",              // 可选，限定知识库类别
  limit: 3                                   // 返回最相关的 3 个片段
)
```

返回结果包含：文件路径、片段标题、内容摘要、关键词、相关度评分。

**方式 2: 直接引用（已知精确文件时）**

当 AI 已知道需要哪个具体文件时（如设计 LDO 电路时直接引用 `classic-circuits/modules/01-ldo-circuits.md`），直接读取文件内容。

### 知识库类别索引

| 类别 | 路径 | 文件数 | 覆盖内容 |
|------|------|--------|---------|
| classic-circuits | knowledge-base/classic-circuits/ | 14 | LDO/Buck/Boost/MCU/运放/USB/UART/SPI/I2C/TVS/Fuse |
| design-rules | knowledge-base/design-rules/ | 6 | 去耦/接地/走线宽度/差分对/EMC-EMI |
| component-selection | knowledge-base/component-selection/ | 5 | 运放/电容/MOSFET/连接器选型 |
| drc-templates | knowledge-base/drc-templates/ | 5 | 高速数字/模拟/电源/混合信号 DRC |
| power-supply | knowledge-base/power-supply/ | 30 | 拓扑/PFC/控制/保护/热管理/标准 |

### 知识库调用流程

```
用户提问
    │
    ▼
检测关键词 → 确定需要哪个知识库？
    │
    ├─ 是 → search_knowledge_base(query, category)
    │       │
    │       ├─ 返回相关片段 → 读取内容 → 融入回答
    │       └─ 无相关结果 → 直接引用已知文件 或 提示用户
    │
    └─ 否 → 直接使用 MCP 工具操作
```

---

## 四、Skill 触发规则

### 分析类 Skill（7 个）

| Skill | 触发条件 | 何时调用 | 知识库依赖 |
|-------|---------|---------|-----------|
| bom-analyzer | "BOM 分析"、"替代料"、"EOL 风险" | 设计验证阶段(J) | 无 |
| circuit-topology-advisor | "电路拓扑"、"设计放大器"、"选型"、"连接方案" | 需求分析(F)/原理图设计(G) | classic-circuits + component-selection |
| design-rule-deriver | "DRC 规则"、"阻抗匹配"、"差分对"、"信号完整性" | PCB 布线(I)/验证(J) | design-rules + drc-templates |
| design-review-advisor | "审查 PCB"、"审查原理图"、"一致性检查" | 设计验证阶段(J) | drc-templates + design-rules |
| layout-strategy-advisor | "布局策略"、"功能分区"、"元件摆放" | PCB 布局阶段(H) | design-rules + drc-templates |
| design-doc-generator | "设计文档"、"DDR"、"测试方案" | 设计验证阶段(J) | 无 |
| altium-delphi-scripts | "写脚本"、"DelphiScript"、"自动化" | 任何需要脚本时 | 无 |

### 设计创建类 Skill（5 个）

| Skill | 触发条件 | 何时调用 | 知识库依赖 |
|-------|---------|---------|-----------|
| power-supply-designer | "设计电源"、"LDO 设计"、"Buck 设计"、"电源树" | 需求分析(F)/原理图(G) | classic-circuits + power-supply + design-rules |
| mcu-minimum-system | "MCU 最小系统"、"STM32"、"单片机" | 需求分析(F)/原理图(G) | classic-circuits + design-rules |
| decoupling-strategy | "去耦电容"、"退耦"、"电源滤波" | 原理图(G)/PCB 布局(H) | design-rules + component-selection |
| grounding-strategy | "接地策略"、"地平面"、"AGND DGND"、"地分割" | PCB 布局(H)/布线(I) | design-rules + drc-templates |
| thermal-design-advisor | "热设计"、"散热"、"结温"、"thermal" | PCB 布局(H)/验证(J) | power-supply + drc-templates |

### Skill 与知识库的调用顺序

```
1. 检测到 Skill 触发条件
2. 先调用 search_knowledge_base 获取相关知识库内容
3. 再调用 Skill 分析（Skill 内部会引用知识库文件路径）
4. Skill 输出结果 + 知识库内容 → 融合回答
```

---

## 五、MCP 工具使用规则

### 按设计阶段的工具使用

#### 阶段 F: 需求分析

| 步骤 | 工具 | 用途 | 是否必须 |
|------|------|------|---------|
| 1 | `get_workspace_projects` | 确认当前项目 | 必须 |
| 2 | `get_schematic_data` | 查看已有原理图 | 如有 |
| 3 | `search_knowledge_base` | 检索经典电路模板 | 必须 |
| 4 | `search_library_symbol` | 确认库符号存在 | 推荐 |

#### 阶段 G: 原理图设计

| 步骤 | 工具 | 用途 | 前置条件 |
|------|------|------|---------|
| 1 | `search_library_symbol` | 搜索元件符号 | 需求分析完成 |
| 2 | `get_library_symbol_reference` | 获取符号详情 | 找到符号后 |
| 3 | `edit_schematic(action="place_component")` | 放置元件 | 库符号确认 |
| 4 | `edit_schematic(action="set_component_parameters")` | 设置参数 | 元件已放置 |
| 5 | `edit_schematic(action="add_wire")` | 画导线 | 元件已放置 |
| 6 | `edit_schematic(action="add_net_label")` | 放置网络标签 | 导线已画 |
| 7 | `edit_schematic(action="place_power_port")` | 放置电源端口 | 导线已画 |
| 8 | `compile_project` | ERC 检查 | 原理图完成 |

（保存操作由用户在 Altium 中手动执行，MCP 不提供保存工具）

**关键规则**：
- `edit_schematic` 不自动保存，操作后需提示用户保存
- 放置元件前必须先确认库符号存在
- 网络命名规范：VCC_ 前缀电源, GND_ 前缀地, NET_ 前缀信号, DIFF_ 前缀差分

#### 阶段 H: PCB 布局

| 步骤 | 工具 | 用途 | 前置条件 |
|------|------|------|---------|
| 1 | `pcb_board_info` | 获取板框尺寸 | PCB 已聚焦 |
| 2 | `get_pcb_layer_stackup` | 获取层叠结构 | PCB 已聚焦 |
| 3 | `get_all_designators` | 获取所有位号 | PCB 已聚焦 |
| 4 | `search_knowledge_base(category="drc-templates")` | 检索布局规则 | 分区前 |
| 5 | `set_component_position` | 移动元件（mils） | 布局规划后 |
| 6 | `move_components` | 批量移动元件 | 布局规划后 |
| 7 | `pcb_component(action="rotate"/"flip")` | 旋转/翻转元件 | 元件已放置 |
| 8 | `set_pcb_layer_visibility` | 切换层可见性 | 布局检查时 |
| 9 | `take_view_screenshot` | 截图审查 | 布局完成后 |

**关键规则**：
- `set_component_position` 的 x/y 参数单位是 **mils**（不是 mils*10000）
- PCB 读取工具需要用户先在 Altium 中聚焦 .PcbDoc
- 布局前应先调用知识库获取 DRC 模板

#### 阶段 I: PCB 布线

| 步骤 | 工具 | 用途 | 前置条件 |
|------|------|------|---------|
| 1 | `get_all_nets` | 获取所有网络名 | PCB 已聚焦 |
| 2 | `get_component_pins` | 获取引脚-网络映射 | 布局完成 |
| 3 | `search_knowledge_base(category="design-rules")` | 检索布线规则 | 布线前 |
| 4 | `create_net_class` | 创建网络类 | 差分对/电源网络 |
| 5 | `pcb_edit(action="add_track")` | 添加走线 | 规则确定后 |
| 6 | `pcb_edit(action="add_via")` | 添加过孔 | 换层时 |
| 7 | `pcb_edit(action="add_pad")` | 添加测试点焊盘 | 需要测试点时 |
| 8 | `set_pcb_layer_visibility` | 切换层可见性 | 分层布线时 |

**布线优先级**：电源/地(P0) → 差分对(P1) → 时钟(P2) → 模拟(P3) → 高速单端(P4) → 一般数字(P5) → 电源辅线(P6)

#### 阶段 J: 设计验证

| 步骤 | 工具 | 用途 | 前置条件 |
|------|------|------|---------|
| 1 | `pcb_drc` | 运行 DRC 检查 | 布线完成 |
| 2 | `get_pcb_rules` | 确认设计规则 | DRC 后 |
| 3 | `pcb_net_info` | 验证网络连接 | DRC 后 |
| 4 | `pcb_polygon_info` | 检查铺铜状态 | 如有铺铜 |
| 5 | `compile_project` | ERC 检查 | 原理图验证 |
| 6 | `generate_report(report_type="bom")` | 生成 BOM | 验证通过 |
| 7 | `generate_report(report_type="netlist")` | 生成网表 | 验证通过 |
| 8 | `get_output_job_containers` | 获取输出容器 | 生成制造文件 |
| 9 | `run_output_jobs` | 执行输出作业 | 容器确认 |
| 10 | `take_view_screenshot` | 截图存档 | 最终步骤 |

### 工具调用约束

1. **PCB 聚焦要求**：所有 PCB 读取/写入工具需要用户先在 Altium 中聚焦 .PcbDoc
2. **原理图定位**：通过 `schematic_full_path` 或 `project_full_path` + `sheet_file_name` 定位
3. **单位规范**：
   - PCB 坐标：mils（`set_component_position` 的 x/y）
   - 原理图坐标：mils（`edit_schematic` 的 x_mils/y_mils）
   - PCB 走线宽度：mils（`pcb_edit` 的 width_mils）
4. **edit_schematic 不自动保存**：操作后需提示用户在 Altium 中手动保存（Ctrl+S），MCP 不提供保存工具
5. **不弹窗**：所有工具不应弹出 ShowMessage 等模态对话框
6. **记忆优先**：先查记忆，记忆命中则跳过 MCP 调用

---

## 六、记忆管理规则

### 何时写入记忆

| 时机 | 记忆内容 | 格式 |
|------|---------|------|
| 需求分析完成 | 项目信息、模块清单、BOM 预估 | `MEM:REQUIREMENT` |
| 原理图元件放置 | 位号、库引用、坐标、参数 | `MEM:SCH_COMP` |
| 原理图连线完成 | 网络名、连接引脚 | `MEM:SCH_NET` |
| PCB 元件布局完成 | 位号、封装、坐标、旋转 | `MEM:PCB_COMP` |
| PCB 布线完成 | 网络类、布线状态、差分匹配 | `MEM:PCB_ROUTE` |
| 设计验证完成 | DRC 结果、报告列表、输出文件 | `MEM:VERIFY` |

### 何时读取记忆

1. **每次工具调用前**：先查记忆是否有缓存数据，避免重复查询
2. **阶段衔接时**：检查前一阶段记忆，确认衔接条件满足
3. **用户提问时**：从记忆中检索相关上下文

### 记忆与知识库的分工

| 资源 | 用途 | 时效 |
|------|------|------|
| 记忆系统 | 缓存当前项目的工具查询结果、设计决策 | 会话级/项目级 |
| 知识库 | 提供通用的电路设计知识、规则、模板 | 永久（手动更新） |

---

## 七、完整工作流示例

### 示例：用户要求"设计一个 STM32 最小系统板"

```
Step 1: 阶段检测 → F: 需求分析
    │
    ├─ search_knowledge_base("STM32 MCU minimum system design", "classic-circuits")
    │  → 返回 04-mcu-minimum-system.md 相关片段
    │
    ├─ search_knowledge_base("MCU decoupling capacitor", "design-rules")
    │  → 返回 01-decoupling-rules.md 相关片段
    │
    ├─ search_library_symbol("STM32") → 确认库符号
    │
    └─ 输出：需求分析报告（模块清单 + BOM 预估）
    │
Step 2: 阶段检测 → G: 原理图设计
    │
    ├─ search_knowledge_base("MCU clock crystal reset circuit", "classic-circuits")
    │  → 返回 MCU 时钟/复位电路片段
    │
    ├─ edit_schematic(place_component) → 放置 STM32
    ├─ edit_schematic(place_component) → 放置晶振
    ├─ edit_schematic(place_component) → 放置复位电路元件
    ├─ edit_schematic(place_component) → 放置去耦电容
    ├─ edit_schematic(add_wire) → 连线
    ├─ edit_schematic(add_net_label) → 网络命名
    ├─ compile_project() → ERC 检查
    └─ (用户在 Altium 中手动保存)
    │
Step 3: 阶段检测 → H: PCB 布局
    │
    ├─ pcb_board_info() → 板框尺寸
    ├─ get_pcb_layer_stackup() → 层叠
    ├─ search_knowledge_base("MCU layout decoupling placement", "design-rules")
    │  → 返回去耦布局规则
    ├─ search_knowledge_base("high-speed digital DRC", "drc-templates")
    │  → 返回高速数字 DRC 模板
    ├─ set_component_position() → 移动元件
    ├─ take_view_screenshot() → 截图审查
    └─ 布局审查清单
    │
Step 4: 阶段检测 → I: PCB 布线
    │
    ├─ get_all_nets() → 网络列表
    ├─ search_knowledge_base("track width current capacity", "design-rules")
    │  → 返回走线宽度规则
    ├─ create_net_class() → 创建电源/差分网络类
    ├─ pcb_edit(add_track) → 布线
    └─ 布线审查清单
    │
Step 5: 阶段检测 → J: 设计验证
    │
    ├─ pcb_drc() → DRC 检查
    ├─ compile_project() → ERC 检查
    ├─ generate_report(bom) → BOM
    ├─ run_output_jobs() → Gerber/钻孔文件
    ├─ save_all() → 保存
    └─ take_view_screenshot() → 截图存档
```

---

## 八、工具 → 知识库 → Skill 调用矩阵

| 用户意图 | MCP 工具 | 知识库 | Skill |
|---------|---------|--------|-------|
| "设计一个 LDO 电源" | edit_schematic | classic-circuits + power-supply + component-selection | power-supply-designer |
| "帮我选一个运放" | search_library_symbol | component-selection | circuit-topology-advisor |
| "MCU 最小系统怎么设计" | edit_schematic | classic-circuits + design-rules | mcu-minimum-system |
| "去耦电容怎么放" | get_component_pins | design-rules | decoupling-strategy |
| "接地策略怎么选" | get_pcb_layers + get_all_nets | design-rules + drc-templates | grounding-strategy |
| "这个 MOSFET 散热够吗" | get_all_designators + pcb_board_info | power-supply + component-selection | thermal-design-advisor |
| "USB 差分对阻抗多少" | get_pcb_layer_stackup | design-rules | design-rule-deriver |
| "帮我推导 DRC 规则" | get_pcb_rules + get_all_nets | drc-templates | design-rule-deriver |
| "审查一下 PCB" | get_all_designators + get_component_pins | drc-templates + design-rules | design-review-advisor |
| "布局策略建议" | get_all_designators + get_pcb_layers | design-rules + drc-templates | layout-strategy-advisor |
| "生成 BOM" | generate_report | 无 | bom-analyzer |
| "生成设计文档" | get_schematic_data + get_all_designators | 无 | design-doc-generator |
| "搜索元件库" | search_library_symbol | 无 | 无 |
| "铺铜信息" | pcb_polygon_info | 无 | 无 |
| "运行 DRC" | pcb_drc | 无 | 无 |

---

## 九、错误处理与回退

| 场景 | 处理方式 |
|------|---------|
| Altium 未启动 | 提示用户启动 Altium Designer |
| PCB 未聚焦 | 提示用户在 Altium 中点击 .PcbDoc |
| 原理图未打开 | 通过 schematic_full_path 或 project+sheet 定位 |
| 库符号未找到 | search_knowledge_base → 提示用户手动创建或导入 |
| 知识库无相关内容 | 降级为 AI 内置知识回答，提示"知识库中暂无此内容" |
| DRC 有违规 | 列出违规项，引用 design-rules 知识库给出修复建议 |
| edit_schematic 操作失败 | 检查前置条件（库符号、参数格式），重试 |
| MCP 桥接超时 | 提示用户检查断点是否清除、.bridge.lock 是否残留 |
