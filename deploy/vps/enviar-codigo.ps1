<#
Manda o codigo do atendimento do PC para a VPS e atualiza o servico.

  Envia: 05_FRONTEND/atendimento, 06_BACKEND/atendimento e deploy/vps (sem .env) para /opt/rosa/codigo.
  Depois roda deploy/vps/atualizar.sh na VPS (reinicia so o atendimento).

Uso:
  powershell -NoProfile -ExecutionPolicy Bypass -File enviar-codigo.ps1 -Servidor root@IP_DA_VPS
  ... -SoEnviar   so copia (use na primeira vez, antes do instalar.sh)
  ... -Seco       mostra o que faria, sem copiar nada
#>
[CmdletBinding()]
param(
  [string]$Servidor = $env:ROSA_VPS,
  [string]$Chave = $(if ($env:ROSA_VPS_CHAVE) { $env:ROSA_VPS_CHAVE } else { Join-Path $env:USERPROFILE '.ssh\rosa_vps' }),
  [string]$Destino = '/opt/rosa/codigo',
  [int]$Porta = 22,
  [switch]$SoEnviar,
  [switch]$Seco
)
$ErrorActionPreference = 'Stop'
if (-not $Servidor) { throw 'Informe -Servidor usuario@ip (ou a variavel ROSA_VPS).' }
if (-not (Test-Path -LiteralPath $Chave)) { throw "Chave SSH nao encontrada: $Chave" }

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pastas = @('05_FRONTEND/atendimento', '06_BACKEND/atendimento', 'deploy/vps')
foreach ($p in $pastas) { if (-not (Test-Path -LiteralPath (Join-Path $raiz $p))) { throw "Pasta nao encontrada: $p" } }
$sshOpts = @('-i', $Chave, '-o', "Port=$Porta", '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new')

$pacote = Join-Path $env:TEMP 'rosa-codigo.tgz'
Write-Host "Empacotando $($pastas -join ', ') de $raiz"
if ($Seco) { Write-Host "[seco] enviaria para ${Servidor}:$Destino e rodaria atualizar.sh: $(-not $SoEnviar)"; exit 0 }

& tar.exe -czf $pacote -C $raiz --exclude 'deploy/vps/.env' --exclude '*.log' @pastas
if ($LASTEXITCODE -ne 0) { throw 'tar falhou.' }
& scp @sshOpts -q $pacote ('{0}:/tmp/rosa-codigo.tgz' -f $Servidor)
if ($LASTEXITCODE -ne 0) { throw 'scp falhou.' }
Remove-Item -LiteralPath $pacote -Force

$cmd = 'mkdir -p {0} && tar --no-same-owner --no-same-permissions -xzf /tmp/rosa-codigo.tgz -C {0} && rm -f /tmp/rosa-codigo.tgz && chmod -R u=rwX,go=rX {0}/05_FRONTEND {0}/06_BACKEND {0}/deploy && chmod +x {0}/deploy/vps/*.sh && (test ! -f {0}/deploy/vps/.env || chmod 600 {0}/deploy/vps/.env)' -f $Destino
if (-not $SoEnviar) { $cmd += (' && bash {0}/deploy/vps/atualizar.sh' -f $Destino) }
& ssh @sshOpts $Servidor $cmd
if ($LASTEXITCODE -ne 0) { throw "Falhou na VPS (codigo $LASTEXITCODE)." }
Write-Host 'Pronto.'
