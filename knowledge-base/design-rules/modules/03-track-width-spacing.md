# 走线宽度与间距设计规则知识库

> 适用范围：所有 PCB 设计的走线宽度、间距、载流与阻抗控制
> 目标受众：AI 设计辅助 Skill，用于线宽计算、间距设计与阻抗控制审查
> 版本：v1.0 | 更新日期：2026-08

---

## 1. 概述

走线宽度与间距是 PCB 设计的基础参数，直接决定载流能力、电压绝缘、信号阻抗和串扰性能。本模块基于 IPC-2152 标准（载流能力）和 IPC-2141 标准（阻抗控制），提供完整的数值计算方法和设计查表数据。

---

## 2. 载流能力设计（IPC-2152）

### 2.1 IPC-2152 简化公式

```
IPC-2152 simplified current capacity formula:

I = k * dT^0.44 * W^0.725

Where:
I  = allowable continuous current (A)
dT = allowable temperature rise (degC)
W  = copper width (mil)
k  = coefficient (depends on copper thickness and layer)

Coefficient k values:
- External 1oz Cu (35um): k = 0.048
- External 2oz Cu (70um): k = 0.072
- Internal 1oz Cu (35um): k = 0.024
- Internal 2oz Cu (70um): k = 0.036

Note: conservative estimate, applicable for dT <= 30 degC.
For precise calculation, refer to IPC-2152 charts with correction
factors for board thickness, adjacent copper, airflow.
```

### 2.2 载流能力查表

#### 1oz 铜厚（35um）载流表

| 线宽 (mil) | 线宽 (mm) | 温升 10degC | 温升 20degC | 温升 30degC |
|------------|-----------|-------------|-------------|-------------|
| 5 | 0.127 | 0.38 A | 0.52 A | 0.63 A |
| 8 | 0.203 | 0.53 A | 0.72 A | 0.87 A |
| 10 | 0.254 | 0.62 A | 0.85 A | 1.03 A |
| 15 | 0.381 | 0.83 A | 1.14 A | 1.38 A |
| 20 | 0.508 | 1.02 A | 1.40 A | 1.70 A |
| 25 | 0.635 | 1.20 A | 1.64 A | 1.99 A |
| 50 | 1.270 | 1.96 A | 2.69 A | 3.26 A |
| 100 | 2.540 | 3.25 A | 4.45 A | 5.40 A |

#### 2oz 铜厚（70um）载流表

| 线宽 (mil) | 线宽 (mm) | 温升 10degC | 温升 20degC | 温升 30degC |
|------------|-----------|-------------|-------------|-------------|
| 10 | 0.254 | 0.93 A | 1.27 A | 1.54 A |
| 15 | 0.381 | 1.24 A | 1.70 A | 2.06 A |
| 20 | 0.508 | 1.53 A | 2.10 A | 2.54 A |
| 25 | 0.635 | 1.80 A | 2.46 A | 2.99 A |
| 50 | 1.270 | 2.93 A | 4.01 A | 4.87 A |
| 100 | 2.540 | 4.86 A | 6.65 A | 8.07 A |

### 2.3 电源走线宽度经验法则

```
Power trace width rule of thumb (1oz Cu, 10degC rise):

W_power = I * 20  [mil/A]

i.e. ~20mil width per 1A current.

Correction factors:
- 2oz Cu: W = I * 13 mil/A
- 3oz Cu: W = I * 10 mil/A
- Internal trace (poor heat dissipation): W = I * 30 mil/A

Examples:
3.3V/2A power trace, 1oz Cu: W = 2 * 20 = 40mil
12V/5A power trace, 2oz Cu: W = 5 * 13 = 65mil
```

---

## 3. 电压间距设计

### 3.1 最小间距规则

| 信号类型 | 最小间距 (mil) | 最小间距 (mm) | 说明 |
|---------|---------------|--------------|------|
| 同一网络 | 4 | 0.10 | 制造极限 |
| 不同信号（低压） | 6 | 0.15 | 通用最小间距 |
| 不同信号（标准） | 8 | 0.20 | 推荐间距 |
| 高速差分对内间距 | 按阻抗计算 | — | 见第 4 节 |
| 电源与信号 | 10 | 0.25 | 防串扰 |

### 3.2 高压爬电距离与电气间隙

