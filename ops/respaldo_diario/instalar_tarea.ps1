# ============================================================
# SIRO — Instala el respaldo diario en el Programador de tareas de Windows (una sola vez). Ejecútalo en PowerShell como tu usuario:
#   powershell -ExecutionPolicy Bypass -File .\instalar_tarea.ps1 [-Hora 03:00]
# 1) Si no existe, crea C:\SIRO_RESPALDOS\clave_respaldo.txt con una clave aleatoria (no se muestra). GUÁRDALA en tu gestor de
#    contraseñas: sin ella los respaldos NO se pueden abrir.
# 2) Registra la tarea «SIRO respaldo diario»: todos los días a la hora indicada y, si la PC estaba apagada, en cuanto se encienda.
# 3) Descarga la imagen de PostgreSQL de Supabase que usa la restauración de prueba (si no está).
# ============================================================
param([string]$Hora = '03:00', [string]$Base = 'C:\SIRO_RESPALDOS')
$ErrorActionPreference = 'Stop'
$script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'respaldo_diario.ps1'
New-Item -ItemType Directory -Force $Base | Out-Null
$clave = Join-Path $Base 'clave_respaldo.txt'
if (-not (Test-Path $clave)) {
  $b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b) | Set-Content -NoNewline -Encoding ascii $clave
  Write-Host "✔ Clave de cifrado creada en $clave. ÁBRELA y guárdala en tu gestor de contraseñas: sin ella no se pueden abrir los respaldos."
} else { Write-Host "Clave de cifrado existente: $clave (no se cambia)" }
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$disparador = New-ScheduledTaskTrigger -Daily -At $Hora
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'SIRO respaldo diario' -Action $accion -Trigger $disparador -Settings $ajustes -Description 'Respaldo cifrado y verificado de SIRO (base + Storage). Ver ops/respaldo_diario/LEEME.md' -Force | Out-Null
Write-Host "✔ Tarea «SIRO respaldo diario» registrada a las $Hora (si la PC está apagada, corre al encenderla)."
$ErrorActionPreference = 'Continue'; docker image inspect public.ecr.aws/supabase/postgres:17.6.1.165 *> $null
if ($LASTEXITCODE -ne 0) { docker pull public.ecr.aws/supabase/postgres:17.6.1.165 }
docker image inspect postgres:17.6-bookworm *> $null
if ($LASTEXITCODE -ne 0) { docker pull postgres:17.6-bookworm }
