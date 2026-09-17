# EMC/EMI 设计规则知识库

> 适用范围：所有 PCB 设计的电磁兼容（EMC）与电磁干扰（EMI）控制
> 目标受众：AI 设计辅助 Skill，用于 EMC 审查、EMI 抑制设计与 DRC 检查
> 版本：v1.0 | 更新日期：2026-08

---

## 1. 概述

EMC（电磁兼容）设计是保证电子设备在电磁环境中正常工作且不对其他设备产生干扰的核心技术。EMI（电磁干扰）问题通常在 PCB 布局阶段就已决定，后期整改成本极高。本模块提供系统性的 EMC 设计规则，涵盖信号带宽分析、回流路径控制、时钟布线、滤波器设计、屏蔽技术、层叠优化和布局分区等方面。

---

## 2. 信号上升时间与带宽

### 2.1 带宽计算公式

```
Signal bandwidth vs rise time relationship:

BW = 0.35 / tr

Where:
BW = effective signal bandwidth (Hz)
tr = signal rise time 10%~90% (s)

Equivalent frequency (max frequency of concern):
f_max = 1 / (pi * tr)  ~ 0.5 / tr

Examples:
| Rise Time tr | Bandwidth BW | Max Freq f_max | Design Band |
|--------------|-------------|----------------|-------------|
| 1 ns         | 350 MHz     | 500 MHz        | < 500 MHz   |
| 500 ps       | 700 MHz     | 1 GHz          | < 1 GHz     |
| 200 ps       | 1.75 GHz    | 2.5 GHz        | < 2.5 GHz   |
| 100 ps       | 3.5 GHz     | 5 GHz          | < 5 GHz     |
| 50 ps        | 7 GHz       | 10 GHz         | < 10 GHz    |

Key conclusion: EMC design should be based on rise time, not clock frequency.
A 10 MHz clock with 1 ns rise time has harmonics up to 500 MHz.
```

### 2.2 谐波分量分析

```
Square wave harmonic amplitude (Fourier expansion):

Odd harmonic amplitude: An = (4 * A) / (pi * n)

Where A = square wave amplitude, n = odd harmonic number (1, 3, 5, 7...)

Harmonic amplitude table (normalized):
| Harmonic | Frequency | Relative Amplitude (dB) |
|----------|-----------|------------------------|
| 1 (fund) | f0        | 0                      |
| 3        | 3*f0      | -9.5                   |
| 5        | 5*f0      | -14.0                  |
| 7        | 7*f0      | -16.9                  |
| 9        | 9*f0      | -19.1                  |
| 11       | 11*f0     | -20.8                  |
| 15       | 15*f0     | -23.5                  |

Note: shorter rise time = higher high-order harmonic amplitude.
tr determines spectrum roll-off corner: f_knee = 0.5/tr.
```

---

## 3. 回流路径控制

### 3.1 回流路径核心原则

```
EMC Principle #1: minimize return current loop area

Radiated field strength proportional to loop area:

E = (1.4e-18 * f^2 * A * I) / r  [V/m]

Where:
f = signal frequency (Hz)
A = loop area (m^2)
I = signal current (A)
r = measurement distance (m)

Example: 100 MHz signal, 100 mA current, 3m measurement distance
  Loop area 1 cm^2 (1e-4 m^2):
  E = 1.4e-18 * 1e16 * 1e-4 * 0.1 / 3 = 4.67e-8 V/m
  = 33.4 dBuV/m

  Loop area 10 cm^2 (1e-3 m^2):
  E = 53.4 dBuV/m (increase of 20 dB)

Conclusion: each 10x increase in loop area = 20 dB more radiation.
```

### 3.2 信号跨越分割的禁止规则

