# Altium MCP 工具测试提示词

> 在 OpenCode / TRAE / Claude Desktop 中逐条发送以下提示词进行测试。
> 确保 Altium Designer 已打开目标工程和文件。
> 标注 \[前置] 的步骤需要先完成前面的测试。
> 标注 \[知识库] 的步骤测试向量知识库检索功能。
> 标注 \[增强] 的步骤测试本次新增的增强功能。
> 标注 \[新增] 的步骤为本次补充的测试用例。

***

## 一、系统与配置 (4 tools)

### 1. get\_server\_status

```
检查 MCP 服务器和 Altium 桥接的状态，确认所有路径配置正确。
```

### 2. configure\_altium\_exe

```
配置 Altium 可执行文件路径为 C:\Program Files\Altium\AD22\X2.EXE
```

### 3. altium\_ping

```
测试 Altium DelphiScript 桥接是否正常响应。
```

### 4. file\_mode\_capabilities

```
查询当前文件模式支持的能力列表。
```

***

## 二、知识库与向量检索 (2 tools)

### 5. get\_knowledge\_base\_stats

```
查询知识库索引的统计信息，确认索引已构建。
```

### 6. search\_knowledge\_base - 电源设计

```
[知识库] 搜索知识库中关于 LDO 线性稳压电路设计的内容，限制在 classic-circuits 类别，返回 3 条最相关的结果。
```

### 7. search\_knowledge\_base - 去耦规则

```
[知识库] 搜索知识库中关于去耦电容布局规则的内容，限制在 design-rules 类别，返回 3 条最相关的结果。
```

### 8. search\_knowledge\_base - DRC 模板

```
[知识库] 搜索知识库中关于高速数字电路 DRC 规则模板的内容，限制在 drc-templates 类别，返回 3 条最相关的结果。
```

### 9. search\_knowledge\_base - 元件选型

```
[知识库] 搜索知识库中关于运放选型的内容，不限制类别，返回 5 条最相关的结果。
```

### 10. search\_knowledge\_base - 中文查询

```
[知识库] 搜索知识库中关于差分对走线阻抗匹配的内容，不限制类别，返回 3 条最相关的结果。
```

***

## 三、项目与文档管理 (5 tools)

### 11. get\_workspace\_projects

```
列出当前 Altium 工作区中的所有项目。
```

### 12. open\_document - 打开 PCB

```
打开 PCB 文件，文件路径为当前项目中的 .PcbDoc 文件。
```

### 13. open\_document - 打开原理图

```
打开原理图文件，文件路径为当前项目中的 .SchDoc 文件。
```

***

## 四、PCB 读取 (8 tools)

### 14. get\_all\_designators

```
获取当前 PCB 板上所有元件的位号列表。
```

### 17. get\_all\_nets

```
获取当前 PCB 板上所有网络的列表。
```

### 18. get\_component\_pins - 完整焊盘属性

```
[前置] 使用 get_all_designators 获取第一个元件位号，然后查询该元件的所有引脚信息。验证返回结果包含以下完整焊盘属性：
- name, net, x, y, rotation, layer
- mode (ePadMode_Simple/ePadMode_LocalExternal/ePadMode_External)
- 三层尺寸: top_x_size_mils, top_y_size_mils, mid_x_size_mils, mid_y_size_mils, bot_x_size_mils, bot_y_size_mils
- 三层形状: top_shape, mid_shape, bot_shape (eRounded/eRectangular/eOctagonal/eCircleShape/eArc)
- 孔信息: hole_size_mils, plated, drill_type, hole_type
- 阻焊覆盖: is_tenting, is_tenting_top, is_tenting_bottom
- 测试点: is_testpoint_top, is_testpoint_bottom, is_assy_testpoint_top, is_assy_testpoint_bottom
- 阻焊/钢网扩展: solder_mask_expansion_mils, paste_mask_expansion_mils
- 平面连接: power_plane_connect_style, relief_conductor_width_mils, relief_entries, relief_air_gap_mils, power_plane_clearance_mils, power_plane_relief_expansion_mils
- pin_package_length_mils, unique_id
```

### 19. get\_selected\_components

```
获取当前 PCB 中已选中元件的坐标和属性信息。
```

### 20. get\_pcb\_layers

```
获取当前 PCB 的所有层信息。
```

### 21. get\_pcb\_layer\_stackup

```
获取当前 PCB 的层叠结构信息。
```

### 22. get\_pcb\_rules

```
获取当前 PCB 的设计规则列表。
```

### 23. pcb\_board\_info - 增强对象计数

```
获取当前 PCB 的板框信息。验证返回结果包含：
- 基本尺寸: left_mils, bottom_mils, right_mils, top_mils, width_mils, height_mils, area_sq_mils
- 对象计数: component_count, pad_count, via_count, track_count, arc_count, fill_count, text_count, polygon_count, region_count, connection_count
- 层数: layer_count
- 轮廓点列表: outline_points[] (含 kind=line/arc)
```

***

## 五、PCB 写入 - 基础操作 (8 tools)

### 24. set\_component\_position

```
[前置] 使用 get_all_designators 获取第一个元件位号，将其移动到坐标 X=5000 mils, Y=5000 mils 的位置。注意坐标单位是 mils，不是 mils*10000。
```

### 25. move\_components

```
[前置] 使用 get_all_designators 获取前两个元件位号，将它们相对移动 X 偏移 100 mils, Y 偏移 0 mils。
```

### 26. create\_net\_class

```
创建一个名为 TEST_CLASS 的网络类，包含 GND 和 VCC 两个网络。如果某个网络不存在会自动跳过。
```

### 27. set\_pcb\_layer\_visibility - 隐藏层

```
隐藏 Top Overlay 和 Bottom Overlay 层。注意：只隐藏这两层，不影响其他层的可见性。
```

### 28. set\_pcb\_layer\_visibility - 显示层

```
[前置] 接上一步，重新显示 Top Overlay 和 Bottom Overlay 层。注意：只显示这两层，不隐藏其他层。
```

### 29. pcb\_edit - add\_track

```
在 PCB 上添加一条走线：起点 (1000, 1000) mils，终点 (2000, 1000) mils，宽度 10 mils，层为 Top Layer。
```

### 30. pcb\_edit - add\_pad

```
在 PCB 上添加一个焊盘：坐标 (3000, 3000) mils，宽度 60 mils，高度 60 mils，孔径 0 mils，层为 Top Layer，名称 P1。
```

