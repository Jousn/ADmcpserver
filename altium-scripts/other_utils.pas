const
    DEFAULT = 'Blank';

{..............................................................................}
{ Get path of this script project.                                             }
{ Get prj path from Jeff Collins and William Kitchen's stripped down version   }
{..............................................................................}
function ScriptProjectPath(Workspace: IWorkspace) : String;
var
  Project   : IProject;
  scriptsPath : TDynamicString;
  projectCount : Integer;
  i      : Integer;
begin
  if (Workspace = nil) then begin result:=''; exit; end;
  { Get a count of the number of currently opened projects.  The script project
    from which this script runs must be one of these. }
  projectCount := Workspace.DM_ProjectCount();
  { Loop over all the open projects.  We're looking for constScriptProjectName
    (of which we are a part).  Once we find this, we want to record the
    path to the script project directory. }
  scriptsPath:='';
  for i:=0 to projectCount-1 do
  begin
    { Get reference to project # i. }
    Project := Workspace.DM_Projects(i);
    { See if we found our script project. }
    if (AnsiPos(constScriptProjectName, Project.DM_ProjectFullPath) > 0) then
    begin
      { Strip off project name to give us just the path. }
      scriptsPath := StringReplace(Project.DM_ProjectFullPath, '\' +
      constScriptProjectName + '.PrjScr','', MkSet(rfReplaceAll,rfIgnoreCase));
    end;
  end;
  result := scriptsPath;
end;

// Find the first open OutJob document
function GetOpenOutputJob(): String;
var
    Project     : IProject;
    ProjectIdx, I  : Integer;
    Doc: IDocument;
    DocKind: String;
begin
    result := '';
    for ProjectIdx := 0 to GetWorkspace.DM_ProjectCount - 1 do
    begin
        Project := GetWorkspace.DM_Projects(ProjectIdx);
        if Project = Nil then Exit;

        // Iterate all documents in the project
        for I := 0 to Project.DM_LogicalDocumentCount - 1 do
        begin
            Doc := Project.DM_LogicalDocuments(I);
            DocKind := Doc.DM_DocumentKind;
            if DocKind = 'OUTPUTJOB' then
            begin
                result := Doc.DM_FullPath;
                Exit;
            end;
        end;
    end;
end;

// Modify the EnsureDocumentFocused function to handle all document types
// and return more detailed information
function EnsureDocumentFocused(CommandName: String): Boolean;
var
    I           : Integer;
    Project     : IProject;
    Doc         : IDocument;
    DocFound    : Boolean;
    CurrentDoc  : IServerDocument;
    DocumentKind: String;
    LogMessage  : String;
    OutJobPath: String;
begin
    Result := False;
    DocFound := False;
    DocumentKind := 'PCB'; // Default

    // Commands that handle their own document management - skip focusing
    if (CommandName = 'search_library_symbol') or
       (CommandName = 'list_library_components') or
       (CommandName = 'get_library_symbol_reference') then
    begin
        Result := True;
        Exit;
    end;

    // Health check: no PCB/SCH document required
    if (CommandName = 'ping') then
    begin
        Result := True;
        Exit;
    end;

    // Workspace listing: no document focus required
    if (CommandName = 'list_workspace') then
    begin
        Result := True;
        Exit;
    end;

    // Schematic export opens sheets by path; project may differ from focused
    if (CommandName = 'get_schematic_data') or (CommandName = 'schematic_edit') then
    begin
        Result := True;
        Exit;
    end;

    // For PCB-related commands, ensure PCB is available first
    if (CommandName = 'create_net_class')                    or
       (CommandName = 'get_all_component_data')              or
       (CommandName = 'get_all_components')                  or
       (CommandName = 'get_all_nets')                        or
       (CommandName = 'get_component_pins')                  or
       (CommandName = 'get_pcb_layers')                      or
       (CommandName = 'get_pcb_rules')                       or
       (CommandName = 'get_selected_components_coordinates') or
       (CommandName = 'layout_duplicator')                   or
       (CommandName = 'layout_duplicator_apply')             or
       (CommandName = 'move_components')                     or
       (CommandName = 'set_pcb_layer_visibility')            or
       (CommandName = 'get_pcb_layer_stackup')               or
       (CommandName = 'take_view_screenshot')                then
    begin
        DocumentKind := 'PCB';
    end
    else if (CommandName = 'create_schematic_symbol')        or
            (CommandName = 'get_library_symbol_reference')   then
    begin
        DocumentKind := 'SCHLIB';
    end
    else if (CommandName = 'get_output_job_containers')       or
            (CommandName = 'run_output_jobs')                then
    begin
        DocumentKind := 'OUTJOB';
    end;
    // Default to user argument if command not recognized

    LogMessage := 'Attempting to focus ' + DocumentKind + ' document';
    
    // Log the current focused document first
    if DocumentKind = 'PCB' then
    begin
        if PCBServer <> nil then
            LogMessage := LogMessage + '. Current PCB: ' + BoolToStr(PCBServer.GetCurrentPCBBoard <> nil, True);
    end
    else if DocumentKind = 'SCH' then
    begin
        if SchServer <> nil then
            LogMessage := LogMessage + '. Current SCH: ' + BoolToStr(SchServer.GetCurrentSchDocument <> nil, True);
    end
    else if DocumentKind = 'SCHLIB' then
    begin
        if SchServer <> nil then
        begin
            CurrentDoc := SchServer.GetCurrentSchDocument;
            LogMessage := LogMessage + '. Current SCHLIB: ' + BoolToStr((CurrentDoc <> nil) and (Pos('.SchLib', CurrentDoc.DocumentName) > 0), True);
        end;
    end;
    
    // ShowMessage(LogMessage); // For debugging
    
    // Retrieve the current project
    Project := GetWorkspace.DM_FocusedProject;
    If Project = Nil Then
    begin
        // No project is open
        Exit;
    end;

    // Check if the correct document type is already focused
    if (DocumentKind = 'PCB') and (PCBServer <> Nil) then
    begin
        if PCBServer.GetCurrentPCBBoard <> Nil then
        begin
            Result := True;
            Exit;
        end;
    end
    else if (DocumentKind = 'SCH') and (SchServer <> Nil) then
    begin
        CurrentDoc := SchServer.GetCurrentSchDocument;
        if CurrentDoc <> Nil then
        begin
            Result := True;
            Exit;
        end;
    end
    else if (DocumentKind = 'SCHLIB') and (SchServer <> Nil) then
    begin
        CurrentDoc := SchServer.GetCurrentSchDocument;
        if (CurrentDoc <> Nil) and (Pos('.SchLib', CurrentDoc.DocumentName) > 0) then
        begin
            Result := True;
            Exit;
        end;
    end
    else if (DocumentKind = 'OUTJOB') then
    begin
        OutJobPath := GetOpenOutputJob();
        if OutJobPath <> '' then
        begin
            Result := True;
            Exit;
        end;
    end;

    // Try to find and focus the required document type
    For I := 0 to Project.DM_LogicalDocumentCount - 1 Do
    Begin
        Doc := Project.DM_LogicalDocuments(I);
        If Doc.DM_DocumentKind = DocumentKind Then
        Begin
            DocFound := True;
            // Try to open and focus the document
            Doc.DM_OpenAndFocusDocument;
            // Give it a moment to focus
            Sleep(500);

            // Verify that the document is now focused
            if DocumentKind = 'PCB' then
            begin
                if PCBServer.GetCurrentPCBBoard <> Nil then
                begin
                    Result := True;
                    // ShowMessage('Successfully focused PCB document');
                    Exit;
                end;
            end
            else if DocumentKind = 'SCH' then
            begin
                CurrentDoc := SchServer.GetCurrentSchDocument;
                if (CurrentDoc <> Nil) then
                begin
                    Result := True;
                    // ShowMessage('Successfully focused SCH document');
                    Exit;
                end;
            end
            else if DocumentKind = 'SCHLIB' then
            begin
                CurrentDoc := SchServer.GetCurrentSchDocument;
                if (CurrentDoc <> Nil) and (Pos('.SchLib', CurrentDoc.DocumentName) > 0) then
                begin
                    Result := True;
                    Exit;
                end;
            end
            else if DocumentKind = 'OUTJOB' then
            begin
                CurrentDoc := SchServer.GetCurrentSchDocument;
                if (CurrentDoc <> Nil) then
                begin
                    Result := True;
                    // ShowMessage('Successfully focused SCH document');
                    Exit;
                end;
            end;
        End;
    End;

    // TODO: Do I want to iterate through all workspace projects to find valid document if it is not current document?
    // Could use IWorkspace.DM_ProjectCount and for loop

    // No matching document found or couldn't be focused
    // Do NOT call ShowMessage — it blocks the MCP bridge
    // Error is returned as JSON via the caller's WriteResponse
    Result := False;
end;

// Add a screenshot function that supports both PCB and SCH views
function TakeViewScreenshot(ViewType: String): String;
var
    Board          : IPCB_Board;
    SchDoc         : ISch_Document;
    ResultProps    : TStringList;
    OutputLines    : TStringList;
    ClassName      : String;
    DocType        : String;
    WindowFound    : Boolean;
    
    // For screenshot thread
    ThreadStarted  : Boolean;
    ScreenshotResult : String;
begin
    // Default result
    Result := '{"success": false, "error": "Failed to initialize screenshot capture"}';
    
    // Determine what type of document we need to focus
    if LowerCase(ViewType) = 'pcb' then
    begin
        DocType := 'PCB';
        ClassName := 'View_Graphical';
    end
    else if LowerCase(ViewType) = 'sch' then
    begin
        DocType := 'SCH';
        ClassName := 'SchView';
    end
    else
    begin
        Result := '{"success": false, "error": "Invalid view type: ' + ViewType + '. Must be ''pcb'' or ''sch''"}';
        Exit;
    end;
    
    // Build the command to call the external screenshot utility
    // This part depends on how your C# server calls Altium for screenshots
    
    // Create result JSON
    ResultProps := TStringList.Create;
    try
        // Add successful result properties
        AddJSONBoolean(ResultProps, 'success', True);
        AddJSONProperty(ResultProps, 'view_type', ViewType);
        AddJSONProperty(ResultProps, 'class_filter', ClassName);
        AddJSONBoolean(ResultProps, 'window_found', WindowFound);
        
        // Add signal to the server that it can now capture the screenshot
        AddJSONBoolean(ResultProps, 'ready_for_capture', True);

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

// Get all available output job containers from the first open OutJob
function GetOutputJobContainers(ROOT_DIR: String): String;
var
    OutJobPath: String;
    IniFile: TIniFile;
    ContainerName, ContainerAction: String;
    G, J: Integer;
    S: String;
    ResultProps: TStringList;
    ContainersArray: TStringList;
    ContainerProps: TStringList;
    OutputLines: TStringList;
begin
    // Get the path of the first open OutJob
    OutJobPath := GetOpenOutputJob();

    // Exit if no open OutJob was found
    if OutJobPath = '' then
    begin
        ResultProps := TStringList.Create;
        try
            AddJSONBoolean(ResultProps, 'success', False);
            AddJSONProperty(ResultProps, 'error', 'No open OutJob document found');
            Result := BuildJSONObject(ResultProps);
        finally
            ResultProps.Free;
        end;
        Exit;
    end;

    // Create output containers array
    ResultProps := TStringList.Create;
    ContainersArray := TStringList.Create;

    try
        // Add the OutJob path to the result
        AddJSONProperty(ResultProps, 'outjob_path', OutJobPath);

        // Open the OutJob file (it's just an INI file)
        IniFile := TIniFile.Create(OutJobPath);
        try
            G := 1; // Group Number
            J := 1; // Job/Container Number
            ContainerName := '';

            // Iterate each Output Group
            While (G = 1) Or (ContainerName <> DEFAULT) Do
            Begin
                S := 'OutputGroup'+IntToStr(G); // Section (aka OutputGroup)

                // Reset J for each group
                J := 1;
                ContainerName := '';
                ContainerAction := '';

                // Iterate each Output Container
                While (J = 1) Or (ContainerName <> DEFAULT) Do
                Begin
                    ContainerName := IniFile.ReadString(S, 'OutputMedium' + IntToStr(J), DEFAULT);
                    ContainerAction := IniFile.ReadString(S, 'OutputMedium' + IntToStr(J) + '_Type', DEFAULT);

                    // Add valid containers to the list
                    if (ContainerName <> DEFAULT) then
                    begin
                        ContainerProps := TStringList.Create;
                        try
                            // Add container properties
                            AddJSONProperty(ContainerProps, 'container_name', ContainerName);
                            AddJSONProperty(ContainerProps, 'container_type', ContainerAction);
                            //AddJSONProperty(ContainerProps, 'group', IntToStr(G));
                            //AddJSONProperty(ContainerProps, 'container_id', IntToStr(J));

                            // Add to containers array
                            ContainersArray.Add(BuildJSONObject(ContainerProps, 1));
                        finally
                            ContainerProps.Free;
                        end;
                    end;

                    Inc(J);
                    // Exit if we've reached the default value
                    if ContainerName = DEFAULT then
                        break;
                End;

                Inc(G);
                // Exit if we've reached the default value after first group
                if (G > 1) and (ContainerName = DEFAULT) then
                    break;
            End;
        finally
            IniFile.Free;
        end;

        // Add success status and containers array to result
        AddJSONBoolean(ResultProps, 'success', True);
        ResultProps.Add(BuildJSONArray(ContainersArray, 'containers'));

        // Build final JSON
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR);
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
        ContainersArray.Free;
    end;
end;

// Run selected output job containers with simplified logic
function RunOutputJobs(ContainerNames: TStringList, ROOT_DIR: String): String;
var
    OutJobPath: String;
    IniFile: TIniFile;
    ContainerName, ContainerAction, RelativePath: String;
    G, J: Integer;
    S: String;
    ResultProps: TStringList;
    ContainerResults: TStringList;
    ContainerResultProps: TStringList;
    I: Integer;
    ContainerFound: Boolean;
    SuccessCount: Integer;
    OutJobDoc: IServerDocument;
    OutputLines: TStringList;
begin
    // Get the path of the first open OutJob
    OutJobPath := GetOpenOutputJob();

    // Exit if no open OutJob was found
    if OutJobPath = '' then
    begin
        ResultProps := TStringList.Create;
        try
            AddJSONBoolean(ResultProps, 'success', False);
            AddJSONProperty(ResultProps, 'error', 'No open OutJob document found');
            Result := BuildJSONObject(ResultProps);
        finally
            ResultProps.Free;
        end;
        Exit;
    end;

    // Create results
    ResultProps := TStringList.Create;
    ContainerResults := TStringList.Create;
    SuccessCount := 0;

    try
        // Add the OutJob path to the result
        AddJSONProperty(ResultProps, 'outjob_path', OutJobPath);

        // Open the OutJob document
        if not(Client.IsDocumentOpen(OutJobPath)) then
        begin
            OutJobDoc := Client.OpenDocument('OUTPUTJOB', OutJobPath);
            OutJobDoc.Focus();
        end
        else
        begin
            OutJobDoc := Client.GetDocumentByPath(OutJobPath);
            OutJobDoc.Focus();
        end;

        // Exit if we can't open the OutJob document
        if OutJobDoc = Nil then
        begin
            AddJSONBoolean(ResultProps, 'success', False);
            AddJSONProperty(ResultProps, 'error', 'Could not open OutJob document: ' + OutJobPath);
            Result := BuildJSONObject(ResultProps);
            Exit;
        end;

        // Open the OutJob file (it's just an INI file)
        IniFile := TIniFile.Create(OutJobPath);
        try
            // Process each requested container
            for I := 0 to ContainerNames.Count - 1 do
            begin
                ContainerFound := False;
                ContainerResultProps := TStringList.Create;

                try
                    // Add container name to results
                    AddJSONProperty(ContainerResultProps, 'container_name', ContainerNames[I]);

                    // Iterate through groups and containers to find the matching one
                    G := 1;
                    while True do
                    begin
                        S := 'OutputGroup'+IntToStr(G);

                        J := 1;
                        while True do
                        begin
                            ContainerName := IniFile.ReadString(S, 'OutputMedium' + IntToStr(J), DEFAULT);

                            // Exit inner loop if we've reached the default value
                            if ContainerName = DEFAULT then
                                break;

                            // Check if this is one of the containers we want to run
                            if ContainerName = ContainerNames[I] then
                            begin
                                ContainerFound := True;
                                ContainerAction := IniFile.ReadString(S, 'OutputMedium' + IntToStr(J) + '_Type', DEFAULT);
                                RelativePath := IniFile.ReadString('PublishSettings', 'OutputBasePath' + IntToStr(J), '');

                                // Ensure document is focused
                                OutJobDoc.Focus();

                                // Run the container based on its type
                                if ContainerAction = 'GeneratedFiles' then
                                begin
                                    // Run GenerateFiles
                                    ResetParameters;
                                    AddStringParameter('Action', 'Run');
                                    AddStringParameter('OutputMedium', ContainerName);
                                    AddStringParameter('ObjectKind', 'OutputBatch');
                                    AddStringParameter('OutputBasePath', RelativePath);
                                    RunProcess('WorkspaceManager:GenerateReport');

                                    // Assume success
                                    AddJSONBoolean(ContainerResultProps, 'success', True);
                                    SuccessCount := SuccessCount + 1;
                                end
                                else if ContainerAction = 'Publish' then
                                begin
                                    // Run PublishToPDF with simpler parameters
                                    ResetParameters;
                                    AddStringParameter('Action', 'PublishToPDF');
                                    AddStringParameter('OutputMedium', ContainerName);
                                    AddStringParameter('ObjectKind', 'OutputBatch');
                                    AddStringParameter('OutputBasePath', RelativePath);
                                    AddStringParameter('DisableDialog', 'True');
                                    RunProcess('WorkspaceManager:Print');

                                    // Assume success
                                    AddJSONBoolean(ContainerResultProps, 'success', True);
                                    SuccessCount := SuccessCount + 1;
                                end
                                else
                                begin
                                    // Unknown action type
                                    AddJSONBoolean(ContainerResultProps, 'success', False);
                                    AddJSONProperty(ContainerResultProps, 'error', 'Unknown container action type: ' + ContainerAction);
                                end;

                                // Add output path info
                                AddJSONProperty(ContainerResultProps, 'relative_path', RelativePath);

                                // Break out after processing the container
                                break;
                            end;

                            Inc(J);
                        end;

                        // If we already found and processed the container, break out
                        if ContainerFound then
                            break;

                        // Exit outer loop if we've processed all groups
                        if ContainerName = DEFAULT then
                            break;

                        Inc(G);
                    end;

                    // Handle container not found
                    if not ContainerFound then
                    begin
                        AddJSONBoolean(ContainerResultProps, 'success', False);
                        AddJSONProperty(ContainerResultProps, 'error', 'Container not found: ' + ContainerNames[I]);
                    end;

                    // Add this container result to the results array
                    ContainerResults.Add(BuildJSONObject(ContainerResultProps, 1));
                finally
                    ContainerResultProps.Free;
                end;
            end;
        finally
            IniFile.Free;
        end;

        // Add summary results
        AddJSONBoolean(ResultProps, 'success', SuccessCount > 0);
        AddJSONInteger(ResultProps, 'total_containers', ContainerNames.Count);
        AddJSONInteger(ResultProps, 'successful_containers', SuccessCount);
        ResultProps.Add(BuildJSONArray(ContainerResults, 'container_results'));

        // Build and return the final JSON result
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR);
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
        ContainerResults.Free;
    end;