```
FORBIDDEN: signal crossing ground/power plane split

  +----------------------------------+
  |  Signal ----------------------  |  X FORBIDDEN
  |         ^              ^         |
  |  GND plane          GND plane   |
  |  (Area A)    gap    (Area B)    |
  +----------------------------------+

Return current forced to detour around gap, loop area surges.

Radiation increase estimate:
delta_E = 20 * log10((A + l_gap * h) / A)

Where l_gap = gap length, h = signal layer to GND distance.

If crossing is unavoidable:
1. Use split-bridge capacitor (0.1uF) for HF return path
2. Place bridge copper directly under crossing point
3. Bridge cap close to signal trace (< 100mil)
```

### 3.3 换层回流路径

```
Return path management during signal layer transition:

When signal transitions from Layer 1 to Layer 3,
return current must also switch from Layer 2 (GND) to Layer 4 (GND).

  Layer 1: Signal ---------*
                           | (signal via)
  Layer 2: GND ----------* |
                        | |
  Layer 3: Signal -------*-+
  Layer 4: GND ----------*

Rule RT-01: for each signal layer transition, place at least 1 GND via
within 3x pad diameter of signal via to provide low-impedance return path.

Without companion GND via:
Return current forced to detour through nearest GND via,
loop area increases 10~100x.
```

---

## 4. 时钟信号布线规则

### 4.1 时钟布线总则

| 规则编号 | 规则内容 | 数值要求 |
|---------|---------|---------|
| CLK-01 | 时钟走线尽量短 | 越短越好 |
| CLK-02 | 时钟走线远离板边 | >= 3H（H 为板厚） |
| CLK-03 | 时钟走线远离连接器/I/O | >= 500mil |
| CLK-04 | 时钟走线两侧加地保护走线 | 推荐使用 |
| CLK-05 | 时钟过孔旁加 GND 过孔缝合 | 每 500mil 一个 |
| CLK-06 | 时钟线不与高速总线并行 | 间距 >= 5W |
| CLK-07 | 时钟回路面积最小化 | 正下方完整 GND |
| CLK-08 | 端接电阻靠近接收端 | < 200mil |

### 4.2 地保护走线

```
Clock signal guard trace layout:

  GND guard ----*----*----*----*----
                |    |    |    |
  Clock ---------+----+----+----+----
                |    |    |    |
  GND guard ----*----*----*----*----

  - One GND guard trace on each side
  - Guard trace width >= clock trace width
  - GND via every 500mil along guard trace (stitch to ground plane)
  - Guard-to-clock spacing = 2W~3W
  - Guard traces connected to GND plane at both ends

Effect: radiation reduced 10~20 dB, crosstalk reduced 15~25 dB.
```

### 4.3 时钟布线层选择

```
Clock signal recommended routing layers (by priority):

Priority 1: Inner layer stripline (between two GND layers)
  - Lowest radiation (shielded by two GND layers)
  - Good impedance control
  - Applicable to all clock signals

Priority 2: Outer layer microstrip (adjacent to GND layer)
  - Higher radiation
  - For short-distance clocks
  - For low-frequency clocks (< 50 MHz)

Forbidden: clock routing between two signal layers (no adjacent GND)
```

---

## 5. 滤波器设计

### 5.1 共模扼流圈（Common Mode Choke）

```
Common mode choke for common-mode noise suppression:

Selection parameters:
1. Common-mode impedance @ 100 MHz: 100~1000 Ohm (higher = better suppression)
2. Differential-mode impedance: < 10 Ohm (no impact on differential signal)
3. Rated current: >= 1.5x operating current
4. DC resistance: < 0.1 Ohm

Insertion loss (common mode):
IL_cm = 20 * log10(1 + Z_cm / (2 * Z_system))

Example:
  USB 2.0 common mode choke
  Z_cm = 600 Ohm @ 100 MHz
  Z_system = 90 Ohm
  IL_cm = 20 * log10(1 + 600/180) = 20 * log10(4.33) = 12.7 dB

Applications:
- USB differential pair: CMC + ESD protection
- HDMI differential pair: CMC
- Power line CM filter: CM inductor + X/Y caps
- Ethernet: CMC (typically integrated in RJ45 connector)
```

### 5.2 铁氧体磁珠（Ferrite Bead）

