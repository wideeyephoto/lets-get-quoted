$ErrorActionPreference = 'Stop'
$drRoot = Split-Path -Parent $PSScriptRoot
$drNode = 'C:\Program Files\nodejs\node.exe'
Set-Location -LiteralPath $drRoot
& $drNode (Join-Path $PSScriptRoot 'run-offsite-dr-backup.mjs') --scheduled
$drExit = $LASTEXITCODE
if ($drExit -ne 0) {
    # Local notification only; no customer email/SMS/provider action.
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $drNotice = New-Object System.Windows.Forms.NotifyIcon
        $drNotice.Icon = [System.Drawing.SystemIcons]::Warning
        $drNotice.Visible = $true
        $drNotice.ShowBalloonTip(10000, 'LGQ offsite backup failed', 'The latest recovery backup did not verify. Check tmp\dr-offsite-status.json in the LGQ repo.', [System.Windows.Forms.ToolTipIcon]::Warning)
        Start-Sleep -Seconds 12
        $drNotice.Dispose()
    } catch { }
}
exit $drExit
