// Schematic sheet editing for altium-mcp (single bridge command: schematic_edit)
//
// MCP / automation: Do NOT leave IDE breakpoints enabled in this project while the bridge runs.
// A paused script never writes response.json and the MCP client will see TIMEOUT. Use Run without debugging
// or clear breakpoints (DXP > Run > Remove Breakpoints) before MCP calls.

// Forward declarations
function SchEditGetComponentInfo(SchDoc: ISch_Document; const Designator: String): String; forward;
function SchEditNearestSnapTargetFromDoc(SchDoc: ISch_Document; X, Y, Tolerance: Double;
    var SnapX, SnapY: Double; var Target: String): Boolean; forward;
procedure SchEditCreateWireSegment(SchDoc: ISch_Document; X1, Y1, X2, Y2: Double); forward;
procedure SchEditCreateBusSegment(SchDoc: ISch_Document; X1, Y1, X2, Y2: Double); forward;
procedure SchEditCreateJunctionAt(SchDoc: ISch_Document; X, Y: Double); forward;
function SchEditDrawPlan(SchDoc: ISch_Document; RequestData: TStringList): String; forward;
function SchEditDeleteObjects(SchDoc: ISch_Document; const ObjType: String;
    const Designator: String; UseX, UseY: Boolean; XMils, YMils: Double;
    UseArea: Boolean; X1M, Y1M, X2M, Y2M: Double; DeleteAll: Boolean): String; forward;

function SchEditPathsEqual(const PathA, PathB: String): Boolean;
var
    NA, NB: String;
begin
    NA := Trim(LowerCase(McpNormalizeWindowsPath(PathA)));
    NB := Trim(LowerCase(McpNormalizeWindowsPath(PathB)));
    Result := AnsiCompareText(NA, NB) = 0;
end;

function SchEditParseStringAfterKey(RequestData: TStringList; const KeySub: String): String;
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

function SchEditParseFloatAfterKey(RequestData: TStringList; const KeySub: String; var Found: Boolean): Double;
var
    S: String;
begin
    Found := False;
    Result := 0;
    S := SchEditParseStringAfterKey(RequestData, KeySub);
    if S = '' then
        Exit;
    Found := True;
    Result := StrToFloat(StringReplace(S, ',', '.', MkSet(rfReplaceAll)));
end;

procedure SchEditParseStringArray(RequestData: TStringList; const ArrayKeySub: String; List: TStringList);
var
    ParamValue: String;
    i: Integer;
begin
    for i := 0 to RequestData.Count - 1 do
    begin
        if Pos(ArrayKeySub, RequestData[i]) > 0 then
        begin
            i := i + 1;
            while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
            begin
                ParamValue := RequestData[i];
                ParamValue := StringReplace(ParamValue, '"', '', 1);
                ParamValue := StringReplace(ParamValue, ',', '', 1);
                ParamValue := Trim(ParamValue);
                if (ParamValue <> '') and (ParamValue <> '[') then
                    List.Add(ParamValue);
                i := i + 1;
            end;
            Break;
        end;
    end;
end;

// Returns empty string on success; otherwise ERROR: ...
function SchEditResolveSheet(ProjectFullPath, SchematicFullPath, SheetFileFilter: String;
    var SheetDiskPath: String; var SchDoc: ISch_Document): String;
var
    WS: IWorkspace;
    Project: IProject;
    Prj, NamedMatch, RealMatch, FreeMatch: IProject;
    Doc: IDocument;
    i, pi: Integer;
    Found: Boolean;
begin
    Result := '';
    SheetDiskPath := '';
    SchDoc := nil;

    WS := GetWorkspace;
    if WS = nil then
    begin
        Result := 'ERROR: NO_WORKSPACE';
        Exit;
    end;

    if (SchematicFullPath = '') and (SheetFileFilter = '') then
    begin
        Result := 'ERROR: SHEET_REQUIRED: pass schematic_full_path or schematic_sheet_file_name';
        Exit;
    end;

    Project := nil;

    if SchematicFullPath <> '' then
    begin
        // Three-way preference (same as CheckSchematicConnectivityData): a
        // sheet open BOTH as free document and as a real project member must
        // resolve to the real project — named project > any .PrjPcb > Free
        // Documents. Free Documents sorts first in DM_Projects and would
        // otherwise shadow the project on every path-scoped call.
        Found := False;
        NamedMatch := nil;
        RealMatch := nil;
        FreeMatch := nil;
        for pi := 0 to WS.DM_ProjectCount - 1 do
        begin
            Prj := WS.DM_Projects(pi);
            if Prj = nil then
                Continue;
            for i := 0 to Prj.DM_LogicalDocumentCount - 1 do
            begin
                Doc := Prj.DM_LogicalDocuments(i);
                if Doc.DM_DocumentKind <> 'SCH' then
                    Continue;
                if SchEditPathsEqual(Doc.DM_FullPath, SchematicFullPath) then
                begin
                    Found := True;
                    if (ProjectFullPath <> '') and SchEditPathsEqual(Prj.DM_ProjectFullPath, ProjectFullPath) then
                        NamedMatch := Prj
                    else if (RealMatch = nil) and (Pos('.PrjPcb', Prj.DM_ProjectFullPath) > 0) then
                        RealMatch := Prj
                    else if FreeMatch = nil then
                        FreeMatch := Prj;
                end;
            end;
        end;
        if NamedMatch <> nil then
            Project := NamedMatch
        else if RealMatch <> nil then
            Project := RealMatch
        else if FreeMatch <> nil then
            Project := FreeMatch;
        if (not Found) or (Project = nil) then
        begin
            Result := 'ERROR: SCHEMATIC_NOT_IN_OPEN_PROJECTS';
            Exit;
        end;
        Found := False;
        for i := 0 to Project.DM_LogicalDocumentCount - 1 do
        begin
            Doc := Project.DM_LogicalDocuments(i);
            if Doc.DM_DocumentKind <> 'SCH' then
                Continue;
            if SchEditPathsEqual(Doc.DM_FullPath, SchematicFullPath) then
            begin
                SheetDiskPath := Doc.DM_FullPath;
                Found := True;
                Break;
            end;
        end;
        if not Found then
        begin
            Result := 'ERROR: SCHEMATIC_NOT_IN_OPEN_PROJECTS';
            Exit;
        end;
    end
    else if ProjectFullPath <> '' then
    begin
        for pi := 0 to WS.DM_ProjectCount - 1 do
        begin
            if (WS.DM_Projects(pi) <> nil) and SchEditPathsEqual(WS.DM_Projects(pi).DM_ProjectFullPath, ProjectFullPath) then
            begin
                Project := WS.DM_Projects(pi);
                Break;
            end;
        end;
        if Project = nil then
        begin
            Result := 'ERROR: PROJECT_NOT_FOUND';
            Exit;
        end;
        Found := False;
        for i := 0 to Project.DM_LogicalDocumentCount - 1 do
        begin
            Doc := Project.DM_LogicalDocuments(i);
            if Doc.DM_DocumentKind <> 'SCH' then
                Continue;
            if AnsiCompareText(LowerCase(ExtractFileName(Doc.DM_FullPath)), LowerCase(SheetFileFilter)) = 0 then
            begin
                SheetDiskPath := Doc.DM_FullPath;
                Found := True;
                Break;
            end;
        end;
        if not Found then
        begin
            Result := 'ERROR: SCHEMATIC_SHEET_NOT_FOUND';
            Exit;
        end;
    end
    else
    begin
        Project := WS.DM_FocusedProject;
        if Project = nil then
        begin
            Result := 'ERROR: NO_FOCUSED_PROJECT';
            Exit;
        end;
        Found := False;
        for i := 0 to Project.DM_LogicalDocumentCount - 1 do
        begin
            Doc := Project.DM_LogicalDocuments(i);
            if Doc.DM_DocumentKind <> 'SCH' then
                Continue;
            if AnsiCompareText(LowerCase(ExtractFileName(Doc.DM_FullPath)), LowerCase(SheetFileFilter)) = 0 then
            begin
                SheetDiskPath := Doc.DM_FullPath;
                Found := True;
                Break;
            end;
        end;
        if not Found then
        begin
            Result := 'ERROR: SCHEMATIC_SHEET_NOT_FOUND';
            Exit;
        end;
    end;

    Client.OpenDocument('SCH', SheetDiskPath);
    Sleep(300);
    SchDoc := SchServer.GetSchDocumentByPath(SheetDiskPath);
    if SchDoc = nil then
    begin
        Result := 'ERROR: SCH_DOCUMENT_NOT_OPEN';
        Exit;
    end;
    if Pos('.SchLib', SchDoc.DocumentName) > 0 then
    begin
        Result := 'ERROR: NOT_A_SCHEMATIC_SHEET';
        Exit;
    end;
end;

function SchEditRotationFromDeg(Deg: Double): TRotationBy90;
var
    N: Integer;
begin
    N := Round(Deg / 90.0) mod 4;
    if N < 0 then
        N := N + 4;
    case N of
        0: Result := eRotate0;
        1: Result := eRotate90;
        2: Result := eRotate180;
        3: Result := eRotate270;
    else
        Result := eRotate0;
    end;
end;

function SchEditFindComponent(SchDoc: ISch_Document; const Des: String): ISch_Component;
var
    It: ISch_Iterator;
    C: ISch_Component;
begin
    Result := nil;
    if (SchDoc = nil) or (Des = '') then
        Exit;
    It := SchDoc.SchIterator_Create;
    It.AddFilter_ObjectSet(MkSet(eSchComponent));
    C := It.FirstSchObject;
    while C <> nil do
    begin
        if AnsiCompareText(Trim(C.Designator.Text), Trim(Des)) = 0 then
        begin
            Result := C;
            Break;
        end;
        C := It.NextSchObject;
    end;
    SchDoc.SchIterator_Destroy(It);
end;

function SchEditFindComponentByLibRef(SchDoc: ISch_Document; const LibRef: String): ISch_Component;
var
    It: ISch_Iterator;
    C, Last: ISch_Component;
begin
    Result := nil;
    Last := nil;
    It := SchDoc.SchIterator_Create;
    It.AddFilter_ObjectSet(MkSet(eSchComponent));
    C := It.FirstSchObject;
    while C <> nil do
    begin
        if AnsiCompareText(Trim(C.LibReference), Trim(LibRef)) = 0 then
            Last := C;
        C := It.NextSchObject;
    end;
    SchDoc.SchIterator_Destroy(It);
    Result := Last;
