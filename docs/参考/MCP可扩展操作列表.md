# Altium MCP 可扩展操作列表

## 概述

本文档基于 `altium-delphi-scripts` skill 规范，列出当前 MCP 服务器可扩展的 Altium Designer 操作。所有扩展操作均已在 skill 的参考脚本库（coffeenmusic-Altium-Scripts 和 coffeenmusic-altium-scripts-skill）中找到验证过的 API 模式。

**文档日期**: 2026-08-19
**Skill 版本**: 2.0.0
**当前工具数**: 40 个已注册 MCP 工具

---

## 一、PCB 写入操作扩展

### 1.1 图元创建类

#### 1.1.1 create_region - 创建铜皮区域/挖空区域
- **功能**: 在 PCB 上创建 IPCB_Region 对象（实心铜皮或挖空）
- **参考脚本**: `IterateRegions.pas` (迭代模式)
- **关键 API**:
  ```delphi
  Region := PCBServer.PCBObjectFactory(eRegionObject, eNoDimension, eCreate_Default);
  Region.Kind := eRegionKind_Copper;  // 或 eRegionKind_Cutout
  Contour := PCBServer.PCBContourFactory;
  Contour.AddPoint(x1, y1);
  // ...
  Region.SetOutlineContour(Contour);
  Board.AddPCBObject(Region);
  PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Region.I_ObjectAddress);
  Region.GraphicallyInvalidate;
  ```
- **参数**: layer, kind(copper/cutout), points_csv, net_name(可选)
- **注意事项**: 使用 `eRegionKind_Copper`(0) 而非不存在的 `eRegionKind_Solid`；使用 `SetOutlineContour()` 写入轮廓

#### 1.1.2 create_polygon_pour - 创建铺铜多边形
- **功能**: 在 PCB 上创建 IPCB_Polygon 铺铜对象
- **参考脚本**: `IteratePolygons.pas`, `CreatePCBObjects.PAS`
- **关键 API**:
  ```delphi
  Polygon := PCBServer.PCBObjectFactory(ePolyObject, eNoDimension, eCreate_Default);
  Polygon.PolyHatchStyle := ePolySolid;
  Polygon.Grid := MilsToCoord(10);
  Polygon.TrackSize := MilsToCoord(8);
  Polygon.PourOver := ePolygonPourOver_SameNet;
  Polygon.RemoveDead := True;
  // 设置 Segments
  Polygon.SetState_MainContour(Points, PointCount);
  Board.AddPCBObject(Polygon);
  PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Polygon.I_ObjectAddress);
  if NetName <> '' then
    Polygon.Net := FindNetByName(Board, NetName);
  Polygon.Rebuild;
  ```
- **参数**: layer, points_csv, net_name, hatch_style, grid_mils, track_size_mils, pour_over, remove_dead
- **注意事项**: 设置 Net 后必须调用 `Rebuild()`；不要复制 `PolygonOutline` 属性

#### 1.1.3 add_connection_line - 添加飞线连接
- **功能**: 手动添加 IPCB_Connection 飞线
- **参考脚本**: `Count_Connection_Lines.pas`
- **关键 API**:
  ```delphi
  Conn := PCBServer.PCBObjectFactory(eConnectionObject, eNoDimension, eCreate_Default);
  Conn.X1 := MilsToCoord(X1) + xorigin;
  Conn.Y1 := MilsToCoord(Y1) + yorigin;
  Conn.X2 := MilsToCoord(X2) + xorigin;
  Conn.Y2 := MilsToCoord(Y2) + yorigin;
  Conn.Net := Net;
  Board.AddPCBObject(Conn);
  ```
- **参数**: x1_mils, y1_mils, x2_mils, y2_mils, net_name

### 1.2 图元修改类

#### 1.2.1 modify_track_width - 批量修改走线宽度
- **功能**: 按层/网络批量修改 Track 宽度
- **参考脚本**: `CurrentColorizer.pas` (批量遍历模式), `ModifyWidthRules.pas`
- **关键 API**:
  ```delphi
  PCBServer.PreProcess;
  try
    Track := Iterator.FirstPCBObject;
    while Track <> nil do
    begin
      PCBServer.SendMessageToRobots(Track.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
      Track.Width := MilsToCoord(NewWidth);
      PCBServer.SendMessageToRobots(Track.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
      Track := Iterator.NextPCBObject;
    end;
  finally
    PCBServer.PostProcess;
  end;
  ```