```
Ferrite bead selection parameters:

1. Impedance @ 100 MHz (Z@100MHz):
   - Signal line filter: 100~600 Ohm
   - Power line filter: 600~2000 Ohm

2. DC resistance (DCR):
   - Low power: < 0.1 Ohm
   - High current: < 0.05 Ohm

3. Rated current (I_rated):
   - Should be >= 2x operating current
   - Exceeding rated current causes core saturation, impedance drops

4. Frequency impedance curve:
   - Low freq (< 1 MHz): low impedance (< 1 Ohm, no DC impact)
   - High freq (10~1000 MHz): high impedance (noise suppression)
   - Impedance peak frequency should match noise frequency

Bead equivalent circuit:
  R_s + j*w*L_s (low frequency band)
  R_s + j*w*L_s || 1/(j*w*C_p) (becomes capacitive after self-resonance)

Self-resonant frequency:
f_sr = 1 / (2 * pi * sqrt(L_s * C_p))
Above f_sr, bead becomes capacitive, decoupling effectiveness drops.
```

### 5.3 Pi 型滤波器

```
Pi filter (CLC filter) for power noise suppression:

  C1        L/FB        C2
  --||---[MMM]---||--
  |               |
  GND             GND

Design formula:
Cutoff frequency: fc = 1 / (2 * pi * sqrt(L * C_total))
  Where C_total = (C1 * C2) / (C1 + C2)

Attenuation (above cutoff):
A = 40 * log10(f / fc)  [dB/decade] (2nd order filter)

Example design:
  Target: suppress noise above 100 MHz, attenuation > 40 dB
  C1 = C2 = 0.1uF, L = 1uH (or bead Z=600 Ohm@100MHz)
  fc = 1 / (2 * pi * sqrt(1e-6 * 0.05e-6)) = 712 kHz
  100 MHz attenuation: 40 * log10(100e6 / 712e3) = 82.9 dB

Note: when bead replaces inductor, HF impedance dominated by resistance,
attenuation differs from pure inductor; refer to bead Z-f curve.
```

---

## 6. 屏蔽技术

### 6.1 地过孔缝合屏蔽

```
Ground via stitching forms Faraday cage shielding:

Stitching spacing rule:
d_stitch <= lambda / 20

Where lambda = c / (f * sqrt(Er))

Spacing calculation (FR-4, Er=4.2):

| Freq of Concern | Stitch Spacing (mm) | Stitch Spacing (mil) |
|-----------------|---------------------|----------------------|
| 100 MHz         | 73                  | 2880                 |
| 500 MHz         | 14.6                | 575                  |
| 1 GHz           | 7.3                 | 288                  |
| 2 GHz           | 3.7                 | 146                  |
| 5 GHz           | 1.5                 | 59                   |

Practical application:
- General design (< 1 GHz): spacing <= 7mm (280mil)
- High-speed design (1~5 GHz): spacing <= 3mm (120mil)
- RF design (> 5 GHz): spacing <= 1.5mm (60mil)

Edge stitching:
Dense GND vias along board edge form shielding wall.
Spacing: half of stitch spacing (denser at edges).
```

### 6.2 边缘铺铜与 20H 规则

```
20H rule (power plane retraction):

  +-----------------------------+
  |  GND plane (full size)      |
  |  +-----------------------+  |
  |  |  PWR plane (20H retract)|  |
  |  +-----------------------+  |
  |  <-- 20H -->               |
  +-----------------------------+

H = dielectric thickness between power and ground planes

20H rule explanation:
- Power plane edge retracts 20x layer spacing from ground plane edge
- Prevents edge fringing field radiation from power plane
- Reduces board edge HF radiation

Effect:
- 20H retraction reduces edge radiation by 10~15 dB
- 10H~20H effective in practice

Conditions:
- Power and ground planes adjacent (H < 0.3mm)
- Recommended for high-speed/high-frequency circuits
- Low-frequency low-noise boards can relax to 10H

Edge copper pour rules:
1. Top and bottom board edge copper pour (edge copper)
2. Edge copper width >= 50mil (1.27mm)
3. GND via every 200mil along edge copper (stitching)
4. Edge copper connected to inner GND planes
```

