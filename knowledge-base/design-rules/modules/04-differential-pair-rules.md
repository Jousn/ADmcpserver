# 差分对走线设计规则知识库

> 适用范围：USB、PCIe、LVDS、HDMI、Ethernet、MIPI 等高速差分信号 PCB 设计
> 目标受众：AI 设计辅助 Skill，用于差分对阻抗计算、等长匹配与 DRC 审查
> 版本：v1.0 | 更新日期：2026-08

---

## 1. 概述

差分信号传输是高速数字电路的核心技术，通过两条等长、等距、对称的走线传输互补信号，具有抗共模干扰能力强、信噪比高、辐射低等优势。差分对设计的核心是保证差分阻抗一致性和长度匹配精度，任何不对称都会导致模式转换、抖动增加和 EMI 恶化。

---

## 2. 差分阻抗计算

### 2.1 差分阻抗基础公式

```
Relationship between differential and single-ended impedance:

Z_diff = 2 * Z0 * (1 - k)

Where:
Z0 = single-ended characteristic impedance (with coupling)
k  = coupling coefficient

Coupling coefficient k depends on spacing S and dielectric H:

k = 0.48 * exp(-0.96 * S / H)

Therefore:
Z_diff = 2 * Z0 * (1 - 0.48 * exp(-0.96 * S/H))

Key conclusions:
- Smaller S (closer spacing) = stronger coupling = lower Z_diff
- Larger S (wider spacing) = weaker coupling = Z_diff approaches 2*Z0
- Tight coupling (S < 3W): strong noise immunity, sensitive to fab tolerance
- Loose coupling (S > 3W): Z_diff approaches 2*Z0, high fab tolerance
```

### 2.2 奇模与偶模阻抗

```
Two operating modes of differential pairs:

Odd Mode - differential drive:
  Two traces carry opposite polarity signals
  Z_odd = Z0 * (1 - k)
  Z_diff = 2 * Z_odd

Even Mode - common mode drive:
  Two traces carry same polarity signals
  Z_even = Z0 * (1 + k)
  Z_common = Z_even / 2

Common-mode to differential impedance ratio:
Z_common / Z_diff = (1 + k) / (2 * (1 - k))

Typical values (100 Ohm diff pair, k ~ 0.2):
Z_odd = 50 Ohm
Z_even = 75 Ohm
Z_common = 37.5 Ohm
Z_diff = 100 Ohm
```

### 2.3 标准阻抗目标

| 接口标准 | 差分阻抗 (Ohm) | 单端阻抗 (Ohm) | 典型耦合度 | 备注 |
|---------|---------------|--------------|-----------|------|
| USB 2.0 | 90 | 52 | 中等 | 高速模式（480Mbps） |
| USB 3.x | 90 | 52 | 中等 | 含 TX/RX 各 1 对 |
| LVDS | 100 | 50 | 紧密 | 低压差分，电流驱动 |
| PCIe Gen1/2 | 100 | 50~60 | 中等 | 2.5/5 GT/s |
| PCIe Gen3+ | 85 | 45~50 | 紧密 | 8 GT/s+，降低阻抗减少损耗 |
| HDMI | 100 | 50 | 中等 | TMDS 信号 |
| Ethernet (1000BASE-T) | 100 | 50 | 中等 | 4 对差分 |
| MIPI D-PHY | 90~100 | 50~55 | 中等 | 时钟 + 数据对 |
| SATA | 100 | 50 | 中等 | 6 Gbps |
| DisplayPort | 100 | 50 | 中等 | Main Link |

---

## 3. 耦合规则

### 3.1 间距选择准则

```
Differential pair spacing S vs trace width W:

S = 2W ~ 3W  -> Tight Coupling
  Pros: high noise immunity, low diff impedance
  Cons: sensitive to width tolerance, harder to manufacture

S = 3W ~ 5W  -> Moderate Coupling
  Pros: balanced immunity and fab tolerance (recommended)

S > 5W       -> Loose Coupling
  Pros: high fab tolerance, single-ended approaches 50 Ohm
  Cons: reduced common-mode noise immunity

Recommended strategy:
- Good fab capability (width tolerance < 10%): tight coupling S = 2W
- General design: moderate coupling S = 3W
- High-speed long distance: loose coupling S = 5W
```

### 3.2 耦合区域与非耦合区域