- **参数**: layer(可选), net_name(可选), new_width_mils, filter_existing_width(可选)

#### 1.2.2 modify_text_properties - 修改文本属性
- **功能**: 修改 PCB 上文本对象的属性（大小、字体、旋转、镜像等）
- **参考脚本**: `FindReplaceText.pas` (遍历模式)
- **关键 API**:
  ```delphi
  PCBServer.SendMessageToRobots(TextObj.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
  TextObj.Size := MilsToCoord(NewHeight);
  TextObj.UseTTFonts := True;
  TextObj.FontName := NewFontName;
  TextObj.RotateBy(NewRotation);
  PCBServer.SendMessageToRobots(TextObj.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
  ```
- **参数**: designator(可选), layer(可选), text_match(可选), new_height_mils, new_font_name, new_rotation, mirror

#### 1.2.3 assign_net_to_object - 为对象分配网络
- **功能**: 为已存在的 PCB 图元（Track/Pad/Via/Fill/Arc）分配或更改网络
- **参考脚本**: `NetObjectAssign.pas`
- **关键 API**:
  ```delphi
  PCBServer.SendMessageToRobots(Obj.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
  Obj.Net := FindNetByName(Board, NetName);
  PCBServer.SendMessageToRobots(Obj.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
  if Obj.ObjectId = ePolyObject then
    Obj.Rebuild;
  ```
- **参数**: object_type, layer, net_name, filter_x_mils(可选), filter_y_mils(可选)

#### 1.2.4 move_objects_to_layer - 移动对象到另一层
- **功能**: 将选中或指定类型的对象移动到目标层
- **参考脚本**: `MoveToLayer.pas`
- **关键 API**:
  ```delphi
  PCBServer.SendMessageToRobots(Obj.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
  Obj.Layer := TargetLayer;
  PCBServer.SendMessageToRobots(Obj.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
  ```
- **参数**: object_type, source_layer(可选), target_layer, selected_only(可选)

### 1.3 组件操作类

#### 1.3.1 align_components - 对齐组件
- **功能**: 将选中组件按左/右/上/下/中心对齐
- **参考脚本**: `SwapComponentsUnit.pas` (组件位置操作模式)
- **关键 API**:
  ```delphi
  PCBServer.PreProcess;
  try
    for i := 0 to Count - 1 do
    begin
      PCBServer.SendMessageToRobots(Comp.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
      Comp.MoveToXY(NewX, NewY);
      PCBServer.SendMessageToRobots(Comp.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
    end;
  finally
    PCBServer.PostProcess;
  end;
  ```
- **参数**: align_mode(left/right/top/bottom/h_center/v_center), designators(可选, 默认选中组件)

#### 1.3.2 distribute_components - 均匀分布组件
- **功能**: 在选中组件之间均匀分布间距
- **参考脚本**: `Distribute.pas`
- **关键 API**: `Comp.MoveToXY()` + `Comp.BoundingRectangleNoNameComment`
- **参数**: direction(horizontal/vertical), designators, gap_mils

#### 1.3.3 swap_components - 交换两个组件位置
- **功能**: 交换两个组件的坐标和旋转角度
- **参考脚本**: `SwapComponentsUnit.pas`
- **关键 API**:
  ```delphi
  TempX := Comp1.x; TempY := Comp1.y; TempR := Comp1.Rotation;
  Comp1.MoveToXY(Comp2.x, Comp2.y);
  Comp1.Rotation := Comp2.Rotation;
  Comp2.MoveToXY(TempX, TempY);
  Comp2.Rotation := TempR;
  ```
- **参数**: designator1, designator2

#### 1.3.4 set_component_properties - 设置组件属性
- **功能**: 设置组件注释、锁定状态、名称/注释自动位置等
- **参考脚本**: `CreateComponentOnPCB.pas`
- **关键 API**:
  ```delphi
  Comp.Comment.Text := NewComment;
  Comp.PrimitiveLock := True;
  Comp.ChangeNameAutoposition(eAutoPos_TopCenter);
  Comp.ChangeCommentAutoposition(eAutoPos_BottomCenter);
  ```
