# 接地策略设计规则知识库

> 适用范围：所有模拟/数字/混合信号/射频 PCB 设计
> 目标受众：AI 设计辅助 Skill，用于接地系统设计、地平面分割与 DRC 审查
> 版本：v1.0 | 更新日期：2026-08

---

## 1. 概述

接地是 PCB 设计中最关键也最容易被忽视的环节。接地系统不仅为所有信号提供回流路径，更是决定 EMC 性能、信号完整性和系统稳定性的基础。错误的接地策略会引入地环路噪声、共模干扰、串扰和辐射超标等问题。

接地设计的核心原则是**控制回流路径**——确保每个信号都有最低阻抗的回流路径，且该路径紧贴信号走线以最小化回路面积。

---

## 2. 接地方式分类与选型

### 2.1 三种基本接地方式

| 接地方式 | 适用频率范围 | 典型应用 | 优点 | 缺点 |
|---------|-------------|---------|------|------|
| 单点接地（SPG） | < 1 MHz | 低频模拟电路、音频 | 无地环路、避免共阻抗耦合 | 高频时地线阻抗大、走线长 |
| 多点接地（MPG） | > 10 MHz | 高速数字、射频、微波 | 低高频阻抗、回路面积小 | 可能形成地环路、低频共模干扰 |
| 混合接地（HG） | 混合频段 | 混合信号系统 | 兼顾高低频性能 | 设计复杂、需仔细分析 |

### 2.2 单点接地（Single-Point Grounding）

```
Single-point grounding (star grounding) topology:

         Module A --+
                    |
         Module B --+-- GND (single reference point)
                    |
         Module C --+

Conditions:
- Max signal frequency < 1 MHz
- Ground trace length < wavelength / 20 at max frequency

Ground trace impedance:
Z_ground = R_dc + j*w*L_ground

Where:
R_dc = 17.2e-3 * l / (w * t)  [Ohm, 1oz Cu, l/w in mil]
L_ground ~ 1 nH/mm (typical trace)

Frequency limit derivation:
When w*L_ground >> R_dc, ground impedance is dominated by inductance.
At 1 MHz, 100mm ground trace reactance: XL = 2*pi*1e6*100e-9 = 0.628 Ohm
This significantly affects signal reference; switch to multi-point grounding.
```

### 2.3 多点接地（Multi-Point Grounding）

```
Multi-point grounding topology:

  Module A --+-- GND plane --+-- Module B
             |                |
           via              via
             |                |
          ========================
                 GND plane

Conditions:
- Signal frequency > 10 MHz
- Must have solid ground plane as reference

Key advantages:
- Each module connects to ground plane via shortest path (via)
- Plane impedance extremely low (~ mOhm level)
- Loop area minimized, lowest radiation

Plane impedance estimate:
Z_plane(f) = (j*w*u0*t) / (2*pi) * ln(d/r)  [Ohm/square]

Where:
u0 = 4*pi*1e-7 H/m
t = copper thickness
d = distance from observation point to reference point
r = injection point equivalent radius

Typical: 1oz Cu, at 1 MHz: Z_plane ~ 0.5 mOhm/square
```

### 2.4 混合接地（Hybrid Grounding）

```
Hybrid grounding strategy (LF single-point + HF multi-point):

  Module A --[inductor/ferrite]--+-- GND plane
                                |
  Module B --[capacitor]--------+

Operating principle:
- Low freq (< 1 MHz): inductor/ferrite passes DC, equivalent single-point
- High freq (> 10 MHz): capacitor passes AC, equivalent multi-point

Typical applications:
- RF front-end + digital control mixed system
- Shielded cable grounding (single-end at LF, dual-end at HF)
- Between chassis ground and PCB ground
```

---

## 3. 地平面设计

### 3.1 完整地平面 vs 分割地平面

| 特性 | 完整地平面 | 分割地平面 |
|------|-----------|-----------|
| 回流路径 | 连续，自动最优 | 受分割限制 |
| 阻抗 | 最低 | 分割处阻抗突增 |
| EMC 性能 | 最优 | 取决于分割设计 |
| 适用场景 | 纯数字/纯模拟 | 混合信号（需谨慎） |
| 推荐度 | 强烈推荐 | 仅在必要时使用 |