end;

// Verified patterns:
// - ProcessControl.PreProcess/PostProcess + UpdatePart_PreProcess/PostProcess: RotateSymbol.pas L255-L298
// - MoveToXY on ISch_BasicContainer (base of ISch_Component): AddWireStubsSch-Form.pas L131
// - SCHM_BeginModify/EndModify RobotManager messages: IncrementDesignators.pas L149-L154
function SchEditSetComponentTransform(SchDoc: ISch_Document; const Designator: String;
    XMils, YMils, RotDeg: Double; UseX, UseY, UseRot: Boolean;
    UseMirror: Boolean; MirrorVal: Boolean): String;
var
    Comp: ISch_Component;
    NewX, NewY: TCoord;
    Props: TStringList;
begin
    Comp := SchEditFindComponent(SchDoc, Designator);
    if Comp = nil then
    begin
        Result := 'ERROR: COMPONENT_NOT_FOUND';
        Exit;
    end;

    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        Comp.UpdatePart_PreProcess;
        try
            SchServer.RobotManager.SendMessage(Comp.I_ObjectAddress, c_BroadCast, SCHM_BeginModify, c_NoEventData);

            // MoveToXY moves the entire component tree (body, pins, designator, parameters)
            if UseX or UseY then
            begin
                NewX := Comp.Location.X;
                NewY := Comp.Location.Y;
                if UseX then NewX := MilsToCoord(XMils);
                if UseY then NewY := MilsToCoord(YMils);
                Comp.MoveToXY(NewX, NewY);
            end;

            if UseRot then
                Comp.Orientation := SchEditRotationFromDeg(RotDeg);

            // Mirror support: Comp.Mirror(Axis) flips around the vertical axis
            // through Axis.X (pattern mirrors RotateBy90(Center, Angle) usage
            // in RotateSymbol.pas L276). Mirroring around the component's own
            // Location flips it in place. Direct IsMirrored write is a no-op.
            if UseMirror then
            begin
                if MirrorVal and (not Comp.IsMirrored) then
                    Comp.Mirror(Comp.Location)
                else if (not MirrorVal) and Comp.IsMirrored then
                    Comp.Mirror(Comp.Location);
            end;

            SchServer.RobotManager.SendMessage(Comp.I_ObjectAddress, c_BroadCast, SCHM_EndModify, c_NoEventData);
        finally
            Comp.UpdatePart_PostProcess;
            Comp.GraphicallyInvalidate;
        end;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'designator', Designator);
        AddJSONBoolean(Props, 'updated', True);
        AddJSONNumber(Props, 'x_mils', XMils);
        AddJSONNumber(Props, 'y_mils', YMils);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

function SchEditSetComponentParameters(SchDoc: ISch_Document; const Designator: String;
    Names, Values: TStringList): String;
var
    Comp: ISch_Component;
    It: ISch_Iterator;
    P: ISch_Parameter;
    i: Integer;
    Found: Boolean;
    NewP: ISch_Parameter;
    Props: TStringList;
    Updated: Integer;
begin
    if (Names = nil) or (Values = nil) or (Names.Count <> Values.Count) or (Names.Count = 0) then
    begin
        Result := 'ERROR: PARAMETER_ARRAY_MISMATCH';
        Exit;
    end;

    Comp := SchEditFindComponent(SchDoc, Designator);
    if Comp = nil then
    begin
        Result := 'ERROR: COMPONENT_NOT_FOUND';
        Exit;
    end;

    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        Updated := 0;
        for i := 0 to Names.Count - 1 do
        begin
            Found := False;
            It := Comp.SchIterator_Create;
            It.AddFilter_ObjectSet(MkSet(eParameter));
            P := It.FirstSchObject;
            while P <> nil do
            begin
                if AnsiCompareText(Trim(P.Name), Trim(Names[i])) = 0 then
                begin
                    // Verified: SCHM_BeginModify/EndModify wrapping text writes — IncrementDesignators.pas L149-L154
                    SchServer.RobotManager.SendMessage(P.I_ObjectAddress, c_BroadCast, SCHM_BeginModify, c_NoEventData);
                    P.Text := Values[i];
                    SchServer.RobotManager.SendMessage(P.I_ObjectAddress, c_BroadCast, SCHM_EndModify, c_NoEventData);
                    Found := True;
                    Inc(Updated);
                    Break;
                end;
                P := It.NextSchObject;
            end;
            Comp.SchIterator_Destroy(It);

            if not Found then
            begin
                // Verified: eParameter factory + AddSchObject — XIA_Update_From_Database.pas L1483, L1499
                NewP := SchServer.SchObjectFactory(eParameter, eCreate_Default);
                if NewP <> nil then
                begin
                    NewP.Name := Names[i];
                    NewP.Text := Values[i];
                    Comp.AddSchObject(NewP);
                    SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, NewP.I_ObjectAddress);
                    Inc(Updated);
                end;
            end;
        end;

        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'designator', Designator);
        AddJSONInteger(Props, 'parameters_updated', Updated);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

// Count components on the sheet matching a LibReference. Used by place_component
// to verify that the process placement actually added a new object.
function SchEditCountComponentsByLibRef(SchDoc: ISch_Document; const LibRef: String): Integer;
var
    It: ISch_Iterator;
    C: ISch_Component;
begin
    Result := 0;
    if (SchDoc = nil) or (LibRef = '') then
        Exit;
    It := SchDoc.SchIterator_Create;
    It.AddFilter_ObjectSet(MkSet(eSchComponent));
    C := It.FirstSchObject;
    while C <> nil do
    begin
        if AnsiCompareText(Trim(C.LibReference), Trim(LibRef)) = 0 then
            Result := Result + 1;
        C := It.NextSchObject;
    end;
    SchDoc.SchIterator_Destroy(It);
end;

// Place a library component via the IntegratedLibrary:PlaceLibraryComponent process.
// Verified: CirWiz.pas L52-L76 (official Altium sample, "generate a simple filter circuit"):
//   ResetParameters;
//   AddStringParameter ('Library', 'Miscellaneous Devices.IntLib');
//   AddStringParameter ('LibReference', 'Res1');
//   AddStringParameter ('Designator', 'R1');
//   AddIntegerParameter('Location.X', X);
//   AddIntegerParameter('Location.Y', Y);
//   AddIntegerParameter('Orientation', 0);            // quarter turns 0-3
//   RunProcess         ('IntegratedLibrary:PlaceLibraryComponent');
// SchObjectFactory(eSchComponent) is intentionally NOT used — it creates an empty
// shell without pins or footprint. The process places a full library part with
// pins, models and footprint links.
// The process acts on the ACTIVE schematic view, so the target sheet is focused
// first via Client.OpenDocument + Client.ShowDocument. Placement is verified by
// re-reading the sheet (never trust the process alone).
function SchEditPlaceComponent(SchDoc: ISch_Document; const SheetDiskPath, LibRef, Des: String;
    XMils, YMils, RotDeg: Double; const SchLibPath: String): String;
var
    ServerDoc: IServerDocument;
    ActiveDoc: ISch_Document;
    Comp: ISch_Component;
    Props: TStringList;
    CountBefore: Integer;
    RotQuarter: Integer;
begin
    if (LibRef = '') or (Des = '') then
    begin
        Result := 'ERROR: LIB_REFERENCE_OR_DESIGNATOR_MISSING';
        Exit;
    end;
    if SheetDiskPath = '' then
    begin
        Result := 'ERROR: SHEET_REQUIRED';
        Exit;
    end;

    CountBefore := SchEditCountComponentsByLibRef(SchDoc, LibRef);

    // Focus the target sheet: the process places on the active schematic view.
    ServerDoc := Client.OpenDocument('Sch', SheetDiskPath);
    if ServerDoc = nil then
    begin
        Result := 'ERROR: SHEET_NOT_ACTIVE';
        Exit;
    end;
    Client.ShowDocument(ServerDoc);
    Sleep(300);

    ActiveDoc := SchServer.GetCurrentSchDocument;
    if (ActiveDoc = nil) or (Pos(UpperCase(ExtractFileName(SheetDiskPath)), UpperCase(ActiveDoc.DocumentName)) = 0) then
    begin
        Result := 'ERROR: SHEET_NOT_ACTIVE';
        Exit;
    end;

    // Orientation for the process is quarter turns (0/90/180/270).
    RotQuarter := Round(RotDeg / 90.0) mod 4;
    if RotQuarter < 0 then
        RotQuarter := RotQuarter + 4;

    ResetParameters;
    if SchLibPath <> '' then
        AddStringParameter('Library', SchLibPath);
    AddStringParameter('LibReference', LibRef);
    AddStringParameter('Designator', Des);
    AddIntegerParameter('Location.X', MilsToCoord(XMils));
    AddIntegerParameter('Location.Y', MilsToCoord(YMils));
    AddIntegerParameter('Orientation', RotQuarter);
    RunProcess('IntegratedLibrary:PlaceLibraryComponent');

    // Verify: re-resolve the sheet and confirm a new component with this LibRef exists.
    Sleep(200);
    SchDoc := SchServer.GetSchDocumentByPath(SheetDiskPath);
    if SchDoc = nil then
    begin
        Result := 'ERROR: PLACE_SCH_COMPONENT_FAILED';
        Exit;
    end;

    Comp := SchEditFindComponent(SchDoc, Des);
    if Comp = nil then
    begin
        if SchEditCountComponentsByLibRef(SchDoc, LibRef) <= CountBefore then
        begin
            // Nothing new landed on the sheet: most likely the library was not
            // found by Altium (not installed / wrong sch_library_path).
            Result := 'ERROR: PLACED_COMPONENT_NOT_FOUND';
            Exit;
        end;
        // Placed, but Altium assigned a different designator (e.g. Des was taken).
        Comp := SchEditFindComponentByLibRef(SchDoc, LibRef);
        if Comp = nil then
        begin
            Result := 'ERROR: PLACED_COMPONENT_NOT_FOUND';
            Exit;
        end;
    end;

    Props := TStringList.Create;
    try
        AddJSONBoolean(Props, 'success', True);
        AddJSONProperty(Props, 'designator', Comp.Designator.Text);
        AddJSONProperty(Props, 'lib_reference', Comp.LibReference);
        AddJSONNumber(Props, 'x_mils', CoordToMils(Comp.Location.X));
        AddJSONNumber(Props, 'y_mils', CoordToMils(Comp.Location.Y));
        AddJSONInteger(Props, 'rotation_quarter', RotQuarter);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

