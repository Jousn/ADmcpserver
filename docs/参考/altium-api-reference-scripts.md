# Altium API 接口参考文档

本文档汇总了 `altium-scripts/` 目录下所有 Pascal 脚本中使用的 Altium Designer API 接口，按功能模块分类，标注每个接口的用途和典型用法，方便 AI 工具和开发者查阅。

---

## 一、全局服务器接口

### `PCBServer`
**类型**: 全局对象  
**用途**: PCB 文档服务器的核心入口，提供当前 PCB 板的访问和对象工厂功能。  
**典型用法**:
```pascal
Board := PCBServer.GetCurrentPCBBoard;  // 获取当前活动的 PCB 板
NetClass := PCBServer.PCBClassFactoryByClassMember(eClassMemberKind_Net);  // 创建网络类
NewObj := PCBServer.PCBObjectFactory(ObjId, eNoDimension, eCreate_Default);  // 创建 PCB 对象
PCBServer.PreProcess;  // 开始批量修改
PCBServer.PostProcess;  // 结束批量修改
PCBServer.SendMessageToRobots(Address, c_Broadcast, PCBM_BeginModify, c_NoEventData);  // 发送修改消息
```

### `SchServer`
**类型**: 全局对象  
**用途**: 原理图服务器的核心入口，提供当前原理图文档的访问和对象工厂功能。  
**典型用法**:
```pascal
SchDoc := SchServer.GetCurrentSchDocument;  // 获取当前原理图文档
Lib := SchServer.GetCurrentSchDocument;  // 获取当前原理图库（需判断 ObjectID = eSchLib）
Comp := SchServer.SchObjectFactory(eSchComponent, eCreate_Default);  // 创建原理图元件
Pin := SchServer.SchObjectFactory(ePin, eCreate_Default);  // 创建引脚
SchServer.RobotManager.SendMessage(nil, c_BroadCast, SCHM_PrimitiveRegistration, Addr);  // 注册对象
```

### `Client`
**类型**: 全局对象  
**用途**: Altium 客户端核心对象，负责文档打开、聚焦、消息发送和视图控制。  
**典型用法**:
```pascal
Client.OpenDocument('SCH', FilePath);  // 打开原理图文档
Client.OpenDocument('SchLib', LibPath);  // 打开原理图库
Client.ShowDocument(ServerDoc);  // 显示文档
Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);  // 发送 PCB 重绘命令
Client.SendMessage('PCB:DeSelect', 'Scope=All', 255, Client.CurrentView);  // 取消全部选择
Client.SendMessage('PCB:Select', 'Scope=InsideArea | ObjectKind=Component', 255, Client.CurrentView);  // 交互选择
```

### `GetWorkspace`
**类型**: 函数 → `IWorkspace`  
**用途**: 获取当前工作区对象，用于遍历项目、文档和获取焦点项目。  
**典型用法**:
```pascal
WS := GetWorkspace;
ProjectCount := WS.DM_ProjectCount;
Project := WS.DM_FocusedProject;
for i := 0 to WS.DM_ProjectCount - 1 do
    Project := WS.DM_Projects(i);
```

---

## 二、PCB 核心接口

### `IPCB_Board`
**用途**: 代表一块 PCB 板，是几乎所有 PCB 操作的入口。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `GetCurrentPCBBoard` | 通过 `PCBServer.GetCurrentPCBBoard` 获取 |
| `BoardIterator_Create` | 创建板级迭代器，遍历特定对象类型 |
| `BoardIterator_Destroy(It)` | 销毁迭代器 |
| `XOrigin`, `YOrigin` | 板原点坐标（用于相对坐标计算） |
| `SelectecObjectCount` | 当前选中的对象数量 |
| `SelectecObject[i]` | 获取第 i 个选中对象 |
| `GetPcbComponentByRefDes(Des)` | 通过位号查找元件 |
| `GetNetByName(Name)` | 通过网络名查找网络 |
| `FileName` | 板文件名 |
| `LayerStack_V7` | 获取层栈对象 |
| `LayerColor[LayerID]` | 获取/设置层颜色 |
| `LayerIsDisplayed[LayerID]` | 获取/设置层显示状态 |
| `MechanicalPairs.LayerUsed(ID)` | 检查机械层是否成对使用 |
| `ViewManager_FullUpdate` | 强制刷新视图 |
| `ViewManager_UpdateLayerTabs` | 刷新层标签 |
| `ConnectivelyValidateNets` | 重建网络连通性 |
| `PrimPrimDistance(Prim1, Prim2)` | 计算两个图元间的距离 |
| `AddPCBObject(Obj)` | 向板中添加对象 |
| `BoundingRectangle` | 获取边界矩形（用于碰撞检测） |

