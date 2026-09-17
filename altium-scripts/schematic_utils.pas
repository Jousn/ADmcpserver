// Helper function to convert string to pin electrical type
function StrToPinElectricalType(ElecType: String): TPinElectrical;
begin
    if ElecType = 'eElectricHiZ' then
        Result := eElectricHiZ
    else if ElecType = 'eElectricInput' then
        Result := eElectricInput
    else if ElecType = 'eElectricIO' then
        Result := eElectricIO
    else if ElecType = 'eElectricOpenCollector' then
        Result := eElectricOpenCollector
    else if ElecType = 'eElectricOpenEmitter' then
        Result := eElectricOpenEmitter
    else if ElecType = 'eElectricOutput' then
        Result := eElectricOutput
    else if ElecType = 'eElectricPassive' then
        Result := eElectricPassive
    else if ElecType = 'eElectricPower' then
        Result := eElectricPower
    else
        Result := eElectricPassive; // Default
end;

// Helper function to convert string to pin orientation
function StrToPinOrientation(Orient: String): TRotationBy90;
begin
    if Orient = 'eRotate0' then
        Result := eRotate0
    else if Orient = 'eRotate90' then
        Result := eRotate90
    else if Orient = 'eRotate180' then
        Result := eRotate180
    else if Orient = 'eRotate270' then
        Result := eRotate270
    else
        Result := eRotate0; // Default
end;

// Function to get current schematic library component data
function GetLibrarySymbolReference(ROOT_DIR: String): String;
var
    CurrentLib       : ISch_Document;
    CurrentSchLib    : ISch_Lib;
    LibIterator      : ISch_Iterator;
    SchComponent     : ISch_Component;
    PinIterator      : ISch_Iterator;
    Pin              : ISch_Pin;
    ComponentProps   : TStringList;
    ComponentsArray  : TStringList;
    PinsArray        : TStringList;
    PinProps         : TStringList;
    OutputLines      : TStringList;
    PinName, PinNum  : String;
    PinType          : String;
    PinOrient        : String;
    PinX, PinY       : Integer;
    WS               : IWorkspace;
    Project          : IProject;
    Doc              : IDocument;
    pi, di           : Integer;
    SchLibPath       : String;
    ServerDoc        : IServerDocument;
    LibFound         : Boolean;
    ti               : Integer;
    LibDebug         : TStringList;
    ProjectLibsAvailable : Boolean;
begin
    Result := '';
    LibFound := False;
    ComponentsArray := TStringList.Create;
    LibDebug := TStringList.Create;

    try
        // Phase 1: Check if a SchLib is already open
        CurrentLib := SchServer.GetCurrentSchDocument;
        // Projects FIRST: when any open project owns .SchLib documents, enumerate
        // ALL of them (Phase 2 below). The focused-SchLib branch is only a fallback
        // for free-floating library documents that belong to no project — otherwise
        // a stale focused library shadows every other library in the project.
        ProjectLibsAvailable := False;
        WS := GetWorkspace;
        if WS <> Nil then
        begin
            for pi := 0 to WS.DM_ProjectCount - 1 do
            begin
                if WS.DM_Projects(pi) = Nil then
                    Continue;
                for di := 0 to WS.DM_Projects(pi).DM_LogicalDocumentCount - 1 do
                begin
                    Doc := WS.DM_Projects(pi).DM_LogicalDocuments(di);
                    if (Doc <> Nil) and ((Doc.DM_DocumentKind = 'SCHLIB') or (Pos('.SchLib', Doc.DM_FullPath) > 0)) then
                    begin
                        ProjectLibsAvailable := True;
                        Break;
                    end;
                end;
                if ProjectLibsAvailable then
                    Break;
            end;
        end;
        if (Not ProjectLibsAvailable) and (CurrentLib <> Nil) and (Pos('.SchLib', CurrentLib.DocumentName) > 0) then
        begin
            LibFound := True;
            CurrentSchLib := SchServer.GetCurrentSchDocument;

            // Enumerate all components in this SchLib
            LibIterator := CurrentSchLib.SchLibIterator_Create;
            LibIterator.AddFilter_ObjectSet(MkSet(eSchComponent));
            SchComponent := LibIterator.FirstSchObject;

            while (SchComponent <> Nil) do
            begin
                ComponentProps := TStringList.Create;
                PinsArray := TStringList.Create;
                try
                    AddJSONProperty(ComponentProps, 'lib_reference', SchComponent.LibReference);
                    AddJSONProperty(ComponentProps, 'description', SchComponent.ComponentDescription);
                    AddJSONProperty(ComponentProps, 'designator', SchComponent.Designator.Text);
                    AddJSONInteger(ComponentProps, 'part_count', SchComponent.PartCount);
                    AddJSONProperty(ComponentProps, 'library_name', ExtractFileName(CurrentSchLib.DocumentName));

                    // Enumerate pins
                    PinIterator := SchComponent.SchIterator_Create;
                    PinIterator.AddFilter_ObjectSet(MkSet(ePin));
                    Pin := PinIterator.FirstSchObject;

                    while (Pin <> nil) do
                    begin
                        PinProps := TStringList.Create;
                        try
                            PinNum := Pin.Designator;
                            PinName := Pin.Name;

                            case Pin.Electrical of
                                eElectricHiZ: PinType := 'eElectricHiZ';
                                eElectricInput: PinType := 'eElectricInput';
                                eElectricIO: PinType := 'eElectricIO';
                                eElectricOpenCollector: PinType := 'eElectricOpenCollector';
                                eElectricOpenEmitter: PinType := 'eElectricOpenEmitter';
                                eElectricOutput: PinType := 'eElectricOutput';
                                eElectricPassive: PinType := 'eElectricPassive';
                                eElectricPower: PinType := 'eElectricPower';
                                else PinType := 'eElectricPassive';
                            end;

                            case Pin.Orientation of
                                eRotate0: PinOrient := 'eRotate0';
                                eRotate90: PinOrient := 'eRotate90';
                                eRotate180: PinOrient := 'eRotate180';
                                eRotate270: PinOrient := 'eRotate270';
                                else PinOrient := 'eRotate0';
                            end;

                            PinX := CoordToMils(Pin.Location.X);
                            PinY := CoordToMils(Pin.Location.Y);

                            AddJSONProperty(PinProps, 'pin_number', PinNum);
                            AddJSONProperty(PinProps, 'pin_name', PinName);
                            AddJSONProperty(PinProps, 'pin_type', PinType);
                            AddJSONProperty(PinProps, 'pin_orientation', PinOrient);
                            AddJSONNumber(PinProps, 'x', PinX);
                            AddJSONNumber(PinProps, 'y', PinY);
                            // Pin length feeds hotspot derivation for placement
                            // planning (hotspot = Location + PinLength along
                            // orientation — same math as SchEditGetComponentInfo).
                            AddJSONNumber(PinProps, 'pin_length_mils', CoordToMils(Pin.PinLength));
                            AddJSONInteger(PinProps, 'owner_part_id', Pin.OwnerPartId);

                            PinsArray.Add(BuildJSONObject(PinProps, 1));
                        finally
                            PinProps.Free;
                        end;
                        Pin := PinIterator.NextSchObject;
                    end;
                    SchComponent.SchIterator_Destroy(PinIterator);

                    ComponentProps.Add('"pins": ' + BuildJSONArray(PinsArray));
                    ComponentsArray.Add(BuildJSONObject(ComponentProps, 1));
                finally
                    PinsArray.Free;
                    ComponentProps.Free;
                end;
                SchComponent := LibIterator.NextSchObject;
            end;
            CurrentSchLib.SchIterator_Destroy(LibIterator);
        end
        else
        begin
            // Phase 2: Search all SchLib files in the focused project
            WS := GetWorkspace;
            if WS = Nil then
            begin
                Result := '{"success":false,"error":"No workspace available. Open a project or a .SchLib file in Altium Designer."}';
                Exit;
            end;

            for pi := 0 to WS.DM_ProjectCount - 1 do
            begin
                if pi = 0 then
                    Project := WS.DM_FocusedProject
                else
                    Project := WS.DM_Projects(pi);

                if Project = Nil then
                    Continue;

                for di := 0 to Project.DM_LogicalDocumentCount - 1 do
                begin
                    Doc := Project.DM_LogicalDocuments(di);
                    if Doc = Nil then
                        Continue;

                    if (Doc.DM_DocumentKind = 'SCHLIB') or (Pos('.SchLib', Doc.DM_FullPath) > 0) then
                    begin
                        SchLibPath := Doc.DM_FullPath;
                        if not FileExists(SchLibPath) then
                            Continue;

                        // Resolve the library document by PATH (focus-independent,
                        // same pattern as SchEditResolveSheet for sheets). Opening
                        // uses several kind-string spellings because Client.OpenDocument
                        // is picky about which server actually loads the document.
                        CurrentSchLib := SchServer.GetSchDocumentByPath(SchLibPath);
                        ti := 0;
                        while (CurrentSchLib = Nil) and (ti < 3) do
                        begin
                            case ti of
                                0: ServerDoc := Client.OpenDocument('SchLib', SchLibPath);
                                1: ServerDoc := Client.OpenDocument('SCHLIB', SchLibPath);
                            else
                                ServerDoc := Client.OpenDocument('SCH', SchLibPath);
                            end;
                            if ServerDoc <> Nil then
                            begin
                                Client.ShowDocument(ServerDoc);
                                Sleep(800);
                                CurrentSchLib := SchServer.GetSchDocumentByPath(SchLibPath);
                            end;
                            ti := ti + 1;
                        end;
                        if CurrentSchLib = Nil then
                        begin
                            LibDebug.Add(SchLibPath + ' (unresolvable)');
                            Continue;
                        end;

                        LibFound := True;

                        LibIterator := CurrentSchLib.SchLibIterator_Create;
                        LibIterator.AddFilter_ObjectSet(MkSet(eSchComponent));
                        SchComponent := LibIterator.FirstSchObject;

                        while (SchComponent <> Nil) do
                        begin
                            ComponentProps := TStringList.Create;
                            PinsArray := TStringList.Create;
                            try
                                AddJSONProperty(ComponentProps, 'lib_reference', SchComponent.LibReference);
                                AddJSONProperty(ComponentProps, 'description', SchComponent.ComponentDescription);
                                AddJSONProperty(ComponentProps, 'designator', SchComponent.Designator.Text);
                                AddJSONInteger(ComponentProps, 'part_count', SchComponent.PartCount);
                                AddJSONProperty(ComponentProps, 'library_name', ExtractFileName(CurrentSchLib.DocumentName));

                                PinIterator := SchComponent.SchIterator_Create;
                                PinIterator.AddFilter_ObjectSet(MkSet(ePin));
                                Pin := PinIterator.FirstSchObject;

                                while (Pin <> nil) do
                                begin
                                    PinProps := TStringList.Create;
                                    try
                                        PinNum := Pin.Designator;
                                        PinName := Pin.Name;

                                        case Pin.Electrical of
                                            eElectricHiZ: PinType := 'eElectricHiZ';
                                            eElectricInput: PinType := 'eElectricInput';
                                            eElectricIO: PinType := 'eElectricIO';
                                            eElectricOpenCollector: PinType := 'eElectricOpenCollector';
                                            eElectricOpenEmitter: PinType := 'eElectricOpenEmitter';
                                            eElectricOutput: PinType := 'eElectricOutput';
                                            eElectricPassive: PinType := 'eElectricPassive';
                                            eElectricPower: PinType := 'eElectricPower';
                                            else PinType := 'eElectricPassive';
                                        end;

                                        case Pin.Orientation of
                                            eRotate0: PinOrient := 'eRotate0';
                                            eRotate90: PinOrient := 'eRotate90';
                                            eRotate180: PinOrient := 'eRotate180';
                                            eRotate270: PinOrient := 'eRotate270';
                                            else PinOrient := 'eRotate0';
                                        end;

                                        PinX := CoordToMils(Pin.Location.X);
                                        PinY := CoordToMils(Pin.Location.Y);

                                        AddJSONProperty(PinProps, 'pin_number', PinNum);
                                        AddJSONProperty(PinProps, 'pin_name', PinName);
                                        AddJSONProperty(PinProps, 'pin_type', PinType);
                                        AddJSONProperty(PinProps, 'pin_orientation', PinOrient);
                                        AddJSONNumber(PinProps, 'x', PinX);
                                        AddJSONNumber(PinProps, 'y', PinY);
                                        // Same hotspot-derivation input as Phase 1.
                                        AddJSONNumber(PinProps, 'pin_length_mils', CoordToMils(Pin.PinLength));
                                        AddJSONInteger(PinProps, 'owner_part_id', Pin.OwnerPartId);

                                        PinsArray.Add(BuildJSONObject(PinProps, 1));
                                    finally
                                        PinProps.Free;
                                    end;
                                    Pin := PinIterator.NextSchObject;
                                end;
                                SchComponent.SchIterator_Destroy(PinIterator);

                                ComponentProps.Add('"pins": ' + BuildJSONArray(PinsArray));
                                ComponentsArray.Add(BuildJSONObject(ComponentProps, 1));
                            finally
                                PinsArray.Free;
                                ComponentProps.Free;
                            end;
                            SchComponent := LibIterator.NextSchObject;
                        end;
                        CurrentSchLib.SchIterator_Destroy(LibIterator);
                    end;
                end;
            end;
        end;

        if not LibFound then
        begin
            Result := '{"success":false,"error":"No .SchLib document found. Open a project containing .SchLib files, or open a .SchLib file in Altium Designer."}';
            Exit;
        end;

        // Build final JSON output
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := '{"success":true,"component_count":' + IntToStr(ComponentsArray.Count) +
                ',"components":' + BuildJSONArray(ComponentsArray) +
                ',"library_debug":' + BuildJSONArray(LibDebug) + '}';
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + 'temp_symbol_reference.json');
        finally
            OutputLines.Free;
        end;
    finally
        ComponentsArray.Free;
        LibDebug.Free;
    end;
