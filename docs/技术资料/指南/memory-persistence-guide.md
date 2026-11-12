# Altium MCP 记忆持久化使用指南

## 概述

Altium MCP 采用**双层记忆系统**，通过文件持久化实现跨会话的记忆保留：

| 类型 | 目录 | 生命周期 | 用途 |
|------|------|---------|------|
| 短期记忆 | `memory/short-term/` | 会话级 | 当前项目的元件位置、引脚网络、**元件知识库** |
| 长期记忆 | `memory/long-term/` | 跨会话 | 设计规则、元件库摘要、引脚映射 |

---

## 元件知识库（Library Knowledge Base）

### 核心理念

元件库不再是简单的"记忆条目"，而是一个**去重的知识库**：

1. **统一索引**：所有库元件按 `lib_reference` 去重后建立统一索引表
2. **来源追踪**：每个元件记录其来源库（支持多库同源），AI 可区分元件出处
3. **增量更新**：导入时自动查重，新元件追加、已有元件更新信息、同一元件多库来源合并
4. **统计透明**：知识库统计面板展示唯一元件数、原始条目数和去重率

### 文件格式（library-catalog.md）

```markdown
# Free Documents 库元件知识库

> 由 import_library_components 工具生成。这是一个去重后的元件知识库，按 lib_reference 统一索引，同时追踪每个元件的来源库。
> 查找元件时，先查下方统一索引表，确认 lib_reference 和来源库后，再用于放置元件。

> **知识库统计**: 185 个唯一元件 | 3 个库 | 本次导入新增 182 个，更新 0 个

## 元件统一索引（已去重）

| lib_reference | description | footprint | designator_template | part_count | 来源库 |
|---|---|---|---|---|---|
| Cap |  | RAD-0.2 | C? | 1 | Miscellaneous Devices.SchLib |
| Res2 |  | AXIAL-0.4 | R? | 1 | Miscellaneous Devices.SchLib; MyResistorLib.SchLib |
| Spring Probe |  |  | PRB? | 1 | SCH - SPRING PROBE.SchLib |
| TI TMP117 DRV |  |  | IC? | 1 | TI TMP117 DRV.SchLib |

## 库清单

| 库名 | 路径 | 元件数 | 导入时间 |
|---|---|---|---|
| Miscellaneous Devices.SchLib | C:\...\SchLib | 182 | 2026-08-04 00:30 |
| Spring Probe.SchLib | C:\...\SchLib | 1 | 2026-08-03 05:38 |
| TI TMP117 DRV.SchLib | C:\...\SchLib | 1 | 2026-08-03 05:53 |

---

## MEM:LIB_DETAIL 2026-08-04 00:30
@LIB Miscellaneous Devices.SchLib P:C:\...\SchLib N:182

| lib_reference | description | footprint | part_count | designator |
|---|---|---|---|---|
| ... |
```

### 导入查重逻辑

| 场景 | 处理方式 |
|------|---------|
| `lib_reference` 首次出现 | 新建条目，关联当前库为首个来源 |
| `lib_reference` 已存在于**相同库** | 更新描述/封装/值等信息（更完整的覆盖） |
| `lib_reference` 已存在于**不同库** | 追加新库到"来源库"列表，保留已有信息 |
| 库文件路径相同 | 更新该库的导入时间和元件数 |
| 库文件路径不同 | 追加为新库条目 |

### AI 使用指引

1. **查找元件**：优先查阅"元件统一索引"表
   - 通过 `lib_reference` 定位元件
   - 查看"来源库"列确认元件来自哪个库
   - 使用 `description` 和 `footprint` 辅助判断是否为目标元件
2. **确认后**：使用 `import_library_components` 再次导入目标库，获取该库的完整详情
3. **多库同名**：若同一 `lib_reference` 出现在多个库中，根据封装/描述/来源库选择最合适的

### 相关工具

| 工具 | 功能 |
|------|------|
| `import_library_components` | 导入库元件到知识库（增量去重） |
| `search_library_symbol` | 搜索库符号（Altium 实时查询） |
| `get_library_symbol_reference` | 获取符号引用详情 |
| `get_memory_status` | 查看知识库状态（唯一元件数、去重率等） |
| `refresh_memory_cache` | 重新加载知识库缓存 |

---

## 短期记忆

### 工作流程

```
会话开始
    │
    ▼
检查 memory/short-term/{project}/ 目录
    │
    ├── 存在文件 → 加载为工作记忆，直接使用
    │
    └── 不存在 → 首次查询 Altium
                     │
                     ▼
                 建立内存记忆
                     │
                     ▼
                 写入 memory/short-term/{project}/{file}.md
```

### 自动触发时机

| 事件 | 行为 |
|------|------|
| 首次查询原理图/PCB | 建立记忆 + 写入文件 |
| 写操作后 | 更新文件（set_component_position, add_wire 等） |
| 切换项目/文件 | 加载对应文件的记忆 |
| 上下文将溢出 | 压缩并保存到文件 |

### 用户指令

