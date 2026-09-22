// altium_bridge.pas
// This script acts as a bridge between the MCP server and Altium
// It reads commands from a request JSON file, executes them, and writes results to a response JSON file

const
	constScriptProjectName = 'Altium_API'; // Define the script project name
    REPLACEALL = 1;

// #region Feature flags — set to True to re-enable write operations.
// Schematic/PCB writes re-enabled after code audit against reference libraries:
// - schematic_edit.pas: removed PlaceSchComponent, fixed Designator.Location variant chain,
//   added ProcessControl/RobotManager transactions (verified: RotateSymbol.pas, IncrementDesignators.pas)
// - pcb_utils.pas: replaced GetPcbComponentByRefDes with iterator+Name.Text (verified: DesignReuse.pas)
// - pcb_layout_duplicator.pas: replaced Layer_V6 write, GetNetByName, ConnectivelyValidateNets
//   with verified API patterns (DesignReuse.pas, FixConnections.pas, Distribute.pas)
    ENABLE_SCHEMATIC_WRITES = True;  // schematic_edit (place/move/wire/... on .SchDoc)
    ENABLE_PCB_WRITES = True;         // set_component_position, move_components, create_net_class, set_pcb_layer_visibility, layout_duplicator_apply
    ENABLE_SYMBOL_CREATION = False;   // create_schematic_symbol (not yet audited)
// #endregion
var
    RequestData : TStringList;
    ResponseData : TStringList;
    Params : TStringList;
	REQUEST_FILE : String;
    RESPONSE_FILE : String;
    ROOT_DIR: String;
    BRIDGE_ERROR_LOG: String;

{..............................................................................}
{ Initialize file paths based on script location                               }
{..............................................................................}
procedure InitializeFilePaths();
var
    ScriptPath: String;
    Workspace: IWorkspace;
begin
    // Get the current workspace
    Workspace := GetWorkspace;
    
    // Get the script project path
    ScriptPath := ScriptProjectPath(Workspace);
    
    // Go back one directory from the script path
    ROOT_DIR := ExtractFilePath(ExtractFilePath(ScriptPath));
    
    // Set the file paths
    REQUEST_FILE := ROOT_DIR + 'request.json';
    RESPONSE_FILE := ROOT_DIR + 'response.json';
    BRIDGE_ERROR_LOG := ROOT_DIR + 'bridge_last_error.txt';
end;

procedure BridgeWriteErrorLog(const Msg: String);
var
    F: TStringList;
begin
    if BRIDGE_ERROR_LOG = '' then
        Exit;
    F := TStringList.Create;
    try
        F.Add(Msg);
        F.SaveToFile(BRIDGE_ERROR_LOG);
    finally
        F.Free;
    end;
end;

// Extract the component pins logic
function ExecuteGetComponentPins(RequestData: TStringList): String;
var
    ParamValue: String;
    i: Integer;
    DesignatorsList: TStringList;
begin
    DesignatorsList := TStringList.Create;
    try
        // Look through all the RequestData lines to find designators
        for i := 0 to RequestData.Count - 1 do
        begin
            if (Pos('"designators"', RequestData[i]) > 0) then
            begin
                // Found the designators parameter
                // Parse the array in the next lines
                i := i + 1; // Move to the next line (should be '[')
                
                while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
                begin
                    // This is an array element
                    // Extract the designator value
                    ParamValue := RequestData[i];
                    ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                    ParamValue := StringReplace(ParamValue, ',', '', REPLACEALL);
                    ParamValue := Trim(ParamValue);
                    
                    if (ParamValue <> '') and (ParamValue <> '[') then
                        DesignatorsList.Add(ParamValue);
                    
                    i := i + 1;
                end;
                
                break;
            end;
        end;
        
        if DesignatorsList.Count > 0 then
        begin
            Result := GetComponentPinsFromList(ROOT_DIR, DesignatorsList);
        end
        else
        begin
            Result := '{"success":false,"error":"No designators found for get_component_pins"}';
        end;
    finally
        DesignatorsList.Free;
    end;
end;

// Extract the create net class logic
function ExecuteCreateNetClass(RequestData: TStringList): String;
var
    ParamValue: String;
    i, ValueStart: Integer;
    ComponentName: String;
    SourceList: TStringList;
