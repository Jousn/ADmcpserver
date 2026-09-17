// Find a PCB component by designator using BoardIterator + Comp.Name.Text comparison.
// Verified pattern: DesignReuse.pas L274-L294 (iterator + Name.Text = designator)
// GetPcbComponentByRefDes does NOT exist in DelphiScript (0 matches in reference libraries).
function FindPcbComponentByRefDes(Board: IPCB_Board; const Designator: String): IPCB_Component;
var
    Iterator: IPCB_BoardIterator;
    Comp: IPCB_Component;
begin
    Result := nil;
    if (Board = nil) or (Designator = '') then
        Exit;
    Iterator := Board.BoardIterator_Create;
    Iterator.AddFilter_ObjectSet(MkSet(eComponentObject));
    Iterator.AddFilter_LayerSet(AllLayers);
    Iterator.AddFilter_Method(eProcessAll);
    Comp := Iterator.FirstPCBObject;
    while Comp <> nil do
    begin
        if AnsiCompareText(Trim(Comp.Name.Text), Trim(Designator)) = 0 then
        begin
            Result := Comp;
            Break;
        end;
        Comp := Iterator.NextPCBObject;
    end;
    Board.BoardIterator_Destroy(Iterator);
end;

// Find a free (not in-component) pad by Name. If PadName='' returns the first free pad.
// Restricts to pads NOT inside a component (pad.InComponent=false) to avoid modifying
// footprint-owned pads when user asks for a named standalone pad.
// Verified pattern: PCBObjectInspector.pas (iterator + ePadObject + Pad.Name comparison).
function FindFreePadByName(Board: IPCB_Board; const PadName: String): IPCB_Pad2;
var
    Iterator: IPCB_BoardIterator;
    Pad: IPCB_Pad2;
begin
    Result := nil;
    if Board = nil then Exit;
    Iterator := Board.BoardIterator_Create;
    Iterator.AddFilter_ObjectSet(MkSet(ePadObject));
    Iterator.AddFilter_LayerSet(AllLayers);
    Iterator.AddFilter_Method(eProcessAll);
    Pad := Iterator.FirstPCBObject;
    while Pad <> nil do
    begin
        if (not Pad.InComponent) then
        begin
            if (PadName = '') or (AnsiCompareText(Trim(Pad.Name), Trim(PadName)) = 0) then
            begin
                Result := Pad;
                Break;
            end;
        end;
        Pad := Iterator.NextPCBObject;
    end;
    Board.BoardIterator_Destroy(Iterator);
end;

// Parse pad shape string to TShape enum.
// Accepts: rounded|rectangular|octagonal|circle|arc|roundrect|rotatedrect|
//          eRounded|eRectangular|eOctagonal|eCircleShape|eRoundRectShape|eRotatedRectShape
function PcbEditParseShapeFromString(const S: String): TShape;
var
    T: String;
begin
    T := LowerCase(Trim(S));
    if (T = '') or (T = 'erounded') or (T = 'rounded') or (T = 'circle') or (T = 'ecircleshape') then
        Result := eRounded
    else if (T = 'erectangular') or (T = 'rectangular') or (T = 'rect') then
        Result := eRectangular
    else if (T = 'eoctagonal') or (T = 'octagonal') or (T = 'octagon') then
        Result := eOctagonal
    else if (T = 'earcshape') or (T = 'arc') then
        Result := eArcShape
    else if (T = 'eroundrectshape') or (T = 'eroundedrectangular') or (T = 'roundrect') or (T = 'roundedrect') then
        Result := eRoundRectShape
    else if (T = 'erotatedrectshape') or (T = 'rotatedrect') then
        Result := eRotatedRectShape
    else
        Result := eRounded; // default
end;

// Parse power plane connect style string to TPlaneConnectStyle.
// Accepts: direct|relief|none|edirectconnecttoplane|ereliefconnecttoplane|enoconnect
function PcbEditParsePlaneConnectFromString(const S: String): TPlaneConnectStyle;
var
    T: String;
begin
    T := LowerCase(Trim(S));
    if (T = 'edirectconnecttoplane') or (T = 'direct') or (T = 'directconnect') then
        Result := eDirectConnectToPlane
    else if (T = 'eReliefConnectToPlane') or (T = 'relief') or (T = 'thermal') or (T = 'reliefconnect') then
        Result := eReliefConnectToPlane
    else if (T = 'enoconnect') or (T = 'none') or (T = 'noconnect') then
        Result := eNoConnect
    else
        Result := eReliefConnectToPlane; // default = relief / 热风焊盘
end;

// Parse TRegionKind string. Verified: 05_枚举与常量参考.md §5 + PCBObjectInspector sRegionKindStrings.
// Accepts: copper|cutout|named_region|namedregion|board_cutout|boardcutout|cavity or eRegionKind_* or numeric 0-4
function PcbEditParseRegionKindFromString(const S: String): TRegionKind;
var
    T: String;
    N: Integer;
begin
    T := LowerCase(Trim(S));
    if T = '' then begin Result := eRegionKind_Copper; Exit; end;
    if (T = 'eregionkind_copper') or (T = 'copper') then Result := eRegionKind_Copper
    else if (T = 'eregionkind_cutout') or (T = 'cutout') then Result := eRegionKind_Cutout
    else if (T = 'eregionkind_namedregion') or (T = 'named_region') or (T = 'namedregion') then Result := eRegionKind_NamedRegion
    else if (T = 'eregionkind_boardcutout') or (T = 'board_cutout') or (T = 'boardcutout') then Result := eRegionKind_BoardCutout
    else if (T = 'eregionkind_cavity') or (T = 'cavity') then Result := eRegionKind_Cavity
    else begin
        if TryStrToInt(T, N) then begin
            if (N >= 0) and (N <= 4) then Result := TRegionKind(N) else Result := eRegionKind_Copper;
        end else Result := eRegionKind_Copper;
    end;
end;

// Parse TComponentKind string. Verified: 05_枚举与常量参考.md §8 + PCBObjectInspector sComponentKindStrings.
function PcbEditParseComponentKindFromString(const S: String): TComponentKind;
var
    T: String;
    N: Integer;
begin
    T := LowerCase(Trim(S));
    if T = '' then begin Result := eComponentKind_Standard; Exit; end;
    if (T = 'ecomponentkind_standard') or (T = 'standard') then Result := eComponentKind_Standard
    else if (T = 'ecomponentkind_mechanical') or (T = 'mechanical') or (T = 'mech') then Result := eComponentKind_Mechanical
    else if (T = 'ecomponentkind_graphical') or (T = 'graphical') then Result := eComponentKind_Graphical
    else if (T = 'ecomponentkind_nettie_bom') or (T = 'nettie_bom') or (T = 'net_tie_bom') then Result := eComponentKind_NetTie_BOM
    else if (T = 'ecomponentkind_nettie_nobom') or (T = 'nettie_nobom') or (T = 'net_tie_nobom') then Result := eComponentKind_NetTie_NoBOM
    else if (T = 'ecomponentkind_standard_nobom') or (T = 'standard_nobom') then Result := eComponentKind_Standard_NoBOM
    else if (T = 'ecomponentkind_jumper') or (T = 'jumper') then Result := eComponentKind_Jumper
    else begin
        if TryStrToInt(T, N) then begin
            if (N >= 0) and (N <= 6) then Result := TComponentKind(N) else Result := eComponentKind_Standard;
        end else Result := eComponentKind_Standard;
    end;
end;

// Parse TBoardSide string. Verified: PCBObjectInspector sBoardSideStrings = [eBoardSide_Top, eBoardSide_Bottom].
function PcbEditParseBoardSideFromString(const S: String): TBoardSide;
var
    T: String;
begin
    T := LowerCase(Trim(S));
    if (T = 'eboardside_bottom') or (T = 'bottom') or (T = 'bot') then Result := eBoardSide_Bottom
    else Result := eBoardSide_Top;
end;

// Parse TPolyHatchStyle string/int. Verified: 05_枚举与常量参考.md §4 + PCBObjectInspector sPolyHatchStyleStrings.
// Returns Integer (0-5) so it can be used with .PolyHatchStyle directly.
function PcbEditParseHatchStyleFromString(const S: String): Integer;
var
    T: String;
    N: Integer;
begin
    T := LowerCase(Trim(S));
    if T = '' then begin Result := Integer(ePolySolid); Exit; end;
    if (T = 'epolyhatch90') or (T = 'hatch90') or (T = '90') then Result := Integer(ePolyHatch90)
    else if (T = 'epolyhatch45') or (T = 'hatch45') or (T = '45') then Result := Integer(ePolyHatch45)
    else if (T = 'epolyvhatch') or (T = 'vhatch') or (T = 'v') then Result := Integer(ePolyVHatch)
    else if (T = 'epolyhhatch') or (T = 'hhatch') or (T = 'h') then Result := Integer(ePolyHHatch)
    else if (T = 'epolynohatch') or (T = 'none') or (T = 'nohatch') then Result := Integer(ePolyNoHatch)
    else if (T = 'epolysolid') or (T = 'solid') then Result := Integer(ePolySolid)
    else begin
        if TryStrToInt(T, N) and (N >= 0) and (N <= 5) then Result := N else Result := Integer(ePolySolid);
    end;
end;

// Parse TPolygonPourOver string/int. Verified: PCBObjectInspector sPolygonPourOverStrings.
// Accepts: none|same_net|same_net_polygons or integer 0-2
function PcbEditParsePourOverFromString(const S: String): Integer;
var
    T: String;
    N: Integer;
begin
    T := LowerCase(Trim(S));
    if T = '' then begin Result := 1; Exit; end; // default ePolygonPourOver_SameNet
    if (T = 'epolygonpourover_none') or (T = 'none') then Result := 0
    else if (T = 'epolygonpourover_samenet') or (T = 'same_net') or (T = 'samenet') then Result := 1
    else if (T = 'epolygonpourover_samenetpolygons') or (T = 'same_net_polygons') or (T = 'all') then Result := 2
    else begin
        if TryStrToInt(T, N) and (N >= 0) and (N <= 2) then Result := N else Result := 1;
    end;
end;

// Returns True when the string looks like a true-ish boolean literal (and is non-empty).
// Helper used for common IsKeepout / Moveable / PrimitiveLock / UseOctagons / RemoveDead flags.
function PcbEditParseBoolFromString(const S: String; out Present: Boolean): Boolean;
var
    T: String;
begin
    Present := S <> '';
    if not Present then begin Result := True; Exit; end;
    T := LowerCase(Trim(S));
    Result := not ((T = 'false') or (T = '0') or (T = 'no') or (T = 'n') or (T = 'off'));
end;

// Find a PCB net by name using BoardIterator + eNetObject filter.
// Verified pattern: FixConnections.pas L806-L811 (Iterator + MkSet(eNetObject) + Net.Name)
// Board.GetNetByName does NOT exist in DelphiScript (0 matches in reference libraries).
function FindNetByName(Board: IPCB_Board; const NetName: String): IPCB_Net;
var
    NetIterator: IPCB_BoardIterator;
    NetObj: IPCB_Net;
begin
    Result := nil;
    if (Board = nil) or (NetName = '') then
        Exit;
    NetIterator := Board.BoardIterator_Create;
    NetIterator.SetState_FilterAll;
    NetIterator.AddFilter_ObjectSet(MkSet(eNetObject));
    NetIterator.AddFilter_Method(eProcessAll);
    NetObj := NetIterator.FirstPCBObject;
    while NetObj <> nil do
    begin
        if AnsiCompareText(NetObj.Name, NetName) = 0 then
        begin
            Result := NetObj;
            Break;
        end;
        NetObj := NetIterator.NextPCBObject;
    end;
    Board.BoardIterator_Destroy(NetIterator);
end;

// Function to get all unique net names from the current PCB document
function GetAllNets(ROOT_DIR: String): String;
var
    Board       : IPCB_Board;
    Net         : IPCB_Net;
    Iterator    : IPCB_BoardIterator;
    NetsArray   : TStringList; 
    OutputLines : TStringList;
begin
    // Initialize empty array result in case no board is found
    Result := '[]';
    
    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then Exit;

    // Create array for storing unique nets
    NetsArray := TStringList.Create;
    // Set Duplicates property to prevent duplicate net names
    NetsArray.Duplicates := dupIgnore;
    NetsArray.Sorted := True;
    
    try
        // Create the iterator that will look for Net objects only
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eNetObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);

        // Search for Net objects and get their Net Name values
        Net := Iterator.FirstPCBObject;
        while (Net <> nil) do
        begin
            // Add each net name to the list, duplicates will be ignored
            NetsArray.Add('"' + JSONEscapeString(Net.Name) + '"');
            Net := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
        
        // Build the final JSON array
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONArray(NetsArray);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR+'\temp_nets_data.json');
        finally
            OutputLines.Free;
        end;
    finally
        NetsArray.Free;
    end;
end;

// Function to create a net class and add nets to it
function CreateNetClass(ClassName: String; NetNames: TStringList): String;
var
    Board       : IPCB_Board;
    ClassExists : Boolean;
    NetClass    : IPCB_ObjectClass;
    ClassIterator : IPCB_BoardIterator;
    i           : Integer;
    ResultProps : TStringList;
    AddedCount  : Integer;
    OutputLines : TStringList;
begin
    // Initialize result
    ResultProps := TStringList.Create;
    AddedCount := 0;
    ClassExists := False;
    
    try
        // Retrieve the current board
        Board := PCBServer.GetCurrentPCBBoard;
        if (Board = nil) then
        begin
            AddJSONBoolean(ResultProps, 'success', False);
            AddJSONProperty(ResultProps, 'error', 'No PCB document is currently active');
            
            OutputLines := TStringList.Create;
            try
                OutputLines.Text := BuildJSONObject(ResultProps);
                Result := OutputLines.Text;
            finally
                OutputLines.Free;
            end;
            Exit;
        end;
        
        // Search for existing class with the same name
        ClassIterator := Board.BoardIterator_Create;
        ClassIterator.SetState_FilterAll;
        ClassIterator.AddFilter_ObjectSet(MkSet(eClassObject));
        
        NetClass := ClassIterator.FirstPCBObject;
        while (NetClass <> nil) do
        begin
            if (NetClass.MemberKind = eClassMemberKind_Net) and (NetClass.Name = ClassName) then
            begin
                ClassExists := True;
                Break;
            end;
            NetClass := ClassIterator.NextPCBObject;
        end;
        
        // If class doesn't exist, create it
        if not ClassExists then
        begin
            PCBServer.PreProcess;
            try
                NetClass := PCBServer.PCBClassFactoryByClassMember(eClassMemberKind_Net);
                NetClass.SuperClass := False;
                NetClass.Name := ClassName;
                Board.AddPCBObject(NetClass);
                PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, NetClass.I_ObjectAddress);
            finally
                PCBServer.PostProcess;
            end;
        end;
        
        // Add nets to the class
        PCBServer.PreProcess;
        for i := 0 to NetNames.Count - 1 do
        begin
            // Add each net to the class
            if NetClass.AddMemberByName(NetNames[i]) then
                AddedCount := AddedCount + 1;
        end;
        PCBServer.PostProcess;
        
        // Clean up iterator
        Board.BoardIterator_Destroy(ClassIterator);
        
        // Build result JSON
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'class_name', ClassName);
        AddJSONBoolean(ResultProps, 'class_created', not ClassExists);
        AddJSONInteger(ResultProps, 'nets_added', AddedCount);
        
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := OutputLines.Text;
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
    end;
end;

// Function to get detailed layer stackup information
function GetPCBLayerStackup(ROOT_DIR): String;
var
    Board           : IPCB_Board;
    LayerIterator   : IPCB_LayerObjectIterator;
    LayerObject     : IPCB_LayerObject;
    StackupArray    : TStringList;
    LayerProps      : TStringList;
    OutputLines     : TStringList;
    TotalThickness  : Double;
    LayerCount      : Integer;
begin
    Result := '';

    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if (Board = nil) then
    begin
        Result := '{"error": "No PCB document is currently active"}';
        Exit;
    end;

    // Create arrays for stackup data
    StackupArray := TStringList.Create;
    TotalThickness := 0;
    LayerCount := 0;
    
    try
        // Get the electrical layer iterator
        LayerIterator := Board.ElectricalLayerIterator;
        
        // Process each electrical layer
        while LayerIterator.Next do
        begin
            LayerObject := LayerIterator.LayerObject;
            
            // Create layer properties
            LayerProps := TStringList.Create;
            try
                // Basic layer information
                AddJSONProperty(LayerProps, 'layer_name', LayerObject.Name);
                AddJSONProperty(LayerProps, 'layer_id', Layer2String(LayerObject.LayerID));
                AddJSONProperty(LayerProps, 'material_type', 'Copper');
                AddJSONNumber(LayerProps, 'copper_thickness_mils', LayerObject.CopperThickness / 10000);
                AddJSONNumber(LayerProps, 'copper_thickness_um', LayerObject.CopperThickness / 254);
                
                // Add copper thickness to total
                TotalThickness := TotalThickness + (LayerObject.CopperThickness / 10000);
                
                // Dielectric information (if present)
                if LayerObject.Dielectric.DielectricType <> eNoDielectric then
                begin
                    case LayerObject.Dielectric.DielectricType of
                        eCore: AddJSONProperty(LayerProps, 'dielectric_type', 'Core');
                        ePrePreg: AddJSONProperty(LayerProps, 'dielectric_type', 'PrePreg');
                        eSurfaceMaterial: AddJSONProperty(LayerProps, 'dielectric_type', 'Surface Material');
                    else
                        AddJSONProperty(LayerProps, 'dielectric_type', 'Unknown');
                    end;
                    
                    AddJSONProperty(LayerProps, 'dielectric_material', LayerObject.Dielectric.DielectricMaterial);
                    AddJSONNumber(LayerProps, 'dielectric_height_mils', LayerObject.Dielectric.DielectricHeight / 10000);
                    AddJSONNumber(LayerProps, 'dielectric_height_um', LayerObject.Dielectric.DielectricHeight / 254);
                    AddJSONNumber(LayerProps, 'dielectric_constant', LayerObject.Dielectric.DielectricConstant);
                    
                    // Add dielectric thickness to total
                    TotalThickness := TotalThickness + (LayerObject.Dielectric.DielectricHeight / 10000);
                end
                else
                begin
                    AddJSONProperty(LayerProps, 'dielectric_type', 'No Dielectric');
                    AddJSONProperty(LayerProps, 'dielectric_material', '');
                    AddJSONNumber(LayerProps, 'dielectric_height_mils', 0);
                    AddJSONNumber(LayerProps, 'dielectric_height_um', 0);
                    AddJSONNumber(LayerProps, 'dielectric_constant', 0);
                end;
                
                // Add layer order
                AddJSONInteger(LayerProps, 'layer_order', LayerCount + 1);
                
                // Add to stackup array
                StackupArray.Add(BuildJSONObject(LayerProps, 1));
                LayerCount := LayerCount + 1;
            finally
                LayerProps.Free;
            end;
        end;
        
        // Create final stackup object with summary
        LayerProps := TStringList.Create;
        try
            AddJSONInteger(LayerProps, 'total_layers', LayerCount);
            AddJSONNumber(LayerProps, 'total_thickness_mils', TotalThickness);
            AddJSONNumber(LayerProps, 'total_thickness_mm', TotalThickness * 0.0254);
            AddJSONProperty(LayerProps, 'board_name', ExtractFileName(Board.FileName));
            
            // Add the layers array
            LayerProps.Add(BuildJSONArray(StackupArray, 'layers'));
            
            // Build the final JSON
            OutputLines := TStringList.Create;
            try
                OutputLines.Text := BuildJSONObject(LayerProps);
                Result := WriteJSONToFile(OutputLines, ROOT_DIR+'\temp_stackup_data.json');
            finally
                OutputLines.Free;
            end;
        finally
            LayerProps.Free;
        end;
    finally
        StackupArray.Free;
    end;
end;

// Function to get all layer information from the PCB
function GetPCBLayers(ROOT_DIR: String): String;
var
    Board           : IPCB_Board;
    TheLayerStack   : IPCB_LayerStack_V7;
    LayerObj        : IPCB_LayerObject;
    MechLayer       : IPCB_MechanicalLayer;
    AllLayersArray  : TStringList;
    CopperArray     : TStringList;
    MechArray       : TStringList;
    OtherArray      : TStringList;
    LayerProps      : TStringList;
    i               : Integer;
    OutputLines     : TStringList;
begin
    Result := '';

    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if (Board = nil) then
    begin
        Result := '[]';
        Exit;
    end;
    
    // Get the layer stack
    TheLayerStack := Board.LayerStack_V7;
    if (TheLayerStack = nil) then
    begin
        Result := '[]';
        Exit;
    end;

    // Create arrays for different layer categories
    AllLayersArray := TStringList.Create;
    CopperArray := TStringList.Create;
    MechArray := TStringList.Create;
    OtherArray := TStringList.Create;
    
    try
        // Process copper (electrical) layers
        LayerObj := TheLayerStack.FirstLayer;
        while (LayerObj <> nil) do
        begin
            // Create layer properties
            LayerProps := TStringList.Create;
            try
                // Add properties
                AddJSONProperty(LayerProps, 'name', LayerObj.Name);
                AddJSONProperty(LayerProps, 'layer_id', IntToStr(LayerObj.V6_LayerID));
                AddJSONProperty(LayerProps, 'layer_type', 'copper');

                if LayerSet.SignalLayers.Contains(LayerObj.V6_LayerID) then
                    AddJSONProperty(LayerProps, 'is_signal', 'true', False)
                else
                    AddJSONProperty(LayerProps, 'is_signal', 'false', False);

                if not LayerSet.SignalLayers.Contains(LayerObj.V6_LayerID) then
                    AddJSONProperty(LayerProps, 'is_plane', 'true', False)
                else
                    AddJSONProperty(LayerProps, 'is_plane', 'false', False);

                AddJSONBoolean(LayerProps, 'is_displayed', LayerObj.IsDisplayed[Board]);
                AddJSONBoolean(LayerProps, 'is_enabled', True);
                AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[LayerObj.LayerID]));
                
                // Add to copper array
                CopperArray.Add(BuildJSONObject(LayerProps, 1));
            finally
                LayerProps.Free;
            end;
            
            LayerObj := TheLayerStack.NextLayer(LayerObj);
        end;
        
        // Process mechanical layers
        for i := 1 to 32 do
        begin
            MechLayer := TheLayerStack.LayerObject_V7[ILayer.MechanicalLayer(i)];
            
            if MechLayer.MechanicalLayerEnabled then
            begin
                // Create layer properties
                LayerProps := TStringList.Create;
                try
                    // Add properties
                    AddJSONProperty(LayerProps, 'name', MechLayer.Name);
                    AddJSONProperty(LayerProps, 'layer_id', IntToStr(MechLayer.V6_LayerID));
                    AddJSONProperty(LayerProps, 'layer_type', 'mechanical');
                    AddJSONProperty(LayerProps, 'mechanical_number', IntToStr(i));
                    AddJSONBoolean(LayerProps, 'is_displayed', MechLayer.IsDisplayed[Board]);
                    AddJSONBoolean(LayerProps, 'is_enabled', MechLayer.MechanicalLayerEnabled);
                    AddJSONBoolean(LayerProps, 'link_to_sheet', MechLayer.LinkToSheet);
                    AddJSONBoolean(LayerProps, 'is_paired', Board.MechanicalPairs.LayerUsed(ILayer.MechanicalLayer(i)));
                    AddJSONProperty(LayerProps, 'color', ColorToString(PCBServer.SystemOptions.LayerColors[MechLayer.V6_LayerID]));
                    
                    // If layer is paired, add the pair information
                    if Board.MechanicalPairs.LayerUsed(ILayer.MechanicalLayer(i)) then
                    begin
                        // Could add pair info here if Altium API provides it
                    end;
                    
                    // Add to mechanical array
                    MechArray.Add(BuildJSONObject(LayerProps, 1));
                finally
                    LayerProps.Free;
                end;
            end;
        end;
        
        // Process other special layers
        // Top Overlay
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Top Overlay');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Top Overlay')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'overlay');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Top Overlay')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Top Overlay')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Bottom Overlay
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Bottom Overlay');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Bottom Overlay')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'overlay');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Bottom Overlay')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Bottom Overlay')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Top Solder Mask
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Top Solder Mask');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Top Solder Mask')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'solder_mask');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Top Solder Mask')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Top Solder Mask')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Bottom Solder Mask
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Bottom Solder Mask');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Bottom Solder Mask')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'solder_mask');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Bottom Solder Mask')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Bottom Solder Mask')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Top Paste
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Top Paste');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Top Paste')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'paste');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Top Paste')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Top Paste')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Bottom Paste
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Bottom Paste');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Bottom Paste')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'paste');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Bottom Paste')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Bottom Paste')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Drill Guide
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Drill Guide');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Drill Guide')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'drill');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Drill Guide')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Drill Guide')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Drill Drawing
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Drill Drawing');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Drill Drawing')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'drill');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Drill Drawing')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Drill Drawing')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Multi Layer
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Multi Layer');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Multi Layer')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'multi');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Multi Layer')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Multi Layer')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Keep Out Layer
        LayerProps := TStringList.Create;
        try
            AddJSONProperty(LayerProps, 'name', 'Keep Out Layer');
            AddJSONProperty(LayerProps, 'layer_id', IntToStr(String2Layer('Keep Out Layer')));
            AddJSONProperty(LayerProps, 'layer_type', 'special');
            AddJSONProperty(LayerProps, 'special_type', 'keepout');
            AddJSONBoolean(LayerProps, 'is_displayed', Board.LayerIsDisplayed[String2Layer('Keep Out Layer')]);
            AddJSONProperty(LayerProps, 'color', ColorToString(Board.LayerColor[String2Layer('Keep Out Layer')]));
            OtherArray.Add(BuildJSONObject(LayerProps, 1));
        finally
            LayerProps.Free;
        end;
        
        // Add additional info for the complete layer response
        LayerProps := TStringList.Create;
        try
            // Add summary information
            AddJSONInteger(LayerProps, 'copper_layers_count', TheLayerStack.LayersInStackCount);
            AddJSONInteger(LayerProps, 'signal_layers_count', TheLayerStack.SignalLayerCount);
            AddJSONInteger(LayerProps, 'internal_planes_count', TheLayerStack.LayersInStackCount - TheLayerStack.SignalLayerCount);
            
            // Get the number of enabled mechanical layers
            i := 0;
            for i := 1 to 32 do
                if TheLayerStack.LayerObject_V7[ILayer.MechanicalLayer(i)].MechanicalLayerEnabled then
                    i := i + 1;
            AddJSONInteger(LayerProps, 'mechanical_layers_count', i);
            
            // Add the layer arrays
            LayerProps.Add(BuildJSONArray(CopperArray, 'copper_layers'));
            LayerProps.Add(BuildJSONArray(MechArray, 'mechanical_layers'));
            LayerProps.Add(BuildJSONArray(OtherArray, 'special_layers'));
            
            // Build the final JSON
            OutputLines := TStringList.Create;
            try
                OutputLines.Text := BuildJSONObject(LayerProps);
                Result := WriteJSONToFile(OutputLines, ROOT_DIR+'\temp_layers_data.json');
            finally
                OutputLines.Free;
            end;
        finally
            LayerProps.Free;
        end;
    finally
        AllLayersArray.Free;
        CopperArray.Free;
        MechArray.Free;
        OtherArray.Free;
    end;
end;

// Function to set layer visibility (only specified layers visible)
// Function to set layer visibility with two modes:
// - visible=true: Show only specified layers, hide all others
// - visible=false: Hide specified layers, leave others unchanged
function SetPCBLayerVisibility(LayerNamesList: TStringList; Visible: Boolean): String;
var
    Board          : IPCB_Board;
    TheLayerStack  : IPCB_LayerStack_V7;
    LayerObj       : IPCB_LayerObject;
    MechLayer      : IPCB_MechanicalLayer;
    ResultProps    : TStringList;
    OutputLines    : TStringList;
    i, j           : Integer;
    LayerName      : String;
    LayerID        : TLayer;
    FoundCount     : Integer;
    NotFoundList   : TStringList;
    FoundLayers    : TStringList;