### `IPCB_BoardIterator`
**用途**: 遍历 PCB 板上的特定类型对象。  
**典型用法**:
```pascal
Iterator := Board.BoardIterator_Create;
Iterator.AddFilter_ObjectSet(MkSet(eNetObject));        // 过滤对象类型
Iterator.AddFilter_LayerSet(AllLayers);                  // 过滤层
Iterator.AddFilter_Method(eProcessAll);                  // 处理方法
Iterator.AddFilter_IPCB_LayerSet(LayerSet.AllLayers);    // 使用 LayerSet 过滤
Net := Iterator.FirstPCBObject;
while Net <> nil do
begin
    // 处理 Net
    Net := Iterator.NextPCBObject;
end;
Board.BoardIterator_Destroy(Iterator);
```

### `IPCB_Component`
**用途**: PCB 元件对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Name.Text` | 元件位号（如 "R1"） |
| `Identifier` | 元件标识符 |
| `SourceDescription` | 元件描述 |
| `Pattern` | 封装名 |
| `Layer` | 所在层 |
| `Rotation` | 旋转角度 |
| `x`, `y` | 元件位置坐标 |
| `Selected` | 是否被选中 |
| `MoveToXY(X, Y)` | 移动到绝对坐标 |
| `MoveByXY(dX, dY)` | 按偏移量移动 |
| `BeginModify` / `EndModify` | 开始/结束修改 |
| `GroupIterator_Create` | 创建组迭代器（遍历元件内部的焊盘等） |
| `GroupIterator_Destroy(It)` | 销毁组迭代器 |
| `BoundingRectangleNoNameComment` | 不含位号和注释的边界矩形 |

### `IPCB_Pad`
**用途**: PCB 焊盘对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Name` | 焊盘名称 |
| `Net` | 连接的网络（可为 nil） |
| `Net.Name` | 网络名 |
| `x`, `y` | 焊盘位置 |
| `Layer` | 所在层 |
| `Rotation` | 旋转角度 |
| `InComponent` | 是否属于元件 |
| `XSizeOnLayer[Layer]` / `YSizeOnLayer[Layer]` | 层上的尺寸 |
| `ShapeOnLayer[Layer]` | 层上的形状 |
| `BoundingRectangle` | 边界矩形 |

### `IPCB_Net`
**用途**: PCB 网络对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Name` | 网络名 |
| `AddPCBObject(Obj)` | 将图元添加到网络 |
| `AddMemberByName(Name)` | 按名称添加成员到网络类 |

### `IPCB_ObjectClass`
**用途**: PCB 对象类（如 NetClass）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Name` | 类名 |
| `MemberKind` | 成员类型（如 `eClassMemberKind_Net`） |
| `SuperClass` | 是否为超类 |
| `AddMemberByName(Name)` | 添加成员 |

### `IPCB_Primitive`（通用图元）
**用途**: PCB 上所有可绘制对象的基类接口。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `ObjectId` | 对象类型标识（如 `eTrackObject`, `eViaObject`） |
| `Selected` | 是否被选中 |
| `Layer` | 所在层 |
| `Net` | 所属网络 |
| `I_ObjectAddress` | 对象地址（唯一标识） |
| `BeginModify` / `EndModify` | 开始/结束修改 |
| `Replicate` | 复制对象 |
| `BoundingRectangle` | 边界矩形 |
| `PointInPolygon(X, Y)` | 判断点是否在多边形内（仅多边形） |