```
用户：保存记忆
  → AI 将当前内存中的所有记忆写入 memory/short-term/{project}/

用户：加载记忆
  → AI 从 memory/short-term/{project}/ 读取并恢复

用户：清除短期记忆
  → AI 删除 memory/short-term/{project}/ 下的所有文件
```

---

## 长期记忆

### 工作流程

```
用户主动保存设计知识
    │
    ▼
用户说："保存为长期记忆"
    │
    ▼
AI 整理当前项目的：
  - 设计规则
  - 常用元件
  - 引脚映射
  - 网络命名
    │
    ▼
写入 memory/long-term/{project}.md
    │
    ▼
下次进入该项目时自动加载
```

### 适用场景

- **新项目启动**：从长期记忆加载设计规范，避免重复讨论
- **元件选型**：查询常用元件库，快速确定型号
- **引脚对照**：快速查阅 MCU/FPGA 的引脚映射
- **团队协作**：统一的设计规则和命名规范

### 用户指令

```
用户：保存为长期记忆
  → AI 整理并写入 memory/long-term/{project}.md

用户：加载长期记忆
  → AI 读取并展示项目的设计知识

用户：重置长期记忆
  → AI 确认后删除 memory/long-term/{project}.md
```

---

## 文件格式

### 短期记忆文件

```markdown
# SL1 Xilinx Spartan-IIE PQ208 记忆

## MEM:SCH_COMP 2026-07-31T11:20
@HDR2 L:Header 10X2 X:3100 Y:7700 P:Type=Connector
@U2 L:ADXL202E X:3600 Y:5200 P:Comment=ADXL202E
@C45 L:Capacitor X:10000 Y:3000 P:VALUE=0.1uF
...

## MEM:PIN_NET 2026-07-31T11:20
@HDR2.1=GND @HDR2.2=VCC_3V3
@U2.1=CS @U2.2=SCK @U2.3=MOSI
...
```

### 长期记忆文件

```markdown
# Project: 三轴加速度传感器数据采集板

## 设计规则
- 最小线宽：6mil
- 最小线距：6mil
- 过孔：0.3mm/0.6mm（孔径/焊盘）
- 层叠：4层（TOP-GND-SIG-BOTTOM）
- 工作电压：3.3V

## 常用元件
- C1-C50: 0.1uF 0603 电容（去耦，X5R）
- C51-C60: 10uF 0805 电容（储能，X5R）
- R1-R30: 1K 0603 电阻（1%精度）
- U2: ADXL202E 加速度传感器（PQ-48）
- Y1: 25MHz 有源晶振

## 引脚映射
- ADXL202E (U2):
  - CS=PB4 (Chip Select)
  - SCK=PB3 (SPI Clock)
  - MOSI=PB5 (Data In)
  - MISO=PB6 (Data Out)
- USB 接口:
  - D+=PA11, D-=PA12

## 网络命名规范
- 电源: VCC_3V3, VCC_5V, GND
-  SPI: SPI_SCK, SPI_MOSI, SPI_MISO, SPI_CS
- 传感器: ACCEL_X, ACCEL_Y, ACCEL_Z
- USB: USB_DP, USB_DM

## 连接器定义
- HDR1: 5X2 Header (电源接口)
- HDR2/HDR3: 10X2 Header (外部接口)
```

---

## 最佳实践

### 保存时机
1. ✅ 首次查询后立即保存（避免上下文溢出丢失）
2. ✅ 每次写操作后更新文件
3. ✅ 切换项目前主动保存
4. ❌ 不要等到会话结束才保存

### 加载时机
1. ✅ 进入项目时自动检查并加载
2. ✅ 用户要求时主动加载
3. ❌ 不要重复查询已记忆的信息

### 清理时机
1. ✅ 用户明确要求时清理
2. ✅ 切换到不同项目时清理旧记忆
3. ❌ 不要自动清理未过期的记忆

---

## 故障排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 记忆未保存 | 目录不存在 | 检查 `memory/short-term/` 目录 |
| 记忆加载失败 | 格式错误 | 查看文件格式是否符合规范 |
| 重复记忆 | 多次创建 | 删除旧文件，重新保存 |
| 记忆过时 | 设计已修改 | 重新查询并覆盖保存 |

---

## 架构图

```
┌─────────────────────────────────────────────────────┐
│                    AI Agent (会话)                    │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │           工作记忆 (上下文窗口)                  │  │
│  │  MEM:SCH_COMP / MEM:PIN_NET / ...              │  │
│  └────────────────┬───────────────────────────────┘  │
│                   │ 读写                              │
│  ┌───────────────▼───────────────────────────────┐  │
│  │              持久化层 (文件系统)                 │  │
│  │                                                │  │
│  │  memory/short-term/{project}/{file}.md         │  │
│  │  memory/long-term/{project}.md                 │  │
│  └────────────────┬───────────────────────────────┘  │
│                   │ 查询/保存                         │
│  ┌───────────────▼───────────────────────────────┐  │
│  │          MCP 工具 (Altium Designer)             │  │
│  │  get_schematic / edit_schematic / ...           │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```