# 高速数字设计 DRC 规则模板

> 适用范围：时钟频率 > 50MHz 的高速数字电路（DDR3/4、PCIe、USB 3.0、HDMI、SerDes）
> 目标受众：AI设计辅助Skill，用于高速数字 PCB DRC 规则配置与审查
> 版本：v1.0 | 更新日期：2026-08

---

## 1. 概述

高速数字设计的 PCB 布线必须严格控制阻抗、长度匹配、返回路径和层叠结构。不当的布线会导致信号完整性（SI）问题，如反射、串扰、过冲/下冲，最终造成系统不稳定或功能失效。本模板提供高速数字电路的完整 DRC 规则集，适用于 Altium Designer 的规则系统。

---

## 2. 阻抗控制规则

### 2.1 阻抗目标

| 信号类型 | 目标阻抗 | 说明 |
|----------|---------|------|
| 单端信号 | 50Ω | 标准 TTL/CMOS/LVCMOS |
| 差分信号（USB 3.0/HDMI） | 90Ω ±10% | 差分对差模阻抗 |
| 差分信号（PCIe/DDR3） | 100Ω ±10% | 差分对差模阻抗 |
| LVDS | 100Ω ±10% | 差分对差模阻抗 |
| DDR3 数据/地址/命令 | 50Ω ±10% | 单端 |
| DDR3 差分时钟 | 100Ω ±10% | 差分对 |

### 2.2 叠层阻抗设计表

**4 层板（1.6mm，1oz 铜）典型参数：**

| 层 | 定义 | 线宽 (mil) | 线距 (mil) | 阻抗 (Ω) |
|----|------|-----------|-----------|---------|
| L1 | SIG | 6 | — | 50（参考 L2 GND） |
| L2 | GND | — | — | — |
| L3 | PWR | — | — | — |
| L4 | SIG | 6 | — | 50（参考 L3 PWR） |

**6 层板（1.6mm，1oz 铜）优选叠层：**

| 层 | 定义 | 线宽 (mil) | 线距 (mil) | 阻抗 (Ω) |
|----|------|-----------|-----------|---------|
| L1 | SIG | 5 | — | 50（参考 L2 GND） |
| L2 | GND | — | — | — |
| L3 | SIG | 5 | 5 | 100（差分对） |
| L4 | SIG | 5 | 5 | 100（差分对） |
| L5 | PWR | — | — | — |
| L6 | SIG | 5 | — | 50（参考 L5 PWR） |

### 2.3 差分对线宽/线距速查

| 叠层 | 介电常数 | 单端 50Ω 线宽 | 差分 90Ω 线宽/线距 | 差分 100Ω 线宽/线距 |
|------|---------|-------------|------------------|-------------------|
| 4 层（1.6mm） | FR-4, Er=4.3 | 6mil | 6/5mil | 5/6mil |
| 6 层（1.6mm） | FR-4, Er=4.3 | 5mil | 5/4mil | 4/5mil |
| 8 层（1.6mm） | FR-4, Er=4.3 | 4.5mil | 4.5/4mil | 4/4.5mil |

---

## 3. 长度匹配规则

### 3.1 各接口长度匹配要求

| 接口 | 数据组 | 地址/命令组 | 时钟组 | 说明 |
|------|--------|-----------|--------|------|
| DDR3 | 数据字节通道 ±25mil | 地址/命令 ±50mil | 时钟 ±10mil | 组内匹配，组间相对时钟 |
| DDR4 | 数据字节通道 ±25mil | 地址/命令 ±50mil | 时钟 ±10mil | 同 DDR3 |
| PCIe Gen3 | 差分对内 ±5mil | — | — | 差分对内等长 |
| USB 3.0 | 差分对内 ±5mil | — | — | TX/RX 分别匹配 |
| HDMI | TMDS 差分对内 ±5mil | — | — | 3 对差分分别匹配 |
| SATA | 差分对内 ±5mil | — | — | TX/RX 分别匹配 |
| LVDS | 差分对内 ±10mil | — | — | 多对差分间匹配 ±50mil |

### 3.2 DDR3 长度匹配详解