### 3.2 分割平面设计准则

```
Iron rules for split planes:

Rule GP-01: Signal traces must NEVER cross split lines
  ----------------------------------
  Split line  AGND | DGND
                     ^
  Signal ---------+----------  X FORBIDDEN!
                     |
  Reason: return path is cut off, loop area increases 10~100x,
          causing severe radiation and crosstalk.

Rule GP-02: If crossing is unavoidable, use bridge capacitor
  AGND --------[1nF~100nF]-------- DGND
  Place bridge cap closest to crossing point for HF return path.

Rule GP-03: Minimize split line length
  Split line should be as short as possible, isolating only necessary area.

Rule GP-04: Complete enclosure of split area
  Analog area enclosed by complete closed split line, no half-splits.
```

### 3.3 分割平面示意图

```
Recommended mixed-signal ground plane design (ADC example):

  +-------------------------------------------+
  |              DGND (Digital Ground)          |
  |  +-----+                    +--------+   |
  |  | MCU |  +----------+      | Digital|   |
  |  +-----+  |   ADC    |      |  Logic |   |
  |           |  +--+    |      +--------+   |
  |           |  |Br|    |         |        |
  |           |  |id|    |         |        |
  |  +-----+  |  |ge|    |      +--------+   |
  |  |Analog|  |  +--+    |      |  DGND  |   |
  |  | Front|  +----------+      +--------+   |
  |  +-----+         |                    |
  |           +------+------+             |
  |           |    AGND     |             |
  |           | (Analog GND)|             |
  |           +-------------+             |
  +-------------------------------------------+

Key design points:
1. ADC straddles AGND/DGND boundary
2. AGND and DGND connect at single point under ADC (bridge)
3. All analog circuits within AGND area
4. All digital circuits within DGND area
5. No signals cross split line (except at bridge point)
```

---

## 4. 模拟/数字接地隔离

### 4.1 星形接地（Star Grounding）

```
Star grounding for high-precision analog circuits:

                AVDD
                  |
            +-----+-----+
            | Analog    |
            | Frontend  |
            | (OpAmp)   |
            +-----+-----+
                  |
    ----------------+  <-- star ground point (single reference)
                  |
            +-----+-----+
            |  ADC/DAC  |
            +-----+-----+
                  |
            +-----+-----+
            | Reference |
            +-----------+

Rules:
1. All analog module grounds converge to same physical point
2. This point is system analog ground reference zero
3. Connect to digital ground at this point (single point)
4. Star center point located under ADC/DAC
```

### 4.2 数模地连接规则

| 规则编号 | 规则内容 | 说明 |
|---------|---------|------|
| AG-01 | AGND 与 DGND 必须单点连接 | 避免地环路 |
| AG-02 | 连接点选择在 ADC/DAC 下方 | 最短回流路径 |
| AG-03 | 连接方式：0 Ohm 电阻或磁珠 | 便于调试和测试 |
| AG-04 | 连接走线短而宽（>= 20mil） | 降低连接阻抗 |
| AG-05 | 禁止 AGND/DGND 多点连接 | 多点连接形成地环路 |
| AG-06 | 模拟电源经磁珠从数字电源隔离 | 防止数字噪声注入 |

### 4.3 磁珠选型

```
Analog power isolation ferrite bead selection parameters:

1. Impedance @ 100 MHz:
   - General: 100~600 Ohm @ 100 MHz
   - High isolation: 600~2000 Ohm @ 100 MHz

2. DC resistance (DCR):
   - Should be < 0.1 Ohm (low power)
   - High current: DCR < 0.05 Ohm

3. Rated current:
   - Should be >= 2x operating current (prevent saturation)

4. Frequency characteristics:
   - Low freq (< 1 MHz): low impedance (no DC impact)
   - High freq (> 10 MHz): high impedance (noise isolation)

Example selection:
  Analog power 3.3V/50mA -> BLM18AG121SN1
  (120 Ohm @ 100MHz, DCR=0.05Ohm, I=500mA)
```

---

## 5. 地过孔缝合

### 5.1 过孔缝合间距规则

