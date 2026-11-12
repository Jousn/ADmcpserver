# 进度：`edit_schematic` 工具

**编辑原理图** MCP 工具及其**操作**（子模式）的状态文档。用于路线图、调试和 Node 层（MCP）与 DelphiScript 层（Altium）之间的对齐。

## 架构

| 层 | 角色 |
|------|-----|
| **Trae / MCP** | 单个工具 `edit_schematic`；使用 Zod 验证输入（`src/tools/editSchematic.ts`）。 |
| **Node 桥接** | `AltiumBridge.executeCommand("schematic_edit", params, { timeoutMs: 240_000 })` 在 `src/index.ts` 中（针对 AD 慢速启动的长时间超时）。 |
| **DelphiScript** | `Altium_API.pas` 中的 `schematic_edit` 命令 → `altium-scripts/schematic_edit.pas` 中的 `SchematicEditMain`。 |

MCP 工作区在 `workspace/AltiumScript/` 下维护 `altium-scripts` 的镜像副本；桥接使用 `Altium_API.PrjScr` 启动 Altium。

## 页面标识（通过 MCP 必需）

Zod 验证要求**以下之一**来定位 `.SchDoc`：

- **`schematic_full_path`**：`.SchDoc` 的绝对路径（推荐）。
- **`schematic_sheet_file_name`**：仅文件名（例如 `Sheet1.SchDoc`），配合 Altium 中的聚焦项目或 **`project_full_path`**。

在 Delphi 中，最终的页面解析和错误处理在 `SchEditResolveSheet` 中（参见下方的错误表）。

## 已实现的操作

列出的所有操作都在 **Node**（枚举 + `superRefine`）和 **Pascal**（`SchematicEditMain`）中实现。

### 摘要

| `action` | 目的 | 关键参数（除页面外） |
|----------|-----------|--------------------------------------|
| `set_component_transform` | 按位号移动和/或旋转符号 | `designator`；至少一个 `x_mils`、`y_mils`、`rotation_deg` |
| `set_component_parameters` | 更新或添加元件参数 | `designator`、`parameter_names[]`、`parameter_values[]`（相同长度） |
| `place_component` | 从库或工厂放置元件 | `lib_reference`、`designator`、`x_mils`、`y_mils`；可选 `rotation_deg`、`sch_library_path` |
| `add_text` | 页面上的自由文本 | `text`、`x_mils`、`y_mils` |
| `add_net_label` | 网络标签 | `net_name`、`x_mils`、`y_mils`；可选 `rotation_deg` |
| `add_wire` | 按段的正交多段线 | `wire_points_csv` |
| `place_wire` | `add_wire` 的别名（相同实现） | `wire_points_csv` |
| `place_net_label` | `add_net_label` 的别名 | `net_name`、`x_mils`、`y_mils`；可选 `rotation_deg` |
| `add_bus` | **总线**多段线（`eBus`），与 `add_wire` 相同的 CSV | `wire_points_csv` |
| `add_bus_entry` | 一个**总线入口**段（`eBusEntry`） | `wire_points_csv` 包含**恰好**四个数字 `x1,y1,x2,y2`（mils） |
| `place_power_port` | **电源端口**（`ePowerObject` / `ISch_PowerObject`） | `power_port_style`、`x_mils`、`y_mils`；可选 `net_name`、`rotation_deg`、`show_net_name` |
| `place_gnd` | 快捷方式：默认样式 **gnd_power** | 除 `place_power_port` 中必需的样式外，其余可选参数与电源端口相同 |
| `place_vcc` | 快捷方式：默认样式 **arrow** | 同上 |
| `delete_object` | 按类型删除对象（导线/标签/电源端口/元件等） | `object_type`；定位方式之一：`designator`（仅元件）/ `x_mils`+`y_mils`（±25 mil 点选）/ `x1/y1/x2/y2`（矩形区域）/ `delete_all=true`（整页全删该类型） |
| `get_component_info` | 读元件详情（参数、引脚热点坐标） | `designator` |

