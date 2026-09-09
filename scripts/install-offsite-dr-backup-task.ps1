$ErrorActionPreference = 'Stop'
$drName = 'LGQ Database Offsite Backup'
$drScript = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'run-offsite-dr-backup.ps1')).Path
$drExisting = Get-ScheduledTask -TaskName $drName -ErrorAction SilentlyContinue
if ($drExisting -and $drExisting.Description -notlike 'LGQ_DR_BACKUP_V1*') {
    throw 'A different task already uses this name; it was not overwritten.'
}
$drUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$drAction = New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $drScript + '"')
$drMorning = New-ScheduledTaskTrigger -Daily -At '08:45'
$drEvening = New-ScheduledTaskTrigger -Daily -At '20:45'
$drLogon = New-ScheduledTaskTrigger -AtLogOn -User $drUser
$drLogon.Delay = 'PT3M'
$drPrincipal = New-ScheduledTaskPrincipal -UserId $drUser -LogonType Interactive -RunLevel Limited
$drSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$drDescription = 'LGQ_DR_BACKUP_V1: encrypted production database, Storage, source and local configuration to Google Drive at 08:45/20:45 local time, with logon catch-up. Requires the user logged in and Drive mounted. Keeps 30 days; key escrow is in Dashlane.'
$null = Register-ScheduledTask -TaskName $drName -Action $drAction -Trigger @($drMorning, $drEvening, $drLogon) -Principal $drPrincipal -Settings $drSettings -Description $drDescription -Force
Get-ScheduledTask -TaskName $drName | Select-Object TaskName, State, Description