### 31. pcb\_edit - add\_via

```
在 PCB 上添加一个过孔：坐标 (4000, 4000) mils，外径 50 mils，孔径 20 mils，网络名为 GND。
```

***

## 六、PCB 写入 - 增强操作 \[新增]

### 32. pcb\_edit - add\_fill

```
在 PCB 上添加一个填充区域：左下角 (1000, 2000) mils，右上角 (2000, 3000) mils，层为 Top Layer。
```

### 33. pcb\_edit - add\_arc

```
在 PCB 上添加一个圆弧：圆心 (5000, 5000) mils，半径 500 mils，起始角 0 度，终止角 180 度，宽度 10 mils，层为 Top Layer。
```

### 34. pcb\_edit - add\_text

```
在 PCB 上添加一个文本：坐标 (1000, 1000) mils，内容为 "TEST"，高度 60 mils，层为 Top Overlay。
```

### 35. pcb\_edit - add\_region \[增强]

```
[增强] 在 PCB 上创建一个铜区域，轮廓点为 (0,0), (1000,0), (1000,1000), (0,1000) mils，层为 Top Layer，网络名为 GND。
验证返回结果包含 action=add_region, point_count=4, layer, net。
```

### 36. pcb\_edit - add\_polygon\_pour \[增强]

```
[增强] 在 PCB 上创建一个多边形覆铜，轮廓点为 (0,0), (5000,0), (5000,5000), (0,5000) mils，层为 Top Layer，网络名为 GND，网格 10 mils，轨道尺寸 8 mils，最小轨道宽度 4 mils，填充样式 5 (Solid)，覆铜覆盖同类网络。
验证返回结果包含 action=add_polygon_pour, point_count, layer, net 和覆铜参数。
```

### 37. pcb\_edit - select\_objects

```
选中当前 PCB 上所有走线(track)对象。
```

### 38. pcb\_edit - modify\_track \[增强]

```
[增强] 先选中 PCB 上的一条走线，然后修改该走线的宽度为 20 mils。
验证操作使用了 BeginModify/EndModify 支持 Undo。
```

### 38a. pcb\_edit - add\_track + net\_name + is\_keepout \[新增]

```
[新增] 在 PCB 上添加一条走线：起点 (1100, 1100) mils，终点 (2100, 1100) mils，宽度 10 mils，层为 Top Layer，网络名为 VCC，is_keepout=false，moveable=true，primitive_lock=false。
验证返回结果包含 action=add_track, net=VCC, is_keepout=false, moveable=true, primitive_lock=false。
然后调用 pcb_net_info action=info net_name=VCC，确认该走线已出现在 VCC 网络对象列表中。
参考来源：01_PCB对象与API §3.2 IPCB_Track — Net/IsKeepout + PCBObjectInspector L890+ Moveable/PrimitiveLock。
```

### 38b. pcb\_edit - modify\_track + is\_keepout/moveable/primitive\_lock \[新增]

```
[新增] [前置] 先选中上一步添加的走线，然后修改：is_keepout=true，moveable=false，primitive_lock=true。
验证返回 modified_count >= 1，且 is_keepout=true, moveable=false, primitive_lock=true。
参考来源：IPCB_Primitive 继承属性（Track/ Arc/ Fill/ Region/ Polygon 通用）。
```

### 38c. pcb\_edit - add\_fill + net\_name + is\_keepout \[新增]

```
[新增] 在 PCB 上添加一个填充区域：左下角 (1200, 2200) mils，右上角 (2200, 3200) mils，层为 Top Layer，网络名为 GND，is_keepout=false，moveable=true，primitive_lock=false。
验证返回结果包含 net=GND, is_keepout=false。
然后调用 pcb_net_info action=info net_name=GND，确认该 Fill 出现在 GND 网络中。
参考来源：PCBObjectInspector L980+ — Fill.Net / IsKeepout / Moveable / PrimitiveLock。
```

### 38d. pcb\_edit - modify\_fill + net\_name + flags \[新增]

```
[新增] [前置] 先选中上一步添加的 Fill，然后修改：net_name=VCC，is_keepout=true，moveable=false，primitive_lock=true。
验证返回 modified_count >= 1，且 net=VCC, is_keepout=true, moveable=false, primitive_lock=true。
参考来源：IPCB_Fill.Net + IPCB_Primitive 继承属性。
```

### 38e. pcb\_edit - add\_arc + net\_name + flags \[新增]

```
[新增] 在 PCB 上添加一个圆弧：圆心 (6000, 6000) mils，半径 600 mils，起始角 0 度，终止角 90 度，宽度 10 mils，层为 Top Layer，网络名为 GND，is_keepout=false，moveable=true，primitive_lock=false。
验证返回结果包含 net=GND, is_keepout=false。
参考来源：01_PCB对象与API §3.3 IPCB_Arc — Net + PCBObjectInspector L1279+。
```

### 38f. pcb\_edit - modify\_arc + net\_name + flags \[新增]

```
[新增] [前置] 先选中上一步添加的 Arc，然后修改：radius_mils=800，net_name=VCC，is_keepout=true，moveable=false，primitive_lock=true。
验证返回 modified_count >= 1，且 radius_mils=800, net=VCC, is_keepout=true。
参考来源：IPCB_Arc.Net + IPCB_Primitive 继承属性。
```

### 38g. pcb\_edit - add\_region + kind \[新增]

```
[新增] 在 PCB 上创建一个 Cutout 区域（挖空），轮廓点为 (0,0), (800,0), (800,800), (0,800) mils，层为 Top Layer，kind=cutout，is_keepout=false，moveable=true，primitive_lock=false。
验证返回结果包含 kind=eRegionKind_Cutout, is_keepout=false。
参考来源：01_PCB对象与API §3.8 IPCB_Region — Kind:TRegionKind + 05_枚举与常量参考 §5。
```

### 38h. pcb\_edit - add\_polygon\_pour + 扩展枚举 \[新增]