end;

function CreateSchematicSymbol(SymbolName: String; PinsList: TStringList; PartCount: Integer = 1): String;
var
    CurrentLib       : ISch_Lib;
    SchComponent     : ISch_Component;
    SchPin           : ISch_Pin;
    R                : ISch_Rectangle;
    I, J, PinCount   : Integer;
    PinData          : TStringList;
    PinName, PinNum  : String;
    PinType          : String;
    PinOrient        : String;
    PinX, PinY       : Integer;
    PinOwnerPartId   : Integer;
    PinElec          : TPinElectrical;
    PinOrientation   : TRotationBy90;
    MinX, MaxX, MinY, MaxY : Integer;
    HasPins          : Boolean;
    ResultProps      : TStringList;
    Description      : String;
    OutputLines      : TStringList;
begin
    // Check if we have a schematic library document
    CurrentLib := SchServer.GetCurrentSchDocument;
    if (CurrentLib = Nil) or (Pos('.SchLib', CurrentLib.DocumentName) = 0) Then
    begin
        Result := 'ERROR: Please open a schematic library document';
        Exit;
    end;

    Description := 'New Component';  // Default description

    // Parse the pins list for description and auto-detect PartCount from max owner_part_id
    for I := 0 to PinsList.Count - 1 do
    begin
        if (Pos('Description=', PinsList[I]) = 1) then
        begin
            Description := Copy(PinsList[I], 13, Length(PinsList[I]) - 12);
        end
        else
        begin
            // Check for owner_part_id in pin data to auto-detect PartCount
            PinData := TStringList.Create;
            try
                PinData.Delimiter := '|';
                PinData.DelimitedText := PinsList[I];
                if (PinData.Count >= 7) then
                begin
                    PinOwnerPartId := StrToInt(PinData[6]);
                    if (PinOwnerPartId > PartCount) then
                        PartCount := PinOwnerPartId;
                end;
            finally
                PinData.Free;
            end;
        end;
    end;

    // Create a library component (a page of the library is created)
    SchComponent := SchServer.SchObjectFactory(eSchComponent, eCreate_Default);
    if (SchComponent = Nil) Then
    begin
        Result := 'ERROR: Failed to create component';
        Exit;
    end;

    // Set up parameters for the library component
    SchComponent.CurrentPartID := 1;
    SchComponent.DisplayMode := 0;
    SchComponent.PartCount := PartCount;

    // Define the LibReference and component description
    SchComponent.LibReference := SymbolName;
    SchComponent.ComponentDescription := Description;
    SchComponent.Designator.Text := 'U?';

    // Create a body rectangle for each part
    PinCount := 0;
    for J := 1 to PartCount do
    begin
        // Compute bounding box for this part's pins (including shared pins with OwnerPartId=0)
        MinX := 9999; MaxX := -9999; MinY := 9999; MaxY := -9999;
        HasPins := False;

        for I := 0 to PinsList.Count - 1 do
        begin
            if (Pos('Description=', PinsList[I]) = 1) then Continue;

            PinData := TStringList.Create;
            try
                PinData.Delimiter := '|';
                PinData.DelimitedText := PinsList[I];

                if (PinData.Count >= 6) then
                begin
                    PinX := StrToInt(PinData[4]);
                    PinY := StrToInt(PinData[5]);

                    // Determine owner part id (default 1 for backward compatibility)
                    if (PinData.Count >= 7) then
                        PinOwnerPartId := StrToInt(PinData[6])
                    else
                        PinOwnerPartId := 1;

                    // Include pin in this part's bounding box if it belongs to this part or is shared (0)
                    if (PinOwnerPartId = J) or (PinOwnerPartId = 0) then
                    begin
                        MinX := Min(MinX, PinX);
                        MaxX := Max(MaxX, PinX);
                        MinY := Min(MinY, PinY);
                        MaxY := Max(MaxY, PinY);
                        HasPins := True;
                    end;
                end;
            finally
                PinData.Free;
            end;
        end;

        // Default rectangle if no pins for this part
        if not HasPins then
        begin
            MinX := 300; MinY := 0; MaxX := 1000; MaxY := 1000;
        end;

        // Create a rectangle for this part's body
        R := SchServer.SchObjectFactory(eRectangle, eCreate_Default);
        if (R <> Nil) Then
        begin
            R.LineWidth := eSmall;
            R.Location := Point(MilsToCoord(MinX), MilsToCoord(MinY - 100));
            R.Corner := Point(MilsToCoord(MaxX), MilsToCoord(MaxY + 100));
            R.AreaColor := $00B0FFFF; // Yellow (BGR format)
            R.Color := $00FF0000;     // Blue (BGR format)
            R.IsSolid := True;
            R.OwnerPartId := J;
            R.OwnerPartDisplayMode := 0;
            SchComponent.AddSchObject(R);
        end;

        // Position designator using Part 1's bounding box
        if (J = 1) then
            SchComponent.Designator.Location := Point(MilsToCoord(MinX), MilsToCoord(MaxY + 100));
    end;

    // Add pins to the component
    for I := 0 to PinsList.Count - 1 do
    begin
        if (Pos('Description=', PinsList[I]) = 1) then Continue;

        PinData := TStringList.Create;
        try
            PinData.Delimiter := '|';
            PinData.DelimitedText := PinsList[I];

            if (PinData.Count >= 6) then
            begin
                PinNum := PinData[0];
                PinName := PinData[1];
                PinType := PinData[2];
                PinOrient := PinData[3];
                PinX := StrToInt(PinData[4]);
                PinY := StrToInt(PinData[5]);

                // Determine owner part id (default 1 for backward compatibility)
                if (PinData.Count >= 7) then
                    PinOwnerPartId := StrToInt(PinData[6])
                else
                    PinOwnerPartId := 1;

                // Create a pin
                SchPin := SchServer.SchObjectFactory(ePin, eCreate_Default);
                if (SchPin = Nil) Then
                    Continue;

                // Set pin properties
                PinElec := StrToPinElectricalType(PinType);
                PinOrientation := StrToPinOrientation(PinOrient);

                SchPin.Designator := PinNum;
                SchPin.Name := PinName;
                SchPin.Electrical := PinElec;
                SchPin.Orientation := PinOrientation;
                SchPin.Location := Point(MilsToCoord(PinX), MilsToCoord(PinY));

                // Set ownership to the specified part (0 = shared across all parts)
                SchPin.OwnerPartId := PinOwnerPartId;
                SchPin.OwnerPartDisplayMode := 0;

                SchComponent.AddSchObject(SchPin);
                PinCount := PinCount + 1;
            end;
        finally
            PinData.Free;
        end;
    end;

    // Add the component to the library
    CurrentLib.AddSchComponent(SchComponent);

    // Send a system notification that a new component has been added to the library
    SchServer.RobotManager.SendMessage(nil, c_BroadCast, SCHM_PrimitiveRegistration, SchComponent.I_ObjectAddress);
    CurrentLib.CurrentSchComponent := SchComponent;

    // Refresh library
    CurrentLib.GraphicallyInvalidate;

    // Create result JSON
    ResultProps := TStringList.Create;
    try
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'component_name', SymbolName);
        AddJSONInteger(ResultProps, 'pins_count', PinCount);
        AddJSONInteger(ResultProps, 'part_count', PartCount);

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
    end;