### 操作详情

#### `set_component_transform`

- **MCP**：`designator` 必需；至少一个位置或旋转。
- **Altium**：坐标为**mils**；旋转为度数，通常根据 API 对齐到 0/90/180/270。
- **常见 Delphi 错误**：`COMPONENT_NOT_FOUND`。

#### `set_component_parameters`

- **MCP**：`parameter_names` 和 `parameter_values` 必需，非空，相同长度。
- **Delphi 错误**：`COMPONENT_NOT_FOUND`、`PARAMETER_ARRAY_MISMATCH`。

#### `place_component`

- **MCP**：`lib_reference`、`designator`、`x_mils`、`y_mils` 必需；`rotation_deg`（对齐到 0/90/180/270 四分之一圈）与 `sch_library_path` 可选。
- **`sch_library_path`**：`.SchLib` 的可选绝对路径**或已安装库名**（如 `Miscellaneous Devices.IntLib`）；如果省略，不传 Library 参数，由 Altium 在已安装库中查找 `LibReference`。
- **实现**：`IntegratedLibrary:PlaceLibraryComponent` **Process 路线**（验证来源：官方示例 `scripting-reference-master/Delphiscript Scripts/Processes/CirWiz.pas` L52-L76）。脚本先 `Client.OpenDocument` + `Client.ShowDocument` 聚焦目标图纸（Process 作用于活动视图），再 `ResetParameters` + `AddStringParameter/AddIntegerParameter` + `RunProcess` 放置完整库元件（含引脚/封装）。**不使用** `SchObjectFactory(eSchComponent)`（空壳）。
- **验证**：放置后重新解析图纸，按 designator（其次按 LibRef 计数增量）读回实际位号和坐标，返回 `success`、`designator`（实际值，若冲突 AD 可能改号）、`x_mils`、`y_mils`、`rotation_quarter`。
- **Delphi 错误**：`LIB_REFERENCE_OR_DESIGNATOR_MISSING`、`SHEET_REQUIRED`、`SHEET_NOT_ACTIVE`、`PLACE_SCH_COMPONENT_FAILED`、`PLACED_COMPONENT_NOT_FOUND`（最常见原因：库未被 Altium 安装/路径不可见）。

#### `add_text`

- **MCP**：`text`、`x_mils`、`y_mils` 必需。
- **Delphi 错误**：`TEXT_EMPTY`、`FACTORY_LABEL_FAILED`。

#### `add_net_label`

- **MCP**：`net_name`、`x_mils`、`y_mils` 必需；`rotation_deg` 可选。
- **Delphi 错误**：`NET_NAME_EMPTY`、`FACTORY_NETLABEL_FAILED`。

#### `add_wire`

- **MCP**：`wire_points_csv` 必需（mils 中数字的 CSV 字符串）。
- **格式**：连续对定义正交段的顶点，例如 `0,0,1000,0,1000,500` → 两段。
- **Delphi 错误**：`WIRE_POINTS_CSV_REQUIRED`、`WIRE_POINTS_NEED_AT_LEAST_FOUR_NUMBERS`、`WIRE_POINTS_ODD_COUNT`、`FACTORY_WIRE_FAILED`。

#### `place_wire` / `place_net_label`

- **MCP**：与 `add_wire` / `add_net_label` 相同的验证。
- **Pascal**：在调度程序之前归一化为 `add_wire` / `add_net_label`；响应 JSON 包含客户端发送的**原始** `action`（`ReportAction`）。

#### `add_bus`

- **MCP**：与 `add_wire` 相同的 `wire_points_csv`。
- **Pascal**：`SchEditAddWireOrBusSegments(..., True)` 使用 `eBus` 和 `ISch_Bus`。
- **Delphi 错误**：`BUS_POINTS_CSV_REQUIRED`、与 wire 相同的无效点错误、`FACTORY_BUS_FAILED`。

#### `add_bus_entry`