begin
    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if (Board = nil) then
    begin
        Result := '{"success": false, "error": "No PCB document is currently active"}';
        Exit;
    end;
    
    // Get the layer stack
    TheLayerStack := Board.LayerStack_V7;
    if (TheLayerStack = nil) then
    begin
        Result := '{"success": false, "error": "Failed to retrieve layer stack"}';
        Exit;
    end;
    
    // Create lists for tracking results
    ResultProps := TStringList.Create;
    NotFoundList := TStringList.Create;
    FoundLayers := TStringList.Create;
    FoundCount := 0;
    
    try
        // First phase: identify all specified layers
        for i := 0 to LayerNamesList.Count - 1 do
        begin
            LayerName := LayerNamesList[i];
            
            // Try to find the layer by name
            // First check special layers (since they have specific names)
            if (LayerName = 'Top Overlay') or 
               (LayerName = 'Bottom Overlay') or
               (LayerName = 'Top Solder Mask') or
               (LayerName = 'Bottom Solder Mask') or
               (LayerName = 'Top Paste') or
               (LayerName = 'Bottom Paste') or
               (LayerName = 'Drill Guide') or
               (LayerName = 'Drill Drawing') or
               (LayerName = 'Multi Layer') or
               (LayerName = 'Keep Out Layer') then
            begin
                // Get layer ID from name
                LayerID := String2Layer(LayerName);
                if (LayerID <> eNoLayer) then
                begin
                    FoundLayers.Add(IntToStr(LayerID));
                    FoundCount := FoundCount + 1;
                end
                else
                    NotFoundList.Add('"' + JSONEscapeString(LayerName) + '"');
                
                continue;
            end;
            
            // Check copper layers
            LayerObj := TheLayerStack.FirstLayer;
            j := 1;
            
            while (LayerObj <> nil) do
            begin
                if (LayerObj.Name = LayerName) then
                begin
                    FoundLayers.Add(IntToStr(LayerObj.V6_LayerID));
                    FoundCount := FoundCount + 1;
                    break;
                end;
                
                Inc(j);
                LayerObj := TheLayerStack.NextLayer(LayerObj);
            end;
            
            // If we found the layer in copper layers, continue to next layer name
            if (LayerObj <> nil) then
                continue;
            
            // Check mechanical layers (they can have custom names)
            for j := 1 to 32 do
            begin
                MechLayer := TheLayerStack.LayerObject_V7[ILayer.MechanicalLayer(j)];
                
                if MechLayer.MechanicalLayerEnabled and (MechLayer.Name = LayerName) then
                begin
                    FoundLayers.Add(IntToStr(MechLayer.V6_LayerID));
                    FoundCount := FoundCount + 1;
                    break;
                end;
            end;
            
            // If we've checked all layer types and didn't find a match, add to not found list
            if j > 32 then
                NotFoundList.Add('"' + JSONEscapeString(LayerName) + '"');
        end;
        
        // Second phase: set visibility for specified layers only, leave others unchanged
        if Visible then
        begin
            // Show mode: only show specified layers, leave others unchanged
            
            // For copper layers
            LayerObj := TheLayerStack.FirstLayer;
            while (LayerObj <> nil) do
            begin
                // Check if this layer is in our found list
                if (FoundLayers.IndexOf(IntToStr(LayerObj.V6_LayerID)) >= 0) then
                    LayerObj.IsDisplayed[Board] := True;
                
                LayerObj := TheLayerStack.NextLayer(LayerObj);
            end;
            
            // For mechanical layers
            for j := 1 to 32 do
            begin
                MechLayer := TheLayerStack.LayerObject_V7[ILayer.MechanicalLayer(j)];
                
                if MechLayer.MechanicalLayerEnabled then
                begin
                    if (FoundLayers.IndexOf(IntToStr(MechLayer.V6_LayerID)) >= 0) then
                        MechLayer.IsDisplayed[Board] := True;
                end;
            end;
            
            // For special layers
            for j := 1 to 10 do
            begin
                case j of
                    1: LayerID := String2Layer('Top Overlay');
                    2: LayerID := String2Layer('Bottom Overlay');
                    3: LayerID := String2Layer('Top Solder Mask');
                    4: LayerID := String2Layer('Bottom Solder Mask');
                    5: LayerID := String2Layer('Top Paste');
                    6: LayerID := String2Layer('Bottom Paste');
                    7: LayerID := String2Layer('Drill Guide');
                    8: LayerID := String2Layer('Drill Drawing');
                    9: LayerID := String2Layer('Multi Layer');
                    10: LayerID := String2Layer('Keep Out Layer');
                end;
                
                if (FoundLayers.IndexOf(IntToStr(LayerID)) >= 0) then
                    Board.LayerIsDisplayed[LayerID] := True;
            end;
        end
        else
        begin
            // Hide mode: only hide specified layers, leave others unchanged
            
            // For copper layers
            LayerObj := TheLayerStack.FirstLayer;
            while (LayerObj <> nil) do
            begin
                // Check if this layer is in our found list
                if (FoundLayers.IndexOf(IntToStr(LayerObj.V6_LayerID)) >= 0) then
                    LayerObj.IsDisplayed[Board] := False;
                
                LayerObj := TheLayerStack.NextLayer(LayerObj);
            end;
            
            // For mechanical layers
            for j := 1 to 32 do
            begin
                MechLayer := TheLayerStack.LayerObject_V7[ILayer.MechanicalLayer(j)];
                
                if MechLayer.MechanicalLayerEnabled then
                begin
                    if (FoundLayers.IndexOf(IntToStr(MechLayer.V6_LayerID)) >= 0) then
                        MechLayer.IsDisplayed[Board] := False;
                end;
            end;
            
            // For special layers
            for j := 1 to 10 do
            begin
                case j of
                    1: LayerID := String2Layer('Top Overlay');
                    2: LayerID := String2Layer('Bottom Overlay');
                    3: LayerID := String2Layer('Top Solder Mask');
                    4: LayerID := String2Layer('Bottom Solder Mask');
                    5: LayerID := String2Layer('Top Paste');
                    6: LayerID := String2Layer('Bottom Paste');
                    7: LayerID := String2Layer('Drill Guide');
                    8: LayerID := String2Layer('Drill Drawing');
                    9: LayerID := String2Layer('Multi Layer');
                    10: LayerID := String2Layer('Keep Out Layer');
                end;
                
                if (FoundLayers.IndexOf(IntToStr(LayerID)) >= 0) then
                    Board.LayerIsDisplayed[LayerID] := False;
            end;
        end;
        
        // Update the display
        Board.ViewManager_FullUpdate;
        Board.ViewManager_UpdateLayerTabs;
        
        // Create result JSON
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONInteger(ResultProps, 'updated_count', FoundCount);
        
        // Add missing layers array
        if (NotFoundList.Count > 0) then
            ResultProps.Add(BuildJSONArray(NotFoundList, 'not_found_layers'))
        else
            ResultProps.Add('"not_found_layers": []');
        
        // Build final JSON
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := OutputLines.Text;
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
        NotFoundList.Free;
        FoundLayers.Free;
    end;
end;

// Function to get all PCB rules
function GetPCBRules(ROOT_DIR: String): String;
Var
    Board         : IPCB_Board;
    Rule          : IPCB_Rule;
    BoardIterator : IPCB_BoardIterator;
    RulesArray    : TStringList;
    RuleProps     : TStringList;
    OutputLines   : TStringList;
begin
    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if (Board = Nil) then
    begin
        Result := '[]';
        Exit;
    end;

    // Create array for rules
    RulesArray := TStringList.Create;
    
    try
        // Retrieve the iterator
        BoardIterator := Board.BoardIterator_Create;
        BoardIterator.AddFilter_ObjectSet(MkSet(eRuleObject));
        BoardIterator.AddFilter_LayerSet(AllLayers);
        BoardIterator.AddFilter_Method(eProcessAll);

        // Process each rule
        Rule := BoardIterator.FirstPCBObject;
        while (Rule <> Nil) do
        begin
            // Create rule properties
            RuleProps := TStringList.Create;
            try
                // Add rule descriptor
                AddJSONProperty(RuleProps, 'descriptor', Rule.Descriptor);
                AddJSONProperty(RuleProps, 'rule_kind', Rule.GetState_ShortDescriptorString);
                AddJSONProperty(RuleProps, 'filter1', Rule.Scope1Expression);
                AddJSONProperty(RuleProps, 'filter2', Rule.Scope2Expression);

                // Add to rules array
                RulesArray.Add(BuildJSONObject(RuleProps, 1));
            finally
                RuleProps.Free;
            end;
            
            // Move to next rule
            Rule := BoardIterator.NextPCBObject;
        end;

        // Clean up the iterator
        Board.BoardIterator_Destroy(BoardIterator);
        
        // Build the final JSON array
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONArray(RulesArray);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR+'\temp_rules_data.json');
        finally
            OutputLines.Free;
        end;
    finally
        RulesArray.Free;
    end;
end;

// Function to get all component data from the PCB
function GetAllComponentData(ROOT_DIR: String, SelectedOnly: Boolean = False): String;
var
    Board       : IPCB_Board;
    Iterator    : IPCB_BoardIterator;
    Component   : IPCB_Component;
    ComponentsArray : TStringList;
    ComponentProps : TStringList;
    Rect        : TCoordRect;
    xorigin, yorigin : Integer;
    i           : Integer;
    ComponentCount : Integer;
    OutputLines : TStringList;
begin
    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if (Board = nil) then
    begin
        Result := '[]';
        Exit;
    end;
    
    // Get board origin coordinates
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    // Create array for components
    ComponentsArray := TStringList.Create;
    
    try
        // Create an iterator to find all components
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eComponentObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);

        // Process each component
        Component := Iterator.FirstPCBObject;
        while (Component <> Nil) do
        begin
            // Process either all components or only selected ones
            if ((not SelectedOnly) or (SelectedOnly and Component.Selected)) then
            begin
                // Create component properties
                ComponentProps := TStringList.Create;
                try
                    // Get bounds
                    Rect := Component.BoundingRectangleNoNameComment;
                    
                    // Add properties
                    AddJSONProperty(ComponentProps, 'designator', Component.Name.Text);
                    AddJSONProperty(ComponentProps, 'name', Component.Identifier);
                    AddJSONProperty(ComponentProps, 'description', Component.SourceDescription);
                    AddJSONProperty(ComponentProps, 'footprint', Component.Pattern);
                    AddJSONProperty(ComponentProps, 'layer', Layer2String(Component.Layer));
                    AddJSONNumber(ComponentProps, 'x', CoordToMils(Component.x - xorigin));
                    AddJSONNumber(ComponentProps, 'y', CoordToMils(Component.y - yorigin));
                    AddJSONNumber(ComponentProps, 'width', CoordToMils(Rect.Right - Rect.Left));
                    AddJSONNumber(ComponentProps, 'height', CoordToMils(Rect.Bottom - Rect.Top));
                    AddJSONNumber(ComponentProps, 'rotation', Component.Rotation);
                    
                    // Add to components array
                    ComponentsArray.Add(BuildJSONObject(ComponentProps, 1));
                finally
                    ComponentProps.Free;
                end;
            end;
            
            // Move to next component
            Component := Iterator.NextPCBObject;
        end;

        // Clean up the iterator
        Board.BoardIterator_Destroy(Iterator);
        
        // Build the final JSON array
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONArray(ComponentsArray);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR+'\temp_component_data.json');
        finally
            OutputLines.Free;
        end;
    finally
        ComponentsArray.Free;
    end;
end;

// Example refactored function using the new JSON utilities
function GetSelectedComponentsCoordinates(ROOT_DIR: String): String;
var
    Board       : IPCB_Board;
    Component   : IPCB_Component;
    Rect        : TCoordRect;
    xorigin, yorigin : Integer;
    ComponentsArray : TStringList;
    ComponentProps : TStringList;
    OutputLines : TStringList;
    i : Integer;
begin
    Result := '';

    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then Exit;

    // Get board origin coordinates
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    // Create output and components array
    OutputLines := TStringList.Create;
    ComponentsArray := TStringList.Create;
    
    try
        // Process each selected component
        for i := 0 to Board.SelectecObjectCount - 1 do
        begin
            // Only process selected components
            if Board.SelectecObject[i].ObjectId = eComponentObject then
            begin
                // Cast to component type
                Component := Board.SelectecObject[i];
                
                // Get component bounds
                Rect := Component.BoundingRectangleNoNameComment;
                
                // Create component properties
                ComponentProps := TStringList.Create;
                try
                    // Add component properties
                    AddJSONProperty(ComponentProps, 'designator', Component.Name.Text);
                    AddJSONNumber(ComponentProps, 'x', CoordToMils(Component.x - xorigin));
                    AddJSONNumber(ComponentProps, 'y', CoordToMils(Component.y - yorigin));
                    AddJSONNumber(ComponentProps, 'width', CoordToMils(Rect.Right - Rect.Left));
                    AddJSONNumber(ComponentProps, 'height', CoordToMils(Rect.Bottom - Rect.Top));
                    AddJSONNumber(ComponentProps, 'rotation', Component.Rotation);
                    
                    // Add component JSON to array
                    ComponentsArray.Add(BuildJSONObject(ComponentProps, 1));
                finally
                    ComponentProps.Free;
                end;
            end;
        end;
        
        // If components found, build array
        if ComponentsArray.Count > 0 then
            Result := BuildJSONArray(ComponentsArray)
        else
            Result := '[]';
            
        // For consistency with existing code, write to file and read back
        OutputLines.Text := Result;
        Result := WriteJSONToFile(OutputLines, ROOT_DIR+'\temp_selected_components.json');
    finally
        ComponentsArray.Free;
        OutputLines.Free;
    end;
end;

// Function to get pin data for specified components
function GetComponentPinsFromList(ROOT_DIR: String; DesignatorsList: TStringList): String;
var
    Board           : IPCB_Board;
    Component       : IPCB_Component;
    ComponentsArray : TStringList;
    CompProps       : TStringList;
    PinsArray       : TStringList;
    GrpIter         : IPCB_GroupIterator;
    Pad             : IPCB_Pad2;
    NetName         : String;
    xorigin, yorigin : Integer;
    PinProps        : TStringList;
    PinCount, PinsProcessed : Integer;
    Designator      : String;
    i               : Integer;
    OutputLines     : TStringList;
    ShapeStr        : String;
    PlaneConnStr    : String;
    DrillTypeStr    : String;
    HoleTypeStr     : String;
begin
    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if (Board = nil) then
    begin
        Result := '[]';
        Exit;
    end;
    
    // Get board origin coordinates
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    // Create array for components
    ComponentsArray := TStringList.Create;
    
    try
        // Process each designator
        for i := 0 to DesignatorsList.Count - 1 do
        begin
            Designator := Trim(DesignatorsList[i]);
            
            // Use direct function to get component by designator
            Component := FindPcbComponentByRefDes(Board, Designator);
            
            if (Component <> Nil) then
            begin
                // Create component properties
                CompProps := TStringList.Create;
                PinsArray := TStringList.Create;
                
                try
                    // Add designator to component
                    AddJSONProperty(CompProps, 'designator', Component.Name.Text);
                    
                    // Create pad iterator
                    GrpIter := Component.GroupIterator_Create;
                    GrpIter.SetState_FilterAll;
                    GrpIter.AddFilter_ObjectSet(MkSet(ePadObject));
                    
                    // Count pins
                    PinCount := 0;
                    Pad := GrpIter.FirstPCBObject;
                    while (Pad <> Nil) do
                    begin
                        if Pad.InComponent then
                            PinCount := PinCount + 1;
                        Pad := GrpIter.NextPCBObject;
                    end;
                    
                    // Reset iterator
                    Component.GroupIterator_Destroy(GrpIter);
                    GrpIter := Component.GroupIterator_Create;
                    GrpIter.SetState_FilterAll;
                    GrpIter.AddFilter_ObjectSet(MkSet(ePadObject));
                    
                    // Process each pad
                    PinsProcessed := 0;
                    Pad := GrpIter.FirstPCBObject;
                    while (Pad <> Nil) do
                    begin
                        if Pad.InComponent then
                        begin
                            // Get net name if connected
                            if (Pad.Net <> Nil) then
                                NetName := Pad.Net.Name
                            else
                                NetName := '';
                                
                            // Create pin properties — detailed from PCBObjectInspector reference
                            PinProps := TStringList.Create;
                            try
                                AddJSONProperty(PinProps, 'name', Pad.Name);
                                AddJSONProperty(PinProps, 'net', NetName);
                                AddJSONNumber(PinProps, 'x', CoordToMils(Pad.x - xorigin));
                                AddJSONNumber(PinProps, 'y', CoordToMils(Pad.y - yorigin));
                                AddJSONNumber(PinProps, 'rotation', Pad.Rotation);
                                AddJSONProperty(PinProps, 'layer', Layer2String(Pad.Layer));

                                // Pad mode
                                case Pad.Mode of
                                    0: AddJSONProperty(PinProps, 'mode', 'ePadMode_Simple');
                                    1: AddJSONProperty(PinProps, 'mode', 'ePadMode_LocalExternal');
                                    2: AddJSONProperty(PinProps, 'mode', 'ePadMode_External');
                                else
                                    AddJSONProperty(PinProps, 'mode', 'Unknown');
                                end;

                                // Per-layer sizes (Top/Mid/Bot)
                                AddJSONNumber(PinProps, 'top_x_size_mils', CoordToMils(Pad.TopXSize));
                                AddJSONNumber(PinProps, 'top_y_size_mils', CoordToMils(Pad.TopYSize));
                                AddJSONNumber(PinProps, 'mid_x_size_mils', CoordToMils(Pad.MidXSize));
                                AddJSONNumber(PinProps, 'mid_y_size_mils', CoordToMils(Pad.MidYSize));
                                AddJSONNumber(PinProps, 'bot_x_size_mils', CoordToMils(Pad.BotXSize));
                                AddJSONNumber(PinProps, 'bot_y_size_mils', CoordToMils(Pad.BotYSize));

                                // Per-layer shapes
                                case Pad.TopShape of
                                    0: ShapeStr := 'eRounded';
                                    1: ShapeStr := 'eRectangular';
                                    2: ShapeStr := 'eOctagonal';
                                    3: ShapeStr := 'eCircleShape';
                                    4: ShapeStr := 'eArc';
                                else
                                    ShapeStr := 'Unknown';
                                end;
                                AddJSONProperty(PinProps, 'top_shape', ShapeStr);
                                case Pad.MidShape of
                                    0: ShapeStr := 'eRounded';
                                    1: ShapeStr := 'eRectangular';
                                    2: ShapeStr := 'eOctagonal';
                                    3: ShapeStr := 'eCircleShape';
                                    4: ShapeStr := 'eArc';
                                else
                                    ShapeStr := 'Unknown';
                                end;
                                AddJSONProperty(PinProps, 'mid_shape', ShapeStr);
                                case Pad.BotShape of
                                    0: ShapeStr := 'eRounded';
                                    1: ShapeStr := 'eRectangular';
                                    2: ShapeStr := 'eOctagonal';
                                    3: ShapeStr := 'eCircleShape';
                                    4: ShapeStr := 'eArc';
                                else
                                    ShapeStr := 'Unknown';
                                end;
                                AddJSONProperty(PinProps, 'bot_shape', ShapeStr);

                                // Hole info
                                AddJSONNumber(PinProps, 'hole_size_mils', CoordToMils(Pad.HoleSize));
                                AddJSONBoolean(PinProps, 'plated', Pad.Plated);

                                // Drill type
                                case Pad.DrillType of
                                    0: DrillTypeStr := 'eDrillType_Simple';
                                    1: DrillTypeStr := 'eDrillType_Assigned';
                                    2: DrillTypeStr := 'eDrillType_Partial';
                                    3: DrillTypeStr := 'eDrillType_Slot';
                                else
                                    DrillTypeStr := 'Unknown';
                                end;
                                AddJSONProperty(PinProps, 'drill_type', DrillTypeStr);

                                // Hole type
                                case Pad.HoleType of
                                    0: HoleTypeStr := 'eHoleType_Round';
                                    1: HoleTypeStr := 'eHoleType_Square';
                                    2: HoleTypeStr := 'eHoleType_Slot';
                                else
                                    HoleTypeStr := 'Unknown';
                                end;
                                AddJSONProperty(PinProps, 'hole_type', HoleTypeStr);

                                // Tenting
                                AddJSONBoolean(PinProps, 'is_tenting', Pad.IsTenting);
                                AddJSONBoolean(PinProps, 'is_tenting_top', Pad.IsTenting_Top);
                                AddJSONBoolean(PinProps, 'is_tenting_bottom', Pad.IsTenting_Bottom);

                                // Testpoints
                                AddJSONBoolean(PinProps, 'is_testpoint_top', Pad.IsTestpoint_Top);
                                AddJSONBoolean(PinProps, 'is_testpoint_bottom', Pad.IsTestpoint_Bottom);
                                AddJSONBoolean(PinProps, 'is_assy_testpoint_top', Pad.IsAssyTestpoint_Top);
                                AddJSONBoolean(PinProps, 'is_assy_testpoint_bottom', Pad.IsAssyTestpoint_Bottom);

                                // Mask expansions
                                AddJSONNumber(PinProps, 'solder_mask_expansion_mils', CoordToMils(Pad.SolderMaskExpansion));
                                AddJSONNumber(PinProps, 'paste_mask_expansion_mils', CoordToMils(Pad.PasteMaskExpansion));

                                // Plane connection
                                case Pad.PowerPlaneConnectStyle of
                                    0: PlaneConnStr := 'eDirectConnect';
                                    1: PlaneConnStr := 'eReliefConnect';
                                    2: PlaneConnStr := 'eNoConnect';
                                else
                                    PlaneConnStr := 'Unknown';
                                end;
                                AddJSONProperty(PinProps, 'power_plane_connect_style', PlaneConnStr);
                                AddJSONNumber(PinProps, 'relief_conductor_width_mils', CoordToMils(Pad.ReliefConductorWidth));
                                AddJSONInteger(PinProps, 'relief_entries', Pad.ReliefEntries);
                                AddJSONNumber(PinProps, 'relief_air_gap_mils', CoordToMils(Pad.ReliefAirGap));
                                AddJSONNumber(PinProps, 'power_plane_clearance_mils', CoordToMils(Pad.PowerPlaneClearance));
                                AddJSONNumber(PinProps, 'power_plane_relief_expansion_mils', CoordToMils(Pad.PowerPlaneReliefExpansion));

                                // Package length
                                AddJSONNumber(PinProps, 'pin_package_length_mils', CoordToMils(Pad.PinPackageLength));

                                // Unique ID
                                AddJSONProperty(PinProps, 'unique_id', Pad.UniqueId);

                                // Add to pins array
                                PinsArray.Add(BuildJSONObject(PinProps, 3));

                                // Increment counter
                                PinsProcessed := PinsProcessed + 1;
                            finally
                                PinProps.Free;
                            end;
                        end;
                        
                        Pad := GrpIter.NextPCBObject;
                    end;
                    
                    // Clean up iterator
                    Component.GroupIterator_Destroy(GrpIter);
                    
                    // Add pins array to component
                    CompProps.Add(BuildJSONArray(PinsArray, 'pins', 1));
                    
                    // Add to components array
                    ComponentsArray.Add(BuildJSONObject(CompProps, 1));
                finally
                    CompProps.Free;
                    PinsArray.Free;
                end;
            end
            else
            begin
                // Component not found, add empty component
                CompProps := TStringList.Create;
                try
                    AddJSONProperty(CompProps, 'designator', Designator);
                    CompProps.Add('"pins": []');
                    
                    // Add to components array
                    ComponentsArray.Add(BuildJSONObject(CompProps, 1));
                finally
                    CompProps.Free;
                end;
            end;
        end;
        
        // Build the final JSON array
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONArray(ComponentsArray);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR+'\temp_pins_data.json');
        finally
            OutputLines.Free;
        end;
    finally
        ComponentsArray.Free;
    end;
end;

// ============================================================================
// Geometry Guard Helpers — for placement and routing validation
// Patterns verified from:
//   AutoPlaceSilkscreen.pas L306-L327 (BoundingRectangleNoNameCommentForSignals)
//   AutoPlaceSilkscreen.pas L394-L409 (Is_Outside_Board AABB check)
//   AutoPlaceSilkscreen.pas L584-L653 (Is_Overlapping AABB intersection)
//   DesignReuse.pas L817-L822 (BoardOutline.BoundingRectangle)
// ============================================================================

// Compute component BBox translated to a target position.
// Uses delta from current position to current BBox, then applies same delta to target.
// DelphiScript TCoordRect is read-only for field access — we CANNOT construct one
// from scratch by assigning .Left/.Right/.Bottom/.Top. So we return 4 separate coords.
// Verified pattern: AutoPlaceSilkscreen.pas L306-L327 (only reads from TCoordRect)
procedure GetComponentBBoxAtTarget(Component: IPCB_Component; TargetX, TargetY: TCoord;
    var OutLeft, OutRight, OutBottom, OutTop: TCoord);
var
    CurrentBBox: TCoordRect;
    DeltaX, DeltaY: TCoord;
begin
    CurrentBBox := Component.BoundingRectangleNoNameCommentForSignals;
    DeltaX := TargetX - Component.X;
    DeltaY := TargetY - Component.Y;
    OutLeft   := CurrentBBox.Left + DeltaX;
    OutRight  := CurrentBBox.Right + DeltaX;
    OutBottom := CurrentBBox.Bottom + DeltaY;
    OutTop    := CurrentBBox.Top + DeltaY;
end;

// Check if a BBox is outside the board outline (with margin in mils).
// Returns True if any edge of BBox exceeds board bounds minus margin.
// Verified pattern: AutoPlaceSilkscreen.pas L394-L409 Is_Outside_Board
function IsBBoxOutOfBoard(Board: IPCB_Board; BBoxLeft, BBoxRight, BBoxBottom, BBoxTop: TCoord; MarginMils: Integer): Boolean;
var
    Outline: IPCB_Polygon;
    BR: TCoordRect;
    Margin: TCoord;
begin
    Result := False;
    Outline := Board.BoardOutline;
    if Outline = nil then Exit;
    BR := Outline.BoundingRectangle;
    Margin := MilsToCoord(MarginMils);
    if (BBoxLeft < BR.Left + Margin) or (BBoxRight > BR.Right - Margin) or
       (BBoxBottom < BR.Bottom + Margin) or (BBoxTop > BR.Top - Margin) then
    begin
        Result := True;
    end;
end;

// Find all components that overlap with the target BBox (excluding TargetDesignator).
// Returns a TStringList of JSON object strings with conflict details.
// Caller must free the returned TStringList.
// Verified pattern: AutoPlaceSilkscreen.pas L584-L653 Is_Overlapping AABB check
function FindOverlappingComponents(Board: IPCB_Board; TargetDesignator: String;
    TargetLeft, TargetRight, TargetBottom, TargetTop: TCoord; MarginMils: Integer): TStringList;
var
    Iterator: IPCB_BoardIterator;
    Comp: IPCB_Component;
    OtherBBox: TCoordRect;
    Margin: TCoord;
    OverlapList: TStringList;
    ConflictProps: TStringList;
    OutputLines: TStringList;
    HasOverlap: Boolean;
begin
    OverlapList := TStringList.Create;
    Margin := MilsToCoord(MarginMils);

    Iterator := Board.BoardIterator_Create;
    Iterator.AddFilter_ObjectSet(MkSet(eComponentObject));
    Iterator.AddFilter_LayerSet(AllLayers);
    Iterator.AddFilter_Method(eProcessAll);

    Comp := Iterator.FirstPCBObject;
    while Comp <> nil do
    begin
        { Skip the component being moved }
        if AnsiCompareText(Trim(Comp.Name.Text), Trim(TargetDesignator)) <> 0 then
        begin
            OtherBBox := Comp.BoundingRectangleNoNameCommentForSignals;
            { AABB overlap check with margin expansion on both boxes }
            HasOverlap :=
                (TargetLeft - Margin < OtherBBox.Right + Margin) and
                (TargetRight + Margin > OtherBBox.Left - Margin) and
                (TargetBottom - Margin < OtherBBox.Top + Margin) and
                (TargetTop + Margin > OtherBBox.Bottom - Margin);

            if HasOverlap then
            begin
                ConflictProps := TStringList.Create;
                try
                    AddJSONProperty(ConflictProps, 'designator', Comp.Name.Text);
                    AddJSONNumber(ConflictProps, 'other_left_mils', CoordToMils(OtherBBox.Left));
                    AddJSONNumber(ConflictProps, 'other_bottom_mils', CoordToMils(OtherBBox.Bottom));
                    AddJSONNumber(ConflictProps, 'other_right_mils', CoordToMils(OtherBBox.Right));
                    AddJSONNumber(ConflictProps, 'other_top_mils', CoordToMils(OtherBBox.Top));
                    OutputLines := TStringList.Create;
                    try
                        OutputLines.Text := BuildJSONObject(ConflictProps, 1);
                        OverlapList.Add(OutputLines.Text);
                    finally
                        OutputLines.Free;
                    end;
                finally
                    ConflictProps.Free;
                end;
            end;
        end;
        Comp := Iterator.NextPCBObject;
    end;
    Board.BoardIterator_Destroy(Iterator);

    Result := OverlapList;