```
Differential pair has coupled and uncoupled regions:

Coupled region: two traces parallel with spacing = S (design spacing)
Uncoupled region: two traces separated (e.g. length compensation, fanout, vias)

Uncoupled length rule:
L_uncoupled_max = min(lambda/10, 150mil)

For 1 ns rise time signal:
f_3dB = 0.35 / 1ns = 350 MHz
lambda = 3e8 / (350e6 * 2.05) = 418 mm
L_uncoupled_max = 418/10 = 42 mm = 1654 mil
But practical limit is 150 mil to avoid impedance discontinuity

Design guidelines:
1. Keep via fanout region short (< 50mil uncoupled)
2. Keep length compensation region as short as possible
3. Use symmetric Neck-down at component pads
```

---

## 4. 长度匹配规则

### 4.1 等长匹配精度要求

| 接口标准 | 对内长度偏差 (mil) | 对间长度偏差 (mil) | 数据速率 | 备注 |
|---------|-------------------|-------------------|---------|------|
| USB 2.0 | <= 5 | — | 480 Mbps | D+/D- 对内匹配 |
| USB 3.x | <= 5 | <= 50 | 5 Gbps | TX/RX 各自匹配 |
| LVDS | <= 10 | <= 50 | < 1 Gbps | 对内严格 |
| PCIe Gen1 | <= 5 | <= 50 | 2.5 GT/s | |
| PCIe Gen2 | <= 5 | <= 25 | 5 GT/s | |
| PCIe Gen3 | <= 1 | <= 10 | 8 GT/s | 极严格 |
| PCIe Gen4 | <= 1 | <= 5 | 16 GT/s | 极严格 |
| HDMI | <= 15 | <= 50 | 3.4 Gbps | 3 对 TMDS + 时钟 |
| Ethernet | <= 10 | <= 50 | 1 Gbps | 4 对间匹配 |
| SATA | <= 5 | — | 6 Gbps | |
| DDR4 | <= 5 | <= 25 | 3.2 GT/s | DQS 差分对 |

### 4.2 长度匹配计算

```
Length mismatch vs timing skew relationship:

delta_t = delta_L / v_prop

Where:
delta_L = length mismatch (mil)
v_prop  = propagation velocity (mil/ps)

FR-4 microstrip propagation velocity:
v_prop_micro = c / sqrt((Er + 1)/2) = 3e8 / sqrt(2.6) = 1.86e8 m/s
            = 1.86e8 * 1e3 / 25.4e6 = 7.32 mil/ps

FR-4 stripline propagation velocity:
v_prop_strip = c / sqrt(Er) = 3e8 / 2.05 = 1.46e8 m/s
            = 5.76 mil/ps

Example calculation (PCIe Gen3):
Allowed timing skew delta_t = UI / 10 = (1/8GHz) / 10 = 12.5 ps
Max length mismatch delta_L = 12.5 * 5.76 = 72 mil

But spec requires <= 1 mil due to additional jitter margin allocation.
Actual design should strictly follow standard spec values.
```

### 4.3 等长补偿方法

```
Length compensation (serpentine routing) methods:

Method A: Hump compensation
  ----+     +----
      |     |
  ----+     +----

Method B: Sawtooth compensation
  ---+  +--+  +--
     |  |  |  |
  ---+  +--+  +--

Method C: Arc serpentine (recommended)
  ----\   /----
      |   |
  ----/   \----

Compensation rules:
1. Compensate as close to mismatch point as possible (right after via/fanout)
2. Serpentine spacing >= 3W (avoid self-crosstalk)
3. Serpentine bump height >= 3W (ensure effective compensation)
4. Total compensation trace length = required length difference
5. Avoid compensating only one trace in diff pair (distribute symmetrically)

Compensation length calculation:
delta_L_needed = L_long - L_short
Single bump compensation = 2 * h_bump (h_bump = bump height)
Number of bumps = delta_L_needed / (2 * h_bump)
```

---

## 5. 过孔对称规则

### 5.1 对称过孔布局

```
Differential pair layer transition must use symmetric vias:

Correct layout (symmetric vias):
  Trace+ ----*     *---- Trace+
              Via1  Via2
  Trace- ----*     *---- Trace-
              Via3  Via4

  Via1 and Via3 symmetric (+/- one each)
  Via2 and Via4 symmetric (+/- one each)
  Via1-Via2 spacing = Via3-Via4 spacing

Incorrect layout (asymmetric vias):
  Trace+ ----*----*---- Trace+  (2 vias)
              Via1  Via2
  Trace- ----*---------- Trace-  (1 via)
              Via3

  Problem: +/- signal via count differs, introducing asymmetric
  via parasitic parameters.
```

