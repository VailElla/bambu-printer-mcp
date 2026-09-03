-- Use the unmodified, officially signed Bambu Studio as the actuator for X2D
-- fan commands. The caller supplies a fan name and a speed in 10% increments.

on run argv
    if (count of argv) < 2 or (count of argv) > 3 then error "Expected fan and speed arguments"

    set requestedFan to item 1 of argv
    set targetSpeed to (item 2 of argv) as integer
    set dryRun to ((count of argv) is 3 and item 3 of argv is "dry-run")
    if targetSpeed < 0 or targetSpeed > 100 then error "Fan speed must be from 0 to 100"
    if targetSpeed mod 10 is not 0 then error "Fan speed must use 10% increments"

    if requestedFan is "part" then
        set fanColumn to 0
        set fanRow to 0
    else if requestedFan is "auxiliary" then
        set fanColumn to 1
        set fanRow to 0
    else if requestedFan is "right_auxiliary" then
        set fanColumn to 0
        set fanRow to 1
    else if requestedFan is "chamber" then
        set fanColumn to 1
        set fanRow to 1
    else
        error "Unsupported fan"
    end if

    tell application "System Events"
        set originalProcess to missing value
        repeat with candidateProcess in application processes
            try
                if frontmost of candidateProcess is true then
                    set originalProcess to candidateProcess
                    exit repeat
                end if
            end try
        end repeat
    end tell

    do shell script "/usr/bin/open -a /Applications/BambuStudio.app"

    set officialPid to 0
    repeat 40 times
        set officialPid to my findOfficialPid()
        if officialPid > 0 then exit repeat
        delay 0.25
    end repeat
    if officialPid is 0 then error "Official Bambu Studio is not available"

    tell application "System Events"
        set officialProcess to my findProcessByUnixId(officialPid)
        if officialProcess is missing value then error "Official Bambu Studio process could not be bound"
        if (count of windows of officialProcess) is 0 then error "Official Bambu Studio has no window"

        set frontmost of officialProcess to true
        tell application id "com.bambulab.bambu-studio" to activate
        delay 0.5

        set mainWindow to missing value
        repeat with candidateWindow in windows of officialProcess
            set candidateSize to size of candidateWindow
            if (item 1 of candidateSize) > 800 then
                set mainWindow to candidateWindow
                exit repeat
            end if
        end repeat
        if mainWindow is missing value then error "Official Bambu Studio main window was not found"

        set mainPosition to position of mainWindow
        my postClick((item 1 of mainPosition) + 392, (item 2 of mainPosition) + 45)
        delay 1

        -- Anchor the custom-drawn fan panel to the accessible bed target
        -- field. A window-right offset is not stable when Studio is resized.
        set mainWindow to my findMainWindow(officialProcess)
        set mainPosition to position of mainWindow
        set mainSize to size of mainWindow
        set bedTargetField to missing value
        repeat 20 times
            set bedTargetField to my findBedTargetField(mainWindow, mainPosition, mainSize)
            if bedTargetField is not missing value then exit repeat
            delay 0.5
            set mainWindow to my findMainWindow(officialProcess)
            set mainPosition to position of mainWindow
            set mainSize to size of mainWindow
        end repeat
        if bedTargetField is missing value then error "Official Bambu Studio bed target field was not found"
        set bedFieldPosition to position of bedTargetField

        set popupWindow to missing value
        repeat with candidateWindow in windows of officialProcess
            set candidateSize to size of candidateWindow
            if (item 1 of candidateSize) ≥ 420 and (item 1 of candidateSize) ≤ 450 and (item 2 of candidateSize) ≥ 300 and (item 2 of candidateSize) ≤ 350 then
                set popupWindow to candidateWindow
                exit repeat
            end if
        end repeat

        if popupWindow is missing value then
            -- The fan header is custom-drawn and does not expose an AX action.
            -- CGEvent uses the same screen coordinate space as the rendered
            -- Studio window; the offset is anchored to the accessible bed field
            -- and remains stable when the window is moved.
            my postClick((item 1 of bedFieldPosition) - 16, (item 2 of bedFieldPosition) + 114)
            repeat 20 times
                repeat with candidateWindow in windows of officialProcess
                    set candidateSize to size of candidateWindow
                    if (item 1 of candidateSize) ≥ 420 and (item 1 of candidateSize) ≤ 450 and (item 2 of candidateSize) ≥ 300 and (item 2 of candidateSize) ≤ 350 then
                        set popupWindow to candidateWindow
                        exit repeat
                    end if
                end repeat
                if popupWindow is not missing value then exit repeat
                delay 0.15
            end repeat
        end if
        if popupWindow is missing value then error "Official Bambu Studio fan controls did not open"

        if dryRun then
            try
                click button 1 of popupWindow
            end try
            if originalProcess is not missing value then
                try
                    set frontmost of originalProcess to true
                end try
            end if
            return "Official Bambu Studio fan controls are reachable (dry run)"
        end if

        set popupPosition to position of popupWindow
        if fanColumn is 0 then
            set minusOffsetX to 42
            set plusOffsetX to 173
        else
            set minusOffsetX to 242
            set plusOffsetX to 373
        end if
        if fanRow is 0 then
            set operateOffsetY to 179
        else
            set operateOffsetY to 272
        end if

        -- Drive to a known endpoint first. Extra clicks at 0%/100% are ignored
        -- by the official control, making the operation idempotent.
        if targetSpeed is 100 then
            repeat 10 times
                my postClick((item 1 of popupPosition) + plusOffsetX, (item 2 of popupPosition) + operateOffsetY)
                delay 0.15
            end repeat
        else
            repeat 10 times
                my postClick((item 1 of popupPosition) + minusOffsetX, (item 2 of popupPosition) + operateOffsetY)
                delay 0.15
            end repeat
            repeat (targetSpeed div 10) times
                my postClick((item 1 of popupPosition) + plusOffsetX, (item 2 of popupPosition) + operateOffsetY)
                delay 0.15
            end repeat
        end if

        delay 1
        try
            click button 1 of popupWindow
        end try
        if originalProcess is not missing value then
            try
                set frontmost of originalProcess to true
            end try
        end if
    end tell

    return "Official Bambu Studio set " & requestedFan & " fan to " & targetSpeed & "%"