end;

// Check if a line segment intersects a rectangle using Liang-Barsky algorithm.
// Returns True if any part of the segment (X1,Y1)-(X2,Y2) is inside the rect.
function LineIntersectsRect(X1, Y1, X2, Y2: TCoord; RectLeft, RectBottom, RectRight, RectTop: TCoord): Boolean;
var
    Dx, Dy: Double;
    T0, T1, R: Double;
    P, Q: Double;
begin
    Dx := X2 - X1;
    Dy := Y2 - Y1;
    T0 := 0;
    T1 := 1;

    { Left boundary: p = -Dx, q = X1 - RectLeft }
    P := -Dx;
    Q := X1 - RectLeft;
    if Abs(P) < 0.001 then
    begin
        if Q < 0 then begin Result := False; Exit; end;
    end
    else
    begin
        R := Q / P;
        if P < 0 then
        begin
            if R > T1 then begin Result := False; Exit; end;
            if R > T0 then T0 := R;
        end
        else
        begin
            if R < T0 then begin Result := False; Exit; end;
            if R < T1 then T1 := R;
        end;
    end;

    { Right boundary: p = Dx, q = RectRight - X1 }
    P := Dx;
    Q := RectRight - X1;
    if Abs(P) < 0.001 then
    begin
        if Q < 0 then begin Result := False; Exit; end;
    end
    else
    begin
        R := Q / P;
        if P < 0 then
        begin
            if R > T1 then begin Result := False; Exit; end;
            if R > T0 then T0 := R;
        end
        else
        begin
            if R < T0 then begin Result := False; Exit; end;
            if R < T1 then T1 := R;
        end;
    end;

    { Bottom boundary: p = -Dy, q = Y1 - RectBottom }
    P := -Dy;
    Q := Y1 - RectBottom;
    if Abs(P) < 0.001 then
    begin
        if Q < 0 then begin Result := False; Exit; end;
    end
    else
    begin
        R := Q / P;
        if P < 0 then
        begin
            if R > T1 then begin Result := False; Exit; end;
            if R > T0 then T0 := R;
        end
        else
        begin
            if R < T0 then begin Result := False; Exit; end;
            if R < T1 then T1 := R;
        end;
    end;

    { Top boundary: p = Dy, q = RectTop - Y1 }
    P := Dy;
    Q := RectTop - Y1;
    if Abs(P) < 0.001 then
    begin
        if Q < 0 then begin Result := False; Exit; end;
    end
    else
    begin
        R := Q / P;
        if P < 0 then
        begin
            if R > T1 then begin Result := False; Exit; end;
            if R > T0 then T0 := R;
        end
        else
        begin
            if R < T0 then begin Result := False; Exit; end;
            if R < T1 then T1 := R;
        end;
    end;

    Result := (T0 <= T1);
end;

// Find components that block a track segment (X1,Y1)-(X2,Y2).
// Returns a TStringList of JSON object strings with blocking component details.
// Caller must free the returned TStringList.
function FindBlockingComponents(Board: IPCB_Board; X1, Y1, X2, Y2: TCoord; MarginMils: Integer): TStringList;
var
    Iterator: IPCB_BoardIterator;
    Comp: IPCB_Component;
    CompBBox: TCoordRect;
    Margin: TCoord;
    BlockList: TStringList;
    ConflictProps: TStringList;
    OutputLines: TStringList;
begin
    BlockList := TStringList.Create;
    Margin := MilsToCoord(MarginMils);

    Iterator := Board.BoardIterator_Create;
    Iterator.AddFilter_ObjectSet(MkSet(eComponentObject));
    Iterator.AddFilter_LayerSet(AllLayers);
    Iterator.AddFilter_Method(eProcessAll);

    Comp := Iterator.FirstPCBObject;
    while Comp <> nil do
    begin
        CompBBox := Comp.BoundingRectangleNoNameCommentForSignals;
        { Expand BBox by margin for collision detection }
        if LineIntersectsRect(X1, Y1, X2, Y2,
               CompBBox.Left - Margin, CompBBox.Bottom - Margin,
               CompBBox.Right + Margin, CompBBox.Top + Margin) then
        begin
            ConflictProps := TStringList.Create;
            try
                AddJSONProperty(ConflictProps, 'designator', Comp.Name.Text);
                AddJSONNumber(ConflictProps, 'left_mils', CoordToMils(CompBBox.Left));
                AddJSONNumber(ConflictProps, 'bottom_mils', CoordToMils(CompBBox.Bottom));
                AddJSONNumber(ConflictProps, 'right_mils', CoordToMils(CompBBox.Right));
                AddJSONNumber(ConflictProps, 'top_mils', CoordToMils(CompBBox.Top));
                OutputLines := TStringList.Create;
                try
                    OutputLines.Text := BuildJSONObject(ConflictProps, 1);
                    BlockList.Add(OutputLines.Text);
                finally
                    OutputLines.Free;
                end;
            finally
                ConflictProps.Free;
            end;
        end;
        Comp := Iterator.NextPCBObject;
    end;
    Board.BoardIterator_Destroy(Iterator);

    Result := BlockList;
end;

// Constants for guard margins (in mils)
const
    BOARD_EDGE_MARGIN    = 50;
    COMPONENT_MARGIN     = 20;
    TRACK_MARGIN         = 20;

// Set absolute position of a single component
// Guards: A) rotation warning, B) out-of-board check, C) overlap detection
function SetComponentPosition(Designator: String; NewX, NewY: Float; Rotation: Float): String;
var
    Board: IPCB_Board;
    Component: IPCB_Component;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
    TargetX, TargetY: TCoord;
    TgtLeft, TgtRight, TgtBottom, TgtTop: TCoord;
    OverlapList: TStringList;
    ConflictArray: TStringList;
    OutputLines: TStringList;
    WarningMsg: String;
    OldRotation: Float;
begin
    Board := PCBServer.GetCurrentPCBBoard;
    if (Board = nil) then
    begin
        Result := '{"success": false, "error": "No PCB document is currently active"}';
        Exit;
    end;

    Component := FindPcbComponentByRefDes(Board, Designator);
    if (Component = nil) then
    begin
        Result := '{"success": false, "error": "Component not found: ' + Designator + '"}';
        Exit;
    end;

    // Get board origin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;
    TargetX := MilsToCoord(NewX) + xorigin;
    TargetY := MilsToCoord(NewY) + yorigin;

    // Guard A: Rotation warning — detect when AI sends rotation=0 on a non-zero component
    WarningMsg := '';
    OldRotation := Component.Rotation;
    if (Rotation >= 0) and (Abs(Rotation - OldRotation) > 0.5) then
    begin
        WarningMsg := 'rotation_changed_from_' + FloatToStr(OldRotation) + '_to_' + FloatToStr(Rotation);
    end;

    // Guard B: Out-of-board detection — compute target BBox and check against board bounds
    GetComponentBBoxAtTarget(Component, TargetX, TargetY, TgtLeft, TgtRight, TgtBottom, TgtTop);
    if IsBBoxOutOfBoard(Board, TgtLeft, TgtRight, TgtBottom, TgtTop, BOARD_EDGE_MARGIN) then
    begin
        ResultProps := TStringList.Create;
        try
            AddJSONProperty(ResultProps, 'designator', Designator);
            AddJSONNumber(ResultProps, 'requested_x', NewX);
            AddJSONNumber(ResultProps, 'requested_y', NewY);
            AddJSONProperty(ResultProps, 'reason', 'OUT_OF_BOARD');
            AddJSONNumber(ResultProps, 'target_left_mils', CoordToMils(TgtLeft));
            AddJSONNumber(ResultProps, 'target_bottom_mils', CoordToMils(TgtBottom));
            AddJSONNumber(ResultProps, 'target_right_mils', CoordToMils(TgtRight));
            AddJSONNumber(ResultProps, 'target_top_mils', CoordToMils(TgtTop));
            OutputLines := TStringList.Create;
            try
                OutputLines.Text := BuildJSONObject(ResultProps);
                Result := '{"success": false, "error": "OUT_OF_BOARD", "details": ' + OutputLines.Text + '}';
            finally
                OutputLines.Free;
            end;
        finally
            ResultProps.Free;
        end;
        Exit;
    end;

    // Guard C: Overlap detection — check if target BBox overlaps any other component
    OverlapList := FindOverlappingComponents(Board, Designator, TgtLeft, TgtRight, TgtBottom, TgtTop, COMPONENT_MARGIN);
    try
        if OverlapList.Count > 0 then
        begin
            ConflictArray := TStringList.Create;
            try
                OutputLines := TStringList.Create;
                try
                    OutputLines.Text := BuildJSONArray(OverlapList, 'conflicts');
                    ResultProps := TStringList.Create;
                    try
                        AddJSONProperty(ResultProps, 'designator', Designator);
                        AddJSONNumber(ResultProps, 'requested_x', NewX);
                        AddJSONNumber(ResultProps, 'requested_y', NewY);
                        AddJSONInteger(ResultProps, 'conflict_count', OverlapList.Count);
                        ResultProps.Add(OutputLines.Text);
                        OutputLines.Text := BuildJSONObject(ResultProps);
                        Result := '{"success": false, "error": "OVERLAP_DETECTED", "details": ' + OutputLines.Text + '}';
                    finally
                        ResultProps.Free;
                    end;
                finally
                    OutputLines.Free;
                end;
            finally
                ConflictArray.Free;
            end;
            Exit;
        end;
    finally
        OverlapList.Free;
    end;

    // All guards passed — proceed with the move
    ResultProps := TStringList.Create;
    try
        PCBServer.PreProcess;
        PCBServer.SendMessageToRobots(Component.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);

        // Set absolute position using MoveToXY
        Component.MoveToXY(TargetX, TargetY);

        // Set rotation if specified (use -1 to keep current)
        if (Rotation >= 0) then
            Component.Rotation := Rotation;

        PCBServer.SendMessageToRobots(Component.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
        PCBServer.PostProcess;

        Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONNumber(ResultProps, 'new_x', NewX);
        AddJSONNumber(ResultProps, 'new_y', NewY);
        AddJSONNumber(ResultProps, 'rotation', Component.Rotation);
        if WarningMsg <> '' then
            AddJSONProperty(ResultProps, 'warning', WarningMsg);

        Result := '{"success": true, "result": ' + BuildJSONObject(ResultProps) + '}';
    finally
        ResultProps.Free;
    end;
end;

// Function to move components by X and Y offsets and set rotation
function MoveComponentsByDesignators(DesignatorsList: TStringList; XOffset, YOffset: TCoord; Rotation: TAngle): String;
var
    Board          : IPCB_Board;
    Component      : IPCB_Component;
    ResultProps    : TStringList;
    MissingArray   : TStringList;
    Designator     : String;
    i              : Integer;
    MovedCount     : Integer;
    OutputLines    : TStringList;
begin
    // Retrieve the current board
    Board := PCBServer.GetCurrentPCBBoard;
    if (Board = nil) then
    begin
        Result := 'ERROR: No PCB document is currently active';
        Exit;
    end;
    
    // Create output properties
    ResultProps := TStringList.Create;
    MissingArray := TStringList.Create;
    MovedCount := 0;
    
    try
        // Start transaction
        PCBServer.PreProcess;
        
        // Process each designator
        for i := 0 to DesignatorsList.Count - 1 do
        begin
            Designator := Trim(DesignatorsList[i]);
            
            // Use direct function to get component by designator
            Component := FindPcbComponentByRefDes(Board, Designator);
            
            if (Component <> Nil) then
            begin
                // Begin modify
                PCBServer.SendMessageToRobots(Component.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
                
                // Move the component by the specified offsets
                Component.MoveByXY(XOffset, YOffset);
                
                // Set rotation if specified (non-zero)
                if (Rotation <> 0) then
                    Component.Rotation := Rotation;
                
                // End modify
                PCBServer.SendMessageToRobots(Component.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
                
                MovedCount := MovedCount + 1;
            end
            else
            begin
                // Add to missing designators list
                MissingArray.Add('"' + JSONEscapeString(Designator) + '"');
            end;
        end;
        
        // End transaction
        PCBServer.PostProcess;
        
        // Update PCB document
        Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);
        
        // Create result JSON
        AddJSONInteger(ResultProps, 'moved_count', MovedCount);
        
        // Add missing designators array
        if (MissingArray.Count > 0) then
            ResultProps.Add(BuildJSONArray(MissingArray, 'missing_designators'))
        else
            ResultProps.Add('"missing_designators": []');
        
        // Build final JSON
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := OutputLines.Text;
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
        MissingArray.Free;
    end;
end;

// ============================================================================
// PCB Edit Primitives — action-based single tool (pcb_edit)
// Verified patterns from scripts-libraries-master:
//   Track: PlaceDashedLine.pas L52-L62
//   Pad:   TestPointMaker.pas L150-L183
//   Via:   StitchingVias.pas L554-L582
//   Fill:  SolderPasteGrid.pas L172-L183
//   Arc:   FilletWithRadius.pas L261-L289
//   Text:  AddText.pas L35-L110
//   Delete: MoveToLayer.pas L240, StitchingVias.pas L634
//   Select: SelectAssyDesignators.pas L636-L679
// ============================================================================

function PcbEditParseStringAfterKey(RequestData: TStringList; const KeySub: String): String;
var
    i: Integer;
    Line: String;
begin
    Result := '';
    for i := 0 to RequestData.Count - 1 do
    begin
        Line := RequestData[i];
        if Pos(KeySub, Line) > 0 then
        begin
            Result := Trim(McpParseJSONLineValue(Line, KeySub));
            Exit;
        end;
    end;
end;

function PcbEditParseFloatAfterKey(RequestData: TStringList; const KeySub: String; var Found: Boolean): Double;
var
    S: String;
begin
    Found := False;
    Result := 0;
    S := PcbEditParseStringAfterKey(RequestData, KeySub);
    if S = '' then
        Exit;
    Found := True;
    Result := StrToFloat(StringReplace(S, ',', '.', MkSet(rfReplaceAll)));
end;

function PcbEditParseLayerFromString(const LayerStr: String): TLayer;
var
    S: String;
begin
    S := Trim(LayerStr);
    Result := eTopLayer;
    if (S = '') or (AnsiCompareText(S, 'eTopLayer') = 0) or (AnsiCompareText(S, 'top') = 0) then
        Result := eTopLayer
    else if (AnsiCompareText(S, 'eBottomLayer') = 0) or (AnsiCompareText(S, 'bottom') = 0) then
        Result := eBottomLayer
    else if (AnsiCompareText(S, 'eTopOverlay') = 0) or (AnsiCompareText(S, 'top_overlay') = 0) then
        Result := eTopOverlay
    else if (AnsiCompareText(S, 'eBottomOverlay') = 0) or (AnsiCompareText(S, 'bottom_overlay') = 0) then
        Result := eBottomOverlay
    else if (AnsiCompareText(S, 'eTopPaste') = 0) or (AnsiCompareText(S, 'top_paste') = 0) then
        Result := eTopPaste
    else if (AnsiCompareText(S, 'eBottomPaste') = 0) or (AnsiCompareText(S, 'bottom_paste') = 0) then
        Result := eBottomPaste
    else if (AnsiCompareText(S, 'eTopSolder') = 0) or (AnsiCompareText(S, 'top_solder') = 0) then
        Result := eTopSolder
    else if (AnsiCompareText(S, 'eBottomSolder') = 0) or (AnsiCompareText(S, 'bottom_solder') = 0) then
        Result := eBottomSolder
    else if (AnsiCompareText(S, 'eKeepOutLayer') = 0) or (AnsiCompareText(S, 'keepout') = 0) then
        Result := eKeepOutLayer
    else if (AnsiCompareText(S, 'eMultiLayer') = 0) or (AnsiCompareText(S, 'multi') = 0) then
        Result := eMultiLayer
    else if AnsiCompareText(S, 'eMechanical1') = 0 then Result := eMechanical1
    else if AnsiCompareText(S, 'eMechanical2') = 0 then Result := eMechanical2
    else if AnsiCompareText(S, 'eMechanical3') = 0 then Result := eMechanical3
    else if AnsiCompareText(S, 'eMechanical4') = 0 then Result := eMechanical4
    else if AnsiCompareText(S, 'eMechanical5') = 0 then Result := eMechanical5
    else if AnsiCompareText(S, 'eMechanical6') = 0 then Result := eMechanical6
    else if AnsiCompareText(S, 'eMechanical7') = 0 then Result := eMechanical7
    else if AnsiCompareText(S, 'eMechanical8') = 0 then Result := eMechanical8
    else if AnsiCompareText(S, 'eMechanical9') = 0 then Result := eMechanical9
    else if AnsiCompareText(S, 'eMechanical10') = 0 then Result := eMechanical10
    else if AnsiCompareText(S, 'eMechanical13') = 0 then Result := eMechanical13
    else if AnsiCompareText(S, 'eMechanical15') = 0 then Result := eMechanical15
    else if (AnsiCompareText(S, 'eInternalPlane1') = 0) or (AnsiCompareText(S, 'internal_plane1') = 0) then
        Result := eInternalPlane1
    else if (AnsiCompareText(S, 'eInternalPlane2') = 0) or (AnsiCompareText(S, 'internal_plane2') = 0) then
        Result := eInternalPlane2
    else if (AnsiCompareText(S, 'eMidLayer1') = 0) or (AnsiCompareText(S, 'mid1') = 0) then
        Result := eMidLayer1
    else if (AnsiCompareText(S, 'eMidLayer2') = 0) or (AnsiCompareText(S, 'mid2') = 0) then
        Result := eMidLayer2
    else if (AnsiCompareText(S, 'eMidLayer3') = 0) or (AnsiCompareText(S, 'mid3') = 0) then
        Result := eMidLayer3;
end;

// Convert object type string to PCB object ID set
function PcbEditParseObjectSet(const TypeStr: String): TSet;
var
    S: String;
begin
    S := LowerCase(Trim(TypeStr));
    if (S = 'track') or (S = 'etrackobject') then
        Result := MkSet(eTrackObject)
    else if (S = 'pad') or (S = 'epadobject') then
        Result := MkSet(ePadObject)
    else if (S = 'via') or (S = 'eviaobject') then
        Result := MkSet(eViaObject)
    else if (S = 'fill') or (S = 'efillobject') then
        Result := MkSet(eFillObject)
    else if (S = 'arc') or (S = 'earcobject') then
        Result := MkSet(eArcObject)
    else if (S = 'text') or (S = 'etextobject') then
        Result := MkSet(eTextObject)
    else if (S = 'component') or (S = 'ecomponentobject') then
        Result := MkSet(eComponentObject)
    else
        Result := MkSet(eTrackObject, ePadObject, eViaObject, eFillObject, eArcObject, eTextObject);
end;

// Convert PCB primitive ObjectId to human-readable string
function PrimObjectIdToString(ObjId: TObjectId): String;
begin
    case ObjId of
        eTrackObject:       Result := 'track';
        ePadObject:         Result := 'pad';
        eViaObject:         Result := 'via';
        eFillObject:        Result := 'fill';
        eArcObject:         Result := 'arc';
        eTextObject:        Result := 'text';
        eComponentObject:   Result := 'component';
        ePolyObject:        Result := 'polygon';
        eRegionObject:      Result := 'region';
        eConnectionObject:  Result := 'connection';
        eNetObject:         Result := 'net';
        eClassObject:       Result := 'net_class';
        eDimensionObject:   Result := 'dimension';
        eCoordinateObject:  Result := 'coordinate';
        else                Result := 'unknown(' + IntToStr(Ord(ObjId)) + ')';
    end;
end;

// add_track — Verified: PlaceDashedLine.pas L52-L62
// add_track — Create a PCB track primitive.
// Verified: 01_PCB对象与API §3.2 IPCB_Track — x1/y1/x2/y2/Width/Layer/Net/InNet/GetState_Length/IsKeepout
// Verified: PCBObjectInspector L1235+ for PrimitiveLock / Moveable / Layer / Rotation / IsKeepout (inherited IPCB_Primitive)
function PcbEditAddTrack(Board: IPCB_Board; X1, Y1, X2, Y2, Width: Double; Layer: TLayer;
    NetName: String; UseNet: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean): String;
var
    Track: IPCB_Track;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
    Net: IPCB_Net;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    PCBServer.PreProcess;
    try
        Track := PCBServer.PCBObjectFactory(eTrackObject, eNoDimension, eCreate_Default);
        Track.X1 := MilsToCoord(X1) + xorigin;
        Track.Y1 := MilsToCoord(Y1) + yorigin;
        Track.X2 := MilsToCoord(X2) + xorigin;
        Track.Y2 := MilsToCoord(Y2) + yorigin;
        Track.Layer := Layer;
        Track.Width := MilsToCoord(Width);
        if Net <> nil then
            Track.Net := Net;
        if UseKeepout  then Track.IsKeepout     := IsKeepout;
        if UseMoveable then Track.Moveable      := Moveable;
        if UsePrimLock then Track.PrimitiveLock := PrimLock;
        Board.AddPCBObject(Track);
        PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Track.I_ObjectAddress);
        Track.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'add_track');
        AddJSONNumber(ResultProps, 'x1_mils', X1);
        AddJSONNumber(ResultProps, 'y1_mils', Y1);
        AddJSONNumber(ResultProps, 'x2_mils', X2);
        AddJSONNumber(ResultProps, 'y2_mils', Y2);
        AddJSONNumber(ResultProps, 'width_mils', Width);
        AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseNet and (NetName <> '') then
            AddJSONProperty(ResultProps, 'net', NetName);
        if UseKeepout  then AddJSONBoolean(ResultProps, 'is_keepout', IsKeepout);
        if UseMoveable then AddJSONBoolean(ResultProps, 'moveable',   Moveable);
        if UsePrimLock then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// add_pad — Extended version with full pad property set.
// Verified: TestPointMaker.pas L150-L183 (creation + shape),
//   PCBObjectInspector.pas (Rot / Shape / SolderMask / PasteMask / PlaneConnect / Testpoint),
//   FixConnections.pas (Net assignment via FindNetByName + BeginModify).
// Properties now supported:
//   - NetName       : assign net on creation (resolves missing GND net problem from user report)
//   - TopShape      : eRounded / eRectangular / eOctagonal / etc. (via shape_str)
//   - Rotation      : pad rotation in degrees
//   - MidX/Y Size + MidShape : consistent Top/Mid/Bot for ePadMode_Simple
//   - Tenting top/bottom, Testpoint top/bottom
//   - PasteMaskExpansion, SolderMaskExpansion (mils)
//   - PowerPlaneConnectStyle : relief / direct / none
//   - Name          : pad designator
function PcbEditAddPad(Board: IPCB_Board; X, Y, SizeX, SizeY, HoleSize: Double; Layer: TLayer;
    const PadName, NetName, ShapeStr: String;
    Rotation: Double;
    TentingTop, TentingBot, TestpointTop, TestpointBot: Boolean;
    UseTentingTop, UseTentingBot, UseTestpointTop, UseTestpointBot: Boolean;
    PasteMaskExpansionMils, SolderMaskExpansionMils: Double;
    UsePasteMaskExpansion, UseSolderMaskExpansion: Boolean;
    PlaneConnectStr: String; UsePlaneConnect: Boolean): String;
var
    Pad: IPCB_Pad2;
    Net: IPCB_Net;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
    TopShape, MidShape, BotShape: TShape;
    PlaneConnect: TPlaneConnectStyle;
    ResolvedNet: String;
begin
    ResolvedNet := '';
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    // Resolve net BEFORE PreProcess so we can report meaningful error
    if NetName <> '' then
    begin
        Net := FindNetByName(Board, NetName);
        if Net = nil then
        begin
            ResultProps := TStringList.Create;
            try
                AddJSONProperty(ResultProps, 'action', 'add_pad');
                AddJSONBoolean(ResultProps, 'success', False);
                AddJSONProperty(ResultProps, 'error', 'NET_NOT_FOUND');
                AddJSONProperty(ResultProps, 'net_name', NetName);
                Result := BuildJSONObject(ResultProps);
            finally
                ResultProps.Free;
            end;
            Exit;
        end;
        ResolvedNet := Net.Name;
    end;

    // Resolve shape (default = eRounded for circular/round pad)
    TopShape := PcbEditParseShapeFromString(ShapeStr);
    MidShape := TopShape;
    BotShape := TopShape;

    if UsePlaneConnect and (PlaneConnectStr <> '') then
        PlaneConnect := PcbEditParsePlaneConnectFromString(PlaneConnectStr)
    else
        PlaneConnect := eReliefConnectToPlane;

    PCBServer.PreProcess;
    try
        Pad := PCBServer.PCBObjectFactory(ePadObject, eNoDimension, eCreate_Default);
        Pad.BeginModify;
        try
            Pad.Mode := ePadMode_Simple;
            Pad.X := MilsToCoord(X) + xorigin;
            Pad.Y := MilsToCoord(Y) + yorigin;
            Pad.Rotation := Rotation;

            // Size (Top/Mid/Bot all set for Simple mode consistency)
            Pad.TopXSize := MilsToCoord(SizeX);
            Pad.TopYSize := MilsToCoord(SizeY);
            Pad.MidXSize := MilsToCoord(SizeX);
            Pad.MidYSize := MilsToCoord(SizeY);
            Pad.BotXSize := MilsToCoord(SizeX);
            Pad.BotYSize := MilsToCoord(SizeY);

            // Shape (Top/Mid/Bot)
            Pad.TopShape := TopShape;
            Pad.MidShape := MidShape;
            Pad.BotShape := BotShape;

            Pad.HoleSize := MilsToCoord(HoleSize);
            Pad.Layer := Layer;

            if PadName <> '' then
                Pad.Name := PadName;

            if ResolvedNet <> '' then
                Pad.Net := Net;

            // Tenting (solder-mask cover)
            if UseTentingTop then
                Pad.SetState_IsTenting_Top(TentingTop);
            if UseTentingBot then
                Pad.SetState_IsTenting_Bottom(TentingBot);

            // Testpoint
            if UseTestpointTop then
                Pad.SetState_IsTestpoint_Top(TestpointTop);
            if UseTestpointBot then
                Pad.SetState_IsTestpoint_Bottom(TestpointBot);

            // Mask expansions
            if UsePasteMaskExpansion then
                Pad.PasteMaskExpansion := MilsToCoord(PasteMaskExpansionMils);
            if UseSolderMaskExpansion then
                Pad.SolderMaskExpansion := MilsToCoord(SolderMaskExpansionMils);

            // Plane connect style
            if UsePlaneConnect then
                Pad.PowerPlaneConnectStyle := PlaneConnect;
        finally
            Pad.EndModify;
        end;

        Board.AddPCBObject(Pad);
        PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Pad.I_ObjectAddress);
        Pad.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'add_pad');
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONNumber(ResultProps, 'x_mils', X);
        AddJSONNumber(ResultProps, 'y_mils', Y);
        AddJSONNumber(ResultProps, 'width_mils', SizeX);
        AddJSONNumber(ResultProps, 'height_mils', SizeY);
        AddJSONNumber(ResultProps, 'hole_size_mils', HoleSize);
        AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        AddJSONProperty(ResultProps, 'name', PadName);
        AddJSONProperty(ResultProps, 'shape', ShapeStr);
        AddJSONNumber(ResultProps, 'rotation', Rotation);
        if ResolvedNet <> '' then
            AddJSONProperty(ResultProps, 'net', ResolvedNet);
        if UseTentingTop then AddJSONBoolean(ResultProps, 'tenting_top', TentingTop);
        if UseTentingBot then AddJSONBoolean(ResultProps, 'tenting_bottom', TentingBot);
        if UseTestpointTop then AddJSONBoolean(ResultProps, 'testpoint_top', TestpointTop);
        if UseTestpointBot then AddJSONBoolean(ResultProps, 'testpoint_bottom', TestpointBot);
        if UsePasteMaskExpansion then AddJSONNumber(ResultProps, 'paste_mask_expansion_mils', PasteMaskExpansionMils);
        if UseSolderMaskExpansion then AddJSONNumber(ResultProps, 'solder_mask_expansion_mils', SolderMaskExpansionMils);
        if UsePlaneConnect then AddJSONProperty(ResultProps, 'power_plane_connect_style', PlaneConnectStr);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// add_via — Verified: StitchingVias.pas L554-L582
function PcbEditAddVia(Board: IPCB_Board; X, Y, Size, HoleSize: Double; NetName: String;
    LowLayer, HighLayer: TLayer; UseLayers: Boolean;
    TentingTop, TentingBot, TestpointTop, TestpointBot: Boolean;
    UseTentingTop, UseTentingBot, UseTestpointTop, UseTestpointBot: Boolean): String;
