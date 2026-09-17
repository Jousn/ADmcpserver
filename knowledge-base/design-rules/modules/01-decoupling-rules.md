# 去耦电容布局设计规则知识库

> 适用范围：所有数字/模拟/混合信号 PCB 设计（MCU、FPGA、DSP、ADC/DAC、射频等）
> 目标受众：AI 设计辅助 Skill，用于去耦电容选型、布局与 DRC 审查
> 版本：v1.0 | 更新日期：2026-08

---

## 1. 概述

去耦电容（Decoupling Capacitor）是保证 IC 电源完整性的核心元件。其作用是在瞬态负载电流变化时，为本地提供低阻抗的电荷储备，抑制电源轨上的电压纹波与噪声。去耦电容的布局质量直接决定信号完整性（SI）、电源完整性（PI）和 EMC 性能。

去耦设计的核心原则是**最小化高频回路电感**——决定高频去耦有效性的不是电容量，而是从 IC 电源引脚到电容再到地返回路径的寄生电感（ESL + 回路电感）。

---

## 2. 去耦电容层级体系

### 2.1 四级去耦架构

| 层级 | 容值范围 | 典型封装 | 谐振频率 | 作用频段 | 主要功能 |
|------|---------|---------|---------|---------|---------|
| Bulk（体电容） | 10uF ~ 100uF | 1206/1210/钽电容 | 100kHz ~ 1MHz | < 1MHz | 低频稳压、储能 |
| Mid（中频电容） | 1uF ~ 10uF | 0805/0603 | 1MHz ~ 10MHz | 1 ~ 10MHz | 中频噪声抑制 |
| Local（本地电容） | 100nF (0.1uF) | 0402/0603 | 10MHz ~ 100MHz | 10 ~ 100MHz | IC 瞬态电流供给 |
| High-freq（高频电容） | 10nF ~ 22nF | 0201/0402 | 50MHz ~ 500MHz | > 50MHz | 高频噪声滤波 |

### 2.2 电容阻抗频率特性

```
Capacitor impedance model (ESR + ESL in series):

Z = sqrt(R_esr^2 + (1/(2*pi*f*C) - 2*pi*f*L_esl)^2)

Resonant frequency (minimum impedance):
f_res = 1 / (2 * pi * sqrt(L_esl * C))

Typical values:
- 0.1uF 0402 X7R: ESL ~ 0.5nH, f_res ~ 22 MHz
- 0.01uF 0402 X7R: ESL ~ 0.5nH, f_res ~ 71 MHz
- 1uF 0603 X7R:   ESL ~ 0.8nH, f_res ~ 5.6 MHz
- 10uF 1206 X7R:  ESL ~ 1.2nH, f_res ~ 1.5 MHz

Above f_res, capacitor becomes inductive; decoupling effectiveness drops sharply.
```

### 2.3 封装与 ESL 关系

| 封装 | 典型 ESL (nH) | 推荐最高有效频率 |
|------|--------------|-----------------|
| 0201 | 0.3 ~ 0.4 | > 200 MHz |
| 0402 | 0.4 ~ 0.6 | ~ 150 MHz |
| 0603 | 0.6 ~ 0.9 | ~ 80 MHz |
| 0805 | 0.8 ~ 1.2 | ~ 50 MHz |
| 1206 | 1.0 ~ 1.5 | ~ 30 MHz |

> 关键规则：高频去耦优先选小封装，0402 是性价比最优选择，0201 用于超高频。

---

## 3. 去耦电容放置规则

### 3.1 距离规则

| 电容类型 | 最大距 IC 引脚距离 | 理论依据 |
|---------|-------------------|---------|
| 100nF 本地电容 | <= 3mm（120mil） | 回路电感每增加 1mm 走线增加 ~ 1nH |
| 10nF 高频电容 | <= 1.5mm（60mil） | 高频对回路电感更敏感 |
| 1uF 中频电容 | <= 25mm（1000mil） | 中频回路电感容忍度较高 |
| 10uF 体电容 | <= 50mm（2000mil） | 低频，位置要求宽松 |

### 3.2 摆放优先级（最小电容最近引脚）

```
Recommended placement order (from IC VDD pin outward):

  +-------- IC --------+
  |                    |
  |  VDD pin           |
  |    |               |
  |    [10nF]  <-- closest, highest freq
  |    |               |
  |    [100nF] <-- next, local decoupling
  |    |               |
  |    [1uF]   <-- farther, mid freq
  |    |               |
  |    [10uF]  <-- farthest, bulk
  |                    |
  +--------------------+

Rule: smaller capacitance = closer to IC power pin.
Reason: shortest high-frequency current path = lowest loop inductance.
```

