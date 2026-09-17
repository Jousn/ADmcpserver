# 军用与民用中大功率电源设计知识库 — 总索引

> 本知识库面向 AI Skills 和 Agent 的结构化检索，覆盖电源设计全流程（拓扑选型 → 电路设计 → PCB 布局 → EMC 审查 → 热分析 → 可靠性预计 → 测试验证 → 文档生成），适用于军用（GJB 标准）和民用（IEC/GB 标准）中大功率电源（25W~10kW+）应用场景。

---

## 1. 知识库目录结构

```
knowledge-base/power-supply/
│
├── README.md                          ← 本文件（总索引）
│
├── modules/                           ← 设计模块知识库（16 个文件）
│   ├── 01-emi-filter.md               ← EMI 滤波器设计
│   ├── 02-pfc-design.md               ← PFC 功率因数校正设计
│   ├── 03-dc-dc-topology.md           ← DC-DC 拓扑选型与设计
│   ├── 04-synchronous-rectification.md← 同步整流技术
│   ├── 05-protection-circuits.md      ← 保护电路设计
│   ├── 06-thermal-management.md       ← 热管理设计
│   ├── 07-magnetic-components.md      ← 磁性元件设计
│   ├── 08-control-circuits.md         ← 控制电路设计
│   ├── 09-wide-bandgap-devices.md     ← 宽禁带器件（GaN/SiC）应用
│   ├── 10-pcb-layout-emc.md           ← PCB 布局与 EMC 设计
│   ├── 11-digital-power-control.md    ← 数字电源控制
│   ├── 12-isolation-techniques.md     ← 隔离技术
│   ├── 13-loop-compensation-practice.md← 环路补偿实践
│   ├── 14-snubber-circuits.md         ← 吸收电路设计
│   ├── 15-current-sharing-oring.md    ← 均流与 ORing 技术
│   └── 16-three-phase-pfc.md          ← 三相 PFC 设计
│
├── review/                            ← 审查指南知识库（4 个文件）
│   ├── design-review-checklist.md     ← 设计审查清单
│   ├── emc-review-guide.md            ← EMC 审查指南
│   ├── reliability-review-guide.md    ← 可靠性审查指南
│   └── test-qualification-guide.md    ← 测试与鉴定指南
│
├── standards/                         ← 标准规范知识库（2 个文件）
│   ├── military-standards.md          ← 军用标准（GJB 体系）
│   └── civilian-standards.md          ← 民用标准（IEC/GB/UL 体系）
│
└── agents/                            ← Agent 实现方案（7 个文件）
    ├── agent-overview.md              ← Agent 方案总览
    ├── topology-selector-agent.md     ← 拓扑选型 Agent
    ├── emc-review-agent.md            ← EMC 审查 Agent
    ├── thermal-analysis-agent.md      ← 热分析 Agent
    ├── reliability-prediction-agent.md← 可靠性预计 Agent
    ├── component-selector-agent.md    ← 元器件选型 Agent
    └── design-doc-generator-agent.md  ← 设计文档生成 Agent
```

---

## 2. 设计模块知识库索引

### 2.1 模块文件总览