var
    Via: IPCB_Via;
    Net: IPCB_Net;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
    PadCache: TPadCache;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    PCBServer.PreProcess;
    try
        Via := PCBServer.PCBObjectFactory(eViaObject, eNoDimension, eCreate_Default);
        Via.X := MilsToCoord(X) + xorigin;
        Via.Y := MilsToCoord(Y) + yorigin;
        Via.Size := MilsToCoord(Size);
        Via.HoleSize := MilsToCoord(HoleSize);
        if UseLayers then
        begin
            Via.LowLayer  := LowLayer;
            Via.HighLayer := HighLayer;
        end
        else
        begin
            Via.LowLayer := eTopLayer;
            Via.HighLayer := eBottomLayer;
        end;
        Board.AddPCBObject(Via);
        PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Via.I_ObjectAddress);
        if NetName <> '' then
        begin
            Net := FindNetByName(Board, NetName);
            if Net <> nil then
            begin
                PCBServer.SendMessageToRobots(Via.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
                Via.Net := Net;
                PCBServer.SendMessageToRobots(Via.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
            end;
        end;
        if UseTentingTop or UseTentingBot or UseTestpointTop or UseTestpointBot then
        begin
            PCBServer.SendMessageToRobots(Via.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
            if UseTentingTop or UseTentingBot then
            begin
                PadCache := Via.Cache;
                PadCache.SolderMaskExpansionValid := eCacheManual;
                Via.SetState_Cache := PadCache;
                if UseTentingTop then
                    Via.SetState_IsTenting_Top(TentingTop);
                if UseTentingBot then
                    Via.SetState_IsTenting_Bottom(TentingBot);
            end;
            if UseTestpointTop then
                Via.SetState_IsTestpoint_Top(TestpointTop);
            if UseTestpointBot then
                Via.SetState_IsTestpoint_Bottom(TestpointBot);
            PCBServer.SendMessageToRobots(Via.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
        end;
        Via.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'add_via');
        AddJSONNumber(ResultProps, 'x_mils', X);
        AddJSONNumber(ResultProps, 'y_mils', Y);
        AddJSONNumber(ResultProps, 'size_mils', Size);
        AddJSONNumber(ResultProps, 'hole_size_mils', HoleSize);
        AddJSONProperty(ResultProps, 'net', NetName);
        if UseLayers then
        begin
            AddJSONProperty(ResultProps, 'low_layer', Layer2String(LowLayer));
            AddJSONProperty(ResultProps, 'high_layer', Layer2String(HighLayer));
        end;
        if UseTentingTop then AddJSONBoolean(ResultProps, 'tenting_top', TentingTop);
        if UseTentingBot then AddJSONBoolean(ResultProps, 'tenting_bottom', TentingBot);
        if UseTestpointTop then AddJSONBoolean(ResultProps, 'testpoint_top', TestpointTop);
        if UseTestpointBot then AddJSONBoolean(ResultProps, 'testpoint_bottom', TestpointBot);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// add_fill — Verified: SolderPasteGrid.pas L172-L183
// pcb_edit: add_fill — extended per IPCB_Fill API (§3.3 Fill: Net, IsKeepout, Moveable, PrimitiveLock).
// Verified: PCBObjectInspector.pas L980+ for Fill — Layer, PrimitiveLock, Moveable, UniqueId, IsKeepout, Net.
function PcbEditAddFill(Board: IPCB_Board; X1, Y1, X2, Y2, Rotation: Double; Layer: TLayer;
    NetName: String; UseNet: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean): String;
var
    Fill: IPCB_Fill;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
    Net: IPCB_Net;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    PCBServer.PreProcess;
    try
        Fill := PCBServer.PCBObjectFactory(eFillObject, eNoDimension, eCreate_Default);
        Fill.X1Location := MilsToCoord(X1) + xorigin;
        Fill.Y1Location := MilsToCoord(Y1) + yorigin;
        Fill.X2Location := MilsToCoord(X2) + xorigin;
        Fill.Y2Location := MilsToCoord(Y2) + yorigin;
        Fill.Layer := Layer;
        Fill.Rotation := Rotation;
        if UseKeepout  then Fill.IsKeepout      := IsKeepout;
        if UseMoveable then Fill.Moveable       := Moveable;
        if UsePrimLock then Fill.PrimitiveLock  := PrimLock;
        if Net <> nil then Fill.Net             := Net;
        Board.AddPCBObject(Fill);
        PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Fill.I_ObjectAddress);
        Fill.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'add_fill');
        AddJSONNumber(ResultProps, 'x1_mils', X1);
        AddJSONNumber(ResultProps, 'y1_mils', Y1);
        AddJSONNumber(ResultProps, 'x2_mils', X2);
        AddJSONNumber(ResultProps, 'y2_mils', Y2);
        AddJSONNumber(ResultProps, 'rotation', Rotation);
        AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseNet      and (NetName <> '') then AddJSONProperty(ResultProps, 'net', NetName);
        if UseKeepout  then AddJSONBoolean(ResultProps, 'is_keepout', IsKeepout);
        if UseMoveable then AddJSONBoolean(ResultProps, 'moveable',   Moveable);
        if UsePrimLock then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// add_arc — Verified: FilletWithRadius.pas L261-L289
// Extended: supports net_name (Arc.Net per 01_PCB对象与API §3.3).
function PcbEditAddArc(Board: IPCB_Board; XC, YC, Radius, StartAngle, EndAngle, Width: Double; Layer: TLayer;
    NetName: String; UseNet: Boolean): String;
var
    Arc: IPCB_Arc;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
    Net: IPCB_Net;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    PCBServer.PreProcess;
    try
        Arc := PCBServer.PCBObjectFactory(eArcObject, eNoDimension, eCreate_Default);
        Arc.XCenter := MilsToCoord(XC) + xorigin;
        Arc.YCenter := MilsToCoord(YC) + yorigin;
        Arc.Radius := MilsToCoord(Radius);
        Arc.StartAngle := StartAngle;
        Arc.EndAngle := EndAngle;
        Arc.LineWidth := MilsToCoord(Width);
        Arc.Layer := Layer;
        if Net <> nil then
            Arc.Net := Net;
        Board.AddPCBObject(Arc);
        PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Arc.I_ObjectAddress);
        Arc.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'add_arc');
        AddJSONNumber(ResultProps, 'x_center_mils', XC);
        AddJSONNumber(ResultProps, 'y_center_mils', YC);
        AddJSONNumber(ResultProps, 'radius_mils', Radius);
        AddJSONNumber(ResultProps, 'start_angle', StartAngle);
        AddJSONNumber(ResultProps, 'end_angle', EndAngle);
        AddJSONNumber(ResultProps, 'width_mils', Width);
        AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseNet and (NetName <> '') then
            AddJSONProperty(ResultProps, 'net', NetName);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// add_text — Verified: AddText.pas L35-L110
// Extended: per 01_PCB对象与API §3.6 — Width (stroke width), UseTTFonts,
//   FontName, Bold, Italic. All optional; defaults preserve prior behavior.
function PcbEditAddText(Board: IPCB_Board; X, Y, Height, Width: Double;
    const Txt: String; Layer: TLayer; Rotation: Double;
    UseTTFonts: Boolean; const FontName: String; Bold, Italic: Boolean;
    UseWidth, UseTTF, UseFontName, UseBold, UseItalic: Boolean): String;
var
    TextObj: IPCB_Text;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    PCBServer.PreProcess;
    try
        TextObj := PCBServer.PCBObjectFactory(eTextObject, eNoDimension, eCreate_Default);
        TextObj.XLocation := MilsToCoord(X) + xorigin;
        TextObj.YLocation := MilsToCoord(Y) + yorigin;
        TextObj.Text := Txt;
        TextObj.Size := MilsToCoord(Height);
        if UseWidth then
            TextObj.Width := MilsToCoord(Width);
        TextObj.Layer := Layer;
        if UseTTF then
            TextObj.UseTTFonts := UseTTFonts
        else
            TextObj.UseTTFonts := True;
        if UseFontName and (FontName <> '') then
            TextObj.FontName := FontName
        else if TextObj.UseTTFonts then
            TextObj.FontName := 'Default';
        if UseBold then
            TextObj.Bold := Bold;
        if UseItalic then
            TextObj.Italic := Italic;
        if Rotation <> 0 then
            TextObj.RotateBy(Rotation);
        Board.AddPCBObject(TextObj);
        PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, TextObj.I_ObjectAddress);
        TextObj.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'add_text');
        AddJSONNumber(ResultProps, 'x_mils', X);
        AddJSONNumber(ResultProps, 'y_mils', Y);
        AddJSONProperty(ResultProps, 'text', Txt);
        AddJSONNumber(ResultProps, 'height_mils', Height);
        if UseWidth then AddJSONNumber(ResultProps, 'stroke_width_mils', Width);
        AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        AddJSONNumber(ResultProps, 'rotation', Rotation);
        if UseTTF then AddJSONBoolean(ResultProps, 'use_ttfont', UseTTFonts);
        if UseFontName and (FontName <> '') then AddJSONProperty(ResultProps, 'font_name', FontName);
        if UseBold then AddJSONBoolean(ResultProps, 'bold', Bold);
        if UseItalic then AddJSONBoolean(ResultProps, 'italic', Italic);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// delete_objects — Verified: MoveToLayer.pas L240, pattern from 06-通用编程模式 TInterfaceList
function PcbEditDeleteObjects(Board: IPCB_Board; ObjectSet: TSet; Layer: TLayer; UseLayer: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    List: TInterfaceList;
    i: Integer;
    Obj: IPCB_Primitive;
    DeletedCount: Integer;
    ResultProps: TStringList;
    LayerSet: TSet;
begin
    List := TInterfaceList.Create;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(ObjectSet);
        if UseLayer then
            Iterator.AddFilter_LayerSet(MkSet(Layer))
        else
            Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);

        Obj := Iterator.FirstPCBObject;
        while Obj <> nil do
        begin
            List.Add(Obj);
            Obj := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);

        DeletedCount := 0;
        PCBServer.PreProcess;
        try
            for i := 0 to List.Count - 1 do
            begin
                Obj := List.Items[i];
                PCBServer.SendMessageToRobots(Obj.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
                Board.RemovePCBObject(Obj);
                PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
                DeletedCount := DeletedCount + 1;
            end;
        finally
            PCBServer.PostProcess;
        end;
        Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

        ResultProps := TStringList.Create;
        try
            AddJSONProperty(ResultProps, 'action', 'delete_objects');
            AddJSONInteger(ResultProps, 'deleted_count', DeletedCount);
            Result := BuildJSONObject(ResultProps);
        finally
            ResultProps.Free;
        end;
    finally
        List.Free;
    end;
end;

// select_objects — Verified: SelectAssyDesignators.pas L636-L679
function PcbEditSelectObjects(Board: IPCB_Board; ObjectSet: TSet; Layer: TLayer; UseLayer: Boolean; DoSelect: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Obj: IPCB_Primitive;
    Count: Integer;
    ResultProps: TStringList;
begin
    Count := 0;
    Iterator := Board.BoardIterator_Create;
    Iterator.AddFilter_ObjectSet(ObjectSet);
    if UseLayer then
        Iterator.AddFilter_LayerSet(MkSet(Layer))
    else
        Iterator.AddFilter_LayerSet(AllLayers);
    Iterator.AddFilter_Method(eProcessAll);

    try
        Obj := Iterator.FirstPCBObject;
        while Obj <> nil do
        begin
            Obj.Selected := DoSelect;
            Count := Count + 1;
            Obj := Iterator.NextPCBObject;
        end;
    finally
        Board.BoardIterator_Destroy(Iterator);
    end;
    Board.ViewManager_FullUpdate;

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'select_objects');
        AddJSONInteger(ResultProps, 'affected_count', Count);
        AddJSONProperty(ResultProps, 'select', BoolToStr(DoSelect, 'true', 'false'));
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: add_region — Create copper region from contour points
// Verified: DesignReuse.pas — PCBObjectFactory(eRegionObject) + contour
// =====================================================================
// pcb_edit: add_region — extended with Kind (TRegionKind), IsKeepout, Moveable, PrimitiveLock
// Verified: 01_PCB对象与API §3.8 — Kind/HoleCount/MainContour/Area/GetGeometricPolygon; Layer already inherited
// Verified: PCBObjectInspector L1183+ — Kind:TRegionKind, HoleCount, Layer, Moveable, UniqueId, IsKeepout, Net
function PcbEditAddRegion(Board: IPCB_Board; PointsCsv: String; Layer: TLayer; NetName: String;
    RegKind: TRegionKind; UseKind: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean): String;
var
    Region: IPCB_Region;
    Contour: IPCB_Contour;
    ResultProps: TStringList;
    Parts: TStringList;
    i, PtCount: Integer;
    X, Y: Double;
    xorigin, yorigin: TCoord;
    Net: IPCB_Net;
    RegKindStr: String;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;
    Parts := TStringList.Create;
    Parts.Delimiter := ',';
    Parts.DelimitedText := PointsCsv;
    PtCount := Parts.Count div 2;
    if PtCount < 3 then
    begin
        Result := 'ERROR: AT_LEAST_3_POINTS_REQUIRED (x1,y1,x2,y2,...)';
        Parts.Free;
        Exit;
    end;

    Contour := PCBServer.PCBContourFactory;
    for i := 0 to PtCount - 1 do
    begin
        X := StrToFloat(StringReplace(Parts[i * 2], ',', '.', MkSet(rfReplaceAll)));
        Y := StrToFloat(StringReplace(Parts[i * 2 + 1], ',', '.', MkSet(rfReplaceAll)));
        Contour.AddPoint(MilsToCoord(X) + xorigin, MilsToCoord(Y) + yorigin);
    end;

    PCBServer.PreProcess;
    try
        Region := PCBServer.PCBObjectFactory(eRegionObject, eNoDimension, eCreate_Default);
        if UseKind then Region.Kind := RegKind
                   else Region.Kind := eRegionKind_Copper;
        Region.Layer := Layer;
        if NetName <> '' then
        begin
            Net := FindNetByName(Board, NetName);
            if Net <> nil then
                Region.Net := Net;
        end;
        if UseKeepout  then Region.IsKeepout     := IsKeepout;
        if UseMoveable then Region.Moveable      := Moveable;
        if UsePrimLock then Region.PrimitiveLock := PrimLock;
        Region.SetOutlineContour(Contour);
        Board.AddPCBObject(Region);
        PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Region.I_ObjectAddress);
        Region.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    case Region.Kind of
        eRegionKind_Copper:      RegKindStr := 'eRegionKind_Copper';
        eRegionKind_Cutout:      RegKindStr := 'eRegionKind_Cutout';
        eRegionKind_NamedRegion: RegKindStr := 'eRegionKind_NamedRegion';
        eRegionKind_BoardCutout: RegKindStr := 'eRegionKind_BoardCutout';
        eRegionKind_Cavity:      RegKindStr := 'eRegionKind_Cavity';
    else RegKindStr := 'Unknown';
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'add_region');
        AddJSONInteger(ResultProps, 'point_count', PtCount);
        AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if NetName <> '' then AddJSONProperty(ResultProps, 'net', NetName);
        AddJSONProperty(ResultProps, 'kind', RegKindStr);
        if UseKeepout  then AddJSONBoolean(ResultProps, 'is_keepout', IsKeepout);
        if UseMoveable then AddJSONBoolean(ResultProps, 'moveable',   Moveable);
        if UsePrimLock then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
        Parts.Free;
    end;
end;

// =====================================================================
// pcb_edit: add_polygon_pour — Extended with full IPCB_Polygon flags
// Verified: 01_PCB对象与API §3.7 — Layer/Net/AreaSize/PolyHatchStyle/PourOver/Grid/TrackSize/MinTrack/PointCount/Poured
// Verified: PCBObjectInspector L1126+  —  Net, AreaSize, RemoveDead, UseOctagons, PourOver, Grid, TrackSize,
//            MinTrack, PointCount, PolyHatchStyle, Poured, PrimitiveLock, Layer, Moveable, UniqueId
// =====================================================================
function PcbEditAddPolygonPour(Board: IPCB_Board; PointsCsv: String; Layer: TLayer; NetName: String;
    Grid, TrackSize, MinTrack: Double; HatchStyle: Integer; PourOverInt: Integer;
    UseOctagons, RemoveDead, UseOct, UseRemoveDead: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean): String;
var
    Polygon: IPCB_Polygon;
    ResultProps: TStringList;
    Parts: TStringList;
    i, PtCount: Integer;
    X, Y: Double;
    xorigin, yorigin: TCoord;
    Net: IPCB_Net;
    PourOverStr: String;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;
    Parts := TStringList.Create;
    Parts.Delimiter := ',';
    Parts.DelimitedText := PointsCsv;
    PtCount := Parts.Count div 2;
    if PtCount < 3 then
    begin
        Result := 'ERROR: AT_LEAST_3_POINTS_REQUIRED';
        Parts.Free;
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Polygon := PCBServer.PCBObjectFactory(ePolyObject, eNoDimension, eCreate_Default);
        Polygon.Layer := Layer;
        if NetName <> '' then
        begin
            Net := FindNetByName(Board, NetName);
            if Net <> nil then
                Polygon.Net := Net;
        end;
        Polygon.PointCount := PtCount;
        for i := 0 to PtCount - 1 do
        begin
            X := StrToFloat(StringReplace(Parts[i * 2], ',', '.', MkSet(rfReplaceAll)));
            Y := StrToFloat(StringReplace(Parts[i * 2 + 1], ',', '.', MkSet(rfReplaceAll)));
            Polygon.Segments[i].vx := MilsToCoord(X) + xorigin;
            Polygon.Segments[i].vy := MilsToCoord(Y) + yorigin;
            Polygon.Segments[i].Kind := 0;
        end;
        Polygon.Grid := MilsToCoord(Grid);
        Polygon.TrackSize := MilsToCoord(TrackSize);
        Polygon.MinTrack := MilsToCoord(MinTrack);
        Polygon.PolyHatchStyle := HatchStyle;
        // PourOver can be 0/1/2: verified sPolygonPourOverStrings: None=0, SameNet=1, SameNetPolygons=2
        if (PourOverInt >= 0) and (PourOverInt <= 2) then Polygon.PourOver := PourOverInt;
        if UseOct        then Polygon.UseOctagons     := UseOctagons;
        if UseRemoveDead then Polygon.RemoveDead      := RemoveDead;
        if UseKeepout    then Polygon.IsKeepout       := IsKeepout;
        if UseMoveable   then Polygon.Moveable        := Moveable;
        if UsePrimLock   then Polygon.PrimitiveLock   := PrimLock;
        Board.AddPCBObject(Polygon);
        PCBServer.SendMessageToRobots(Board.I_ObjectAddress, c_Broadcast, PCBM_BoardRegisteration, Polygon.I_ObjectAddress);
        Polygon.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    case Polygon.PourOver of
        0: PourOverStr := 'ePolygonPourOver_None';
        1: PourOverStr := 'ePolygonPourOver_SameNet';
        2: PourOverStr := 'ePolygonPourOver_SameNetPolygons';
    else PourOverStr := 'Unknown';
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'add_polygon_pour');
        AddJSONInteger(ResultProps, 'point_count', PtCount);
        AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if NetName <> '' then
            AddJSONProperty(ResultProps, 'net', NetName);
        AddJSONNumber(ResultProps, 'grid_mils', Grid);
        AddJSONNumber(ResultProps, 'track_size_mils', TrackSize);
        AddJSONNumber(ResultProps, 'min_track_mils', MinTrack);
        AddJSONInteger(ResultProps, 'hatch_style', HatchStyle);
        AddJSONProperty(ResultProps, 'pour_over', PourOverStr);
        if UseOct        then AddJSONBoolean(ResultProps, 'use_octagons', UseOctagons);
        if UseRemoveDead then AddJSONBoolean(ResultProps, 'remove_dead',  RemoveDead);
        if UseKeepout    then AddJSONBoolean(ResultProps, 'is_keepout',   IsKeepout);
        if UseMoveable   then AddJSONBoolean(ResultProps, 'moveable',     Moveable);
        if UsePrimLock   then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
        Parts.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_track — Modify selected or all tracks