---

## 7. 层叠设计 EMC 规则

### 7.1 层叠 EMC 原则

```
Layer stackup EMC core principles:

Principle 1: each signal layer adjacent to a solid reference plane (GND or PWR)
  - Signal-to-reference distance as small as possible (< 10mil)
  - Provides low-impedance return path

Principle 2: prefer GND as reference plane for signal layers
  - GND reference more stable than PWR (GND has no ripple)
  - PWR reference noise couples into signal

Principle 3: route high-speed signals in stripline layers (between two GND)
  - Lowest radiation
  - Minimum crosstalk

Principle 4: power and ground planes adjacent
  - Forms plane capacitance (HF decoupling)
  - Spacing < 5mil for best effect

Principle 5: avoid two signal layers adjacent
  - Adjacent signal layers cause inter-layer crosstalk
  - If unavoidable, route orthogonal (one horizontal, one vertical)
```

### 7.2 推荐叠层方案

```
4-layer board (basic EMC scheme):
  L1: SIG/COMP -- GND -- PWR -- SIG/COMP
  Issue: L1 and L4 far from reference plane, mediocre EMC

  Improved 4-layer:
  L1: SIG/COMP -- GND -- SIG/PWR -- GND
  Advantage: both outer layers have GND reference, improved EMC

6-layer board (recommended high-speed):
  L1: SIG -- GND -- SIG -- GND -- PWR -- SIG
  Advantage: L1/L6 have GND reference, L3 has GND reference

8-layer board (best EMC):
  L1: SIG -- GND -- SIG -- GND -- PWR -- SIG -- GND -- SIG
  Advantage: every signal layer has GND reference, 4 GND layers
  Suitable for high-speed/high-density design
```

---

## 8. 元件布局分区

### 8.1 噪声分区设计

```
PCB layout noise zoning:

  +--------------------------------------+
  |  Quiet Zone                           |
  |  +---------+                          |
  |  | Analog  |  ADC/DAC    +---------+ |
  |  | Frontend|             | Control | |
  |  | Amp     |             | Logic   | |
  |  | Ref     |             +---------+ |
  |  +---------+                         |
  |                                      |
  |  -------- buffer zone (>= 50mil) ----|
  |                                      |
  |  Noisy Zone                           |
  |  +---------+  +---------+           |
  |  | Clock   |  | Switch  | Connector |
  |  | Circuit |  | Power   | I/O       |
  |  | Crystal |  | DC-DC   |           |
  |  +---------+  +---------+           |
  +--------------------------------------+

Zoning rules:
1. High-noise circuits (switching power, clock, crystal) in one zone
2. Low-noise circuits (analog frontend, ADC, reference) in another zone
3. Buffer band between zones (no components, GND isolation)
4. Connectors/I/O at board edge (where noise radiates most easily)
5. Crystal close to IC clock pin (shortest trace)
```

### 8.2 连接器布局规则

```
Connector/I/O area EMC rules:

1. I/O connectors at board edge
2. I/O signals filtered immediately upon entry (ESD/EMI filter)
3. Independent GND area for I/O zone
4. I/O GND connected to main GND via single point or ferrite bead
5. I/O traces not parallel to internal high-speed signals

I/O filter scheme:
  Connector -> ESD TVS -> CM choke/RC filter -> Internal circuit

  Example (USB interface):
  USB connector -> TVS array -> Common mode choke -> USB IC
```

---

## 9. 扩频时钟（Spread Spectrum Clocking）

### 9.1 扩频原理与参数