### `IPCB_Rule`
**用途**: PCB 设计规则对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Descriptor` | 规则描述 |
| `GetState_ShortDescriptorString` | 短描述 |
| `Scope1Expression` / `Scope2Expression` | 作用域表达式 |

---

## 三、原理图核心接口

### `ISch_Document`
**用途**: 原理图文档对象，代表一张原理图纸或原理图库。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `SchIterator_Create` | 创建迭代器 |
| `SchIterator_Destroy(It)` | 销毁迭代器 |
| `RegisterSchObjectInContainer(Obj)` | 注册对象到文档 |
| `GraphicallyInvalidate` | 图形刷新 |
| `ObjectID` | 文档类型（`eSchLib` = 库，`eSch` = 普通原理图） |
| `DocumentName` | 文档名称 |
| `UseCustomSheet` | 是否使用自定义图纸 |
| `GetState_SheetSizeX` / `GetState_SheetSizeY` | 图纸尺寸 |
| `GetState_CustomX` / `GetState_CustomY` | 自定义尺寸 |
| `GetState_SheetStyle` | 图纸样式 |
| `GetState_SnapGridSize` / `GetState_VisibleGridSize` | 栅格大小 |
| `SnapGridOn` / `VisibleGridOn` | 栅格开关 |
| `TitleBlockOn` / `BorderOn` | 标题栏/边框开关 |
| `GetState_TemplateFileName` | 模板文件名 |
| `PlaceSchComponent(LibPath, LibRef, Handle)` | 从库放置元件 |
| `CurrentSchComponent` | 当前选中的库元件（仅库文档） |
| `AddSchComponent(Comp)` | 添加元件到库 |
| `SchLibIterator_Create` | 创建库迭代器（仅库文档） |

### `ISch_Iterator`
**用途**: 遍历原理图文档中的对象。  
**典型用法**:
```pascal
It := SchDoc.SchIterator_Create;
It.AddFilter_ObjectSet(MkSet(eSchComponent));  // 过滤元件
It.AddFilter_ObjectSet(MkSet(eWire, eBus, eNetLabel));  // 过滤多种类型
Component := It.FirstSchObject;
while Component <> nil do
begin
    // 处理 Component
    Component := It.NextSchObject;
end;
SchDoc.SchIterator_Destroy(It);
```

### `ISch_Component`
**用途**: 原理图元件（符号实例或库中的符号定义）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Designator.Text` | 位号文本 |
| `LibReference` | 库引用名 |
| `ComponentDescription` | 元件描述 |
| `PartCount` | 多部件元件的部件数量 |
| `CurrentPartID` | 当前部件 ID |
| `DisplayMode` | 显示模式 |
| `Location` | 位置（`TPoint`） |
| `Orientation` | 旋转方向（`TRotationBy90`: `eRotate0`, `eRotate90`, `eRotate180`, `eRotate270`） |
| `BoundingRectangle` | 边界矩形 |
| `SchIterator_Create` | 创建内部迭代器（遍历参数、引脚等） |
| `AddSchObject(Obj)` | 添加子对象（如引脚、参数） |

### `ISch_Pin`
**用途**: 原理图引脚对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Designator` | 引脚编号 |
| `Name` | 引脚名称 |
| `Electrical` | 电气类型（`TPinElectrical`: `eElectricPassive`, `eElectricInput`, `eElectricOutput` 等） |
| `Orientation` | 方向（`TRotationBy90`） |
| `Location` | 位置 |
| `OwnerPartId` | 所属部件 ID（0 = 共享） |
| `OwnerPartDisplayMode` | 显示模式 |

### `ISch_Parameter`
**用途**: 原理图参数对象（元件参数或文档参数）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Name` | 参数名 |
| `Text` | 参数值 |

### `ISch_Wire`
**用途**: 原理图导线对象（多段折线）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Location` | 起点位置 |
| `InsertVertex` | 插入顶点索引 |
| `SetState_Vertex(Index, Point)` | 设置顶点坐标 |
| `VerticesCount` | 顶点数量（多边形/折线通用） |

### `ISch_Bus` / `ISch_BusEntry`
**用途**: 原理图总线及总线入口。  
**用法**: 与 `ISch_Wire` 类似，使用 `InsertVertex` 和 `SetState_Vertex` 设置顶点。

### `ISch_NetLabel`
**用途**: 网络标签对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Text` | 标签文本（网络名） |
| `Location` | 位置 |
| `Orientation` | 旋转方向 |

### `ISch_Label`
**用途**: 普通文本标签。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Text` | 文本内容 |
| `Location` | 位置 |

### `ISch_PowerObject`
**用途**: 电源端口对象（VCC、GND 等）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Text` | 网络名 |
| `Location` | 位置 |
| `Orientation` | 旋转方向 |
| `SetState_Style(Style)` | 设置样式（`TPowerObjectStyle`） |
| `SetState_ShowNetName(Show)` | 设置是否显示网络名 |