```
[新增] 在 PCB 上创建一个多边形覆铜，轮廓点为 (0,0), (4000,0), (4000,4000), (0,4000) mils，层为 Bottom Layer，网络名为 GND，grid_mils=10，track_size_mils=8，min_track_mils=4，hatch_style=solid，pour_over=same_net，use_octagons=true，remove_dead=true，is_keepout=false，moveable=true，primitive_lock=false。
验证返回结果包含 hatch_style=5(ePolySolid), pour_over=ePolygonPourOver_SameNet, use_octagons=true, remove_dead=true。
参考来源：01_PCB对象与API §3.7 IPCB_Polygon + 05_枚举 §4 TPolyHatchStyle + PCBObjectInspector L1126+。
```

### 38i. pcb\_edit - modify\_region \[新增]

```
[新增] [前置] 先选中 PCB 上的一个 Region 对象（可使用 select_objects object_type=all 再手动选中），然后修改：kind=copper，is_keepout=true，moveable=false，primitive_lock=true，selected_only=true。
验证返回 action=modify_region, modified_count >= 1, kind=eRegionKind_Copper, is_keepout=true。
参考来源：IPCB_Region.Kind/IsKeepout/Moveable/PrimitiveLock — 01_PCB §3.8 + Inspector L1183+。
```

### 38j. pcb\_edit - modify\_polygon \[新增]

```
[新增] [前置] 先选中 PCB 上的一个 Polygon Pour 对象，然后修改：hatch_style=hatch90 (即 0)，pour_over=none (即 0)，use_octagons=false，remove_dead=false，is_keepout=true，moveable=false，primitive_lock=true，selected_only=true。
验证返回 action=modify_polygon, modified_count >= 1, hatch_style=0, pour_over=ePolygonPourOver_None, use_octagons=false, remove_dead=false。
然后调用 rebuild_polygons 刷新覆铜，再调用 pcb_polygon_info 确认目标多边形的 hatch_style/pour_over 已更新。
参考来源：IPCB_Polygon.PolyHatchStyle/PourOver/UseOctagons/RemoveDead + IPCB_Primitive 继承属性。
```

### 39. pcb\_edit - modify\_pad \[增强]

```
[增强] 先选中 PCB 上的一个焊盘，然后修改该焊盘的宽度为 80 mils，高度为 80 mils。
验证操作使用了 BeginModify/EndModify 支持 Undo。
```

### 40. pcb\_edit - modify\_via \[增强]

```
[增强] 先选中 PCB 上的一个过孔，然后修改该过孔的外径为 60 mils，孔径为 24 mils。
验证操作使用了 BeginModify/EndModify 支持 Undo。
```

### 41. pcb\_edit - modify\_text \[增强]

```
[增强] 先选中 PCB 上的一个文本，然后修改文本内容为 "UPDATED"，高度为 80 mils。
验证操作使用了 BeginModify/EndModify 支持 Undo。
```

### 42. pcb\_edit - move\_to\_layer \[增强]

```
[增强] 先选中 PCB 上的一个走线对象，然后将其移动到 Bottom Layer。
```

### 43. pcb\_edit - assign\_net \[增强]

```
[增强] 先选中 PCB 上的一个走线对象，然后将其网络分配为 VCC。
```

### 44. pcb\_edit - rebuild\_polygons \[增强]

```
[增强] 重建 PCB 上所有多边形覆铜。
```

### 45. pcb\_edit - delete\_objects

```
[前置] 选中当前 PCB 上所有走线(track)对象，然后删除选中的对象。

注意：此操作不可撤销，请确认后执行。
```

***

## 七、PCB 元件操作 - 增强功能 \[新增]

### 46. pcb\_component - rotate

```
[前置] 使用 get_all_designators 获取第一个元件位号，将其旋转到 90 度。
```

### 47. pcb\_component - flip

```
[前置] 使用 get_all_designators 获取第一个元件位号，将其翻转到另一面。
```

### 48. pcb\_component - select

```
[前置] 使用 get_all_designators 获取第一个元件位号，选中该元件。
```

### 49. pcb\_component - get\_properties \[增强]

```
[前置] 使用 get_all_designators 获取第一个元件位号，查询其完整属性信息。验证返回结果包含以下增强字段：
- 基础信息: designator, identifier, pattern, layer, x_mils, y_mils, rotation, height_mils
- 来源信息: source_designator, source_unique_id, source_description, source_lib_reference, source_footprint_library, source_component_library
- 可见性: name_on, comment_on, name_autoposition, comment_autoposition
- 锁定状态: moveable, lock_strings, primitive_lock
- 元件类型: component_kind, is_bga, enable_pin_swapping, enable_part_swapping
- 其他: flipped_on_layer, group_num, channel_offset, unique_id, default_pcb3d_model, footprint_description
- 引脚列表: pin_count, pins[] (包含完整焊盘属性)
```

### 50. pcb\_component - set\_height \[增强]

```
[增强] 使用 get_all_designators 获取第一个元件位号，将其高度设置为 50 mils。
验证返回 success=true, designator, height_mils。
```

### 51. pcb\_component - set\_moveable \[增强]

```
[增强] 使用 get_all_designators 获取第一个元件位号，将其锁定（moveable=false）。
然后再解锁（moveable=true）。验证两次操作都成功。
```

### 52. pcb\_component - set\_name\_visibility \[增强]

```
[增强] 使用 get_all_designators 获取第一个元件位号，隐藏其位号（visible=false），然后重新显示（visible=true）。
验证操作后 PCB 屏幕刷新。
```

### 53. pcb\_component - set\_comment\_visibility \[增强]

```
[增强] 使用 get_all_designators 获取第一个元件位号，显示其注释（visible=true），然后隐藏（visible=false）。
验证操作后 PCB 屏幕刷新。
```

### 54. pcb\_component - set\_autoposition \[增强]

```
[增强] 使用 get_all_designators 获取第一个元件位号，设置位号自动位置为 4 (TopRight)，注释自动位置为 5 (BottomRight)。
验证返回 name_autoposition=eAutoPos_TopRight, comment_autoposition=eAutoPos_BottomRight。
```

### 55. pcb\_component - get\_3d\_bodies \[增强]

```
[增强] 使用 get_all_designators 获取第一个元件位号，查询其 3D 模型体信息。
验证返回 body_count 和 bodies[] (含 index, layer, rotation, identifier, unique_id, moveable, name, standoff_height_mils, overall_height_mils, body_projection, override_color, body_color_3d, body_opacity_3d)。
```

### 56. pcb\_component - set\_lock\_strings \[增强]

```
[增强] 使用 get_all_designators 获取第一个元件位号，锁定其字符串图元（lock_strings=true）。
然后再解锁（lock_strings=false）。验证两次操作都成功。
```