end run

on findMainWindow(officialProcess)
    tell application "System Events"
        repeat with candidateWindow in windows of officialProcess
            set candidateSize to get size of candidateWindow
            if (item 1 of candidateSize) > 800 then return candidateWindow
        end repeat
    end tell
    error "Official Bambu Studio main window was not found"
end findMainWindow

on findBedTargetField(mainWindow, mainPosition, mainSize)
    tell application "System Events"
        repeat with candidateElement in UI elements of mainWindow
            try
                if (role of candidateElement as text) is "AXTextField" then
                    set fieldPosition to position of candidateElement
                    set fieldSize to size of candidateElement
                    set relativeX to (item 1 of fieldPosition) - (item 1 of mainPosition)
                    set relativeY to (item 2 of fieldPosition) - (item 2 of mainPosition)
                    if relativeX > ((item 1 of mainSize) - 280) and relativeY > 215 and relativeY < 285 and (item 1 of fieldSize) < 80 then return candidateElement
                end if
            end try
        end repeat
    end tell
    return missing value
end findBedTargetField

on findOfficialPid()
    try
        set pidText to do shell script "/usr/bin/pgrep -f '^/Applications/BambuStudio.app/Contents/MacOS/BambuStudio($| )' | /usr/bin/tail -n 1"
        if pidText is not "" then return pidText as integer
    end try
    return 0
end findOfficialPid

on findProcessByUnixId(processId)
    tell application "System Events"
        repeat with candidateProcess in application processes
            try
                if (unix id of candidateProcess) is processId then return candidateProcess
            end try
        end repeat
    end tell
    return missing value
end findProcessByUnixId

on postClick(clickX, clickY)
    set scriptPath to "/Volumes/Apple/Projects/3D/bambu-mcp/scripts/bambu-cgevent-click.jxa"
    do shell script "/usr/bin/osascript -l JavaScript " & quoted form of scriptPath & " " & (clickX as text) & " " & (clickY as text)
end postClick
