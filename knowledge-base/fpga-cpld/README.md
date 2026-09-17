# FPGA/CPLD 设计知识库 — 总索引

> 本知识库面向 AI Skills 和 Agent 的结构化检索，覆盖 FPGA/CPLD 硬件设计全流程（最小系统 → 电源序列 → JTAG/配置 → Bank 设计 → 时钟管理 → 高速接口），适用于 Altium Designer 环境下的 FPGA/CPLD 硬件设计场景。

---

## 1. 知识库目录结构

```
knowledge-base/fpga-cpld/
│
├── README.md                          ← 本文件（总索引）
│
└── modules/                           ← FPGA 设计模块知识库（4 个文件）
    ├── 01-fpga-minimum-system.md      ← FPGA 最小系统设计
    ├── 02-power-sequencing.md         ← 电源序列设计
    ├── 03-jtag-configuration.md      ← JTAG 与配置电路
    └── 04-bank-clock-management.md   ← Bank 与时钟管理
```

---

## 2. 模块索引

| 编号 | 文件名 | 主题 | 关键技术点 |
|------|--------|------|------------|
| 01 | `01-fpga-minimum-system.md` | 最小系统 | 电源/地/去耦/复位/晶振/IO |
| 02 | `02-power-sequencing.md` | 电源序列 | VCCINT/VCCAUX/VCCIO 序列/监控 |
| 03 | `03-jtag-configuration.md` | JTAG与配置 | JTAG链/配置模式/Flash/上拉 |
| 04 | `04-bank-clock-management.md` | Bank与时钟 | Bank供电/PLL/全局时钟/区域时钟 |

---

## 3. 知识库统计

| 类别 | 文件数 | 覆盖主题 |
|------|--------|----------|
| FPGA 模块 | 4 | 最小系统/电源序列/配置/Bank时钟 |
| **合计** | **4** | **FPGA 硬件设计核心覆盖** |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-09-15 | 初始版本：4 个 FPGA 模块 | AI Knowledge Base |
