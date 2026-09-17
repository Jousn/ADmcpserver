# JTAG 与配置电路

> 适用范围：Xilinx/Altera FPGA JTAG 链、配置模式与 Flash 电路
> 版本：v1.0 | 更新日期：2026-09

---

## 1. 配置模式

### 1.1 Xilinx 7系列配置模式

| 模式 | M[2:0] | 配置源 | 适用 |
|------|--------|--------|------|
| JTAG | XXX | JTAG TDI | 调试/开发 |
| Master BPI | 0b001 | 并行 NOR Flash | 独立启动 |
| Master SPI | 0b010 | 串行 SPI Flash | 独立启动 |
| Master SelectMAP | 0b011 | 并行数据 | 高速加载 |
| Slave SelectMAP | 0b100 | 外部主机 | MCU控制 |
| Slave Serial | 0b110 | 外部串行 | MCU控制 |
| JTAG only | 0b111 | 仅JTAG | 调试专用 |

### 1.2 配置引脚

```
Xilinx 7系列配置引脚:
  ┌──────────────────────┐
  │ FPGA                 │
  │                      │
  │  M[2:0]     ←── 配置模式选择 (上拉/下拉)
  │  /INIT_B   ──→ 初始化状态 (低=未就绪)
  │  DONE      ──→ 配置完成 (高=完成)
  │  /PROGRAM_B ←── 重新配置触发
  │  CCLK      ←── 时钟 (Master=输出, Slave=输入)
  │  /CS       ←── Flash 片选 (Master)
  │  DOUT      ──→ 串行输出 (菊花链)
  │  DIN       ←── 串行输入 (Slave)
  │  D[7:0]    ←→ 并行数据 (SelectMAP)
  │                      │
  │  TCK/TMS/TDI/TDO     │ ←── JTAG
  └──────────────────────┘
```

---

## 2. JTAG 链设计

### 2.1 基本 JTAG

```
JTAG 链 (单器件):
  TDI → FPGA.TDI
  TDO ← FPGA.TDO
  TCK → FPGA.TCK
  TMS → FPGA.TMS

JTAG 链 (多器件菊花链):
  TDI → IC1.TDI
  IC1.TDO → IC2.TDI
  IC2.TDO → IC3.TDI
  IC3.TDO ← TDO
  TCK → 所有 IC.TCK (并联)
  TMS → 所有 IC.TMS (并联)
```

### 2.2 JTAG 信号处理

| 信号 | 上拉/下拉 | 原因 |
|------|-----------|------|
| TCK | 100Ω 串阻 + 10k 下拉 | 防止悬空振荡 |
| TDI | 10k 上拉 | 防止悬空 |
| TDO | 无 | 源端输出 |
| TMS | 10k 上拉 | 防止意外进入测试模式 |

```
JTAG 连接器 (标准 2×7, 2.54mm):
  ┌─────────────┐
  │ 1  GND  2  │
  │ 3  NC   4  │
  │ 5  TDI  6  │
  │ 7  NC   8  │
  │ 9  TCK  10 │
  │ 11 NC   12 │
  │ 13 TDO 14 │
  └─────────────┘
  标准JTAG Header (ARM 10-pin 或 14-pin)
```

---

## 3. SPI Flash 配置

### 3.1 SPI Flash 电路

```
Master SPI 配置:
  FPGA ──CCLK──→ Flash.SCK
  FPGA ──/CS───→ Flash./CS
  FPGA ←─DOUT── Flash.DO  (MISO)
  FPGA ──DIN──→ Flash.DI  (MOSI)
  FPGA ──/HOLD→ Flash./HOLD (可选)
  FPGA ──/WP──→ Flash./WP   (可选)

  VCC ──10k── /CS (上拉, 防止未配置时误读)
  VCC ──10k── /HOLD
  VCC ──10k── /WP
```

### 3.2 Flash 选型

| Flash 容量 | 适用 FPGA | 推荐型号 | 读取速度 |
|-----------|----------|----------|----------|
| 8Mbit(1MB) | Spartan-7/Spartan-6 | W25Q80 | 104MHz |
| 16Mbit(2MB) | Artix-7 (小) | W25Q16 | 104MHz |
| 32Mbit(4MB) | Artix-7 | W25Q32 | 104MHz |
| 64Mbit(8MB) | Kintex-7 | W25Q64 | 133MHz |
| 128Mbit(16MB) | Kintex-7/UltraScale | W25Q128 | 133MHz |
| 256Mbit(32MB) | UltraScale+ | MT25QU256 | 166MHz |

---

## 4. BPI Flash 配置

```
Master BPI (并行 NOR Flash):
  FPGA ──A[25:0]──→ Flash.A[25:0] (地址)
  FPGA ←─D[15:0]── Flash.D[15:0] (数据)
  FPGA ──/CS─────→ Flash./CE     (片选)
  FPGA ──/OE─────→ Flash./OE     (输出使能)
  FPGA ──/WAIT───← Flash./WAIT   (可选, 慢速Flash)
  FPGA ──CCLK────→ (内部使用)

  优点: 读取速度快 (并行16位)
  缺点: 引脚多, 布线复杂
  适用: 大容量FPGA, 快速启动需求
```

---

## 5. 配置时序

```
配置时序:

1. 上电:
   VCCINT/VCCAUX 稳定 → POR 释放

2. /INIT_B 拉低 (FPGA主动):
   - 内部清除配置存储器
   - 持续时间: ~10ms~100ms (取决于FPGA大小)

3. /INIT_B 释放 (高):
   - FPGA准备好接收配置数据
   - 读取 M[2:0] 确定模式

4. 配置数据加载:
   - Master模式: FPGA主动从Flash读取
   - Slave模式: 外部MCU通过DIN/CCLK写入
   - 速度: CCLK 频率决定 (最高~100MHz)

5. CRC校验:
   - 加载完成后自动CRC校验
   - 失败: /INIT_B 拉低, DONE 保持低
   - 成功: 进入启动序列

6. DONE 拉高:
   - 配置完成
   - IO开始工作
   - /GLOBAL_WRITE_DONE 释放 (内部)

7. 启动序列:
   - 释放全局三态 (GTS)
   - 释放全局复位 (GSR)
   - 释放全局写使能 (GWE)
   - FPGA进入用户模式
```

---

## 6. 多 FPGA 菊花链

```
多FPGA菊花链配置 (Slave Serial):
  Flash/MCU ──DIN──→ FPGA1.DIN
                   FPGA1.DOUT ──→ FPGA2.DIN
                                  FPGA2.DOUT ──→ FPGA3.DIN
                                                 FPGA3.DOUT → 悬空
  CCLK → 所有FPGA.CCLK (并联)
  /INIT_B ← 所有FPGA./INIT_B (线与, 开漏)
  DONE ← 所有FPGA.DONE (线与, 开漏)

  特点: 一个Flash配置多个FPGA
  要求: 总配置文件 = Σ(各FPGA配置大小)
  顺序: 链上最后一个FPGA的配置数据在最前面
```