- **参数**: designator, comment(可选), locked(可选), name_autoposition(可选), comment_autoposition(可选)

### 1.4 设计规则类

#### 1.4.1 create_design_rule - 创建设计规则
- **功能**: 创建 PCB 设计规则（间距、线宽、过孔样式等）
- **参考脚本**: `CreateRules.pas`, `ModifyWidthRules.pas`
- **关键 API**:
  ```delphi
  Rule := PCBServer.PCBRuleFactory(eRule_Clearance);
  Rule.Scope1Expression := 'All';
  Rule.Scope2Expression := 'All';
  // 设置规则参数...
  Board.AddPCBObject(Rule);
  ```
- **参数**: rule_kind(clearance/width/routing_via_style/etc), scope1, scope2, parameters

#### 1.4.2 modify_design_rule - 修改设计规则
- **功能**: 修改已存在的 PCB 设计规则参数
- **参考脚本**: `ModifyWidthRules.pas`
- **参数**: rule_name, new_parameters

### 1.5 铺铜管理类

#### 1.5.1 rebuild_all_polygons - 重建所有铺铜
- **功能**: 重建 PCB 上所有铺铜多边形
- **参考脚本**: `RebuildInternalAndSplitPlanes.pas`
- **关键 API**:
  ```delphi
  PCBServer.PreProcess;
  try
    Poly := Iterator.FirstPCBObject;
    while Poly <> nil do
    begin
      Poly.Rebuild;
      Poly := Iterator.NextPCBObject;
    end;
  finally
    PCBServer.PostProcess;
  end;
  Board.ViewManager_FullUpdate;
  ```
- **参数**: layer(可选, 默认所有层)

#### 1.5.2 modify_polygon_properties - 修改铺铜属性
- **功能**: 修改铺铜的填充样式、网格大小、PourOver 等属性
- **参考脚本**: `IteratePolygons.pas`
- **参数**: polygon_index(可选), hatch_style, grid_mils, track_size_mils, pour_over, remove_dead, remove_islands, island_area_threshold

### 1.6 差分对类

#### 1.6.1 create_differential_pair - 创建差分对
- **功能**: 从两个网络创建差分对
- **参考脚本**: `DiffPair_Finder.pas`
- **关键 API**:
  ```delphi
  DiffPair := PCBServer.PCBObjectFactory(eDifferentialPairObject, eNoDimension, eCreate_Default);
  DiffPair.Name := PairName;
  DiffPair.PositiveNet := FindNetByName(Board, PosNetName);
  DiffPair.NegativeNet := FindNetByName(Board, NegNetName);
  Board.AddPCBObject(DiffPair);
  ```
- **参数**: pair_name, positive_net_name, negative_net_name

### 1.7 组件类管理

#### 1.7.1 create_component_class - 创建元件类
- **功能**: 创建 IPCB_ObjectClass 并添加元件成员
- **参考脚本**: `PCB Class Generator/`
- **关键 API**:
  ```delphi
  CompClass := PCBServer.PCBClassFactoryByClassMember(eClassMemberKind_Component);
  CompClass.Name := ClassName;
  Board.AddPCBObject(CompClass);
  PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, CompClass.I_ObjectAddress);
  CompClass.AddMemberByName(Designator);
  ```
- **参数**: class_name, designators[]

---

## 二、原理图写入操作扩展

### 2.1 图元创建类

#### 2.1.1 add_sheet_symbol - 创建图纸符号
- **功能**: 在原理图上创建 ISch_SheetSymbol（子图符号）
- **参考脚本**: `CreateSchObjects.pas`, `PlaceSchObjects.PAS`
- **关键 API**:
  ```delphi
  SchServer.ProcessControl.PreProcess(SchDoc, '');
  try
    SheetSym := SchServer.SchObjectFactory(eSheetSymbol, eCreate_Default);
    SheetSym.Location := Point(MilsToCoord(X), MilsToCoord(Y));
    SheetSym.Corner := Point(MilsToCoord(X + W), MilsToCoord(Y + H));
    SheetSym.Designator.Text := Designator;
    SheetSym.FileName := SheetFileName;
    SchDoc.RegisterSchObjectInContainer(SheetSym);
    SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, SheetSym.I_ObjectAddress);
    SchDoc.GraphicallyInvalidate;
  finally
    SchServer.ProcessControl.PostProcess(SchDoc, '');
  end;
  ```
