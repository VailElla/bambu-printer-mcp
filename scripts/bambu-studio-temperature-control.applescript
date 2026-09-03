-- Use the unmodified, officially signed Bambu Studio as the actuator for X2D
-- temperature commands. The script intentionally drives the visible target
-- field so the official networking plug-in remains the command origin.

on run argv
    if (count of argv) is not 2 then error "Expected component and temperature arguments"

    set requestedComponent to item 1 of argv
    set targetTemperature to (item 2 of argv) as integer
    if requestedComponent is not "bed" then error "The official X2D bridge currently supports only the bed component"
    if targetTemperature < 0 or targetTemperature > 120 then error "Bed temperature must be from 0 to 120°C"

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

        set mainWindow to my findMainWindow(officialProcess)
        set deviceText to my findStaticText(mainWindow, "设备", 120)
        if deviceText is not missing value then
            set devicePosition to position of deviceText
            set deviceSize to size of deviceText
            my postClick((item 1 of devicePosition) + ((item 1 of deviceSize) div 2), (item 2 of devicePosition) + ((item 2 of deviceSize) div 2))
        else
            set mainPosition to position of mainWindow
            my postClick((item 1 of mainPosition) + 392, (item 2 of mainPosition) + 45)
        end if
        delay 2

        -- Re-resolve the window and field after switching pages. The bed target
        -- is the third target field in the temperature stack and stays within
        -- this narrow vertical band across supported window widths.
        set mainWindow to my findMainWindow(officialProcess)
        set mainPosition to position of mainWindow
        set mainSize to size of mainWindow
        set temperatureField to missing value
        set fieldElements to UI elements of mainWindow
        repeat with candidateElement in fieldElements
            try
                if (role of candidateElement as text) is "AXTextField" then
                    set fieldPosition to position of candidateElement
                    set fieldSize to size of candidateElement
                    set relativeX to (item 1 of fieldPosition) - (item 1 of mainPosition)
                    set relativeY to (item 2 of fieldPosition) - (item 2 of mainPosition)
                    if relativeX > ((item 1 of mainSize) - 280) and relativeY > 215 and relativeY < 285 and (item 1 of fieldSize) < 80 then
                        set temperatureField to candidateElement
                        exit repeat
                    end if
                end if
            end try
        end repeat
        if temperatureField is missing value then error "Official Bambu Studio bed target field was not found"

        set priorTemperature to value of temperatureField as text
        set fieldPosition to position of temperatureField
        set fieldSize to size of temperatureField
        set frontmost of officialProcess to true
        click at {(item 1 of fieldPosition) + ((item 1 of fieldSize) div 2), (item 2 of fieldPosition) + ((item 2 of fieldSize) div 2)}
        delay 0.25
        try
            set focused of temperatureField to true
        end try
        keystroke "a" using command down
        keystroke (targetTemperature as text)
        delay 0.25
        key code 36
        delay 1

        set submittedTemperature to value of temperatureField as text

        if originalProcess is not missing value then
            try
                set frontmost of originalProcess to true
            end try
        end if
    end tell

    return "Official Bambu Studio requested bed " & targetTemperature & "°C (previous field value " & priorTemperature & "°C, submitted field value " & submittedTemperature & "°C)"
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

on findStaticText(mainWindow, expectedValue, maximumY)
    tell application "System Events"
        set elementsToCheck to UI elements of mainWindow
        repeat with candidateElement in elementsToCheck
            try
                if (role of candidateElement as text) is "AXStaticText" and (value of candidateElement as text) is expectedValue then
                    set candidatePosition to position of candidateElement
                    if (item 2 of candidatePosition) < maximumY then return candidateElement
                end if
            end try
        end repeat
    end tell
    return missing value
end findStaticText

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