**电源样式枚举 `TPowerObjectStyle`**:
- `ePowerCircle` - 圆形
- `ePowerArrow` - 箭头
- `ePowerBar` - 条形
- `ePowerWave` - 波浪
- `ePowerGndPower` - 电源地
- `ePowerGndSignal` - 信号地
- `ePowerGndEarth` - 大地

### `ISch_Port`
**用途**: 原理图端口（用于层次化设计）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Name` | 端口名 |
| `Location` | 位置 |

### `ISch_Junction`
**用途**: 导线连接点（T 型交叉点）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Location` | 位置 |

### `ISch_SheetSymbol`
**用途**: 图纸符号（子图引用）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `SheetFileName` | 引用的图纸文件名 |
| `SheetName` | 图纸名称 |

### `ISch_GraphicalObject`
**用途**: 所有原理图图形对象的基接口。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `BoundingRectangle` | 边界矩形（`TCoordRect`: Left, Right, Top, Bottom） |

### `ISch_Polygon` / `ISch_Line` / `ISch_Rectangle` 等
**用途**: 各类图形对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `VerticesCount` | 顶点数量 |
| `GetState_Vertex(Index)` | 获取顶点（返回 `TLocation`） |
| `Location` / `Corner` | 起点/终点（线段） |
| `AreaColor` / `Color` | 填充色/边框色（BGR 格式） |
| `IsSolid` | 是否实心填充 |
| `LineWidth` | 线宽（`eSmall`, `eMedium`, `eLarge`） |
| `OwnerPartId` | 所属部件 |

---

## 四、工作区与项目接口

### `IWorkspace`
**用途**: 工作区对象，管理所有打开的项目。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `DM_ProjectCount` | 项目数量 |
| `DM_Projects(Index)` | 获取指定索引的项目 |
| `DM_FocusedProject` | 当前焦点项目 |

### `IProject`
**用途**: 项目对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `DM_ProjectFullPath` | 项目完整路径 |
| `DM_LogicalDocumentCount` | 逻辑文档数量 |
| `DM_LogicalDocuments(Index)` | 获取指定索引的文档 |
| `DM_OpenAndFocusDocument` | 打开并聚焦文档 |

### `IDocument`
**用途**: 项目中的逻辑文档。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `DM_DocumentKind` | 文档类型（`'SCH'`, `'PCB'`, `'SCHLIB'`, `'OUTPUTJOB'` 等） |
| `DM_FullPath` | 文档完整路径 |

### `IServerDocument`
**用途**: 服务器级别的文档对象，用于打开/显示文档。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `ObjectID` / `ObjectId` | 对象类型标识 |
| `Focus()` | 聚焦文档 |

---

## 五、层与层栈接口

### `IPCB_LayerStack_V7`
**用途**: PCB 层栈对象（V7 版本）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `FirstLayer` | 获取第一层 |
| `NextLayer(LayerObj)` | 获取下一层 |
| `LayersInStackCount` | 层栈中的层数 |
| `SignalLayerCount` | 信号层数量 |
| `LayerObject_V7[LayerID]` | 通过层 ID 获取层对象 |