- **参数**: x_mils, y_mils, width_mils, height_mils, designator, sheet_file_name

#### 2.1.2 add_sheet_entry - 添加图纸符号入口
- **功能**: 为图纸符号添加 ISch_SheetEntry
- **参考脚本**: `CreateSchObjects.pas`
- **关键 API**:
  ```delphi
  Entry := SchServer.SchObjectFactory(eSheetEntry, eCreate_Default);
  Entry.ParentSheetSymbol := SheetSym;
  Entry.Name := EntryName;
  Entry.IOType := ePortInput;  // 或 ePortOutput/ePortBidirectional
  Entry.Style := ePortRight;
  SheetSym.AddSheetEntry(Entry);
  ```
- **参数**: sheet_symbol_designator, entry_name, io_type, style, side(top/bottom/left/right)

#### 2.1.3 add_off_sheet_connector - 添加离页连接器
- **功能**: 创建 ISch_OffSheetConnector
- **参考脚本**: `CreateSchObjects.pas`
- **参数**: x_mils, y_mils, net_name, orientation

#### 2.1.4 add_directive - 添加指示符
- **功能**: 为导线/引脚添加 ISch_Directive（如 No ERC 指示符）
- **参考脚本**: `CreateSchObjects.pas`
- **参数**: x_mils, y_mils, directive_type, target_object(可选)

#### 2.1.5 add_harness_connector - 添加线束连接器
- **功能**: 创建 ISch_HarnessConnector 和 ISch_HarnessEntry
- **参考脚本**: `CreateSchObjects.pas`
- **参数**: x_mils, y_mils, harness_name, entries[]

### 2.2 组件操作类

#### 2.2.1 modify_component_designator - 修改元件位号
- **功能**: 修改原理图元件的 Designator
- **参考脚本**: `ModifySchObjects.pas`, `IncrementDesignators.pas`
- **关键 API**:
  ```delphi
  SchServer.RobotManager.SendMessage(Comp.I_ObjectAddress, c_BroadCast, SCHM_BeginModify, c_NoEventData);
  Comp.Designator.Text := NewDesignator;
  SchServer.RobotManager.SendMessage(Comp.I_ObjectAddress, c_BroadCast, SCHM_EndModify, c_NoEventData);
  ```
- **参数**: old_designator, new_designator

#### 2.2.2 add_parameter - 添加元件参数
- **功能**: 为指定元件添加新参数
- **参考脚本**: `FetchParameters.pas`, `UserDefinedParameters/`
- **关键 API**:
  ```delphi
  Param := SchServer.SchObjectFactory(eParameter, eCreate_Default);
  Param.Name := ParamName;
  Param.Text := ParamValue;
  Param.IsHidden := Hidden;
  Comp.AddSchObject(Param);
  SchServer.RobotManager.SendMessage(Comp.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, Param.I_ObjectAddress);
  ```
- **参数**: designator, param_name, param_value, hidden(可选)

#### 2.2.3 delete_parameter - 删除元件参数
- **功能**: 从元件中删除指定参数
- **参考脚本**: `DeleteSchObjects.pas`
- **关键 API**:
  ```delphi
  SchServer.RobotManager.SendMessage(Comp.I_ObjectAddress, c_BroadCast, SCHM_BeginModify, c_NoEventData);
  Comp.RemoveSchObject(Param);
  SchServer.RobotManager.SendMessage(Comp.I_ObjectAddress, c_BroadCast, SCHM_EndModify, c_NoEventData);
  ```
- **参数**: designator, param_name

#### 2.2.4 find_replace_text - 查找替换文本
- **功能**: 在原理图上批量查找替换文本（Designator/Comment/Parameter/NetLabel）
- **参考脚本**: `FindReplaceText.pas` (PCB版), `ModifySchObjects.pas`
- **参数**: find_text, replace_text, scope(designator/comment/parameter/net_label/all), match_case, whole_word

### 2.3 图元删除类