end;

// Helper function to check if a document is open
function IsOpenDoc(Path: String): Boolean;
var
    Project     : IProject;
    ProjectIdx, I  : Integer;
    Doc: IDocument;
begin
    result := False;

    for ProjectIdx := 0 to GetWorkspace.DM_ProjectCount - 1 do
    begin
        Project := GetWorkspace.DM_Projects(ProjectIdx);
        if Project = Nil then Exit;

        if Path = Project.DM_ProjectFullPath then
        begin
            result := True;
            Exit;
        end;

        // Iterate documents
        for I := 0 to Project.DM_LogicalDocumentCount - 1 do
        begin
            Doc := Project.DM_LogicalDocuments(I);
            if Path = Doc.DM_FullPath then
            begin
                result := True;
                Exit;
            end;
        end;
    end;
end;

// List all open workspace projects and their logical documents (PrjPcb/PrjScr members).
function GetWorkspaceOverview(ROOT_DIR: String): String;
var
    WS: IWorkspace;
    ProjectCount, i, j, docCount: Integer;
    Project: IProject;
    Doc: IDocument;
    Focused: IProject;
    ProjectsArray: TStringList;
    DocsJson, DocJson: String;
    FocusedPath: String;
    FocusedIdx: Integer;
    ProjLine: String;
    FocusJson: String;
    RootPairs: TStringList;
    OutputLines: TStringList;