```
Ground via stitching spacing based on wavelength:

Max spacing = lambda / 20

Where lambda = c / (f * sqrt(epsilon_r))

c = 3e8 m/s
epsilon_r = 4.2 (FR-4)
f = highest frequency of concern

Spacing calculation table:

| Freq (MHz) | Wavelength (mm) | Stitch Spacing (mm) | Stitch Spacing (mil) |
|------------|-----------------|---------------------|----------------------|
| 100        | 1465            | 73.2                | 2882                 |
| 300        | 488             | 24.4                | 961                  |
| 500        | 293             | 14.6                | 575                  |
| 1000       | 146             | 7.3                 | 288                  |
| 2000       | 73              | 3.7                 | 146                  |
| 5000       | 29              | 1.5                 | 59                   |

Practical application:
- General digital (< 500 MHz): stitch spacing <= 15mm (600mil)
- High-speed (~1 GHz): stitch spacing <= 7mm (280mil)
- RF (> 2 GHz): stitch spacing <= 3mm (120mil)
```

### 5.2 过孔缝合布局模式

```
Pattern A: Grid array stitching (recommended)

  *   *   *   *   *   *
  *   *   *   *   *   *
  *   *   *   *   *   *
  *   *   *   *   *   *
  Spacing: uniform grid, pitch = stitch spacing

Pattern B: Edge stitching (shielding)

  ************************
  *                    *
  *    Circuit Area    *
  *                    *
  ************************
  Spacing: dense via wall along edges

Pattern C: Signal-adjacent stitching

  Signal -----*-----*-----*-----*
              |     |     |     |
              GND   GND   GND   GND
  Place ground via every lambda/20 along signal trace
```

---

## 6. 回流路径优化

### 6.1 回流路径原理

```
High-frequency return current follows minimum impedance path:

Low freq (< 1 MHz): return follows minimum resistance path (straight line)
High freq (> 1 MHz): return follows minimum inductance path (directly
                     beneath signal trace on ground plane)

Loop inductance:
L_loop = L_signal + L_return - 2*M

Where:
L_signal = self-inductance of signal trace
L_return = self-inductance of return path
M = mutual inductance between signal and return paths

When return path is directly beneath signal trace, M is maximized,
L_loop is minimized.
```

### 6.2 回流路径中断的危害

```
Hazard scenario: signal crossing ground plane split

  Signal ----------------------------
           ^                    ^
  +--------+                    +--------+
  |           GND gap            |
  |  AGND    (no copper) DGND   |
  |                                |
  +--------------------------------+

Return current forced to detour around gap edge.
Loop area increases from A to A':

A' = A + l_gap * h_plane

Where l_gap = gap length, h_plane = signal layer to GND distance.

Radiation increase from enlarged loop area:
E_field proportional to f^2 * I * A_loop

Typical impact: 1cm gap can increase radiation by 10~20 dB.
```

### 6.3 回流路径优化规则

| 规则编号 | 规则内容 | 数值要求 |
|---------|---------|---------|
| RT-01 | 信号走线下方必须有连续地平面 | 0 缝隙 |
| RT-02 | 信号换层时必须有伴生地过孔 | 每个信号过孔旁 1 个 GND 过孔 |
| RT-03 | 地过孔到信号过孔距离 | <= 3x 过孔焊盘直径 |
| RT-04 | 关键时钟信号下方无任何分割 | 全路径连续 |
| RT-05 | 高速差分对下方地平面完整 | 全路径连续 |

---

## 7. 地阻抗分析

### 7.1 地走线阻抗

```
Total ground trace impedance:

Z = R + j*w*L

Where:
R = DC resistance
L = trace inductance
w = 2*pi*f

DC resistance (1oz copper):
R = 0.000487 * l / w  [Ohm, l/w in mil]

Trace inductance (microstrip):
L = 0.2 * l * (ln(2*l/(w+t)) + 0.5 + 0.2235*(w+t)/l)  [nH, l/w/t in mm]

Example: 100mm long, 0.25mm wide ground trace
R = 0.000487 * 3937 / 10 = 0.192 Ohm
L = 0.2 * 100 * (ln(200/0.275) + 0.5) = 0.2 * 100 * 7.4 = 148 nH
At 100 MHz: XL = 2*pi*1e8*148e-9 = 93 Ohm

Conclusion: ground trace has extremely high impedance at HF;
must use ground plane instead.
```

