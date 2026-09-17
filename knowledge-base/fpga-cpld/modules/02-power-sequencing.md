# FPGA 电源序列设计

> 适用范围：Xilinx/Altera FPGA 电源上电序列与监控
> 版本：v1.0 | 更新日期：2026-09

---

## 1. 电源序列要求

### 1.1 Xilinx 7系列

```
推荐上电序列:
  VCCINT (1.0V) → VCCBRAM (1.0V) → VCCAUX (1.8V) → VCCO (1.8V~3.3V)

  最小要求:
  1. VCCINT 和 VCCBRAM 可同时上电
  2. VCCAUX 必须在 VCCO 之前或同时
  3. VCCINT 必须在 50ms 内达到稳定
  4. 所有电源必须在 100ms 内达到稳定

  断电序列:
  逆序: VCCO → VCCAUX → VCCBRAM → VCCINT

  时序图:
    VCCINT ────────/ ────\
    VCCBRAM ────────/ ───\
    VCCAUX ───────────/ ─\
    VCCO ───────────────/ ────
    t
```

### 1.2 Xilinx UltraScale+

```
推荐上电序列:
  VCCINT (0.85V) → VCCAUX (1.8V) → VCCO (1.2V~3.3V) → VCCINT_IO (0.85V)

  关键: VCCINT_IO 必须最后上电
```

### 1.3 Altera Cyclone 10

```
推荐上电序列:
  VCC (0.9V) → VCCIO (1.2V~3.3V) → VCCPGM (1.8V~3.3V) → VCCPD (3.3V)

  最小要求:
  1. VCC 必须在 100ms 内稳定
  2. VCCIO 可在 VCC 之前或之后
  3. 所有电源必须同时或按序到达
```

---

## 2. 电源序列实现

### 2.1 方案 A: LDO + 延迟电容

```
方案: 多个LDO, 用RC延迟控制EN

  VIN ─┬─ LDO1 (VCCINT) ──┬── EN1
       │                  └── RC 延迟 (0ms, 立即)
       ├─ LDO2 (VCCAUX) ──┬── EN2
       │                  └── RC 延迟 (10ms)
       └─ LDO3 (VCCO) ────┬── EN3
                          └── RC 延迟 (20ms)

优点: 简单, 低成本
缺点: 精度差, 受温度影响
适用: 低端 FPGA (Spartan-7)
```

### 2.2 方案 B: 专用电源序列IC

```
推荐IC:
  - TI: TPS3899 (4通道监控)
  - TI: TPS65011 (PMIC, 集成DC-DC)
  - Xilinx:专为FPGA设计的电源管理IC
  
  TPS65011 (集成方案):
    输入: 5V
    输出1: DC-DC Buck 1.0V (VCCINT)
    输出2: DC-DC Buck 1.8V (VCCAUX)
    输出3: LDO 3.3V (VCCO)
    输出4: LDO 1.2V (辅助)
    内置序列控制 + PG (Power Good) 信号

优点: 高精度, 集成化, 带PG监控
缺点: 成本较高
适用: 中高端 FPGA (Artix-7/Kintex-7)
```

### 2.3 方案 C: 外部电源监控 + MOSFET 开关

```
方案: 使用电压监控IC + MOSFET实现精确序列

  VIN → DC-DC → VCCINT ─────────────┐
                    │                 │
                 监控IC ──PG──┐       │
                 (TPS3899)    │       │
              达到阈值后      │       │
              触发下一路     MOSFET → VCCAUX
                              开关
                              延迟 → VCCO

优点: 精度高, 可编程延迟
缺点: 占面积
适用: UltraScale+ 等要求严格的FPGA
```

---

## 3. 电源监控

### 3.1 上电复位 (POR)

```
FPGA 内置 POR 监控:
  - 监控 VCCINT 和 VCCAUX
  - 两个电源都达到阈值后释放 /INIT_B
  - 配置电路开始工作

  /INIT_B 信号:
    低: FPGA 还未准备好 (电源未稳定)
    高: FPGA 准备好, 开始配置

  外部使用:
    /INIT_B → 控制外部复位/指示LED
    /INIT_B 低电平时不要给IO供电 (避免闩锁)
```

### 3.2 电源监控IC

| IC | 功能 | 通道 | 阈值 | 典型应用 |
|----|------|------|------|----------|
| TPS3899 | 电压监控 + 延迟 | 1 | 可调 | VCCINT监控 |
| TPS3828 | 复位IC | 1 | 固定 | VCCO监控 |
| MAX16056 | 多通道监控 | 4/6 | 可调 | 全电源监控 |
| LTC2924 | 电源序列控制 | 4 | 可调 | 序列+监控 |

### 3.3 Power Good 信号链

```
PG 信号链:
  LDO1_PG ──┐
             │
  LDO2_PG ──┼─── AND ── ALL_PG ── LED/中断/复位
             │
  LDO3_PG ──┘

  ALL_PG = 1 时: 所有电源正常
  ALL_PG = 0 时: 至少一路异常, FPGA 不应工作

  建议: ALL_PG → MCU 中断 → 软件处理异常
```

---

## 4. 推荐电源方案

### 4.1 Xilinx Artix-7 XC7A35T

| 电源域 | 电压 | 电流 | 方案 | 推荐IC |
|--------|------|------|------|--------|
| VCCINT | 1.0V | 0.8A | Buck | TPS56221 (3×3mm) |
| VCCAUX | 1.8V | 50mA | LDO | TLV70218 |
| VCCO_0 | 3.3V | 200mA | LDO | TLV70233 |
| VCCO_34 | 3.3V | 200mA | 共用VCCO_0 | - |

### 4.2 Xilinx Kintex-7 XC7K70T

| 电源域 | 电压 | 电流 | 方案 | 推荐IC |
|--------|------|------|------|--------|
| VCCINT | 1.0V | 2A | Buck | TPS54620 |
| VCCBRAM | 1.0V | 50mA | LDO | TLV70210 |
| VCCAUX | 1.8V | 100mA | LDO | TLV70218 |
| VCCO_0 | 3.3V | 300mA | Buck | TPS62133 |
| VCCO_14 | 1.8V | 200mA | LDO | TLV70218 |
| VCCINT_IO | 1.0V | 100mA | LDO | TLV70210 |