### 3.3 放置方位规则

```
Best placement: cap pad -> VDD via -> IC VDD pad on same side,
GND pad connects directly to ground plane via.

Recommended layout (top view):

  IC VDD pin --------+---- [100nF] ---- GND via
                     |           |
                     |   (cap close to pin)
                     |
                  VDD via       GND via
                    |              |
                  =========  ===========
                   VDD plane     GND plane

Avoid:
  X IC VDD pin ---- long trace ---- [100nF] ---- GND via
  (long trace adds extra inductance, weakens HF decoupling)
```

### 3.4 BGA 器件去耦布局

```
BGA decoupling strategy:

1. Top side (same side as BGA):
   - Place 0201/0402 caps in gaps between BGA pad array
   - Only for BGA pitch >= 1.0mm (high-density BGA cannot fit)

2. Bottom side (opposite BGA):
   - Route VDD/GND to bottom via vias next to BGA pads
   - Place 100nF and 10nF decoupling caps on bottom
   - Vias must be adjacent to BGA pads (< 0.5mm)

3. Quantity rules:
   - 1 x 100nF per VDD ball
   - 1 x 10nF shared per 4 VDD balls
   - 1 x 1uF shared per 8 VDD balls
```

---

## 4. 过孔与回路优化

### 4.1 回路电感计算

```
Loop inductance approximation:

L_loop = L_trace + L_via + L_cap_esl

Where:
L_trace = 0.2 * l * (ln(2*l/(w+t)) + 0.5 + 0.2235*(w+t)/l)  [nH, l/w/t in mm]
L_via = 0.5 ~ 1.0 nH per via (depends on via length and drill size)
L_cap_esl = 0.3 ~ 1.5 nH (depends on package)

Design target: L_loop < 1.5 nH (effective HF decoupling)
```

### 4.2 过孔放置规则

| 规则编号 | 规则内容 | 数值要求 |
|---------|---------|---------|
| VIA-01 | 电容 GND 焊盘到 GND 过孔距离 | <= 0.3mm（12mil） |
| VIA-02 | 电容 VDD 焊盘到 VDD 过孔距离 | <= 0.3mm（12mil） |
| VIA-03 | 每个电容焊盘独立过孔（不共享） | 必须遵守 |
| VIA-04 | 大容量电容使用双过孔并联 | >= 2 个过孔 |
| VIA-05 | 过孔到电容焊盘走线宽度 | >= 焊盘宽度 |

### 4.3 多过孔降阻技术

```
Multiple vias in parallel reduce inductance:

Single via inductance: L_via ~ 0.75 nH
Two vias in parallel:  L = 0.75/2 = 0.375 nH (halved)
Four vias in parallel: L = 0.75/4 = 0.19 nH

Recommended scheme (0402 cap with dual vias):

      VDD via         GND via
        *               *
        |               |
     ---+  [100nF]  +---
        |               |
        *               *
      VDD via         GND via

2 vias per end, loop inductance reduced ~40%.
```

---

## 5. 电源平面电容效应

### 5.1 平行平板电容

```
Parallel plate capacitance between power and ground planes:

C_plane = epsilon_0 * epsilon_r * A / d

Where:
epsilon_0 = 8.854e-12 F/m
epsilon_r = 4.2 (FR-4)
A = overlap area (m^2)
d = dielectric thickness (m)

Typical 4-layer board (power-ground spacing 0.2mm):
C = 8.854e-12 * 4.2 * (0.01 m^2) / 0.0002 m
C = 1.86 nF/cm^2

100mm x 100mm board area:
C_total = 1.86 * 100 = 186 nF
```

### 5.2 平面电容的优势

| 特性 | 独立电容 | 电源平面电容 |
|------|---------|-------------|
| ESL | 0.3 ~ 1.5 nH | < 0.1 nH |
| 有效频率 | < 500 MHz | > 1 GHz |
| 分布特性 | 集中参数 | 分布参数 |
| 成本 | 需额外元件 | 零成本（叠层设计） |

> 设计准则：电源层与地平面紧邻（间距 < 0.15mm），充分利用平面电容效应作为高频去耦的补充。

---

## 6. FPGA/MCU 去耦配置方案

### 6.1 MCU 去耦标准方案

```
Typical MCU (e.g. STM32 series) decoupling configuration:

Each VDD pin:
  - 1 x 100nF (0402)  <-- close to pin, < 3mm

Each VDD group (4~8 pins):
  - 1 x 4.7uF (0603/0805)  <-- center of MCU area

VDDA (analog power):
  - 1 x 100nF + 1 x 1uF  <-- close to VDDA pin
  - series ferrite bead to isolate digital noise

VBAT (backup battery domain):
  - 1 x 100nF  <-- close to VBAT pin

Example (STM32F407, LQFP100):
  VDD pin count: ~11
  100nF count: 11 (1 per pin)
  4.7uF count: 2 (VDD group + VDDA group)
  Total: 13 decoupling capacitors
```