function SchEditAddText(SchDoc: ISch_Document; const Txt: String; XMils, YMils: Double): String;
var
    L: ISch_Label;
    Props: TStringList;
begin
    if Txt = '' then
    begin
        Result := 'ERROR: TEXT_EMPTY';
        Exit;
    end;

    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        L := SchServer.SchObjectFactory(eLabel, eCreate_Default);
        if L = nil then
        begin
            Result := 'ERROR: FACTORY_LABEL_FAILED';
            Exit;
        end;
        L.Text := Txt;
        L.Location := Point(MilsToCoord(XMils), MilsToCoord(YMils));
        SchDoc.RegisterSchObjectInContainer(L);
        SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, L.I_ObjectAddress);
        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'text', Txt);
        AddJSONNumber(Props, 'x_mils', XMils);
        AddJSONNumber(Props, 'y_mils', YMils);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

function SchEditDefaultNetNameForPowerStyle(St: TPowerObjectStyle): String;
begin
    case St of
        ePowerGndPower, ePowerGndSignal, ePowerGndEarth:
            Result := 'GND';
    else
        Result := 'VCC';
    end;
end;

function SchEditPowerStyleToCanonicalString(St: TPowerObjectStyle): String;
begin
    case St of
        ePowerCircle: Result := 'circle';
        ePowerArrow: Result := 'arrow';
        ePowerBar: Result := 'bar';
        ePowerWave: Result := 'wave';
        ePowerGndPower: Result := 'gnd_power';
        ePowerGndSignal: Result := 'gnd_signal';
        ePowerGndEarth: Result := 'gnd_earth';
    else
        Result := 'arrow';
    end;
end;

// Returns True and sets St when S is a recognized style token (case-insensitive).
function SchEditTryParsePowerPortStyle(const S: String; var St: TPowerObjectStyle): Boolean;
var
    L: String;
begin
    Result := False;
    L := LowerCase(Trim(S));
    if L = 'circle' then begin St := ePowerCircle; Result := True; Exit; end;
    if L = 'arrow' then begin St := ePowerArrow; Result := True; Exit; end;
    if L = 'bar' then begin St := ePowerBar; Result := True; Exit; end;
    if L = 'wave' then begin St := ePowerWave; Result := True; Exit; end;
    if (L = 'gnd_power') or (L = 'power_ground') then begin St := ePowerGndPower; Result := True; Exit; end;
    if (L = 'gnd_signal') or (L = 'signal_ground') then begin St := ePowerGndSignal; Result := True; Exit; end;
    if (L = 'gnd_earth') or (L = 'earth') then begin St := ePowerGndEarth; Result := True; Exit; end;
end;

// Bare JSON boolean/number after key; empty -> DefaultVal.
function SchEditParseBoolWithDefault(RequestData: TStringList; const KeySub: String; DefaultVal: Boolean): Boolean;
var
    S: String;
begin
    S := Trim(SchEditParseStringAfterKey(RequestData, KeySub));
    if S = '' then
    begin
        Result := DefaultVal;
        Exit;
    end;
    S := LowerCase(S);
    if (S = 'true') or (S = '1') then
        Result := True
    else if (S = 'false') or (S = '0') then
        Result := False
    else
        Result := DefaultVal;
end;

// True when the raw JSON contains the key at all (distinguishes "absent" from false).
function SchEditMirrorKeyPresent(RequestData: TStringList): Boolean;
var
    S: String;
begin
    S := Trim(SchEditParseStringAfterKey(RequestData, '"mirror_x"'));
    Result := S <> '';
end;

function SchEditAddNetLabel(SchDoc: ISch_Document; const NetName: String; XMils, YMils, RotDeg: Double): String;
var
    N: ISch_NetLabel;
    Props: TStringList;
begin
    if NetName = '' then
    begin
        Result := 'ERROR: NET_NAME_EMPTY';
        Exit;
    end;

    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        N := SchServer.SchObjectFactory(eNetLabel, eCreate_Default);
        if N = nil then
        begin
            Result := 'ERROR: FACTORY_NETLABEL_FAILED';
            Exit;
        end;
        N.Text := NetName;
        N.Location := Point(MilsToCoord(XMils), MilsToCoord(YMils));
        N.Orientation := SchEditRotationFromDeg(RotDeg);
        SchDoc.RegisterSchObjectInContainer(N);
        SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, N.I_ObjectAddress);
        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'net', NetName);
        AddJSONNumber(Props, 'x_mils', XMils);
        AddJSONNumber(Props, 'y_mils', YMils);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

function SchEditPlacePowerPort(SchDoc: ISch_Document; const NetNameIn: String; XMils, YMils, RotDeg: Double;
    St: TPowerObjectStyle; ShowNet: Boolean; SnapTolerance: Double): String;
var
    PO: ISch_PowerObject;
    Props: TStringList;
    Net: String;
    CanonStyle: String;
    SnapX, SnapY: Double;
    SnapTarget: String;
begin
    Net := Trim(NetNameIn);
    if Net = '' then
        Net := SchEditDefaultNetNameForPowerStyle(St);

    // A power port connects only when it sits EXACTLY on the pin hotspot / wire
    // point it feeds. Snap the requested position to the nearest hotspot so a
    // small coordinate error cannot leave the port floating next to its pin.
    SnapTarget := '';
    if SnapTolerance > 0 then
    begin
        if SchEditNearestSnapTargetFromDoc(SchDoc, XMils, YMils, SnapTolerance, SnapX, SnapY, SnapTarget) then
        begin
            XMils := SnapX;
            YMils := SnapY;
        end;
    end;

    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        PO := SchServer.SchObjectFactory(ePowerObject, eCreate_Default);
        if PO = nil then
        begin
            Result := 'ERROR: FACTORY_POWER_OBJECT_FAILED';
            Exit;
        end;
        PO.Text := Net;
        PO.Location := Point(MilsToCoord(XMils), MilsToCoord(YMils));
        PO.Orientation := SchEditRotationFromDeg(RotDeg);
        PO.SetState_Style(St);
        PO.SetState_ShowNetName(ShowNet);
        SchDoc.RegisterSchObjectInContainer(PO);
        SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, PO.I_ObjectAddress);
        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    CanonStyle := SchEditPowerStyleToCanonicalString(St);
    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'net_name', Net);
        AddJSONProperty(Props, 'power_port_style', CanonStyle);
        AddJSONBoolean(Props, 'show_net_name', ShowNet);
        AddJSONNumber(Props, 'x_mils', XMils);
        AddJSONNumber(Props, 'y_mils', YMils);
        if SnapTarget <> '' then
            AddJSONProperty(Props, 'snapped_to', SnapTarget);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

// Avoid TStringList.DelimitedText (locale / StrictDelimiter quirks); split comma-separated numbers only.
procedure SchEditSplitCsvNumbers(const CSV: String; Parts: TStringList);
var
    S, Item: String;
    P: Integer;