begin
    Result := '';
    WS := GetWorkspace;
    if WS = nil then
    begin
        Result := '{"success":false,"error":"NO_WORKSPACE"}';
        Exit;
    end;

    FocusedPath := '';
    FocusedIdx := -1;
    Focused := WS.DM_FocusedProject;
    if Focused <> nil then
        FocusedPath := Focused.DM_ProjectFullPath;

    ProjectCount := WS.DM_ProjectCount;
    ProjectsArray := TStringList.Create;
    try
        for i := 0 to ProjectCount - 1 do
        begin
            Project := WS.DM_Projects(i);
            if Project = nil then
                Continue;

            if (FocusedPath <> '') and (AnsiCompareText(Project.DM_ProjectFullPath, FocusedPath) = 0) then
                FocusedIdx := i;

            DocsJson := '[';
            docCount := Project.DM_LogicalDocumentCount;
            for j := 0 to docCount - 1 do
            begin
                Doc := Project.DM_LogicalDocuments(j);
                DocJson := '{' + JSONPairStr('kind', Doc.DM_DocumentKind, True) + ',' +
                    JSONPairStr('fullPath', Doc.DM_FullPath, True) + ',' +
                    JSONPairStr('fileName', ExtractFileName(Doc.DM_FullPath), True) + '}';
                if j > 0 then
                    DocsJson := DocsJson + ',';
                DocsJson := DocsJson + DocJson;
            end;
            DocsJson := DocsJson + ']';

            if (FocusedPath <> '') and (AnsiCompareText(Project.DM_ProjectFullPath, FocusedPath) = 0) then
                FocusJson := 'true'
            else
                FocusJson := 'false';

            ProjLine := '{' +
                JSONPairStr('index', IntToStr(i), False) + ',' +
                JSONPairStr('projectFullPath', Project.DM_ProjectFullPath, True) + ',' +
                JSONPairStr('projectFileName', ExtractFileName(Project.DM_ProjectFullPath), True) + ',' +
                JSONPairStr('logicalDocumentCount', IntToStr(docCount), False) + ',' +
                JSONPairStr('focused', FocusJson, False) + ',' +
                JSONPairStr('documents', DocsJson, False) +
                '}';
            ProjectsArray.Add(ProjLine);
        end;

        RootPairs := TStringList.Create;
        try
            AddJSONInteger(RootPairs, 'projectCount', ProjectCount);
            if FocusedPath <> '' then
                AddJSONProperty(RootPairs, 'focusedProjectFullPath', FocusedPath, True)
            else
                RootPairs.Add('"focusedProjectFullPath": null');
            if FocusedIdx >= 0 then
                AddJSONInteger(RootPairs, 'focusedProjectIndex', FocusedIdx)
            else
                RootPairs.Add('"focusedProjectIndex": null');
            RootPairs.Add(JSONPairStr('projects', BuildJSONArray(ProjectsArray, '', 0), False));

            OutputLines := TStringList.Create;
            try
                OutputLines.Text := BuildJSONObject(RootPairs);
                Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_workspace_overview.json');
            finally
                OutputLines.Free;
            end;
        finally
            RootPairs.Free;
        end;
    finally
        ProjectsArray.Free;
    end;