```
Spread spectrum clocking (SSC) spreads energy via frequency modulation,
reducing peak radiation:

Modulation: triangular or sinusoidal
Modulation frequency: f_m = 30~33 kHz (typical)
Spread range: d_ssc = -0.5% ~ -0.25% (down-spread, recommended)

Peak radiation reduction:
delta_E = 10 * log10(f_clk / f_m)

Example:
  f_clk = 100 MHz, f_m = 32 kHz
  delta_E = 10 * log10(100e6 / 32e3) = 34.9 dB

Note:
1. SSC only reduces peak, total radiated energy unchanged
2. Down-spread does not affect max frequency
3. Center-spread increases max frequency
4. SSC not suitable for frequency-precision applications (e.g. USB 2.0)
5. Applicable to > 100 MHz high-frequency clock signals
```

### 9.2 扩频适用性

| 应用场景 | 是否推荐扩频 | 扩频范围 | 说明 |
|---------|-------------|---------|------|
| 系统时钟 > 100 MHz | 推荐 | -0.5% | 降低 EMI 峰值 |
| PCIe 参考时钟 | 可选 | -0.5% | PCIe 规范允许 |
| SATA 时钟 | 可选 | -0.5% | SATA 规范允许 |
| USB 2.0 | 不推荐 | — | 影响时序余量 |
| 音频时钟 | 不推荐 | — | 可能产生可听噪声 |
| 射频本振 | 禁止 | — | 影响频率精度 |

---

## 10. 3W 规则与串扰控制

### 10.1 3W 规则

```
3W rule (basic crosstalk control):

  ---- Trace A ----
                      <- center spacing >= 3W
  ---- Trace B ----

W = trace width
Center-to-center spacing >= 3 * W

Effect: near-end crosstalk < -30 dB (~3%)

Crosstalk vs spacing:

| Center Spacing | Near-end Crosstalk | Suppression (dB) |
|----------------|-------------------|-----------------|
| 2W             | ~10%              | -20             |
| 3W             | ~3%               | -30             |
| 5W             | ~1%               | -40             |
| 10W            | ~0.3%             | -50             |

Recommended:
- General signals: 3W
- Clock/sensitive signals: 5W
- Ultra-sensitive signals: 10W or add guard trace
```

### 10.2 串扰计算

```
Near-end crosstalk (NEXT) estimate (microstrip):

NEXT = 1 / (1 + (4 * S / H)^2)

Where:
S = trace spacing (edge to edge)
H = dielectric thickness

Examples:
  H = 4mil, S = 8mil (2W, W=4mil)
  NEXT = 1 / (1 + (8/4)^2) = 1/5 = 20% (without 3W rule)

  H = 4mil, S = 12mil (3W)
  NEXT = 1 / (1 + (12/4)^2) = 1/10 = 10%

  H = 4mil, S = 20mil (5W)
  NEXT = 1 / (1 + (20/4)^2) = 1/26 = 3.8%

Conclusion: 3W rule reduces crosstalk from 20% to 10%, 5W to 3.8%.
```

---

## 11. 过孔寄生参数

### 11.1 过孔电感

```
Via inductance estimate:

L_via = 5.08 * h * (ln(4*h/d) + 1)  [nH, h/d in inches]

Where:
h = via length (through board thickness)
d = via drill diameter

Typical values:
| Board Thickness (mm) | Drill (mm) | L_via (nH) |
|----------------------|------------|-----------|
| 0.4                  | 0.15       | 0.45      |
| 0.8                  | 0.20       | 0.72      |
| 1.6                  | 0.30       | 1.24      |
| 2.0                  | 0.30       | 1.55      |

Via inductance impact on high-speed signals:
V_noise = L_via * di/dt

Example:
  L_via = 1 nH, di/dt = 10 mA/ns (100 MHz, 10 mA signal)
  V_noise = 1e-9 * 10e6 = 10 mV

Methods to reduce via inductance:
1. Use short vias (blind/buried)
2. Multiple vias in parallel (L_total = L/n)
3. Increase drill diameter
4. Back-drill to remove stub
```

### 11.2 过孔电容