```
DDR3 长度匹配规则：

数据组（DQ0~DQ7 + DQS0 + DM0）：
  组内最大长度差 ≤ 25mil
  DQS 与同组 DQ 长度差 ≤ 10mil

地址/命令组（A0~A15, BA0~BA2, CAS, RAS, WE, CS, ODT）：
  组内最大长度差 ≤ 50mil

时钟组（CK, CK_n）：
  差分对内长度差 ≤ 10mil
  时钟与地址组长度差 ≤ 100mil

数据组之间（DQ0~DQ7 vs DQ8~DQ15）：
  无严格匹配要求（按字节通道独立）

总长度限制：
  地址线总长 ≤ 2000mil
  数据线总长 ≤ 1500mil
```

---

## 4. 间距规则

### 4.1 3W 规则

```
3W 规则：相邻走线间距 ≥ 3 × 线宽（W）

      │←── 3W ──→│
      │            │
  ────┤    ────────┤────
  信号1│    信号2  │信号3

效果：减少约 70% 的近端串扰（NEXT）
```

### 4.2 时钟/高速信号特殊间距

| 信号类型 | 与其他信号间距 | 说明 |
|----------|--------------|------|
| 时钟信号 | ≥ 5W（25~30mil） | 最敏感信号，最大隔离 |
| 差分对内部 | 1W~2W（按阻抗） | 由阻抗决定 |
| 差分对与其他信号 | ≥ 3W | 减少差模到共模转换 |
| 高速单端 vs 高速单端 | ≥ 3W | 串扰隔离 |
| 高速信号 vs 电源平面边 | ≥ 20mil | 减少边缘辐射 |
| 时钟走线 vs 连接器 | ≥ 50mil | 避免 EMI 耦合到线缆 |

---

## 5. 层叠规则

### 5.1 最小层叠要求

| 层数 | 叠层方案 | 适用 |
|------|---------|------|
| 4 层 | SIG-GND-PWR-SIG | 最低要求，≤ 100MHz |
| 6 层 | SIG-GND-SIG-SIG-PWR-SIG | 优选，100MHz~1GHz |
| 8 层 | SIG-GND-SIG-PWR-SIG-GND-SIG-GND | 高速，> 1GHz |
| 10 层+ | 多信号层-地-电源交替 | DDR4/多 SerDes |

### 5.2 6 层板优选叠层

```
L1: SIG1（顶层布线，元件面）
L2: GND（完整地平面）
L3: SIG2（高速信号/差分对）
L4: SIG3（高速信号/差分对）— 注意 L3/L4 间需保证 GND 隔离或正交布线
L5: PWR（电源平面）
L6: SIG4（底层布线）
```

**关键原则：**
- 每个信号层旁边必须有完整参考平面（GND 或 PWR）
- 高速信号优先布在 GND 参考平面上方
- 信号层 L3 和 L4 间为同介电层时，两层的布线方向必须正交（L3 水平，L4 垂直）
- 电源平面和地平面之间可作为去耦电容的分布电容

---

## 6. 过孔规则

### 6.1 层转换限制

| 规则 | 要求 | 说明 |
|------|------|------|
| 层转换次数 | 最小化 | 每次转换增加 stub 和阻抗不连续 |
| 高速差分对 | 两线同步转换 | 对内过孔对称，等长 |
| 参考平面一致性 | 尽量不跨平面 | 跨平面破坏返回路径 |
| BGA 扇出 | 短 stub 优先 | 蛇形布线控制在 BGA 内 |

### 6.2 背钻（Backdrilling）

```
背钻要求：
- 信号频率 > 10GHz 或速率 > 10Gbps 时必须考虑
- 背钻去除过孔多余 stub，减少谐振反射
- 背钻残桩长度 < 10mil

背钻示例：
信号从 L1 布到 L4，但过孔贯穿全板（L1~L6）
→ 背钻从 L6 钻到 L5，去除 L5~L6 段残桩
```

---

## 7. 铺铜与板边规则

### 7.1 20H 规则

```
20H 规则：电源平面从板边内缩 20 × 层间介电厚度（H）

      ┌──────────────────────┐
      │  GND 平面（延伸到板边）  │
      │      ┌──────────┐     │
      │      │ PWR 平面 │← 内缩 20H
      │      └──────────┘     │
      └──────────────────────┘

效果：减少电源平面边缘的高频辐射（EMI）
```