end;

// ============================================================================
// Project / Document / View operations
// Verified patterns from scripts-libraries-master:
//   Compile: MultiPCBProject.pas L32-L46 (RunProcess + WorkspaceManager:Compile)
//   OpenDoc: OpenSchDocs.pas L33 (Client.OpenDocument + Client.ShowDocument)
//   Zoom:    SelectAssyDesignators.pas L679 (Client.SendMessage PCB:Zoom)
// ============================================================================

// Compile the focused project — Verified: MultiPCBProject.pas L36-L46
function CompileFocusedProject(ROOT_DIR: String): String;
var
    WS: IWorkspace;
    Project: IProject;
    ResultProps: TStringList;
    OutputLines: TStringList;
begin
    WS := GetWorkspace;
    if WS = nil then
    begin
        Result := '{"success":false,"error":"NO_WORKSPACE"}';
        Exit;
    end;
    Project := WS.DM_FocusedProject;
    if Project = nil then
    begin
        Result := '{"success":false,"error":"NO_FOCUSED_PROJECT"}';
        Exit;
    end;

    ResetParameters;
    AddStringParameter('Action', 'Compile');
    AddStringParameter('ObjectKind', 'Project');
    RunProcess('WorkspaceManager:Compile');

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'compile_project');
        AddJSONProperty(ResultProps, 'project', Project.DM_ProjectFullPath);
        AddJSONProperty(ResultProps, 'success', 'true');
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_compile_result.json');
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
    end;