### 6.2 FPGA 去耦标准方案

```
Typical FPGA (e.g. Xilinx Artix-7) decoupling configuration:

VCCINT (core power, 0.95V~1.0V):
  - Per VCCINT ball: 1 x 100uF + 1 x 4.7uF (shared)
  - Per 4 balls: 1 x 0.47uF
  - Per 2 balls: 1 x 100nF
  - Per 1 ball:  1 x 22nF

VCCAUX (auxiliary power, 1.8V):
  - Per VCCAUX ball: 1 x 100nF
  - Per 4 balls: 1 x 4.7uF

VCCO (I/O power, 1.8V/2.5V/3.3V):
  - Per VCCO bank: 1 x 47uF + 1 x 4.7uF
  - Per 4 VCCO balls: 1 x 100nF

VCCBATT (battery domain):
  - 1 x 100nF

MGTAVCC/MGTAVTT (GTX transceiver power):
  - Follow UG483 decoupling guide strictly
  - Per ball: 1 x 22uF + 1 x 100nF + 1 x 10nF
```

### 6.3 ADC/DAC 去耦方案

```
High-precision ADC/DAC decoupling key points:

1. Analog power (AVDD):
   - 1 x 100nF + 1 x 10nF close to AVDD pin
   - 1 x 1uF mid-frequency decoupling
   - Series ferrite bead to isolate from digital power

2. Digital power (DVDD):
   - 1 x 100nF close to DVDD pin
   - Layout independent from analog power

3. Reference voltage (VREF):
   - 1 x 100nF + 1 x 10nF close to VREF pin
   - 1 x 10uF tantalum cap (low ESR) for reference stability
   - VREF pin trace short and wide

4. AGND and DGND:
   - Single-point connection under ADC
   - Do not form ground loop
```

---

## 7. 反谐振规避

### 7.1 反谐振现象

```
When multiple identical-value capacitors are in parallel, parallel resonance
(anti-resonance) occurs between the inductive region (above f_res) and the
capacitive region (below f_res), producing an impedance peak.

Anti-resonant frequency:
f_anti = 1 / (2 * pi * sqrt(L1 * C2))

Where L1 is parasitic inductance of cap 1, C2 is capacitance of cap 2.

Anti-resonant peak impedance:
Z_peak = sqrt(L1 / C2) + R_esr

Design target: Z_peak < target impedance Z_target
```

### 7.2 容值选择规则

| 规则编号 | 规则内容 | 说明 |
|---------|---------|------|
| RES-01 | 禁止并联相同容值电容 | 相同容值仅降低 ESR，不扩展频段 |
| RES-02 | 相邻电容容值比 >= 10x | 10 倍比例可最小化反谐振峰 |
| RES-03 | 容值跨度不超过 3 个数量级 | 如 10nF → 100nF → 1uF → 10uF |
| RES-04 | 使用多种封装混合 | 不同封装 ESL 不同，自然分散谐振点 |

### 7.3 推荐容值组合

```
Recommended decoupling capacitor combinations (10x progression):

Scheme A (general digital IC):
  10nF + 100nF + 1uF + 10uF
  Coverage: 100 kHz ~ 200 MHz

Scheme B (HF/RF IC):
  10pF + 100pF + 1nF + 10nF + 100nF
  Coverage: 10 MHz ~ 1 GHz

Scheme C (FPGA core):
  22nF + 100nF + 0.47uF + 4.7uF + 100uF
  Coverage: 10 kHz ~ 200 MHz

Scheme D (low-power MCU):
  100nF + 4.7uF
  Coverage: 100 kHz ~ 100 MHz (simplified)
```

### 7.4 目标阻抗法

```
Target impedance calculation:

Z_target = (V_ripple * V_dd) / I_transient

Where:
V_ripple = allowed ripple (typically 5% of V_dd)
V_dd = supply voltage
I_transient = transient current

Example:
V_dd = 3.3V, V_ripple = 5% * 3.3 = 0.165V
I_transient = 500 mA

Z_target = (0.165 * 3.3) / 0.5 = 1.09 Ohm

All decoupling caps must maintain parallel impedance < 1.09 Ohm
across the target frequency band.
```

---

## 8. Altium Designer DRC 规则设置

### 8.1 电容放置相关 DRC 规则