end;

// Function to search for a symbol in schematic libraries
// When LibraryPath is provided, searches that specific .SchLib
// When LibraryPath is empty, searches all .SchLib files in the focused project
function SearchLibrarySymbol(ROOT_DIR: String; LibraryPath: String; SymbolName: String): String;
var
    CurrentLib       : ISch_Lib;
    LibIterator      : ISch_Iterator;
    LibComp          : ISch_Component;
    MatchedComp      : ISch_Component;
    ResultProps      : TStringList;
    MatchesArray     : TStringList;
    AllSymbolsArray  : TStringList;
    MatchProps       : TStringList;
    OutputLines      : TStringList;
    SearchUpper      : String;
    LibRefUpper      : String;
    MatchCount       : Integer;
    ServerDoc        : IServerDocument;
    WS               : IWorkspace;
    Project          : IProject;
    Doc              : IDocument;
    pi, di           : Integer;
    SchLibPath       : String;
    LibSearched      : Integer;
begin
    Result := '';
    MatchedComp := Nil;
    MatchCount := 0;
    SearchUpper := UpperCase(SymbolName);
    LibSearched := 0;

    // Create arrays for results
    MatchesArray := TStringList.Create;
    AllSymbolsArray := TStringList.Create;
    ResultProps := TStringList.Create;

    try
        if (LibraryPath <> '') then
        begin
            // Search a specific library file
            if not FileExists(LibraryPath) then
            begin
                Result := '{"success":false,"error":"Library file not found: ' + JSONEscapeString(LibraryPath) + '"}';
                Exit;
            end;

            ServerDoc := Client.OpenDocument('SchLib', LibraryPath);
            if ServerDoc = Nil then
            begin
                Result := '{"success":false,"error":"Failed to open library: ' + JSONEscapeString(LibraryPath) + '"}';
                Exit;
            end;
            Client.ShowDocument(ServerDoc);
            Sleep(500);

            CurrentLib := SchServer.GetCurrentSchDocument;
            if (CurrentLib = Nil) or (Pos('.SchLib', CurrentLib.DocumentName) = 0) then
            begin
                Result := '{"success":false,"error":"Failed to access schematic library document"}';
                Exit;
            end;

            // Search within this library
            LibIterator := CurrentLib.SchLibIterator_Create;
            LibIterator.AddFilter_ObjectSet(MkSet(eSchComponent));

            LibComp := LibIterator.FirstSchObject;
            while (LibComp <> Nil) do
            begin
                LibRefUpper := UpperCase(LibComp.LibReference);
                AllSymbolsArray.Add('"' + LibComp.LibReference + '"');

                if (Pos(SearchUpper, LibRefUpper) > 0) then
                begin
                    MatchCount := MatchCount + 1;
                    MatchProps := TStringList.Create;
                    try
                        AddJSONProperty(MatchProps, 'name', LibComp.LibReference);
                        AddJSONProperty(MatchProps, 'description', LibComp.ComponentDescription);
                        AddJSONProperty(MatchProps, 'library', ExtractFileName(CurrentLib.DocumentName));
                        if (LibRefUpper = SearchUpper) then
                            AddJSONBoolean(MatchProps, 'exact_match', True)
                        else
                            AddJSONBoolean(MatchProps, 'exact_match', False);
                        MatchesArray.Add(BuildJSONObject(MatchProps, 1));
                    finally
                        MatchProps.Free;
                    end;

                    if (LibRefUpper = SearchUpper) then
                        MatchedComp := LibComp
                    else if (MatchedComp = Nil) then
                        MatchedComp := LibComp;
                end;

                LibComp := LibIterator.NextSchObject;
            end;
            CurrentLib.SchIterator_Destroy(LibIterator);
            LibSearched := 1;
        end
        else
        begin
            // No library_path provided: search all .SchLib files in the focused project
            WS := GetWorkspace;
            if WS = Nil then
            begin
                Result := '{"success":false,"error":"No workspace available"}';
                Exit;
            end;

            Project := WS.DM_FocusedProject;
            if Project = Nil then
            begin
                // Fallback: check if a SchLib is already open
                CurrentLib := SchServer.GetCurrentSchDocument;
                if (CurrentLib <> Nil) and (Pos('.SchLib', CurrentLib.DocumentName) > 0) then
                begin
                    // Search the currently open SchLib
                    LibIterator := CurrentLib.SchLibIterator_Create;
                    LibIterator.AddFilter_ObjectSet(MkSet(eSchComponent));
                    LibComp := LibIterator.FirstSchObject;
                    while (LibComp <> Nil) do
                    begin
                        LibRefUpper := UpperCase(LibComp.LibReference);
                        AllSymbolsArray.Add('"' + LibComp.LibReference + '"');
                        if (Pos(SearchUpper, LibRefUpper) > 0) then
                        begin
                            MatchCount := MatchCount + 1;
                            MatchProps := TStringList.Create;
                            try
                                AddJSONProperty(MatchProps, 'name', LibComp.LibReference);
                                AddJSONProperty(MatchProps, 'description', LibComp.ComponentDescription);
                                AddJSONProperty(MatchProps, 'library', ExtractFileName(CurrentLib.DocumentName));
                                if (LibRefUpper = SearchUpper) then
                                    AddJSONBoolean(MatchProps, 'exact_match', True)
                                else
                                    AddJSONBoolean(MatchProps, 'exact_match', False);
                                MatchesArray.Add(BuildJSONObject(MatchProps, 1));
                            finally
                                MatchProps.Free;
                            end;
                            if (LibRefUpper = SearchUpper) then
                                MatchedComp := LibComp
                            else if (MatchedComp = Nil) then
                                MatchedComp := LibComp;
                        end;
                        LibComp := LibIterator.NextSchObject;
                    end;
                    CurrentLib.SchIterator_Destroy(LibIterator);
                    LibSearched := 1;
                end
                else
                begin
                    Result := '{"success":false,"error":"No focused project found. Provide library_path parameter or open a .SchLib file first."}';
                    Exit;
                end;
            end
            else
            begin
                // Iterate through all documents in the focused project
                for pi := 0 to WS.DM_ProjectCount - 1 do
                begin
                    if pi > 0 then
                        Project := WS.DM_Projects(pi)
                    else
                        Project := WS.DM_FocusedProject;

                    if Project = Nil then
                        Continue;

                    for di := 0 to Project.DM_LogicalDocumentCount - 1 do
                    begin
                        Doc := Project.DM_LogicalDocuments(di);
                        if Doc = Nil then
                            Continue;

                        // Check if it's a SchLib document
                        if (Doc.DM_DocumentKind = 'SCHLIB') or (Pos('.SchLib', Doc.DM_FullPath) > 0) then
                        begin
                            SchLibPath := Doc.DM_FullPath;
                            if not FileExists(SchLibPath) then
                                Continue;

                            // Open the library
                            ServerDoc := Client.OpenDocument('SchLib', SchLibPath);
                            if ServerDoc = Nil then
                                Continue;
                            Client.ShowDocument(ServerDoc);
                            Sleep(300);

                            CurrentLib := SchServer.GetCurrentSchDocument;
                            if (CurrentLib = Nil) or (Pos('.SchLib', CurrentLib.DocumentName) = 0) then
                                Continue;

                            LibSearched := LibSearched + 1;

                            // Search within this library
                            LibIterator := CurrentLib.SchLibIterator_Create;
                            LibIterator.AddFilter_ObjectSet(MkSet(eSchComponent));
                            LibComp := LibIterator.FirstSchObject;
                            while (LibComp <> Nil) do
                            begin
                                LibRefUpper := UpperCase(LibComp.LibReference);
                                AllSymbolsArray.Add('"' + LibComp.LibReference + '"');
                                if (Pos(SearchUpper, LibRefUpper) > 0) then
                                begin
                                    MatchCount := MatchCount + 1;
                                    MatchProps := TStringList.Create;
                                    try
                                        AddJSONProperty(MatchProps, 'name', LibComp.LibReference);
                                        AddJSONProperty(MatchProps, 'description', LibComp.ComponentDescription);
                                        AddJSONProperty(MatchProps, 'library', ExtractFileName(CurrentLib.DocumentName));
                                        if (LibRefUpper = SearchUpper) then
                                            AddJSONBoolean(MatchProps, 'exact_match', True)
                                        else
                                            AddJSONBoolean(MatchProps, 'exact_match', False);
                                        MatchesArray.Add(BuildJSONObject(MatchProps, 1));
                                    finally
                                        MatchProps.Free;
                                    end;
                                    if (LibRefUpper = SearchUpper) then
                                        MatchedComp := LibComp
                                    else if (MatchedComp = Nil) then
                                        MatchedComp := LibComp;
                                end;
                                LibComp := LibIterator.NextSchObject;
                            end;
                            CurrentLib.SchIterator_Destroy(LibIterator);
                        end;
                    end;
                end;

                if LibSearched = 0 then
                begin
                    Result := '{"success":false,"error":"No .SchLib files found in the focused project. Provide library_path parameter or open a .SchLib file first."}';
                    Exit;
                end;
            end;
        end;

        // Navigate to the matched component if found
        if (MatchedComp <> Nil) then
        begin
            CurrentLib := SchServer.GetCurrentSchDocument;
            if (CurrentLib <> Nil) and (Pos('.SchLib', CurrentLib.DocumentName) > 0) then
            begin
                CurrentLib.CurrentSchComponent := MatchedComp;
                CurrentLib.GraphicallyInvalidate;
            end;
            AddJSONBoolean(ResultProps, 'found', True);
            AddJSONProperty(ResultProps, 'navigated_to', MatchedComp.LibReference);
            AddJSONProperty(ResultProps, 'description', MatchedComp.ComponentDescription);
        end
        else
        begin
            AddJSONBoolean(ResultProps, 'found', False);
            AddJSONProperty(ResultProps, 'message', 'No symbol matching "' + SymbolName + '" was found');
        end;

        AddJSONInteger(ResultProps, 'match_count', MatchCount);
        AddJSONInteger(ResultProps, 'libraries_searched', LibSearched);
        AddJSONInteger(ResultProps, 'total_symbols', AllSymbolsArray.Count);
        ResultProps.Add('"matches": ' + BuildJSONArray(MatchesArray));

        // Build final JSON
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + 'temp_search_symbol.json');
        finally
            OutputLines.Free;
        end;
    finally
        MatchesArray.Free;
        AllSymbolsArray.Free;
        ResultProps.Free;
    end;