### 7.2 板边间距

| 对象 | 距板边间距 (mil) | 说明 |
|------|----------------|------|
| 布线 | ≥ 20 | 制造安全 |
| 器件 | ≥ 50 | 装配安全 |
| 铺铜（GND） | 0~10 | 延伸到板边 |
| 铺铜（PWR） | 20H | 按 20H 规则内缩 |
| 过孔 | ≥ 20 | 防止板边制造缺陷 |

---

## 8. Altium DRC 规则配置表

### 8.1 电气间距规则（Electrical » Clearance）

| 规则名称 | 网络分类1 | 网络分类2 | 间距 (mil) | 优先级 |
|----------|----------|----------|-----------|--------|
| Clearance_DigitalDigital | Digital_Signal | Digital_Signal | 6 | 1 |
| Clearance_Clock_All | Clock | All | 25 | 1 |
| Clearance_DiffPair_All | Differential_Pair | All（非同组） | 15 | 1 |
| Clearance_Power_All | Power_In/Power_Out | All | 20 | 1 |
| Clearance_BGA | All | All（BGA 区域） | 4 | 2 |

### 8.2 线宽规则（Routing » Width）

| 规则名称 | 网络分类 | 最小 (mil) | 推荐 (mil) | 最大 (mil) | 说明 |
|----------|---------|-----------|-----------|-----------|------|
| Width_Digital | Digital_Signal | 4 | 6 | 10 | 标准 50Ω |
| Width_DiffPair | Differential_Pair | 4 | 5 | 8 | 按阻抗 |
| Width_Clock | Clock | 5 | 6 | 8 | 优先宽线 |
| Width_Power | Power_In/Out | 10 | 15 | 80 | 按电流 |
| Width_BGA | All（BGA 区域） | 3.5 | 4 | 6 | BGA 扇出 |

### 8.3 差分对规则（Routing » Differential Pairs Routing）

| 参数 | 值 | 说明 |
|------|-----|------|
| Min Width | 4mil | 差分对最小线宽 |
| Preferred Width | 5mil | 推荐线宽 |
| Max Width | 8mil | 最大线宽 |
| Min Gap | 4mil | 对内最小间距 |
| Preferred Gap | 5mil | 推荐间距 |
| Max Gap | 8mil | 最大间距 |
| Min Uncoupled Length | 500mil | 最小耦合长度 |
| Max Uncoupled Length | 20mil | 最长非耦合段（过孔附近） |

### 8.4 长度匹配规则（High Speed » Length）

| 规则名称 | 网络组 | 容差 (mil) | 说明 |
|----------|--------|-----------|------|
| Length_DDR3_DQ0 | DQ0~DQ7, DQS0, DM0 | 25 | 数据字节通道 0 |
| Length_DDR3_DQ1 | DQ8~DQ15, DQS1, DM1 | 25 | 数据字节通道 1 |
| Length_DDR3_Addr | A0~A15, BA0~BA2, CAS, RAS, WE | 50 | 地址/命令组 |
| Length_DDR3_CK | CK, CK_n | 10 | 差分时钟 |
| Length_PCIe_TX | PCIe_TX_P, PCIe_TX_N | 5 | PCIe 发送对 |
| Length_USB3_TX | USB3_TX_P, USB3_TX_N | 5 | USB3 发送对 |
| Length_HDMI_TMDS | TMDS_Data0_P/N, TMDS_Data1_P/N, TMDS_Data2_P/N | 5 | HDMI 三对差分 |

### 8.5 布线层规则（Routing » Routing Layers）

| 网络分类 | 允许层 | 禁止层 | 说明 |
|----------|--------|--------|------|
| Clock | L1, L3 | L4, L6 | 优选 GND 参考层 |
| Differential_Pair | L3, L4 | L1, L6 | 内层优先（EMI 低） |
| Digital_Signal | L1, L3, L4, L6 | — | 通用 |
| Power_In/Out | L5（平面） | — | 电源平面优先 |
| DDR3_DQ | L3, L4 | L1, L6 | 内层优先 |

### 8.6 过孔规则（Routing » Routing Via Style）

| 参数 | 标准 | 高速 | 说明 |
|------|------|------|------|
| Via Diameter | 24mil | 20mil | 过孔外径 |
| Via Hole Size | 12mil | 10mil | 过孔内径 |
| Min Annular Ring | 6mil | 5mil | 最小环宽 |