- **MCP**：`wire_points_csv` 中恰好**四个**数值（单个段）。
- **Pascal**：`SchEditAddBusEntrySegment` 带有 `eBusEntry` 和 `ISch_BusEntry`（`Location` / `Corner` 如同导线）。
- **Delphi 错误**：`BUS_ENTRY_POINTS_CSV_REQUIRED`、`BUS_ENTRY_POINTS_NEED_EXACTLY_FOUR_NUMBERS`、`FACTORY_BUS_ENTRY_FAILED`。

#### `place_power_port` / `place_gnd` / `place_vcc`

- **MCP**：`power_port_style` 仅在 `place_power_port` 中必需（枚举：`circle`、`arrow`、`bar`、`wave`、`gnd_power`、`power_ground`、`gnd_signal`、`signal_ground`、`gnd_earth`、`earth`）。`x_mils` 和 `y_mils` 必需。`net_name` 可选（如果省略，桥接对地线样式使用 GND，对其他样式使用 VCC）。`show_net_name` 可选（Pascal 默认 true）。
- **Pascal**：`SchObjectFactory(ePowerObject, eCreate_Default)` → `ISch_PowerObject`：`Text`、`Location`、`Orientation`、`SetState_Style`（`TPowerObjectStyle`）、`SetState_ShowNetName`。`place_gnd` 无样式 → `ePowerGndPower`；`place_vcc` 无样式 → `ePowerArrow`。
- **Delphi 错误**：`POWER_PORT_STYLE_REQUIRED`、`POWER_PORT_STYLE_INVALID`、`FACTORY_POWER_OBJECT_FAILED`、`X_Y_MILS_REQUIRED`。

#### `delete_object`

- **MCP**：`object_type` 必需（`wire|bus|bus_entry|net_label|power_port|junction|port|text|line|rectangle|component`）；定位方式（非 `delete_all` 时必需其一）：元件用 `designator`；其他类型用 `x_mils`+`y_mils`（±25 mil 点选）或 `x1/y1/x2/y2` 矩形区域；`delete_all=true` 删除整页该类型全部对象（仅用于整体重画）。
- **实现**：`SchDoc.RemoveSchObject` + RobotManager `SCHM_PrimitiveRegistration` 消息，模式来自官方示例 `DeleteSchObjects.pas`；区域过滤 `AddFilter_Area` 来自 `VendorTools.pas` L990-L1056；元件删除来自 `ReplaceSelectedComponent.PAS` L52。
- **Delphi 错误**：`OBJECT_TYPE_REQUIRED`、`DELETE_TARGET_REQUIRED`、`DESIGNATOR_REQUIRED`（component 无位号）、`COMPONENT_NOT_FOUND`、`OBJECT_TYPE_INVALID`。
- **响应**：`deleted_count`（AI 应核对数量是否符合预期）。

#### `get_component_info`

- **MCP**：`designator` 必需。返回元件详情 + `pins[]`。
- **引脚电气热点（关键修复，2026-09-01）**：`Pin.Location` 是引脚线**体端**（符号体内侧），电气连接点在引脚线**自由端**，即 `Location + PinLength × Orientation`（Orientation = 从元件体向外的方向：0°→+X，90°→+Y，180°→−X，270°→−Y）。属性名是 **`Pin.PinLength`**——API 文档 `02-Schematic_Server_API.md` 中的 `Pin.Length` 是笔误，DelphiScript 会报 `undeclared identifier: length`。
  - 验证来源：官方 `Form_AlignPins.pas`（左侧引脚设 `eRotate180`）、官方 `Connectivity.pas` L44-L47（沿 Orientation 向外偏移）、官方 `RotateSymbol.pas` L173-L182（`Location ± PinLength` 的热点计算）、实测（导线落在 `Pin.Location` 不导通）。
  - `pins[]` 字段：`name`、`designator`、`electrical_type`、`is_hidden`、**`x_mils`/`y_mils`（= 电气热点，布线端点必须精确等于它）**、`pin_length_mils`（100/200 等引脚长度）、`orientation_deg`。
  - 此前版本返回体端坐标，导致所有接到"引脚坐标"的导线实际全部浮空——这是早期绘制电路连线错误的根本原因。