```
Creepage distance and clearance per IEC 60664-1:

| Working Voltage (V) | Clearance (mm) | Creepage (mm) | Creepage (mil) |
|---------------------|----------------|---------------|----------------|
| 50                  | 0.4            | 0.8           | 31.5           |
| 100                 | 0.8            | 1.4           | 55             |
| 150                 | 1.0            | 1.6           | 63             |
| 300                 | 1.5            | 3.0           | 118            |
| 600                 | 3.0            | 5.8           | 228            |
| 1000                | 5.5            | 10.0          | 394            |

Rule of thumb (general purpose):
- Creepage: 40mil / 100V (pollution degree 2, material group IIIa)
- Clearance: 20mil / 100V

High voltage isolation areas (e.g. AC input side) should add 50% margin.
```

### 3.3 安全间距分区设计

```
High voltage PCB safety clearance zones:

  +--------------------------------------+
  |  Primary side (AC 220V)               |
  |  Min clearance: 80mil (> 300V)        |
  |  - - - - isolation band - - - -       |
  |  Min isolation width: 200mil (5mm)    |
  |  - - - - - - - - - - - - -            |
  |  Secondary side (DC low voltage)       |
  |  Min clearance: 6mil                  |
  +--------------------------------------+

Isolation band rules:
1. No traces, pads, or vias in isolation band
2. Band width per safety standard (IEC 62368-1)
3. Slots (V-Cut or milled) on both sides enhance insulation
4. Band width: <= 300V >= 3mm, 300~600V >= 5mm
```

---

## 4. 受控阻抗设计

### 4.1 微带线阻抗（Microstrip）

```
Microstrip structure: signal layer above ground plane

  ------- W -------  (signal trace, thickness T)
  - - - - - - - - -
  |               | H (dielectric thickness)
  |   GND plane   |
  ------------------

50 Ohm microstrip impedance formula (IPC-2141):

Z_micro = (87 / sqrt(Er + 1.41)) * ln(5.98*H / (0.8*W + T))

Where:
Er  = dielectric constant (FR-4 = 4.2)
H   = dielectric thickness signal to ref plane (mil)
W   = trace width (mil)
T   = copper thickness (mil, 1oz = 1.37mil)

Simplified (W/H < 2):
Z_micro = (87 / sqrt(Er + 1.41)) * ln(5.98*H / (0.8*W + T))
```

#### 50 Ohm 微带线查表（FR-4, Er=4.2, 1oz Cu）

| 介质厚度 H (mil) | 介质厚度 H (mm) | 线宽 W (mil) | 线宽 W (mm) | 阻抗 (Ohm) |
|-----------------|----------------|-------------|-------------|-----------|
| 4 | 0.10 | 7.5 | 0.19 | 50.0 |
| 6 | 0.15 | 11.3 | 0.29 | 50.0 |
| 8 | 0.20 | 15.2 | 0.39 | 50.0 |
| 10 | 0.25 | 19.0 | 0.48 | 50.0 |
| 12 | 0.30 | 22.9 | 0.58 | 50.0 |
| 16 | 0.41 | 30.7 | 0.78 | 50.0 |
| 20 | 0.51 | 38.5 | 0.98 | 50.0 |

### 4.2 带状线阻抗（Stripline）

```
Stripline structure: signal layer between two ground planes

  --------------------
  |     GND plane    |
  - - - - - - - - - -
  |                  | H1 (upper dielectric)
  ------- W -------   (signal trace)
  |                  | H2 (lower dielectric)
  - - - - - - - - - -
  |     GND plane    |
  --------------------

Symmetric stripline (H1 = H2 = H) impedance formula:

Z_strip = (60 / sqrt(Er)) * ln(4*H / (0.67*pi*(0.8*W + T)))

For FR-4 (Er=4.2):
Z_strip = 29.3 * ln(4*H / (0.67*pi*(0.8*W + T)))

Note: stripline impedance is ~30% higher than same-width microstrip,
so stripline requires wider traces for same impedance.
```

#### 50 Ohm 对称带状线查表（FR-4, Er=4.2, 1oz Cu）

| 介质厚度 H (mil) | 介质厚度 H (mm) | 线宽 W (mil) | 线宽 W (mm) | 阻抗 (Ohm) |
|-----------------|----------------|-------------|-------------|-----------|
| 4 | 0.10 | 3.0 | 0.08 | 50.0 |
| 6 | 0.15 | 4.6 | 0.12 | 50.0 |
| 8 | 0.20 | 6.2 | 0.16 | 50.0 |
| 10 | 0.25 | 7.9 | 0.20 | 50.0 |
| 12 | 0.30 | 9.5 | 0.24 | 50.0 |
| 16 | 0.41 | 12.8 | 0.33 | 50.0 |
| 20 | 0.51 | 16.1 | 0.41 | 50.0 |