begin
    ComponentName := '';
    SourceList := TStringList.Create;
    
    try
        // Parse parameters from the request
        for i := 0 to RequestData.Count - 1 do
        begin
            // Look for class_name
            if (Pos('"class_name"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ComponentName := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ComponentName := TrimJSON(ComponentName);
            end
            // Look for net_names array
            else if (Pos('"net_names"', RequestData[i]) > 0) then
            begin
                // Parse the array in the next lines
                i := i + 1; // Move to the next line (should be '[')
                
                while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
                begin
                    // Extract the net name
                    ParamValue := RequestData[i];
                    ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                    ParamValue := StringReplace(ParamValue, ',', '', REPLACEALL);
                    ParamValue := Trim(ParamValue);
                    
                    if (ParamValue <> '') and (ParamValue <> '[') then
                        SourceList.Add(ParamValue);
                    
                    i := i + 1;
                end;
            end;
        end;
        
        if (ComponentName <> '') and (SourceList.Count > 0) then
        begin
            Result := CreateNetClass(ComponentName, SourceList);
        end
        else
        begin
            if ComponentName = '' then
                Result := '{"success": false, "error": "No class name provided"}'
            else
                Result := '{"success": false, "error": "No net names provided"}';
        end;
    finally
        SourceList.Free;
    end;
end;

// Extract the take view screenshot logic
function ExecuteTakeViewScreenshot(RequestData: TStringList): String;
var
    ParamValue: String;
    i, ValueStart: Integer;
    ViewType: String;
begin
    // Extract the view type parameter
    ViewType := 'pcb';  // Default to PCB
    
    // Parse parameters from the request
    for i := 0 to RequestData.Count - 1 do
    begin
        // Look for view_type parameter
        if (Pos('"view_type"', RequestData[i]) > 0) then
        begin
            ValueStart := Pos(':', RequestData[i]) + 1;
            ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
            ParamValue := TrimJSON(ParamValue);
            ViewType := ParamValue;
            Break;
        end;
    end;
    
    Result := TakeViewScreenshot(ViewType);
end;

// Extract the create schematic symbol logic
function ExecuteCreateSchematicSymbol(RequestData: TStringList): String;
var
    ParamValue: String;
    i, ValueStart: Integer;
    ComponentName: String;
    PartCount: Integer;
    PinsList: TStringList;
begin
    // Look for component name
    ComponentName := '';
    PartCount := 1;  // Default to single-part symbol
    PinsList := TStringList.Create;

    try
        // Parse parameters from the request
        for i := 0 to RequestData.Count - 1 do
        begin
            // Look for component name
            if (Pos('"symbol_name"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ComponentName := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ComponentName := TrimJSON(ComponentName);
            end
            // Look for part_count
            else if (Pos('"part_count"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                PartCount := StrToInt(ParamValue);
            end
            // Look for pins array
            else if (Pos('"pins"', RequestData[i]) > 0) then
            begin
                // Parse the array in the next lines
                i := i + 1; // Move to the next line (should be '[')

                while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
                begin
                    // Extract the pin data
                    ParamValue := RequestData[i];
                    ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                    ParamValue := StringReplace(ParamValue, ',', '', REPLACEALL);
                    ParamValue := Trim(ParamValue);
                    // Unescape JSON backslashes (e.g. \\ -> \ for Altium overbar notation)
                    ParamValue := StringReplace(ParamValue, '\\', '\', REPLACEALL);

                    if (ParamValue <> '') and (ParamValue <> '[') then
                        PinsList.Add(ParamValue);

                    i := i + 1;
                end;
            end
            // Look for description
            else if (Pos('"description"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                PinsList.Add('Description=' + ParamValue);
            end;
        end;

        if ComponentName <> '' then
        begin
            Result := CreateSchematicSymbol(ComponentName, PinsList, PartCount);
        end
        else
        begin
            Result := '{"success":false,"error":"No component name provided"}';
        end;
    finally
        PinsList.Free;
    end;
end;

// Extract the set PCB layer visibility logic
function ExecuteSetPCBLayerVisibility(RequestData: TStringList): String;
var
    ParamValue: String;
    i, ValueStart: Integer;
    SourceList: TStringList;
    Visible: Boolean;
begin
    // Create a stringlist for layer names and extract the visible parameter
    SourceList := TStringList.Create;
    Visible := False;
    
    try
        // Parse parameters from the request
        for i := 0 to RequestData.Count - 1 do
        begin
            // Look for layer_names array
            if (Pos('"layer_names"', RequestData[i]) > 0) then
            begin
                // Parse the array in the next lines
                i := i + 1; // Move to the next line (should be '[')
                
                while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
                begin
                    // Extract the layer name
                    ParamValue := RequestData[i];
                    ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                    ParamValue := StringReplace(ParamValue, ',', '', REPLACEALL);
                    ParamValue := Trim(ParamValue);
                    
                    if (ParamValue <> '') and (ParamValue <> '[') then
                        SourceList.Add(ParamValue);
                    
                    i := i + 1;
                end;
            end
            // Look for visible parameter
            else if (Pos('"visible"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                Visible := (ParamValue = 'true');
            end;
        end;
        
        if SourceList.Count > 0 then
        begin
            Result := SetPCBLayerVisibility(SourceList, Visible);
        end
        else
        begin
            Result := '{"success": false, "error": "No layer names provided"}';
        end;
    finally
        SourceList.Free;
    end;
end;

// Extract the set component position logic
function ExecuteSetComponentPosition(RequestData: TStringList): String;
var
    ParamValue: String;
    i, ValueStart: Integer;
    Designator: String;
    NewX, NewY: Float;
    Rotation: Float;
begin
    Designator := '';
    NewX := 0;
    NewY := 0;
    Rotation := -1;  // Default -1 means keep current rotation
    
    try
        // Parse parameters from the request
        for i := 0 to RequestData.Count - 1 do
        begin
            // Look for designator
            if (Pos('"designator"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                Designator := Trim(ParamValue);
            end
            // Look for x
            else if (Pos('"x"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                NewX := StrToFloat(StringReplace(ParamValue, ',', '.', MkSet(rfReplaceAll)));
            end
            // Look for y
            else if (Pos('"y"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                NewY := StrToFloat(StringReplace(ParamValue, ',', '.', MkSet(rfReplaceAll)));
            end
            // Look for rotation
            else if (Pos('"rotation"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                Rotation := StrToFloat(StringReplace(ParamValue, ',', '.', MkSet(rfReplaceAll)));
            end;
        end;

        if Designator <> '' then
        begin
            Result := SetComponentPosition(Designator, NewX, NewY, Rotation);
        end
        else
        begin
            Result := '{"success":false,"error":"No designator found for set_component_position"}';
        end;
    finally
    end;
end;

// Extract the move components logic
function ExecuteMoveComponents(RequestData: TStringList): String;
var
    ParamValue: String;
    i, ValueStart: Integer;
    DesignatorsList: TStringList;
    XOffset, YOffset: Integer;
    Rotation: Float;
begin
    // For this command, we need to extract the designators array and the offset values
    DesignatorsList := TStringList.Create;
    XOffset := 0;
    YOffset := 0;
    Rotation := 0;  // Default rotation is 0 (no change)
    
    try
        // Parse parameters from the request
        for i := 0 to RequestData.Count - 1 do
        begin
            // Look for designators array
            if (Pos('"designators"', RequestData[i]) > 0) then
            begin
                // Parse the array in the next lines
                i := i + 1; // Move to the next line (should be '[')
                
                while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
                begin
                    // Extract the designator value
                    ParamValue := RequestData[i];
                    ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                    ParamValue := StringReplace(ParamValue, ',', '', REPLACEALL);
                    ParamValue := Trim(ParamValue);
                    
                    if (ParamValue <> '') and (ParamValue <> '[') then
                        DesignatorsList.Add(ParamValue);
                    
                    i := i + 1;
                end;
            end
            // Look for x_offset
            else if (Pos('"x_offset"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                XOffset := MilsToCoord(StrToFloat(StringReplace(ParamValue, ',', '.', MkSet(rfReplaceAll))));
            end
            // Look for y_offset
            else if (Pos('"y_offset"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                YOffset := MilsToCoord(StrToFloat(StringReplace(ParamValue, ',', '.', MkSet(rfReplaceAll))));
            end
            // Look for rotation
            else if (Pos('"rotation"', RequestData[i]) > 0) then
            begin
                ValueStart := Pos(':', RequestData[i]) + 1;
                ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
                ParamValue := TrimJSON(ParamValue);
                Rotation := StrToFloat(StringReplace(ParamValue, ',', '.', MkSet(rfReplaceAll)));
            end;
        end;

        if DesignatorsList.Count > 0 then
        begin
            Result := MoveComponentsByDesignators(DesignatorsList, XOffset, YOffset, Rotation);
        end
        else
        begin
            Result := '{"success":false,"error":"No designators found for move_components"}';
        end;
    finally
        DesignatorsList.Free;
    end;
end;

// Extract the layout duplicator apply logic
function ExecuteLayoutDuplicatorApply(RequestData: TStringList): String;
var
    ParamValue: String;
    i: Integer;
    SourceList, DestList: TStringList;
begin
    // For this command, we need to extract the source and destination lists
    SourceList := TStringList.Create;
    DestList := TStringList.Create;
    
    try
        // Parse parameters from the request
        for i := 0 to RequestData.Count - 1 do
        begin
            // Look for source designators array
            if (Pos('"source_designators"', RequestData[i]) > 0) then
            begin
                // Parse the array in the next lines
                i := i + 1; // Move to the next line (should be '[')
                
                while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
                begin
                    // Extract the designator value
                    ParamValue := RequestData[i];
                    ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                    ParamValue := StringReplace(ParamValue, ',', '', REPLACEALL);
                    ParamValue := Trim(ParamValue);
                    
                    if (ParamValue <> '') and (ParamValue <> '[') then
                        SourceList.Add(ParamValue);
                    
                    i := i + 1;
                end;
            end
            // Look for destination designators array
            else if (Pos('"destination_designators"', RequestData[i]) > 0) then
            begin
                // Parse the array in the next lines
                i := i + 1; // Move to the next line (should be '[')
                
                while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
                begin
                    // Extract the designator value
                    ParamValue := RequestData[i];
                    ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                    ParamValue := StringReplace(ParamValue, ',', '', REPLACEALL);
                    ParamValue := Trim(ParamValue);
                    
                    if (ParamValue <> '') and (ParamValue <> '[') then
                        DestList.Add(ParamValue);
                    
                    i := i + 1;
                end;
            end
        end;
        
        if (SourceList.Count > 0) and (DestList.Count > 0) then
        begin
            Result := ApplyLayoutDuplicator(SourceList, DestList);
        end
        else
        begin
            Result := '{"success": false, "error": "Source or destination lists are empty"}';
        end;
    finally
        SourceList.Free;
        DestList.Free;
    end;
end;

// Function to execute get output job containers
function ExecuteGetOutputJobContainers(RequestData: TStringList): String;
var
    ParamValue: String;
    i: Integer;
    OutJobPath: String;
begin
    OutJobPath := '';
    
    // Parse parameters from the request
    for i := 0 to RequestData.Count - 1 do
    begin
        if (Pos('"outjob_path"', RequestData[i]) > 0) then
        begin
            // Found the outjob_path parameter
            ParamValue := Copy(RequestData[i], Pos(':', RequestData[i]) + 1, Length(RequestData[i]));
            ParamValue := TrimJSON(ParamValue);
            OutJobPath := ParamValue;
            break;
        end;
    end;
    
    // Call the appropriate function
    Result := GetOutputJobContainers(ROOT_DIR);
end;

// Function to execute run output jobs
function ExecuteRunOutputJobs(RequestData: TStringList): String;
var
    ParamValue: String;
    i: Integer;
    ContainersList: TStringList;
begin
    ContainersList := TStringList.Create;
    
    try
        // Parse parameters from the request
        for i := 0 to RequestData.Count - 1 do
        begin
            if (Pos('"container_names"', RequestData[i]) > 0) then
            begin
                // Parse the array in the next lines
                i := i + 1; // Move to the next line (should be '[')
                
                while (i < RequestData.Count) and (Pos(']', RequestData[i]) = 0) do
                begin
                    // Extract the container name
                    ParamValue := RequestData[i];
                    ParamValue := StringReplace(ParamValue, '"', '', REPLACEALL);
                    ParamValue := StringReplace(ParamValue, ',', '', REPLACEALL);
                    ParamValue := Trim(ParamValue);
                    
                    if (ParamValue <> '') and (ParamValue <> '[') then
                        ContainersList.Add(ParamValue);
                    
                    i := i + 1;
                end;
            end;
        end;
        
        if ContainersList.Count > 0 then
        begin
            Result := RunOutputJobs(ContainersList, ROOT_DIR);
        end
        else
        begin
            Result := '{"success": false, "error": "No container names specified"}';
        end;
    finally
        ContainersList.Free;
    end;
end;

// Extract the search library symbol logic
function ExecuteSearchLibrarySymbol(RequestData: TStringList): String;
var
    ParamValue: String;
    i, ValueStart: Integer;
    LibraryPath: String;
    SymbolName: String;
begin
    LibraryPath := '';
    SymbolName := '';

    // Parse parameters from the request
    for i := 0 to RequestData.Count - 1 do
    begin
        // Look for library_path
        if (Pos('"library_path"', RequestData[i]) > 0) then
        begin
            ValueStart := Pos(':', RequestData[i]) + 1;
            ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
            ParamValue := TrimJSON(ParamValue);
            LibraryPath := ParamValue;
        end
        // Look for symbol_name
        else if (Pos('"symbol_name"', RequestData[i]) > 0) then
        begin
            ValueStart := Pos(':', RequestData[i]) + 1;
            ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
            ParamValue := TrimJSON(ParamValue);
            SymbolName := ParamValue;
        end;
    end;

    if SymbolName <> '' then
    begin
        Result := SearchLibrarySymbol(ROOT_DIR, LibraryPath, SymbolName);
    end
    else
    begin
        Result := 'ERROR: No symbol name provided for search_library_symbol';
    end;
end;

// Extract the library_path parameter and enumerate all components in a single .SchLib.
// Used by import_library_components MCP tool to cache a library catalog into memory.
function ExecuteListLibraryComponents(RequestData: TStringList): String;
var
    ParamValue: String;
    i, ValueStart: Integer;
    LibraryPath: String;
begin
    LibraryPath := '';

    // Parse parameters from the request
    for i := 0 to RequestData.Count - 1 do
    begin
        // Look for library_path
        if (Pos('"library_path"', RequestData[i]) > 0) then
        begin
            ValueStart := Pos(':', RequestData[i]) + 1;
            ParamValue := Copy(RequestData[i], ValueStart, Length(RequestData[i]) - ValueStart + 1);
            ParamValue := TrimJSON(ParamValue);
            LibraryPath := ParamValue;
        end;
    end;

    if LibraryPath <> '' then
    begin
        Result := ListLibraryComponents(ROOT_DIR, LibraryPath);
    end
    else
    begin
        Result := 'ERROR: No library_path provided for list_library_components';
    end;
end;

function ExecuteGetSchematicData(RequestData: TStringList): String;
var
    i: Integer;
    Line: String;
    SheetFilter, ProjectFullPath, SchematicFullPath: String;
begin
    SheetFilter := '';
    ProjectFullPath := '';
    SchematicFullPath := '';
    for i := 0 to RequestData.Count - 1 do
    begin
        Line := RequestData[i];
        if Pos('"schematic_sheet_file_name"', Line) > 0 then
            SheetFilter := Trim(McpParseJSONLineValue(Line, '"schematic_sheet_file_name"'))
        else if Pos('"project_full_path"', Line) > 0 then
            ProjectFullPath := Trim(McpParseJSONLineValue(Line, '"project_full_path"'))
        else if Pos('"schematic_full_path"', Line) > 0 then
            SchematicFullPath := Trim(McpParseJSONLineValue(Line, '"schematic_full_path"'));
    end;
    Result := GetSchematicData(ROOT_DIR, ProjectFullPath, SchematicFullPath, SheetFilter, RequestData);
end;

// Execute wrapper for check_connectivity — parses the same sheet scoping
// parameters as get_schematic_data and exports per-pin compiled net names.
function ExecuteCheckConnectivity(RequestData: TStringList): String;
var
    i: Integer;
    Line: String;
    SheetFilter, ProjectFullPath, SchematicFullPath: String;
begin
    SheetFilter := '';
    ProjectFullPath := '';
    SchematicFullPath := '';
    for i := 0 to RequestData.Count - 1 do
    begin
        Line := RequestData[i];
        if Pos('"schematic_sheet_file_name"', Line) > 0 then
            SheetFilter := Trim(McpParseJSONLineValue(Line, '"schematic_sheet_file_name"'))
        else if Pos('"project_full_path"', Line) > 0 then
            ProjectFullPath := Trim(McpParseJSONLineValue(Line, '"project_full_path"'))
        else if Pos('"schematic_full_path"', Line) > 0 then
            SchematicFullPath := Trim(McpParseJSONLineValue(Line, '"schematic_full_path"'));
    end;
    Result := CheckSchematicConnectivityData(ROOT_DIR, ProjectFullPath, SchematicFullPath, SheetFilter);
end;

// Execute wrapper for open_document — parses document_kind + file_path
// PRJPCB uses IWorkspace.DM_OpenProject (verified: OpenLib/libUtils.pas L721,
// WS.DM_OpenProject(LibPrjPath, true)) — Client.OpenDocument alone does NOT
// bring a project into the workspace (DocumentsPanel stays on Free Documents),
// which broke every DM_Compile-based tool (check_connectivity DM layer).
function ExecuteOpenDocument(RequestData: TStringList): String;
var
    i: Integer;
    Line: String;
    DocKind, FilePath: String;
    WS: IWorkspace;
    Prj: IProject;
    Props: TStringList;
begin
    DocKind := '';
    FilePath := '';
    for i := 0 to RequestData.Count - 1 do
    begin
        Line := RequestData[i];
        if Pos('"document_kind"', Line) > 0 then
            DocKind := Trim(McpParseJSONLineValue(Line, '"document_kind"'))
        else if Pos('"file_path"', Line) > 0 then
            FilePath := Trim(McpParseJSONLineValue(Line, '"file_path"'));
    end;
    if FilePath = '' then
    begin
        Result := 'ERROR: file_path required for open_document';
        Exit;
    end;
    if DocKind = '' then
        DocKind := 'SCH';

    if (AnsiCompareText(DocKind, 'PRJPCB') = 0) or (AnsiCompareText(DocKind, 'PRJSCR') = 0) then
    begin
        // Projects must enter the workspace via DM_OpenProject — plain
        // Client.OpenDocument leaves them outside the project list, and every
        // DM_Compile-based tool (check_connectivity DM layer) then sees no
        // physical documents. Verified pattern: OpenLib/libUtils.pas L721.
        WS := GetWorkspace;
        if WS = nil then
        begin
            Result := 'ERROR: NO_WORKSPACE';
            Exit;
        end;
        Prj := WS.DM_OpenProject(FilePath, True);
        if Prj = nil then
        begin
            Result := 'ERROR: DM_OPEN_PROJECT_FAILED: ' + FilePath;
            Exit;
        end;
        Props := TStringList.Create;
        try
            AddJSONProperty(Props, 'action', 'open_document');
            AddJSONProperty(Props, 'document_kind', DocKind);
            AddJSONProperty(Props, 'file_path', FilePath);
            AddJSONProperty(Props, 'project', Prj.DM_ProjectFullPath);
            AddJSONInteger(Props, 'logical_documents', Prj.DM_LogicalDocumentCount);
            Result := BuildJSONObject(Props);
        finally
            Props.Free;
        end;
        Exit;
    end;

    Result := OpenDocumentInAltium(ROOT_DIR, DocKind, FilePath);
end;

// Execute wrapper for add_document_to_project — adds an existing document
// (e.g. a project-local .SchLib) to a project's source documents so the
// projects-first library enumeration (GetLibrarySymbolReference) can see it.
// Verified pattern: SPI_Cleanup_LPW_Footprint.pas CLF_ProjectAddRemoveFile
// (project.DM_AddSourceDocument(path) after an already-present check).
function ExecuteAddDocumentToProject(RequestData: TStringList): String;
var
    i: Integer;
    Line: String;
    ProjectPath, FilePath: String;
    WS: IWorkspace;
    Prj: IProject;
    Doc: IDocument;
    Found: Boolean;
    AddedFlag: String;
    Props: TStringList;
begin
    ProjectPath := '';
    FilePath := '';
    for i := 0 to RequestData.Count - 1 do
    begin
        Line := RequestData[i];
        if Pos('"project_full_path"', Line) > 0 then
            ProjectPath := Trim(McpParseJSONLineValue(Line, '"project_full_path"'))
        else if Pos('"file_path"', Line) > 0 then
            FilePath := Trim(McpParseJSONLineValue(Line, '"file_path"'));
    end;
    if (ProjectPath = '') or (FilePath = '') then
    begin
        Result := 'ERROR: project_full_path and file_path are required for add_document_to_project';
        Exit;
    end;

    WS := GetWorkspace;
    if WS = nil then
    begin
        Result := 'ERROR: NO_WORKSPACE';
        Exit;
    end;

    // already-open project (case-insensitive path match), else open it
    Prj := nil;
    for i := 0 to WS.DM_ProjectCount - 1 do
    begin
        if (WS.DM_Projects(i) <> nil) and (AnsiCompareText(WS.DM_Projects(i).DM_ProjectFullPath, ProjectPath) = 0) then
        begin
            Prj := WS.DM_Projects(i);
            Break;
        end;
    end;
    if Prj = nil then
    begin
        Prj := WS.DM_OpenProject(ProjectPath, True);
        if Prj = nil then
        begin
            Result := 'ERROR: PROJECT_NOT_OPEN_AND_OPEN_FAILED: ' + ProjectPath;
            Exit;
        end;
    end;

    Found := False;
    for i := 0 to Prj.DM_LogicalDocumentCount - 1 do
    begin
        Doc := Prj.DM_LogicalDocuments(i);
        if (Doc <> nil) and (AnsiCompareText(Doc.DM_FullPath, FilePath) = 0) then
        begin
            Found := True;
            Break;
        end;
    end;

    AddedFlag := 'false';
    if not Found then
    begin
        Prj.DM_AddSourceDocument(FilePath);
        AddedFlag := 'true';
    end;

    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'action', 'add_document_to_project');
        AddJSONProperty(Props, 'project', Prj.DM_ProjectFullPath);
        AddJSONProperty(Props, 'file_path', FilePath);
        AddJSONProperty(Props, 'added', AddedFlag);
        AddJSONInteger(Props, 'logical_documents', Prj.DM_LogicalDocumentCount);
        Result := BuildJSONObject(Props);
    finally
        Props.Free;
    end;
end;

// Execute wrapper for zoom_view — parses zoom_action
function ExecuteZoomView(RequestData: TStringList): String;
var
    i: Integer;
    Line: String;
    ZoomAction: String;
begin
    ZoomAction := '';
    for i := 0 to RequestData.Count - 1 do
    begin
        Line := RequestData[i];
        if Pos('"zoom_action"', Line) > 0 then
            ZoomAction := Trim(McpParseJSONLineValue(Line, '"zoom_action"'));
    end;
    if ZoomAction = '' then
        ZoomAction := 'redraw';
    Result := ZoomView(ROOT_DIR, ZoomAction);
end;

// Execute wrapper for pcb_net_info — parses net_name and optional action (select)
function ExecutePcbNetInfo(RequestData: TStringList): String;
var
    i: Integer;
    Line: String;
    NetName: String;
    NetAction: String;
    SelectStr: String;
    DoSelect: Boolean;
begin
    NetName := '';
    NetAction := '';
    for i := 0 to RequestData.Count - 1 do
    begin
        Line := RequestData[i];
        if Pos('"net_name"', Line) > 0 then
            NetName := Trim(McpParseJSONLineValue(Line, '"net_name"'))
        else if Pos('"action"', Line) > 0 then
            NetAction := Trim(McpParseJSONLineValue(Line, '"action"'))
        else if Pos('"select"', Line) > 0 then
            SelectStr := Trim(McpParseJSONLineValue(Line, '"select"'));
    end;
    if NetName = '' then
    begin
        Result := 'ERROR: net_name required for pcb_net_info';
        Exit;
    end;
    if NetAction = 'select' then
    begin
        DoSelect := not ((AnsiCompareText(SelectStr, 'false') = 0) or (AnsiCompareText(SelectStr, '0') = 0));
        Result := SelectPCBNet(ROOT_DIR, NetName, DoSelect);
    end
    else
        Result := GetPCBNetInfo(ROOT_DIR, NetName);
end;

// Execute wrapper for generate_report — parses report_type
function ExecuteGenerateReport(RequestData: TStringList): String;
var
    i: Integer;
    Line: String;
    ReportType: String;
begin
    ReportType := '';
    for i := 0 to RequestData.Count - 1 do
    begin
        Line := RequestData[i];
        if Pos('"report_type"', Line) > 0 then
            ReportType := Trim(McpParseJSONLineValue(Line, '"report_type"'));
    end;
    if ReportType = '' then
        ReportType := 'netlist';
    Result := GenerateProjectReport(ROOT_DIR, ReportType);
end;

// Function to execute a command with parameters
function ExecuteCommand(CommandName: String): String;
begin
    Result := '';
    EnsureDocumentFocused(CommandName);
    
    // Direct command execution based on the command name
    case CommandName of
        'get_component_pins':
            Result := ExecuteGetComponentPins(RequestData);            
        'get_all_nets':
            Result := GetAllNets(ROOT_DIR);            
        'create_net_class':
            if ENABLE_PCB_WRITES then
                Result := ExecuteCreateNetClass(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — PCB write operations are gated by feature flag ENABLE_PCB_WRITES';
        'get_all_component_data':
            Result := GetAllComponentData(ROOT_DIR, False);            
        'take_view_screenshot':
            Result := ExecuteTakeViewScreenshot(RequestData);            
        'get_library_symbol_reference':
            Result := GetLibrarySymbolReference(ROOT_DIR);            
        'create_schematic_symbol':
            if ENABLE_SYMBOL_CREATION then
                Result := ExecuteCreateSchematicSymbol(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — Symbol creation is gated by feature flag ENABLE_SYMBOL_CREATION';
        'get_schematic_data':
            Result := ExecuteGetSchematicData(RequestData);
        'check_connectivity':
            Result := ExecuteCheckConnectivity(RequestData);
        'schematic_edit':
            if ENABLE_SCHEMATIC_WRITES then
                Result := SchematicEditMain(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — Schematic write operations are gated by feature flag ENABLE_SCHEMATIC_WRITES';
        'get_pcb_layers':
            Result := GetPCBLayers(ROOT_DIR);            
        'set_pcb_layer_visibility':
            if ENABLE_PCB_WRITES then
                Result := ExecuteSetPCBLayerVisibility(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — PCB write operations are gated by feature flag ENABLE_PCB_WRITES';
        'get_pcb_layer_stackup':
            Result := GetPCBLayerStackup(ROOT_DIR);         
        'get_selected_components_coordinates':
            Result := GetSelectedComponentsCoordinates(ROOT_DIR); 
		'set_component_position':
            if ENABLE_PCB_WRITES then
			    Result := ExecuteSetComponentPosition(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — PCB write operations are gated by feature flag ENABLE_PCB_WRITES';
        'move_components':
            if ENABLE_PCB_WRITES then
                Result := ExecuteMoveComponents(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — PCB write operations are gated by feature flag ENABLE_PCB_WRITES';
        'layout_duplicator':
            Result := GetLayoutDuplicatorComponents(True);            
        'layout_duplicator_apply':
            if ENABLE_PCB_WRITES then
                Result := ExecuteLayoutDuplicatorApply(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — PCB write operations are gated by feature flag ENABLE_PCB_WRITES';
        'get_pcb_rules':
            Result := GetPCBRules(ROOT_DIR);
        'get_output_job_containers':
            Result := ExecuteGetOutputJobContainers(RequestData);
        'run_output_jobs':
            Result := ExecuteRunOutputJobs(RequestData);
        'search_library_symbol':
            Result := ExecuteSearchLibrarySymbol(RequestData);
        'list_library_components':
            Result := ExecuteListLibraryComponents(RequestData);
        'list_workspace':
            Result := GetWorkspaceOverview(ROOT_DIR);
        'ping':
            Result := '{"protocolVersion":1,"pong":true}';
        'pcb_edit':
            if ENABLE_PCB_WRITES then
                Result := PcbEditMain(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — PCB write operations are gated by feature flag ENABLE_PCB_WRITES';
        'compile_project':
            Result := CompileFocusedProject(ROOT_DIR);
        'open_document':
            Result := ExecuteOpenDocument(RequestData);
        'add_document_to_project':
            Result := ExecuteAddDocumentToProject(RequestData);
        'zoom_view':
            Result := ExecuteZoomView(RequestData);
        'pcb_component':
            if ENABLE_PCB_WRITES then
                Result := PcbComponentMain(RequestData)
            else
                Result := 'ERROR: WRITE_OPERATIONS_DISABLED — PCB write operations are gated by feature flag ENABLE_PCB_WRITES';
        'pcb_drc':
            Result := GetPCBDRCViolations(ROOT_DIR);
        'pcb_board_info':
            Result := GetPCBBoardInfo(ROOT_DIR);
        'pcb_polygon_info':
            Result := GetPCBPolygons(ROOT_DIR);
        'pcb_net_info':
            Result := ExecutePcbNetInfo(RequestData);
        'generate_report':
            Result := ExecuteGenerateReport(RequestData);
        'overlap_report':
            Result := OverlapReport(ROOT_DIR);
    else
        Result := '{"success":false,"error":"Unknown command: ' + CommandName + '"}';
    end;
end;

// Function to extract a parameter name-value pair from a JSON line
procedure ExtractParameter(Line: String);
var
    ParamName: String;
    ParamValue: String;
    NameEnd: Integer;
    ValueStart: Integer;
begin
    // Skip command line and lines without a colon
    if (Pos('"command":', Line) > 0) or (Pos(':', Line) = 0) then
        Exit;

    // Find the parameter name
    NameEnd := Pos(':', Line) - 1;
    if NameEnd <= 0 then Exit;

    // Extract and clean the parameter name
    ParamName := Copy(Line, 1, NameEnd);
    ParamName := TrimJSON(ParamName);

    // Extract the parameter value - don't trim arrays
    ValueStart := Pos(':', Line) + 1;
    ParamValue := Copy(Line, ValueStart, Length(Line) - ValueStart + 1);

    // Trim only if it's not an array
    if (Pos('[', ParamValue) = 0) then
        ParamValue := TrimJSON(ParamValue);

    // Add to parameters list
    if (ParamName <> '') and (ParamName <> 'command') then
        Params.Add(ParamName + '=' + ParamValue);
end;

procedure WriteResponse(Success: Boolean; Data: String; ErrorMsg: String);
var
    ActualSuccess: Boolean;
    ActualErrorMsg: String;
    ResultProps: TStringList;
begin
    // Check if Data contains an error message
    if (Pos('ERROR:', Data) = 1) then
    begin
        ActualSuccess := False;
        // Preserve full Delphi message after 'ERROR:' (with or without space before detail)
        ActualErrorMsg := Trim(Copy(Data, Length('ERROR:') + 1, Length(Data)));
    end
    else
    begin
        ActualSuccess := Success;
        ActualErrorMsg := ErrorMsg;
    end;

    // Create response props
    ResultProps := TStringList.Create;
    ResponseData := TStringList.Create;
    
    try
        // Add properties
        AddJSONBoolean(ResultProps, 'success', ActualSuccess);
        
        if ActualSuccess then
        begin
            // For JSON responses (starting with [ or {), don't wrap in additional quotes
            if (Length(Data) > 0) and ((Data[1] = '[') or (Data[1] = '{')) then
                ResultProps.Add(JSONPairStr('result', Data, False))
            else
                AddJSONProperty(ResultProps, 'result', Data);
        end
        else
        begin
            AddJSONProperty(ResultProps, 'error', ActualErrorMsg);
        end;

        if not ActualSuccess then
        begin
            if (Length(Data) > 0) and ((Data[1] = '{') or (Data[1] = '[')) then
                BridgeWriteErrorLog('bridge failure' + #13#10 + 'error=' + ActualErrorMsg + #13#10 + 'resultJsonPrefix=' + Copy(Data, 1, 400))
            else
                BridgeWriteErrorLog('bridge failure' + #13#10 + 'error=' + ActualErrorMsg + #13#10 + 'data=' + Copy(Data, 1, 400));
        end;
        
        // Build response
        ResponseData.Text := BuildJSONObject(ResultProps);
        ResponseData.SaveToFile(RESPONSE_FILE);
    finally
        ResultProps.Free;
        ResponseData.Free;
    end;
end;

// Main procedure to run the bridge
procedure Run;
var
    CommandType: String;
    Result: String;
    i: Integer;
    Line: String;
    ValueStart: Integer;
begin
    // Reset global variables to prevent stale/dirty values from previous crashes
    RequestData := Nil;
    ResponseData := Nil;
    Params := Nil;
    REQUEST_FILE := '';
    RESPONSE_FILE := '';
    ROOT_DIR := '';
    BRIDGE_ERROR_LOG := '';

    // Initialize file paths based on script location
    InitializeFilePaths();

    // Check if request file exists
    if not FileExists(REQUEST_FILE) then
    begin
        WriteResponse(False, '', 'No request file found at ' + REQUEST_FILE);
        Exit;
    end;

    try
        // Initialize parameters list
        Params := TStringList.Create;
        Params.Delimiter := '=';

        // Read the request file
        RequestData := TStringList.Create;
        try
            RequestData.LoadFromFile(REQUEST_FILE);

            // Default command type
            CommandType := '';

            // Parse command and parameters
            for i := 0 to RequestData.Count - 1 do
            begin
                Line := RequestData[i];

                // Extract command
                if Pos('"command":', Line) > 0 then
                begin
                    ValueStart := Pos(':', Line) + 1;
                    CommandType := Copy(Line, ValueStart, Length(Line) - ValueStart + 1);
                    CommandType := TrimJSON(CommandType);
                end
                else
                begin
                    // Extract all other parameters
                    ExtractParameter(Line);
                end;
            end;

            // Execute the command if valid
            if CommandType <> '' then
            begin
                Result := ExecuteCommand(CommandType);

                if Result <> '' then
                begin
                    WriteResponse(True, Result, '');
                end
                else
                begin
                    WriteResponse(False, '', 'Command execution failed');
                end;
            end
            else
            begin
                WriteResponse(False, '', 'No command specified');
            end;
        finally
            RequestData.Free;
            Params.Free;
        end;
    except
        WriteResponse(False, '',
            'Exception during script execution. Workspace file bridge_last_error.txt has this line; paste Altium Script Messages into bridge_user_reported_error.txt and run get_server_status.');
    end;
end;