```
Via parasitic capacitance estimate:

C_via = 1.41 * epsilon_r * T * d1 / (d2 - d1)  [pF]

Where:
epsilon_r = dielectric constant
T = board thickness (mil)
d1 = via pad diameter (mil)
d2 = anti-pad diameter (mil)

Typical: 0.3~0.5 pF (standard via)

Via capacitance impact on impedance:
delta_Z = -Z0 * (C_via / (2 * sqrt(L * C_trace)))

For 50 Ohm line, 0.4 pF via cap introduces ~3~5 Ohm impedance drop.

Mitigation:
1. Use anti-pad to increase d2
2. Reduce via pad size
3. Blind/buried via reduces T
```

---

## 12. 去耦与 EMC

### 12.1 ESL 与高频去耦

```
Capacitor ESL determines high-frequency decoupling effectiveness:

Impedance minimum frequency (resonant frequency):
f_res = 1 / (2 * pi * sqrt(ESL * C))

Above f_res, capacitor becomes inductive, decoupling fails.

Package vs ESL vs resonant frequency:

| Package | ESL (nH) | f_res (100nF) | f_res (10nF) |
|---------|---------|---------------|-------------|
| 0201    | 0.35    | 27 MHz        | 85 MHz      |
| 0402    | 0.50    | 22 MHz        | 71 MHz      |
| 0603    | 0.75    | 18 MHz        | 58 MHz      |
| 0805    | 1.00    | 16 MHz        | 50 MHz      |
| 1206    | 1.25    | 14 MHz        | 45 MHz      |

EMC design guidelines:
1. HF decoupling must use small package (0402/0201)
2. Multiple cap values to cover wide frequency band
3. Total loop inductance (ESL + trace L + via L) determines actual effect
4. Use target impedance method to verify decoupling across full band
```

---

## 13. Altium Designer EMC 规则设置

### 13.1 EMC 相关 DRC 规则

```
1. Trace length rule (limit high-speed trace length):
   Design -> Rules -> Routing -> Length
   - Limit max clock trace length
   - Limit critical signal max length

2. Trace clearance rule (3W/5W crosstalk control):
   Design -> Rules -> Electrical -> Clearance
   - Clock net to other signals: 15mil (5W, W=3mil)
   - High-speed bus spacing: 9mil (3W, W=3mil)

3. Routing layer restriction (clock must route inner layers):
   Design -> Rules -> Routing -> Routing Layers
   - Clock nets: allow inner layers only (e.g. MidLayer1, MidLayer2)

4. Via count limit:
   Design -> Rules -> Routing -> Routing Via Style
   - Limit via count for high-speed signals (reduce impedance discontinuity)

5. Copper pour clearance (20H rule):
   Design -> Rules -> Plane -> Power Plane Clearance
   - Power plane to board edge: 20 * H (layer spacing)
```

---

## 14. 设计审查清单

| 检查项 | 检查标准 | 优先级 |
|--------|---------|--------|
| EMC-01 | 信号是否跨越地平面分割 | 高 |
| EMC-02 | 时钟是否走内层带状线 | 高 |
| EMC-03 | 时钟是否远离 I/O 和连接器 | 高 |
| EMC-04 | 时钟是否有地保护走线 | 中 |
| EMC-05 | 信号间距是否满足 3W 规则 | 中 |
| EMC-06 | 敏感信号间距是否满足 5W 规则 | 中 |
| EMC-07 | 电源平面是否满足 20H 规则 | 中 |
| EMC-08 | 板边是否有 GND 缝合过孔 | 中 |
| EMC-09 | 信号换层是否有伴生 GND 过孔 | 高 |
| EMC-10 | I/O 接口是否有 ESD/EMI 滤波 | 高 |
| EMC-11 | 模拟/数字电路是否分区布局 | 高 |
| EMC-12 | 高频去耦是否使用小封装电容 | 中 |
| EMC-13 | 层叠是否满足每信号层有参考面 | 高 |
| EMC-14 | >100MHz 时钟是否使用扩频 | 低 |
| EMC-15 | 噪声区与安静区是否有缓冲隔离 | 中 |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08-21 | 初始版本：带宽分析/回流控制/时钟布线/滤波器/屏蔽/层叠/布局分区/扩频/3W/过孔参数/DRC | AI Knowledge Base |