end;

// Enumerate all components in a single .SchLib file and return compact info
// (lib_reference, description, designator template, part_count, footprint).
// Used by the import_library_components MCP tool to cache a library catalog
// into memory so place_component / search can reuse it without re-querying Altium.
// Only project-directory .SchLib files are intended here (no AD default dir scan).
function ListLibraryComponents(ROOT_DIR: String; LibraryPath: String): String;
var
    CurrentLib       : ISch_Lib;
    LibIterator      : ISch_Iterator;
    ParamIterator    : ISch_Iterator;
    LibComp          : ISch_Component;
    Parameter        : ISch_Parameter;
    ServerDoc        : IServerDocument;
    ResultProps      : TStringList;
    CompProps        : TStringList;
    Footprint        : String;
    ParamName        : String;
    JsonLine         : String;
    OutputLines      : TStringList;
    WS               : IWorkspace;
    FocusedProject   : IProject;
    ProjectPath      : String;
    CompCount        : Integer;
    RetryIdx         : Integer;
    JsonlFilePath    : String;
    JsonlFile        : TextFile;
begin
    Result := '';

    if (LibraryPath = '') then
    begin
        Result := 'ERROR: LIBRARY_PATH_REQUIRED';
        Exit;
    end;

    if not FileExists(LibraryPath) then
    begin
        Result := 'ERROR: LIBRARY_FILE_NOT_FOUND: ' + LibraryPath;
        Exit;
    end;

    // Capture focused project path (may be empty; used by TS side for memory path)
    ProjectPath := '';
    WS := GetWorkspace;
    if WS <> nil then
    begin
        FocusedProject := WS.DM_FocusedProject;
        if FocusedProject <> nil then
            ProjectPath := FocusedProject.DM_ProjectFullPath;
    end;

    // Open the library document
    ServerDoc := Client.OpenDocument('SchLib', LibraryPath);
    if ServerDoc = Nil then
    begin
        Result := 'ERROR: FAILED_TO_OPEN_LIBRARY: ' + LibraryPath;
        Exit;
    end;
    Client.ShowDocument(ServerDoc);

    // Retry loop: SchLib may need multiple attempts to fully load in Altium.
    // The iterator can return 0 components on first try if the document
    // has not finished loading. We retry up to 5 times with increasing delays.
    CompCount := 0;
    RetryIdx := 0;
    while (RetryIdx < 5) and (CompCount = 0) do
    begin
        if RetryIdx > 0 then
            Sleep(500 + RetryIdx * 300)
        else
            Sleep(800);

        CurrentLib := SchServer.GetCurrentSchDocument;
        if (CurrentLib = Nil) or (Pos('.SchLib', CurrentLib.DocumentName) = 0) then
        begin
            if RetryIdx = 4 then
            begin
                Result := 'ERROR: NOT_SCHLIB_DOCUMENT: ' + LibraryPath;
                Exit;
            end;
            RetryIdx := RetryIdx + 1;
            Continue;
        end;

        // Prepare JSONL file for streaming (one JSON object per line).
        // Re-open EVERY attempt: a previous 0-component attempt closed the
        // file, so Rewrite (truncate) keeps the handle valid at the
        // CloseFile calls below. Nothing was written on a 0-component
        // attempt, so truncation is harmless.
        JsonlFilePath := ROOT_DIR + 'temp_library_components.jsonl';
        AssignFile(JsonlFile, JsonlFilePath);
        Rewrite(JsonlFile);

        ResultProps := TStringList.Create;
        try
            AddJSONProperty(ResultProps, 'library_path', LibraryPath, True);
            AddJSONProperty(ResultProps, 'library_name', ExtractFileName(LibraryPath), True);
            AddJSONProperty(ResultProps, 'project_path', ProjectPath, True);
            AddJSONProperty(ResultProps, 'jsonl_file', JsonlFilePath, True);

            // Enumerate all components - stream each to JSONL immediately
            LibIterator := CurrentLib.SchLibIterator_Create;
            LibIterator.AddFilter_ObjectSet(MkSet(eSchComponent));

            LibComp := LibIterator.FirstSchObject;
            CompCount := 0;
            while (LibComp <> Nil) do
            begin
                CompProps := TStringList.Create;
                try
                    AddJSONProperty(CompProps, 'lib_reference', LibComp.LibReference, True);
                    AddJSONProperty(CompProps, 'description', LibComp.ComponentDescription, True);
                    AddJSONProperty(CompProps, 'designator_template', LibComp.Designator.Text, True);
                    AddJSONInteger(CompProps, 'part_count', LibComp.PartCount);

                    // Find footprint from parameters
                    Footprint := '';
                    ParamIterator := LibComp.SchIterator_Create;
                    ParamIterator.AddFilter_ObjectSet(MkSet(eParameter));
                    Parameter := ParamIterator.FirstSchObject;
                    while (Parameter <> Nil) do
                    begin
                        ParamName := UpperCase(Parameter.Name);
                        if (Pos('FOOTPRINT', ParamName) > 0) and (Footprint = '') then
                            Footprint := Parameter.Text;
                        Parameter := ParamIterator.NextSchObject;
                    end;
                    LibComp.SchIterator_Destroy(ParamIterator);

                    AddJSONProperty(CompProps, 'footprint', Footprint, True);

                    // Build JSON line and write immediately to file (streaming)
                    JsonLine := BuildJSONObject(CompProps);
                    WriteLn(JsonlFile, JsonLine);

                    CompCount := CompCount + 1;
                finally
                    CompProps.Free;
                end;

                LibComp := LibIterator.NextSchObject;
            end;

            CurrentLib.SchIterator_Destroy(LibIterator);

            // If we got 0 components, retry
            if CompCount = 0 then
            begin
                CloseFile(JsonlFile);
                RetryIdx := RetryIdx + 1;
            end
            else
            begin
                // Success - finalize output
                CloseFile(JsonlFile);

                AddJSONInteger(ResultProps, 'component_count', CompCount);
                AddJSONInteger(ResultProps, 'retries', RetryIdx);

                OutputLines := TStringList.Create;
                try
                    OutputLines.Text := BuildJSONObject(ResultProps);
                    Result := WriteJSONToFile(OutputLines, ROOT_DIR + 'temp_library_components.json');
                finally
                    OutputLines.Free;
                end;
                Break;
            end;
        finally
            ResultProps.Free;
        end;
    end;

    // All retries exhausted with 0 components
    if CompCount = 0 then
    begin
        ResultProps := TStringList.Create;
        try
            AddJSONBoolean(ResultProps, 'success', False);
            AddJSONProperty(ResultProps, 'error', 'ENUMERATION_FAILED_AFTER_RETRIES');
            AddJSONProperty(ResultProps, 'library_path', LibraryPath, True);
            AddJSONInteger(ResultProps, 'retries', 5);
            AddJSONProperty(ResultProps, 'reason', 'SchIterator returned 0 components after 5 retries. The SchLib file may be corrupted or Altium failed to load it properly. Try restarting Altium Designer.');
            OutputLines := TStringList.Create;
            try
                OutputLines.Text := BuildJSONObject(ResultProps);
                Result := WriteJSONToFile(OutputLines, ROOT_DIR + 'temp_library_components.json');
            finally
                OutputLines.Free;
            end;
        finally
            ResultProps.Free;
        end;
    end;
end;

// Collapse JSON/Windows path quirks so comparisons match Altium DM_* paths (loaded before json_utils).
function McpNormalizeWindowsPath(const S: String): String;
var
    T, Prev: String;
    IsUnc: Boolean;
