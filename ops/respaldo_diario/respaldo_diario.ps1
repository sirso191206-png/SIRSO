# ============================================================
# SIRO — Respaldo DIARIO automático de producción (lo ejecuta el Programador de tareas; ver instalar_tarea.ps1 y LEEME.md).
# 1) Volcado de SOLO LECTURA de la base (public + auth + storage) con validación del destino antes de conectar.
# 2) Descarga de TODOS los archivos de Storage (fotos, documentos, logos) y comprobación de su tamaño.
# 3) Empaquetado y cifrado AES-256 (gpg simétrico) con la clave de C:\SIRO_RESPALDOS\clave_respaldo.txt.
# 4) RESTAURACIÓN DE PRUEBA del archivo cifrado en un PostgreSQL de Supabase desechable y sin red: compara las filas de cada tabla.
# 5) Copia del archivo CIFRADO a OneDrive; conserva 14 días en el equipo y 30 en OneDrive.
# Si algo falla: ESTADO.txt = FALLÓ, un archivo «SIRO_RESPALDO_FALLIDO.txt» en el Escritorio y un aviso en pantalla.
# Nunca imprime ni registra credenciales. Los datos SIN cifrar solo existen durante la ejecución y se borran al terminar.
# Requisitos: Docker Desktop, imágenes postgres:17.6-bookworm y public.ecr.aws/supabase/postgres:17.6.1.165,
#   C:\SIRO_RESPALDOS\conexion_prod.env (PG* + SUPABASE_SERVICE_ROLE_KEY) y C:\SIRO_RESPALDOS\clave_respaldo.txt.
# ============================================================
param(
  [string]$Base = 'C:\SIRO_RESPALDOS',
  [string]$CopiaNube = $(if ($env:OneDrive) { Join-Path $env:OneDrive 'SIRO_RESPALDOS_CIFRADOS' } else { '' }),
  [int]$DiasLocal = 14,
  [int]$DiasNube = 30
)
$ErrorActionPreference = 'Stop'
$REF = 'mhqdgvdcupzhatrryapw'
$IMG = 'postgres:17.6-bookworm'
$IMG_SUPABASE = 'public.ecr.aws/supabase/postgres:17.6.1.165'
$SCRIPTS = Split-Path -Parent $MyInvocation.MyCommand.Path
$diarios = Join-Path $Base 'diarios'
$registros = Join-Path $diarios 'registros'
$fecha = Get-Date -Format 'yyyyMMdd_HHmm'
$nombre = "SIRO_$fecha"
$trabajo = Join-Path $diarios "_trabajo_$fecha"
$volumen = "siro_verif_$fecha".ToLower()
New-Item -ItemType Directory -Force $registros | Out-Null
$log = Join-Path $registros "$nombre.log"
function Anotar([string]$m) { $l = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Add-Content -Encoding UTF8 $log $l; Write-Host $l }
function EnDocker([string[]]$argumentos) {
  $ErrorActionPreference = 'Continue'
  $salida = & docker @argumentos 2>&1 | ForEach-Object { "$_" }
  $ec = $LASTEXITCODE; $ErrorActionPreference = 'Stop'
  $salida | Where-Object { $_ -and $_ -notmatch 'PGPASSWORD|SERVICE_ROLE' } | ForEach-Object { Anotar "   $_" }
  if ($ec -ne 0) { throw "docker terminó con código $ec" }
}
function Montaje([string]$ruta) { return ($ruta -replace '\\', '/') }
$sh = { param($script, $args2) "sed 's/\r$//' /scripts/$script > /tmp/s.sh && bash /tmp/s.sh $args2" }