### 56a. pcb\_component - set\_primitive\_lock \[新增]

```
[新增] 使用 get_all_designators 获取第一个元件位号，锁定其所有子图元（primitive_lock=true）。
验证返回 success=true, designator, primitive_lock=true。
然后调用 pcb_component action=get_properties designator=<同一位号>，读回 primitive_lock=true 确认生效。
再设置 primitive_lock=false 解锁，再次 get_properties 读回 primitive_lock=false。
参考来源：01_PCB对象与API §3.1 IPCB_Component.PrimitiveLock + PCBObjectInspector L883。
```

### 56b. pcb\_component - set\_component\_kind \[新增]

```
[新增] 使用 get_all_designators 获取第一个元件位号，设置其类型为 mechanical（机械元件）。
kind=mechanical 或 kind=1 均可。
验证返回 success=true, component_kind=eComponentKind_Mechanical。
然后调用 get_properties 读回 component_kind 确认值为 eComponentKind_Mechanical。
最后恢复为 standard（kind=standard 或 kind=0）。
可选枚举值: standard=0, mechanical=1, graphical=2, net_tie_bom=3, net_tie_nobom=4, standard_nobom=5, jumper=6。
参考来源：01_PCB对象与API §3.1 ComponentKind + 05_枚举与常量参考 §8 TComponentKind + Inspector L851。
```

### 56c. pcb\_component - set\_3d\_body \[新增]

```
[新增] 使用 get_all_designators 获取第一个元件位号，先调用 get_3d_bodies 查询其 3D 模型体列表，获取 body_index（0 基）。
如果 body_count >= 1，选择 body_index=0，修改以下属性（至少一个）：
- standoff_height_mils=10
- overall_height_mils=35
- body_projection=top
- body_color_3d=16777215 (白色)
- body_opacity_3d=80
验证返回 success=true, body_index=0, body_unique_id, 以及修改的各属性回显。
然后再次调用 get_3d_bodies，对比 standoff_height_mils / overall_height_mils / body_projection / body_color_3d / body_opacity_3d 是否已更新。
如果 body_count=0，跳过此测试并记录"元件无 3D 体"。
参考来源：01_PCB对象与API §3.9 IPCB_ComponentBody — StandoffHeight/OverallHeight/BodyProjection/BodyColor3D/BodyOpacity3D + PCBObjectInspector L906-L911。
```

***

## 八、PCB 分析 (3 tools)

### 57. pcb\_drc - 增强违规详情

```
列出当前 PCB 的所有 DRC 违规项。验证每个违规项包含以下增强字段：
- index, description, detail
- identifier (规则名称)
- descriptor (违规类型描述)
- object_id_string
- unique_id
- drc_error
- selected
- layer

提示：先运行 compile_project 刷新违规列表。
```

### 58. pcb\_polygon\_info - 增强覆铜信息

```
列出当前 PCB 上所有铺铜的信息。验证每个多边形包含以下增强字段：
- 基础: index, layer, net, point_count, hatch_style
- 类型: pour_over_type (ePourOver_None/ePourOver_SameNet/ePourOver_All), polygon_type (ePolySignal/ePolyPlane/ePolySplit)
- 尺寸: grid_mils, track_size_mils, min_track_mils
- 属性: pour_over, use_octagons, remove_dead, selected, unique_id
- 包围盒: bbox_left_mils, bbox_bottom_mils, bbox_right_mils, bbox_top_mils
- 顶点列表: segments[] (含 index, x_mils, y_mils, kind=line/arc)
```

### 59. pcb\_net\_info - 增强网络统计

```
查询 GND 网络的详细信息。验证返回结果包含以下增强字段：
- 基础: net_name, item_count, connection_count
- 按类型计数: track_count, arc_count, pad_count, via_count, fill_count, polygon_count, region_count
- 铜长度: total_copper_length_mils (走线+圆弧总长度)
- 对象列表: items[] (含 object_kind, layer, selected)
```

### 60. pcb\_net\_info - select

```
选中 GND 网络上的所有铜对象。
```

***

## 九、原理图操作 (3 tools)

### 61. get\_schematic\_data - 全量

```
获取当前项目中原理图的所有数据，包括元件、导线、网络标签、电源端口、文本等。
```

### 62. get\_schematic\_data - 仅元件

```
获取当前项目中原理图的元件列表。
```

### 63. edit\_schematic - set\_component\_transform

```
[前置] 从原理图中找到第一个元件，将其位置设置为 X=1000 mils, Y=1000 mils，旋转 0 度。
```

### 64. edit\_schematic - add\_text

```
在原理图中添加文本 "TEST_LABEL"，位置 X=500 mils, Y=500 mils。
```

### 65. edit\_schematic - add\_net\_label

```
在原理图中添加网络标签 "TEST_NET"，位置 X=1000 mils, Y=1000 mils。
```

### 66. edit\_schematic - add\_wire

```
在原理图中添加一条导线，路径为 (0,0) -> (1000,0) -> (1000,500) mils。
```

### 67. edit\_schematic - place\_gnd

```
在原理图中放置一个 GND 符号，位置 X=2000 mils, Y=2000 mils。
```

### 68. edit\_schematic - place\_vcc

```
在原理图中放置一个 VCC 符号，位置 X=2000 mils, Y=1000 mils。
```

### 69. edit\_schematic - get\_component\_info

```
[前置] 从原理图中找到第一个元件，查询其完整信息，包括注释、描述、库引用、参数和引脚。
```

### 70. edit\_schematic - add\_port

```
在原理图中添加一个端口，名称为 "DATA_OUT"，位置 X=3000 mils, Y=1000 mils，方向为右（输出）。
```

### 71. edit\_schematic - add\_junction

```
在原理图中添加一个连接点，位置 X=1000 mils, Y=0 mils。
```

### 72. edit\_schematic - add\_line

```
在原理图中添加一条绘图线段，起点 (0, 2000) mils，终点 (2000, 2000) mils。
```

### 73. edit\_schematic - add\_rectangle

```
在原理图中添加一个矩形，左下角 (0, 3000) mils，右上角 (1000, 3500) mils。
```

### 74. edit\_schematic - set\_component\_parameters \[新增]