## 预期响应

- **成功**：JSON 包含 `action`、`sheet` 和 `details`（根据操作的对象/模式）等属性，在 Pascal 中生成（`BuildJSONObject`）。
- **Delphi 中的受控失败**：返回带有前缀 `ERROR: ...` 的字符串（也可以作为解析结果在 MCP 流中）。
- **Pascal 中的非类型化异常**：`ERROR: SCHEMATIC_EDIT_EXCEPTION`（脚本运行时不使用 `on E: Exception` 以兼容 Altium 的 DelphiScript）。
- **上层**（`Altium_API.pas`）：面对脚本的全局异常，可能向桥接返回通用执行消息。

## 页面解析错误（`SchEditResolveSheet`）

| 代码（前缀 `ERROR:`） | 大致含义 |
|---------------------------|-------------------------|
| `NO_WORKSPACE` | 无 Altium 工作区 |
| `SHEET_REQUIRED` | 桥接请求中缺少 `schematic_full_path` 和 `schematic_sheet_file_name` |
| `SCHEMATIC_NOT_IN_OPEN_PROJECTS` | 在打开的项目中找不到页面 |
| `PROJECT_NOT_FOUND` | `project_full_path` 与打开的项目不匹配 |
| `SCHEMATIC_SHEET_NOT_FOUND` | 页面名称/路径不匹配 |
| `NO_FOCUSED_PROJECT` | 需要时无聚焦项目 |
| `SCH_DOCUMENT_NOT_OPEN` | 文档未打开 |
| `NOT_A_SCHEMATIC_SHEET` | 文档不是原理图页面 |

## 调度程序中的常见错误（`SchematicEditMain`）

| 代码 | 何时出现 |
|--------|--------|
| `ACTION_REQUIRED` | 请求 JSON 中缺少 `action` |
| `DESIGNATOR_REQUIRED` | 需要位号的操作 |
| `X_Y_MILS_REQUIRED` | `add_text` / `add_net_label` 无坐标 |
| `WIRE_POINTS_CSV_REQUIRED` | `add_wire` / `place_wire` 无 CSV |
| `BUS_POINTS_CSV_REQUIRED` | `add_bus` 无 CSV |
| `BUS_ENTRY_POINTS_CSV_REQUIRED` | `add_bus_entry` 无 CSV |
| `UNKNOWN_ACTION` | `action` 未识别 |
| `POWER_PORT_STYLE_REQUIRED` | `place_power_port` 无 `power_port_style` |
| `POWER_PORT_STYLE_INVALID` | 样式令牌未识别 |
| `FACTORY_POWER_OBJECT_FAILED` | `SchObjectFactory(ePowerObject)` 返回 nil |

## 相关工具

- **`get_schematic_data`**：读取同一页面的元件；建议在编辑后调用以验证。
- **`get_workspace_projects`**：发现打开的 `.SchDoc` 的 `project_full_path` 和 `fullPath`。

## 限制和操作注意事项