### 7.2 过孔电感

```
Single via inductance estimate:

L_via = 5.08 * h * (ln(4*h/d) + 1)  [nH, h/d in inches]

Where:
h = via length (board thickness)
d = via drill diameter

Typical values:
- 1.6mm board, 0.3mm drill: L_via ~ 1.2 nH
- 0.8mm board, 0.2mm drill: L_via ~ 0.7 nH
- 0.4mm board, 0.15mm drill: L_via ~ 0.45 nH

Methods to reduce via inductance:
1. Use short vias (blind/buried, reduce h)
2. Increase drill diameter d
3. Multiple vias in parallel (L_total = L/n)
4. Back-drilling to remove via stub
```

### 7.3 地平面谐振

```
Ground plane resonates at specific frequencies, causing impedance peaks:

Rectangular plane resonant frequency:
f_mn = (c / (2*sqrt(epsilon_r))) * sqrt((m/a)^2 + (n/b)^2)

Where:
a, b = plane length and width
m, n = resonant modes (1,0), (0,1), (1,1)...

Example: 100mm x 80mm FR-4 ground plane
f_10 = (3e8 / (2*2.05)) * (1/0.1) = 732 MHz
f_01 = (3e8 / (2*2.05)) * (1/0.08) = 914 MHz
f_11 = (3e8 / (2*2.05)) * sqrt(100 + 156) = 1.17 GHz

Suppression: via stitching and decoupling caps break resonant modes.
```

---

## 8. Altium Designer 接地设计规则

### 8.1 地平面相关 DRC 规则

```
1. Polygon Connect Style (copper pour connection):
   Design -> Rules -> Plane -> Polygon Connect
   - Connect Style: Relief Connect
   - Conductors: 4
   - Conductor Width: 10mil
   - Air Gap: 10mil
   (facilitates soldering, avoids large copper thermal mass)

2. Power Plane Connect:
   Design -> Rules -> Routing -> Power Plane Connect
   - Connect Style: Relief Connect
   - Conductor Width: 10mil
   - Expansion: 20mil

3. Plane Clearance:
   Design -> Rules -> Electrical -> Plane Clearance
   - Minimum Clearance: 10mil (split line spacing)

4. Un-Connected Pin:
   Design -> Rules -> Electrical -> Un-Connected Pin
   - Enable check, ensure all GND pins are connected
```

### 8.2 过孔缝合规则设置

```
Altium Designer via stitching setup:

Tools -> Via Stitching -> Auto Via Stitching

Parameters:
- Grid Size: based on max frequency (lambda/20)
- Via Spacing: Min 20mil, Max = stitch spacing
- Via Size: Hole 8mil, Diameter 16mil
- Net: GND
- Only Stitch on Top/Bottom: as needed

DRC checks:
- Design Rule Check -> Manufacturing -> Hole Size
- Design Rule Check -> Routing -> Routing Vias
```

---

## 9. 设计审查清单

| 检查项 | 检查标准 | 优先级 |
|--------|---------|--------|
| GD-01 | 是否有完整的地平面层 | 高 |
| GD-02 | 信号线是否跨越地平面分割 | 高 |
| GD-03 | AGND/DGND 是否单点连接 | 高 |
| GD-04 | 连接点是否在 ADC/DAC 下方 | 高 |
| GD-05 | 接地方式是否匹配信号频率 | 高 |
| GD-06 | 地过孔缝合间距是否 <= lambda/20 | 中 |
| GD-07 | 信号换层是否有伴生地过孔 | 高 |
| GD-08 | 时钟信号下方地平面是否完整 | 高 |
| GD-09 | 模拟电源是否经磁珠隔离 | 中 |
| GD-10 | 地平面是否有不必要的分割 | 中 |
| GD-11 | 覆铜是否使用热焊盘连接 | 低 |
| GD-12 | 是否存在地环路（多点接地低频） | 高 |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08-21 | 初始版本：接地方式选型/地平面设计/数模隔离/过孔缝合/回流路径/地阻抗/DRC | AI Knowledge Base |
