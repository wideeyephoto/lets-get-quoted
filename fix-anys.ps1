$errors = Get-Content tsc-errors.txt | Select-String "TS7006"
foreach ($err in $errors) {
    if ($err.Line -match '^(.*)\((\d+),(\d+)\):.*''([^'']+)'' implicitly has an ''any''') {
        $file = $matches[1]
        $lineNum = [int]$matches[2] - 1
        $paramName = $matches[4]
        
        if (Test-Path $file) {
            $lines = Get-Content $file
            $line = $lines[$lineNum]
            $line = $line -replace "\b$paramName\b(?!\s*:)", "$paramName: any"
            $lines[$lineNum] = $line
            $lines | Set-Content $file
        }
    }
}