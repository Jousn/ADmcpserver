# 元器件选型知识库 — 总索引

> 本知识库面向 AI Skills 和 Agent 的结构化检索，覆盖电子设计中常用元器件的选型方法、参数对比、型号推荐与 PCB 设计考量。适用于模拟电路、电源系统、高速数字电路和混合信号系统的元器件选型场景。

---

## 1. 知识库目录结构

```
knowledge-base/component-selection/
│
├── README.md                          ← 本文件（总索引）
│
└── modules/                           ← 选型模块知识库（9 个文件）
    ├── 01-opamp-selection.md          ← 运算放大器选型指南
    ├── 02-capacitor-selection.md      ← 电容选型：MLCC vs 钽电容 vs 铝电解
    ├── 03-mosfet-selection.md         ← MOSFET 选型指南
    ├── 04-connector-selection.md     ← 连接器选型指南
    ├── 05-resistor-selection.md      ← 电阻选型指南
    ├── 06-inductor-selection.md      ← 电感选型指南
    ├── 07-diode-led-selection.md     ← 二极管与 LED 选型指南
    ├── 08-crystal-oscillator-selection.md ← 晶振与振荡器选型指南
    └── 09-fuse-ptc-selection.md      ← 保险丝与 PTC 选型指南
```

---

## 2. 选型模块知识库索引

### 2.1 模块文件总览

| 编号 | 文件名 | 主题 | 关键技术点 |
|------|--------|------|------------|
| 01 | `01-opamp-selection.md` | 运算放大器选型 | GBW、压摆率、失调电压、输入偏置电流、轨到轨、噪声 |
| 02 | `02-capacitor-selection.md` | 电容选型 | MLCC (X5R/X7R) DC 偏压降额、钽电容降额与失效模式、铝电解寿命与纹波电流 |
| 03 | `03-mosfet-selection.md` | MOSFET 选型 | Vds/Id/Rds(on)/Qg、逻辑级 vs 标准、开关 vs 线性、热计算 |
| 04 | `04-connector-selection.md` | 连接器选型 | USB/板对板/线对板/电源/RF 连接器、间距、电流额定值、插拔次数 |
| 05 | `05-resistor-selection.md` | 电阻选型 | 厚膜/薄膜/合金箔、精度/TCR/噪声、上下拉/反馈/采样/功率、降额 |
| 06 | `06-inductor-selection.md` | 电感选型 | 功率/高频/共模/磁珠、饱和电流/DCR/SRF/Q值、屏蔽式 vs 非屏蔽 |
| 07 | `07-diode-led-selection.md` | 二极管与 LED 选型 | 整流/开关/稳压/TVS/LED、Vf/Vrrm/trr、I²t、Fuse+TVS 协调 |
| 08 | `08-crystal-oscillator-selection.md` | 晶振与振荡器选型 | 无源/有源/TCXO/OCXO/MEMS、负载电容计算、相位噪声/抖动 |
| 09 | `09-fuse-ptc-selection.md` | 保险丝与 PTC 选型 | 快断/慢断/PTC/eFuse、I²t 值、保持/跳闸电流、温度降额 |

### 2.2 模块间依赖关系

```
01-opamp-selection ──── 02-capacitor-selection（去耦/滤波电容配合运放）
      │                         │
      │                         │
      └─── 03-mosfet-selection（功率级与驱动级配合）
                │
                │
                └─── 04-connector-selection（电源/信号接口连接器）
```

---

## 3. 按元器件类别的推荐检索路径

### 3.1 有源器件选型

```
运放选型
    │
    ├─▶ [模块 01] 运算放大器选型 → 按精度/速度/功耗分类确定型号
    └─▶ [模块 03] MOSFET 选型 → 按功率等级/拓扑确定开关管型号
```

### 3.2 无源器件选型

```
电容选型
    │
    ├─▶ [模块 02] MLCC/钽/铝电解选型 → 按频率/电压/寿命/失效模式确定类型
    └─▶ 并联组合策略 → MLCC（高频）+ 钽电容（中频）+ 铝电解（大容量）
```

### 3.3 机电/接口器件选型

```
连接器选型
    │
    ├─▶ [模块 04] 按接口标准（USB/板对板/线对板/电源/RF）确定连接器
    └─▶ PCB 封装考量 → 焊盘尺寸、过孔布置、电镀要求
```

---

## 4. 在 Altium Designer 中应用选型知识

### 4.1 元器件库管理

| 操作 | 说明 |
|------|------|
| `Tools » Component Search` | 按型号搜索器件，支持 Manufacturer Part Search |
| `File » Manufacturer Part Search` | 在 Altium 供应链平台搜索带供应链信息的器件 |
| `Design » Update PCB from Library` | 从库中更新器件封装到 PCB |
| `Place » Part` | 放置器件到原理图 |

### 4.2 选型审查流程

```
1. 确定电路需求 → 查本知识库对应模块确定关键参数
2. 按参数表筛选候选型号 → 查阅数据手册确认
3. 在原理图中放置器件 → 分配封装和供应链链接
4. 运行 DRC → 验证封装与间距规则
5. 输出 BOM → 供应链验证供货与生命周期状态
```

### 4.3 与 DRC 模板知识库配合使用

选型完成后，可根据设计类型调用 `drc-templates` 知识库中的规则模板：

| 设计类型 | 选型知识库依赖 | DRC 模板 |
|----------|---------------|----------|
| 高速数字电路 | 连接器（USB/板对板）+ MOSFET（负载开关） | `drc-templates/modules/01-high-speed-digital.md` |
| 模拟电路 | 运放 + 电容（去耦） | `drc-templates/modules/02-analog-circuit.md` |
| 电源系统 | MOSFET + 电容（滤波/储能） | `drc-templates/modules/03-power-supply.md` |
| 混合信号系统 | 运放 + 电容 + 连接器 + MOSFET | `drc-templates/modules/04-mixed-signal.md` |

---

## 5. 知识库使用指南

### 5.1 AI Skills 检索建议

1. **关键词检索优先**：每个文件头部均包含主题摘要，支持关键词快速定位
2. **参数驱动选型**：先确定电路关键参数，再查模块中型号表匹配
3. **交叉引用跟踪**：通过本索引第 4.3 节，将选型结果与 DRC 模板配合使用
4. **降额原则**：所有选型均需按应用场景（商用/工业/军用）进行降额

### 5.2 选型降额原则速查

| 应用场景 | 电压降额 | 电流降额 | 温度降额 | 失效要求 |
|----------|---------|---------|---------|---------|
| 商用（消费电子） | 80% | 75% | 额定×85% | 一般 |
| 工业 | 70% | 65% | 额定×75% | 高可靠 |
| 军用 | 60% | 60% | 额定×70% | 极高可靠，无短路失效模式 |

### 5.3 知识库维护

- 新增模块文件按 `NN-topic-name.md` 编号规则命名
- 新增器件型号需标注数据手册版本与供货状态
- 降额准则更新需同步更新本索引第 5.2 节
- 选型结果变更需同步检查对应 DRC 模板规则适用性

---

## 6. 知识库统计

| 类别 | 文件数 | 覆盖主题 |
|------|--------|----------|
| 选型模块 | 9 | 运放/电容/MOSFET/连接器/电阻/电感/二极管LED/晶振/保险丝 |
| **合计** | **9** | **常用元器件选型全覆盖** |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08-21 | 初始版本：4 选型模块 | AI Knowledge Base |
| 1.1 | 2026-09-15 | 新增 5 个选型模块：电阻/电感/二极管LED/晶振/保险丝 | AI Knowledge Base |