// Verified: BeginModify/EndModify pattern + Track property writes
// =====================================================================
function PcbEditModifyTrack(Board: IPCB_Board; Width: Double; Layer: TLayer; NetName: String;
    UseWidth, UseLayer, UseNet: Boolean; SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Track: IPCB_Track;
    Net: IPCB_Net;
    ModCount: Integer;
    ResultProps: TStringList;
begin
    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eTrackObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Track := Iterator.FirstPCBObject;
        while Track <> nil do
        begin
            if (not SelectedOnly) or Track.Selected then
            begin
                Track.BeginModify;
                if UseWidth then
                    Track.Width := MilsToCoord(Width);
                if UseLayer then
                    Track.Layer := Layer;
                if UseNet and (Net <> nil) then
                    Track.Net := Net;
                Track.EndModify;
                Track.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Track := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_track');
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseWidth then AddJSONNumber(ResultProps, 'width_mils', Width);
        if UseLayer then AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseNet then AddJSONProperty(ResultProps, 'net', NetName);
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_pad — Extended modify for standalone pads.
// New features vs original:
//   - Net assignment (fixes "GND net not set" bug from user report)
//   - Rotation, Shape, MidXSize/MidYSize + MidShape consistency
//   - Testpoint top/bottom, PasteMaskExpansion, SolderMaskExpansion
//   - PowerPlaneConnectStyle
//   - Filter by pad_name (TargetPadName): when provided, only modifies the
//     matching FREE (not in-component) pad by Pad.Name; also can be empty
//     to match any free pad. If SelectedOnly=false AND TargetPadName='',
//     iterates ALL pads (including footprint pads) — use carefully.
// Verified: TentingVias.pas (SetState_IsTenting),
//   PCBObjectInspector.pas (Rotation/Shape/Mask/PlaneConnect),
//   FixConnections.pas (Net := FindNetByName result).
// =====================================================================
function PcbEditModifyPad(Board: IPCB_Board; Width, Height, HoleSize, Rotation,
    PasteMaskExpansionMils, SolderMaskExpansionMils: Double; Layer: TLayer;
    UseWidth, UseHeight, UseHole, UseLayer, UseRotation: Boolean;
    TentingTop, TentingBot, TestpointTop, TestpointBot: Boolean;
    UseTentingTop, UseTentingBot, UseTestpointTop, UseTestpointBot: Boolean;
    UsePasteMaskExpansion, UseSolderMaskExpansion: Boolean;
    const NetName, ShapeStr, PlaneConnectStr, TargetPadName: String;
    UseNet, UseShape, UsePlaneConnect, UseTargetPadName: Boolean;
    SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Pad: IPCB_Pad2;
    Net: IPCB_Net;
    ModCount: Integer;
    ResultProps: TStringList;
    TopShape, MidShape, BotShape: TShape;
    PlaneConnect: TPlaneConnectStyle;
    Hit: Boolean;
    ResolvedNet: String;
begin
    ResolvedNet := '';
    if UseNet and (NetName <> '') then
    begin
        Net := FindNetByName(Board, NetName);
        if Net = nil then
        begin
            ResultProps := TStringList.Create;
            try
                AddJSONProperty(ResultProps, 'action', 'modify_pad');
                AddJSONBoolean(ResultProps, 'success', False);
                AddJSONProperty(ResultProps, 'error', 'NET_NOT_FOUND');
                AddJSONProperty(ResultProps, 'net_name', NetName);
                Result := BuildJSONObject(ResultProps);
            finally
                ResultProps.Free;
            end;
            Exit;
        end;
        ResolvedNet := Net.Name;
    end;

    if UseShape and (ShapeStr <> '') then
    begin
        TopShape := PcbEditParseShapeFromString(ShapeStr);
        MidShape := TopShape;
        BotShape := TopShape;
    end;

    if UsePlaneConnect and (PlaneConnectStr <> '') then
        PlaneConnect := PcbEditParsePlaneConnectFromString(PlaneConnectStr);

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(ePadObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Pad := Iterator.FirstPCBObject;
        while Pad <> nil do
        begin
            // Filter 1: SelectedOnly
            if SelectedOnly and (not Pad.Selected) then
            begin
                Pad := Iterator.NextPCBObject;
                Continue;
            end;
            // Filter 2: by pad_name (if provided, match FREE pads only by Name)
            Hit := True;
            if UseTargetPadName then
            begin
                if Pad.InComponent then
                    Hit := False
                else if (TargetPadName <> '') and
                        (AnsiCompareText(Trim(Pad.Name), Trim(TargetPadName)) <> 0) then
                    Hit := False;
            end;
            if not Hit then
            begin
                Pad := Iterator.NextPCBObject;
                Continue;
            end;

            Pad.BeginModify;
            try
                if UseWidth then
                begin
                    Pad.TopXSize := MilsToCoord(Width);
                    Pad.MidXSize := MilsToCoord(Width);
                    Pad.BotXSize := MilsToCoord(Width);
                end;
                if UseHeight then
                begin
                    Pad.TopYSize := MilsToCoord(Height);
                    Pad.MidYSize := MilsToCoord(Height);
                    Pad.BotYSize := MilsToCoord(Height);
                end;
                if UseHole then
                    Pad.HoleSize := MilsToCoord(HoleSize);
                if UseLayer then
                    Pad.Layer := Layer;
                if UseRotation then
                    Pad.Rotation := Rotation;
                if UseShape and (ShapeStr <> '') then
                begin
                    Pad.TopShape := TopShape;
                    Pad.MidShape := MidShape;
                    Pad.BotShape := BotShape;
                end;
                if UseTentingTop then
                    Pad.SetState_IsTenting_Top(TentingTop);
                if UseTentingBot then
                    Pad.SetState_IsTenting_Bottom(TentingBot);
                if UseTestpointTop then
                    Pad.SetState_IsTestpoint_Top(TestpointTop);
                if UseTestpointBot then
                    Pad.SetState_IsTestpoint_Bottom(TestpointBot);
                if UsePasteMaskExpansion then
                    Pad.PasteMaskExpansion := MilsToCoord(PasteMaskExpansionMils);
                if UseSolderMaskExpansion then
                    Pad.SolderMaskExpansion := MilsToCoord(SolderMaskExpansionMils);
                if UsePlaneConnect and (PlaneConnectStr <> '') then
                    Pad.PowerPlaneConnectStyle := PlaneConnect;
                if UseNet and (Net <> nil) then
                    Pad.Net := Net;
            finally
                Pad.EndModify;
            end;
            Pad.GraphicallyInvalidate;
            ModCount := ModCount + 1;

            Pad := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_pad');
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseWidth then AddJSONNumber(ResultProps, 'width_mils', Width);
        if UseHeight then AddJSONNumber(ResultProps, 'height_mils', Height);
        if UseHole then AddJSONNumber(ResultProps, 'hole_size_mils', HoleSize);
        if UseLayer then AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseRotation then AddJSONNumber(ResultProps, 'rotation', Rotation);
        if UseShape then AddJSONProperty(ResultProps, 'shape', ShapeStr);
        if UseTentingTop then AddJSONBoolean(ResultProps, 'tenting_top', TentingTop);
        if UseTentingBot then AddJSONBoolean(ResultProps, 'tenting_bottom', TentingBot);
        if UseTestpointTop then AddJSONBoolean(ResultProps, 'testpoint_top', TestpointTop);
        if UseTestpointBot then AddJSONBoolean(ResultProps, 'testpoint_bottom', TestpointBot);
        if UsePasteMaskExpansion then AddJSONNumber(ResultProps, 'paste_mask_expansion_mils', PasteMaskExpansionMils);
        if UseSolderMaskExpansion then AddJSONNumber(ResultProps, 'solder_mask_expansion_mils', SolderMaskExpansionMils);
        if UsePlaneConnect then AddJSONProperty(ResultProps, 'power_plane_connect_style', PlaneConnectStr);
        if UseNet then AddJSONProperty(ResultProps, 'net', ResolvedNet);
        if UseTargetPadName then AddJSONProperty(ResultProps, 'pad_name', TargetPadName);
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_via — Modify via properties
// Verified: TentingVias.pas — SetState_IsTenting + Cache pattern
// =====================================================================
// modify_via — Extended per 01_PCB对象与API §3.5: HighLayer, LowLayer,
//   IsTestpoint_Top, IsTestpoint_Bottom added to original Size/HoleSize/Tenting/Net.
function PcbEditModifyVia(Board: IPCB_Board; Size, HoleSize: Double;
    UseSize, UseHole: Boolean;
    TentingTop, TentingBot, TestpointTop, TestpointBot: Boolean;
    UseTentingTop, UseTentingBot, UseTestpointTop, UseTestpointBot: Boolean;
    NetName: String; UseNet: Boolean;
    LowLayer, HighLayer: TLayer; UseLayers: Boolean;
    SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Via: IPCB_Via;
    Net: IPCB_Net;
    PadCache: TPadCache;
    ModCount: Integer;
    ResultProps: TStringList;
begin
    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eViaObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Via := Iterator.FirstPCBObject;
        while Via <> nil do
        begin
            if (not SelectedOnly) or Via.Selected then
            begin
                Via.BeginModify;
                if UseSize then
                    Via.Size := MilsToCoord(Size);
                if UseHole then
                    Via.HoleSize := MilsToCoord(HoleSize);
                if UseNet and (Net <> nil) then
                    Via.Net := Net;
                if UseLayers then
                begin
                    Via.LowLayer  := LowLayer;
                    Via.HighLayer := HighLayer;
                end;
                if UseTentingTop or UseTentingBot then
                begin
                    PadCache := Via.Cache;
                    PadCache.SolderMaskExpansionValid := eCacheManual;
                    Via.SetState_Cache := PadCache;
                    if UseTentingTop then
                        Via.SetState_IsTenting_Top(TentingTop);
                    if UseTentingBot then
                        Via.SetState_IsTenting_Bottom(TentingBot);
                end;
                if UseTestpointTop then
                    Via.SetState_IsTestpoint_Top(TestpointTop);
                if UseTestpointBot then
                    Via.SetState_IsTestpoint_Bottom(TestpointBot);
                Via.EndModify;
                Via.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Via := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_via');
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseSize then AddJSONNumber(ResultProps, 'size_mils', Size);
        if UseHole then AddJSONNumber(ResultProps, 'hole_size_mils', HoleSize);
        if UseTentingTop then AddJSONBoolean(ResultProps, 'tenting_top', TentingTop);
        if UseTentingBot then AddJSONBoolean(ResultProps, 'tenting_bottom', TentingBot);
        if UseTestpointTop then AddJSONBoolean(ResultProps, 'testpoint_top', TestpointTop);
        if UseTestpointBot then AddJSONBoolean(ResultProps, 'testpoint_bottom', TestpointBot);
        if UseNet then AddJSONProperty(ResultProps, 'net', NetName);
        if UseLayers then
        begin
            AddJSONProperty(ResultProps, 'low_layer', Layer2String(LowLayer));
            AddJSONProperty(ResultProps, 'high_layer', Layer2String(HighLayer));
        end;
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_text — Modify text properties
// =====================================================================
// modify_text — Extended per 01_PCB对象与API §3.6:
//   X/Y location, Width (stroke width), UseTTFonts, FontName, Bold, Italic.
function PcbEditModifyText(Board: IPCB_Board; Txt: String; X, Y, Height, Width: Double;
    Layer: TLayer; Rotation: Double;
    UseTTFonts: Boolean; const FontName: String; Bold, Italic: Boolean;
    UseText, UseX, UseY, UseHeight, UseWidth, UseLayer, UseRotation: Boolean;
    UseTTF, UseFontName, UseBold, UseItalic: Boolean; SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    TextObj: IPCB_Text;
    ModCount: Integer;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eTextObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        TextObj := Iterator.FirstPCBObject;
        while TextObj <> nil do
        begin
            if (not SelectedOnly) or TextObj.Selected then
            begin
                TextObj.BeginModify;
                if UseText and (Txt <> '') then
                    TextObj.Text := Txt;
                if UseX then
                    TextObj.XLocation := MilsToCoord(X) + xorigin;
                if UseY then
                    TextObj.YLocation := MilsToCoord(Y) + yorigin;
                if UseHeight then
                    TextObj.Size := MilsToCoord(Height);
                if UseWidth then
                    TextObj.Width := MilsToCoord(Width);
                if UseLayer then
                    TextObj.Layer := Layer;
                if UseRotation then
                    TextObj.Rotation := Rotation;
                if UseTTF then
                    TextObj.UseTTFonts := UseTTFonts;
                if UseFontName and (FontName <> '') then
                    TextObj.FontName := FontName;
                if UseBold then
                    TextObj.Bold := Bold;
                if UseItalic then
                    TextObj.Italic := Italic;
                TextObj.EndModify;
                TextObj.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            TextObj := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_text');
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseText then AddJSONProperty(ResultProps, 'text', Txt);
        if UseX then AddJSONNumber(ResultProps, 'x_mils', X);
        if UseY then AddJSONNumber(ResultProps, 'y_mils', Y);
        if UseHeight then AddJSONNumber(ResultProps, 'height_mils', Height);
        if UseWidth then AddJSONNumber(ResultProps, 'stroke_width_mils', Width);
        if UseLayer then AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseRotation then AddJSONNumber(ResultProps, 'rotation', Rotation);
        if UseTTF then AddJSONBoolean(ResultProps, 'use_ttfont', UseTTFonts);
        if UseFontName and (FontName <> '') then AddJSONProperty(ResultProps, 'font_name', FontName);
        if UseBold then AddJSONBoolean(ResultProps, 'bold', Bold);
        if UseItalic then AddJSONBoolean(ResultProps, 'italic', Italic);
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_track — Extended with endpoint x1/y1/x2/y2 + primitive flags
//   Per 01_PCB对象与API §3.2, IPCB_Track has x1,y1,x2,y2,Width,Layer,Net,IsKeepout.
//   PCBObjectInspector also exposes Moveable / PrimitiveLock at the primitive level.
// =====================================================================
function PcbEditModifyTrack2(Board: IPCB_Board;
    X1, Y1, X2, Y2, Width: Double; Layer: TLayer; NetName: String;
    UseX1, UseY1, UseX2, UseY2, UseWidth, UseLayer, UseNet: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean;
    SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Track: IPCB_Track;
    Net: IPCB_Net;
    ModCount: Integer;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
begin
    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eTrackObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Track := Iterator.FirstPCBObject;
        while Track <> nil do
        begin
            if (not SelectedOnly) or Track.Selected then
            begin
                Track.BeginModify;
                if UseX1 then Track.X1 := MilsToCoord(X1) + xorigin;
                if UseY1 then Track.Y1 := MilsToCoord(Y1) + yorigin;
                if UseX2 then Track.X2 := MilsToCoord(X2) + xorigin;
                if UseY2 then Track.Y2 := MilsToCoord(Y2) + yorigin;
                if UseWidth then Track.Width := MilsToCoord(Width);
                if UseLayer then Track.Layer := Layer;
                if UseNet and (Net <> nil) then Track.Net := Net;
                if UseKeepout  then Track.IsKeepout     := IsKeepout;
                if UseMoveable then Track.Moveable      := Moveable;
                if UsePrimLock then Track.PrimitiveLock := PrimLock;
                Track.EndModify;
                Track.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Track := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_track');
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseX1 then AddJSONNumber(ResultProps, 'x1_mils', X1);
        if UseY1 then AddJSONNumber(ResultProps, 'y1_mils', Y1);
        if UseX2 then AddJSONNumber(ResultProps, 'x2_mils', X2);
        if UseY2 then AddJSONNumber(ResultProps, 'y2_mils', Y2);
        if UseWidth then AddJSONNumber(ResultProps, 'width_mils', Width);
        if UseLayer then AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseNet then AddJSONProperty(ResultProps, 'net', NetName);
        if UseKeepout  then AddJSONBoolean(ResultProps, 'is_keepout',     IsKeepout);
        if UseMoveable then AddJSONBoolean(ResultProps, 'moveable',       Moveable);
        if UsePrimLock then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_arc — New.
//   Per 01_PCB对象与API §3.3 IPCB_Arc: XCenter/YCenter/Radius/StartAngle/
//   EndAngle/LineWidth/Layer/Net. Extended with IsKeepout/Moveable/PrimitiveLock
//   (inherited from IPCB_Primitive — PCBObjectInspector L1279+).
// =====================================================================
function PcbEditModifyArc(Board: IPCB_Board;
    XC, YC, Radius, StartAngle, EndAngle, Width: Double; Layer: TLayer;
    NetName: String;
    UseXC, UseYC, UseRadius, UseStart, UseEnd, UseWidth, UseLayer, UseNet: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean;
    SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Arc: IPCB_Arc;
    Net: IPCB_Net;
    ModCount: Integer;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
begin
    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eArcObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Arc := Iterator.FirstPCBObject;
        while Arc <> nil do
        begin
            if (not SelectedOnly) or Arc.Selected then
            begin
                Arc.BeginModify;
                if UseXC then Arc.XCenter := MilsToCoord(XC) + xorigin;
                if UseYC then Arc.YCenter := MilsToCoord(YC) + yorigin;
                if UseRadius then Arc.Radius := MilsToCoord(Radius);
                if UseStart then Arc.StartAngle := StartAngle;
                if UseEnd then Arc.EndAngle := EndAngle;
                if UseWidth then Arc.LineWidth := MilsToCoord(Width);
                if UseLayer then Arc.Layer := Layer;
                if UseNet and (Net <> nil) then Arc.Net := Net;
                if UseKeepout  then Arc.IsKeepout     := IsKeepout;
                if UseMoveable then Arc.Moveable      := Moveable;
                if UsePrimLock then Arc.PrimitiveLock := PrimLock;
                Arc.EndModify;
                Arc.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Arc := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_arc');
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseXC then AddJSONNumber(ResultProps, 'x_center_mils', XC);
        if UseYC then AddJSONNumber(ResultProps, 'y_center_mils', YC);
        if UseRadius then AddJSONNumber(ResultProps, 'radius_mils', Radius);
        if UseStart then AddJSONNumber(ResultProps, 'start_angle', StartAngle);
        if UseEnd then AddJSONNumber(ResultProps, 'end_angle', EndAngle);
        if UseWidth then AddJSONNumber(ResultProps, 'width_mils', Width);
        if UseLayer then AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseNet then AddJSONProperty(ResultProps, 'net', NetName);
        if UseKeepout  then AddJSONBoolean(ResultProps, 'is_keepout',     IsKeepout);
        if UseMoveable then AddJSONBoolean(ResultProps, 'moveable',       Moveable);
        if UsePrimLock then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_region — New — per IPCB_Region writable API.
// Verified: 01_PCB对象与API §3.8 IPCB_Region — Kind / Area / HoleCount / MainContour /
//   GetGeometricPolygon; PCBObjectInspector L1183+ Kind/HoleCount/Layer/Moveable/UniqueId/
//   IsKeepout/Net. This action only modifies writable scalar flags + layer/net + kind.
// =====================================================================
function PcbEditModifyRegion(Board: IPCB_Board;
    Layer: TLayer; UseLayer: Boolean;
    NetName: String; UseNet: Boolean;
    RegKind: TRegionKind; UseKind: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean;
    SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Region: IPCB_Region;
    Net: IPCB_Net;
    ModCount: Integer;
    ResultProps: TStringList;
    RegKindStr: String;
begin
    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eRegionObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Region := Iterator.FirstPCBObject;
        while Region <> nil do
        begin
            if (not SelectedOnly) or Region.Selected then
            begin
                Region.BeginModify;
                if UseLayer then Region.Layer := Layer;
                if UseKind  then Region.Kind  := RegKind;
                if UseNet and (Net <> nil) then Region.Net := Net;
                if UseKeepout  then Region.IsKeepout     := IsKeepout;
                if UseMoveable then Region.Moveable      := Moveable;
                if UsePrimLock then Region.PrimitiveLock := PrimLock;
                Region.EndModify;
                Region.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Region := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    if UseKind then begin
        case RegKind of
            eRegionKind_Copper:      RegKindStr := 'eRegionKind_Copper';
            eRegionKind_Cutout:      RegKindStr := 'eRegionKind_Cutout';
            eRegionKind_NamedRegion: RegKindStr := 'eRegionKind_NamedRegion';
            eRegionKind_BoardCutout: RegKindStr := 'eRegionKind_BoardCutout';
            eRegionKind_Cavity:      RegKindStr := 'eRegionKind_Cavity';
        else RegKindStr := 'Unknown';
        end;
    end else RegKindStr := '';

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_region');
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseLayer then AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseNet   then AddJSONProperty(ResultProps, 'net',   NetName);
        if UseKind  then AddJSONProperty(ResultProps, 'kind',  RegKindStr);
        if UseKeepout  then AddJSONBoolean(ResultProps, 'is_keepout',     IsKeepout);
        if UseMoveable then AddJSONBoolean(ResultProps, 'moveable',       Moveable);
        if UsePrimLock then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_polygon — New — per IPCB_Polygon writable API.
// Verified: 01_PCB对象与API §3.7 Layer/Net/AreaSize/PolyHatchStyle/PourOver/
//   Grid/TrackSize/MinTrack/PointCount/Poured; PCBObjectInspector L1126+ adds
//   RemoveDead, UseOctagons, PrimitiveLock, Moveable, IsKeepout.
//   Note: outline points aren't rebuilt; only scalar properties are modified.
// =====================================================================
function PcbEditModifyPolygon(Board: IPCB_Board;
    Layer: TLayer; UseLayer: Boolean;
    NetName: String; UseNet: Boolean;
    Grid, TrackSize, MinTrack: Double; UseGrid, UseTrackSize, UseMinTrack: Boolean;
    HatchStyleInt, PourOverInt: Integer; UseHatch, UsePourOver: Boolean;
    UseOctagons, RemoveDead, UseOct, UseRemoveDead: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean;
    SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Polygon: IPCB_Polygon;
    Net: IPCB_Net;
    ModCount: Integer;
    ResultProps: TStringList;
    PourOverStr: String;
begin
    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(ePolyObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Polygon := Iterator.FirstPCBObject;
        while Polygon <> nil do
        begin
            if (not SelectedOnly) or Polygon.Selected then
            begin
                Polygon.BeginModify;
                if UseLayer     then Polygon.Layer          := Layer;
                if UseHatch     then Polygon.PolyHatchStyle := HatchStyleInt;
                if UsePourOver and (PourOverInt >= 0) and (PourOverInt <= 2) then
                    Polygon.PourOver := PourOverInt;
                if UseGrid       then Polygon.Grid       := MilsToCoord(Grid);
                if UseTrackSize  then Polygon.TrackSize  := MilsToCoord(TrackSize);
                if UseMinTrack   then Polygon.MinTrack   := MilsToCoord(MinTrack);
                if UseNet and (Net <> nil) then Polygon.Net := Net;
                if UseOct        then Polygon.UseOctagons     := UseOctagons;
                if UseRemoveDead then Polygon.RemoveDead      := RemoveDead;
                if UseKeepout    then Polygon.IsKeepout       := IsKeepout;
                if UseMoveable   then Polygon.Moveable        := Moveable;
                if UsePrimLock   then Polygon.PrimitiveLock   := PrimLock;
                Polygon.EndModify;
                Polygon.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Polygon := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    if UsePourOver then begin
        case PourOverInt of
            0: PourOverStr := 'ePolygonPourOver_None';
            1: PourOverStr := 'ePolygonPourOver_SameNet';
            2: PourOverStr := 'ePolygonPourOver_SameNetPolygons';
        else PourOverStr := 'Unknown';
        end;
    end else PourOverStr := '';

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_polygon');
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseLayer     then AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseNet       then AddJSONProperty(ResultProps, 'net',   NetName);
        if UseGrid      then AddJSONNumber(ResultProps, 'grid_mils',      Grid);
        if UseTrackSize then AddJSONNumber(ResultProps, 'track_size_mils', TrackSize);
        if UseMinTrack  then AddJSONNumber(ResultProps, 'min_track_mils',  MinTrack);
        if UseHatch     then AddJSONInteger(ResultProps, 'hatch_style',    HatchStyleInt);
        if UsePourOver  then AddJSONProperty(ResultProps, 'pour_over',     PourOverStr);
        if UseOct        then AddJSONBoolean(ResultProps, 'use_octagons',   UseOctagons);
        if UseRemoveDead then AddJSONBoolean(ResultProps, 'remove_dead',    RemoveDead);
        if UseKeepout    then AddJSONBoolean(ResultProps, 'is_keepout',     IsKeepout);
        if UseMoveable   then AddJSONBoolean(ResultProps, 'moveable',       Moveable);
        if UsePrimLock   then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: modify_fill — New.
//   IPCB_Fill supports X1Location/Y1Location/X2Location/Y2Location/Layer/Rotation
//   (all 6 properties already used during add_fill creation).
// =====================================================================
// pcb_edit: modify_fill — Extended: adds net_name (IPCB_Fill.Net) + IsKeepout/Moveable/PrimitiveLock
// Verified: PCBObjectInspector L998+ — Fill.Net / PrimitiveLock / Layer / Moveable / UniqueId / IsKeepout
function PcbEditModifyFill(Board: IPCB_Board;
    X1, Y1, X2, Y2, Rotation: Double; Layer: TLayer;
    UseX1, UseY1, UseX2, UseY2, UseRotation, UseLayer: Boolean;
    NetName: String; UseNet: Boolean;
    IsKeepout, UseKeepout, Moveable, UseMoveable, PrimLock, UsePrimLock: Boolean;
    SelectedOnly: Boolean): String;
var
    Iterator: IPCB_BoardIterator;
    Fill: IPCB_Fill;
    ModCount: Integer;
    ResultProps: TStringList;
    xorigin, yorigin: TCoord;
    Net: IPCB_Net;
begin
    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;

    if UseNet and (NetName <> '') then
        Net := FindNetByName(Board, NetName)
    else
        Net := nil;

    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eFillObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Fill := Iterator.FirstPCBObject;
        while Fill <> nil do
        begin
            if (not SelectedOnly) or Fill.Selected then
            begin
                Fill.BeginModify;
                if UseX1 then Fill.X1Location := MilsToCoord(X1) + xorigin;
                if UseY1 then Fill.Y1Location := MilsToCoord(Y1) + yorigin;
                if UseX2 then Fill.X2Location := MilsToCoord(X2) + xorigin;
                if UseY2 then Fill.Y2Location := MilsToCoord(Y2) + yorigin;
                if UseLayer then Fill.Layer := Layer;
                if UseRotation then Fill.Rotation := Rotation;
                if UseNet and (Net <> nil) then Fill.Net := Net;
                if UseKeepout  then Fill.IsKeepout     := IsKeepout;
                if UseMoveable then Fill.Moveable      := Moveable;
                if UsePrimLock then Fill.PrimitiveLock := PrimLock;
                Fill.EndModify;
                Fill.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Fill := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'modify_fill');
        AddJSONInteger(ResultProps, 'modified_count', ModCount);
        if UseX1 then AddJSONNumber(ResultProps, 'x1_mils', X1);
        if UseY1 then AddJSONNumber(ResultProps, 'y1_mils', Y1);
        if UseX2 then AddJSONNumber(ResultProps, 'x2_mils', X2);
        if UseY2 then AddJSONNumber(ResultProps, 'y2_mils', Y2);
        if UseLayer then AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
        if UseRotation then AddJSONNumber(ResultProps, 'rotation', Rotation);
        if UseNet and (NetName <> '') then AddJSONProperty(ResultProps, 'net', NetName);
        if UseKeepout  then AddJSONBoolean(ResultProps, 'is_keepout', IsKeepout);
        if UseMoveable then AddJSONBoolean(ResultProps, 'moveable',   Moveable);
        if UsePrimLock then AddJSONBoolean(ResultProps, 'primitive_lock', PrimLock);
        AddJSONBoolean(ResultProps, 'selected_only', SelectedOnly);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: move_to_layer — Move selected objects to another layer
// Verified: MoveToLayer.pas — Obj.Layer := NewLayer
// =====================================================================
function PcbEditMoveToLayer(Board: IPCB_Board; TargetLayer: TLayer; ObjTypeStr: String): String;
var
    Iterator: IPCB_BoardIterator;
    Prim: IPCB_Primitive;
    ObjectSet: TSet;
    ModCount: Integer;
    ResultProps: TStringList;
begin
    ObjectSet := PcbEditParseObjectSet(ObjTypeStr);
    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(ObjectSet);
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Prim := Iterator.FirstPCBObject;
        while Prim <> nil do
        begin
            if Prim.Selected then
            begin
                Prim.BeginModify;
                Prim.Layer := TargetLayer;
                Prim.EndModify;
                Prim.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Prim := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'move_to_layer');
        AddJSONProperty(ResultProps, 'target_layer', Layer2String(TargetLayer));
        AddJSONProperty(ResultProps, 'object_type', ObjTypeStr);
        AddJSONInteger(ResultProps, 'moved_count', ModCount);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: assign_net — Assign net to selected objects
// Verified: NetObjectAssign.pas — Obj.Net := Net
// =====================================================================
function PcbEditAssignNet(Board: IPCB_Board; NetName: String; ObjTypeStr: String): String;
var
    Iterator: IPCB_BoardIterator;
    Prim: IPCB_Primitive;
    ObjectSet: TSet;
    Net: IPCB_Net;
    ModCount: Integer;
    ResultProps: TStringList;
begin
    Net := FindNetByName(Board, NetName);
    if Net = nil then
    begin
        Result := '{"success":false,"error":"Net not found: ' + NetName + '"}';
        Exit;
    end;

    ObjectSet := PcbEditParseObjectSet(ObjTypeStr);
    ModCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(ObjectSet);
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Prim := Iterator.FirstPCBObject;
        while Prim <> nil do
        begin
            if Prim.Selected then
            begin
                Prim.BeginModify;
                Prim.Net := Net;
                Prim.EndModify;
                Prim.GraphicallyInvalidate;
                ModCount := ModCount + 1;
            end;
            Prim := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'assign_net');
        AddJSONProperty(ResultProps, 'net_name', NetName);
        AddJSONProperty(ResultProps, 'object_type', ObjTypeStr);
        AddJSONInteger(ResultProps, 'assigned_count', ModCount);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// pcb_edit: rebuild_polygons — Rebuild all polygon pours
// Verified: Polygon.pas — Polygon.Rebuild + SetState_CopperPourInvalid
// =====================================================================
function PcbEditRebuildPolygons(Board: IPCB_Board): String;
var
    Iterator: IPCB_BoardIterator;
    Polygon: IPCB_Polygon;
    RebuildCount: Integer;
    ResultProps: TStringList;
begin
    RebuildCount := 0;
    PCBServer.PreProcess;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(ePolyObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);
        Polygon := Iterator.FirstPCBObject;
        while Polygon <> nil do
        begin
            Polygon.SetState_CopperPourInvalid;
            Polygon.Rebuild;
            Polygon.GraphicallyInvalidate;
            RebuildCount := RebuildCount + 1;
            Polygon := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);
        Board.ViewManager_FullUpdate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'rebuild_polygons');
        AddJSONInteger(ResultProps, 'rebuilt_count', RebuildCount);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// Main action-based router for pcb_edit command
function PcbEditMain(RequestData: TStringList): String;
var
    Action: String;
    Board: IPCB_Board;
    X1, Y1, X2, Y2, Width, XC, YC, Radius, StartAngle, EndAngle, Size, HoleSize, Rot: Double;
    UseX1, UseY1, UseX2, UseY2, UseWidth, UseXC, UseYC, UseRadius, UseStart, UseEnd, UseSize, UseHole, UseRot: Boolean;
    UseX1_EndPt, UseY1_EndPt, UseX2_EndPt, UseY2_EndPt: Boolean; // endpoint-use carriers separate from flag carriers
    UseLayer, UseNet, UseText: Boolean;
    LayerStr, ObjTypeStr, PadName, Txt, NetName: String;
    Layer: TLayer;
    LowLayer, HighLayer: TLayer;
    ObjectSet: TSet;
    DoSelect: Boolean;
    SelectStr: String;
    ResultProps: TStringList;
    OutputLines: TStringList;
    TrackX1, TrackY1, TrackX2, TrackY2: TCoord;
    xorigin, yorigin: TCoord;
    BlockList: TStringList;
begin
    Result := '';
    Action := PcbEditParseStringAfterKey(RequestData, '"action"');
    if Action = '' then
    begin
        Result := 'ERROR: ACTION_REQUIRED';
        Exit;
    end;

    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then
    begin
        Result := 'ERROR: No PCB document is currently active';
        Exit;
    end;

    if Action = 'add_track' then
    begin
        X1 := PcbEditParseFloatAfterKey(RequestData, '"x1_mils"', UseX1);
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"y1_mils"', UseY1);
        X2 := PcbEditParseFloatAfterKey(RequestData, '"x2_mils"', UseX2);
        Y2 := PcbEditParseFloatAfterKey(RequestData, '"y2_mils"', UseY2);
        Width := PcbEditParseFloatAfterKey(RequestData, '"width_mils"', UseWidth);
        if not (UseX1 and UseY1 and UseX2 and UseY2) then
        begin
            Result := 'ERROR: X1_Y1_X2_Y2_MILS_REQUIRED';
            Exit;
        end;
        if not UseWidth then Width := 10;
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        Layer := PcbEditParseLayerFromString(LayerStr);

        // Guard D: Track-through-component detection
        // Check if the line segment intersects any component BBox (expanded by TRACK_MARGIN)
        xorigin := Board.XOrigin;
        yorigin := Board.YOrigin;
        TrackX1 := MilsToCoord(X1) + xorigin;
        TrackY1 := MilsToCoord(Y1) + yorigin;
        TrackX2 := MilsToCoord(X2) + xorigin;
        TrackY2 := MilsToCoord(Y2) + yorigin;

        BlockList := FindBlockingComponents(Board, TrackX1, TrackY1, TrackX2, TrackY2, TRACK_MARGIN);
        try
            if BlockList.Count > 0 then
            begin
                OutputLines := TStringList.Create;
                try
                    OutputLines.Text := BuildJSONArray(BlockList, 'blocked_by');
                    ResultProps := TStringList.Create;
                    try
                        AddJSONProperty(ResultProps, 'action', 'add_track');
                        AddJSONNumber(ResultProps, 'x1_mils', X1);
                        AddJSONNumber(ResultProps, 'y1_mils', Y1);
                        AddJSONNumber(ResultProps, 'x2_mils', X2);
                        AddJSONNumber(ResultProps, 'y2_mils', Y2);
                        AddJSONInteger(ResultProps, 'blocked_count', BlockList.Count);
                        ResultProps.Add(OutputLines.Text);
                        OutputLines.Text := BuildJSONObject(ResultProps);
                        Result := '{"success": false, "error": "TRACK_BLOCKED", "details": ' + OutputLines.Text + '}';
                    finally
                        ResultProps.Free;
                    end;
                finally
                    OutputLines.Free;
                end;
                Exit;
            end;
        finally
            BlockList.Free;
        end;

        // Guard E: Width rule check — warn if width is below typical minimum (8 mils)
        if (Width < 8) then
        begin
            ResultProps := TStringList.Create;
            try
                AddJSONProperty(ResultProps, 'action', 'add_track');
                AddJSONNumber(ResultProps, 'x1_mils', X1);
                AddJSONNumber(ResultProps, 'y1_mils', Y1);
                AddJSONNumber(ResultProps, 'x2_mils', X2);
                AddJSONNumber(ResultProps, 'y2_mils', Y2);
                AddJSONNumber(ResultProps, 'width_mils', Width);
                AddJSONProperty(ResultProps, 'layer', Layer2String(Layer));
                AddJSONProperty(ResultProps, 'warning', 'WIDTH_BELOW_MINIMUM_8_MILS');
                OutputLines := TStringList.Create;
                try
                    OutputLines.Text := BuildJSONObject(ResultProps);
                    Result := '{"success": false, "error": "WIDTH_BELOW_MINIMUM", "details": ' + OutputLines.Text + '}';
                finally
                    OutputLines.Free;
                end;
            finally
                ResultProps.Free;
            end;
            Exit;
        end;

        // add_track extra optional properties: is_keepout, moveable, primitive_lock
        // Verified: IPCB_Track.IsKeepout (01_PCB对象与API §3.2) + IPCB_Primitive.Moveable/PrimitiveLock (PCBObjectInspector L1235+).
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        UseSize := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseX1) then X1 := 1 else X1 := 0;   // X1 = IsKeepout
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        UseHole := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseY2) then Y1 := 1 else Y1 := 0;   // Y1 = Moveable
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        UseStart := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseEnd) then Y2 := 1 else Y2 := 0;  // Y2 = PrimLock

        // NOTE: Width/Layer are already parsed above and kept; PcbEditParseFloatAfterKey writes
        // to its out-vars ONLY so X1/Y1/Y2 overwrites above are independent here (the earlier
        // X1/Y1/X2/Y2 mil floats are NOT reused for track endpoints inside the call; they're
        // captured as copies by-value before reaching this point).
        Result := PcbEditAddTrack(Board,
            PcbEditParseFloatAfterKey(RequestData, '"x1_mils"', UseRot),   // re-parse clean x1
            PcbEditParseFloatAfterKey(RequestData, '"y1_mils"', UseXC),    // re-parse clean y1
            PcbEditParseFloatAfterKey(RequestData, '"x2_mils"', UseYC),    // re-parse clean x2
            PcbEditParseFloatAfterKey(RequestData, '"y2_mils"', UseRot),   // re-parse clean y2
            Width, Layer,
            PcbEditParseStringAfterKey(RequestData, '"net_name"'),
            PcbEditParseStringAfterKey(RequestData, '"net_name"') <> '',
            X1 > 0, UseSize,
            Y1 > 0, UseHole,
            Y2 > 0, UseStart);
    end
    else if Action = 'add_pad' then
    begin
        X1 := PcbEditParseFloatAfterKey(RequestData, '"x_mils"', UseX1);
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"y_mils"', UseY1);
        Width := PcbEditParseFloatAfterKey(RequestData, '"width_mils"', UseWidth);
        if not UseWidth then Width := 60;
        Radius := PcbEditParseFloatAfterKey(RequestData, '"height_mils"', UseRadius);
        if not UseRadius then Radius := Width;
        HoleSize := PcbEditParseFloatAfterKey(RequestData, '"hole_size_mils"', UseHole);
        if not UseHole then HoleSize := 0;
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        Layer := PcbEditParseLayerFromString(LayerStr);
        PadName := PcbEditParseStringAfterKey(RequestData, '"name"');
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');

        // Extended optional properties (with Use* booleans)
        Rot := PcbEditParseFloatAfterKey(RequestData, '"rotation"', UseRot);
        if not UseRot then Rot := 0;

        Txt := PcbEditParseStringAfterKey(RequestData, '"shape"');

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"tenting_top"');
        UseX1 := SelectStr <> '';
        X2 := 1;  // reuse X2 as TentingTop boolean carrier (1=true)
        if AnsiCompareText(SelectStr, 'false') = 0 then X2 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"tenting_bottom"');
        UseY1 := SelectStr <> '';
        Y2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y2 := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"testpoint_top"');
        UseX2 := SelectStr <> '';  // UseX2 = UseTestpointTop
        XC := 1;                  // XC = TestpointTop value
        if AnsiCompareText(SelectStr, 'false') = 0 then XC := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"testpoint_bottom"');
        UseY2 := SelectStr <> '';  // UseY2 = UseTestpointBottom
        YC := 1;                  // YC = TestpointBottom value
        if AnsiCompareText(SelectStr, 'false') = 0 then YC := 0;

        StartAngle := PcbEditParseFloatAfterKey(RequestData, '"paste_mask_expansion_mils"', UseStart);
        EndAngle   := PcbEditParseFloatAfterKey(RequestData, '"solder_mask_expansion_mils"', UseEnd);

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"power_plane_connect_style"');
        UseSize := SelectStr <> '';  // UseSize = UsePlaneConnect

        Result := PcbEditAddPad(Board, X1, Y1, Width, Radius, HoleSize, Layer,
            PadName, NetName, Txt,
            Rot,
            X2 > 0, Y2 > 0, XC > 0, YC > 0,
            UseX1, UseY1, UseX2, UseY2,
            StartAngle, EndAngle, UseStart, UseEnd,
            SelectStr, UseSize);
    end
    else if Action = 'add_via' then
    begin
        X1 := PcbEditParseFloatAfterKey(RequestData, '"x_mils"', UseX1);
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"y_mils"', UseY1);
        Size := PcbEditParseFloatAfterKey(RequestData, '"size_mils"', UseSize);
        if not UseSize then Size := 50;
        HoleSize := PcbEditParseFloatAfterKey(RequestData, '"hole_size_mils"', UseHole);
        if not UseHole then HoleSize := 20;
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');

        LayerStr := PcbEditParseStringAfterKey(RequestData, '"low_layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then
            LowLayer := PcbEditParseLayerFromString(LayerStr);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"high_layer"');
        if LayerStr <> '' then
        begin
            HighLayer := PcbEditParseLayerFromString(LayerStr);
            if not UseLayer then
            begin
                // user only gave high_layer; default low = top (still use both)
                LowLayer := eTopLayer;
                UseLayer := True;
            end;
        end
        else if UseLayer then
        begin
            // user only gave low_layer; default high = bottom
            HighLayer := eBottomLayer;
        end;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"tenting_top"');
        UseX1 := SelectStr <> '';
        X1 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then X1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"tenting_bottom"');
        UseY1 := SelectStr <> '';
        Y1 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"testpoint_top"');
        UseX2 := SelectStr <> '';
        X2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then X2 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"testpoint_bottom"');
        UseY2 := SelectStr <> '';
        Y2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y2 := 0;

        Result := PcbEditAddVia(Board, X1, Y1, Size, HoleSize, NetName,
            LowLayer, HighLayer, UseLayer,
            X1 > 0, Y1 > 0, X2 > 0, Y2 > 0,
            UseX1, UseY1, UseX2, UseY2);
    end
    else if Action = 'add_fill' then
    begin
        // Geometry params (required)
        X1 := PcbEditParseFloatAfterKey(RequestData, '"x1_mils"', UseX1);
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"y1_mils"', UseY1);
        X2 := PcbEditParseFloatAfterKey(RequestData, '"x2_mils"', UseX2);
        Y2 := PcbEditParseFloatAfterKey(RequestData, '"y2_mils"', UseY2);
        if not (UseX1 and UseY1 and UseX2 and UseY2) then
        begin
            Result := 'ERROR: X1_Y1_X2_Y2_MILS_REQUIRED';
            Exit;
        end;
        Rot := PcbEditParseFloatAfterKey(RequestData, '"rotation"', UseRot);
        if not UseRot then Rot := 0;
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        Layer    := PcbEditParseLayerFromString(LayerStr);
        NetName  := PcbEditParseStringAfterKey(RequestData, '"net_name"');

        // Extra flags: is_keepout / moveable / primitive_lock
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        UseWidth  := SelectStr <> '';      // UseWidth -> UseKeepout
        StartAngle := 1;
        if PcbEditParseBoolFromString(SelectStr, UseHole) then StartAngle := 1 else StartAngle := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        UseHole   := SelectStr <> '';      // UseHole  -> UseMoveable
        EndAngle  := 1;
        if PcbEditParseBoolFromString(SelectStr, UseSize) then EndAngle := 1 else EndAngle := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        UseSize   := SelectStr <> '';      // UseSize  -> UsePrimLock
        Radius    := 1;
        if PcbEditParseBoolFromString(SelectStr, UseLayer) then Radius := 1 else Radius := 0;

        Result := PcbEditAddFill(Board, X1, Y1, X2, Y2, Rot, Layer,
            NetName, NetName <> '',
            StartAngle > 0, UseWidth,
            EndAngle   > 0, UseHole,
            Radius     > 0, UseSize);
    end
    else if Action = 'add_arc' then
    begin
        XC := PcbEditParseFloatAfterKey(RequestData, '"x_center_mils"', UseXC);
        YC := PcbEditParseFloatAfterKey(RequestData, '"y_center_mils"', UseYC);
        Radius := PcbEditParseFloatAfterKey(RequestData, '"radius_mils"', UseRadius);
        StartAngle := PcbEditParseFloatAfterKey(RequestData, '"start_angle"', UseStart);
        EndAngle := PcbEditParseFloatAfterKey(RequestData, '"end_angle"', UseEnd);
        Width := PcbEditParseFloatAfterKey(RequestData, '"width_mils"', UseWidth);
        if not (UseXC and UseYC and UseRadius) then
        begin
            Result := 'ERROR: X_CENTER_Y_CENTER_RADIUS_REQUIRED';
            Exit;
        end;
        if not UseStart then StartAngle := 0;
        if not UseEnd then EndAngle := 360;
        if not UseWidth then Width := 10;
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        Layer := PcbEditParseLayerFromString(LayerStr);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        Result := PcbEditAddArc(Board, XC, YC, Radius, StartAngle, EndAngle, Width, Layer,
            NetName, NetName <> '');
    end
    else if Action = 'add_text' then
    begin
        X1 := PcbEditParseFloatAfterKey(RequestData, '"x_mils"', UseX1);
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"y_mils"', UseY1);
        Txt := PcbEditParseStringAfterKey(RequestData, '"text"');
        if not (UseX1 and UseY1) or (Txt = '') then
        begin
            Result := 'ERROR: X_Y_MILS_AND_TEXT_REQUIRED';
            Exit;
        end;
        Width := PcbEditParseFloatAfterKey(RequestData, '"height_mils"', UseWidth);
        if not UseWidth then Width := 60;
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        Layer := PcbEditParseLayerFromString(LayerStr);
        Rot := PcbEditParseFloatAfterKey(RequestData, '"rotation"', UseRot);
        if not UseRot then Rot := 0;
        // Extended optional text properties
        StartAngle := PcbEditParseFloatAfterKey(RequestData, '"stroke_width_mils"', UseStart);
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"use_ttfont"');
        UseX1 := SelectStr <> '';
        X2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then X2 := 0;
        ObjTypeStr := PcbEditParseStringAfterKey(RequestData, '"font_name"');
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"bold"');
        UseY1 := SelectStr <> '';
        Y2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y2 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"italic"');
        UseX2 := SelectStr <> '';
        Y1 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y1 := 0;
        Result := PcbEditAddText(Board, X1, Y1, Width, StartAngle,
            Txt, Layer, Rot,
            X2 > 0, ObjTypeStr, Y2 > 0, Y1 > 0,
            UseStart, UseX1, ObjTypeStr <> '', UseY1, UseX2);
    end
    else if Action = 'delete_objects' then
    begin
        ObjTypeStr := PcbEditParseStringAfterKey(RequestData, '"object_type"');
        ObjectSet := PcbEditParseObjectSet(ObjTypeStr);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        if LayerStr <> '' then
        begin
            Layer := PcbEditParseLayerFromString(LayerStr);
            Result := PcbEditDeleteObjects(Board, ObjectSet, Layer, True);
        end
        else
            Result := PcbEditDeleteObjects(Board, ObjectSet, eTopLayer, False);
    end
    else if Action = 'select_objects' then
    begin
        ObjTypeStr := PcbEditParseStringAfterKey(RequestData, '"object_type"');
        ObjectSet := PcbEditParseObjectSet(ObjTypeStr);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"select"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));
        if LayerStr <> '' then
        begin
            Layer := PcbEditParseLayerFromString(LayerStr);
            Result := PcbEditSelectObjects(Board, ObjectSet, Layer, True, DoSelect);
        end
        else
            Result := PcbEditSelectObjects(Board, ObjectSet, eTopLayer, False, DoSelect);
    end
    else if Action = 'add_region' then
    begin
        Txt := PcbEditParseStringAfterKey(RequestData, '"points_csv"');
        if Txt = '' then
        begin
            Result := 'ERROR: POINTS_CSV_REQUIRED (comma-separated x,y pairs)';
            Exit;
        end;
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        Layer := PcbEditParseLayerFromString(LayerStr);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');

        // TRegionKind / flags
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"kind"');   // reuse LayerStr as Kind string
        UseX1    := LayerStr <> '';
        LowLayer := eTopLayer; // placeholder — unused, Layer is real layer above
        // Carriers for IsKeepout / Moveable / PrimLock
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        UseX2 := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseY1) then X1 := 1 else X1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        UseY2 := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseXC) then Y1 := 1 else Y1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        UseYC := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseSize) then X2 := 1 else X2 := 0;

        Result := PcbEditAddRegion(Board, Txt, Layer, NetName,
            PcbEditParseRegionKindFromString(LayerStr), UseX1,
            X1 > 0, UseX2,
            Y1 > 0, UseY2,
            X2 > 0, UseYC);
    end
    else if Action = 'add_polygon_pour' then
    begin
        Txt := PcbEditParseStringAfterKey(RequestData, '"points_csv"');
        if Txt = '' then
        begin
            Result := 'ERROR: POINTS_CSV_REQUIRED';
            Exit;
        end;
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        Layer := PcbEditParseLayerFromString(LayerStr);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        X1 := PcbEditParseFloatAfterKey(RequestData, '"grid_mils"', UseX1);
        if not UseX1 then X1 := 10;
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"track_size_mils"', UseY1);
        if not UseY1 then Y1 := 8;
        X2 := PcbEditParseFloatAfterKey(RequestData, '"min_track_mils"', UseX2);
        if not UseX2 then X2 := 4;
        // hatch_style — accept legacy numeric (0-5) or string (solid/hatch90/...)
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"hatch_style"');
        if SelectStr <> '' then
            XC := PcbEditParseHatchStyleFromString(SelectStr)
        else
            XC := Integer(ePolySolid);
        // pour_over — accept boolean legacy (true/false) OR string/int (0/1/2).
        // Verified: sPolygonPourOverStrings indexes 0/1/2 = None/SameNet/SameNetPolygons.
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"pour_over"');
        if SelectStr <> '' then
            Y2 := PcbEditParsePourOverFromString(SelectStr)
        else
            Y2 := 1; // default: SameNet

        // UseOctagons / RemoveDead (boolean strings).
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"use_octagons"');
        UseRot := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseWidth) then YC := 1 else YC := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"remove_dead"');
        UseHole := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseSize) then Radius := 1 else Radius := 0;

        // IsKeepout / Moveable / PrimitiveLock
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        UseXC   := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseEnd)  then StartAngle := 1 else StartAngle := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        UseYC    := SelectStr <> '';
        if PcbEditParseBoolFromString(SelectStr, UseStart) then EndAngle   := 1 else EndAngle   := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        UseWidth := SelectStr <> ''; // reuse — was locally parsed before polygon block
        if PcbEditParseBoolFromString(SelectStr, UseSize)  then HoleSize   := 1 else HoleSize   := 0;

        Result := PcbEditAddPolygonPour(Board, Txt, Layer, NetName,
            X1, Y1, X2, XC, Y2,
            YC > 0, Radius > 0, UseRot, UseHole,
            StartAngle > 0, UseXC,
            EndAngle   > 0, UseYC,
            HoleSize   > 0, UseWidth);
    end
    else if Action = 'modify_track' then
    begin
        // New: support endpoint x1/y1/x2/y2 in addition to width/layer/net_name
        // Extended: is_keepout / moveable / primitive_lock (inherited IPCB_Primitive)
        X1 := PcbEditParseFloatAfterKey(RequestData, '"x1_mils"', UseX1_EndPt);
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"y1_mils"', UseY1_EndPt);
        X2 := PcbEditParseFloatAfterKey(RequestData, '"x2_mils"', UseX2_EndPt);
        Y2 := PcbEditParseFloatAfterKey(RequestData, '"y2_mils"', UseY2_EndPt);
        Width := PcbEditParseFloatAfterKey(RequestData, '"width_mils"', UseWidth);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then Layer := PcbEditParseLayerFromString(LayerStr);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        UseNet := NetName <> '';

        // extra primitive flags: is_keepout / moveable / primitive_lock
        //   UseX1 / UseY1 / UseX2 (top-level var) repurposed here as UseKeepout / UseMoveable / UsePrimLock gates.
        //   Value carriers: Radius (IsKeepout), HoleSize (Moveable), Size (PrimitiveLock)
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        if PcbEditParseBoolFromString(SelectStr, UseX1) then Radius := 1 else Radius := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        if PcbEditParseBoolFromString(SelectStr, UseY1) then HoleSize := 1 else HoleSize := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        if PcbEditParseBoolFromString(SelectStr, UseX2) then Size := 1 else Size := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"selected_only"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));
        // If no endpoints were given, fall back to the simpler legacy usage by
        // passing UseX1..UseY2 all false — equivalent to the old ModifyTrack.
        Result := PcbEditModifyTrack2(Board,
            X1, Y1, X2, Y2, Width, Layer, NetName,
            UseX1_EndPt, UseY1_EndPt, UseX2_EndPt, UseY2_EndPt, UseWidth, UseLayer, UseNet,
            Radius   > 0, UseX1,   // IsKeepout + UseKeepout
            HoleSize > 0, UseY1,   // Moveable  + UseMoveable
            Size     > 0, UseX2,   // PrimLock  + UsePrimLock
            DoSelect);
    end
    else if Action = 'modify_pad' then
    begin
        Width := PcbEditParseFloatAfterKey(RequestData, '"width_mils"', UseWidth);
        Radius := PcbEditParseFloatAfterKey(RequestData, '"height_mils"', UseRadius);
        HoleSize := PcbEditParseFloatAfterKey(RequestData, '"hole_size_mils"', UseHole);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then Layer := PcbEditParseLayerFromString(LayerStr);

        Rot := PcbEditParseFloatAfterKey(RequestData, '"rotation"', UseRot);

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"tenting_top"');
        UseX1 := SelectStr <> '';
        X1 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then X1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"tenting_bottom"');
        UseY1 := SelectStr <> '';
        Y1 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y1 := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"testpoint_top"');
        UseX2 := SelectStr <> '';
        X2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then X2 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"testpoint_bottom"');
        UseY2 := SelectStr <> '';
        Y2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y2 := 0;

        StartAngle := PcbEditParseFloatAfterKey(RequestData, '"paste_mask_expansion_mils"', UseStart);
        EndAngle   := PcbEditParseFloatAfterKey(RequestData, '"solder_mask_expansion_mils"', UseEnd);

        NetName  := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        UseNet   := NetName <> '';

        Txt      := PcbEditParseStringAfterKey(RequestData, '"shape"');
        UseSize  := Txt <> '';

        LayerStr := PcbEditParseStringAfterKey(RequestData, '"power_plane_connect_style"');
        UseXC    := LayerStr <> '';

        PadName  := PcbEditParseStringAfterKey(RequestData, '"pad_name"');
        UseYC    := PadName <> '';

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"selected_only"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));

        Result := PcbEditModifyPad(Board, Width, Radius, HoleSize, Rot,
            StartAngle, EndAngle, Layer,
            UseWidth, UseRadius, UseHole, UseLayer, UseRot,
            X1 > 0, Y1 > 0, X2 > 0, Y2 > 0,
            UseX1, UseY1, UseX2, UseY2,
            UseStart, UseEnd,
            NetName, Txt, LayerStr, PadName,
            UseNet, UseSize, UseXC, UseYC,
            DoSelect);
    end
    else if Action = 'modify_via' then
    begin
        Size := PcbEditParseFloatAfterKey(RequestData, '"size_mils"', UseSize);
        HoleSize := PcbEditParseFloatAfterKey(RequestData, '"hole_size_mils"', UseHole);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        UseNet := NetName <> '';

        LayerStr := PcbEditParseStringAfterKey(RequestData, '"low_layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then
            LowLayer := PcbEditParseLayerFromString(LayerStr);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"high_layer"');
        if LayerStr <> '' then
        begin
            HighLayer := PcbEditParseLayerFromString(LayerStr);
            if not UseLayer then
            begin
                LowLayer := eTopLayer;
                UseLayer := True;
            end;
        end
        else if UseLayer then
        begin
            HighLayer := eBottomLayer;
        end;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"tenting_top"');
        UseX1 := SelectStr <> '';
        X1 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then X1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"tenting_bottom"');
        UseY1 := SelectStr <> '';
        Y1 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"testpoint_top"');
        UseX2 := SelectStr <> '';
        X2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then X2 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"testpoint_bottom"');
        UseY2 := SelectStr <> '';
        Y2 := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then Y2 := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"selected_only"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));
        Result := PcbEditModifyVia(Board, Size, HoleSize, UseSize, UseHole,
            X1 > 0, Y1 > 0, X2 > 0, Y2 > 0,
            UseX1, UseY1, UseX2, UseY2,
            NetName, UseNet,
            LowLayer, HighLayer, UseLayer,
            DoSelect);
    end
    else if Action = 'modify_text' then
    begin
        X1 := PcbEditParseFloatAfterKey(RequestData, '"x_mils"', UseX1);
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"y_mils"', UseY1);
        Txt := PcbEditParseStringAfterKey(RequestData, '"text"');
        UseText := Txt <> '';
        Width := PcbEditParseFloatAfterKey(RequestData, '"height_mils"', UseWidth);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then Layer := PcbEditParseLayerFromString(LayerStr);
        Rot := PcbEditParseFloatAfterKey(RequestData, '"rotation"', UseRot);

        StartAngle := PcbEditParseFloatAfterKey(RequestData, '"stroke_width_mils"', UseStart);
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"use_ttfont"');
        UseXC := SelectStr <> '';
        XC := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then XC := 0;
        ObjTypeStr := PcbEditParseStringAfterKey(RequestData, '"font_name"');
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"bold"');
        UseYC := SelectStr <> '';
        YC := 1;
        if AnsiCompareText(SelectStr, 'false') = 0 then YC := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"italic"');
        UseSize := SelectStr <> '';  // reuse UseSize as UseItalic carrier
        Radius := 1;                // Radius = Italic value
        if AnsiCompareText(SelectStr, 'false') = 0 then Radius := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"selected_only"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));
        Result := PcbEditModifyText(Board, Txt, X1, Y1, Width, StartAngle,
            Layer, Rot,
            XC > 0, ObjTypeStr, YC > 0, Radius > 0,
            UseText, UseX1, UseY1, UseWidth, UseStart, UseLayer, UseRot,
            UseXC, ObjTypeStr <> '', UseYC, UseSize,
            DoSelect);
    end
    else if Action = 'modify_arc' then
    begin
        XC := PcbEditParseFloatAfterKey(RequestData, '"x_center_mils"', UseXC);
        YC := PcbEditParseFloatAfterKey(RequestData, '"y_center_mils"', UseYC);
        Radius := PcbEditParseFloatAfterKey(RequestData, '"radius_mils"', UseRadius);
        StartAngle := PcbEditParseFloatAfterKey(RequestData, '"start_angle"', UseStart);
        EndAngle := PcbEditParseFloatAfterKey(RequestData, '"end_angle"', UseEnd);
        Width := PcbEditParseFloatAfterKey(RequestData, '"width_mils"', UseWidth);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then Layer := PcbEditParseLayerFromString(LayerStr);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        UseNet := NetName <> '';

        // extra primitive flags: is_keepout / moveable / primitive_lock
        //   UseX1 / UseY1 / UseX2 repurposed as UseKeepout / UseMoveable / UsePrimLock gates.
        //   Value carriers: X1 (IsKeepout), Y1 (Moveable), X2 (PrimitiveLock)
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        if PcbEditParseBoolFromString(SelectStr, UseX1) then X1 := 1 else X1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        if PcbEditParseBoolFromString(SelectStr, UseY1) then Y1 := 1 else Y1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        if PcbEditParseBoolFromString(SelectStr, UseX2) then X2 := 1 else X2 := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"selected_only"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));
        Result := PcbEditModifyArc(Board,
            XC, YC, Radius, StartAngle, EndAngle, Width, Layer, NetName,
            UseXC, UseYC, UseRadius, UseStart, UseEnd, UseWidth, UseLayer, UseNet,
            X1 > 0, UseX1,   // IsKeepout + UseKeepout
            Y1 > 0, UseY1,   // Moveable  + UseMoveable
            X2 > 0, UseX2,   // PrimLock  + UsePrimLock
            DoSelect);
    end
    else if Action = 'modify_fill' then
    begin
        X1 := PcbEditParseFloatAfterKey(RequestData, '"x1_mils"', UseX1_EndPt);
        Y1 := PcbEditParseFloatAfterKey(RequestData, '"y1_mils"', UseY1_EndPt);
        X2 := PcbEditParseFloatAfterKey(RequestData, '"x2_mils"', UseX2_EndPt);
        Y2 := PcbEditParseFloatAfterKey(RequestData, '"y2_mils"', UseY2_EndPt);
        Rot := PcbEditParseFloatAfterKey(RequestData, '"rotation"', UseRot);
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then Layer := PcbEditParseLayerFromString(LayerStr);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        UseNet := NetName <> '';

        // extra primitive flags: is_keepout / moveable / primitive_lock
        //   UseXC / UseYC / UseSize repurposed as UseKeepout / UseMoveable / UsePrimLock gates.
        //   Value carriers: XC (IsKeepout), YC (Moveable), Size (PrimitiveLock)
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        if PcbEditParseBoolFromString(SelectStr, UseXC) then XC := 1 else XC := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        if PcbEditParseBoolFromString(SelectStr, UseYC) then YC := 1 else YC := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        if PcbEditParseBoolFromString(SelectStr, UseSize) then Size := 1 else Size := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"selected_only"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));
        Result := PcbEditModifyFill(Board,
            X1, Y1, X2, Y2, Rot, Layer,
            UseX1_EndPt, UseY1_EndPt, UseX2_EndPt, UseY2_EndPt, UseRot, UseLayer,
            NetName, UseNet,
            XC > 0, UseXC,     // IsKeepout + UseKeepout
            YC > 0, UseYC,     // Moveable  + UseMoveable
            Size > 0, UseSize, // PrimLock  + UsePrimLock
            DoSelect);
    end
    else if Action = 'modify_region' then
    begin
        // Writable scalar IPCB_Region properties per API:
        //   Layer, Net (via assign_net pattern), Kind (TRegionKind),
        //   plus IPCB_Primitive inherited: IsKeepout / Moveable / PrimitiveLock.
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then Layer := PcbEditParseLayerFromString(LayerStr);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        UseNet := NetName <> '';
        Txt := PcbEditParseStringAfterKey(RequestData, '"kind"');
        UseXC := Txt <> '';   // UseXC = UseKind carrier

        // Primitive flags. UseX1/UseY1/UseX2 repurposed as gates.
        // Value carriers: X1 (IsKeepout), Y1 (Moveable), X2 (PrimitiveLock)
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        if PcbEditParseBoolFromString(SelectStr, UseX1) then X1 := 1 else X1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        if PcbEditParseBoolFromString(SelectStr, UseY1) then Y1 := 1 else Y1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        if PcbEditParseBoolFromString(SelectStr, UseX2) then X2 := 1 else X2 := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"selected_only"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));

        Result := PcbEditModifyRegion(Board,
            Layer, UseLayer,
            NetName, UseNet,
            PcbEditParseRegionKindFromString(Txt), UseXC,  // RegKind, UseKind
            X1 > 0, UseX1,   // IsKeepout + UseKeepout
            Y1 > 0, UseY1,   // Moveable  + UseMoveable
            X2 > 0, UseX2,   // PrimLock  + UsePrimLock
            DoSelect);
    end
    else if Action = 'modify_polygon' then
    begin
        // Writable scalar IPCB_Polygon properties per API + PCBObjectInspector:
        //   Layer, Net, PolyHatchStyle, PourOver, Grid, TrackSize, MinTrack,
        //   UseOctagons, RemoveDead, plus IPCB_Primitive inherited flags.
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"layer"');
        UseLayer := LayerStr <> '';
        if UseLayer then Layer := PcbEditParseLayerFromString(LayerStr);
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        UseNet := NetName <> '';

        // Grid/TrackSize/MinTrack: reuse StartAngle / EndAngle / HoleSize as value carriers,
        // UseX1_EndPt/UseY1_EndPt/UseX2_EndPt as use-gates (no endpoints in this action).
        StartAngle := PcbEditParseFloatAfterKey(RequestData, '"grid_mils"',      UseX1_EndPt);
        EndAngle   := PcbEditParseFloatAfterKey(RequestData, '"track_size_mils"', UseY1_EndPt);
        HoleSize   := PcbEditParseFloatAfterKey(RequestData, '"min_track_mils"',  UseX2_EndPt);

        Txt := PcbEditParseStringAfterKey(RequestData, '"hatch_style"');
        UseXC := Txt <> '';
        Radius := PcbEditParseHatchStyleFromString(Txt);   // Radius = HatchStyleInt carrier
        ObjTypeStr := PcbEditParseStringAfterKey(RequestData, '"pour_over"');
        UseYC := ObjTypeStr <> '';
        Size := PcbEditParsePourOverFromString(ObjTypeStr); // Size = PourOverInt carrier

        // UseOctagons / RemoveDead booleans.
        // Gates: UseWidth (UseOct), UseRot (UseRemoveDead); values: Width, Rot carriers.
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"use_octagons"');
        if PcbEditParseBoolFromString(SelectStr, UseWidth) then Width := 1 else Width := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"remove_dead"');
        if PcbEditParseBoolFromString(SelectStr, UseRot)   then Rot   := 1 else Rot   := 0;

        // Primitive flags: gates = UseStart/UseEnd/UseHole; values = X1/Y1/X2.
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"is_keepout"');
        if PcbEditParseBoolFromString(SelectStr, UseStart) then X1 := 1 else X1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        if PcbEditParseBoolFromString(SelectStr, UseEnd)   then Y1 := 1 else Y1 := 0;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        if PcbEditParseBoolFromString(SelectStr, UseHole)  then X2 := 1 else X2 := 0;

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"selected_only"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));

        Result := PcbEditModifyPolygon(Board,
            Layer, UseLayer,
            NetName, UseNet,
            StartAngle, EndAngle, HoleSize, UseX1_EndPt, UseY1_EndPt, UseX2_EndPt,  // Grid/TrackSize/MinTrack + Use*
            Round(Radius), UseXC,   // HatchStyle + UseHatch
            Round(Size),   UseYC,   // PourOver   + UsePourOver
            Width > 0, UseWidth,    // UseOctagons + UseOct
            Rot   > 0, UseRot,      // RemoveDead + UseRemoveDead
            X1 > 0, UseStart,       // IsKeepout + UseKeepout
            Y1 > 0, UseEnd,         // Moveable  + UseMoveable
            X2 > 0, UseHole,        // PrimLock  + UsePrimLock
            DoSelect);
    end
    else if Action = 'move_to_layer' then
    begin
        LayerStr := PcbEditParseStringAfterKey(RequestData, '"target_layer"');
        if LayerStr = '' then
        begin
            Result := 'ERROR: TARGET_LAYER_REQUIRED';
            Exit;
        end;
        Layer := PcbEditParseLayerFromString(LayerStr);
        ObjTypeStr := PcbEditParseStringAfterKey(RequestData, '"object_type"');
        if ObjTypeStr = '' then ObjTypeStr := 'track';
        Result := PcbEditMoveToLayer(Board, Layer, ObjTypeStr);
    end
    else if Action = 'assign_net' then
    begin
        NetName := PcbEditParseStringAfterKey(RequestData, '"net_name"');
        if NetName = '' then
        begin
            Result := 'ERROR: NET_NAME_REQUIRED';
            Exit;
        end;
        ObjTypeStr := PcbEditParseStringAfterKey(RequestData, '"object_type"');
        if ObjTypeStr = '' then ObjTypeStr := 'track';
        Result := PcbEditAssignNet(Board, NetName, ObjTypeStr);
    end
    else if Action = 'rebuild_polygons' then
    begin
        Result := PcbEditRebuildPolygons(Board);
    end
    else
    begin
        Result := 'ERROR: UNKNOWN_ACTION';
        Exit;
    end;