### 4.3 差分对阻抗

```
Differential pair impedance relationship:

Z_diff = 2 * Z0 * (1 - 0.48 * exp(-0.96 * S/H))

Where:
Z0    = single-ended impedance (Ohm)
S     = intra-pair spacing (mil)
H     = dielectric thickness (mil)

Differential impedance targets:
- USB 2.0:      Z_diff = 90 Ohm
- LVDS:         Z_diff = 100 Ohm
- PCIe Gen1/2:  Z_diff = 100 Ohm (85 Ohm acceptable)
- PCIe Gen3+:   Z_diff = 85 Ohm
- HDMI:         Z_diff = 100 Ohm
- Ethernet:     Z_diff = 100 Ohm
```

#### 90 Ohm 差分对查表（微带线, FR-4, Er=4.2, 1oz Cu）

| 介质 H (mil) | 线宽 W (mil) | 间距 S (mil) | 单端 Z0 (Ohm) | 差分 Z_diff (Ohm) |
|-------------|-------------|-------------|--------------|-------------------|
| 4 | 7.0 | 5.0 | 51.8 | 90.0 |
| 6 | 10.5 | 7.5 | 51.8 | 90.0 |
| 8 | 14.0 | 10.0 | 51.8 | 90.0 |
| 10 | 17.5 | 12.5 | 51.8 | 90.0 |

#### 100 Ohm 差分对查表（微带线, FR-4, Er=4.2, 1oz Cu）

| 介质 H (mil) | 线宽 W (mil) | 间距 S (mil) | 单端 Z0 (Ohm) | 差分 Z_diff (Ohm) |
|-------------|-------------|-------------|--------------|-------------------|
| 4 | 5.5 | 6.0 | 58.2 | 100.0 |
| 6 | 8.3 | 9.0 | 58.2 | 100.0 |
| 8 | 11.0 | 12.0 | 58.2 | 100.0 |
| 10 | 13.8 | 15.0 | 58.2 | 100.0 |

---

## 5. 常用叠层阻抗参考

### 5.1 4 层板叠层（FR-4, 1.6mm 总厚）

```
Typical 4-layer stackup:

  Layer 1 (Top):    Signal  -- 1oz Cu
  Prepreg:          7628 x 2 (H ~ 12mil)
  Layer 2 (GND):    Ground  -- 1oz Cu
  Core:             1.0mm (H ~ 40mil)
  Layer 3 (PWR):    Power   -- 1oz Cu
  Prepreg:          7628 x 2 (H ~ 12mil)
  Layer 4 (Bottom): Signal  -- 1oz Cu

Layer 1/4 microstrip (H=12mil, FR-4):
  50 Ohm:  W = 22.9 mil (0.58mm)
  90 Ohm:  W=21mil, S=15mil
  100 Ohm: W=17mil, S=18mil

Note: 4-layer board has large signal-to-ref distance (12mil),
lower impedance control accuracy, not recommended for > 1 Gbps.
```

### 5.2 6 层板叠层（FR-4, 1.6mm 总厚）

```
Recommended 6-layer stackup (high-speed optimized):

  Layer 1 (Top):    Signal  -- 1/2oz Cu
  Prepreg:          1080 x 2 (H ~ 4mil)  <- close to GND
  Layer 2 (GND):    Ground  -- 1oz Cu
  Core:             0.71mm (H ~ 28mil)
  Layer 3 (SIG):    Signal  -- 1/2oz Cu
  Prepreg:          1080 x 2 (H ~ 4mil)
  Layer 4 (GND):    Ground  -- 1oz Cu
  Core:             0.71mm (H ~ 28mil)
  Layer 5 (PWR):    Power   -- 1oz Cu
  Prepreg:          1080 x 2 (H ~ 4mil)
  Layer 6 (Bottom): Signal  -- 1/2oz Cu

Layer 1/6 microstrip (H=4mil):
  50 Ohm:  W = 7.5 mil (0.19mm)
  90 Ohm:  W=7mil, S=5mil
  100 Ohm: W=5.5mil, S=6mil

Layer 3 stripline (H=4mil, GND above and below):
  50 Ohm:  W = 3.0 mil (0.08mm)
```

---

## 6. 串扰与间距规则

### 6.1 3W 规则

