# DRC 规则模板知识库 — 总索引

> 本知识库面向 AI Skills 和 Agent 的结构化检索，覆盖不同设计类型（高速数字、模拟电路、电源系统、混合信号）的 Altium Designer DRC（Design Rule Check）规则模板。提供按设计类型分类的间距、线宽、阻抗、长度匹配、网络分类等规则配置，可直接导入 Altium Designer 使用。

---

## 1. 知识库目录结构

```
knowledge-base/drc-templates/
│
├── README.md                          ← 本文件（总索引）
│
└── modules/                           ← DRC 规则模板（4 个文件）
    ├── 01-high-speed-digital.md      ← 高速数字设计 DRC 规则
    ├── 02-analog-circuit.md          ← 模拟电路 DRC 规则
    ├── 03-power-supply.md            ← 电源系统 DRC 规则
    └── 04-mixed-signal.md            ← 混合信号设计 DRC 规则
```

---

## 2. DRC 规则模板索引

### 2.1 模块文件总览

| 编号 | 文件名 | 设计类型 | 时钟频率/信号范围 | 核心规则要点 |
|------|--------|----------|------------------|-------------|
| 01 | `01-high-speed-digital.md` | 高速数字 | >50MHz | 阻抗控制、长度匹配、3W 规则、层叠管理 |
| 02 | `02-analog-circuit.md` | 模拟电路 | DC~10MHz | 保护环、星形接地、低噪声走线、热对称 |
| 03 | `03-power-supply.md` | 电源系统 | 1W~100W+ | 电流承载、功率回路、爬电距离、热铺铜 |
| 04 | `04-mixed-signal.md` | 混合信号 | MCU+模拟 | 单点接地、区域分割、返回路径连续性 |

### 2.2 模块间依赖关系

```
01-high-speed-digital ──── 04-mixed-signal（数字部分规则）
      │                          │
      │                          │
02-analog-circuit ──────── 04-mixed-signal（模拟部分规则）
      │                          │
      │                          │
03-power-supply ─────────── 所有设计的电源部分规则
```

---

## 3. 在 Altium Designer 中应用 DRC 规则

### 3.1 DRC 规则配置路径

| 操作 | Altium 菜单路径 | 说明 |
|------|----------------|------|
| 规则编辑器 | `Design » Rules` | 打开 PCB Rules and Constraints Editor |
| 网络分类 | `Design » Classes` | 定义 Net Class（如 Power_In, Analog_Signal） |
| 规则导入 | `Design » Rules » File » Import Rules` | 从 .RUL 文件导入规则 |
| 规则导出 | `Design » Rules » File » Export Rules` | 导出规则供其他项目复用 |
| 运行 DRC | `Tools » Design Rule Check` | 执行设计规则检查并生成报告 |
| 在线 DRC | `Properties » DRC Violations` | 布线时实时显示违规 |

### 3.2 Altium DRC 规则类别

| 规则类别 | 英文名 | 覆盖范围 |
|----------|--------|---------|
| 电气规则 | Electrical | 间距、短路、未连接引脚 |
| 布线规则 | Routing | 线宽、布线层、布线拓扑、拐角 |
| 阻焊规则 | Mask | 阻焊桥、阻焊扩展 |
| 平面规则 | Plane | 连接方式、热风焊盘 |
| 制造规则 | Manufacturing | 最小环宽、最小线宽、最小孔径 |
| 高速规则 | High Speed | 长度匹配、差分对、stubs |
| 放置规则 | Placement | 元件间距、方向、高度 |
| 信号完整性 | Signal Integrity | 反射、串扰、过冲 |

### 3.3 网络分类（Net Class）设置

在应用 DRC 规则前，需先定义网络分类，使不同网络类型适用不同规则：

```
常见网络分类定义：

High-Speed Digital:
  - CLK_50M, CLK_100M, ADDR, DATA
  - DDR3_DQ, DDR3_DQS, DDR3_DM
  - USB3_TX, USB3_RX, HDMI_TMDS

Analog:
  - Analog_Signal, Analog_Power, VREF
  - Sensor_Input, ADC_IN, DAC_OUT

Power:
  - Power_In, Power_Switch, Power_Out
  - VCC_3V3, VCC_5V, VCC_12V, GND, AGND, DGND
  - PGND（功率地）, SGND（信号地）

Control:
  - Feedback, Compensation, Soft_Start
  - PWM_Control, Current_Sense
```

### 3.4 按设计类型选择规则模板