### 5.2 过孔残桩管理

```
Via stub effect on signal integrity:

Via stub produces quarter-wavelength resonance:
f_stub = c / (4 * L_stub * sqrt(Er))

Stub length limits:
| Data Rate   | Max Stub (mil) | Max Stub (mm) |
|-------------|---------------|--------------|
| < 1 Gbps    | no limit      | no limit     |
| 1~3 Gbps    | < 50          | < 1.27       |
| 3~6 Gbps    | < 25          | < 0.64       |
| 6~10 Gbps   | < 12          | < 0.30       |
| > 10 Gbps   | < 6           | < 0.15       |

Solutions:
1. Use blind/buried vias (eliminate stub)
2. Back drill (remove excess via barrel)
3. Route via from nearest signal layer directly
```

### 5.3 伴生地过孔

```
Differential pair layer transition must add companion GND vias:

  Trace+ ----*     *---- Trace+
              Via1  Via2    GND Via A
  Trace- ----*     *---- Trace-
              Via3  Via4    GND Via B
                               |
                          GND plane

Rules:
1. Place 1~2 GND vias next to each pair of signal vias
2. GND via to signal via distance <= 3x via pad diameter
3. GND via provides continuous return path for layer transition
4. Multiple diff pairs can share GND vias (if spacing allows)
```

---

## 6. AC 耦合电容布局

### 6.1 对称放置规则

```
AC coupling caps (0.1uF) must be placed symmetrically:

Correct layout:
  Trace+ --[0.1uF]-- Trace+
  Trace- --[0.1uF]-- Trace-
  Two caps mirrored, equal distance

Incorrect layout:
  Trace+ --[0.1uF]----------- Trace+
  Trace- --------[0.1uF]---- Trace-
  (asymmetric, introduces diff length mismatch and impedance discontinuity)

Cap placement rules:
1. Two AC coupling caps must be mirror-symmetric
2. Cap-to-diff-pair connection length must be equal
3. Cap pad width close to trace width (reduce impedance discontinuity)
4. Maintain solid ground plane under caps
5. Place caps close to transmitter (TX side)
```

### 6.2 AC 耦合电容对阻抗的影响

```
Cap pad introduces impedance discontinuity:

Cap pad width typically > trace width, causing local impedance drop.

Impedance discontinuity estimate:
Z_pad = Z0 * W_trace / W_pad  (approximate)

Example:
  Trace width W_trace = 5 mil (100 Ohm)
  0402 cap pad width W_pad = 24 mil
  Z_pad ~ 100 * 5/24 = 20.8 Ohm (extreme case, plane cap modifies actual)

Mitigation measures:
1. Void reference plane under cap pad (increase local impedance)
2. Use smaller cap package (0201 has smaller pad)
3. Reduce pad copper area (use Non-polar pad)
4. Minimize pad length impact zone
```

---

## 7. 差分对布线规则总汇

### 7.1 布线通用规则

| 规则编号 | 规则内容 | 数值要求 |
|---------|---------|---------|
| DP-01 | 差分对两线宽度一致 | W+ = W- (0 mil 偏差) |
| DP-02 | 差分对两线间距一致 | S 全程不变 |
| DP-03 | 差分对长度匹配 | 按标准要求（见 4.1 节） |
| DP-04 | 差分对过孔对称 | 每条线过孔数量和位置对称 |
| DP-05 | 差分对下方地平面完整 | 无分割、无缝隙 |
| DP-06 | 换层时添加伴生 GND 过孔 | 1~2 个 GND 过孔 |
| DP-07 | AC 耦合电容对称放置 | 镜像布局 |
| DP-08 | 蛇形补偿间距 >= 3W | 避免自串扰 |
| DP-09 | 非耦合段长度 | < 150 mil |
| DP-10 | 过孔残桩长度 | 按速率限制（见 5.2 节） |
| DP-11 | 差分对不跨越地平面分割 | 0 例外 |
| DP-12 | 差分对远离干扰源 | >= 5W 或 >= 30mil |

### 7.2 差分对与其他信号间距