end;

// =====================================================================
// PCB Component Operations — action-based
// Verified patterns: SwapComponentsUnit.pas (Rotation, Layer flip),
//   CreateComponentOnPCB.pas (Component creation/properties),
//   OffSetObjects.Pas (MoveByXY)
// =====================================================================

// rotate_component — set component rotation angle
// Verified: SwapComponentsUnit.pas — Comp.Rotation := angle (direct property set)
function PcbComponentRotate(Board: IPCB_Board; const Designator: String; Rotation: Double): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        PCBServer.SendMessageToRobots(Comp.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
        Comp.Rotation := Rotation;
        PCBServer.SendMessageToRobots(Comp.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'rotate_component');
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONNumber(ResultProps, 'rotation', Rotation);
        AddJSONBoolean(ResultProps, 'success', True);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// flip_component — flip component between top and bottom layer
// Verified: SwapComponentsUnit.pas — Layer swap (eTopLayer ↔ eBottomLayer)
function PcbComponentFlip(Board: IPCB_Board; const Designator: String): String;
var
    Comp: IPCB_Component;
    NewLayer: TLayer;
    OldLayerStr, NewLayerStr: String;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    OldLayerStr := Layer2String(Comp.Layer);
    if Comp.Layer = eTopLayer then
        NewLayer := eBottomLayer
    else
        NewLayer := eTopLayer;
    NewLayerStr := Layer2String(NewLayer);

    PCBServer.PreProcess;
    try
        PCBServer.SendMessageToRobots(Comp.I_ObjectAddress, c_Broadcast, PCBM_BeginModify, c_NoEventData);
        Comp.Layer := NewLayer;
        PCBServer.SendMessageToRobots(Comp.I_ObjectAddress, c_Broadcast, PCBM_EndModify, c_NoEventData);
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'flip_component');
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONProperty(ResultProps, 'old_layer', OldLayerStr);
        AddJSONProperty(ResultProps, 'new_layer', NewLayerStr);
        AddJSONBoolean(ResultProps, 'success', True);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// select_component — select or deselect a component by RefDes