#### 2.3.1 delete_sch_object - 删除原理图对象
- **功能**: 按类型/位置删除原理图对象
- **参考脚本**: `DeleteSchObjects.pas`
- **关键 API**:
  ```delphi
  SchServer.ProcessControl.PreProcess(SchDoc, '');
  try
    SchDoc.RemoveSchObject(Obj);
    SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, Obj.I_ObjectAddress);
  finally
    SchServer.ProcessControl.PostProcess(SchDoc, '');
  end;
  SchDoc.GraphicallyInvalidate;
  ```
- **参数**: object_type(wire/bus/net_label/power_port/text/junction/line/rectangle/port), x_mils(可选), y_mils(可选)

### 2.4 图元修改类

#### 2.4.1 modify_wire_vertices - 修改导线顶点
- **功能**: 修改已存在导线/总线的顶点坐标
- **参考脚本**: `ModifySchObjects.pas`
- **参数**: wire_index, vertices_csv

#### 2.4.2 copy_component_placement - 复制元件布局
- **功能**: 将源元件的位置/旋转/参数布局复制到目标元件
- **参考脚本**: `CopySymbolParameterPlacement/`, `UpdateFootprintLocations/`
- **参数**: source_designator, target_designators[], copy_parameters(可选), copy_position, copy_rotation

---

## 三、库操作扩展

### 3.1 PCB 封装库

#### 3.1.1 create_footprint - 创建封装
- **功能**: 在 PcbLib 中创建新封装
- **参考脚本**: `CreateFootprintInLibrary.pas`
- **关键 API**:
  ```delphi
  Library := PCBServer.GetCurrentPCBBoard;  // PcbLib as board
  Footprint := PCBServer.PCBObjectFactory(eComponentObject, eNoDimension, eCreate_Default);
  Footprint.Name.Text := FootprintName;
  Library.AddPCBObject(Footprint);
  ```
- **参数**: library_path, footprint_name, pads[], lines[], arcs[]

#### 3.1.2 modify_footprint_pad - 修改封装焊盘
- **功能**: 修改 PcbLib 中封装的焊盘属性
- **参考脚本**: `FootPrint Finder/`
- **参数**: library_path, footprint_name, pad_name, new_size_x, new_size_y, new_shape, new_hole_size

### 3.2 原理图符号库

#### 3.2.1 create_symbol - 创建原理图符号（需审计后启用）
- **功能**: 在 SchLib 中创建新符号
- **参考脚本**: `createcomp_in_lib.pas`
- **关键 API**:
  ```delphi
  SchServer.ProcessControl.PreProcess(CurrentLib, '');
  try
    Comp := SchServer.SchObjectFactory(eSchComponent, eCreate_Default);
    Comp.LibReference := CompName;
    Comp.Designator.Text := 'U?';
    CurrentLib.RegisterSchObjectInContainer(Comp);
    SchServer.RobotManager.SendMessage(CurrentLib.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, Comp.I_ObjectAddress);
  finally
    SchServer.ProcessControl.PostProcess(CurrentLib, '');
  end;
  ```
- **参数**: library_path, symbol_name, pins[], rectangles[], lines[]
- **注意**: 当前 `ENABLE_SYMBOL_CREATION = False`，需审计后启用

#### 3.2.2 modify_symbol_pin - 修改符号引脚
- **功能**: 修改 SchLib 中符号的引脚属性
- **参考脚本**: `Import Pins/`
- **参数**: library_path, symbol_name, pin_designator, new_name, new_electrical, new_length_mils

---

## 四、项目级操作扩展

### 4.1 编译与验证

#### 4.1.1 get_erc_violations - 获取 ERC 违规
- **功能**: 编译项目后获取原理图级 ERC 违规列表
- **参考脚本**: `usingWSMInterfaces.pas` (WSM 编译模式)
- **关键 API**:
  ```delphi
  WS := GetWorkSpace;
  Prj := WS.DM_FocusedProject;
  Prj.DM_Compile;
  // 迭代 DM_Nets / DM_Components 验证
  ```
- **参数**: project_path(可选, 默认聚焦项目)

#### 4.1.2 validate_layer_stack - 验证层叠结构
- **功能**: 检查 PCB 层叠结构完整性和一致性
- **参考脚本**: `ValidateLayerStack.pas`
- **参数**: check_thickness, check_material, check_copper_weight

### 4.2 输出生成扩展

