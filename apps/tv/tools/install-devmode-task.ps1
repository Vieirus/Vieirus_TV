<#
.SYNOPSIS
    Installe la tache planifiee Windows qui lance extend-devmode.ps1 chaque
    jour a 4 h et a chaque ouverture de session (rattrape les jours ou le PC
    etait eteint a 4 h). Aucun droit administrateur requis.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File apps\tv\tools\install-devmode-task.ps1
    Pour retirer la tache :
    powershell -ExecutionPolicy Bypass -File apps\tv\tools\install-devmode-task.ps1 -Remove
#>
param([switch]$Remove)

$name = 'VieirusTV - prolonger le mode developpeur'
if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "Tache '$name' retiree."
    exit 0
}
$script = Join-Path $PSScriptRoot 'extend-devmode.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
    -WorkingDirectory $PSScriptRoot
$triggers = @(
    (New-ScheduledTaskTrigger -Daily -At '04:00'),
    (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Settings $settings `
    -Description 'Prolonge la session Developer Mode de la TV LG (app VieirusTV).' -Force | Out-Null
Write-Host "Tache '$name' installee : chaque jour a 4 h et a l'ouverture de session."
Write-Host "Premier essai maintenant (la TV doit etre allumee) :"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