```
3W rule (basic crosstalk reduction):

  ---- Trace A ----
                      <- center-to-center spacing >= 3W
  ---- Trace B ----

W = trace width
Center-to-center spacing >= 3 * W

Effect: near-end crosstalk reduced to ~ -30dB (~3%)

Crosstalk vs spacing:

| Spacing (center) | Near-end Crosstalk | Attenuation (dB) |
|------------------|-------------------|-----------------|
| 2W               | ~10%              | -20             |
| 3W               | ~3%               | -30             |
| 5W               | ~1%               | -40             |
| 10W              | ~0.3%             | -50             |

Recommended:
- General signals: 3W spacing
- Clock/sensitive signals: 5W spacing
- High-speed bus: 3W + guard trace
```

### 6.2 平行走线长度限制

```
Max parallel routing length (prevent excessive crosstalk):

L_parallel_max = lambda / 4

Where lambda = effective wavelength of signal

For rise time tr = 1ns:
f_3dB = 0.35 / tr = 350 MHz
lambda = c / (f * sqrt(Er)) = 3e8 / (350e6 * 2.05) = 418 mm
L_parallel_max = 418 / 4 = 104 mm

Practical rules:
- Parallel length should be < lambda/4
- If unavoidable, increase spacing to >= 5W
- Critical signals use guard trace isolation
```

---

## 7. Altium Designer 线宽间距 DRC 规则

### 7.1 走线宽度规则

```
Design -> Rules -> Routing -> Width

Rule categories:

1. Default routing rule:
   Min Width: 6mil
   Preferred Width: 8mil
   Max Width: 20mil

2. Power trace rule (Power Nets):
   New rule "Width_Power"
   Where: InNetClass('Power') or InNet('VCC') or InNet('GND')
   Min: 12mil, Preferred: 20mil, Max: 100mil

3. 50 Ohm impedance rule:
   New rule "Width_50ohm"
   Where: InNetClass('50ohm')
   Min/Preferred/Max: per stackup calculation (e.g. 7.5mil)
   Note: use Impedance Constraint or fixed width

4. Differential pair width rule:
   New rule "Width_DiffPair"
   Where: InNetClass('DiffPairs')
   Linked with differential pair spacing rule
```

### 7.2 间距规则

```
Design -> Rules -> Electrical -> Clearance

1. Default clearance:
   Min Clearance: 6mil

2. High voltage clearance:
   New rule "Clearance_HV"
   Where First: InNetClass('HighVoltage')
   Where Second: All
   Min Clearance: 40mil (per 40mil/100V)

3. Differential pair intra-spacing:
   New rule "Clearance_DiffPair"
   Where First: InNetClass('DiffPairs')
   Where Second: InNetClass('DiffPairs') and SameNet(false)
   Min Clearance: per impedance S value

4. Clock signal clearance:
   New rule "Clearance_Clock"
   Where First: InNetClass('Clock')
   Where Second: All
   Min Clearance: 15mil (3W rule, W=5mil)
```

### 7.3 阻抗控制规则（Altium 原生）

```
Altium Designer impedance control setup:

1. Design -> Layer Stack Manager
   - Configure copper thickness, dielectric thickness, Er per layer
   - Enable Impedance Calculation

2. Design -> Rules -> Routing -> Routing Width
   - Check "Use Impedance Profile"
   - Select/create impedance profile (50 Ohm / 90 Ohm / 100 Ohm)

3. Create Impedance Profile:
   Properties -> Impedance Profile
   - Type: Single / Differential
   - Target Impedance: 50 / 90 / 100 Ohm
   - System auto-calculates recommended width and spacing
```

---

## 8. 设计审查清单

| 检查项 | 检查标准 | 优先级 |
|--------|---------|--------|
| TW-01 | 电源走线宽度是否满足载流要求（IPC-2152） | 高 |
| TW-02 | 高压间距是否满足爬电距离要求 | 高 |
| TW-03 | 阻抗受控信号线宽是否匹配叠层 | 高 |
| TW-04 | 差分对线宽/间距是否一致 | 高 |
| TW-05 | 信号间距是否满足 3W 规则 | 中 |
| TW-06 | 时钟信号间距是否 >= 5W | 中 |
| TW-07 | 安全隔离带宽度是否满足安规标准 | 高 |
| TW-08 | 内层电源走线是否按散热修正加宽 | 中 |
| TW-09 | 平行走线长度是否 < lambda/4 | 低 |
| TW-10 | 过孔载流是否满足（孔壁铜厚） | 中 |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08-21 | 初始版本：IPC-2152 载流/电压间距/阻抗计算/叠层参考/串扰规则/DRC | AI Knowledge Base |