#### 4.2.1 export_gerber - 导出 Gerber 文件
- **功能**: 通过 Process 调用导出 Gerber
- **参考脚本**: `PublishToPDFScript.pas` (Process 模式)
- **关键 API**:
  ```delphi
  ResetParameters;
  AddStringParameter('ObjectKind', 'Gerber');
  RunProcess('WorkspaceManager:GenerateReport');
  ```
- **参数**: output_path, layers[], format_options

#### 4.2.2 export_pick_place - 导出贴片文件
- **功能**: 导出 Pick & Place 坐标文件
- **参数**: output_path, format(csv/txt), units(metric/imperial), include_back_side

#### 4.2.3 export_odbpp - 导出 ODB++ 文件
- **功能**: 导出 ODB++ 格式制造文件
- **参数**: output_path

---

## 五、批量与自动化操作扩展

### 5.1 批量操作

#### 5.1.1 batch_renumber_designators - 批量重编位号
- **功能**: 按行/列扫描顺序批量重编元件位号
- **参考脚本**: `IncrementDesignators.pas`
- **参数**: scope(pcb/sch), start_index, prefix, direction(row_first/column_first), sort_by(x/y)

#### 5.1.2 batch_set_component_height - 批量设置元件高度
- **功能**: 批量设置 PCB 元件的 3D 高度
- **关键 API**: `Comp.Height := MilsToCoord(HeightMils)`
- **参数**: designators[], height_mils 或 designator_height_map

#### 5.1.3 batch_assign_net_class - 批量分配网络类
- **功能**: 按网络名前缀/模式批量分配网络类
- **参数**: class_name, net_name_pattern, match_mode(prefix/suffix/regex/contains)

### 5.2 自动化工作流

#### 5.2.1 auto_route_selected - 自动布线选中网络
- **功能**: 调用 Altium 内置自动布线器处理选中网络
- **参考脚本**: `SimpleExample.pas` (Process 调用模式)
- **关键 API**: `RunProcess('PCB:AutoRoute')`
- **参数**: net_names[], strategy(default/fanout/main/power)

#### 5.2.2 auto_teardrop - 自动添加泪滴
- **功能**: 为焊盘/过孔自动添加泪滴
- **参考脚本**: `teardrop-generator.md` (prompt/plugins/)
- **参数**: pad_filter(all/selected/specified), min_track_width, max_track_width

#### 5.2.3 auto_via_stitching - 自动过孔缝合
- **功能**: 在铺铜区域自动添加缝合过孔
- **参考脚本**: `StitchingVias.pas`
- **参数**: net_name, layer, grid_mils, via_size, hole_size, pattern(grid/hexagonal)

#### 5.2.4 auto_testpoint_add - 自动添加测试点
- **功能**: 按网络自动添加测试点焊盘
- **参考脚本**: `Testpoint_Generator.pas`
- **参数**: net_names[], layer(top/bottom/both), pad_size, pad_shape

---

## 六、优先级建议

### 高优先级（高频使用，API 已验证）

| 序号 | 操作 | 优先级 | 理由 |
|------|------|--------|------|
| 1 | create_polygon_pour | 高 | PCB 设计核心功能，API 已验证 |
| 2 | rebuild_all_polygons | 高 | 铺铜管理必备，API 简单 |
| 3 | modify_track_width | 高 | PCB 修改高频需求 |
| 4 | assign_net_to_object | 高 | 网络管理基础 |
| 5 | add_parameter | 高 | 原理图参数管理高频需求 |
| 6 | swap_components | 高 | 布局调整常用操作 |
| 7 | align_components | 高 | 布局对齐常用操作 |
| 8 | batch_renumber_designators | 高 | 位号管理必备 |
| 9 | move_objects_to_layer | 高 | 层管理常用 |

### 中优先级（特定场景需要）

| 序号 | 操作 | 优先级 | 理由 |
|------|------|--------|------|
| 10 | create_region | 中 | 铜皮区域创建，API 已验证 |
| 11 | create_differential_pair | 中 | 差分对设计需要 |
| 12 | create_component_class | 中 | 元件类管理 |
| 13 | create_design_rule | 中 | 规则管理 |
| 14 | modify_text_properties | 中 | 文本属性调整 |
| 15 | add_sheet_symbol | 中 | 层次化设计需要 |
| 16 | delete_sch_object | 中 | 原理图编辑完整性 |
| 17 | find_replace_text | 中 | 批量文本处理 |
| 18 | auto_via_stitching | 中 | EMC 优化需要 |
| 19 | auto_testpoint_add | 中 | 测试需要 |
| 20 | export_gerber | 中 | 制造文件导出 |

