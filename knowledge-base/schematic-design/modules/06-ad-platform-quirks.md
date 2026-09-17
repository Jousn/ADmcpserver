# AD 平台实测特性（AD Platform Quirks）

> 适用范围：经 altium-mcp 在 AD22 实机验证的平台行为——AI 排查位置异常、选择放置策略时必读
> 目标受众：AI 绘图助手（工具使用层知识）
> 版本：v1.0 | 更新日期：2026-09 | 全部条目经实机复现

---

## 1. 旋转绕偏心原点（最重要）

- AD 旋转元件绕 **Location 原点**转动；绝大多数符号原点不在几何中心（如 Res1 原点悬在符号外）
- 后果：转 90° 后符号体大幅甩位；按"原点在中心"直觉算的坐标全部失效
- **解法：锚点引脚放置**。`place_component(anchor_pin="1", x, y, rotation_deg)` 让指定引脚热点精确落在 (x,y)，原点甩到哪里由工具内部反解（库引脚表 + 实测标定的 CCW 旋转矩阵 + 放置后回读纠偏）
- 布局永远表达"引脚落点"，不表达"原点位置"

## 2. 引脚热点（Hotspot）

- 引脚的电气连接点 = **自由端**（Pin.Location + PinLength 沿朝向延长），不是根部
- 朝向语义（eRotate0/90/180/270 = +X/+Y/−X/−Y，CCW）
- 导线必须落在热点上才导通；wire_pins 自动取热点，手工画线要先用 get_component_info 查热点坐标

## 3. 导出包围盒不可信（B30）

- `Component.BoundingRectangle` 对**旋转过的符号**返回错误矩形（实测：R1 rot270 的包围盒不含自己的引脚热点）
- 禁止用导出包围盒做避让/碰撞计算；正确做法：**实测引脚热点 ∪ 原点凸包**
- wire_pins / instantiate_module 已内置此逻辑

## 4. 位号自动摆位

- place_component 后 Altium 自动放置位号/Comment 文本，位置不可直接控制
- 密集区可能压线——规划时按"元件两侧各留 100mil 文本区"预算间距
- （待实现：designator 文本重定位工具）

## 5. 网格与吸附

- 原理图坐标系 **Y 轴向上**（数值增大 = 屏幕上方）——换算屏幕印象时注意翻转
- 100 mil 网格为放置/走线基准；add_wire 端点吸附容差 20 mil（可配，最大 50）
- 电源端口吸附容差 25 mil，会自动吸到最近引脚热点并回报实际落点
- 坐标读数受系统区域设置影响（小数点/千分位），工具内部已做 locale 归一

## 6. 结点与交叉语义

- T 接（导线端点落在另一导线中段）：**必须加结点才连通**
- 纯 X 交叉（两导线互穿）：不连通——无需结点，加了反而错误
- wire_pins 自动判定并放结点；手工 draw_plan 的 junctions_csv 必须显式列出每个 T 接

## 7. 工程/文档解析

- 图纸可能同时开在 Free Documents 和真实工程里：Free Documents 编译时物理文档数为 0（空 DM 层）——所有调用必须带 project_full_path，解析优先级：指定工程 > 任意 .PrjPcb > Free Documents
- 脚本工程（PrjScr）每次 RunScript 整体编译——**任何单元一处语法错误会让所有命令超时**（弹模态错误框）；排查：先 ping，ping 超时 = 工程级编译失败

## 8. 库枚举

- 库文档用普通迭代器只能枚举"当前编辑元件"，必须用 SchLibIterator_Create
- 枚举优先级：工程内库 > 已安装库；search_library_symbol 慢（全库扫描），查具体符号用 get_library_symbol_reference
- 引脚长度属性是 `Pin.PinLength`（API 文档写 Length 是笔误）

## 9. 放置与变换

- place_component 走 IntegratedLibrary:PlaceLibraryComponent 进程，符号由库服务器完整实例化（含引脚/封装/参数）
- set_component_transform 的 x/y/rotation 是**绝对值**（不是增量）
- 删除元件：delete_object + object_type=component + designator；线/标签/端口/结点支持 delete_all

## 10. 验证语义

- check_connectivity 的 DM 层是编译器权威数据（引脚的 DM_FlattenedNetName）；'?' = 未连接
- 网络标签必须**锚在导线顶点/线段上**才生效——悬空标签无效（LABEL_NOT_ON_WIRE 警告）
- 编译分区（每网引脚集合）与设计网表逐网比对是最终验收标准，工具成功率 ≠ 电路正确