```
[新增] [前置] 从原理图中找到第一个元件，修改其参数：添加参数 "Tolerance" 值为 "1%"，修改参数 "Value" 值为 "10k"。
验证返回结果包含 designator 和修改后的参数列表。
```

### 75. edit\_schematic - place\_component \[新增]

```
[新增] 在原理图中放置一个元件，库引用名为 "Resistor"，位号为 R99，位置 X=2000 mils, Y=3000 mils，旋转 90 度。
验证返回 success=false, error=PLACE_COMPONENT_NOT_SUPPORTED。
注意：DelphiScript 没有 PlaceSchComponent API，无法通过脚本从库中放置元件。请使用 Altium UI (Place > Part) 操作。
```

### 76. edit\_schematic - add\_bus \[新增]

```
[新增] 在原理图中添加一条总线，路径为 (0,4000) -> (2000,4000) -> (2000,5000) mils。
```

### 77. edit\_schematic - add\_bus\_entry \[新增]

```
[新增] 在原理图中添加一个总线入口，起点 (1000, 4000) mils，终点 (1000, 3500) mils。
```

### 78. edit\_schematic - place\_power\_port \[新增]

```
[新增] 在原理图中放置一个电源端口，样式为 bar（条形），网络名为 +3V3，位置 X=3000 mils, Y=2000 mils，旋转 90 度。
验证返回结果包含 action=place_power_port, net_name, style。
```

***

## 十、库操作 (4 tools)

### 79. search\_library\_symbol

```
搜索当前项目中所有 .SchLib 文件中名称包含 "Resistor" 的原理图符号。如果不提供 library_path，会自动遍历焦点项目中的 .SchLib 文件。
```

### 80. get\_library\_symbol\_reference

```
获取当前项目中所有元件的库符号引用信息。会自动检查已打开的 .SchLib 或遍历焦点项目中的 .SchLib 文件。
```

### 81. import\_library\_components

```
导入项目目录下的 .SchLib 文件并缓存元件目录。（需要提供实际的 .SchLib 文件路径）
```

### 82. get\_library\_symbol\_reference (验证导入)

```
[前置] 接上一步，验证导入的库元件是否可以通过 get_library_symbol_reference 查询到。
```

***

## 十一、布局复制 (2 tools)

### 83. layout\_duplicator

```
查找当前 PCB 上具有相同封装的元件组，列出可复制的源/目标候选。
```

### 84. layout\_duplicator\_apply

```
[前置] 从 layout_duplicator 结果中选择一组源/目标元件，执行布局复制。

注意：需要提供实际的源位号和目标位号列表。
```

***

## 十二、编译与报告 (2 tools)

### 85. compile\_project

```
编译当前项目，运行 ERC/DRC 检查。
```

### 86. generate\_report - netlist

```
生成当前项目的网表报告。
```

### 87. generate\_report - bom

```
生成当前项目的 BOM（物料清单）报告。
```

### 88. generate\_report - component\_cross\_reference \[新增]

```
[新增] 生成当前项目的元件交叉引用报告（component_cross_reference）。
验证返回 report_type=component_cross_reference。
```

### 89. generate\_report - project\_statuses \[新增]

```
[新增] 生成当前项目的状态报告（project_statuses）。
验证返回 report_type=project_statuses。
```

### 90. generate\_report - report\_project \[新增]

```
[新增] 生成当前项目的层级报告（report_project）。
验证返回 report_type=report_project。
```

***

## 十三、输出作业 (2 tools)

### 91. get\_output\_job\_containers

```
列出当前项目中所有 OutputJob 文件的容器。
```

### 92. run\_output\_jobs

```
[前置] 从 get_output_job_containers 结果中选择第一个容器名称，执行该输出作业。

注意：需要提供实际的容器名称。
```

***

## 十四、视图与截图 (2 tools)

### 93. zoom\_view - fit

```
将当前编辑器视图缩放到适合窗口大小。
```

### 94. zoom\_view - redraw

```
刷新当前编辑器视图。
```

### 95. zoom\_view - in \[新增]

```
[新增] 将当前编辑器视图放大一级（zoom in）。
```

### 96. zoom\_view - out \[新增]

```
[新增] 将当前编辑器视图缩小一级（zoom out）。
```

### 97. take\_view\_screenshot - pcb

```
截取当前 PCB 编辑器视图的截图。
```

### 98. take\_view\_screenshot - sch

```
截取当前原理图编辑器视图的截图。
```

***

## 十五、内存管理 (2 tools)

### 99. get\_memory\_status

```
查询内存缓存的状态。
```

### 100. refresh\_memory\_cache

```
刷新内存缓存。
```

***

## 十六、知识库 + 工具联动测试

### 101. 知识库 -> 原理图设计联动

```
[知识库] 先搜索知识库中关于 MCU 去耦电容布局的内容，然后在原理图中放置一个 100nF 去耦电容，位置 X=500 mils, Y=500 mils。
```

### 102. 知识库 -> PCB 布线联动

```
[知识库] 先搜索知识库中关于差分对走线规则的内容，然后查询当前 PCB 的层叠结构，计算 90 欧姆差分对在当前层叠下的线宽和线距。
```

### 103. 知识库 -> DRC 规则推导

```
[知识库] 先搜索知识库中关于电源电路 DRC 规则模板的内容，然后获取当前 PCB 的设计规则，对比知识库中的推荐值与当前设置。
```

### 104. 知识库 -> 元件选型联动

```
[知识库] 先搜索知识库中关于 LDO 选型的内容，然后搜索库中是否有 AMS1117 或 LM358 的原理图符号。
```

***

## 十七、增强功能综合验证

### 105. 增强流程 - 元件属性查询与修改

```
[增强] 使用 get_all_designators 获取第一个元件位号，执行以下流程：
1. get_properties — 查询完整属性（验证 name_on, comment_on, moveable, component_kind 等字段）
2. set_height — 设置高度为 35 mils
3. set_name_visibility — 隐藏位号
4. set_comment_visibility — 显示注释
5. set_autoposition — 位号设为 Manual(9)，注释设为 CenterAbove(6)
6. get_properties — 再次查询，验证以上修改已生效
7. set_name_visibility — 恢复显示位号
```

### 106. 增强流程 - PCB 编辑全流程