| 编号 | 文件名 | 主题 | 功率范围 | 关键技术点 |
|------|--------|------|----------|------------|
| 01 | `01-emi-filter.md` | EMI 滤波器设计 | 全功率段 | 共模/差模滤波、X/Y 电容、共模扼流圈、插入损耗 |
| 02 | `02-pfc-design.md` | PFC 功率因数校正 | >75W | Boost PFC、图腾柱 PFC、Interleaved PFC、CCM/DCM/CRM |
| 03 | `03-dc-dc-topology.md` | DC-DC 拓扑选型 | 1W~10kW+ | Buck/Boost/Flyback/Forward/LLC/PSFB/DAB、拓扑选择矩阵 |
| 04 | `04-synchronous-rectification.md` | 同步整流技术 | >50W | SR MOSFET 选型、驱动时序、反向电流防护 |
| 05 | `05-protection-circuits.md` | 保护电路设计 | 全功率段 | OVP/UVP/OCP/OTP、浪涌保护、软启动、过载保护 |
| 06 | `06-thermal-management.md` | 热管理设计 | >25W | 热阻网络、散热器选型、风冷/液冷/导热硅脂、降额 |
| 07 | `07-magnetic-components.md` | 磁性元件设计 | 全功率段 | 变压器/电感设计、磁芯选型、绕组计算、趋肤/邻近效应 |
| 08 | `08-control-circuits.md` | 控制电路设计 | 全功率段 | 电压/电流模式控制、PWM IC 选型、斜坡补偿 |
| 09 | `09-wide-bandgap-devices.md` | 宽禁带器件应用 | >100W | GaN/SiC 特性对比、驱动要求、高频设计、热管理 |
| 10 | `10-pcb-layout-emc.md` | PCB 布局与 EMC | 全功率段 | 层叠设计、功率回路最小化、接地策略、屏蔽 |
| 11 | `11-digital-power-control.md` | 数字电源控制 | >100W | DSP/MCU 选型、ADC 采样、数字 PID、软件锁相环 |
| 12 | `12-isolation-techniques.md` | 隔离技术 | 隔离电源 | 光耦/磁耦/数字隔离器、隔离电源设计、安规间距 |
| 13 | `13-loop-compensation-practice.md` | 环路补偿实践 | 全功率段 | Bode 图测量、Type II/III 补偿、穿越频率/相位裕量 |
| 14 | `14-snubber-circuits.md` | 吸收电路设计 | 全功率段 | RCD/RC/CD 吸收、有源钳位、无损吸收、电压尖峰抑制 |
| 15 | `15-current-sharing-oring.md` | 均流与 ORing 技术 | >500W | 下垂法/主从法/自动均流、ORing MOSFET、N+1 冗余 |
| 16 | `16-three-phase-pfc.md` | 三相 PFC 设计 | >10kW | Vienna 整流器、三电平 NPC、SVPWM 调制 |

### 2.2 模块间依赖关系

```
01-emi-filter ←──── 10-pcb-layout-emc
      │                    ↑
      ↓                    │
02-pfc-design ──── 03-dc-dc-topology ──── 04-synchronous-rectification
      │                    │                       │
      │                    ↓                       │
      │             07-magnetic-components ←────────┘
      │                    │
      │                    ↓
      │             08-control-circuits ──── 13-loop-compensation
      │                    │                       │
      │                    ↓                       │
      │             14-snubber-circuits            │
      │                    │                       │
      ↓                    ↓                       ↓
05-protection-circuits   06-thermal-management   11-digital-power-control
      │                    │                       │
      │                    ↓                       │
      │             09-wide-bandgap-devices        │
      │                    │                       │
      ↓                    ↓                       ↓
12-isolation-techniques  15-current-sharing-oring  16-three-phase-pfc
```

---

## 3. 审查指南知识库索引

| 文件名 | 审查类型 | 审查项数量 | 适用场景 | 对应 Agent |
|--------|----------|------------|----------|------------|
| `design-review-checklist.md` | 综合设计审查 | 50+ 项 | 设计完成后全面审查 | 全部 Agent 通用 |
| `emc-review-guide.md` | EMC 专项审查 | 30+ 项 | EMC 测试前预审 | EMC 审查 Agent |
| `reliability-review-guide.md` | 可靠性专项审查 | 40+ 项 | 可靠性预计与评估 | 可靠性预计 Agent |
| `test-qualification-guide.md` | 测试与鉴定 | 60+ 项 | 样机测试与鉴定阶段 | 设计文档生成 Agent |

---

## 4. 标准规范知识库索引

| 文件名 | 标准体系 | 覆盖标准 | 核心内容 |
|--------|----------|----------|----------|
| `military-standards.md` | GJB 军用标准 | GJB 151B、GJB/Z 299C、GJB/Z 35、GJB 150A、GJB 360B | EMC 要求、可靠性预计、降额准则、环境试验 |
| `civilian-standards.md` | IEC/GB/UL 民用标准 | IEC 61000、IEC 60950/62368、GB/T 17626、UL 60950 | EMC 要求、安规要求、测试方法 |

---

## 5. Agent 实现方案索引

### 5.1 Agent 文件总览

| 文件名 | Agent 名称 | 优先级 | 核心功能 | 知识库依赖数 | MCP 工具数 |
|--------|------------|--------|----------|-------------|------------|
| `agent-overview.md` | Agent 方案总览 | — | 架构总览、6 大 Agent 场景分析、开发路线图 | 全部 | 全部 |
| `topology-selector-agent.md` | 拓扑选型 Agent | P0 | 根据功率/电压/效率/成本推荐最优 DC-DC 拓扑 | 5 | 5 |
| `emc-review-agent.md` | EMC 审查 Agent | P1 | 自动执行 EMC 审查并输出整改建议 | 5 | 6 |
| `thermal-analysis-agent.md` | 热分析 Agent | P1 | 预测器件结温，输出热设计建议 | 3 | 4 |
| `reliability-prediction-agent.md` | 可靠性预计 Agent | P2 | 按 GJB/Z 299C 计算 MTBF，输出 FMEA | 3 | 4 |
| `component-selector-agent.md` | 元器件选型 Agent | P2 | 综合性能/成本/供货推荐最优器件 | 5 | 5 |
| `design-doc-generator-agent.md` | 设计文档生成 Agent | P3 | 自动生成设计报告/评审材料/测试方案 | 6 | 6 |