begin
    Parts.Clear;
    S := Trim(StringReplace(StringReplace(CSV, ' ', '', MkSet(rfReplaceAll)), #9, '', MkSet(rfReplaceAll)));
    if S = '' then
        Exit;
    while S <> '' do
    begin
        P := Pos(',', S);
        if P = 0 then
        begin
            Parts.Add(Trim(S));
            Break;
        end;
        Item := Trim(Copy(S, 1, P - 1));
        Parts.Add(Item);
        Delete(S, 1, P);
    end;
end;

function SchEditTryStrToFloatToken(const Token: String; var V: Double): Boolean;
var
    T: String;
begin
    Result := False;
    T := Trim(StringReplace(Token, ',', '.', MkSet(rfReplaceAll)));
    if T = '' then
        Exit;
    try
        V := StrToFloat(T);
        Result := True;
    except
        Result := False;
    end
end;

// Locale-safe mils formatter: always '.' as decimal separator, no trailing
// decimals for whole numbers ("1050", not "1050,5" on comma-locale systems).
function SchEditMilsToStr(V: Double): String;
var
    S: String;
begin
    S := FloatToStr(V);
    S := StringReplace(S, ',', '.', MkSet(rfReplaceAll));
    Result := S;
end;

// Locale-safe parser for values produced by SchEditMilsToStr.
function SchEditMilsFromStr(const S: String): Double;
var
    V: Double;
begin
    if not SchEditTryStrToFloatToken(S, V) then
        V := 0;
    Result := V;
end;

// ---------------------------------------------------------------------------
// Wire-endpoint snapping
//
// Script-created wires get NO auto-snap from Altium: a wire connects only if
// its endpoint EXACTLY equals a pin hotspot. Models make small coordinate
// errors, so add_wire / place_power_port absorb them server-side: endpoints
// within a tolerance (default 20 mil for wires, 25 for power ports) snap to
// the nearest snap target, and the ACTUAL drawn coordinates are reported back.
//
// Snap targets are the same objects the MCP instructions tell the model to
// aim at: visible pin hotspots (free end of each pin wire — identical math to
// SchEditGetComponentInfo) and power port locations (ISch_PowerObject read
// through the ISch_Label interface, the verified pattern from
// schematic_utils.pas SchSerializeDrawingObject).
// ---------------------------------------------------------------------------

// Line format: "<x_mils>|<y_mils>|<label>"
procedure SchEditCollectSnapTargets(SchDoc: ISch_Document; Targets: TStringList);
var
    CompIt, PinIt: ISch_Iterator;
    Comp: ISch_Component;
    Pin: ISch_Pin;
    PortIt: ISch_Iterator;
    Port: ISch_PowerObject;
    Lb: ISch_Label;
    PinHotX, PinHotY: Integer;
    Des: String;
begin
    CompIt := SchDoc.SchIterator_Create;
    CompIt.AddFilter_ObjectSet(MkSet(eSchComponent));
    Comp := CompIt.FirstSchObject;
    while Comp <> nil do
    begin
        Des := Trim(Comp.Designator.Text);
        PinIt := Comp.SchIterator_Create;
        PinIt.AddFilter_ObjectSet(MkSet(ePin));
        Pin := PinIt.FirstSchObject;
        while Pin <> nil do
        begin
            if not Pin.IsHidden then
            begin
                // Hotspot = Pin.Location + PinLength along Pin.Orientation
                // (identical to SchEditGetComponentInfo; verified against
                // Connectivity.pas / Form_AlignPins.pas).
                PinHotX := Pin.Location.X;
                PinHotY := Pin.Location.Y;
                case Pin.Orientation of
                    eRotate0:   PinHotX := PinHotX + Pin.PinLength;
                    eRotate90:  PinHotY := PinHotY + Pin.PinLength;
                    eRotate180: PinHotX := PinHotX - Pin.PinLength;
                    eRotate270: PinHotY := PinHotY - Pin.PinLength;
                end;
                Targets.Add(SchEditMilsToStr(CoordToMils(PinHotX)) + '|' +
                    SchEditMilsToStr(CoordToMils(PinHotY)) + '|' +
                    Des + '.' + Trim(Pin.Designator));
            end;
            Pin := PinIt.NextSchObject;
        end;
        Comp.SchIterator_Destroy(PinIt);
        Comp := CompIt.NextSchObject;
    end;
    SchDoc.SchIterator_Destroy(CompIt);

    PortIt := SchDoc.SchIterator_Create;
    PortIt.AddFilter_ObjectSet(MkSet(ePowerObject));
    Port := PortIt.FirstSchObject;
    while Port <> nil do
    begin
        Lb := Port;
        Targets.Add(SchEditMilsToStr(CoordToMils(Lb.Location.X)) + '|' +
            SchEditMilsToStr(CoordToMils(Lb.Location.Y)) + '|' +
            'port:' + Lb.Text);
        Port := PortIt.NextSchObject;
    end;
    SchDoc.SchIterator_Destroy(PortIt);
end;

function SchEditParseSnapTargetLine(const Line: String; var X, Y: Double; var Target: String): Boolean;
var
    P1, P2: Integer;
    XS, YS: String;
begin
    Result := False;
    P1 := Pos('|', Line);
    if P1 = 0 then
        Exit;
    P2 := Pos('|', Copy(Line, P1 + 1, Length(Line) - P1));
    if P2 = 0 then
        Exit;
    P2 := P1 + P2;
    XS := Copy(Line, 1, P1 - 1);
    YS := Copy(Line, P1 + 1, P2 - P1 - 1);
    Target := Copy(Line, P2 + 1, Length(Line) - P2);
    Result := SchEditTryStrToFloatToken(XS, X) and SchEditTryStrToFloatToken(YS, Y);
end;

// Nearest snap target within Tolerance (Euclidean, mils). True when found.
function SchEditNearestSnapTarget(Targets: TStringList; X, Y, Tolerance: Double;
    var SnapX, SnapY: Double; var Target: String): Boolean;
var
    i: Integer;
    TX, TY: Double;
    TName: String;
    D, BestD: Double;
begin
    Result := False;
    BestD := Tolerance;
    for i := 0 to Targets.Count - 1 do
    begin
        if not SchEditParseSnapTargetLine(Targets[i], TX, TY, TName) then
            Continue;
        D := Sqrt((TX - X) * (TX - X) + (TY - Y) * (TY - Y));
        if D <= BestD then
        begin
            BestD := D;
            SnapX := TX;
            SnapY := TY;
            Target := TName;
            Result := True;
        end;
    end;
end;

// Schematic wire/bus are polylines in modern AD; DelphiScript typelib often omits Corner.
// Pattern from Altium Scripting Gallery / AddWireStubsSch-Form.pas (PlaceASchWire).
procedure SchEditSetSchWireTwoVerticesMils(W: ISch_Wire; x1, y1, x2, y2: Double);
var
    P1, P2: TLocation;
begin
    P1 := Point(MilsToCoord(x1), MilsToCoord(y1));
    P2 := Point(MilsToCoord(x2), MilsToCoord(y2));
    W.Location := P1;
    W.InsertVertex := 1;
    W.SetState_Vertex(1, P1);
    W.InsertVertex := 2;
    W.SetState_Vertex(2, P2);
end;

procedure SchEditSetSchBusTwoVerticesMils(B: ISch_Bus; x1, y1, x2, y2: Double);
var
    P1, P2: TLocation;
begin
    P1 := Point(MilsToCoord(x1), MilsToCoord(y1));
    P2 := Point(MilsToCoord(x2), MilsToCoord(y2));
    B.Location := P1;
    B.InsertVertex := 1;
    B.SetState_Vertex(1, P1);
    B.InsertVertex := 2;
    B.SetState_Vertex(2, P2);
end;

// Bus entry is ISch_Line (two-point segment), not ISch_Wire polyline — see ISch_BusEntry / ISch_Line in Schematic API docs.
procedure SchEditSetSchBusEntryTwoVerticesMils(BE: ISch_BusEntry; x1, y1, x2, y2: Double);
var
    P1, P2: TLocation;
    Ln: ISch_Line;
begin
    P1 := Point(MilsToCoord(x1), MilsToCoord(y1));
    P2 := Point(MilsToCoord(x2), MilsToCoord(y2));
    Ln := BE;
    Ln.Location := P1;
    Ln.Corner := P2;
end;

// Shared orthogonal segments for eWire or eBus (same geometry as UI polylines).
//
// SERVER-SIDE ENDPOINT SNAPPING (see SchEditCollectSnapTargets): the polyline's
// FIRST and LAST points (its electrical terminals) snap to the nearest pin
// hotspot / power port location within SnapTolerance mils; interior bend
// points never snap (a bend landing on an unrelated pin would create an
// unintended connection). All non-snapped points are rounded to the 10-mil
// sheet grid. The response reports the exact drawn coordinates plus every
// snap applied, so callers can treat the output as ground truth.
function SchEditAddWireOrBusSegments(SchDoc: ISch_Document; const CSV: String; UseBus: Boolean;
    SnapTolerance: Double): String;
var
    Parts, Xs, Ys, Snaps, Props: TStringList;
    i, Count, PointCount, Segments: Integer;
    V, X1, Y1, X2, Y2: Double;
    SnapX, SnapY: Double;
    SnapTarget: String;
    PointsCsv: String;
    SnapProps: TStringList;
begin
    Parts := TStringList.Create;
    Xs := TStringList.Create;
    Ys := TStringList.Create;
    Snaps := TStringList.Create;
    try
        SchEditSplitCsvNumbers(CSV, Parts);
        Count := Parts.Count;
        if Count < 4 then
        begin
            Result := 'ERROR: WIRE_POINTS_NEED_AT_LEAST_FOUR_NUMBERS';
            Exit;
        end;
        if Count mod 2 <> 0 then
        begin
            Result := 'ERROR: WIRE_POINTS_ODD_COUNT';
            Exit;
        end;
        PointCount := Count div 2;

        for i := 0 to Count - 1 do
        begin
            if not SchEditTryStrToFloatToken(Parts[i], V) then
            begin
                Result := 'ERROR: WIRE_POINT_PARSE_FAILED';
                Exit;
            end;
            // Grid-round every incoming coordinate to 10 mils.
            V := Round(V / 10.0) * 10.0;
            if i mod 2 = 0 then
                Xs.Add(SchEditMilsToStr(V))
            else
                Ys.Add(SchEditMilsToStr(V));
        end;

        // Endpoint snapping (wires only; bus terminators connect via bus entries).
        if (not UseBus) and (SnapTolerance > 0) then
        begin
            for i := 0 to PointCount - 1 do
            begin
                if (i <> 0) and (i <> PointCount - 1) then
                    Continue; // interior bends never snap
                V := SchEditMilsFromStr(Xs[i]);
                Y1 := SchEditMilsFromStr(Ys[i]);
                if SchEditNearestSnapTargetFromDoc(SchDoc, V, Y1, SnapTolerance, SnapX, SnapY, SnapTarget) then
                begin
                    SnapProps := TStringList.Create;
                    try
                        AddJSONInteger(SnapProps, 'point', i);
                        AddJSONNumber(SnapProps, 'from_x', SchEditMilsFromStr(Xs[i]));
                        AddJSONNumber(SnapProps, 'from_y', SchEditMilsFromStr(Ys[i]));
                        AddJSONNumber(SnapProps, 'to_x', SnapX);
                        AddJSONNumber(SnapProps, 'to_y', SnapY);
                        AddJSONProperty(SnapProps, 'target', SnapTarget);
                        Snaps.Add(BuildJSONObject(SnapProps, 1));
                    finally
                        SnapProps.Free;
                    end;
                    Xs[i] := SchEditMilsToStr(SnapX);
                    Ys[i] := SchEditMilsToStr(SnapY);
                end;
            end;
        end;

        Segments := 0;
        PointsCsv := '';

        SchServer.ProcessControl.PreProcess(SchDoc, '');
        try
            i := 0;
            while i < PointCount - 1 do
            begin
                X1 := SchEditMilsFromStr(Xs[i]);
                Y1 := SchEditMilsFromStr(Ys[i]);
                X2 := SchEditMilsFromStr(Xs[i + 1]);
                Y2 := SchEditMilsFromStr(Ys[i + 1]);

                // Snap may collapse a micro-segment to zero length — skip it.
                if (Abs(X2 - X1) < 0.001) and (Abs(Y2 - Y1) < 0.001) then
                begin
                    i := i + 1;
                    Continue;
                end;

                if UseBus then
                    SchEditCreateBusSegment(SchDoc, X1, Y1, X2, Y2)
                else
                    SchEditCreateWireSegment(SchDoc, X1, Y1, X2, Y2);
                Inc(Segments);
                i := i + 1;
            end;

            SchDoc.GraphicallyInvalidate;
        finally
            SchServer.ProcessControl.PostProcess(SchDoc, '');
        end;

        for i := 0 to PointCount - 1 do
        begin
            if PointsCsv <> '' then
                PointsCsv := PointsCsv + ',';
            PointsCsv := PointsCsv + Xs[i] + ',' + Ys[i];
        end;

        Props := TStringList.Create;
        try
            AddJSONInteger(Props, 'segments', Segments);
            AddJSONNumber(Props, 'snap_tolerance_mils', SnapTolerance);
            AddJSONProperty(Props, 'points_csv', PointsCsv);
            Props.Add(BuildJSONArray(Snaps, 'snapped', 1));
            Result := BuildJSONObject(Props);
        finally
            Props.Free;
        end;
    finally
        Parts.Free;
        Xs.Free;
        Ys.Free;
        Snaps.Free;
    end;
end;

// Collect targets from SchDoc and find the nearest one to (X, Y).
function SchEditNearestSnapTargetFromDoc(SchDoc: ISch_Document; X, Y, Tolerance: Double;
    var SnapX, SnapY: Double; var Target: String): Boolean;
var
    Targets: TStringList;
begin
    Targets := TStringList.Create;
    try
        SchEditCollectSnapTargets(SchDoc, Targets);
        Result := SchEditNearestSnapTarget(Targets, X, Y, Tolerance, SnapX, SnapY, Target);
    finally
        Targets.Free;
    end;
end;

procedure SchEditCreateWireSegment(SchDoc: ISch_Document; X1, Y1, X2, Y2: Double);
var
    W: ISch_Wire;
begin
    W := SchServer.SchObjectFactory(eWire, eCreate_Default);
    if W = nil then
        Exit;
    SchEditSetSchWireTwoVerticesMils(W, X1, Y1, X2, Y2);
    SchDoc.RegisterSchObjectInContainer(W);
    SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, W.I_ObjectAddress);
end;

procedure SchEditCreateBusSegment(SchDoc: ISch_Document; X1, Y1, X2, Y2: Double);
var
    Bus: ISch_Bus;
begin
    Bus := SchServer.SchObjectFactory(eBus, eCreate_Default);
    if Bus = nil then
        Exit;
    SchEditSetSchBusTwoVerticesMils(Bus, X1, Y1, X2, Y2);
    SchDoc.RegisterSchObjectInContainer(Bus);
    SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, Bus.I_ObjectAddress);