```
[增强] 执行以下 PCB 编辑全流程：
1. add_region — 创建一个矩形铜区域 (0,0)-(2000,0)-(2000,2000)-(0,2000)，层为 Top Layer，网络 GND
2. add_polygon_pour — 创建一个覆铜 (0,0)-(3000,0)-(3000,3000)-(0,3000)，层为 Bottom Layer，网络 GND
3. select_objects — 选中所有走线
4. modify_track — 修改选中走线宽度为 15 mils
5. rebuild_polygons — 重建所有覆铜
6. zoom_view — 刷新视图
```

### 107. 增强流程 - 网络分析全流程

```
[增强] 执行以下网络分析全流程：
1. get_all_nets — 获取所有网络列表
2. pcb_net_info — 查询 GND 网络的详细信息（验证 track_count, via_count, total_copper_length_mils）
3. pcb_net_info — 查询 VCC 网络的详细信息
4. 对比两个网络的铜长度和对象数量
```

### 108. 增强流程 - 板级信息全貌

```
[增强] 获取当前 PCB 的完整板级信息，验证返回结果包含：
- 板框尺寸和面积
- 所有对象类型计数 (component_count, pad_count, via_count, track_count, arc_count, fill_count, text_count, polygon_count, region_count, connection_count)
- 层数 layer_count
- 轮廓点列表 outline_points[]

然后执行 pcb_drc 获取 DRC 违规详情，验证包含 identifier, descriptor, drc_error 等增强字段。
```

### 109. 增强流程 - IPCB\_Primitive 三标志全量验证 \[新增]

```
[新增] 验证 IsKeepout / Moveable / PrimitiveLock 三个继承属性在 Track / Arc / Fill / Region / Polygon 上的 Add + Modify 路径一致性。
执行以下流程（每步均 selected_only=true）：
1. add_track — x1=1000,y1=1000,x2=2000,y2=1000, width=10, layer=top, net_name=GND, is_keepout=false, moveable=true, primitive_lock=false
2. select_objects object_type=track — 选中该走线
3. modify_track — is_keepout=true, moveable=false, primitive_lock=true
4. add_fill — x1=1000,y1=2000,x2=2000,y2=3000, layer=top, net_name=GND, is_keepout=false, moveable=true, primitive_lock=false
5. select_objects object_type=fill — 选中该填充
6. modify_fill — net_name=VCC, is_keepout=true, moveable=false, primitive_lock=true
7. add_arc — x_center=5000,y_center=5000,radius=500, start=0, end=180, width=10, layer=top, net_name=GND, is_keepout=false, moveable=true, primitive_lock=false
8. select_objects object_type=arc
9. modify_arc — radius=800, net_name=VCC, is_keepout=true, moveable=false, primitive_lock=true
10. add_region — points_csv=0,0,800,0,800,800,0,800, layer=top, kind=cutout, is_keepout=false, moveable=true, primitive_lock=false
11. select_objects object_type=all → 手动选中该 Region
12. modify_region — kind=copper, is_keepout=true, moveable=false, primitive_lock=true
13. add_polygon_pour — points_csv=0,0,4000,0,4000,4000,0,4000, layer=bottom, net_name=GND, hatch_style=solid, pour_over=same_net, use_octagons=true, remove_dead=true, is_keepout=false, moveable=true, primitive_lock=false
14. select_objects object_type=all → 手动选中该 Polygon
15. modify_polygon — hatch_style=hatch90, pour_over=none, use_octagons=false, remove_dead=false, is_keepout=true, moveable=false, primitive_lock=true
16. rebuild_polygons — 刷新覆铜
每步验证：返回 modified_count 或 success=true，且对应的 is_keepout/moveable/primitive_lock 值回显正确。
参考来源：IPCB_Primitive 继承属性 — 01_PCB对象与API §3.x + PCBObjectInspector 全篇。
注意：Text 类型不包含此三属性（API 不存在，不编造），本流程不测试 Text。
```

### 110. 增强流程 - 元件写操作全量验证 \[新增]

```
[新增] 验证 pcb_component 的三个新增写操作（set_primitive_lock / set_component_kind / set_3d_body）的完整读写回路。
执行以下流程：
1. get_all_designators — 获取第一个元件位号 D1
2. get_properties — 记录当前 component_kind / primitive_lock 值作为基线
3. set_primitive_lock primitive_lock=true — 锁定子图元
4. get_properties — 读回 primitive_lock，确认=true
5. set_primitive_lock primitive_lock=false — 解锁
6. get_properties — 读回 primitive_lock，确认=false
7. set_component_kind kind=mechanical — 改为机械元件
8. get_properties — 读回 component_kind，确认=eComponentKind_Mechanical
9. set_component_kind kind=standard — 恢复标准元件
10. get_properties — 读回 component_kind，确认=eComponentKind_Standard
11. get_3d_bodies — 查询 3D 体列表
12. 如果 body_count >= 1：
    12a. set_3d_body body_index=0 standoff_height_mils=10 overall_height_mils=35 body_projection=top body_color_3d=16777215 body_opacity_3d=80
    12b. get_3d_bodies — 读回 standoff_height_mils/overall_height_mils/body_projection/body_color_3d/body_opacity_3d，确认全部更新
    如果 body_count=0，跳过 12a/12b，记录"元件无 3D 体"
每步验证：返回 success=true，且 get_properties / get_3d_bodies 读回值与写入值一致。禁止仅凭 success=true 判定成功。
参考来源：01_PCB对象与API §3.1 + §3.9 + PCBObjectInspector L851/L883/L906-L911。
```

### 111. 增强流程 - Region/Polygon 枚举全量验证 \[新增]