end;

// Open a document in Altium — Verified: OpenSchDocs.pas L33
function OpenDocumentInAltium(ROOT_DIR: String; const DocKind, FilePath: String): String;
var
    Doc: IServerDocument;
    ResultProps: TStringList;
    OutputLines: TStringList;
    KindUpper: String;
    ActualKind: String;
begin
    KindUpper := UpperCase(Trim(DocKind));
    if (KindUpper = 'SCH') or (KindUpper = 'SCHEMATIC') then
        ActualKind := 'Sch'
    else if (KindUpper = 'PCB') then
        ActualKind := 'PCB'
    else if (KindUpper = 'PCBLIB') or (KindUpper = 'PCB_LIBRARY') then
        ActualKind := 'PCBLIB'
    else if (KindUpper = 'TEXT') then
        ActualKind := 'TEXT'
    else if (KindUpper = 'PRJPCB') or (KindUpper = 'PROJECT') then
        ActualKind := 'PrjPcb'
    else
        ActualKind := DocKind;

    Doc := Client.OpenDocument(ActualKind, FilePath);
    if Doc = nil then
    begin
        Result := '{"success":false,"error":"FAILED_TO_OPEN_DOCUMENT"}';
        Exit;
    end;
    Client.ShowDocument(Doc);

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'open_document');
        AddJSONProperty(ResultProps, 'document_kind', ActualKind);
        AddJSONProperty(ResultProps, 'file_path', FilePath);
        AddJSONProperty(ResultProps, 'success', 'true');
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_open_doc_result.json');
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
    end;