end;

function SchEditAddWireSegments(SchDoc: ISch_Document; const CSV: String; SnapTolerance: Double): String;
begin
    Result := SchEditAddWireOrBusSegments(SchDoc, CSV, False, SnapTolerance);
end;

function SchEditAddBusSegments(SchDoc: ISch_Document; const CSV: String): String;
begin
    Result := SchEditAddWireOrBusSegments(SchDoc, CSV, True, 0);
end;

// ---------------------------------------------------------------------------
// draw_plan — batch execution for tool-driven drawing (wire_pins /
// optimize_layout). One bridge call applies, in order:
//   1. transforms_csv:  component moves/rotations ("DES;x;y;rot")
//   2. delete_wires_all: remove every wire AND junction on the sheet
//   3. wires_csv:       orthogonal wire polylines ("x1;y1;x2;y2;...")
//   4. junctions_csv:   junction dots ("x;y")
//
// Array items use SEMICOLONS internally: the line-based request parser
// (SchEditParseStringArray) strips every quote and comma from element lines,
// so commas cannot survive the round trip. The Node callers encode with ';'.
//
// Wire coordinates here are exact router output (pin hotspots read back from
// Altium) — deliberately NOT snapped and NOT grid-rounded, unlike add_wire
// which absorbs model coordinate noise.
// ---------------------------------------------------------------------------

procedure SchEditSplitSemi(const S: String; Fields: TStringList);
var
    Rest, Item: String;
    P: Integer;
begin
    Fields.Clear;
    Rest := Trim(S);
    while Rest <> '' do
    begin
        P := Pos(';', Rest);
        if P = 0 then
        begin
            Fields.Add(Trim(Rest));
            Break;
        end;
        Item := Copy(Rest, 1, P - 1);
        Fields.Add(Trim(Item));
        Delete(Rest, 1, P);
    end;
end;

function SchEditDrawPlan(SchDoc: ISch_Document; RequestData: TStringList): String;
var
    Transforms, Wires, Junctions, Fields: TStringList;
    i, j, PointCount, Segments, TransformsApplied, JunctionsDrawn: Integer;
    DelAll: Boolean;
    UseX, UseY, UseRot: Boolean;
    X, Y, Rot: Double;
    X1, Y1, X2, Y2: Double;
    Des, Inner: String;
    Props: TStringList;
begin
    Transforms := TStringList.Create;
    Wires := TStringList.Create;
    Junctions := TStringList.Create;
    Fields := TStringList.Create;
    try
        SchEditParseStringArray(RequestData, '"transforms_csv"', Transforms);
        SchEditParseStringArray(RequestData, '"wires_csv"', Wires);
        SchEditParseStringArray(RequestData, '"junctions_csv"', Junctions);
        DelAll := SchEditParseBoolWithDefault(RequestData, '"delete_wires_all"', False);

        if (Transforms.Count = 0) and (not DelAll) and (Wires.Count = 0) and (Junctions.Count = 0) then
        begin
            Result := 'ERROR: DRAW_PLAN_EMPTY: provide transforms_csv, delete_wires_all, wires_csv or junctions_csv';
            Exit;
        end;

        // 1. transforms
        TransformsApplied := 0;
        for i := 0 to Transforms.Count - 1 do
        begin
            SchEditSplitSemi(Transforms[i], Fields);
            if Fields.Count < 4 then
            begin
                Result := 'ERROR: DRAW_PLAN_TRANSFORM_LINE_NEEDS_DES_X_Y_ROT: ' + Transforms[i];
                Exit;
            end;
            Des := Fields[0];
            UseX := SchEditTryStrToFloatToken(Fields[1], X);
            UseY := SchEditTryStrToFloatToken(Fields[2], Y);
            UseRot := SchEditTryStrToFloatToken(Fields[3], Rot);
            if not UseX then
                X := 0;
            if not UseY then
                Y := 0;
            if not UseRot then
                Rot := 0;
            if (not UseX) and (not UseY) and (not UseRot) then
                Continue;
            Inner := SchEditSetComponentTransform(SchDoc, Des, X, Y, Rot, UseX, UseY, UseRot, False, False);
            if Pos('ERROR:', Inner) = 1 then
            begin
                Result := 'ERROR: DRAW_PLAN_TRANSFORM_FAILED (' + Transforms[i] + '): ' + Inner;
                Exit;
            end;
            Inc(TransformsApplied);
        end;

        // 2. delete all wires + junctions
        if DelAll then
        begin
            SchEditDeleteObjects(SchDoc, 'wire', '', False, False, 0, 0, False, 0, 0, 0, 0, True);
            SchEditDeleteObjects(SchDoc, 'junction', '', False, False, 0, 0, False, 0, 0, 0, 0, True);
        end;

        // 3. wires (exact coordinates — no snap, no grid rounding)
        Segments := 0;
        JunctionsDrawn := 0;
        SchServer.ProcessControl.PreProcess(SchDoc, '');
        try
            for i := 0 to Wires.Count - 1 do
            begin
                SchEditSplitSemi(Wires[i], Fields);
                if (Fields.Count < 4) or (Fields.Count mod 2 <> 0) then
                    Continue;
                PointCount := Fields.Count div 2;
                for j := 0 to PointCount - 2 do
                begin
                    if not SchEditTryStrToFloatToken(Fields[j * 2], X1) or
                       not SchEditTryStrToFloatToken(Fields[j * 2 + 1], Y1) or
                       not SchEditTryStrToFloatToken(Fields[j * 2 + 2], X2) or
                       not SchEditTryStrToFloatToken(Fields[j * 2 + 3], Y2) then
                        Continue;
                    if (Abs(X2 - X1) < 0.001) and (Abs(Y2 - Y1) < 0.001) then
                        Continue;
                    SchEditCreateWireSegment(SchDoc, X1, Y1, X2, Y2);
                    Inc(Segments);
                end;
            end;

            // 4. junctions
            for i := 0 to Junctions.Count - 1 do
            begin
                SchEditSplitSemi(Junctions[i], Fields);
                if Fields.Count < 2 then
                    Continue;
                if not SchEditTryStrToFloatToken(Fields[0], X) or
                   not SchEditTryStrToFloatToken(Fields[1], Y) then
                    Continue;
                SchEditCreateJunctionAt(SchDoc, X, Y);
                Inc(JunctionsDrawn);
            end;

            SchDoc.GraphicallyInvalidate;
        finally
            SchServer.ProcessControl.PostProcess(SchDoc, '');
        end;

        Props := TStringList.Create;
        try
            AddJSONInteger(Props, 'transforms_applied', TransformsApplied);
            AddJSONBoolean(Props, 'wires_deleted_all', DelAll);
            AddJSONInteger(Props, 'wire_segments_drawn', Segments);
            AddJSONInteger(Props, 'junctions_drawn', JunctionsDrawn);
            Result := BuildJSONObject(Props);
        finally
            Props.Free;
        end;
    finally
        Transforms.Free;
        Wires.Free;
        Junctions.Free;
        Fields.Free;
    end;
end;

// Single bus entry: one segment (four CSV numbers), TObjectId eBusEntry (diagonal stub).
function SchEditAddBusEntrySegment(SchDoc: ISch_Document; const CSV: String): String;
var
    Parts: TStringList;
    x1, y1, x2, y2: Double;
    BE: ISch_BusEntry;
    Props: TStringList;
begin
    Parts := TStringList.Create;
    try
        SchEditSplitCsvNumbers(CSV, Parts);
        if Parts.Count <> 4 then
        begin
            Result := 'ERROR: BUS_ENTRY_POINTS_NEED_EXACTLY_FOUR_NUMBERS';
            Exit;
        end;

        if not SchEditTryStrToFloatToken(Parts[0], x1) or
           not SchEditTryStrToFloatToken(Parts[1], y1) or
           not SchEditTryStrToFloatToken(Parts[2], x2) or
           not SchEditTryStrToFloatToken(Parts[3], y2) then
        begin
            Result := 'ERROR: BUS_ENTRY_POINT_PARSE_FAILED';
            Exit;
        end;

        SchServer.ProcessControl.PreProcess(SchDoc, '');
        try
            BE := SchServer.SchObjectFactory(eBusEntry, eCreate_Default);
            if BE = nil then
            begin
                Result := 'ERROR: FACTORY_BUS_ENTRY_FAILED';
                Exit;
            end;
            SchEditSetSchBusEntryTwoVerticesMils(BE, x1, y1, x2, y2);
            SchDoc.RegisterSchObjectInContainer(BE);
            SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, BE.I_ObjectAddress);
            SchDoc.GraphicallyInvalidate;
        finally
            SchServer.ProcessControl.PostProcess(SchDoc, '');
        end;

        Props := TStringList.Create;
        try
            AddJSONInteger(Props, 'segments', 1);
            Result := BuildJSONObject(Props);
        finally
            Props.Free;
        end;
    finally
        Parts.Free;
    end;
end;

// add_port — API ref: 02-Schematic_Server_API.md ePort section
function SchEditAddPort(SchDoc: ISch_Document; const PortName: String; X, Y, Rot: Double; const IOTypeStr, StyleStr: String): String;
var
    SchPort: ISch_Port;
    Props: TStringList;
