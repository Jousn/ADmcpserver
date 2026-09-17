# 电路设计审查 Agent

> 功能：对已完成的原理图进行多维度自动审查，输出结构化审查报告和修复建议
> 版本：v1.0 | 更新日期：2026-09

---

## 1. Agent 工作流程

```
原理图已完成
    │
    ▼
┌──────────────────────┐
│ Step 1: 数据采集      │  get_schematic_data(全桶导出) + compile_project
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Step 2: 机器审计      │  check_connectivity → 错误/悬空/短路
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Step 3: 规则审查      │  对照知识库规则逐项检查
│   - 信号流            │  search_knowledge_base("schematic-design")
│   - 布局质量          │  analyze_schematic_quality
│   - 命名规范           │
│   - 电源/接地          │
│   - 去耦              │
│   - 保护              │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Step 4: 器件审查      │  search_knowledge_base("component-selection")
│   - 参数降额           │
│   - 封装合理性          │
│   - BOM 归一化          │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Step 5: 报告生成      │  结构化审查报告 + 优先级排序 + 修复建议
└──────────────────────┘
```

---

## 2. 审查维度与检查项

### 2.1 电气连通性（Critical - 必须通过）

| 检查项 | 工具 | 通过标准 | 修复建议 |
|--------|------|----------|----------|
| 编译无错误 | compile_project | errors=0 | 逐条修复 |
| 连通性无悬空 | check_connectivity | pins_floating=0 | 连接或标 NC |
| 无短路 | check_connectivity | SHORT=0 | 检查网络重名/错连 |
| 单端网络 | check_connectivity | 单连接网络=0 | 检查遗漏连接 |
| 位号唯一 | get_all_designators | 无重复 | 重编位号 |
| 电源网络完整 | get_all_nets | 每轨有源+负载 | 添加电源符号 |

### 2.2 信号流与布局（High）

| 检查项 | 规则来源 | 检查方法 |
|--------|----------|----------|
| 左到右信号流 | schematic-design/01 | 人工/规则引擎判断主信号方向 |
| 电压上高下低 | schematic-design/01 | 电源符号位置 vs 地符号位置 |
| 功能分块 | schematic-design/01 | 元件分组 vs 功能分组 |
| 反馈用标签 | schematic-design/03 | 反馈路径检查是否有长线回穿 |
| 去耦在IC旁 | schematic-design/05 | 去耦电容位置 vs IC位置 |

### 2.3 布局质量（Medium-High）

| 检查项 | 工具 | 评分标准 |
|--------|------|----------|
| 交叉数 | analyze_schematic_quality | 目标=0 |
| 绕行系数 | analyze_schematic_quality | detour_ratio <1.5 |
| 弯曲数 | analyze_schematic_quality | 弯曲越少越好 |
| 障碍穿越 | analyze_schematic_quality | obstacle_hits=0 |
| 旋转建议 | analyze_schematic_quality | 有可改善旋转时提示 |

### 2.4 命名规范（Medium）

| 检查项 | 规则来源 | 合格标准 |
|--------|----------|----------|
| 位号顺序 | schematic-design/04 | 从左到右递增 |
| 网络名描述性 | schematic-design/04 | 无 NET1/WIRE5 |
| 电源标明电压 | schematic-design/04 | 无模糊 VCC |
| 低有效统一 | schematic-design/04 | 全图一种写法 |
| 参数直写 | schematic-design/04 | 无 102/105 数码 |
| 极性标记 | schematic-design/04 | 有极性元件有标记 |

### 2.5 电源与接地（High）

| 检查项 | 规则来源 | 检查方法 |
|--------|----------|----------|
| 每 IC 有去耦 | design-rules/01 | 逐 IC 检查电源引脚旁电容 |
| 模拟数字分地 | design-rules/02 | AGND/DGND 是否分开 |
| 单点连接 | design-rules/02 | 分地是否在一点汇聚 |
| 电源树完整 | power-supply/README | 输入→保护→稳压→去耦→负载 |
| 去耦电容值 | design-rules/01 | 100nF + 1~10uF 组合 |

### 2.6 保护电路（Medium）

| 检查项 | 规则来源 | 检查方法 |
|--------|----------|----------|
| 电源输入有保险丝 | component-selection/09 | 输入端保险丝存在 |
| TVS 保护 | component-selection/07 | 敏感接口有 TVS |
| 防反接 | classic-circuits/11,12 | 输入端有防反设计 |
| ESD 保护 | component-selection/07 | 外部接口有 ESD 阵列 |

### 2.7 器件选型降额（Medium）

| 检查项 | 规则来源 | 合格标准 |
|--------|----------|----------|
| 电容耐压降额 | component-selection/02 | 工作电压 <80% 额定 |
| 电阻功率降额 | component-selection/05 | 工作功率 <70% 额定 |
| MOSFET 降额 | component-selection/03 | Vds <70%, Id <70% |
| 二极管降额 | component-selection/07 | Vrrm <80%, If <70% |
| 电感饱和 | component-selection/06 | Isat >1.3×峰值 |

### 2.8 可制造性（Low-Medium）

| 检查项 | 规则来源 | 合格标准 |
|--------|----------|----------|
| BOM 归一化 | schematic-design/04 | 相似规格合并 |
| 封装一致性 | component-selection/04 | 同类封装统一 |
| 测试点 | schematic-design/07 | QFP/BGA 引脚有测试点 |
| 可维修性 | schematic-design/04 | 关键链路有 0Ω 隔离 |
| 预留扩展 | schematic-design/04 | 预留 IO/电路 |

---

## 3. 审查报告格式

```
# 原理图审查报告

## 审查概况
- 项目: <项目名>
- 日期: <日期>
- 审查版本: <版本号>
- 总检查项: XX
- 通过: XX | 警告: XX | 失败: XX

## Critical 级问题 (必须修复)
1. [电气] 网络NET3 悬空引脚 U1.5
   → 修复: 连接 U1.5 到 GND 或标记 NC
2. [电气] 网络VCC 和 +5V 重名冲突
   → 修复: 统一为 +5V

## High 级问题 (建议修复)
1. [布局] 去耦电容C5 未在 U2 旁边
   → 修复: 将C5 移至 U2 VDD 引脚旁
2. [命名] 网络名 NET1 无意义
   → 修复: 重命名为 SPI_MOSI

## Medium 级问题 (改善建议)
1. [选型] R3(4.7k) 和 R4(10k) 可合并为 10k
   → 建议: 如不影响功能，统一为 10k
2. [布局] J1 引脚朝向远离电路
   → 建议: 旋转180°

## 通过项统计
- [✓] 编译无错误
- [✓] 信号流左到右
- [✓] 每 IC 有去耦电容
- [✓] 位号顺序递增
...
```

---

## 4. 优先级排序

| 优先级 | 维度 | 说明 |
|--------|------|------|
| P0 Critical | 电气连通性 | 不修复则不可交付 |
| P1 High | 信号流/布局/电源 | 影响可读性和可靠性 |
| P2 Medium | 命名/选型/保护 | 影响可维护性和制造 |
| P3 Low | 归一化/预留/测试点 | 优化建议 |
