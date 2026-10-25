<#
Sincroniza o Cerebro (Obsidian) e o motor do PC com a VPS do atendimento.

  Envia para a VPS (/opt/rosa/dados):
    cerebro/SAC/SAC - Base de Conhecimento.md   (nos dois sentidos: o mais novo ganha)
    cerebro/SAC/SAC - Aprendizados.md       (nos dois sentidos: o mais novo ganha)
    cerebro/Decisoes.md                     (so do PC para a VPS)
    motor/catalogo.json                     (so do PC para a VPS)
    motor/config.json                       (so a secao "sac", sem tokens nem chaves)
  As duas notas do SAC voltam para o PC quando a copia da VPS e mais nova
  (a pagina Capitao grava respostas nelas). Antes de trocar a nota do PC, a versao antiga
  vai para %LOCALAPPDATA%\RosaSync\anteriores\.

Uso:
  powershell -NoProfile -ExecutionPolicy Bypass -File sincronizar-cerebro.ps1 -Servidor root@IP_DA_VPS
  ... -Seco      mostra o que faria, sem copiar nada
  Servidor e chave tambem podem vir das variaveis ROSA_VPS e ROSA_VPS_CHAVE.

Precisa: OpenSSH do Windows (ssh e sftp) e uma chave SSH sem senha cadastrada na VPS (veja o GUIA.md).
Registro: %LOCALAPPDATA%\RosaSync\sync.log

Agendar a cada 10 minutos (NAO e criado por este script; rode uma vez, se quiser):
  schtasks /Create /SC MINUTE /MO 10 /TN "Rosa Selvagem - Sincronizar Cerebro VPS" /TR "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"C:\Users\Cncept D\RosaSelvagemOS\deploy\vps\sincronizar-cerebro.ps1\" -Servidor root@IP_DA_VPS"
#>
[CmdletBinding()]
param(
  [string]$Servidor = $env:ROSA_VPS,
  [string]$Chave = $(if ($env:ROSA_VPS_CHAVE) { $env:ROSA_VPS_CHAVE } else { Join-Path $env:USERPROFILE '.ssh\rosa_vps' }),
  [string]$Remoto = '/opt/rosa/dados',
  [int]$Porta = 22,
  [string]$Cerebro = (Join-Path $env:USERPROFILE ('Documents\Native Agents\Native Agemts\Rosa Selvagem - C' + [char]0x00E9 + 'rebro')),
  [string]$Motor = (Join-Path $env:USERPROFILE '.rosa-motor'),
  [switch]$Seco
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$pastaSync = Join-Path $env:LOCALAPPDATA 'RosaSync'
$null = New-Item -ItemType Directory -Force -Path $pastaSync
$logArq = Join-Path $pastaSync 'sync.log'
function Log([string]$txt) {
  $linha = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $txt
  Write-Host $linha
  if (-not $Seco) { [IO.File]::AppendAllText($logArq, $linha + "`r`n", $utf8) }
}

if (-not $Servidor) { throw 'Informe -Servidor usuario@ip (ou a variavel ROSA_VPS).' }
if (-not (Test-Path -LiteralPath $Chave)) { throw "Chave SSH nao encontrada: $Chave" }
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) { throw 'OpenSSH (ssh) nao encontrado no Windows.' }
$sshOpts = @('-i', $Chave, '-o', "Port=$Porta", '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new')

# ---------- o que sincronizar ----------
$decisoes = 'Decis' + [char]0x00F5 + 'es.md'
$itens = @(
  @{ Local = (Join-Path $Cerebro 'SAC\SAC - Base de Conhecimento.md'); Rel = 'cerebro/SAC/SAC - Base de Conhecimento.md'; Modo = 'dois' },
  @{ Local = (Join-Path $Cerebro 'SAC\SAC - Aprendizados.md');         Rel = 'cerebro/SAC/SAC - Aprendizados.md';         Modo = 'dois' },
  @{ Local = (Join-Path $Cerebro $decisoes);                       Rel = ('cerebro/' + $decisoes);                Modo = 'envia' },
  @{ Local = (Join-Path $Motor 'catalogo.json');                   Rel = 'motor/catalogo.json';                   Modo = 'envia' }
)