begin
    Result := '';
    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        SchPort := SchServer.SchObjectFactory(ePort, eCreate_GlobalCopy);
        SchPort.Location := Point(MilsToCoord(X), MilsToCoord(Y));
        SchPort.Name := PortName;
        SchPort.Style := ePortRight;
        if (AnsiCompareText(StyleStr, 'ePortLeft') = 0) or (AnsiCompareText(StyleStr, 'left') = 0) then
            SchPort.Style := ePortLeft
        else if (AnsiCompareText(StyleStr, 'ePortRight') = 0) or (AnsiCompareText(StyleStr, 'right') = 0) then
            SchPort.Style := ePortRight
        else if (AnsiCompareText(StyleStr, 'eLeftRight') = 0) or (AnsiCompareText(StyleStr, 'leftright') = 0) then
            SchPort.Style := eLeftRight
        else if (AnsiCompareText(StyleStr, 'eNone') = 0) or (AnsiCompareText(StyleStr, 'none') = 0) then
            SchPort.Style := eNone;
        SchPort.IOType := ePortBidirectional;
        if (AnsiCompareText(IOTypeStr, 'ePortInput') = 0) or (AnsiCompareText(IOTypeStr, 'input') = 0) then
            SchPort.IOType := ePortInput
        else if (AnsiCompareText(IOTypeStr, 'ePortOutput') = 0) or (AnsiCompareText(IOTypeStr, 'output') = 0) then
            SchPort.IOType := ePortOutput
        else if (AnsiCompareText(IOTypeStr, 'ePortBidirectional') = 0) or (AnsiCompareText(IOTypeStr, 'bidirectional') = 0) then
            SchPort.IOType := ePortBidirectional
        else if (AnsiCompareText(IOTypeStr, 'ePortUnspecified') = 0) or (AnsiCompareText(IOTypeStr, 'unspecified') = 0) then
            SchPort.IOType := ePortUnspecified;
        SchPort.Alignment := eHorizontalCentreAlign;
        SchPort.Width := MilsToCoord(500);
        if Rot <> 0 then
            SchPort.Orientation := SchEditRotationFromDeg(Rot);
        SchDoc.RegisterSchObjectInContainer(SchPort);
        SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, SchPort.I_ObjectAddress);
        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'action', 'add_port');
        AddJSONProperty(Props, 'port_name', PortName);
        AddJSONNumber(Props, 'x_mils', X);
        AddJSONNumber(Props, 'y_mils', Y);
        AddJSONNumber(Props, 'rotation_deg', Rot);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

// add_junction — API ref: 02-Schematic_Server_API.md eJunction section
procedure SchEditCreateJunctionAt(SchDoc: ISch_Document; X, Y: Double);
var
    Junction: ISch_Junction;
begin
    Junction := SchServer.SchObjectFactory(eJunction, eCreate_GlobalCopy);
    if Junction = nil then
        Exit;
    Junction.Location := Point(MilsToCoord(X), MilsToCoord(Y));
    SchDoc.RegisterSchObjectInContainer(Junction);
    SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, Junction.I_ObjectAddress);
end;

function SchEditAddJunction(SchDoc: ISch_Document; X, Y: Double): String;
var
    Props: TStringList;
begin
    Result := '';
    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        SchEditCreateJunctionAt(SchDoc, X, Y);
        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'action', 'add_junction');
        AddJSONNumber(Props, 'x_mils', X);
        AddJSONNumber(Props, 'y_mils', Y);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

// add_line — Verified: CreateTableOfContentsForm.pas L240-L250
function SchEditAddLine(SchDoc: ISch_Document; X1, Y1, X2, Y2: Double): String;
var
    Line: ISch_Line;
    Props: TStringList;
begin
    Result := '';
    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        Line := SchServer.SchObjectFactory(eLine, eCreate_GlobalCopy);
        Line.LineStyle := eLineStyleSolid;
        Line.LineWidth := eMedium;
        Line.Color := $0000FF;
        Line.Location := Point(MilsToCoord(X1), MilsToCoord(Y1));
        Line.Corner := Point(MilsToCoord(X2), MilsToCoord(Y2));
        SchDoc.RegisterSchObjectInContainer(Line);
        SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, Line.I_ObjectAddress);
        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'action', 'add_line');
        AddJSONNumber(Props, 'x1_mils', X1);
        AddJSONNumber(Props, 'y1_mils', Y1);
        AddJSONNumber(Props, 'x2_mils', X2);
        AddJSONNumber(Props, 'y2_mils', Y2);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

// add_rectangle — API ref: 02-Schematic_Server_API.md eRectangle section
function SchEditAddRectangle(SchDoc: ISch_Document; X1, Y1, X2, Y2: Double; const IsSolidStr: String): String;
var
    Rect: ISch_Rectangle;
    Props: TStringList;
begin
    Result := '';
    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        Rect := SchServer.SchObjectFactory(eRectangle, eCreate_Default);
        Rect.Location := Point(MilsToCoord(X1), MilsToCoord(Y1));
        Rect.Corner := Point(MilsToCoord(X2), MilsToCoord(Y2));
        Rect.LineWidth := eMedium;
        Rect.Color := $0000FF;
        Rect.AreaColor := $FFFFFF;
        Rect.IsSolid := (AnsiCompareText(IsSolidStr, 'true') = 0) or (AnsiCompareText(IsSolidStr, '1') = 0);
        SchDoc.RegisterSchObjectInContainer(Rect);
        SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast, SCHM_PrimitiveRegistration, Rect.I_ObjectAddress);
        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'action', 'add_rectangle');
        AddJSONNumber(Props, 'x1_mils', X1);
        AddJSONNumber(Props, 'y1_mils', Y1);
        AddJSONNumber(Props, 'x2_mils', X2);
        AddJSONNumber(Props, 'y2_mils', Y2);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

// Delete schematic objects by type with an optional area filter.
// Verified references:
// - DeleteSchObjects.pas (official Altium sample, "Deleting Schematic Objects and
//   Updating the Undo System"): ProcessControl.PreProcess -> iterator with
//   AddFilter_ObjectSet -> RemoveSchObject + RobotManager SCHM_PrimitiveRegistration
//   message -> iterator destroy -> PostProcess -> GraphicallyInvalidate.
// - VendorTools.pas L990-L1056: AddFilter_Area(X1-1, Y1-1, X2+1, Y2+1) area-filtered
//   deletion of wires / net labels.
// - ReplaceSelectedComponent.PAS L52: component deletion via RemoveSchObject(Comp).
// - 02_SCH对象与API.md §4.4 对象删除: SchDoc.RemoveSchObject(ObjToDelete).
// Targeting: designator (component only) OR point (x/y, +/-25 mil box) OR area
// (x1/y1/x2/y2) OR delete_all=true (whole sheet, all objects of the type).
function SchEditDeleteObjects(SchDoc: ISch_Document; const ObjType: String;
    const Designator: String; UseX, UseY: Boolean; XMils, YMils: Double;
    UseArea: Boolean; X1M, Y1M, X2M, Y2M: Double; DeleteAll: Boolean): String;
var
    It: ISch_Iterator;
    Obj, NextObj: ISch_BasicContainer;
    Comp: ISch_Component;
    Deleted: Integer;
    Props: TStringList;
    T: String;
begin
    T := LowerCase(Trim(ObjType));
    if T = '' then
    begin
        Result := 'ERROR: OBJECT_TYPE_REQUIRED';
        Exit;
    end;

    if (not DeleteAll) and (Designator = '') and (not UseX) and (not UseY) and (not UseArea) then
    begin
        Result := 'ERROR: DELETE_TARGET_REQUIRED';
        Exit;
    end;

    Deleted := 0;
    SchServer.ProcessControl.PreProcess(SchDoc, '');
    try
        if (T = 'component') then
        begin
            if Designator = '' then
            begin
                Result := 'ERROR: DESIGNATOR_REQUIRED';
                Exit;
            end;
            Comp := SchEditFindComponent(SchDoc, Designator);
            if Comp = nil then
            begin
                Result := 'ERROR: COMPONENT_NOT_FOUND';
                Exit;
            end;
            SchDoc.RemoveSchObject(Comp);
            SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast,
                SCHM_PrimitiveRegistration, Comp.I_ObjectAddress);
            Deleted := 1;
        end
        else
        begin
            It := SchDoc.SchIterator_Create;
            if T = 'wire' then It.AddFilter_ObjectSet(MkSet(eWire))
            else if T = 'bus' then It.AddFilter_ObjectSet(MkSet(eBus))
            else if T = 'bus_entry' then It.AddFilter_ObjectSet(MkSet(eBusEntry))
            else if T = 'net_label' then It.AddFilter_ObjectSet(MkSet(eNetLabel))
            else if T = 'power_port' then It.AddFilter_ObjectSet(MkSet(ePowerObject))
            else if T = 'junction' then It.AddFilter_ObjectSet(MkSet(eJunction))
            else if T = 'port' then It.AddFilter_ObjectSet(MkSet(ePort))
            else if T = 'text' then It.AddFilter_ObjectSet(MkSet(eLabel))
            else if T = 'line' then It.AddFilter_ObjectSet(MkSet(eLine))
            else if T = 'rectangle' then It.AddFilter_ObjectSet(MkSet(eRectangle))
            else
            begin
                SchDoc.SchIterator_Destroy(It);
                Result := 'ERROR: OBJECT_TYPE_INVALID';
                Exit;
            end;

            if UseArea then
                It.AddFilter_Area(MilsToCoord(X1M), MilsToCoord(Y1M), MilsToCoord(X2M), MilsToCoord(Y2M))
            else if UseX and UseY then
                It.AddFilter_Area(MilsToCoord(XMils - 25), MilsToCoord(YMils - 25),
                    MilsToCoord(XMils + 25), MilsToCoord(YMils + 25));

            Obj := It.FirstSchObject;
            while Obj <> nil do
            begin
                NextObj := It.NextSchObject;
                SchDoc.RemoveSchObject(Obj);
                SchServer.RobotManager.SendMessage(SchDoc.I_ObjectAddress, c_BroadCast,
                    SCHM_PrimitiveRegistration, Obj.I_ObjectAddress);
                Deleted := Deleted + 1;
                Obj := NextObj;
            end;
            SchDoc.SchIterator_Destroy(It);
        end;

        SchDoc.GraphicallyInvalidate;
    finally
        SchServer.ProcessControl.PostProcess(SchDoc, '');
    end;

    Props := TStringList.Create;
    try
        AddJSONInteger(Props, 'deleted_count', Deleted);
        AddJSONProperty(Props, 'object_type', T);
        if Designator <> '' then
            AddJSONProperty(Props, 'designator', Designator);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