- **保存**：桥接不强制保存 `.SchDoc`；用户可以在 Altium 中手动保存。
- **调试器 / 断点**：如果脚本 IDE 暂停，不会写入 `response.json` → MCP 客户端的 **TIMEOUT**。移除断点或无调试运行。
- **`.bridge.lock` 锁定**：如果进程在命令中途死亡，锁可能残留；服务器尝试删除过时的锁（不存在的 PID）。如果持续存在，删除 MCP 工作区文件夹中的 `.bridge.lock`。
- **Altium 版本**：API 细节（SCH 接口）可能在 AD 主版本之间略有变化。在 DelphiScript 中（例如 **AD 26.4**），`ISch_Wire`、`ISch_Bus` 和 `ISch_BusEntry` 通常**不**声明 `Location`/`Corner`；代码通过 **`ISch_GraphicalObject`**（`Gr := W` / `Gr := Bus` / `Gr := BE`）分配两个端点，并在容器中注册具体对象。`MaxInt` 在 Altium 脚本中通常不存在：在 `Altium_API.pas` 中解析 `ERROR:` 时使用 `Copy` 中的 `Length(Data)`。
- **MCP 调试**：在 `success: false` 时，Altium 在工作区中写入 `bridge_last_error.txt`，Node 服务器将该文本连接到工具的 `error` 字段。脚本的**编译**错误不会通过桥接：将消息面板粘贴到 `bridge_user_reported_error.txt` 中并调用 `get_server_status`，以便代理读取它们（`bridgeUserReportedError`）。

## 近期发展（实现背景）

- `altium-scripts` 捆绑包同步到工作区通过**内容指纹**和**就地镜像**（不在每次同步时删除整个文件夹），以免在 Altium 中重复脚本项目。
- DelphiScript 兼容性：在 `Altium_API.pas` 之前的 `schematic_edit.pas` 中不使用 `REPLACEALL`（在适用的地方使用数字标志 `1` 的 `StringReplace`）。
- `SchematicEditMain` 中的 `try/except` 带有显式 `begin`/`end` 主体和简单的 `except`（无类型化 `Exception`）。

---

## 愿景：子块和子工具

### 想法评估

按**功能块**（导线、电源、线束、端口、参数、文本、图形）组织与 Altium 在 UI 中分组命令的方式非常契合，也与代理推理的方式契合（"我想布线"、"我想标记电源"）。如果路线图的每个页面都用显式参数和清晰错误实现，则提供**更多控制**。

**可能**，但有以下注意事项：

| 方面 | 评论 |
|---------|------------|
| **MCP / Trae** | 协议未定义嵌套的"子工具"。通常是**一个工具** `edit_schematic`，每个原子操作有一个字段 **`action`**（或 `operation`），例如 `place_bus`、`place_gnd`。"子块"是**分类和文档**（以及可选的仅信息性字段 `block`，仅供模型使用，不在桥接中使用）。 |
| **Bridge** | 仍然是**每次调用一个 JSON**（`command: schematic_edit` + payload）。每个子工具 = `action` 的新值 + 同一对象中的自有字段。 |
| **Altium / DelphiScript** | 每个新子工具都需要在你的 AD 版本的**原理图 API**（`ISch_*`、`SchServer`、对象工厂）中检查。一些图元是直接的；其他（线束、覆盖、层次端口）在版本之间**更脆弱**，在承诺稳定签名之前值得做一个探索性开发。 |

**设计建议**：保持 **`action` 的平面和稳定名称**（`place_net_label`、`place_line` 等），并通过注释或按家族的 `superRefine` 在文档和 Zod schema 中分组它们。避免注册数十个不同的 MCP 工具（对客户端有噪音且描述重复）。如果将来某个家族增长太多，评估为该领域创建**第二个 MCP 工具**（例如 `edit_schematic_harness`）。

### 建议分类（参考）

指导性树形结构；*斜体*中的名称是 `action` 的候选值（在实现中调整为唯一的 snake_case）。

```
edit_schematic
├── PLACE COMPONENT     → 已由 place_component 覆盖（+ transform / parameters）
├── WIRES
│   ├── place_wire      → 与 add_wire 对齐或重命名以保持兼容性
│   ├── place_bus
│   ├── place_bus_entry
│   └── place_net_label → 与 add_net_label 对齐或重命名为别名
├── POWER PORT
│   ├── place_gnd
│   └── place_vcc
├── HARNESS
│   ├── place_signal
│   ├── place_connector
│   └── place_entry
├── PORTS
│   ├── place_port
│   └── place_off_sheet
├── PARAMETERS
│   ├── place_parameter_set
│   ├── place_blanket
│   └── place_no_erc
├── TEXT
│   ├── place_text_simple   → 与 add_text 对齐
│   ├── place_text_frame
│   └── place_note
└── FIGURES
    ├── place_arc
    ├── place_full_circle
    ├── place_elliptical_arc
    ├── place_ellipse
    ├── place_line
    ├── place_rectangle
    ├── place_round_rectangle
    ├── place_polygon
    ├── place_bezier
    └── place_graphic
```