# config.json do motor: so a secao "sac", sem nada que pareca segredo
function Limpar($obj) {
  if ($obj -is [System.Management.Automation.PSCustomObject]) {
    $novo = [ordered]@{}
    foreach ($p in $obj.PSObject.Properties) {
      if ($p.Name -match '(?i)token|key|secret|senha|password|whatsapp') { continue }
      $novo[$p.Name] = Limpar $p.Value
    }
    return [pscustomobject]$novo
  }
  if ($obj -is [System.Collections.IEnumerable] -and -not ($obj -is [string])) { return ,@($obj | ForEach-Object { Limpar $_ }) }
  return $obj
}
$cfgMotor = Join-Path $Motor 'config.json'
if (Test-Path -LiteralPath $cfgMotor) {
  $sac = (Get-Content -LiteralPath $cfgMotor -Raw -Encoding UTF8 | ConvertFrom-Json).sac
  if ($sac) {
    $tmpCfg = Join-Path $pastaSync 'config-sac.json'
    $json = ([pscustomobject]@{ sac = (Limpar $sac) } | ConvertTo-Json -Depth 20)
    [IO.File]::WriteAllText($tmpCfg, $json, $utf8)
    $itens += @{ Local = $tmpCfg; Rel = 'motor/config.json'; Modo = 'envia' }
  } else { Log 'aviso: config.json do motor sem secao "sac"; nao enviado.' }
}

# ---------- estado da VPS: data e hash de cada arquivo ----------
$cmdLista = @'
mkdir -p {0}/cerebro/SAC {0}/motor && cd {0} && find cerebro motor -maxdepth 2 -type f -printf 'T|%T@|%p\n' -exec sha256sum {{}} +
'@ -f $Remoto
$saida = & ssh @sshOpts $Servidor $cmdLista.Trim()
if ($LASTEXITCODE -ne 0) { throw "ssh falhou (codigo $LASTEXITCODE). Confira servidor, chave e rede." }
$remotoData = @{}; $remotoHash = @{}
foreach ($l in $saida) {
  if ($l -match '^T\|([0-9.]+)\|(.+)$') { $remotoData[$Matches[2]] = [double]::Parse($Matches[1], [Globalization.CultureInfo]::InvariantCulture) }
  elseif ($l -match '^([0-9a-f]{64})\s+\*?(.+)$') { $remotoHash[$Matches[2]] = $Matches[1] }
}

# ---------- decide ----------
$envios = @(); $vindas = @()
foreach ($it in $itens) {
  if (-not (Test-Path -LiteralPath $it.Local)) { Log ("aviso: nao achei {0}" -f $it.Local); continue }
  $arq = Get-Item -LiteralPath $it.Local
  $hashLocal = (Get-FileHash -LiteralPath $it.Local -Algorithm SHA256).Hash.ToLower()
  $dataLocal = ([DateTimeOffset]$arq.LastWriteTimeUtc).ToUnixTimeSeconds()
  $rel = $it.Rel
  if (-not $remotoHash.ContainsKey($rel)) { $envios += $it; continue }
  if ($remotoHash[$rel] -eq $hashLocal) { continue }
  if ($it.Modo -eq 'dois' -and $remotoData[$rel] -gt ($dataLocal + 2)) { $vindas += $it } else { $envios += $it }
}

if (-not $envios.Count -and -not $vindas.Count) { Write-Host 'Tudo igual. Nada a fazer.'; exit 0 }
foreach ($it in $envios) { Log ("{0}envia  PC -> VPS  {1}" -f $(if ($Seco) { '[seco] ' } else { '' }), $it.Rel) }
foreach ($it in $vindas) { Log ("{0}traz   VPS -> PC  {1}" -f $(if ($Seco) { '[seco] ' } else { '' }), $it.Rel) }
if ($Seco) { exit 0 }

# guarda a versao do PC antes de trocar pela da VPS
if ($vindas.Count) {
  $guarda = Join-Path $pastaSync ('anteriores\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $null = New-Item -ItemType Directory -Force -Path $guarda
  foreach ($it in $vindas) { Copy-Item -LiteralPath $it.Local -Destination $guarda }
}

# ---------- copia (sftp em lote; -p mantem a data, o que evita ir e voltar) ----------
$barra = { param($p) $p -replace '\\', '/' }
$lote = New-Object System.Collections.Generic.List[string]
foreach ($it in $envios) { $lote.Add(('put -p "{0}" "{1}/{2}"' -f (& $barra $it.Local), $Remoto, $it.Rel)) }
foreach ($it in $vindas) { $lote.Add(('get -p "{0}/{1}" "{2}"' -f $Remoto, $it.Rel, (& $barra $it.Local))) }
$loteArq = Join-Path $pastaSync 'lote.sftp'
[IO.File]::WriteAllText($loteArq, ($lote -join "`n") + "`n", $utf8)
& sftp @sshOpts -q -b $loteArq $Servidor | Out-Null
if ($LASTEXITCODE -ne 0) { throw "sftp falhou (codigo $LASTEXITCODE)." }

# o servico na VPS roda como o usuario 1000 e precisa gravar nas notas do SAC
& ssh @sshOpts $Servidor ('chown -R 1000:1000 {0} 2>/dev/null; chmod -R u+rwX,go+rX,go-w {0}; true' -f $Remoto) | Out-Null
Log ('ok: {0} enviado(s), {1} trazido(s)' -f $envios.Count, $vindas.Count)