// Verified: Obj.Selected := True/False (IPCB_Primitive interface)
function PcbComponentSelect(Board: IPCB_Board; const Designator: String; DoSelect: Boolean): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    Comp.Selected := DoSelect;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'select_component');
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONBoolean(ResultProps, 'selected', DoSelect);
        AddJSONBoolean(ResultProps, 'success', True);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// get_properties — get detailed component properties
// Verified: GetAllComponentData pattern + Component properties from reference
// Enhanced get_properties — returns ALL component properties from PCBObjectInspector reference
function PcbComponentGetProperties(Board: IPCB_Board; const Designator: String): String;
var
    Comp: IPCB_Component;
    Rect: TCoordRect;
    xorigin, yorigin: TCoord;
    GrpIter: IPCB_GroupIterator;
    Pad: IPCB_Pad2;
    PinCount: Integer;
    ResultProps: TStringList;
    PinsArray: TStringList;
    PinProps: TStringList;
    NetName: String;
    CompKindStr: String;
    NameAutoPosStr: String;
    CommentAutoPosStr: String;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    xorigin := Board.XOrigin;
    yorigin := Board.YOrigin;
    Rect := Comp.BoundingRectangleNoNameComment;

    ResultProps := TStringList.Create;
    PinsArray := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'designator', Comp.Name.Text);
        AddJSONProperty(ResultProps, 'identifier', Comp.Identifier);
        AddJSONProperty(ResultProps, 'source_designator', Comp.SourceDesignator);
        AddJSONProperty(ResultProps, 'source_unique_id', Comp.SourceUniqueId);
        AddJSONProperty(ResultProps, 'source_description', Comp.SourceDescription);
        AddJSONProperty(ResultProps, 'source_lib_reference', Comp.SourceLibReference);
        AddJSONProperty(ResultProps, 'source_footprint_library', Comp.SourceFootprintLibrary);
        AddJSONProperty(ResultProps, 'source_component_library', Comp.SourceComponentLibrary);
        AddJSONProperty(ResultProps, 'pattern', Comp.Pattern);
        AddJSONProperty(ResultProps, 'footprint_description', Comp.FootprintDescription);
        AddJSONProperty(ResultProps, 'default_pcb3d_model', Comp.DefaultPCB3DModel);
        AddJSONProperty(ResultProps, 'layer', Layer2String(Comp.Layer));
        AddJSONNumber(ResultProps, 'x_mils', CoordToMils(Comp.x - xorigin));
        AddJSONNumber(ResultProps, 'y_mils', CoordToMils(Comp.y - yorigin));
        AddJSONNumber(ResultProps, 'rotation', Comp.Rotation);
        AddJSONNumber(ResultProps, 'height_mils', CoordToMils(Comp.Height));
        AddJSONNumber(ResultProps, 'width_mils', CoordToMils(Rect.Right - Rect.Left));
        AddJSONNumber(ResultProps, 'height_bbox_mils', CoordToMils(Rect.Bottom - Rect.Top));
        AddJSONBoolean(ResultProps, 'selected', Comp.Selected);
        AddJSONBoolean(ResultProps, 'name_on', Comp.NameOn);
        AddJSONBoolean(ResultProps, 'comment_on', Comp.CommentOn);
        AddJSONBoolean(ResultProps, 'moveable', Comp.Moveable);
        AddJSONBoolean(ResultProps, 'lock_strings', Comp.LockStrings);
        AddJSONBoolean(ResultProps, 'primitive_lock', Comp.PrimitiveLock);
        AddJSONBoolean(ResultProps, 'flipped_on_layer', Comp.FlippedOnLayer);
        AddJSONBoolean(ResultProps, 'is_bga', Comp.IsBGA);
        AddJSONBoolean(ResultProps, 'enable_pin_swapping', Comp.EnablePinSwapping);
        AddJSONBoolean(ResultProps, 'enable_part_swapping', Comp.EnablePartSwapping);
        AddJSONInteger(ResultProps, 'group_num', Comp.GroupNum);
        AddJSONInteger(ResultProps, 'channel_offset', Comp.ChannelOffset);
        AddJSONProperty(ResultProps, 'unique_id', Comp.UniqueId);

        // ComponentKind enum
        case Comp.ComponentKind of
            0: CompKindStr := 'eComponentKind_Standard';
            1: CompKindStr := 'eComponentKind_Mechanical';
            2: CompKindStr := 'eComponentKind_Graphical';
            3: CompKindStr := 'eComponentKind_NetTie';
            4: CompKindStr := 'eComponentKind_ShortCircuit';
            5: CompKindStr := 'eComponentKind_StandardNoBOM';
            6: CompKindStr := 'eComponentKind_MechanicalNoBOM';
        else
            CompKindStr := 'Unknown';
        end;
        AddJSONProperty(ResultProps, 'component_kind', CompKindStr);

        // NameAutoPosition enum
        case Comp.NameAutoPosition of
            0: NameAutoPosStr := 'eAutoPos_CenterLeft';
            1: NameAutoPosStr := 'eAutoPos_CenterRight';
            2: NameAutoPosStr := 'eAutoPos_TopLeft';
            3: NameAutoPosStr := 'eAutoPos_BottomLeft';
            4: NameAutoPosStr := 'eAutoPos_TopRight';
            5: NameAutoPosStr := 'eAutoPos_BottomRight';
            6: NameAutoPosStr := 'eAutoPos_CenterAbove';
            7: NameAutoPosStr := 'eAutoPos_CenterBelow';
            8: NameAutoPosStr := 'eAutoPos_CenterCenter';
            9: NameAutoPosStr := 'eAutoPos_Manual';
        else
            NameAutoPosStr := 'Unknown';
        end;
        AddJSONProperty(ResultProps, 'name_autoposition', NameAutoPosStr);

        // CommentAutoPosition enum
        case Comp.CommentAutoPosition of
            0: CommentAutoPosStr := 'eAutoPos_CenterLeft';
            1: CommentAutoPosStr := 'eAutoPos_CenterRight';
            2: CommentAutoPosStr := 'eAutoPos_TopLeft';
            3: CommentAutoPosStr := 'eAutoPos_BottomLeft';
            4: CommentAutoPosStr := 'eAutoPos_TopRight';
            5: CommentAutoPosStr := 'eAutoPos_BottomRight';
            6: CommentAutoPosStr := 'eAutoPos_CenterAbove';
            7: CommentAutoPosStr := 'eAutoPos_CenterBelow';
            8: CommentAutoPosStr := 'eAutoPos_CenterCenter';
            9: CommentAutoPosStr := 'eAutoPos_Manual';
        else
            CommentAutoPosStr := 'Unknown';
        end;
        AddJSONProperty(ResultProps, 'comment_autoposition', CommentAutoPosStr);

        // Count pads and list detailed pin info using GroupIterator
        PinCount := 0;
        GrpIter := Comp.GroupIterator_Create;
        GrpIter.AddFilter_ObjectSet(MkSet(ePadObject));
        Pad := GrpIter.FirstPCBObject;
        while Pad <> nil do
        begin
            if Pad.InComponent then
            begin
                if Pad.Net <> nil then
                    NetName := Pad.Net.Name
                else
                    NetName := '';

                PinProps := TStringList.Create;
                try
                    AddJSONProperty(PinProps, 'name', Pad.Name);
                    AddJSONProperty(PinProps, 'net', NetName);
                    AddJSONNumber(PinProps, 'x_mils', CoordToMils(Pad.x - xorigin));
                    AddJSONNumber(PinProps, 'y_mils', CoordToMils(Pad.y - yorigin));
                    AddJSONNumber(PinProps, 'rotation', Pad.Rotation);
                    AddJSONProperty(PinProps, 'layer', Layer2String(Pad.Layer));
                    AddJSONNumber(PinProps, 'top_x_size_mils', CoordToMils(Pad.TopXSize));
                    AddJSONNumber(PinProps, 'top_y_size_mils', CoordToMils(Pad.TopYSize));
                    AddJSONNumber(PinProps, 'mid_x_size_mils', CoordToMils(Pad.MidXSize));
                    AddJSONNumber(PinProps, 'mid_y_size_mils', CoordToMils(Pad.MidYSize));
                    AddJSONNumber(PinProps, 'bot_x_size_mils', CoordToMils(Pad.BotXSize));
                    AddJSONNumber(PinProps, 'bot_y_size_mils', CoordToMils(Pad.BotYSize));
                    AddJSONNumber(PinProps, 'hole_size_mils', CoordToMils(Pad.HoleSize));
                    AddJSONBoolean(PinProps, 'plated', Pad.Plated);
                    AddJSONBoolean(PinProps, 'is_tenting', Pad.IsTenting);
                    AddJSONBoolean(PinProps, 'is_tenting_top', Pad.IsTenting_Top);
                    AddJSONBoolean(PinProps, 'is_tenting_bottom', Pad.IsTenting_Bottom);
                    AddJSONBoolean(PinProps, 'is_testpoint_top', Pad.IsTestpoint_Top);
                    AddJSONBoolean(PinProps, 'is_testpoint_bottom', Pad.IsTestpoint_Bottom);
                    AddJSONBoolean(PinProps, 'is_assy_testpoint_top', Pad.IsAssyTestpoint_Top);
                    AddJSONBoolean(PinProps, 'is_assy_testpoint_bottom', Pad.IsAssyTestpoint_Bottom);
                    AddJSONNumber(PinProps, 'solder_mask_expansion_mils', CoordToMils(Pad.SolderMaskExpansion));
                    AddJSONNumber(PinProps, 'paste_mask_expansion_mils', CoordToMils(Pad.PasteMaskExpansion));
                    AddJSONNumber(PinProps, 'power_plane_clearance_mils', CoordToMils(Pad.PowerPlaneClearance));
                    AddJSONNumber(PinProps, 'relief_conductor_width_mils', CoordToMils(Pad.ReliefConductorWidth));
                    AddJSONInteger(PinProps, 'relief_entries', Pad.ReliefEntries);
                    AddJSONNumber(PinProps, 'relief_air_gap_mils', CoordToMils(Pad.ReliefAirGap));
                    AddJSONNumber(PinProps, 'pin_package_length_mils', CoordToMils(Pad.PinPackageLength));
                    PinsArray.Add(BuildJSONObject(PinProps, 1));
                finally
                    PinProps.Free;
                end;
                PinCount := PinCount + 1;
            end;
            Pad := GrpIter.NextPCBObject;
        end;
        Comp.GroupIterator_Destroy(GrpIter);

        AddJSONInteger(ResultProps, 'pin_count', PinCount);
        ResultProps.Add(BuildJSONArray(PinsArray, 'pins', 1));
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
        PinsArray.Free;
    end;
end;

// pcb_component: set_height — set component height
// Verified: PCBObjectInspector.pas — Comp.Height property
function PcbComponentSetHeight(Board: IPCB_Board; const Designator: String; HeightMils: Double): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Comp.BeginModify;
        Comp.Height := MilsToCoord(HeightMils);
        Comp.EndModify;
    finally
        PCBServer.PostProcess;
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONNumber(ResultProps, 'height_mils', HeightMils);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// pcb_component: set_moveable — lock/unlock component
// Verified: PCBObjectInspector.pas — Comp.Moveable property
function PcbComponentSetMoveable(Board: IPCB_Board; const Designator: String; IsMoveable: Boolean): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Comp.BeginModify;
        Comp.Moveable := IsMoveable;
        Comp.EndModify;
    finally
        PCBServer.PostProcess;
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONBoolean(ResultProps, 'moveable', IsMoveable);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// pcb_component: set_name_visibility — show/hide designator
// Verified: ShowHideDesignators.pas — Comp.NameOn property
function PcbComponentSetNameVisibility(Board: IPCB_Board; const Designator: String; Visible: Boolean): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Comp.BeginModify;
        Comp.NameOn := Visible;
        Comp.EndModify;
    finally
        PCBServer.PostProcess;
    end;

    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONBoolean(ResultProps, 'name_on', Visible);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// pcb_component: set_comment_visibility — show/hide comment
// Verified: ShowHideDesignators.pas — Comp.CommentOn property
function PcbComponentSetCommentVisibility(Board: IPCB_Board; const Designator: String; Visible: Boolean): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Comp.BeginModify;
        Comp.CommentOn := Visible;
        Comp.EndModify;
    finally
        PCBServer.PostProcess;
    end;

    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONBoolean(ResultProps, 'comment_on', Visible);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// pcb_component: set_autoposition — set name and/or comment autoposition
// Verified: PCBObjectInspector.pas — Comp.NameAutoPosition / Comp.CommentAutoPosition
function PcbComponentSetAutoPosition(Board: IPCB_Board; const Designator: String;
    NameAutoPos: Integer; CommentAutoPos: Integer): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
    NamePosStr, CommentPosStr: String;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Comp.BeginModify;
        if NameAutoPos >= 0 then
            Comp.NameAutoPosition := NameAutoPos;
        if CommentAutoPos >= 0 then
            Comp.CommentAutoPosition := CommentAutoPos;
        Comp.EndModify;
    finally
        PCBServer.PostProcess;
    end;

    case NameAutoPos of
        0: NamePosStr := 'eAutoPos_CenterLeft';
        1: NamePosStr := 'eAutoPos_CenterRight';
        2: NamePosStr := 'eAutoPos_TopLeft';
        3: NamePosStr := 'eAutoPos_BottomLeft';
        4: NamePosStr := 'eAutoPos_TopRight';
        5: NamePosStr := 'eAutoPos_BottomRight';
        6: NamePosStr := 'eAutoPos_CenterAbove';
        7: NamePosStr := 'eAutoPos_CenterBelow';
        8: NamePosStr := 'eAutoPos_CenterCenter';
        9: NamePosStr := 'eAutoPos_Manual';
    else
        NamePosStr := 'Unchanged';
    end;
    case CommentAutoPos of
        0: CommentPosStr := 'eAutoPos_CenterLeft';
        1: CommentPosStr := 'eAutoPos_CenterRight';
        2: CommentPosStr := 'eAutoPos_TopLeft';
        3: CommentPosStr := 'eAutoPos_BottomLeft';
        4: CommentPosStr := 'eAutoPos_TopRight';
        5: CommentPosStr := 'eAutoPos_BottomRight';
        6: CommentPosStr := 'eAutoPos_CenterAbove';
        7: CommentPosStr := 'eAutoPos_CenterBelow';
        8: CommentPosStr := 'eAutoPos_CenterCenter';
        9: CommentPosStr := 'eAutoPos_Manual';
    else
        CommentPosStr := 'Unchanged';
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONProperty(ResultProps, 'name_autoposition', NamePosStr);
        AddJSONProperty(ResultProps, 'comment_autoposition', CommentPosStr);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// pcb_component: get_3d_bodies — get 3D model bodies attached to component
// Verified: PCBObjectInspector.pas — ComponentBody iteration
function PcbComponentGet3DBodies(Board: IPCB_Board; const Designator: String): String;
var
    Comp: IPCB_Component;
    GrpIter: IPCB_GroupIterator;
    Body: IPCB_ComponentBody;
    BodyCount: Integer;
    ResultProps: TStringList;
    BodiesArray: TStringList;
    BodyProps: TStringList;
    OutputLines: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    BodyCount := 0;
    BodiesArray := TStringList.Create;
    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'designator', Designator);

        GrpIter := Comp.GroupIterator_Create;
        GrpIter.AddFilter_ObjectSet(MkSet(eComponentBodyObject));
        Body := GrpIter.FirstPCBObject;
        while Body <> nil do
        begin
            BodyProps := TStringList.Create;
            try
                AddJSONInteger(BodyProps, 'index', BodyCount);
                AddJSONProperty(BodyProps, 'layer', Layer2String(Body.Layer));
                AddJSONProperty(BodyProps, 'identifier', Body.Identifier);
                AddJSONProperty(BodyProps, 'unique_id', Body.UniqueId);
                AddJSONBoolean(BodyProps, 'moveable', Body.Moveable);
                AddJSONProperty(BodyProps, 'name', Body.Name);
                AddJSONNumber(BodyProps, 'standoff_height_mils', CoordToMils(Body.StandoffHeight));
                AddJSONNumber(BodyProps, 'overall_height_mils', CoordToMils(Body.OverallHeight));
                case Body.BodyProjection of
                    0: AddJSONProperty(BodyProps, 'body_projection', 'eBoardSide_Top');
                    1: AddJSONProperty(BodyProps, 'body_projection', 'eBoardSide_Bottom');
                else
                    AddJSONProperty(BodyProps, 'body_projection', 'Unknown');
                end;
                AddJSONBoolean(BodyProps, 'override_color', Body.OverrideColor);
                AddJSONInteger(BodyProps, 'body_color_3d', Body.BodyColor3D);
                AddJSONInteger(BodyProps, 'body_opacity_3d', Body.BodyOpacity3D);
                BodiesArray.Add(BuildJSONObject(BodyProps, 1));
            finally
                BodyProps.Free;
            end;
            BodyCount := BodyCount + 1;
            Body := GrpIter.NextPCBObject;
        end;
        Comp.GroupIterator_Destroy(GrpIter);

        AddJSONInteger(ResultProps, 'body_count', BodyCount);
        ResultProps.Add(BuildJSONArray(BodiesArray, 'bodies', 1));

        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := OutputLines.Text;
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
        BodiesArray.Free;
    end;
end;

// pcb_component: set_lock_strings — lock/unlock string primitives
function PcbComponentSetLockStrings(Board: IPCB_Board; const Designator: String; LockStrs: Boolean): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Comp.BeginModify;
        Comp.LockStrings := LockStrs;
        Comp.EndModify;
    finally
        PCBServer.PostProcess;
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONBoolean(ResultProps, 'lock_strings', LockStrs);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// pcb_component: set_primitive_lock — lock/unlock all owned primitives inside the component
// Verified: 01_PCB对象与API §3.1 (PrimitiveLock, LockStrings) + PCBObjectInspector L883.
function PcbComponentSetPrimitiveLock(Board: IPCB_Board; const Designator: String; LockPrims: Boolean): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Comp.BeginModify;
        Comp.PrimitiveLock := LockPrims;
        Comp.EndModify;
    finally
        PCBServer.PostProcess;
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONBoolean(ResultProps, 'primitive_lock', LockPrims);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// pcb_component: set_component_kind — change component kind (TComponentKind)
// Verified: 01_PCB对象与API §3.1 ComponentKind property + 05_枚举 §8 TComponentKind.
function PcbComponentSetComponentKind(Board: IPCB_Board; const Designator: String; Kind: TComponentKind): String;
var
    Comp: IPCB_Component;
    ResultProps: TStringList;
    KindStr: String;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Comp.BeginModify;
        Comp.ComponentKind := Kind;
        Comp.EndModify;
    finally
        PCBServer.PostProcess;
    end;

    case Kind of
        eComponentKind_Standard:       KindStr := 'eComponentKind_Standard';
        eComponentKind_Mechanical:     KindStr := 'eComponentKind_Mechanical';
        eComponentKind_Graphical:      KindStr := 'eComponentKind_Graphical';
        eComponentKind_NetTie_BOM:     KindStr := 'eComponentKind_NetTie_BOM';
        eComponentKind_NetTie_NoBOM:   KindStr := 'eComponentKind_NetTie_NoBOM';
        eComponentKind_Standard_NoBOM: KindStr := 'eComponentKind_Standard_NoBOM';
        eComponentKind_Jumper:         KindStr := 'eComponentKind_Jumper';
    else KindStr := 'Unknown';
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONProperty(ResultProps, 'component_kind', KindStr);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// pcb_component: set_3d_body — update one 3D body attached to the component.
// Verified: 01_PCB对象与API §3.9 IPCB_ComponentBody —
//   StandoffHeight, OverallHeight, BodyProjection, BodyColor3D, BodyOpacity3D.
//   PCBObjectInspector L906-L911 confirms same property names as writes.
//   Selection of target body: by body_index (0-based from get_3d_bodies) — most deterministic.
function PcbComponentSet3DBody(Board: IPCB_Board; const Designator: String;
    BodyIndex: Integer;
    UseStandoff, UseOverall, UseProjection, UseColor, UseOpacity: Boolean;
    StandoffMils, OverallMils: Double;
    Projection: TBoardSide;
    Color3D, Opacity3D: Integer): String;
var
    Comp: IPCB_Component;
    GrpIter: IPCB_GroupIterator;
    Body: IPCB_ComponentBody;
    Idx: Integer;
    ResultProps: TStringList;
    ProjStr: String;
begin
    Comp := FindPcbComponentByRefDes(Board, Designator);
    if Comp = nil then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;
    if BodyIndex < 0 then
    begin
        Result := '{"success":false,"error":"body_index must be >= 0 (use get_3d_bodies to list bodies with indices)"}';
        Exit;
    end;

    Idx := -1;
    GrpIter := Comp.GroupIterator_Create;
    GrpIter.AddFilter_ObjectSet(MkSet(eComponentBodyObject));
    Body := GrpIter.FirstPCBObject;
    while Body <> nil do
    begin
        Idx := Idx + 1;
        if Idx = BodyIndex then Break;
        Body := GrpIter.NextPCBObject;
    end;
    Comp.GroupIterator_Destroy(GrpIter);

    if Body = nil then
    begin
        Result := '{"success":false,"error":"3D body index out of range: ' + IntToStr(BodyIndex) + ' (found ' + IntToStr(Idx + 1) + ' bodies)"}';
        Exit;
    end;

    PCBServer.PreProcess;
    try
        Body.BeginModify;
        if UseStandoff   then Body.StandoffHeight := MilsToCoord(StandoffMils);
        if UseOverall    then Body.OverallHeight  := MilsToCoord(OverallMils);
        if UseProjection then Body.BodyProjection := Projection;
        if UseColor      then Body.BodyColor3D    := Color3D;
        if UseOpacity    then Body.BodyOpacity3D  := Opacity3D;
        Body.EndModify;
        Body.GraphicallyInvalidate;
    finally
        PCBServer.PostProcess;
    end;
    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    if UseProjection then begin
        case Projection of
            eBoardSide_Top:    ProjStr := 'eBoardSide_Top';
            eBoardSide_Bottom: ProjStr := 'eBoardSide_Bottom';
        else ProjStr := 'Unknown';
        end;
    end else ProjStr := '';

    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'designator', Designator);
        AddJSONInteger(ResultProps, 'body_index', BodyIndex);
        AddJSONProperty(ResultProps, 'body_unique_id', Body.UniqueId);
        if UseStandoff   then AddJSONNumber(ResultProps, 'standoff_height_mils', StandoffMils);
        if UseOverall    then AddJSONNumber(ResultProps, 'overall_height_mils',  OverallMils);
        if UseProjection then AddJSONProperty(ResultProps, 'body_projection', ProjStr);
        if UseColor      then AddJSONInteger(ResultProps, 'body_color_3d',   Color3D);
        if UseOpacity    then AddJSONInteger(ResultProps, 'body_opacity_3d', Opacity3D);
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
    end;
end;

// Main action-based router for pcb_component command
function PcbComponentMain(RequestData: TStringList): String;
var
    Action: String;
    Designator: String;
    Rotation: Double;
    UseRotation: Boolean;
    SelectStr: String;
    DoSelect: Boolean;
    Board: IPCB_Board;
    HeightMils: Double;
    UseHeight: Boolean;
    MoveableStr: String;
    IsMoveable: Boolean;
    VisibleStr: String;
    IsVisible: Boolean;
    NameAutoPos, CommentAutoPos: Integer;
    UseNameAuto, UseCommentAuto: Boolean;
    // set_primitive_lock / set_component_kind
    BoolVal: Boolean;
    UseBool: Boolean;
    KindStr: String;
    // set_3d_body
    BodyIndex: Integer;
    UseBodyIndex: Boolean;
    StandoffMils, OverallMils: Double;
    UseStandoff, UseOverall: Boolean;
    ProjectionStr: String;
    UseProjection: Boolean;
    Projection: TBoardSide;
    Color3D: Integer;
    UseColor: Boolean;
    Opacity3D: Integer;
    UseOpacity: Boolean;