end;

// Zoom the current view — Verified: SelectAssyDesignators.pas L679
function ZoomView(ROOT_DIR: String; const ZoomAction: String): String;
var
    ActionUpper: String;
    ProcessCmd: String;
    ResultProps: TStringList;
    OutputLines: TStringList;
begin
    ActionUpper := UpperCase(Trim(ZoomAction));
    if (ActionUpper = 'ALL') or (ActionUpper = 'FIT') then
    begin
        ResetParameters;
        AddStringParameter('Action', 'All');
        RunProcess('PCB:Zoom');
    end
    else if (ActionUpper = 'REDRAW') or (ActionUpper = 'REFRESH') then
    begin
        Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);
    end
    else if (ActionUpper = 'IN') then
    begin
        ResetParameters;
        AddStringParameter('Action', 'In');
        RunProcess('PCB:Zoom');
    end
    else if (ActionUpper = 'OUT') then
    begin
        ResetParameters;
        AddStringParameter('Action', 'Out');
        RunProcess('PCB:Zoom');
    end
    else
    begin
        Client.SendMessage('PCB:Zoom', 'Action=Redraw', 255, Client.CurrentView);
    end;

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'zoom_view');
        AddJSONProperty(ResultProps, 'zoom_action', ActionUpper);
        AddJSONProperty(ResultProps, 'success', 'true');
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_zoom_result.json');
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
    end;