```
Rule name: Placement - Component Clearance
Purpose: clearance check between capacitors and ICs

Settings:
- Min Clearance = 2mil (manufacturing minimum)
- 100nF cap to IC VDD pin trace length cannot be directly constrained by DRC
- Use Room or Class to constrain cap placement area

Recommended approach:
1. Create Room for IC, include decoupling caps in same Room
2. Use Component Clearance Rule to constrain max distance between cap and IC
3. Enable Un-Routed Net check in Design Rules Check
```

### 8.2 过孔与间距 DRC 规则

| DRC 规则类型 | 规则名称 | 推荐值 | 适用对象 |
|-------------|---------|--------|---------|
| Electrical Clearance | Pad to Via | 4mil（最小） | 去耦电容焊盘与过孔 |
| Electrical Clearance | Via to Via | 4mil（最小） | 双过孔布局 |
| Routing Width | Min/Max Width | 焊盘宽度 | 电容到 IC 连线 |
| Routing Via Style | Min Hole Diameter | 0.2mm (8mil) | 去耦过孔 |
| Routing Via Style | Min Diameter | 0.4mm (16mil) | 去耦过孔焊盘 |

### 8.3 创建去耦电容设计规则

```
Altium Designer decoupling rule setup steps:

1. Design -> Rules -> Design Rules

2. Electrical Clearance Rule:
   - New rule "Decap_Clearance"
   - Where The Object Matches: IsCapacitor (or custom Query)
   - Minimum Clearance: 4mil

3. Placement Component Clearance:
   - New rule "Decap_to_IC"
   - Where First Object Matches: HasFootprint('CAP*')
   - Where Second Object Matches: HasFootprint('IC*')
   - Minimum Vertical/Horizontal: 2mil / 500mil

4. Routing Width Rule:
   - New rule "Decap_Trace_Width"
   - Where The Object Matches: InNetClass('Power') And IsCapacitor
   - Min Width: 8mil, Preferred: 12mil, Max: 20mil

5. Via Style Rule:
   - New rule "Decap_Via"
   - Min Hole: 8mil, Max Hole: 12mil
   - Min Diameter: 16mil, Max Diameter: 24mil
```

---

## 9. 设计审查清单

| 检查项 | 检查标准 | 优先级 |
|--------|---------|--------|
| DC-01 | 每个 IC 电源引脚 3mm 内是否有 100nF 去耦电容 | 高 |
| DC-02 | 最小容值电容是否最靠近 IC 引脚 | 高 |
| DC-03 | 去耦电容焊盘是否直接连过孔到电源/地平面 | 高 |
| DC-04 | 去耦电容 GND 焊盘到过孔距离是否 <= 0.3mm | 中 |
| DC-05 | 是否避免了相同容值电容并联 | 中 |
| DC-06 | 相邻容值比是否 >= 10x | 中 |
| DC-07 | FPGA 是否每个 VDD ball 都有独立去耦 | 高 |
| DC-08 | 模拟电源是否经磁珠隔离数字噪声 | 高 |
| DC-09 | 电容封装是否合理（高频用 0402/0201） | 中 |
| DC-10 | 电源层与地层间距是否 < 0.15mm（平面电容） | 中 |
| DC-11 | BGA 背面是否有足够去耦电容 | 高 |
| DC-12 | VREF 引脚是否有 10uF + 100nF 去耦 | 高 |

---

## 10. 常见错误与修正

### 10.1 错误：电容距离过远

```
Error example:
  IC VDD pin ------ 10mm trace ------ [100nF] -- GND via

Problem: trace inductance L_trace ~ 10nH, plus cap ESL 0.5nH
Total loop inductance ~ 10.5nH, resonant freq drops to ~5MHz
HF decoupling completely ineffective.

Fix: move 100nF within 3mm of IC pin, via directly to ground plane.
```

### 10.2 错误：共享过孔

```
Error example:
  [100nF] --+-- GND via
            |
  [10nF]  --+

Problem: shared via introduces extra inductance, two caps'
HF decoupling effects interfere with each other.

Fix: use independent via per cap pad.
  [100nF] -- GND via
  [10nF]  -- GND via
```

### 10.3 错误：大面积铜皮直接连电容焊盘

```
Error example:
  Large copper pour connects VDD directly to cap pad

Problem: copper pour increases pad thermal mass, causing cold solder;
large copper also creates thermal expansion stress at pad.

Fix: use trace connection (width >= pad width), avoid large copper
pour directly on pad. Use Thermal Relief pad connection style.
```

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08-21 | 初始版本：去耦电容层级/布局/过孔/平面电容/FPGA方案/反谐振/DRC | AI Knowledge Base |