function SchematicEditMain(RequestData: TStringList): String;
var
    Action, ReportAction, SheetFilter, ProjectFullPath, SchematicFullPath: String;
    SheetPath: String;
    SchDoc: ISch_Document;
    Err: String;
    Designator, LibRef, SchLibPath, Txt, NetName, WireCSV, StyleStr: String;
    X, Y, Rot: Double;
    PowerSnapTol: Double;
    UseX, UseY, UseRot: Boolean;
    DX1, DY1, DX2, DY2: Double;
    DUse1, DUse2, DUse3, DUse4: Boolean;
    PStyle: TPowerObjectStyle;
    ShowNetBool: Boolean;
    MirrorBool: Boolean;
    UseMirror: Boolean;
    Names, Values: TStringList;
    Inner: String;
    Wrap: TStringList;
begin
    Result := '';
    Inner := '';

    try
    begin
    Action := SchEditParseStringAfterKey(RequestData, '"action"');
    if Action = '' then
    begin
        Result := 'ERROR: ACTION_REQUIRED';
        Exit;
    end;

    ReportAction := Action;
    if Action = 'place_wire' then
        Action := 'add_wire'
    else if Action = 'place_net_label' then
        Action := 'add_net_label';

    SheetFilter := SchEditParseStringAfterKey(RequestData, '"schematic_sheet_file_name"');
    ProjectFullPath := SchEditParseStringAfterKey(RequestData, '"project_full_path"');
    SchematicFullPath := SchEditParseStringAfterKey(RequestData, '"schematic_full_path"');

    Err := SchEditResolveSheet(ProjectFullPath, SchematicFullPath, SheetFilter, SheetPath, SchDoc);
    if Err <> '' then
    begin
        Result := Err;
        Exit;
    end;

    if Action = 'set_component_transform' then
    begin
        Designator := SchEditParseStringAfterKey(RequestData, '"designator"');
        if Designator = '' then
        begin
            Result := 'ERROR: DESIGNATOR_REQUIRED';
            Exit;
        end;
        X := SchEditParseFloatAfterKey(RequestData, '"x_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y_mils"', UseY);
        Rot := SchEditParseFloatAfterKey(RequestData, '"rotation_deg"', UseRot);
        MirrorBool := SchEditParseBoolWithDefault(RequestData, '"mirror_x"', False);
        UseMirror := SchEditMirrorKeyPresent(RequestData);
        Inner := SchEditSetComponentTransform(SchDoc, Designator, X, Y, Rot, UseX, UseY, UseRot, UseMirror, MirrorBool);
    end
    else if Action = 'set_component_parameters' then
    begin
        Designator := SchEditParseStringAfterKey(RequestData, '"designator"');
        if Designator = '' then
        begin
            Result := 'ERROR: DESIGNATOR_REQUIRED';
            Exit;
        end;
        Names := TStringList.Create;
        Values := TStringList.Create;
        try
            SchEditParseStringArray(RequestData, '"parameter_names"', Names);
            SchEditParseStringArray(RequestData, '"parameter_values"', Values);
            Inner := SchEditSetComponentParameters(SchDoc, Designator, Names, Values);
        finally
            Names.Free;
            Values.Free;
        end;
    end
    else if Action = 'place_component' then
    begin
        LibRef := SchEditParseStringAfterKey(RequestData, '"lib_reference"');
        Designator := SchEditParseStringAfterKey(RequestData, '"designator"');
        SchLibPath := SchEditParseStringAfterKey(RequestData, '"sch_library_path"');
        X := SchEditParseFloatAfterKey(RequestData, '"x_mils"', UseX);
        if not UseX then
            X := 0;
        Y := SchEditParseFloatAfterKey(RequestData, '"y_mils"', UseY);
        if not UseY then
            Y := 0;
        Rot := SchEditParseFloatAfterKey(RequestData, '"rotation_deg"', UseRot);
        if not UseRot then
            Rot := 0;
        Inner := SchEditPlaceComponent(SchDoc, SheetPath, LibRef, Designator, X, Y, Rot, SchLibPath);
    end
    else if Action = 'add_text' then
    begin
        Txt := SchEditParseStringAfterKey(RequestData, '"text"');
        X := SchEditParseFloatAfterKey(RequestData, '"x_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y_mils"', UseY);
        if not UseX or not UseY then
        begin
            Result := 'ERROR: X_Y_MILS_REQUIRED';
            Exit;
        end;
        Inner := SchEditAddText(SchDoc, Txt, X, Y);
    end
    else if Action = 'add_net_label' then
    begin
        NetName := SchEditParseStringAfterKey(RequestData, '"net_name"');
        X := SchEditParseFloatAfterKey(RequestData, '"x_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y_mils"', UseY);
        if not UseX or not UseY then
        begin
            Result := 'ERROR: X_Y_MILS_REQUIRED';
            Exit;
        end;
        Rot := SchEditParseFloatAfterKey(RequestData, '"rotation_deg"', UseRot);
        if not UseRot then
            Rot := 0;
        Inner := SchEditAddNetLabel(SchDoc, NetName, X, Y, Rot);
    end
    else if (Action = 'place_power_port') or (Action = 'place_gnd') or (Action = 'place_vcc') then
    begin
        StyleStr := SchEditParseStringAfterKey(RequestData, '"power_port_style"');
        X := SchEditParseFloatAfterKey(RequestData, '"x_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y_mils"', UseY);
        if not UseX or not UseY then
        begin
            Result := 'ERROR: X_Y_MILS_REQUIRED';
            Exit;
        end;
        Rot := SchEditParseFloatAfterKey(RequestData, '"rotation_deg"', UseRot);
        if not UseRot then
            Rot := 0;
        NetName := SchEditParseStringAfterKey(RequestData, '"net_name"');
        ShowNetBool := SchEditParseBoolWithDefault(RequestData, '"show_net_name"', True);

        // Power ports connect only at an exact point — snap to the nearest pin
        // hotspot / port within this tolerance (0 disables).
        PowerSnapTol := SchEditParseFloatAfterKey(RequestData, '"snap_tolerance_mils"', UseX);
        if (not UseX) or (PowerSnapTol < 0) then
            PowerSnapTol := 25;
        if PowerSnapTol > 60 then
            PowerSnapTol := 60;

        if Action = 'place_gnd' then
        begin
            if Trim(StyleStr) = '' then
                PStyle := ePowerGndPower
            else if not SchEditTryParsePowerPortStyle(StyleStr, PStyle) then
            begin
                Result := 'ERROR: POWER_PORT_STYLE_INVALID';
                Exit;
            end;
        end
        else if Action = 'place_vcc' then
        begin
            if Trim(StyleStr) = '' then
                PStyle := ePowerArrow
            else if not SchEditTryParsePowerPortStyle(StyleStr, PStyle) then
            begin
                Result := 'ERROR: POWER_PORT_STYLE_INVALID';
                Exit;
            end;
        end
        else
        begin
            if Trim(StyleStr) = '' then
            begin
                Result := 'ERROR: POWER_PORT_STYLE_REQUIRED';
                Exit;
            end;
            if not SchEditTryParsePowerPortStyle(StyleStr, PStyle) then
            begin
                Result := 'ERROR: POWER_PORT_STYLE_INVALID';
                Exit;
            end;
        end;

        Inner := SchEditPlacePowerPort(SchDoc, NetName, X, Y, Rot, PStyle, ShowNetBool, PowerSnapTol);
    end
    else if Action = 'draw_plan' then
    begin
        Inner := SchEditDrawPlan(SchDoc, RequestData);
    end
    else if Action = 'add_wire' then
    begin
        WireCSV := SchEditParseStringAfterKey(RequestData, '"wire_points_csv"');
        if WireCSV = '' then
        begin
            Result := 'ERROR: WIRE_POINTS_CSV_REQUIRED';
            Exit;
        end;
        X := SchEditParseFloatAfterKey(RequestData, '"snap_tolerance_mils"', UseX);
        if (not UseX) or (X < 0) then
            X := 20; // default snap tolerance: absorbs small model coordinate errors
        if X > 50 then
            X := 50;
        Inner := SchEditAddWireSegments(SchDoc, WireCSV, X);
    end
    else if Action = 'add_bus' then
    begin
        WireCSV := SchEditParseStringAfterKey(RequestData, '"wire_points_csv"');
        if WireCSV = '' then
        begin
            Result := 'ERROR: BUS_POINTS_CSV_REQUIRED';
            Exit;
        end;
        Inner := SchEditAddBusSegments(SchDoc, WireCSV);
    end
    else if Action = 'add_bus_entry' then
    begin
        WireCSV := SchEditParseStringAfterKey(RequestData, '"wire_points_csv"');
        if WireCSV = '' then
        begin
            Result := 'ERROR: BUS_ENTRY_POINTS_CSV_REQUIRED';
            Exit;
        end;
        Inner := SchEditAddBusEntrySegment(SchDoc, WireCSV);
    end
    else if Action = 'add_port' then
    begin
        NetName := SchEditParseStringAfterKey(RequestData, '"port_name"');
        if NetName = '' then
        begin
            Result := 'ERROR: PORT_NAME_REQUIRED';
            Exit;
        end;
        X := SchEditParseFloatAfterKey(RequestData, '"x_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y_mils"', UseY);
        if not (UseX and UseY) then
        begin
            Result := 'ERROR: X_Y_MILS_REQUIRED';
            Exit;
        end;
        Rot := SchEditParseFloatAfterKey(RequestData, '"rotation_deg"', UseRot);
        if not UseRot then Rot := 0;
        Txt := SchEditParseStringAfterKey(RequestData, '"io_type"');
        StyleStr := SchEditParseStringAfterKey(RequestData, '"style"');
        Inner := SchEditAddPort(SchDoc, NetName, X, Y, Rot, Txt, StyleStr);
    end
    else if Action = 'add_junction' then
    begin
        X := SchEditParseFloatAfterKey(RequestData, '"x_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y_mils"', UseY);
        if not (UseX and UseY) then
        begin
            Result := 'ERROR: X_Y_MILS_REQUIRED';
            Exit;
        end;
        Inner := SchEditAddJunction(SchDoc, X, Y);
    end
    else if Action = 'add_line' then
    begin
        X := SchEditParseFloatAfterKey(RequestData, '"x1_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y1_mils"', UseY);
        Rot := SchEditParseFloatAfterKey(RequestData, '"x2_mils"', UseRot);
        if not UseRot then Rot := 0;
        WireCSV := SchEditParseStringAfterKey(RequestData, '"y2_mils"');
        if WireCSV = '' then WireCSV := '0';
        Inner := SchEditAddLine(SchDoc, X, Y, Rot, StrToFloat(StringReplace(WireCSV, ',', '.', MkSet(rfReplaceAll))));
    end
    else if Action = 'add_rectangle' then
    begin
        X := SchEditParseFloatAfterKey(RequestData, '"x1_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y1_mils"', UseY);
        Rot := SchEditParseFloatAfterKey(RequestData, '"x2_mils"', UseRot);
        if not UseRot then Rot := 0;
        WireCSV := SchEditParseStringAfterKey(RequestData, '"y2_mils"');
        if WireCSV = '' then WireCSV := '0';
        StyleStr := SchEditParseStringAfterKey(RequestData, '"is_solid"');
        Inner := SchEditAddRectangle(SchDoc, X, Y, Rot, StrToFloat(StringReplace(WireCSV, ',', '.', MkSet(rfReplaceAll))), StyleStr);
    end
    else if Action = 'delete_object' then
    begin
        StyleStr := SchEditParseStringAfterKey(RequestData, '"object_type"');
        Designator := SchEditParseStringAfterKey(RequestData, '"designator"');
        X := SchEditParseFloatAfterKey(RequestData, '"x_mils"', UseX);
        Y := SchEditParseFloatAfterKey(RequestData, '"y_mils"', UseY);
        DX1 := SchEditParseFloatAfterKey(RequestData, '"x1_mils"', DUse1);
        DY1 := SchEditParseFloatAfterKey(RequestData, '"y1_mils"', DUse2);
        DX2 := SchEditParseFloatAfterKey(RequestData, '"x2_mils"', DUse3);
        DY2 := SchEditParseFloatAfterKey(RequestData, '"y2_mils"', DUse4);
        NetName := SchEditParseStringAfterKey(RequestData, '"delete_all"');
        Inner := SchEditDeleteObjects(SchDoc, StyleStr, Designator,
            UseX, UseY, X, Y,
            DUse1 and DUse2 and DUse3 and DUse4, DX1, DY1, DX2, DY2,
            (NetName = 'true') or (NetName = '1'));
    end
    else if Action = 'get_component_info' then
    begin
        NetName := SchEditParseStringAfterKey(RequestData, '"designator"');
        if NetName = '' then
        begin
            Result := 'ERROR: DESIGNATOR_REQUIRED';
            Exit;
        end;
        Inner := SchEditGetComponentInfo(SchDoc, NetName);
    end
    else
    begin
        Result := 'ERROR: UNKNOWN_ACTION';
        Exit;
    end;

    if Pos('ERROR:', Inner) = 1 then
    begin
        Result := Inner;
        Exit;
    end;

    Wrap := TStringList.Create;
    try
        AddJSONProperty(Wrap, 'action', ReportAction);
        AddJSONProperty(Wrap, 'sheet', SheetPath);
        Wrap.Add('"details": ' + Inner);
        Result := BuildJSONObject(Wrap);
    finally
        Wrap.Free;
    end;
    end;

    except
        Result := 'ERROR: SCHEMATIC_EDIT_EXCEPTION';
    end;