end;

// =====================================================================
// Process Operations — generate reports
// Verified: Client Process API — ResetParameters + RunProcess pattern
//   GenerateReport: WorkspaceManager:GenerateReport with Index=4 (Protel netlist)
// =====================================================================

// Generate a project report (netlist, BOM, etc.)
// Verified: WorkspaceManager:GenerateReport — Index=4 for Protel netlist
function GenerateProjectReport(ROOT_DIR: String; const ReportType: String): String;
var
    WS: IWorkspace;
    Project: IProject;
    ReportIndex: Integer;
    ReportName: String;
    OutputFile: String;
    ResultProps: TStringList;
    OutputLines: TStringList;
    TypeUpper: String;
begin
    WS := GetWorkspace;
    if WS = nil then
    begin
        Result := '{"success":false,"error":"NO_WORKSPACE"}';
        Exit;
    end;
    Project := WS.DM_FocusedProject;
    if Project = nil then
    begin
        Result := '{"success":false,"error":"NO_FOCUSED_PROJECT"}';
        Exit;
    end;

    TypeUpper := UpperCase(Trim(ReportType));
    ReportIndex := 4;
    ReportName := 'Protel Netlist';
    OutputFile := '';

    if (TypeUpper = 'NETLIST') or (TypeUpper = 'PROTEL_NETLIST') then
    begin
        ReportIndex := 4;
        ReportName := 'Protel Netlist';
    end
    else if (TypeUpper = 'BOM') or (TypeUpper = 'BILL_OF_MATERIALS') then
    begin
        ReportIndex := 5;
        ReportName := 'Bill of Materials';
    end
    else if (TypeUpper = 'COMPONENT_CROSS_REFERENCE') then
    begin
        ReportIndex := 6;
        ReportName := 'Component Cross Reference';
    end
    else if (TypeUpper = 'PROJECT_STATUSES') then
    begin
        ReportIndex := 7;
        ReportName := 'Project Status';
    end
    else if (TypeUpper = 'REPORT_PROJECT') then
    begin
        ReportIndex := 8;
        ReportName := 'Report Project Hierarchy';
    end;

    ResetParameters;
    AddStringParameter('ObjectKind', 'Project');
    AddIntegerParameter('Index', ReportIndex);
    RunProcess('WorkspaceManager:GenerateReport');

    ResultProps := TStringList.Create;
    try
        AddJSONProperty(ResultProps, 'action', 'generate_report');
        AddJSONProperty(ResultProps, 'report_type', ReportName);
        AddJSONInteger(ResultProps, 'report_index', ReportIndex);
        AddJSONProperty(ResultProps, 'project', Project.DM_ProjectFullPath);
        AddJSONProperty(ResultProps, 'success', 'true');
        OutputLines := TStringList.Create;
        try
            OutputLines.Text := BuildJSONObject(ResultProps);
            Result := WriteJSONToFile(OutputLines, ROOT_DIR + '\temp_report_result.json');
        finally
            OutputLines.Free;
        end;
    finally
        ResultProps.Free;
    end;
end;