begin
    T := Trim(StringReplace(S, '/', '\', MkSet(rfReplaceAll)));
    if T = '' then
    begin
        Result := '';
        Exit;
    end;
    IsUnc := (Length(T) >= 2) and (T[1] = '\') and (T[2] = '\');
    if IsUnc then
    begin
        Delete(T, 1, 2);
        repeat
            Prev := T;
            T := StringReplace(T, '\\', '\', MkSet(rfReplaceAll));
        until T = Prev;
        Result := '\\' + T;
    end
    else
    begin
        repeat
            Prev := T;
            T := StringReplace(T, '\\', '\', MkSet(rfReplaceAll));
        until T = Prev;
        Result := T;
    end;
end;

// Read one JSON string or bare token from a single pretty-printed request.json line after KeySub.
function McpParseJSONLineValue(const Line, KeySub: String): String;
var
    KeyPos, ColonPos, i, LenLine: Integer;
    OutStr, Tail: String;
begin
    Result := '';
    KeyPos := Pos(KeySub, Line);
    if KeyPos = 0 then
        Exit;
    ColonPos := 0;
    for i := KeyPos + Length(KeySub) to Length(Line) do
        if Line[i] = ':' then
        begin
            ColonPos := i;
            Break;
        end;
    if ColonPos = 0 then
        Exit;
    i := ColonPos + 1;
    LenLine := Length(Line);
    while (i <= LenLine) and (Line[i] <= #32) do
        Inc(i);
    if i > LenLine then
        Exit;
    if Line[i] = '"' then
    begin
        Inc(i);
        OutStr := '';
        while i <= LenLine do
        begin
            if Line[i] = '\' then
            begin
                Inc(i);
                if i > LenLine then
                    Break;
                case Line[i] of
                    '\', '"':
                        OutStr := OutStr + Line[i];
                    'n':
                        OutStr := OutStr + #10;
                    'r':
                        OutStr := OutStr + #13;
                    't':
                        OutStr := OutStr + #9;
                else
                    OutStr := OutStr + Line[i];
                end;
                Inc(i);
            end
            else if Line[i] = '"' then
                Break
            else
            begin
                OutStr := OutStr + Line[i];
                Inc(i);
            end;
        end;
        Result := OutStr;
        Exit;
    end;
    Tail := Copy(Line, i, LenLine - i + 1);
    Tail := Trim(Tail);
    while (Length(Tail) > 0) and (Tail[Length(Tail)] = ',') do
        SetLength(Tail, Length(Tail) - 1);
    Result := Trim(Tail);
end;

// Parse a JSON string array from pretty-printed request (same pattern as schematic_edit).
procedure SchDataParseStringArray(RequestData: TStringList; const ArrayKeySub: String; List: TStringList);
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

const
    SCH_DRAW_FILTER_WIRES = 1;
    SCH_DRAW_FILTER_BUSES = 2;
    SCH_DRAW_FILTER_NETLABELS = 3;
    SCH_DRAW_FILTER_POWER = 4;
    SCH_DRAW_FILTER_TEXT = 5;
    SCH_DRAW_FILTER_JUNCTIONS = 6;
    SCH_DRAW_FILTER_PORTS = 7;
    SCH_DRAW_FILTER_OFFSHEET = 8;
    SCH_DRAW_FILTER_SHEETSYM = 9;
    SCH_DRAW_FILTER_DIRECTIVES = 10;
    SCH_DRAW_FILTER_FIGURES = 11;

// Helper function to check if a flag is set in the include list
function SchMcpHasIncludeFlag(const IncludeFlags: TStringList; const Flag: String): Boolean;
begin
    Result := (IncludeFlags <> nil) and (IncludeFlags.IndexOf(Flag) >= 0);
end;

procedure SchMcpSetAllIncludes(IncludeFlags: TStringList);
begin
    if IncludeFlags = nil then Exit;
    IncludeFlags.Clear;
    IncludeFlags.Add('sheet');
    IncludeFlags.Add('components');
    IncludeFlags.Add('wires');
    IncludeFlags.Add('buses');
    IncludeFlags.Add('net_labels');
    IncludeFlags.Add('power_ports');
    IncludeFlags.Add('text_labels');
    IncludeFlags.Add('junctions');
    IncludeFlags.Add('ports');
    IncludeFlags.Add('off_sheet_connectors');
    IncludeFlags.Add('sheet_symbols');
    IncludeFlags.Add('directives');
    IncludeFlags.Add('figures');
    IncludeFlags.Add('harness');
    IncludeFlags.Add('drawing_objects');
end;

procedure SchMcpResolveIncludes(const Tokens: TStringList; IncludeFlags: TStringList; var LegacyCombined: Boolean);
var
    i: Integer;
    T: String;
    AnyValid: Boolean;
begin
    LegacyCombined := (Tokens.Count = 0);
    if LegacyCombined then
        Exit;
    if IncludeFlags <> nil then
        IncludeFlags.Clear;
    AnyValid := False;
    for i := 0 to Tokens.Count - 1 do
    begin
        T := Trim(LowerCase(Tokens[i]));
        if T = 'all' then
        begin
            SchMcpSetAllIncludes(IncludeFlags);
            AnyValid := True;
            Exit;
        end
        else if T = 'sheet' then begin if IncludeFlags <> nil then IncludeFlags.Add('sheet'); AnyValid := True; end
        else if T = 'components' then begin if IncludeFlags <> nil then IncludeFlags.Add('components'); AnyValid := True; end
        else if T = 'wires' then begin if IncludeFlags <> nil then IncludeFlags.Add('wires'); AnyValid := True; end
        else if T = 'buses' then begin if IncludeFlags <> nil then IncludeFlags.Add('buses'); AnyValid := True; end
        else if T = 'net_labels' then begin if IncludeFlags <> nil then IncludeFlags.Add('net_labels'); AnyValid := True; end
        else if T = 'power_ports' then begin if IncludeFlags <> nil then IncludeFlags.Add('power_ports'); AnyValid := True; end
        else if T = 'text_labels' then begin if IncludeFlags <> nil then IncludeFlags.Add('text_labels'); AnyValid := True; end
        else if T = 'junctions' then begin if IncludeFlags <> nil then IncludeFlags.Add('junctions'); AnyValid := True; end
        else if T = 'ports' then begin if IncludeFlags <> nil then IncludeFlags.Add('ports'); AnyValid := True; end
        else if T = 'off_sheet_connectors' then begin if IncludeFlags <> nil then IncludeFlags.Add('off_sheet_connectors'); AnyValid := True; end
        else if T = 'sheet_symbols' then begin if IncludeFlags <> nil then IncludeFlags.Add('sheet_symbols'); AnyValid := True; end
        else if T = 'directives' then begin if IncludeFlags <> nil then IncludeFlags.Add('directives'); AnyValid := True; end
        else if T = 'figures' then begin if IncludeFlags <> nil then IncludeFlags.Add('figures'); AnyValid := True; end
        else if T = 'harness' then begin if IncludeFlags <> nil then IncludeFlags.Add('harness'); AnyValid := True; end
        else if T = 'drawing_objects' then begin if IncludeFlags <> nil then IncludeFlags.Add('drawing_objects'); AnyValid := True; end;
    end;
    if not AnyValid then
        LegacyCombined := True;
end;

procedure SchSerializeDrawingObject(const Sheet: String; Obj: ISch_BasicContainer; Drawings: TStringList); forward;

procedure SchAppendFilteredDrawings(CurrentSch: ISch_Document; const Sheet: String;
    Target: TStringList; FilterKind: Integer);
var
    It: ISch_Iterator;
    Prim: ISch_BasicContainer;
begin
    It := CurrentSch.SchIterator_Create;
    case FilterKind of
        SCH_DRAW_FILTER_WIRES:
            It.AddFilter_ObjectSet(MkSet(eWire));
        SCH_DRAW_FILTER_BUSES:
            It.AddFilter_ObjectSet(MkSet(eBus, eBusEntry));
        SCH_DRAW_FILTER_NETLABELS:
            It.AddFilter_ObjectSet(MkSet(eNetLabel));
        SCH_DRAW_FILTER_POWER:
            It.AddFilter_ObjectSet(MkSet(ePowerObject));
        SCH_DRAW_FILTER_TEXT:
            It.AddFilter_ObjectSet(MkSet(eLabel));
        SCH_DRAW_FILTER_JUNCTIONS:
            It.AddFilter_ObjectSet(MkSet(eJunction));
        SCH_DRAW_FILTER_PORTS:
            It.AddFilter_ObjectSet(MkSet(ePort));
        SCH_DRAW_FILTER_OFFSHEET:
            It.AddFilter_ObjectSet(MkSet(eCrossSheetConnector));
        SCH_DRAW_FILTER_SHEETSYM:
            It.AddFilter_ObjectSet(MkSet(eSheetSymbol));
        SCH_DRAW_FILTER_DIRECTIVES:
            It.AddFilter_ObjectSet(MkSet(eNoERC, eCompileMask));
        SCH_DRAW_FILTER_FIGURES:
            It.AddFilter_ObjectSet(MkSet(eLine, ePolyline, eBezier, ePolygon, eRectangle, eEllipse, eArc, eRoundRectangle, eImage, eTextFrame, eConnectionLine));
    else
        begin
            CurrentSch.SchIterator_Destroy(It);
            Exit;
        end;
    end;
    Prim := It.FirstSchObject;
    while Prim <> nil do
    begin
        SchSerializeDrawingObject(Sheet, Prim, Target);
        Prim := It.NextSchObject;
    end;
    CurrentSch.SchIterator_Destroy(It);
end;

function SchBuildSheetInfoObject(CurrentSch: ISch_Document; const SheetPath: String): String;
var
    SheetProps: TStringList;
begin
    SheetProps := TStringList.Create;
    try
        AddJSONProperty(SheetProps, 'schematic_full_path', SheetPath, True);
        AddJSONBoolean(SheetProps, 'use_custom_sheet', CurrentSch.UseCustomSheet);
        AddJSONNumber(SheetProps, 'sheet_size_x_mils', CoordToMils(CurrentSch.GetState_SheetSizeX));
        AddJSONNumber(SheetProps, 'sheet_size_y_mils', CoordToMils(CurrentSch.GetState_SheetSizeY));
        AddJSONNumber(SheetProps, 'custom_x_mils', CoordToMils(CurrentSch.GetState_CustomX));
        AddJSONNumber(SheetProps, 'custom_y_mils', CoordToMils(CurrentSch.GetState_CustomY));
        AddJSONInteger(SheetProps, 'sheet_style_ordinal', Ord(CurrentSch.GetState_SheetStyle));
        AddJSONNumber(SheetProps, 'snap_grid_mils', CoordToMils(CurrentSch.GetState_SnapGridSize));
        AddJSONNumber(SheetProps, 'visible_grid_mils', CoordToMils(CurrentSch.GetState_VisibleGridSize));
        AddJSONBoolean(SheetProps, 'snap_grid_on', CurrentSch.SnapGridOn);
        AddJSONBoolean(SheetProps, 'visible_grid_on', CurrentSch.VisibleGridOn);
        AddJSONBoolean(SheetProps, 'title_block_on', CurrentSch.TitleBlockOn);
        AddJSONBoolean(SheetProps, 'border_on', CurrentSch.BorderOn);
        AddJSONProperty(SheetProps, 'template_file_name', CurrentSch.GetState_TemplateFileName, True);
        Result := BuildJSONObject(SheetProps);
    finally
        SheetProps.Free;
    end;
end;

// Match API paths from JSON (forward slashes, escaped backslashes) to Altium DM_FullPath (Windows)
function SchPathsEqual(const PathA, PathB: String): Boolean;
var
    NA, NB: String;
begin
    NA := Trim(LowerCase(McpNormalizeWindowsPath(PathA)));
    NB := Trim(LowerCase(McpNormalizeWindowsPath(PathB)));
    Result := AnsiCompareText(NA, NB) = 0;
end;

procedure SchAddGraphicalBboxMils(Gr: ISch_GraphicalObject; Props: TStringList);
var
    R: TCoordRect;
begin
    R := Gr.BoundingRectangle;
    AddJSONNumber(Props, 'bbox_left_mils', CoordToMils(R.Left));
    AddJSONNumber(Props, 'bbox_right_mils', CoordToMils(R.Right));
    AddJSONNumber(Props, 'bbox_top_mils', CoordToMils(R.Top));
    AddJSONNumber(Props, 'bbox_bottom_mils', CoordToMils(R.Bottom));
end;

procedure SchAppendVerticesMilsJson(Props: TStringList; Poly: ISch_Polygon);
var
    VItems, Pair: TStringList;
    VC, i: Integer;
    Pt: TLocation;
begin
    VItems := TStringList.Create;
    try
        VC := Poly.VerticesCount;
        for i := 1 to VC do
        begin
            Pt := Poly.GetState_Vertex(i);
            Pair := TStringList.Create;
            try
                AddJSONNumber(Pair, 'x_mils', CoordToMils(Pt.X));
                AddJSONNumber(Pair, 'y_mils', CoordToMils(Pt.Y));
                VItems.Add(BuildJSONObject(Pair, 1));
            finally
                Pair.Free;
            end;
        end;
        if VItems.Count > 0 then
            Props.Add('"vertices_mils": ' + BuildJSONArray(VItems, '', 0));
    finally
        VItems.Free;
    end;
end;

function SchSchematicDrawingObjectKind(ObjId: TObjectId): String;
begin
    if ObjId = eWire then Result := 'eWire'
    else if ObjId = eBus then Result := 'eBus'
    else if ObjId = eBusEntry then Result := 'eBusEntry'
    else if ObjId = eNetLabel then Result := 'eNetLabel'
    else if ObjId = eLabel then Result := 'eLabel'
    else if ObjId = eLine then Result := 'eLine'
    else if ObjId = eJunction then Result := 'eJunction'
    else if ObjId = ePort then Result := 'ePort'
    else if ObjId = ePowerObject then Result := 'ePowerObject'
    else if ObjId = eCrossSheetConnector then Result := 'eCrossSheetConnector'
    else if ObjId = eSheetSymbol then Result := 'eSheetSymbol'
    else if ObjId = eNoERC then Result := 'eNoERC'
    else if ObjId = eConnectionLine then Result := 'eConnectionLine'
    else if ObjId = ePolyline then Result := 'ePolyline'
    else if ObjId = eBezier then Result := 'eBezier'
    else if ObjId = ePolygon then Result := 'ePolygon'
    else if ObjId = eRectangle then Result := 'eRectangle'
    else if ObjId = eEllipse then Result := 'eEllipse'
    else if ObjId = eArc then Result := 'eArc'
    else if ObjId = eRoundRectangle then Result := 'eRoundRectangle'
    else if ObjId = eImage then Result := 'eImage'
    else if ObjId = eTextFrame then Result := 'eTextFrame'
    else if ObjId = eCompileMask then Result := 'eCompileMask'
    else Result := 'unknown';
end;

// Non-component primitives on the sheet (wires, buses, graphics, labels, etc.).
// Sheet title-block / document parameters (eParameter) are omitted — noise for MCP; component parameters stay under components[].
procedure SchSerializeDrawingObject(const Sheet: String; Obj: ISch_BasicContainer; Drawings: TStringList);
var
    Props: TStringList;
    Gr: ISch_GraphicalObject;
    Poly: ISch_Polygon;
    Ln: ISch_Line;
    NL: ISch_NetLabel;
    Lb: ISch_Label;
    Pr: ISch_Port;
    SSym: ISch_SheetSymbol;
    Jun: ISch_Junction;
begin
    Props := TStringList.Create;
    try
        AddJSONProperty(Props, 'sheet', Sheet);
        AddJSONProperty(Props, 'object_kind', SchSchematicDrawingObjectKind(Obj.ObjectId));
        AddJSONInteger(Props, 'object_id', Ord(Obj.ObjectId));

        Gr := Obj;
        SchAddGraphicalBboxMils(Gr, Props);

        if (Obj.ObjectId = eWire) or (Obj.ObjectId = eBus) or
           (Obj.ObjectId = ePolyline) or (Obj.ObjectId = eBezier) or (Obj.ObjectId = ePolygon) then
        begin
            Poly := Obj;
            SchAppendVerticesMilsJson(Props, Poly);
        end
        else if (Obj.ObjectId = eBusEntry) or (Obj.ObjectId = eLine) or (Obj.ObjectId = eConnectionLine) then
        begin
            Ln := Obj;
            AddJSONNumber(Props, 'x1_mils', CoordToMils(Ln.Location.X));
            AddJSONNumber(Props, 'y1_mils', CoordToMils(Ln.Location.Y));
            AddJSONNumber(Props, 'x2_mils', CoordToMils(Ln.Corner.X));
            AddJSONNumber(Props, 'y2_mils', CoordToMils(Ln.Corner.Y));
        end
        else if Obj.ObjectId = eNetLabel then
        begin
            NL := Obj;
            AddJSONProperty(Props, 'text', NL.Text);
            AddJSONNumber(Props, 'x_mils', CoordToMils(NL.Location.X));
            AddJSONNumber(Props, 'y_mils', CoordToMils(NL.Location.Y));
        end
        else if (Obj.ObjectId = eLabel) or (Obj.ObjectId = ePowerObject) or (Obj.ObjectId = eCrossSheetConnector) then
        begin
            Lb := Obj;
            AddJSONProperty(Props, 'text', Lb.Text);
            AddJSONNumber(Props, 'x_mils', CoordToMils(Lb.Location.X));
            AddJSONNumber(Props, 'y_mils', CoordToMils(Lb.Location.Y));
        end
        else if Obj.ObjectId = eJunction then
        begin
            Jun := Obj;
            AddJSONNumber(Props, 'x_mils', CoordToMils(Jun.Location.X));
            AddJSONNumber(Props, 'y_mils', CoordToMils(Jun.Location.Y));
        end
        else if Obj.ObjectId = ePort then
        begin
            Pr := Obj;
            AddJSONProperty(Props, 'name', Pr.Name);
            AddJSONNumber(Props, 'x_mils', CoordToMils(Pr.Location.X));
            AddJSONNumber(Props, 'y_mils', CoordToMils(Pr.Location.Y));
        end
        else if Obj.ObjectId = eSheetSymbol then
        begin
            SSym := Obj;
            AddJSONProperty(Props, 'sheet_file_name', SSym.SheetFileName);
            AddJSONProperty(Props, 'sheet_name', SSym.SheetName);
        end;

        Drawings.Add(BuildJSONObject(Props, 1));
    finally
        Props.Free;
    end;
end;

procedure SchCollectDrawingObjectsForSheet(CurrentSch: ISch_Document; const Sheet: String; Drawings: TStringList);
var
    It: ISch_Iterator;
    Prim: ISch_BasicContainer;
begin
    It := CurrentSch.SchIterator_Create;
    It.AddFilter_ObjectSet(MkSet(
        eWire, eBus, eBusEntry, eNetLabel, eLabel, eLine, eJunction, ePort, ePowerObject,
        eCrossSheetConnector, eSheetSymbol, eNoERC, eConnectionLine,
        ePolyline, eBezier, ePolygon, eRectangle, eEllipse, eArc, eRoundRectangle,
        eImage, eTextFrame, eCompileMask));
    Prim := It.FirstSchObject;
    while Prim <> nil do
    begin
        SchSerializeDrawingObject(Sheet, Prim, Drawings);
        Prim := It.NextSchObject;
    end;
    CurrentSch.SchIterator_Destroy(It);
end;

// project_full_path / schematic_full_path / sheet file name: all optional (empty = focused project, all sheets).
// RequestData: optional include_queries JSON array; when absent, legacy shape { components, drawing_objects } only.
function GetSchematicData(ROOT_DIR: String; ProjectFullPath, SchematicFullPath, SheetFileFilter: String;
    RequestData: TStringList): String;
var
    WS          : IWorkspace;
    Project     : IProject;
    Prj, NamedMatch, RealMatch, FreeMatch : IProject;
    Doc         : IDocument;
    CurrentSch  : ISch_Document;
    Iterator    : ISch_Iterator;
    PIterator   : ISch_Iterator;
    Component   : ISch_Component;
    Parameter, NextParameter : ISch_Parameter;
    Rect        : TCoordRect;
    ComponentsArray : TStringList;
    DrawingsArray   : TStringList;
    RootPairs       : TStringList;
    CompProps   : TStringList;
    ParamsProps : TStringList;
    OutputLines : TStringList;
    Designator, Sheet, ParameterName, ParameterValue : String;
    x, y, width, height, rotation : String;
    left, right, top, bottom : String;
    i, pi       : Integer;
    SchematicCount, ComponentCount : Integer;
    Found       : Boolean;
    IncludeTokens   : TStringList;
    IncFlags        : TStringList;
    LegacyCombined  : Boolean;
    SheetsJsonParts : TStringList;
    WiresSL, BusesSL, NetLabelsSL, PowerSL, TextSL, JunSL, PortsSL, OffSL, SheetSymSL, DirSL, FigSL : TStringList;
    EchoSL          : TStringList;
begin
    Result := '';

    WS := GetWorkspace;
    if WS = nil then
    begin
        Result := 'ERROR: NO_WORKSPACE';
        Exit;
    end;

    Project := nil;

    if ProjectFullPath <> '' then
        ProjectFullPath := McpNormalizeWindowsPath(ProjectFullPath);
    if SchematicFullPath <> '' then
        SchematicFullPath := McpNormalizeWindowsPath(SchematicFullPath);

    if SchematicFullPath <> '' then
    begin
        // Same three-way preference as CheckSchematicConnectivityData: a sheet
        // open BOTH as free document and as a real project member must resolve
        // to the real project (named project > any .PrjPcb > Free Documents).
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
                if SchPathsEqual(Doc.DM_FullPath, SchematicFullPath) then
                begin
                    Found := True;
                    if (ProjectFullPath <> '') and SchPathsEqual(Prj.DM_ProjectFullPath, ProjectFullPath) then
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
            if (WS.DM_Projects(pi) <> nil) and SchPathsEqual(WS.DM_Projects(pi).DM_ProjectFullPath, ProjectFullPath) then
            begin
                Project := WS.DM_Projects(pi);
                Break;
            end;
        end;
        if Project = nil then
        begin
            // Diagnostics: dump every enumerated project path so path-form
            // mismatches are visible in the error message.
            Result := 'ERROR: PROJECT_NOT_FOUND (requested="' + ProjectFullPath + '" len=' + IntToStr(Length(ProjectFullPath));
            for pi := 0 to WS.DM_ProjectCount - 1 do
            begin
                if WS.DM_Projects(pi) = nil then
                    Continue;
                Result := Result + ' | #' + IntToStr(pi) + '="' + WS.DM_Projects(pi).DM_ProjectFullPath +
                    '" len=' + IntToStr(Length(WS.DM_Projects(pi).DM_ProjectFullPath));
            end;
            Result := Result + ')';
            Exit;
        end;
    end
    else
        Project := WS.DM_FocusedProject;

    if Project = nil then
    begin
        Result := 'ERROR: NO_FOCUSED_PROJECT';
        Exit;
    end;

    IncludeTokens := TStringList.Create;
    IncFlags := TStringList.Create;
    try
        if RequestData <> nil then
            SchDataParseStringArray(RequestData, '"include_queries"', IncludeTokens);
        SchMcpResolveIncludes(IncludeTokens, IncFlags, LegacyCombined);

    // Create array for components and non-component drawing primitives
    ComponentsArray := TStringList.Create;
    DrawingsArray := TStringList.Create;
    SheetsJsonParts := nil;
    WiresSL := nil;
    BusesSL := nil;
    NetLabelsSL := nil;
    PowerSL := nil;
    TextSL := nil;
    JunSL := nil;
    PortsSL := nil;
    OffSL := nil;
    SheetSymSL := nil;
    DirSL := nil;
    FigSL := nil;
    if not LegacyCombined then
    begin
        SheetsJsonParts := TStringList.Create;
        WiresSL := TStringList.Create;
        BusesSL := TStringList.Create;
        NetLabelsSL := TStringList.Create;
        PowerSL := TStringList.Create;
        TextSL := TStringList.Create;
        JunSL := TStringList.Create;
        PortsSL := TStringList.Create;
        OffSL := TStringList.Create;
        SheetSymSL := TStringList.Create;
        DirSL := TStringList.Create;
        FigSL := TStringList.Create;
    end;

    try
        // Count the number of schematic documents
        SchematicCount := 0;
        For i := 0 to Project.DM_LogicalDocumentCount - 1 Do
        Begin
            Doc := Project.DM_LogicalDocuments(i);
            If Doc.DM_DocumentKind = 'SCH' Then
                SchematicCount := SchematicCount + 1;
        End;

        // Process each schematic document
        ComponentCount := 0;
        For i := 0 to Project.DM_LogicalDocumentCount - 1 Do
        Begin
            Doc := Project.DM_LogicalDocuments(i);
            If Doc.DM_DocumentKind = 'SCH' Then
            Begin
                if SchematicFullPath <> '' then
                begin
                    if not SchPathsEqual(Doc.DM_FullPath, SchematicFullPath) then
                        Continue;
                end
                else if SheetFileFilter <> '' then
                begin
                    if AnsiCompareText(LowerCase(ExtractFileName(Doc.DM_FullPath)), LowerCase(SheetFileFilter)) <> 0 then
                        Continue;
                end;

                // Open the schematic document
                Client.OpenDocument('SCH', Doc.DM_FullPath);
                CurrentSch := SchServer.GetSchDocumentByPath(Doc.DM_FullPath);

                If (CurrentSch <> Nil) Then
                Begin
                    if LegacyCombined or SchMcpHasIncludeFlag(IncFlags, 'components') then
                    begin
                    // Get schematic components
                    Iterator := CurrentSch.SchIterator_Create;
                    Iterator.AddFilter_ObjectSet(MkSet(eSchComponent));

                    Component := Iterator.FirstSchObject;
                    While (Component <> Nil) Do
                    Begin
                        // Create component properties
                        CompProps := TStringList.Create;
                        
                        try
                            // Get basic component properties
                            Designator := Component.Designator.Text;
                            Sheet := Doc.DM_FullPath;

                            // Get position, dimensions and rotation
                            x := FloatToStr(CoordToMils(Component.Location.X));
                            y := FloatToStr(CoordToMils(Component.Location.Y));

                            Rect := Component.BoundingRectangle;
                            left := FloatToStr(CoordToMils(Rect.Left));
                            right := FloatToStr(CoordToMils(Rect.Right));
                            top := FloatToStr(CoordToMils(Rect.Top));
                            bottom := FloatToStr(CoordToMils(Rect.Bottom));

                            width := FloatToStr(CoordToMils(Rect.Right - Rect.Left));
                            height := FloatToStr(CoordToMils(Rect.Bottom - Rect.Top));

                            If Component.Orientation = eRotate0 Then
                                rotation := '0'
                            Else If Component.Orientation = eRotate90 Then
                                rotation := '90'
                            Else If Component.Orientation = eRotate180 Then
                                rotation := '180'
                            Else If Component.Orientation = eRotate270 Then
                                rotation := '270'
                            Else
                                rotation := '0';

                            // Add component properties
                            AddJSONProperty(CompProps, 'designator', Designator);
                            AddJSONProperty(CompProps, 'sheet', Sheet);
                            AddJSONNumber(CompProps, 'schematic_x', StrToFloat(x));
                            AddJSONNumber(CompProps, 'schematic_y', StrToFloat(y));
                            AddJSONNumber(CompProps, 'schematic_width', StrToFloat(width));
                            AddJSONNumber(CompProps, 'schematic_height', StrToFloat(height));
                            AddJSONNumber(CompProps, 'schematic_rotation', StrToFloat(rotation));
                            
                            // Get parameters
                            ParamsProps := TStringList.Create;
                            try
                                // Create parameter iterator
                                PIterator := Component.SchIterator_Create;
                                PIterator.AddFilter_ObjectSet(MkSet(eParameter));

                                Parameter := PIterator.FirstSchObject;
                                
                                // Process all parameters
                                while (Parameter <> nil) do
                                begin
                                    // Get this parameter's info
                                    ParameterName := Parameter.Name;
                                    ParameterValue := Parameter.Text;

                                    // Add parameter to the list
                                    AddJSONProperty(ParamsProps, ParameterName, ParameterValue);
                                    
                                    // Move to next parameter
                                    Parameter := PIterator.NextSchObject;
                                end;

                                Component.SchIterator_Destroy(PIterator);
                                
                                // Add parameters to component
                                CompProps.Add('"parameters": ' + BuildJSONObject(ParamsProps, 2));
                                
                                // Add to components array
                                ComponentsArray.Add(BuildJSONObject(CompProps, 1));
                                ComponentCount := ComponentCount + 1;
                            finally
                                ParamsProps.Free;
                            end;
                        finally
                            CompProps.Free;
                        end;

                        // Move to next component
                        Component := Iterator.NextSchObject;
                    End;

                    CurrentSch.SchIterator_Destroy(Iterator);
                    end;

                    if LegacyCombined then
                        SchCollectDrawingObjectsForSheet(CurrentSch, Doc.DM_FullPath, DrawingsArray)
                    else begin
                        if SchMcpHasIncludeFlag(IncFlags, 'sheet') and (SheetsJsonParts <> nil) then
                            SheetsJsonParts.Add(SchBuildSheetInfoObject(CurrentSch, Doc.DM_FullPath));
                        if SchMcpHasIncludeFlag(IncFlags, 'wires') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, WiresSL, SCH_DRAW_FILTER_WIRES);
                        if SchMcpHasIncludeFlag(IncFlags, 'buses') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, BusesSL, SCH_DRAW_FILTER_BUSES);
                        if SchMcpHasIncludeFlag(IncFlags, 'net_labels') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, NetLabelsSL, SCH_DRAW_FILTER_NETLABELS);
                        if SchMcpHasIncludeFlag(IncFlags, 'power_ports') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, PowerSL, SCH_DRAW_FILTER_POWER);
                        if SchMcpHasIncludeFlag(IncFlags, 'text_labels') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, TextSL, SCH_DRAW_FILTER_TEXT);
                        if SchMcpHasIncludeFlag(IncFlags, 'junctions') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, JunSL, SCH_DRAW_FILTER_JUNCTIONS);
                        if SchMcpHasIncludeFlag(IncFlags, 'ports') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, PortsSL, SCH_DRAW_FILTER_PORTS);
                        if SchMcpHasIncludeFlag(IncFlags, 'off_sheet_connectors') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, OffSL, SCH_DRAW_FILTER_OFFSHEET);
                        if SchMcpHasIncludeFlag(IncFlags, 'sheet_symbols') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, SheetSymSL, SCH_DRAW_FILTER_SHEETSYM);
                        if SchMcpHasIncludeFlag(IncFlags, 'directives') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, DirSL, SCH_DRAW_FILTER_DIRECTIVES);
                        if SchMcpHasIncludeFlag(IncFlags, 'figures') then
                            SchAppendFilteredDrawings(CurrentSch, Doc.DM_FullPath, FigSL, SCH_DRAW_FILTER_FIGURES);
                        if SchMcpHasIncludeFlag(IncFlags, 'drawing_objects') then
                            SchCollectDrawingObjectsForSheet(CurrentSch, Doc.DM_FullPath, DrawingsArray);
                    end;
                End;
            End;
        End;

        // Root JSON: legacy { components, drawing_objects } or filtered buckets + include_queries echo
        OutputLines := TStringList.Create;
        RootPairs := TStringList.Create;
        EchoSL := TStringList.Create;
        try
            if LegacyCombined then
            begin
                RootPairs.Add(JSONPairStr('components', BuildJSONArray(ComponentsArray), False));
                RootPairs.Add(JSONPairStr('drawing_objects', BuildJSONArray(DrawingsArray), False));
            end
            else begin
                RootPairs.Add(JSONPairStr('schematic_data_mode', 'filtered', True));
                for i := 0 to IncludeTokens.Count - 1 do
                    EchoSL.Add('"' + JSONEscapeString(IncludeTokens[i]) + '"');
                RootPairs.Add(JSONPairStr('include_queries', BuildJSONArray(EchoSL, '', 0), False));
                if SchMcpHasIncludeFlag(IncFlags, 'sheet') and (SheetsJsonParts <> nil) then
                    RootPairs.Add(JSONPairStr('sheets', BuildJSONArray(SheetsJsonParts, '', 0), False));
                if SchMcpHasIncludeFlag(IncFlags, 'components') then
                    RootPairs.Add(JSONPairStr('components', BuildJSONArray(ComponentsArray), False));
                if SchMcpHasIncludeFlag(IncFlags, 'wires') then
                    RootPairs.Add(JSONPairStr('wires', BuildJSONArray(WiresSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'buses') then
                    RootPairs.Add(JSONPairStr('buses', BuildJSONArray(BusesSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'net_labels') then
                    RootPairs.Add(JSONPairStr('net_labels', BuildJSONArray(NetLabelsSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'power_ports') then
                    RootPairs.Add(JSONPairStr('power_ports', BuildJSONArray(PowerSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'text_labels') then
                    RootPairs.Add(JSONPairStr('text_labels', BuildJSONArray(TextSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'junctions') then
                    RootPairs.Add(JSONPairStr('junctions', BuildJSONArray(JunSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'ports') then
                    RootPairs.Add(JSONPairStr('ports', BuildJSONArray(PortsSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'off_sheet_connectors') then
                    RootPairs.Add(JSONPairStr('off_sheet_connectors', BuildJSONArray(OffSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'sheet_symbols') then
                    RootPairs.Add(JSONPairStr('sheet_symbols', BuildJSONArray(SheetSymSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'directives') then
                    RootPairs.Add(JSONPairStr('directives', BuildJSONArray(DirSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'figures') then
                    RootPairs.Add(JSONPairStr('figures', BuildJSONArray(FigSL), False));
                if SchMcpHasIncludeFlag(IncFlags, 'drawing_objects') then
                    RootPairs.Add(JSONPairStr('drawing_objects', BuildJSONArray(DrawingsArray), False));
                if SchMcpHasIncludeFlag(IncFlags, 'harness') then
                    RootPairs.Add('"harness": []');
            end;
            OutputLines.Text := BuildJSONObject(RootPairs);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR+'temp_schematic_data.json');
        finally
            EchoSL.Free;
            RootPairs.Free;
            OutputLines.Free;
        end;
    finally
        if FigSL <> nil then FigSL.Free;
        if DirSL <> nil then DirSL.Free;
        if SheetSymSL <> nil then SheetSymSL.Free;
        if OffSL <> nil then OffSL.Free;
        if PortsSL <> nil then PortsSL.Free;
        if JunSL <> nil then JunSL.Free;
        if TextSL <> nil then TextSL.Free;
        if PowerSL <> nil then PowerSL.Free;
        if NetLabelsSL <> nil then NetLabelsSL.Free;
        if BusesSL <> nil then BusesSL.Free;
        if WiresSL <> nil then WiresSL.Free;
        if SheetsJsonParts <> nil then SheetsJsonParts.Free;
        DrawingsArray.Free;
        ComponentsArray.Free;
    end;
    finally
        IncludeTokens.Free;
        IncFlags.Free;
    end;
end;

// Export per-pin flattened net names from the COMPILED data model for the
// check_connectivity audit. This is the authoritative connectivity source:
// the Altium compiler itself resolves wires / junctions / T-contacts /
// crossings / power ports / net labels, so the MCP side does not have to
// guess those semantics geometrically.
// DM API usage verified against the official Connectivity.pas example:
//   Project.DM_Compile ......................... Connectivity.pas L292
//   Project.DM_PhysicalDocumentCount /
//   Project.DM_PhysicalDocuments(J) ............ Connectivity.pas L217-218
//   Doc.DM_ComponentCount / DM_Components(J) ... Connectivity.pas L171-173
//   Comp.DM_SubPartCount / DM_SubParts(n) ...... Connectivity.pas L175, L190
//   Pin.DM_PinNumber / DM_FlattenedNetName ..... Connectivity.pas L181
//   '?' net name = unconnected pin ............. Connectivity.pas L194
function CheckSchematicConnectivityData(ROOT_DIR: String; ProjectFullPath, SchematicFullPath, SheetFileFilter: String): String;
var
    WS              : IWorkspace;
    Project         : IProject;
    Prj, NamedMatch, RealMatch, FreeMatch : IProject;
    Doc             : IDocument;
    Comp            : Component;
    MultiPart       : IPart;
    Pin             : IPin;
    RootProps       : TStringList;
    PinNetsArray    : TStringList;
    PinProps        : TStringList;
    OutputLines     : TStringList;
    NetName         : String;
    Unconnected     : Boolean;
    pi, i, j, k, n  : Integer;
    Found           : Boolean;
    PinCount        : Integer;
begin
    Result := '';
    WS := GetWorkspace;
    if WS = nil then
    begin
        Result := 'ERROR: NO_WORKSPACE';
        Exit;
    end;

    if ProjectFullPath <> '' then
        ProjectFullPath := McpNormalizeWindowsPath(ProjectFullPath);
    if SchematicFullPath <> '' then
        SchematicFullPath := McpNormalizeWindowsPath(SchematicFullPath);

    // Project resolution — same three-way scoping as GetSchematicData.
    // A sheet can be open BOTH as a free document and as a member of a real
    // project (AD session churn reopens sheets as free docs). Compiling Free
    // Documents yields ZERO physical documents (empty DM layer), so prefer:
    // the project named by project_full_path, then any real .PrjPcb, then
    // Free Documents only as a last resort.
    Project := nil;
    NamedMatch := nil;
    RealMatch := nil;
    FreeMatch := nil;
    if SchematicFullPath <> '' then
    begin
        Found := False;
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
                if SchPathsEqual(Doc.DM_FullPath, SchematicFullPath) then
                begin
                    Found := True;
                    if (ProjectFullPath <> '') and SchPathsEqual(Prj.DM_ProjectFullPath, ProjectFullPath) then
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
            if (WS.DM_Projects(pi) <> nil) and SchPathsEqual(WS.DM_Projects(pi).DM_ProjectFullPath, ProjectFullPath) then
            begin
                Project := WS.DM_Projects(pi);
                Break;
            end;
        end;
        if Project = nil then
        begin
            // Diagnostics: dump every enumerated project path so path-form
            // mismatches are visible in the error message.
            Result := 'ERROR: PROJECT_NOT_FOUND (requested="' + ProjectFullPath + '" len=' + IntToStr(Length(ProjectFullPath));
            for pi := 0 to WS.DM_ProjectCount - 1 do
            begin
                if WS.DM_Projects(pi) = nil then
                    Continue;
                Result := Result + ' | #' + IntToStr(pi) + '="' + WS.DM_Projects(pi).DM_ProjectFullPath +
                    '" len=' + IntToStr(Length(WS.DM_Projects(pi).DM_ProjectFullPath));
            end;
            Result := Result + ')';
            Exit;
        end;
    end
    else
        Project := WS.DM_FocusedProject;

    if Project = nil then
    begin
        Result := 'ERROR: NO_FOCUSED_PROJECT';
        Exit;
    end;

    // Compile so logical documents expand into physical documents with nets.
    Project.DM_Compile;

    RootProps := TStringList.Create;
    PinNetsArray := TStringList.Create;
    try
        PinCount := 0;
        for i := 0 to Project.DM_PhysicalDocumentCount - 1 do
        begin
            Doc := Project.DM_PhysicalDocuments(i);
            if Doc.DM_DocumentKind <> 'SCH' then
                Continue;
            if SchematicFullPath <> '' then
            begin
                if not SchPathsEqual(Doc.DM_FullPath, SchematicFullPath) then
                    Continue;
            end
            else if SheetFileFilter <> '' then
            begin
                if AnsiCompareText(LowerCase(ExtractFileName(Doc.DM_FullPath)), LowerCase(SheetFileFilter)) <> 0 then
                    Continue;
            end;

            for j := 0 to Doc.DM_ComponentCount - 1 do
            begin
                Comp := Doc.DM_Components(j);
                if Comp = nil then
                    Continue;

                if Comp.DM_SubPartCount = 1 then
                begin
                    for k := 0 to Comp.DM_PinCount - 1 do
                    begin
                        Pin := Comp.DM_Pins(k);
                        NetName := Pin.DM_FlattenedNetName;
                        Unconnected := (NetName = '?') or (NetName = '');
                        PinProps := TStringList.Create;
                        try
                            AddJSONProperty(PinProps, 'designator', Comp.DM_FullLogicalDesignator);
                            AddJSONProperty(PinProps, 'pin', Pin.DM_PinNumber);
                            AddJSONProperty(PinProps, 'net', NetName);
                            AddJSONBoolean(PinProps, 'unconnected', Unconnected);
                            PinNetsArray.Add(BuildJSONObject(PinProps, 1));
                        finally
                            PinProps.Free;
                        end;
                        PinCount := PinCount + 1;
                    end;
                end
                else if Comp.DM_SubPartCount > 1 then
                begin
                    for n := 0 to Comp.DM_SubPartCount - 1 do
                    begin
                        MultiPart := Comp.DM_SubParts(n);
                        for k := 0 to MultiPart.DM_PinCount - 1 do
                        begin
                            Pin := MultiPart.DM_Pins(k);
                            NetName := Pin.DM_FlattenedNetName;
                            // Connectivity.pas skips '?' nets for multi-part
                            // export; the audit needs them too, so keep all.
                            Unconnected := (NetName = '?') or (NetName = '');
                            PinProps := TStringList.Create;
                            try
                                AddJSONProperty(PinProps, 'designator', MultiPart.DM_FullLogicalDesignator);
                                AddJSONProperty(PinProps, 'pin', Pin.DM_PinNumber);
                                AddJSONProperty(PinProps, 'net', NetName);
                                AddJSONBoolean(PinProps, 'unconnected', Unconnected);
                                PinNetsArray.Add(BuildJSONObject(PinProps, 1));
                            finally
                                PinProps.Free;
                            end;
                            PinCount := PinCount + 1;
                        end;
                    end;
                end;
            end;
        end;

        AddJSONProperty(RootProps, 'success', 'true');
        AddJSONProperty(RootProps, 'action', 'check_connectivity_dm');
        AddJSONProperty(RootProps, 'project', Project.DM_ProjectFullPath);
        AddJSONBoolean(RootProps, 'compiled', True);
        RootProps.Add('"pin_nets": ' + BuildJSONArray(PinNetsArray, '', 0));
        AddJSONInteger(RootProps, 'pin_count', PinCount);

        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(RootProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + 'temp_connectivity_dm.json');
        finally
            OutputLines.Free;
        end;
    finally
        PinNetsArray.Free;
        RootProps.Free;
    end;
end;