try {
  Anotar "== Respaldo diario $nombre =="
  # 0) Comprobaciones previas
  foreach ($r in @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer) | Where-Object { $_ }) {
    if ([IO.Path]::GetFullPath($Base) -like "$([IO.Path]::GetFullPath($r).TrimEnd('\'))*") { throw "La carpeta base está dentro de OneDrive: los datos SIN cifrar se subirían a la nube." }
  }
  $envArchivo = Join-Path $Base 'conexion_prod.env'
  $clave = Join-Path $Base 'clave_respaldo.txt'
  if (-not (Test-Path $envArchivo)) { throw "Falta $envArchivo" }
  if (-not (Test-Path $clave) -or (Get-Item $clave).Length -lt 20) { throw "Falta la clave de cifrado $clave (ejecuta instalar_tarea.ps1)" }
  $llave = (Get-Content $envArchivo | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=' } | Select-Object -First 1) -replace '^SUPABASE_SERVICE_ROLE_KEY=', ''
  $llave = "$llave".Trim()
  if (-not $llave) { throw "Falta SUPABASE_SERVICE_ROLE_KEY en $envArchivo (necesaria para descargar los archivos de Storage)" }

  # Docker en marcha (lo arranca si hace falta y espera hasta 4 min)
  $ErrorActionPreference = 'Continue'; docker info *> $null; $listo = ($LASTEXITCODE -eq 0); $ErrorActionPreference = 'Stop'
  if (-not $listo) {
    Anotar 'Arrancando Docker Desktop…'
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    for ($i = 0; $i -lt 48 -and -not $listo; $i++) { Start-Sleep 5; $ErrorActionPreference = 'Continue'; docker info *> $null; $listo = ($LASTEXITCODE -eq 0); $ErrorActionPreference = 'Stop' }
    if (-not $listo) { throw 'Docker no arrancó en 4 minutos' }
  }
  New-Item -ItemType Directory -Force $trabajo | Out-Null

  # 1) Volcado de solo lectura
  Anotar '1) Volcado de la base (solo lectura)'
  EnDocker -argumentos @('run', '--rm', '-v', "$(Montaje $envArchivo):/conexion/conexion_prod.env:ro", '-v', "$(Montaje $SCRIPTS):/scripts:ro", '-v', "$(Montaje $trabajo):/trabajo", $IMG, 'bash', '-c', (& $sh 'volcar.sh' ''))

  # 2) Archivos de Storage
  Anotar '2) Archivos de Storage'
  $objetos = @(Get-Content -Encoding UTF8 (Join-Path $trabajo 'storage_objetos.tsv') | Where-Object { $_ })
  # Llave «secret» nueva (sb_secret_…): basta el encabezado apikey. Llave service_role clásica (JWT): apikey + Authorization.
  $cab = if ($llave -like 'sb_secret_*') { @{ apikey = $llave } } else { @{ Authorization = "Bearer $llave"; apikey = $llave } }
  $bytes = 0
  foreach ($o in $objetos) {
    $c = $o -split "`t"; $bucket = $c[0]; $ruta = $c[1]; $tam = $c[2]
    $rutaUrl = (($ruta -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $dest = Join-Path (Join-Path $trabajo 'storage') (Join-Path $bucket ($ruta -replace '/', '\'))
    New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
    Invoke-WebRequest -UseBasicParsing -Headers $cab -Uri "https://$REF.supabase.co/storage/v1/object/$bucket/$rutaUrl" -OutFile $dest | Out-Null
    $real = (Get-Item $dest).Length
    if ($tam -and [int64]$tam -ne $real) { throw "Tamaño distinto en $bucket/$ruta (esperado $tam, descargado $real)" }
    $bytes += $real
  }
  $llave = $null; $cab = $null
  Anotar ("   {0} archivos, {1:N0} bytes, tamaños verificados" -f $objetos.Count, $bytes)

  # 3) Cifrado
  Anotar '3) Empaquetado y cifrado AES-256'
  EnDocker -argumentos @('run', '--rm', '--network', 'none', '-v', "$(Montaje $trabajo):/trabajo:ro", '-v', "$(Montaje $clave):/clave/clave_respaldo.txt:ro", '-v', "$(Montaje $SCRIPTS):/scripts:ro", '-v', "$(Montaje $diarios):/salida", $IMG, 'bash', '-c', (& $sh 'cifrar.sh' $nombre))

  # 4) Restauración de prueba DEL ARCHIVO CIFRADO
  Anotar '4) Restauración de prueba (descifrar y restaurar en un PostgreSQL de Supabase desechable, sin red)'
  EnDocker -argumentos @('volume', 'create', $volumen)
  try {
    EnDocker -argumentos @('run', '--rm', '--network', 'none', '-v', "$(Montaje $diarios):/salida:ro", '-v', "$(Montaje $clave):/clave/clave_respaldo.txt:ro", '-v', "$(Montaje $SCRIPTS):/scripts:ro", '-v', "${volumen}:/v", $IMG, 'bash', '-c', (& $sh 'descifrar.sh' "$nombre.tar.gz.gpg"))
    $pw = [guid]::NewGuid().ToString('N')
    $cont = "siro_restaurar_$fecha".ToLower()
    EnDocker -argumentos @('run', '-d', '--name', $cont, '--network', 'none', '-e', "POSTGRES_PASSWORD=$pw", '-v', "${volumen}:/v:ro", '-v', "$(Montaje $SCRIPTS):/scripts:ro", $IMG_SUPABASE)
    try { EnDocker -argumentos @('exec', $cont, 'bash', '-c', (& $sh 'restaurar_prueba.sh' '')) }
    finally { $ErrorActionPreference = 'Continue'; docker rm -f $cont *> $null; $ErrorActionPreference = 'Stop' }
  } finally { $ErrorActionPreference = 'Continue'; docker volume rm -f $volumen *> $null; $ErrorActionPreference = 'Stop' }

  # 5) Copia cifrada a la nube y retención
  if ($CopiaNube) {
    New-Item -ItemType Directory -Force $CopiaNube | Out-Null
    Copy-Item (Join-Path $diarios "$nombre.tar.gz.gpg"), (Join-Path $diarios "$nombre.tar.gz.gpg.sha256") $CopiaNube -Force
    Anotar "5) Copia cifrada en $CopiaNube"
  } else { Anotar '5) Sin carpeta de OneDrive: solo copia local' }
  $limite = (Get-Date).AddDays(-$DiasLocal)
  Get-ChildItem $diarios -File -Filter 'SIRO_*.tar.gz.gpg*' | Where-Object { $_.LastWriteTime -lt $limite } | Remove-Item -Force
  if ($CopiaNube) { $limite = (Get-Date).AddDays(-$DiasNube); Get-ChildItem $CopiaNube -File -Filter 'SIRO_*.tar.gz.gpg*' | Where-Object { $_.LastWriteTime -lt $limite } | Remove-Item -Force }
  Get-ChildItem $registros -File -Filter '*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) } | Remove-Item -Force

  "OK $(Get-Date -Format 'yyyy-MM-dd HH:mm') $nombre.tar.gz.gpg (restauración de prueba sin diferencias)" | Set-Content -Encoding UTF8 (Join-Path $diarios 'ESTADO.txt')
  Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'SIRO_RESPALDO_FALLIDO.txt') -ErrorAction SilentlyContinue
  Anotar '✔ Respaldo diario completo y verificado'
} catch {
  $msg = "$($_.Exception.Message)"
  Anotar "✘ FALLÓ: $msg"
  "FALLÓ $(Get-Date -Format 'yyyy-MM-dd HH:mm') — $msg — registro: $log" | Set-Content -Encoding UTF8 (Join-Path $diarios 'ESTADO.txt')
  "El respaldo diario de SIRO FALLÓ el $(Get-Date -Format 'dd/MM/yyyy HH:mm').`r`nMotivo: $msg`r`nRegistro: $log" | Set-Content -Encoding UTF8 (Join-Path ([Environment]::GetFolderPath('Desktop')) 'SIRO_RESPALDO_FALLIDO.txt')
  try { msg.exe * /TIME:0 "SIRO: el respaldo diario FALLÓ. Revisa SIRO_RESPALDO_FALLIDO.txt en el Escritorio." } catch { }
  exit 1
} finally {
  # Los datos SIN cifrar nunca se quedan en el disco
  if (Test-Path $trabajo) { Remove-Item -Recurse -Force $trabajo -ErrorAction SilentlyContinue }
}