### 低优先级（高级功能）

| 序号 | 操作 | 优先级 | 理由 |
|------|------|--------|------|
| 21 | create_footprint | 低 | 库管理功能，使用频率低 |
| 22 | create_symbol | 低 | 当前被 Feature Flag 禁用 |
| 23 | modify_polygon_properties | 低 | 铺铜属性细粒度控制 |
| 24 | add_harness_connector | 低 | 线束设计小众场景 |
| 25 | add_off_sheet_connector | 低 | 离页连接小众场景 |
| 26 | auto_route_selected | 低 | 自动布线通常在 Altium GUI 中完成 |
| 27 | export_odbpp | 低 | ODB++ 格式使用较少 |
| 28 | validate_layer_stack | 低 | 验证工具，频率低 |

---

## 七、实现注意事项

### 7.1 DelphiScript 编码规范

所有新增操作必须遵循以下规范（来源：altium-delphi-scripts skill）：

1. **PCB 写入**: 必须包装 `PCBServer.PreProcess`/`PCBServer.PostProcess`
2. **SCH 写入**: 必须包装 `SchServer.ProcessControl.PreProcess(SchDoc, '')`/`PostProcess(SchDoc, '')`
3. **修改已有对象**: 必须使用 `BeginModify`/`EndModify` 消息包裹
4. **新建 PCB 对象**: `AddPCBObject` → `PCBM_BoardRegisteration` → `GraphicallyInvalidate` → (Net 赋值) → `Rebuild`
5. **新建 SCH 对象**: `RegisterSchObjectInContainer` → `SCHM_PrimitiveRegistration` → `GraphicallyInvalidate`
6. **Nil 检查**: 访问 Server/Board/Doc 前必须检查
7. **单位转换**: 使用 `MilsToCoord()`/`MMsToCoord()`/`CoordToMils()`
8. **集合语法**: 使用 `MkSet()` 而非 `[eX, eY]`
9. **禁止 `as` 类型转换**: 先赋值给类型变量再使用
10. **TStringList**: 使用 `TStringList.Create` 创建
11. **全局变量**: 在入口点显式设为 Nil
12. **无中文字符**: 代码中不允许中文字符

### 7.2 MCP 工具注册规范

1. **工具描述**: 在 `src/toolDefinitions.ts` 中定义 `DESCRIPTION_*` 常量
2. **Zod Schema**: 在 `src/tools/` 下创建输入参数 schema
3. **桥接命令**: 在 `altium-scripts/Altium_API.pas` 的 `ExecuteCommand` 中注册新命令
4. **DelphiScript 实现**: 在对应的 `.pas` 文件中实现具体逻辑
5. **Feature Flag**: 写入操作需要添加 Feature Flag 控制
6. **测试**: 在 `tests/` 下添加对应的 schema 测试

### 7.3 API 验证来源

| 操作类别 | 验证来源 | 文件路径 |
|----------|----------|----------|
| PCB 图元创建 | CreatePCBObjects.PAS | coffeenmusic-altium-scripts-skill |
| PCB 迭代模式 | FindNoNets.pas | coffeenmusic-Altium-Scripts |
| PCB 组件操作 | SwapComponentsUnit.pas | scripting-reference-master |
| PCB 铺铜 | IteratePolygons.pas | coffeenmusic-altium-scripts-skill |
| PCB 规则 | CreateRules.pas | coffeenmusic-altium-scripts-skill |
| SCH 图元创建 | CreateSchObjects.pas | coffeenmusic-altium-scripts-skill |
| SCH 组件操作 | ModifySchObjects.pas | coffeenmusic-altium-scripts-skill |
| SCH 参数管理 | FetchParameters.pas | coffeenmusic-altium-scripts-skill |
| WSM 编译 | usingWSMInterfaces.pas | coffeenmusic-altium-scripts-skill |
| Process 调用 | SimpleExample.pas | coffeenmusic-altium-scripts-skill |