```
设计类型 → DRC 模板选型：

MCU + DDR3 系统 → [01-high-speed-digital] 阻抗/长度匹配 + [03-power-supply] 电源规则
传感器信号调理板 → [02-analog-circuit] 低噪声/保护环
DC-DC 变换器 → [03-power-supply] 电流承载/功率回路
MCU + ADC 数据采集 → [04-mixed-signal] 单点接地/区域分割
```

---

## 4. DRC 规则通用原则

### 4.1 间距规则（Clearance）

| 网络分类间 | 间距 (mil) | 说明 |
|-----------|-----------|------|
| Digital - Digital | 6 | 标准 BGA 兼容 |
| Digital - Power | 20 | 电压隔离 |
| Analog - Digital | 20 | 噪声隔离 |
| Analog - Analog | 10 | 高阻抗节点 20mil |
| Power - Power | 20 | 爬电距离按电压 |
| Power - GND | 8 | 最低安全间距 |

### 4.2 线宽规则（Width）

| 网络分类 | 最小 (mil) | 推荐 (mil) | 最大 (mil) | 说明 |
|----------|-----------|-----------|-----------|------|
| Digital 信号 | 4 | 6 | 10 | 50Ω 阻抗按叠层计算 |
| Analog 信号 | 8 | 12 | 20 | 低噪声优先 |
| Power 低电流 | 10 | 15 | 30 | < 1A |
| Power 中电流 | 20 | 40 | 80 | 1~5A |
| Power 大电流 | 40 | 60+ | 200+ | > 5A |
| 差分对 | 按阻抗 | — | — | 按叠层阻抗表 |

### 4.3 过孔规则（Routing Vias）

| 参数 | 标准 | 高速 | 大功率 |
|------|------|------|--------|
| 过孔外径 | 24mil | 20mil | 30mil+ |
| 过孔内径 | 12mil | 10mil | 16mil+ |
| 最小环宽 | 6mil | 5mil | 8mil+ |
| 背钻 | 不需要 | >10GHz 需要 | 不适用 |

---

## 5. 与元器件选型知识库配合使用

DRC 规则需与 `component-selection` 知识库中的选型结果配合：

| 设计类型 | 选型知识库依赖 | DRC 规则 |
|----------|---------------|----------|
| 高速数字电路 | 连接器（USB/板对板）+ MOSFET（负载开关） | `modules/01-high-speed-digital.md` |
| 模拟电路 | 运放 + 电容（去耦） | `modules/02-analog-circuit.md` |
| 电源系统 | MOSFET + 电容（滤波/储能） | `modules/03-power-supply.md` |
| 混合信号系统 | 运放 + 电容 + 连接器 + MOSFET | `modules/04-mixed-signal.md` |

---

## 6. 知识库使用指南

### 6.1 AI Skills 检索建议

1. **按设计类型检索**：先确定设计类型（高速数字/模拟/电源/混合信号），再查对应模块
2. **规则参数表驱动**：每个模块包含 Altium 规则名称和具体数值，可直接配置
3. **交叉引用跟踪**：通过本索引第 5 节，将选型结果与 DRC 模板配合使用
4. **叠层依赖**：阻抗控制规则需结合实际 PCB 叠层参数（铜厚、介电常数、介质厚度）

### 6.2 DRC 规则应用流程

```
1. 确定设计类型 → 选择对应 DRC 模板模块
2. 定义网络分类（Net Classes）→ Design » Classes
3. 配置间距规则 → Design » Rules » Electrical » Clearance
4. 配置线宽规则 → Design » Rules » Routing » Width
5. 配置布线层规则 → Design » Rules » Routing » Routing Layers
6. 配置高速规则 → Design » Rules » High Speed
7. 配置制造规则 → Design » Rules » Manufacturing
8. 运行 DRC → Tools » Design Rule Check
9. 修复违规 → 逐项排查并修改
10. 导出规则 → 供后续项目复用
```

### 6.3 知识库维护

- 新增设计类型模板按 `NN-design-type.md` 编号规则命名
- 规则值更新需同步标注适用的 PCB 叠层参数
- 新增网络分类需同步更新本索引第 3.3 节
- Altium 版本更新需检查规则名称和语法兼容性

---

## 7. 知识库统计

| 类别 | 文件数 | 覆盖主题 |
|------|--------|----------|
| DRC 规则模板 | 4 | 高速数字/模拟/电源/混合信号 |
| **合计** | **4** | **常见设计类型 DRC 覆盖** |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08-21 | 初始版本：4 DRC 模板 | AI Knowledge Base |