### `IPCB_LayerObject`
**用途**: 层对象（铜层/电气层）。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Name` | 层名 |
| `LayerID` / `V6_LayerID` | 层 ID |
| `IsDisplayed[Board]` | 是否显示 |
| `CopperThickness` | 铜厚（内部单位） |
| `Dielectric` | 介质属性 |

### `IPCB_MechanicalLayer`
**用途**: 机械层对象。  
**常用属性/方法**:
| 属性/方法 | 说明 |
|-----------|------|
| `Name` | 层名 |
| `V6_LayerID` | 层 ID |
| `MechanicalLayerEnabled` | 是否启用 |
| `IsDisplayed[Board]` | 是否显示 |
| `LinkToSheet` | 是否链接到图纸 |

### `ILayer`
**用途**: 层常量集合，用于通过名称获取层 ID。  
**典型用法**:
```pascal
LayerID := ILayer.MechanicalLayer(1);  // 获取机械层 1 的 ID
```

### `LayerSet`
**用途**: 预定义的层集合常量。  
**常用成员**:
| 成员 | 说明 |
|------|------|
| `LayerSet.AllLayers` | 所有层 |
| `LayerSet.SignalLayers` | 所有信号层 |

### `String2Layer` / `Layer2String`
**用途**: 层名称与层 ID 的相互转换。  
**典型用法**:
```pascal
LayerID := String2Layer('Top Overlay');  // 名称 → ID
LayerName := Layer2String(Pad.Layer);     // ID → 名称
```

---

## 六、对象类型常量（TObjectId）

### PCB 对象类型
| 常量 | 说明 |
|------|------|
| `eNetObject` | 网络 |
| `eComponentObject` | 元件 |
| `ePadObject` | 焊盘 |
| `eTrackObject` | 走线 |
| `eArcObject` | 圆弧 |
| `eViaObject` | 过孔 |
| `ePolyObject` | 多边形 |
| `eRegionObject` | 区域 |
| `eFillObject` | 填充 |
| `eClassObject` | 对象类 |
| `eRuleObject` | 设计规则 |

### 原理图对象类型
| 常量 | 说明 |
|------|------|
| `eSchComponent` | 元件 |
| `ePin` | 引脚 |
| `eParameter` | 参数 |
| `eWire` | 导线 |
| `eBus` | 总线 |
| `eBusEntry` | 总线入口 |
| `eNetLabel` | 网络标签 |
| `eLabel` | 文本标签 |
| `ePowerObject` | 电源对象 |
| `eJunction` | 连接点 |
| `ePort` | 端口 |
| `eSheetSymbol` | 图纸符号 |
| `eLine` | 直线 |
| `ePolyline` | 折线 |
| `ePolygon` | 多边形 |
| `eRectangle` | 矩形 |
| `eEllipse` | 椭圆 |
| `eArc` | 圆弧 |
| `eRoundRectangle` | 圆角矩形 |
| `eImage` | 图像 |
| `eTextFrame` | 文本框 |
| `eNoERC` | 无 ERC 标记 |
| `eCompileMask` | 编译掩码 |
| `eCrossSheetConnector` | 跨页连接器 |
| `eConnectionLine` | 连接线 |
| `eSchLib` | 原理图库文档类型 |

---

## 七、坐标与单位转换

### 核心函数
| 函数 | 说明 |
|------|------|
| `MilsToCoord(Mils)` | 将 mil 转换为 Altium 内部坐标单位 |
| `CoordToMils(Coord)` | 将内部坐标转换为 mil |
| `Point(X, Y)` | 创建 `TPoint` 坐标点 |
| `FloatToStr(Value)` / `StrToFloat(S)` | 浮点数与字符串转换 |
| `IntToStr(Value)` / `StrToInt(S)` | 整数与字符串转换 |

---

## 八、JSON 工具函数

这些函数在 `json_utils.pas` 中定义，用于构建和输出 JSON：

| 函数/过程 | 说明 |
|-----------|------|
| `JSONEscapeString(S)` | 转义 JSON 特殊字符 |
| `JSONPairStr(Name, Value, IsString)` | 创建 JSON 键值对 |
| `BuildJSONObject(Pairs, IndentLevel)` | 从字符串列表构建 JSON 对象 |
| `BuildJSONArray(Items, ArrayName, IndentLevel)` | 从字符串列表构建 JSON 数组 |
| `AddJSONProperty(List, Name, Value, IsString)` | 添加字符串属性到列表 |
| `AddJSONNumber(List, Name, Value)` | 添加数值属性 |
| `AddJSONInteger(List, Name, Value)` | 添加整数属性 |
| `AddJSONBoolean(List, Name, Value)` | 添加布尔属性 |
| `WriteJSONToFile(JSON, FileName)` | 写入 JSON 到文件并返回内容 |
| `TrimJSON(InputStr)` | 去除 JSON 值的引号和逗号 |

---

## 九、按脚本文件分类的接口汇总

### `Altium_API.pas` — 命令路由与桥接
- **核心职责**: 读取 `request.json`，解析命令名和参数，分发到具体函数，将结果写入 `response.json`
- **使用的接口**: `GetWorkspace`, `IWorkspace`, `Client`, `TStringList`, `FileExists`, `Sleep`
- **命令映射**: `get_component_pins`, `get_all_nets`, `create_net_class`, `get_all_component_data`, `take_view_screenshot`, `get_library_symbol_reference`, `create_schematic_symbol`, `get_schematic_data`, `schematic_edit`, `get_pcb_layers`, `set_pcb_layer_visibility`, `get_pcb_layer_stackup`, `get_selected_components_coordinates`, `set_component_position`, `move_components`, `layout_duplicator`, `layout_duplicator_apply`, `get_pcb_rules`, `get_output_job_containers`, `run_output_jobs`, `search_library_symbol`, `list_workspace`, `ping`

### `pcb_utils.pas` — PCB 数据查询与操作
- **核心职责**: 获取 PCB 网络、层、规则、元件数据，设置层可见性，移动元件，获取引脚数据
- **使用的核心接口**: `PCBServer`, `IPCB_Board`, `IPCB_BoardIterator`, `IPCB_Component`, `IPCB_Pad`, `IPCB_Net`, `IPCB_Rule`, `IPCB_LayerStack_V7`, `IPCB_LayerObject`, `IPCB_MechanicalLayer`, `IPCB_ObjectClass`, `IPCB_GroupIterator`

### `schematic_utils.pas` — 原理图数据查询与库操作
- **核心职责**: 获取原理图数据（支持过滤查询），创建/搜索库符号，获取引脚参考
- **使用的核心接口**: `SchServer`, `ISch_Document`, `ISch_Lib`, `ISch_Component`, `ISch_Iterator`, `ISch_Pin`, `ISch_Parameter`, `ISch_GraphicalObject`, `ISch_Wire`, `ISch_NetLabel`, `ISch_Label`, `ISch_Port`, `ISch_Junction`, `ISch_SheetSymbol`, `ISch_Polygon`, `ISch_Line`, `IWorkspace`, `IProject`, `IDocument`, `Client`

### `schematic_edit.pas` — 原理图编辑操作
- **核心职责**: 放置元件、添加导线/总线/网络标签/电源端口/文本、设置元件位置和参数
- **使用的核心接口**: `SchServer`, `ISch_Document`, `ISch_Component`, `ISch_Pin`, `ISch_Parameter`, `ISch_Wire`, `ISch_Bus`, `ISch_BusEntry`, `ISch_NetLabel`, `ISch_Label`, `ISch_PowerObject`, `ISch_Rectangle`, `IWorkspace`, `IProject`, `IDocument`, `Client`

### `pcb_layout_duplicator.pas` — PCB 布局复制
- **核心职责**: 复制选中对象的布局（走线、过孔、铜皮等）并应用到目标元件
- **使用的核心接口**: `PCBServer`, `IPCB_Board`, `IPCB_BoardIterator`, `IPCB_Component`, `IPCB_Pad`, `IPCB_GroupIterator`, `IPCB_Primitive`, `IPCB_Net`, `TObjectList`

### `other_utils.pas` — 文档管理与输出任务
- **核心职责**: 文档聚焦、工作区概览、输出任务容器查询与执行、截图准备
- **使用的核心接口**: `GetWorkspace`, `IWorkspace`, `IProject`, `IDocument`, `IServerDocument`, `PCBServer`, `SchServer`, `Client`, `TIniFile`, `TOpenDialog`

### `json_utils.pas` — JSON 序列化工具
- **核心职责**: 提供 JSON 构建、转义、文件写入等通用工具函数
- **使用的接口**: 纯 Delphi 标准类型（`TStringList` 等），无 Altium 特定接口

---

## 十、关键注意事项

1. **坐标系统**: Altium 内部使用 `TCoord`（整数单位），1 mil ≈ 10000 内部单位（近似）。对外暴露的函数通常使用 `MilsToCoord`/`CoordToMils` 转换。

2. **迭代器必须销毁**: 使用 `BoardIterator_Create` / `SchIterator_Create` 创建的迭代器必须成对调用 `BoardIterator_Destroy` / `SchIterator_Destroy`，否则会导致内存泄漏或访问冲突。

3. **PreProcess / PostProcess**: 批量修改 PCB 对象时，需要用 `PCBServer.PreProcess` 和 `PCBServer.PostProcess` 包裹，否则修改可能不生效。

4. **RobotManager 消息**: 修改对象后通常需要发送消息通知系统更新，如 `PCBM_BeginModify`, `PCBM_EndModify`, `PCBM_BoardRegisteration`, `SCHM_PrimitiveRegistration`。

5. **文档聚焦**: 很多操作要求目标文档处于焦点状态。`EnsureDocumentFocused` 函数会根据命令类型自动尝试聚焦正确的文档类型（PCB/SCH/SCHLIB/OUTJOB）。

6. **原理图库迭代器**: 遍历 `.SchLib` 文档时必须使用 `SchLibIterator_Create`（而非 `SchIterator_Create`）。

7. **电源端口样式**: `TPowerObjectStyle` 控制电源符号的图形样式，与网络名是独立的概念。