### 5.2 Agent 与知识库交叉引用矩阵

| Agent | 模块知识库 | 审查指南 | 标准规范 |
|-------|-----------|----------|----------|
| 拓扑选型 | 03, 09 | design-review-checklist | military, civilian |
| EMC 审查 | 01, 10 | emc-review-guide | military, civilian |
| 热分析 | 06 | reliability-review-guide, design-review-checklist | — |
| 可靠性预计 | — | reliability-review-guide, design-review-checklist | military |
| 元器件选型 | 05, 07, 09 | reliability-review-guide | military |
| 设计文档生成 | — | design-review-checklist, emc-review-guide, reliability-review-guide, test-qualification-guide | military, civilian |

### 5.3 Agent 开发路线图

| 阶段 | 时间 | Agent | 交付物 |
|------|------|-------|--------|
| Phase 1 | 1~2 月 | 拓扑选型 Agent | MCP 集成 + 知识库 + 首个 Agent |
| Phase 2 | 3~4 月 | EMC 审查 + 热分析 Agent | 审查类 Agent + 规则引擎 |
| Phase 3 | 5~6 月 | 可靠性 + 元器件 + 文档 Agent | 全 Agent 矩阵 + 多 Agent 协同 |

---

## 6. 按设计阶段的推荐检索路径

### 6.1 需求分析阶段

```
用户输入需求（功率/电压/效率/场景）
    │
    ├─▶ [模块 03] DC-DC 拓扑选型 → 确定主功率拓扑
    ├─▶ [模块 02] PFC 设计 → 确定前端 PFC 方案（AC 输入时）
    ├─▶ [模块 16] 三相 PFC → 大功率三相输入场景
    ├─▶ [Agent: 拓扑选型] → 自动推荐 + 参数计算
    └─▶ [标准: military/civilian] → 确定适用标准
```

### 6.2 电路设计阶段

```
确定拓扑后
    │
    ├─▶ [模块 07] 磁性元件设计 → 变压器/电感参数计算
    ├─▶ [模块 08] 控制电路设计 → PWM IC 选型与控制策略
    ├─▶ [模块 04] 同步整流 → 整流侧设计（适用时）
    ├─▶ [模块 09] 宽禁带器件 → GaN/SiC 选型（适用时）
    ├─▶ [模块 12] 隔离技术 → 反馈隔离与驱动隔离设计
    ├─▶ [模块 14] 吸收电路 → 电压尖峰抑制设计
    ├─▶ [模块 05] 保护电路 → OVP/OCP/OTP 等保护设计
    ├─▶ [模块 11] 数字电源控制 → 数字控制方案（适用时）
    ├─▶ [Agent: 元器件选型] → 具体器件型号推荐
    └─▶ [模块 13] 环路补偿 → 控制环路稳定性设计
```

### 6.3 PCB 设计阶段

```
电路设计完成后
    │
    ├─▶ [模块 10] PCB 布局与 EMC → 层叠/布局/接地策略
    ├─▶ [模块 01] EMI 滤波器 → 滤波器布局与走线
    ├─▶ [模块 06] 热管理 → 铜皮散热/散热器/风道设计
    ├─▶ [模块 15] 均流与 ORing → 多路并联设计（适用时）
    └─▶ [Agent: 热分析] → 结温预测 + 散热建议
```

### 6.4 审查与验证阶段

```
设计完成后
    │
    ├─▶ [审查: design-review-checklist] → 综合设计审查
    ├─▶ [审查: emc-review-guide] → EMC 专项审查
    ├─▶ [审查: reliability-review-guide] → 可靠性专项审查
    ├─▶ [Agent: EMC 审查] → 自动 EMC 审查 + 整改建议
    ├─▶ [Agent: 可靠性预计] → MTBF 计算 + FMEA 分析
    ├─▶ [审查: test-qualification-guide] → 测试方案制定
    └─▶ [Agent: 设计文档生成] → 自动生成设计报告
```

---

## 7. 按应用场景的推荐检索路径