end;

// Get detailed component info from schematic — read component parameters
// Verified: ISch_Component + ISch_Parameter from 02-Schematic_Server_API.md
// Iterator pattern: Doc.SchIterator_Create + MkSet(eComponent) + Component.SchIterator_Create for params
function SchEditGetComponentInfo(SchDoc: ISch_Document; const Designator: String): String;
var
    Iterator: ISch_Iterator;
    Comp: ISch_Component;
    Param: ISch_Parameter;
    ParamIter: ISch_Iterator;
    Pin: ISch_Pin;
    PinIter: ISch_Iterator;
    Found: Boolean;
    ResultProps: TStringList;
    ParamsArray: TStringList;
    ParamProps: TStringList;
    PinsArray: TStringList;
    PinProps: TStringList;
    PinCount: Integer;
    PinHotX, PinHotY: Integer;
    PinOrientDeg: String;
    DesigStr: String;
begin
    Result := '';
    Found := False;

    Iterator := SchDoc.SchIterator_Create;
    Iterator.AddFilter_ObjectSet(MkSet(eSchComponent));
    Comp := Iterator.FirstSchObject;
    while Comp <> nil do
    begin
        DesigStr := Comp.Designator.Text;
        if AnsiCompareText(Trim(DesigStr), Trim(Designator)) = 0 then
        begin
            Found := True;
            Break;
        end;
        Comp := Iterator.NextSchObject;
    end;
    SchDoc.SchIterator_Destroy(Iterator);

    if not Found then
    begin
        Result := '{"success":false,"error":"Component not found: ' + Designator + '"}';
        Exit;
    end;

    ResultProps := TStringList.Create;
    ParamsArray := TStringList.Create;
    PinsArray := TStringList.Create;
    try
        DesigStr := Comp.Designator.Text;
        AddJSONProperty(ResultProps, 'designator', DesigStr);
        AddJSONProperty(ResultProps, 'comment', Comp.Comment.CalculatedValueString);
        AddJSONProperty(ResultProps, 'description', Comp.ComponentDescription);
        AddJSONProperty(ResultProps, 'lib_reference', Comp.LibReference);

        // Read component orientation (string form — DelphiScript has no
        // Integer() cast for enum values)
        case Comp.Orientation of
            0: AddJSONProperty(ResultProps, 'orientation', 'eRotate0');
            1: AddJSONProperty(ResultProps, 'orientation', 'eRotate90');
            2: AddJSONProperty(ResultProps, 'orientation', 'eRotate180');
            3: AddJSONProperty(ResultProps, 'orientation', 'eRotate270');
        else
            AddJSONProperty(ResultProps, 'orientation', 'eRotate0');
        end;
        AddJSONBoolean(ResultProps, 'is_mirrored', Comp.IsMirrored);
        AddJSONNumber(ResultProps, 'location_x_mils', CoordToMils(Comp.Location.X));
        AddJSONNumber(ResultProps, 'location_y_mils', CoordToMils(Comp.Location.Y));

        // Read parameters using child iterator
        ParamIter := Comp.SchIterator_Create;
        ParamIter.AddFilter_ObjectSet(MkSet(eParameter));
        Param := ParamIter.FirstSchObject;
        while Param <> nil do
        begin
            ParamProps := TStringList.Create;
            try
                AddJSONProperty(ParamProps, 'name', Param.Name);
                AddJSONProperty(ParamProps, 'text', Param.Text);
                AddJSONBoolean(ParamProps, 'is_hidden', Param.IsHidden);
                ParamsArray.Add(BuildJSONObject(ParamProps, 1));
            finally
                ParamProps.Free;
            end;
            Param := ParamIter.NextSchObject;
        end;
        Comp.SchIterator_Destroy(ParamIter);
        ResultProps.Add(BuildJSONArray(ParamsArray, 'parameters', 1));

        // Read pins using child iterator.
        // PIN ELECTRICAL HOTSPOT COMPUTATION (critical for wiring):
        // Pin.Location is the BODY-side end of the pin line. The electrical
        // connection point is the pin's FREE end (where wires must land),
        // offset by Pin.Length along Pin.Orientation (orientation = direction
        // pointing OUTWARD from the component body).
        // Verified: Form_AlignPins.pas (left-side pins get eRotate180),
        // Connectivity.pas L44-L47 (outward offsets along orientation), and
        // empirical testing in AD (wires at Pin.Location do not connect).
        PinCount := 0;
        PinIter := Comp.SchIterator_Create;
        PinIter.AddFilter_ObjectSet(MkSet(ePin));
        Pin := PinIter.FirstSchObject;
        while Pin <> nil do
        begin
            PinProps := TStringList.Create;
            try
                PinHotX := Pin.Location.X;
                PinHotY := Pin.Location.Y;
                // ISch_Pin property is PinLength (NOT Length — the API doc
                // 02-Schematic_Server_API.md "Pin.Length" is a typo; verified
                // via RotateSymbol.pas L173-L182 and VendorTools.pas L961-L985).
                case Pin.Orientation of
                    eRotate0:   PinHotX := PinHotX + Pin.PinLength;
                    eRotate90:  PinHotY := PinHotY + Pin.PinLength;
                    eRotate180: PinHotX := PinHotX - Pin.PinLength;
                    eRotate270: PinHotY := PinHotY - Pin.PinLength;
                end;

                AddJSONProperty(PinProps, 'name', Pin.Name);
                AddJSONProperty(PinProps, 'designator', Pin.Designator);
                AddJSONProperty(PinProps, 'electrical_type', Pin.Electrical);
                AddJSONBoolean(PinProps, 'is_hidden', Pin.IsHidden);
                AddJSONNumber(PinProps, 'x_mils', CoordToMils(PinHotX));
                AddJSONNumber(PinProps, 'y_mils', CoordToMils(PinHotY));
                AddJSONNumber(PinProps, 'pin_length_mils', CoordToMils(Pin.PinLength));
                // DelphiScript has no Integer() cast — map orientation to a
                // string via case, matching the pattern in schematic_utils.pas.
                case Pin.Orientation of
                    eRotate0:   PinOrientDeg := '0';
                    eRotate90:  PinOrientDeg := '90';
                    eRotate180: PinOrientDeg := '180';
                    eRotate270: PinOrientDeg := '270';
                    else PinOrientDeg := '0';
                end;
                AddJSONProperty(PinProps, 'orientation_deg', PinOrientDeg);
                PinsArray.Add(BuildJSONObject(PinProps, 1));
            finally
                PinProps.Free;
            end;
            PinCount := PinCount + 1;
            Pin := PinIter.NextSchObject;
        end;
        Comp.SchIterator_Destroy(PinIter);

        AddJSONInteger(ResultProps, 'pin_count', PinCount);
        ResultProps.Add(BuildJSONArray(PinsArray, 'pins', 1));
        Result := BuildJSONObject(ResultProps);
    finally
        ResultProps.Free;
        ParamsArray.Free;
        PinsArray.Free;
    end;
end;