---

## 分阶段路线图（建议）

每个阶段应结束于：**AD 中的探索性开发**（手动创建对象 + API 检查）、**`schematic_edit.pas` 中的用例**、**Zod + `toolDefinitions` + MCP 描述符**、**在参考 `.PrjPcb` 中的手动测试**以及本文档"已实现的操作"表中的一行。

### 阶段 0 — 基线（已完成）

- 单个工具 `edit_schematic` + 命令 `schematic_edit`。
- 操作：元件（放置 / 变换 / 参数）、文本、网络标签、多段线导线。
- Zod 验证、桥接超时、脚本镜像、DelphiScript 错误处理。

### 阶段 1 — **WIRES** 系列 — **已完成**（仓库中的代码和文档）

**目标**：完成 Altium UI 中接近"布线"的功能。

**状态（仓库）**：已关闭。在 `schematic_edit.pas`（`SchEditAddWireOrBusSegments`、`SchEditAddBusEntrySegment`、别名 `place_wire` / `place_net_label`、JSON 中的 `ReportAction`）、`editSchematic.ts` + `toolDefinitions.ts`、`tests/editSchematic.test.ts` 中的 Vitest 测试中实现。`Altium_API.pas` 中的 `WriteResponse` 使用 `Trim` 修剪 `ERROR:` 前缀后的字面量，以便桥接中的消息更精确。

**在你的 PC 上可选验证**：建议在 Altium Designer 中测试总线和总线入口是否按预期创建（代码使用 `ISch_GraphicalObject` 作为端点；参见"限制"中的注释）。

| 步骤 | 工作 |
|------|---------|
| 1.1 | ~~文档~~ — 类型 `TObjectId`：`eBus`、`eBusEntry`、`eWire`（Altium API 参考）。**已完成**（本文档中的表格和 WIRES 部分）。 |
| 1.2 | 在**你的** AD 中测试总线 / 总线入口行为良好（不阻塞仓库中的阶段关闭）。 |
| 1.3 | ~~`add_bus`、`add_bus_entry` 使用 `wire_points_csv`~~ — **已完成**。 |
| 1.4 | ~~`SchEditAddWireOrBusSegments`、`SchEditAddBusEntrySegment`、`SchematicEditMain` 中的分支~~ — **已完成**。 |
| 1.5 | ~~Zod 枚举 + `superRefine`；MCP 描述~~ — **已完成**。 |
| 1.6 | ~~别名 `place_wire` → `add_wire`、`place_net_label` → `add_net_label`；JSON 响应包含客户端发送的操作~~ — **已完成**。 |

**风险**：低/中；如果 AD 在编译接口时失败，检查你的安装脚本帮助中的类型名称。

### 阶段 2 — **POWER PORT**（GND / VCC）— **已完成**（仓库）

**目标**：放置电源端口，样式和网络与项目一致。

**状态（仓库）**：已实现：`place_power_port` + 快捷方式 `place_gnd` / `place_vcc`；`schematic_edit.pas` 中的 `SchEditPlacePowerPort`；Zod 验证 + Vitest 测试；`toolDefinitions` + 本文档中的文档。