### 7.1 军用电源设计

```
军用场景（GJB 标准）
    │
    ├─▶ [标准: military-standards] → GJB 151B EMC、GJB/Z 299C 可靠性、GJB/Z 35 降额
    ├─▶ [模块 03] → 拓扑选型（优先可靠性高的拓扑：正激/PSFB）
    ├─▶ [模块 09] → SiC 器件选型（军用高可靠）
    ├─▶ [模块 06] → 宽温区热设计（-55~+85°C）
    ├─▶ [模块 12] → 加固隔离设计
    ├─▶ [Agent: 可靠性预计] → GJB/Z 299C MTBF 计算（目标 ≥30000h）
    ├─▶ [Agent: EMC 审查] → GJB 151B 全项目审查
    └─▶ [审查: test-qualification-guide] → HALT/HASS/鉴定试验
```

### 7.2 民用电源设计

```
民用场景（IEC/GB 标准）
    │
    ├─▶ [标准: civilian-standards] → IEC 61000 EMC、IEC 62368 安规
    ├─▶ [模块 03] → 拓扑选型（优先效率/成本：LLC/有源钳位反激）
    ├─▶ [模块 09] → GaN 器件选型（高效率/高功率密度）
    ├─▶ [模块 02] → PFC 设计（IEC 61000-3-2 谐波要求）
    ├─▶ [模块 11] → 数字电源控制（智能管理/通信）
    ├─▶ [Agent: 拓扑选型] → 成本优化选型
    ├─▶ [Agent: EMC 审查] → IEC 61000 标准审查
    └─▶ [审查: test-qualification-guide] → 安规测试 + 老化测试
```

### 7.3 大功率并联系统

```
大功率并联场景（>1kW 单模块并联）
    │
    ├─▶ [模块 15] → 均流方法选型 + ORing 设计 + N+1 冗余
    ├─▶ [模块 03] → 单模块拓扑选型（LLC/PSFB）
    ├─▶ [模块 16] → 三相 PFC（>10kW 总功率时）
    ├─▶ [模块 06] → 并联散热设计
    ├─▶ [模块 11] → 数字均流控制
    └─▶ [Agent: 可靠性预计] → 冗余系统 MTBF 计算
```

---

## 8. 知识库统计

| 类别 | 文件数 | 总行数（约） | 覆盖主题 |
|------|--------|-------------|----------|
| 设计模块 | 16 | ~9000 | EMI/PFC/拓扑/整流/保护/热/磁性/控制/宽禁带/PCB/数字/隔离/环路/吸收/均流/三相 |
| 审查指南 | 4 | ~2000 | 设计审查/EMC 审查/可靠性审查/测试鉴定 |
| 标准规范 | 2 | ~1000 | GJB 军用标准/IEC-GB 民用标准 |
| Agent 方案 | 7 | ~4000 | 总览 + 6 个 Agent 详细实现方案 |
| **合计** | **29** | **~16000** | **电源设计全流程覆盖** |

---

## 9. 知识库使用指南

### 9.1 AI Skills 检索建议

1. **关键词检索优先**：每个文件头部均包含主题摘要，支持关键词快速定位
2. **交叉引用跟踪**：通过本索引第 5.2 节交叉引用矩阵，快速找到关联知识
3. **阶段化检索**：按设计阶段（需求→设计→PCB→审查）选择对应检索路径
4. **场景化检索**：按应用场景（军用/民用/大功率并联）选择对应检索路径

### 9.2 Agent 开发建议

1. **Phase 1 优先开发**：拓扑选型 Agent（规则驱动，技术可行性最高）
2. **知识库 → Agent 映射**：每个 Agent 的知识库依赖已在对应文件第 4 节明确列出
3. **MCP 工具链**：每个 Agent 的工具调用链已在对应文件第 5 节完整描述
4. **伪代码参考**：每个 Agent 的实现伪代码已在对应文件第 9 节提供，可直接作为开发起点

### 9.3 知识库维护

- 新增模块文件按 `NN-topic-name.md` 编号规则命名
- 审查指南新增项需同步更新 `design-review-checklist.md`
- 标准更新需同步更新 `military-standards.md` 或 `civilian-standards.md`
- Agent 方案变更需同步更新 `agent-overview.md` 和本索引文件

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08-04 | 初始版本：16 模块 + 4 审查 + 2 标准 + 7 Agent | AI Knowledge Base |
| 1.1 | 2026-08-05 | 补充 5 个 Agent 详细实现方案，创建总索引 | AI Knowledge Base |