```
Recommended spacing between diff pairs and other signals:

| Adjacent Signal Type    | Min Spacing | Notes                    |
|------------------------|-------------|--------------------------|
| Other diff pairs       | 5W or S     | avoid inter-pair crosstalk|
| Single-ended high-speed| 5W          | clock, reset, etc.       |
| Single-ended low-speed | 3W          | GPIO, control signals    |
| Power traces           | 20mil       | reduce power noise coupling|
| Crystal/clock          | 30mil       | avoid clock harmonic interference|
| Connector pads         | 15mil       | relax in connector area  |

Note: W in spacing rules = diff pair single trace width.
```

---

## 8. Altium Designer 差分对设计规则

### 8.1 差分对定义与规则设置

```
Altium Designer differential pair design flow:

Step 1: Define differential pair nets
  Design -> Differential Pairs -> Configure
  - Add diff pair: e.g. USB_DP / USB_DN
  - Or use net naming convention: *_P/*_N or *_+/*_-

Step 2: Create differential pair classes
  Design -> Classes -> Differential Pair Classes
  - Create "USB_DiffPair" class
  - Create "PCIe_DiffPair" class
  - Add corresponding diff pairs to each class

Step 3: Set diff pair routing rules
  Design -> Rules -> Routing -> Differential Pairs Routing

  Rule "USB_DiffPair_Routing":
  - Where: InDifferentialPairClass('USB_DiffPair')
  - Min Width: 5mil, Preferred: 7mil, Max: 8mil
  - Min Gap: 5mil, Preferred: 7mil, Max: 8mil
  - Min Spacing: 5mil

  Rule "PCIe_DiffPair_Routing":
  - Where: InDifferentialPairClass('PCIe_DiffPair')
  - Min Width: 4mil, Preferred: 5mil, Max: 6mil
  - Min Gap: 6mil, Preferred: 8mil, Max: 10mil
```

### 8.2 等长匹配规则设置

```
Altium length matching setup:

Step 1: Set length matching rule
  Design -> Rules -> Routing -> Length
  - Create rule "DiffPair_Length_Match"
  - Where: InDifferentialPairClass('PCIe_DiffPair')
  - Total Length: Min/Max per standard

Step 2: Use Interactive Length Tuning
  Route -> Interactive Differential Pair Length Tuning
  - Select diff pair to compensate
  - Set target length (match to longer trace)
  - Set serpentine parameters:
    * Amplitude: >= 3W
    * Gap: >= 3W
    * Style: Rounded (recommended)

Step 3: Use Matched Length rule
  Design -> Rules -> High Speed -> Matched Net Lengths
  - Create rule "DiffPair_MatchedLength"
  - Where: InDifferentialPairClass('PCIe_DiffPair')
  - Tolerance: 1mil (PCIe Gen3)
```

### 8.3 差分对 DRC 检查

```
Altium DRC differential pair checks:

1. Un-Routed Net: check diff pairs fully routed
2. Differential Pairs Routing: check width/gap
3. Matched Length: check length matching
4. Clearance: check spacing to other objects
5. Hole Size / Via Size: check via dimensions

Key DRC report items to watch:
- Differential Pair Gap Violation
- Differential Pair Length Mismatch
- Differential Pair Uncoupled Length
```

---

## 9. 设计审查清单

| 检查项 | 检查标准 | 优先级 |
|--------|---------|--------|
| DP-CHK-01 | 差分阻抗是否匹配目标值（90/100/85 Ohm） | 高 |
| DP-CHK-02 | 对内长度偏差是否满足标准要求 | 高 |
| DP-CHK-03 | 两线宽度和间距是否全程一致 | 高 |
| DP-CHK-04 | 过孔是否对称放置 | 高 |
| DP-CHK-05 | 换层时是否有伴生 GND 过孔 | 高 |
| DP-CHK-06 | AC 耦合电容是否对称放置 | 中 |
| DP-CHK-07 | 差分对下方地平面是否完整 | 高 |
| DP-CHK-08 | 非耦合段长度是否 < 150mil | 中 |
| DP-CHK-09 | 过孔残桩是否满足速率限制 | 高 |
| DP-CHK-10 | 蛇形补偿间距是否 >= 3W | 中 |
| DP-CHK-11 | 差分对是否跨越地平面分割 | 高 |
| DP-CHK-12 | 与其他信号间距是否满足要求 | 中 |

---

## 版本记录

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-08-21 | 初始版本：差分阻抗/耦合规则/长度匹配/过孔对称/AC耦合/Altium规则 | AI Knowledge Base |