| 步骤 | 工作 |
|------|---------|
| 2.1 | ~~SCH 对象：`ePowerObject` / `ISch_PowerObject`（`Text`、`SetState_Style`（`TPowerObjectStyle`）、`SetState_ShowNetName`、`Location`、`Orientation`）。~~ **已完成** |
| 2.2 | ~~一个主要操作 `place_power_port` 带有 `power_port_style` + 快捷方式 `place_gnd` / `place_vcc`。~~ **已完成** |
| 2.3 | ~~Zod + Pascal + 坐标 / 旋转 / 可选网络 / `show_net_name`。~~ **已完成** |
| 2.4 | **硬件待办**：在你的 AD 中测试样式是否与项目库匹配（网络名称仍然是 power object 的 `Text`）。 |

**风险**：中等（库和网络名称约定）。

### 阶段 3 — **TEXT** 扩展

**目标**：文本框、注释，可能与文档标准对齐。

| 步骤 | 工作 |
|------|---------|
| 3.1 | 映射 **text frame** 和 **note** 与当前简单标签的 API。 |
| 3.2 | 添加 `add_text_frame`、`add_note`（或前缀 `place_*`）带有参数（边界框 mils、内容、字体如果暴露）。 |
| 3.3 | 记录限制（模板、字体）。 |

**风险**：低/中。

### 阶段 4 — **FIGURES**（几何图元）

**目标**：线、矩形、圆、弧、多边形、贝塞尔曲线，根据 API 支持。

| 步骤 | 工作 |
|------|---------|
| 4.1 | 列出目标 AD 版本中每个图形的 `ISch_*` 类型或工厂。 |
| 4.2 | 首先实现**最常用和简单的**：`place_line`、`place_rectangle`（2 个角或宽度/高度）、`place_polygon`（点列表）。 |
| 4.3 | 弧 / 椭圆 / 贝塞尔曲线在子迭代中（几何参数和对齐）。 |
| 4.4 | 统一单位（mils）和旋转约定。 |

**风险**：中等（每个对象有许多变体和属性）。

### 阶段 5 — **PORTS**（页面 / 页面间）

**目标**：页面端口和页面间连接器。

| 步骤 | 工作 |
|------|---------|
| 5.1 | 为**sheet symbol / port** 和 **off-sheet connector** 在你的 AD 中进行探索性开发。 |
| 5.2 | 定义最小参数（名称、方向、I/O、目标页面如果适用）。 |
| 5.3 | 在多页面设计中实现和测试。 |

**风险**：高（层次结构、页面名称、编译规则）。

### 阶段 6 — **PARAMETERS**（原理图指令）

**目标**：参数集、覆盖、无 ERC。

| 步骤 | 工作 |
|------|---------|
| 6.1 | 查看 AD 文档了解**指令**和关联对象。 |
| 6.2 | 探索性开发：从 UI 放置每个并记录脚本可访问的属性。 |
| 6.3 | 设计限于 MVP 的 JSON 负载（矩形、类、规则）。 |

**风险**：高（规则和 ERC 的语义）。

### 阶段 7 — **HARNESS**

**目标**：线束中的信号、连接器和入口。

| 步骤 | 工作 |
|------|---------|
| 7.1 | 确认你的 AD 版本中线束的脚本支持（有时受限）。 |
| 7.2 | 在暴露到 MCP 之前进行独立的探索性开发。 |
| 7.3 | 如果 API 稳定，添加 `place_harness_signal` 等，带有最小参数。 |

**风险**：非常高（版本依赖和线束流程）。

### 所有阶段的横向工作

- 保持**现有 `action` 的向后兼容性**或记录弃用期。
- 按家族添加新的 `ERROR:` 代码以方便代理诊断。
- 重大更改后，在同一页面上执行 **`get_schematic_data`** 以验证效果。
- 当操作集增长时更新 **SKILL / MCP 指令**，以免饱和上下文：按块摘要 + "查看仓库文档获取完整列表"。

---

*最后一次审查与仓库对齐：工具 `edit_schematic` 和先前的操作已端到端实现（MCP + `schematic_edit.pas`）。**阶段 1（WIRES）** 和 **阶段 2（POWER PORT）** 在仓库中标记为已完成（代码；建议在 AD 中手动测试）。关闭每个阶段时更新表格和路线图。*