```
[新增] 验证 TRegionKind / TPolyHatchStyle / TPolygonPourOver 三个枚举在 Add + Modify 路径上的字符串与整数映射。
执行以下流程：
A. TRegionKind（5 个值）:
   A1. add_region kind=copper        → 验证 kind=eRegionKind_Copper (0)
   A2. add_region kind=cutout        → 验证 kind=eRegionKind_Cutout (1)
   A3. add_region kind=named_region  → 验证 kind=eRegionKind_NamedRegion (2)
   A4. add_region kind=board_cutout  → 验证 kind=eRegionKind_BoardCutout (3)
   A5. add_region kind=cavity        → 验证 kind=eRegionKind_Cavity (4)
   A6. modify_region kind=0 → 1 → 2 → 3 → 4 循环修改同一 Region，每次用整数传入
B. TPolyHatchStyle（6 个值）:
   B1. add_polygon_pour hatch_style=hatch90 (0)  → 验证 hatch_style=0
   B2. add_polygon_pour hatch_style=hatch45 (1)  → 验证 hatch_style=1
   B3. add_polygon_pour hatch_style=vhatch (2)   → 验证 hatch_style=2
   B4. add_polygon_pour hatch_style=hhatch (3)   → 验证 hatch_style=3
   B5. add_polygon_pour hatch_style=none (4)    → 验证 hatch_style=4
   B6. add_polygon_pour hatch_style=solid (5)   → 验证 hatch_style=5
   B7. modify_polygon hatch_style=0→1→2→3→4→5 循环修改，每次用字符串传入
C. TPolygonPourOver（3 个值）:
   C1. add_polygon_pour pour_over=none (0)              → 验证 pour_over=ePolygonPourOver_None
   C2. add_polygon_pour pour_over=same_net (1)          → 验证 pour_over=ePolygonPourOver_SameNet
   C3. add_polygon_pour pour_over=same_net_polygons (2) → 验证 pour_over=ePolygonPourOver_SameNetPolygons
   C4. modify_polygon pour_over=0→1→2 循环修改，每次用整数传入
每次 modify 后调用 rebuild_polygons + pcb_polygon_info 读回确认。
参考来源：05_枚举与常量参考 §5 TRegionKind + §4 TPolyHatchStyle + 01_PCB §3.7 TPolygonPourOver。
```

***

## 测试注意事项

1. **顺序依赖**：标注 \[前置] 的测试需要先完成前置步骤获取数据
2. **不可逆操作**：`pcb_edit delete_objects` 会永久删除对象，请在测试板上操作
3. **单位统一**：所有坐标参数均为 **mils**（不是 mils\*10000，不是 mm）
4. **文件路径**：需要提供文件路径的测试，请替换为实际的工程文件路径
5. **编译错误**：如果遇到 `Undeclared identifier` 错误，请重启 Altium Designer 清除 ScriptingSystem.DLL 缓存
6. **MCP 重连**：修改 DelphiScript 后需要重新执行 Altium 脚本，MCP 不需要重启
7. **知识库索引**：如果 `search_knowledge_base` 返回索引未找到，先运行 `npm run build-kb` 重建索引
8. **层可见性**：`set_pcb_layer_visibility` 显示/隐藏层时只影响指定层，不会改变其他层的可见性
9. **库搜索**：`search_library_symbol` 和 `get_library_symbol_reference` 不再弹出文件对话框，会自动遍历焦点项目中的 .SchLib 文件
10. **弹窗**：所有工具不应弹出 ShowMessage 对话框。如果遇到弹窗阻塞，请检查是否有未清理的旧脚本
11. **Undo 支持**：所有 set\_\* 和 modify\_\* 操作都使用 BeginModify/EndModify 事务包装，支持 Ctrl+Z 撤销
12. **增强验证**：标注 \[增强] 的测试用例需要验证返回 JSON 中的新增字段是否完整返回
13. **place\_component**：需要项目中存在对应的 .SchLib 库文件且包含目标元件，否则会返回错误
14. **generate\_report**：report\_type 支持五种类型（netlist/bom/component\_cross\_reference/project\_statuses/report\_project），不传参数默认 netlist
15. **强制读回验证**：所有写操作（add\_*/modify\_*/set\_\*）后，必须用独立读操作（get\_properties / get\_3d\_bodies / pcb\_net\_info / pcb\_polygon\_info）读回目标字段确认生效，禁止仅凭 success=true 判定成功。详见 AGENTS.md "强制验证规则"
16. **IPCB\_Primitive 三标志**：is\_keepout / moveable / primitive\_lock 是 Track / Arc / Fill / Region / Polygon 的继承属性；Text 类型在 API 中不存在此三属性，MCP 不编造
17. **枚举参数**：kind / hatch\_style / pour\_over / body\_projection / component\_kind 均支持字符串别名和整数序号两种传入方式，详见 05\_枚举与常量参考.md
18. **modify\_polygon 后必须 rebuild**：修改 Polygon 属性后需调用 rebuild\_polygons 刷新覆铜可视化，再用 pcb\_polygon\_info 读回确认

***

## 测试进度跟踪

| 类别                  | 工具数    | 测试数     | 已通过    | 状态      |
| ------------------- | ------ | ------- | ------ | ------- |
| 系统与配置               | 4      | 4       | 4      | ✅ 已测试   |
| 知识库与向量检索            | 2      | 6       | —      | ⬜ 待测试   |
| 项目与文档管理             | 5      | 5       | 5      | ✅ 已测试   |
| PCB 读取 (含增强)        | 8      | 8       | 5      | ⬜ 部分测试  |
| PCB 写入 - 基础         | 8      | 8       | 5      | ⬜ 部分测试  |
| PCB 写入 - 增强 \[新增]   | —      | 24      | 0      | ⬜ 待测试   |
| PCB 元件操作 - 增强 \[新增] | 1      | 14      | 0      | ⬜ 待测试   |
| PCB 分析 (含增强)        | 3      | 4       | 2      | ⬜ 部分测试  |
| 原理图操作 (含新增)         | 3      | 18      | 5      | ⬜ 部分测试  |
| 库操作                 | 4      | 4       | 0      | ⬜ 待测试   |
| 布局复制                | 2      | 2       | 0      | ⬜ 待测试   |
| 编译与报告 (含新增)         | 2      | 6       | 0      | ⬜ 待测试   |
| 输出作业                | 2      | 2       | 0      | ⬜ 待测试   |
| 视图与截图 (含新增)         | 2      | 6       | 0      | ⬜ 待测试   |
| 内存管理                | 2      | 2       | 0      | ⬜ 待测试   |
| 知识库+工具联动            | —      | 4       | 0      | ⬜ 待测试   |
| 增强综合验证 \[新增]        | —      | 7       | 0      | ⬜ 待测试   |
| **合计**              | **42** | **118** | **26** | **22%** |

***

## 增强功能对照表