### 8.7 制造规则（Manufacturing）

| 规则 | 值 | 说明 |
|------|-----|------|
| Min Line Width | 4mil | 最小线宽 |
| Min Clearance | 4mil | 最小间距 |
| Min Annular Ring | 5mil | 最小环宽 |
| Min Hole Size | 8mil | 最小孔径 |
| Hole-to-Hole Clearance | 8mil | 孔间距 |

---

## 9. EMI 规则

### 9.1 时钟布线 EMI 控制

```
时钟布线 EMI 规则：

1. 时钟走线远离板边和连接器（≥ 50mil）
2. 时钟走线两侧布地线保护走线（Guard Trace）
3. 时钟换层时在过孔旁打地过孔（返回路径连续）
4. 时钟信号布在内层（L3/L4），减少辐射
5. 扩频时钟（SSC）：在时钟源启用 ±0.5% 扩频

Guard Trace 示例：
  GND ── GND_Via ── GND
   │                 │
  CLK ──────────────
   │                 │
  GND ── GND_Via ── GND
```

### 9.2 连接器区域 EMI

```
连接器 EMI 规则：

1. 高速信号走线在连接器附近最短化
2. 连接器 GND 引脚就近接地（多点接地）
3. 连接器区域不布噪声敏感信号
4. 连接器金属壳接地（通过弹簧片或过孔）
5. ESD 保护器件就近放置在连接器入口
```

---

## 10. 设计审查要点清单

| 序号 | 审查项 | 合格判据 | 优先级 |
|-----|--------|---------|--------|
| 1 | 阻抗控制 | 50Ω/90Ω/100Ω ±10%，按叠层表 | 高 |
| 2 | 长度匹配 | 按 DDR3/PCIe/USB3.0 接口要求 | 高 |
| 3 | 3W 间距 | 相邻走线间距 ≥ 3W | 高 |
| 4 | 时钟隔离 | 时钟与其他信号 ≥ 5W | 高 |
| 5 | 返回路径 | 信号不跨越平面分割 | 高 |
| 6 | 层叠完整性 | 每信号层旁有完整 GND/PWR 平面 | 高 |
| 7 | 过孔最少化 | 高速信号层转换 ≤ 2 次 | 中 |
| 8 | 20H 规则 | 电源平面内缩 20H | 中 |
| 9 | 差分对耦合 | 非耦合段 ≤ 20mil | 高 |
| 10 | 背钻 | > 10GHz 信号背钻 | 中 |

---

## 附录A：高速信号 DRC 规则快速配置

```
Altium 高速 DRC 配置步骤：

1. Design » Classes → 创建网络分类
   - Digital_Signal, Differential_Pair, Clock
   - Power_In, Power_Out
   - DDR3_DQ0, DDR3_DQ1, DDR3_Addr, DDR3_CK

2. Design » Rules → 逐项配置规则
   - Electrical » Clearance：按 8.1 表
   - Routing » Width：按 8.2 表
   - Routing » Differential Pairs Routing：按 8.3 表
   - High Speed » Length：按 8.4 表
   - Routing » Routing Layers：按 8.5 表
   - Manufacturing：按 8.7 表

3. Tools » Design Rule Check → 运行 DRC

4. 修复所有 Violation

5. Design » Rules » File » Export Rules → 导出规则供复用
```

## 附录B：高速数字设计 DRC 速查

```
核心规则速查：

间距：6mil（标准），4mil（BGA），25mil（时钟）
线宽：6mil（50Ω 单端），5/5mil（100Ω 差分）
长度匹配：DDR3 DQ ±25mil, Addr ±50mil, CK ±10mil
        PCIe/USB3/HDMI ±5mil
差分对：4~5mil 线宽，4~5mil 间距
过孔：20~24mil 外径，10~12mil 内径
层叠：6 层优选，SIG-GND-SIG-SIG-PWR-SIG
返回路径：不跨越平面分割
20H：电源平面内缩 20H
```

---

*本知识库文件供AI设计辅助Skill查询使用。应用规则时请结合实际 PCB 叠层参数、制造能力和器件数据手册进行综合判断。*