begin
    Result := '';
    Action := PcbEditParseStringAfterKey(RequestData, '"action"');
    if Action = '' then
    begin
        Result := 'ERROR: ACTION_REQUIRED';
        Exit;
    end;

    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then
    begin
        Result := 'ERROR: No PCB document is currently active';
        Exit;
    end;

    Designator := PcbEditParseStringAfterKey(RequestData, '"designator"');
    if Designator = '' then
    begin
        Result := 'ERROR: DESIGNATOR_REQUIRED';
        Exit;
    end;

    if Action = 'rotate' then
    begin
        Rotation := PcbEditParseFloatAfterKey(RequestData, '"rotation"', UseRotation);
        if not UseRotation then
        begin
            Result := 'ERROR: ROTATION_REQUIRED';
            Exit;
        end;
        Result := PcbComponentRotate(Board, Designator, Rotation);
    end
    else if Action = 'flip' then
    begin
        Result := PcbComponentFlip(Board, Designator);
    end
    else if Action = 'select' then
    begin
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"select"');
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));
        Result := PcbComponentSelect(Board, Designator, DoSelect);
    end
    else if Action = 'get_properties' then
    begin
        Result := PcbComponentGetProperties(Board, Designator);
    end
    else if Action = 'set_height' then
    begin
        HeightMils := PcbEditParseFloatAfterKey(RequestData, '"height_mils"', UseHeight);
        if not UseHeight then
        begin
            Result := 'ERROR: HEIGHT_MILS_REQUIRED';
            Exit;
        end;
        Result := PcbComponentSetHeight(Board, Designator, HeightMils);
    end
    else if Action = 'set_moveable' then
    begin
        MoveableStr := PcbEditParseStringAfterKey(RequestData, '"moveable"');
        IsMoveable := not ((AnsiCompareText(MoveableStr, 'false') = 0) or (AnsiCompareText(MoveableStr, '0') = 0));
        Result := PcbComponentSetMoveable(Board, Designator, IsMoveable);
    end
    else if Action = 'set_name_visibility' then
    begin
        VisibleStr := PcbEditParseStringAfterKey(RequestData, '"visible"');
        IsVisible := not ((AnsiCompareText(VisibleStr, 'false') = 0) or (AnsiCompareText(VisibleStr, '0') = 0));
        Result := PcbComponentSetNameVisibility(Board, Designator, IsVisible);
    end
    else if Action = 'set_comment_visibility' then
    begin
        VisibleStr := PcbEditParseStringAfterKey(RequestData, '"visible"');
        IsVisible := not ((AnsiCompareText(VisibleStr, 'false') = 0) or (AnsiCompareText(VisibleStr, '0') = 0));
        Result := PcbComponentSetCommentVisibility(Board, Designator, IsVisible);
    end
    else if Action = 'set_autoposition' then
    begin
        NameAutoPos := Trunc(PcbEditParseFloatAfterKey(RequestData, '"name_autoposition"', UseNameAuto));
        if not UseNameAuto then NameAutoPos := -1;
        CommentAutoPos := Trunc(PcbEditParseFloatAfterKey(RequestData, '"comment_autoposition"', UseCommentAuto));
        if not UseCommentAuto then CommentAutoPos := -1;
        if (not UseNameAuto) and (not UseCommentAuto) then
        begin
            Result := 'ERROR: AT_LEAST_ONE_AUTOPOSITION_REQUIRED (0-9 for name_autoposition or comment_autoposition)';
            Exit;
        end;
        Result := PcbComponentSetAutoPosition(Board, Designator, NameAutoPos, CommentAutoPos);
    end
    else if Action = 'get_3d_bodies' then
    begin
        Result := PcbComponentGet3DBodies(Board, Designator);
    end
    else if Action = 'set_lock_strings' then
    begin
        VisibleStr := PcbEditParseStringAfterKey(RequestData, '"lock_strings"');
        IsVisible := not ((AnsiCompareText(VisibleStr, 'false') = 0) or (AnsiCompareText(VisibleStr, '0') = 0));
        Result := PcbComponentSetLockStrings(Board, Designator, IsVisible);
    end
    else if Action = 'set_primitive_lock' then
    begin
        // IPCB_Component.PrimitiveLock — locks all child primitives of the component
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"primitive_lock"');
        BoolVal := PcbEditParseBoolFromString(SelectStr, UseBool);
        if not UseBool then
        begin
            Result := 'ERROR: PRIMITIVE_LOCK_REQUIRED (true|false)';
            Exit;
        end;
        Result := PcbComponentSetPrimitiveLock(Board, Designator, BoolVal);
    end
    else if Action = 'set_component_kind' then
    begin
        // IPCB_Component.ComponentKind — TComponentKind enum
        KindStr := PcbEditParseStringAfterKey(RequestData, '"kind"');
        if KindStr = '' then
        begin
            Result := 'ERROR: KIND_REQUIRED (standard|mechanical|graphical|net_tie_bom|net_tie_nobom|standard_nobom|jumper or 0-6)';
            Exit;
        end;
        Result := PcbComponentSetComponentKind(Board, Designator, PcbEditParseComponentKindFromString(KindStr));
    end
    else if Action = 'set_3d_body' then
    begin
        // IPCB_ComponentBody writable subset per API ref.
        // body_index (required) is the 0-based index from get_3d_bodies listing.
        BodyIndex := Trunc(PcbEditParseFloatAfterKey(RequestData, '"body_index"', UseBodyIndex));
        if not UseBodyIndex then
        begin
            Result := 'ERROR: BODY_INDEX_REQUIRED (use get_3d_bodies first to obtain 0-based indices)';
            Exit;
        end;
        StandoffMils := PcbEditParseFloatAfterKey(RequestData, '"standoff_height_mils"', UseStandoff);
        OverallMils  := PcbEditParseFloatAfterKey(RequestData, '"overall_height_mils"',  UseOverall);

        ProjectionStr := PcbEditParseStringAfterKey(RequestData, '"body_projection"');
        UseProjection := ProjectionStr <> '';
        if UseProjection then Projection := PcbEditParseBoardSideFromString(ProjectionStr);

        SelectStr := PcbEditParseStringAfterKey(RequestData, '"body_color_3d"');
        UseColor := SelectStr <> '';
        if UseColor then begin
            if not TryStrToInt(SelectStr, Color3D) then Color3D := 0;
        end;
        SelectStr := PcbEditParseStringAfterKey(RequestData, '"body_opacity_3d"');
        UseOpacity := SelectStr <> '';
        if UseOpacity then begin
            if not TryStrToInt(SelectStr, Opacity3D) then Opacity3D := 0;
        end;

        if not (UseStandoff or UseOverall or UseProjection or UseColor or UseOpacity) then
        begin
            Result := 'ERROR: AT_LEAST_ONE_PROPERTY_REQUIRED for set_3d_body (standoff_height_mils, overall_height_mils, body_projection, body_color_3d, body_opacity_3d)';
            Exit;
        end;

        Result := PcbComponentSet3DBody(Board, Designator, BodyIndex,
            UseStandoff, UseOverall, UseProjection, UseColor, UseOpacity,
            StandoffMils, OverallMils, Projection, Color3D, Opacity3D);
    end
    else
    begin
        Result := 'ERROR: UNKNOWN_ACTION';
        Exit;
    end;
end;

// =====================================================================
// PCB DRC Violations
// Verified: Violations.pas — Iterator + MkSet(eViolationObject)
// =====================================================================
function GetPCBDRCViolations(ROOT_DIR: String): String;
var
    Board: IPCB_Board;
    Iterator: IPCB_BoardIterator;
    Violation: IPCB_Primitive;
    ViolationsArray: TStringList;
    ViolationProps: TStringList;
    OutputLines: TStringList;
    ViolationCount: Integer;
begin
    Result := '[]';
    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then Exit;

    ViolationsArray := TStringList.Create;
    ViolationCount := 0;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eViolationObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);

        Violation := Iterator.FirstPCBObject;
        while Violation <> nil do
        begin
            ViolationProps := TStringList.Create;
            try
                AddJSONInteger(ViolationProps, 'index', ViolationCount);
                AddJSONProperty(ViolationProps, 'description', Violation.Description);
                AddJSONProperty(ViolationProps, 'detail', Violation.Detail);
                AddJSONProperty(ViolationProps, 'identifier', Violation.Identifier);
                AddJSONProperty(ViolationProps, 'descriptor', Violation.Descriptor);
                AddJSONProperty(ViolationProps, 'object_id_string', Violation.ObjectIDString);
                AddJSONProperty(ViolationProps, 'unique_id', Violation.UniqueId);
                AddJSONBoolean(ViolationProps, 'drc_error', Violation.DRCError);
                AddJSONBoolean(ViolationProps, 'selected', Violation.Selected);
                AddJSONProperty(ViolationProps, 'layer', Layer2String(Violation.Layer));
                ViolationsArray.Add(BuildJSONObject(ViolationProps, 1));
            finally
                ViolationProps.Free;
            end;
            ViolationCount := ViolationCount + 1;
            Violation := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);

        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONArray(ViolationsArray);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_drc_violations.json');
        finally
            OutputLines.Free;
        end;
    finally
        ViolationsArray.Free;
    end;
end;

// =====================================================================
// PCB Board Info — dimensions, area, outline
// Verified: QueryBoard.pas — BoardOutline.BoundingRectangle + AreaSize + PointCount
// =====================================================================
function GetPCBBoardInfo(ROOT_DIR: String): String;
var
    Board: IPCB_Board;
    Outline: IPCB_Polygon;
    BR: TCoordRect;
    ResultProps: TStringList;
    OutlineArray: TStringList;
    PointProps: TStringList;
    I: Integer;
    OutputLines: TStringList;
    CountIter: IPCB_BoardIterator;
    CountPrim: IPCB_Primitive;
    CompCount, PadCount, ViaCount, TrackCount, ArcCount, FillCount: Integer;
    TextCount, PolyCount, RegionCount, ConnCount: Integer;
    LayerStack: IPCB_LayerStack_V7;
    LayerObj: IPCB_LayerObject;
    LayerCount: Integer;
begin
    Result := '';
    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then
    begin
        Result := '{"error":"No PCB document is currently active"}';
        Exit;
    end;

    Outline := Board.BoardOutline;
    Outline.Invalidate;
    Outline.Rebuild;
    Outline.Validate;
    BR := Outline.BoundingRectangle;

    // Count all object types
    CompCount := 0; PadCount := 0; ViaCount := 0; TrackCount := 0;
    ArcCount := 0; FillCount := 0; TextCount := 0; PolyCount := 0;
    RegionCount := 0; ConnCount := 0;

    CountIter := Board.BoardIterator_Create;
    CountIter.AddFilter_ObjectSet(MkSet(eComponentObject, ePadObject, eViaObject, eTrackObject,
        eArcObject, eFillObject, eTextObject, ePolyObject, eRegionObject, eConnectionObject));
    CountIter.AddFilter_LayerSet(AllLayers);
    CountIter.AddFilter_Method(eProcessAll);

    CountPrim := CountIter.FirstPCBObject;
    while CountPrim <> nil do
    begin
        case CountPrim.ObjectId of
            eComponentObject:  CompCount := CompCount + 1;
            ePadObject:        PadCount := PadCount + 1;
            eViaObject:        ViaCount := ViaCount + 1;
            eTrackObject:      TrackCount := TrackCount + 1;
            eArcObject:        ArcCount := ArcCount + 1;
            eFillObject:       FillCount := FillCount + 1;
            eTextObject:       TextCount := TextCount + 1;
            ePolyObject:       PolyCount := PolyCount + 1;
            eRegionObject:     RegionCount := RegionCount + 1;
            eConnectionObject: ConnCount := ConnCount + 1;
        end;
        CountPrim := CountIter.NextPCBObject;
    end;
    Board.BoardIterator_Destroy(CountIter);

    // Count layers
    LayerCount := 0;
    LayerStack := Board.LayerStack_V7;
    if LayerStack <> nil then
    begin
        LayerObj := LayerStack.FirstLayer;
        while LayerObj <> nil do
        begin
            LayerCount := LayerCount + 1;
            LayerObj := LayerStack.NextLayer(LayerObj);
        end;
    end;

    ResultProps := TStringList.Create;
    OutlineArray := TStringList.Create;
    try
        AddJSONNumber(ResultProps, 'left_mils', CoordToMils(BR.Left));
        AddJSONNumber(ResultProps, 'bottom_mils', CoordToMils(BR.Bottom));
        AddJSONNumber(ResultProps, 'right_mils', CoordToMils(BR.Right));
        AddJSONNumber(ResultProps, 'top_mils', CoordToMils(BR.Top));
        AddJSONNumber(ResultProps, 'width_mils', CoordToMils(BR.Right - BR.Left));
        AddJSONNumber(ResultProps, 'height_mils', CoordToMils(BR.Top - BR.Bottom));
        AddJSONNumber(ResultProps, 'area_sq_mils', Outline.AreaSize / 100000000);
        AddJSONInteger(ResultProps, 'outline_point_count', Outline.PointCount);

        // Object counts
        AddJSONInteger(ResultProps, 'component_count', CompCount);
        AddJSONInteger(ResultProps, 'pad_count', PadCount);
        AddJSONInteger(ResultProps, 'via_count', ViaCount);
        AddJSONInteger(ResultProps, 'track_count', TrackCount);
        AddJSONInteger(ResultProps, 'arc_count', ArcCount);
        AddJSONInteger(ResultProps, 'fill_count', FillCount);
        AddJSONInteger(ResultProps, 'text_count', TextCount);
        AddJSONInteger(ResultProps, 'polygon_count', PolyCount);
        AddJSONInteger(ResultProps, 'region_count', RegionCount);
        AddJSONInteger(ResultProps, 'connection_count', ConnCount);
        AddJSONInteger(ResultProps, 'layer_count', LayerCount);

        // List outline segments
        for I := 0 to Outline.PointCount - 1 do
        begin
            PointProps := TStringList.Create;
            try
                AddJSONInteger(PointProps, 'index', I);
                AddJSONNumber(PointProps, 'x_mils', CoordToMils(Outline.Segments[I].vx));
                AddJSONNumber(PointProps, 'y_mils', CoordToMils(Outline.Segments[I].vy));
                if Outline.Segments[I].Kind = 0 then
                    AddJSONProperty(PointProps, 'kind', 'line')
                else
                    AddJSONProperty(PointProps, 'kind', 'arc');
                OutlineArray.Add(BuildJSONObject(PointProps, 1));
            finally
                PointProps.Free;
            end;
        end;
        ResultProps.Add(BuildJSONArray(OutlineArray, 'outline_points', 1));

        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_board_info.json');
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
        OutlineArray.Free;
    end;
end;

// =====================================================================
// PCB Polygon Info — list all polygons with properties
// Verified: IteratePolygons.pas — Iterator + MkSet(ePolyObject)
// =====================================================================
function GetPCBPolygons(ROOT_DIR: String): String;
var
    Board: IPCB_Board;
    Iterator: IPCB_BoardIterator;
    Polygon: IPCB_Polygon;
    PolyArray: TStringList;
    PolyProps: TStringList;
    SegArray: TStringList;
    SegProps: TStringList;
    NetName: String;
    HatchStr: String;
    PourOverStr: String;
    PolyTypeStr: String;
    OutputLines: TStringList;
    PolyCount: Integer;
    I: Integer;
    BR: TCoordRect;
begin
    Result := '[]';
    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then Exit;

    PolyArray := TStringList.Create;
    PolyCount := 0;
    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(ePolyObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);

        Polygon := Iterator.FirstPCBObject;
        while Polygon <> nil do
        begin
            PolyProps := TStringList.Create;
            SegArray := TStringList.Create;
            try
                AddJSONInteger(PolyProps, 'index', PolyCount);
                AddJSONProperty(PolyProps, 'layer', Layer2String(Polygon.Layer));
                if Polygon.Net <> nil then
                    NetName := Polygon.Net.Name
                else
                    NetName := '';
                AddJSONProperty(PolyProps, 'net', NetName);
                AddJSONInteger(PolyProps, 'point_count', Polygon.PointCount);

                case Polygon.PolyHatchStyle of
                    0: HatchStr := 'ePolyHatch90';
                    1: HatchStr := 'ePolyHatch45';
                    2: HatchStr := 'ePolyVHatch';
                    3: HatchStr := 'ePolyHHatch';
                    4: HatchStr := 'ePolyNoHatch';
                    5: HatchStr := 'ePolySolid';
                else
                    HatchStr := 'Unknown';
                end;
                AddJSONProperty(PolyProps, 'hatch_style', HatchStr);

                // Polygon pour over type
                case Polygon.PourOver of
                    0: PourOverStr := 'ePourOver_None';
                    1: PourOverStr := 'ePourOver_SameNet';
                    2: PourOverStr := 'ePourOver_All';
                else
                    PourOverStr := 'Unknown';
                end;
                AddJSONProperty(PolyProps, 'pour_over_type', PourOverStr);

                // Polygon type
                case Polygon.PolygonType of
                    0: PolyTypeStr := 'ePolySignal';
                    1: PolyTypeStr := 'ePolyPlane';
                    2: PolyTypeStr := 'ePolySplit';
                else
                    PolyTypeStr := 'Unknown';
                end;
                AddJSONProperty(PolyProps, 'polygon_type', PolyTypeStr);

                AddJSONNumber(PolyProps, 'grid_mils', CoordToMils(Polygon.Grid));
                AddJSONNumber(PolyProps, 'track_size_mils', CoordToMils(Polygon.TrackSize));
                AddJSONNumber(PolyProps, 'min_track_mils', CoordToMils(Polygon.MinTrack));
                AddJSONBoolean(PolyProps, 'pour_over', Polygon.PourOver <> 0);
                AddJSONBoolean(PolyProps, 'use_octagons', Polygon.UseOctagons);
                AddJSONBoolean(PolyProps, 'remove_dead', Polygon.RemoveDead);
                AddJSONBoolean(PolyProps, 'selected', Polygon.Selected);
                AddJSONProperty(PolyProps, 'unique_id', Polygon.UniqueId);

                // Bounding rectangle
                BR := Polygon.BoundingRectangle;
                AddJSONNumber(PolyProps, 'bbox_left_mils', CoordToMils(BR.Left));
                AddJSONNumber(PolyProps, 'bbox_bottom_mils', CoordToMils(BR.Bottom));
                AddJSONNumber(PolyProps, 'bbox_right_mils', CoordToMils(BR.Right));
                AddJSONNumber(PolyProps, 'bbox_top_mils', CoordToMils(BR.Top));

                // List polygon segments (vertices)
                for I := 0 to Polygon.PointCount - 1 do
                begin
                    SegProps := TStringList.Create;
                    try
                        AddJSONInteger(SegProps, 'index', I);
                        AddJSONNumber(SegProps, 'x_mils', CoordToMils(Polygon.Segments[I].vx));
                        AddJSONNumber(SegProps, 'y_mils', CoordToMils(Polygon.Segments[I].vy));
                        case Polygon.Segments[I].Kind of
                            0: AddJSONProperty(SegProps, 'kind', 'line');
                            1: AddJSONProperty(SegProps, 'kind', 'arc');
                        else
                            AddJSONProperty(SegProps, 'kind', 'unknown');
                        end;
                        SegArray.Add(BuildJSONObject(SegProps, 2));
                    finally
                        SegProps.Free;
                    end;
                end;
                PolyProps.Add(BuildJSONArray(SegArray, 'segments', 1));

                PolyArray.Add(BuildJSONObject(PolyProps, 1));
            finally
                PolyProps.Free;
                SegArray.Free;
            end;
            PolyCount := PolyCount + 1;
            Polygon := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);

        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONArray(PolyArray);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_polygons.json');
        finally
            OutputLines.Free;
        end;
    finally
        PolyArray.Free;
    end;
end;

// =====================================================================
// PCB Net Info — detailed net info + select net
// Verified: IterateNets.pas — Net.GroupIterator for items on net
//           NetObjectAssign.pas — Net assignment and lookup
// =====================================================================

// get_net_info — get detailed net information (pin/object count, connection lines, copper length)
function GetPCBNetInfo(ROOT_DIR: String; const NetName: String): String;
var
    Board: IPCB_Board;
    Net: IPCB_Net;
    GrpIter: IPCB_GroupIterator;
    Prim: IPCB_Primitive;
    ResultProps: TStringList;
    ItemsArray: TStringList;
    ItemProps: TStringList;
    ConnIter: IPCB_BoardIterator;
    Conn: IPCB_Connection;
    ConnCount, PrimCount: Integer;
    OutputLines: TStringList;
    TrackOnNet, ArcOnNet, PadOnNet, ViaOnNet, FillOnNet, PolyOnNet, RegionOnNet: Integer;
    TotalCopperLength: Double;
    TrackLen: Double;
    LayerDistArray: TStringList;
    LayerDistProps: TStringList;
    LayerName: String;
    CurLayer: String;
    CurCount: Integer;
    I: Integer;
    Track: IPCB_Track;
    Arc: IPCB_Arc;
begin
    Result := '';
    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then
    begin
        Result := '{"error":"No PCB document is currently active"}';
        Exit;
    end;

    Net := FindNetByName(Board, NetName);
    if Net = nil then
    begin
        Result := '{"success":false,"error":"Net not found: ' + NetName + '"}';
        Exit;
    end;

    ResultProps := TStringList.Create;
    ItemsArray := TStringList.Create;
    LayerDistArray := TStringList.Create;
    PrimCount := 0;
    TrackOnNet := 0; ArcOnNet := 0; PadOnNet := 0; ViaOnNet := 0;
    FillOnNet := 0; PolyOnNet := 0; RegionOnNet := 0;
    TotalCopperLength := 0;
    try
        AddJSONProperty(ResultProps, 'net_name', Net.Name);

        // Count items on the net using GroupIterator
        GrpIter := Net.GroupIterator_Create;
        GrpIter.AddFilter_ObjectSet(AllObjects);
        Prim := GrpIter.FirstPCBObject;
        while Prim <> nil do
        begin
            ItemProps := TStringList.Create;
            try
                AddJSONProperty(ItemProps, 'object_kind', PrimObjectIdToString(Prim.ObjectId));
                AddJSONProperty(ItemProps, 'layer', Layer2String(Prim.Layer));
                AddJSONBoolean(ItemProps, 'selected', Prim.Selected);
                ItemsArray.Add(BuildJSONObject(ItemProps, 1));
            finally
                ItemProps.Free;
            end;

            // Count by object type
            case Prim.ObjectId of
                eTrackObject:
                begin
                    TrackOnNet := TrackOnNet + 1;
                    Track := Prim;
                    TrackLen := Sqrt(Sqr(CoordToMils(Track.x2 - Track.x1)) + Sqr(CoordToMils(Track.y2 - Track.y1)));
                    TotalCopperLength := TotalCopperLength + TrackLen;
                end;
                eArcObject:
                begin
                    ArcOnNet := ArcOnNet + 1;
                    Arc := Prim;
                    TrackLen := CoordToMils(Arc.Radius) * Abs(Arc.EndAngle - Arc.StartAngle) * Pi / 180;
                    TotalCopperLength := TotalCopperLength + TrackLen;
                end;
                ePadObject:  PadOnNet := PadOnNet + 1;
                eViaObject:  ViaOnNet := ViaOnNet + 1;
                eFillObject: FillOnNet := FillOnNet + 1;
                ePolyObject: PolyOnNet := PolyOnNet + 1;
                eRegionObject: RegionOnNet := RegionOnNet + 1;
            end;

            PrimCount := PrimCount + 1;
            Prim := GrpIter.NextPCBObject;
        end;
        Net.GroupIterator_Destroy(GrpIter);

        AddJSONInteger(ResultProps, 'item_count', PrimCount);
        AddJSONInteger(ResultProps, 'track_count', TrackOnNet);
        AddJSONInteger(ResultProps, 'arc_count', ArcOnNet);
        AddJSONInteger(ResultProps, 'pad_count', PadOnNet);
        AddJSONInteger(ResultProps, 'via_count', ViaOnNet);
        AddJSONInteger(ResultProps, 'fill_count', FillOnNet);
        AddJSONInteger(ResultProps, 'polygon_count', PolyOnNet);
        AddJSONInteger(ResultProps, 'region_count', RegionOnNet);
        AddJSONNumber(ResultProps, 'total_copper_length_mils', TotalCopperLength);

        // Count connection lines (ratsnest) for this net
        ConnCount := 0;
        ConnIter := Board.BoardIterator_Create;
        ConnIter.AddFilter_ObjectSet(MkSet(eConnectionObject));
        ConnIter.AddFilter_LayerSet(AllLayers);
        ConnIter.AddFilter_Method(eProcessAll);
        Conn := ConnIter.FirstPCBObject;
        while Conn <> nil do
        begin
            if (Conn.Net <> nil) and (AnsiCompareText(Conn.Net.Name, NetName) = 0) then
                ConnCount := ConnCount + 1;
            Conn := ConnIter.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(ConnIter);

        AddJSONInteger(ResultProps, 'connection_count', ConnCount);
        ResultProps.Add(BuildJSONArray(ItemsArray, 'items', 1));

        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_net_info.json');
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
        ItemsArray.Free;
        LayerDistArray.Free;
    end;
end;

// select_net — select all objects on a net
// Verified: GroupIterator + Prim.Selected := True pattern
function SelectPCBNet(ROOT_DIR: String; const NetName: String; DoSelect: Boolean): String;
var
    Board: IPCB_Board;
    Net: IPCB_Net;
    GrpIter: IPCB_GroupIterator;
    Prim: IPCB_Primitive;
    SelectCount: Integer;
    ResultProps: TStringList;
    OutputLines: TStringList;
begin
    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then
    begin
        Result := '{"success":false,"error":"No PCB document is currently active"}';
        Exit;
    end;

    Net := FindNetByName(Board, NetName);
    if Net = nil then
    begin
        Result := '{"success":false,"error":"Net not found: ' + NetName + '"}';
        Exit;
    end;

    SelectCount := 0;
    GrpIter := Net.GroupIterator_Create;
    GrpIter.AddFilter_ObjectSet(AllObjects);
    Prim := GrpIter.FirstPCBObject;
    while Prim <> nil do
    begin
        Prim.Selected := DoSelect;
        SelectCount := SelectCount + 1;
        Prim := GrpIter.NextPCBObject;
    end;
    Net.GroupIterator_Destroy(GrpIter);

    Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'select_net');
        AddJSONProperty(ResultProps, 'net_name', NetName);
        AddJSONBoolean(ResultProps, 'selected', DoSelect);
        AddJSONInteger(ResultProps, 'object_count', SelectCount);
        AddJSONBoolean(ResultProps, 'success', True);
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_select_net.json');
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
    end;
end;

// ============================================================================
// OverlapReport — scan entire board for component overlaps and out-of-board
// Returns JSON with conflict count and out-of-board list
// Uses FindOverlappingComponents and IsBBoxOutOfBoard helpers
// ============================================================================
function OverlapReport(ROOT_DIR: String): String;
var
    Board: IPCB_Board;
    Iterator: IPCB_BoardIterator;
    Comp: IPCB_Component;
    CompBBox: TCoordRect;
    OutOfBoardList: TStringList;
    ResultProps: TStringList;
    OutputLines: TStringList;
    ConflictCount: Integer;
    OutOfBoardCount: Integer;
    CompOverlapList: TStringList;
begin
    Result := '';
    Board := PCBServer.GetCurrentPCBBoard;
    if Board = nil then
    begin
        Result := '{"success":false,"error":"No PCB document is currently active"}';
        Exit;
    end;

    OutOfBoardList := TStringList.Create;
    ResultProps := TStringList.Create;
    ConflictCount := 0;
    OutOfBoardCount := 0;

    try
        Iterator := Board.BoardIterator_Create;
        Iterator.AddFilter_ObjectSet(MkSet(eComponentObject));
        Iterator.AddFilter_LayerSet(AllLayers);
        Iterator.AddFilter_Method(eProcessAll);

        Comp := Iterator.FirstPCBObject;
        while Comp <> nil do
        begin
            CompBBox := Comp.BoundingRectangleNoNameCommentForSignals;

            { Check out-of-board }
            if IsBBoxOutOfBoard(Board, CompBBox.Left, CompBBox.Right, CompBBox.Bottom, CompBBox.Top, BOARD_EDGE_MARGIN) then
            begin
                OutOfBoardList.Add('"' + JSONEscapeString(Comp.Name.Text) + '"');
                OutOfBoardCount := OutOfBoardCount + 1;
            end;

            { Check overlap with other components }
            CompOverlapList := FindOverlappingComponents(Board, Comp.Name.Text,
                CompBBox.Left, CompBBox.Right, CompBBox.Bottom, CompBBox.Top, COMPONENT_MARGIN);
            try
                ConflictCount := ConflictCount + CompOverlapList.Count;
            finally
                CompOverlapList.Free;
            end;

            Comp := Iterator.NextPCBObject;
        end;
        Board.BoardIterator_Destroy(Iterator);

        AddJSONInteger(ResultProps, 'total_conflicts', ConflictCount);
        AddJSONInteger(ResultProps, 'out_of_board_count', OutOfBoardCount);
        if OutOfBoardList.Count > 0 then
            ResultProps.Add(BuildJSONArray(OutOfBoardList, 'out_of_board'))
        else
            ResultProps.Add('"out_of_board": []');

        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_overlap_report.json');
        finally
            OutputLines.Free;
        end;
    finally
        OutOfBoardList.Free;
        ResultProps.Free;
    end;
end;