| 工具                   | 原有功能                                                                                                                          | 新增功能                                                                                                                                                                                                                                                                                                                                                            | 参考来源                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| pcb\_edit            | add\_track/pad/via/fill/arc/text, delete/select                                                                               | add\_region(kind), add\_polygon\_pour(hatch\_style/pour\_over/use\_octagons/remove\_dead), modify\_track/pad/via/text/arc/fill, modify\_region(NEW), modify\_polygon(NEW), move\_to\_layer, assign\_net, rebuild\_polygons；所有 Track/Arc/Fill/Region/Polygon 的 add+modify 均支持 is\_keepout/moveable/primitive\_lock；Fill.Net / Arc.Net / add\_track net\_name 全补齐 | 01\_PCB对象与API §3.2-§3.8 + 05\_枚举 §4-§5 + PCBObjectInspector 全篇                                      |
| pcb\_component       | rotate, flip, select, get\_properties                                                                                         | set\_height, set\_moveable, set\_name\_visibility, set\_comment\_visibility, set\_autoposition, get\_3d\_bodies, set\_lock\_strings, **set\_primitive\_lock(NEW)**, **set\_component\_kind(NEW)**, **set\_3d\_body(NEW)**                                                                                                                                       | 01\_PCB §3.1 PrimitiveLock/ComponentKind + §3.9 IPCB\_ComponentBody + Inspector L851/L883/L906-L911 |
| get\_component\_pins | name, net, x, y, layer                                                                                                        | mode, per-layer sizes/shapes, hole info, tenting, testpoints, mask expansions, plane connection, package length                                                                                                                                                                                                                                                 | PCBObjectInspector (IPCB\_Pad)                                                                      |
| pcb\_drc             | description, detail                                                                                                           | identifier, descriptor, object\_id\_string, unique\_id, drc\_error, selected, layer                                                                                                                                                                                                                                                                             | PCBObjectInspector (IPCB\_Violation)                                                                |
| pcb\_board\_info     | dimensions, area, outline                                                                                                     | object counts (10 types), layer\_count                                                                                                                                                                                                                                                                                                                          | PCBObjectInspector (IPCB\_Board)                                                                    |
| pcb\_polygon\_info   | basic props                                                                                                                   | pour\_over\_type, polygon\_type, min\_track\_mils, bbox, segments\[]                                                                                                                                                                                                                                                                                            | PCBObjectInspector (IPCB\_Polygon)                                                                  |
| pcb\_net\_info       | item\_count, connection\_count                                                                                                | per-type counts (7 types), total\_copper\_length\_mils, selected flag                                                                                                                                                                                                                                                                                           | PCBObjectInspector (IPCB\_Net)                                                                      |
| edit\_schematic      | set\_component\_transform, add\_text/net\_label/wire, place\_gnd/vcc, get\_component\_info, add\_port/junction/line/rectangle | set\_component\_parameters, place\_component, add\_bus, add\_bus\_entry, place\_power\_port                                                                                                                                                                                                                                                                     | edit\_schematic action expansion                                                                    |
| generate\_report     | netlist, bom                                                                                                                  | component\_cross\_reference, project\_statuses, report\_project                                                                                                                                                                                                                                                                                                 | WorkspaceManager:GenerateReport                                                                     |
| zoom\_view           | fit, redraw                                                                                                                   | in, out (all actions now tested)                                                                                                                                                                                                                                                                                                                                | zoom\_view action expansion                                                                         |

***

## 属性来源对照矩阵（不编造原则）

> 以下矩阵列出本次新增的每个参数及其在 `scripts-libraries-master` 中的精确来源，确保无任何编造属性。

### IPCB\_Primitive 继承属性（三标志）

| 元素类型    | is\_keepout  | moveable     | primitive\_lock | 来源行号                                                        |
| ------- | ------------ | ------------ | --------------- | ----------------------------------------------------------- |
| Track   | ✅ Add+Modify | ✅ Add+Modify | ✅ Add+Modify    | 01\_PCB §3.2 + Inspector L890+                              |
| Arc     | ✅ Add+Modify | ✅ Add+Modify | ✅ Add+Modify    | 01\_PCB §3.3 + Inspector L1279+                             |
| Fill    | ✅ Add+Modify | ✅ Add+Modify | ✅ Add+Modify    | Inspector L980+ (Fill.Net/IsKeepout/Moveable/PrimitiveLock) |
| Region  | ✅ Add+Modify | ✅ Add+Modify | ✅ Add+Modify    | 01\_PCB §3.8 + Inspector L1183+                             |
| Polygon | ✅ Add+Modify | ✅ Add+Modify | ✅ Add+Modify    | Inspector L1126+                                            |
| Pad     | —            | —            | —               | Pad 有独立的 Mask/Testpoint 标志，不合并到此                            |
| Via     | —            | —            | —               | Via 有独立的 Tenting/Testpoint 标志，不合并到此                         |
| Text    | ❌ 不编造        | ❌ 不编造        | ❌ 不编造           | API/Inspector 中 Text 不含此三属性                                 |

### Net 属性

| 元素类型    | add\_\* 支持 net\_name | modify\_\* 支持 net\_name | 来源                             |
| ------- | -------------------- | ----------------------- | ------------------------------ |
| Track   | ✅                    | ✅                       | 01\_PCB §3.2 IPCB\_Track.Net   |
| Arc     | ✅                    | ✅                       | 01\_PCB §3.3 IPCB\_Arc.Net     |
| Fill    | ✅ (本次新增)             | ✅ (本次新增)                | Inspector L980+ Fill.Net       |
| Region  | ✅                    | ✅                       | 01\_PCB §3.8 IPCB\_Region.Net  |
| Polygon | ✅                    | ✅                       | 01\_PCB §3.7 IPCB\_Polygon.Net |

### 枚举参数

| 参数                         | 接受值                                                                                                    | 枚举类型             | 来源           |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- | ------------ |
| kind (Region)              | copper=0, cutout=1, named\_region=2, board\_cutout=3, cavity=4                                         | TRegionKind      | 05\_枚举 §5    |
| hatch\_style (Polygon)     | hatch90=0, hatch45=1, vhatch=2, hhatch=3, none=4, solid=5                                              | TPolyHatchStyle  | 05\_枚举 §4    |
| pour\_over (Polygon)       | none=0, same\_net=1, same\_net\_polygons=2                                                             | TPolygonPourOver | 01\_PCB §3.7 |
| kind (Component)           | standard=0, mechanical=1, graphical=2, net\_tie\_bom=3, net\_tie\_nobom=4, standard\_nobom=5, jumper=6 | TComponentKind   | 05\_枚举 §8    |
| body\_projection (3D Body) | top, bottom                                                                                            | TBoardSide       | 01\_PCB §3.9 |

