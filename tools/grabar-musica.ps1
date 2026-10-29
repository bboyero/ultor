# Graba la música del menú de ULTOR (baserhap.cmf) desde DOSBox.
# Flujo: arranca el juego -> créditos -> PULSA PARA CONTINUAR -> menú con
# música -> Ctrl+F6 (iniciar grabación WAV) -> esperar -> Ctrl+F6 (parar)
$dosbox = "C:\Program Files (x86)\DOSBox-0.74-3\DOSBox.exe"
$conf = "C:\disketes\ultor\tools\dosbox-grabar.conf"
$capture = "C:\Program Files (x86)\DOSBox-0.74-3\capture"

@"
[sdl]
windowed=true
output=opengl
fullresolution=original

[dosbox]
machine=svga_s3
memsize=16

[render]
aspect=true
scaler=normal2x

[cpu]
cycles=auto

[mixer]
nosound=false
rate=22050
blocksize=1024
prebuffer=20

[sblaster]
sbtype=sb16
sbbase=220
irq=7
dma=1
hdma=5
sbmixer=true
oplmode=auto
oplemu=default
oplrate=44100

[autoexec]
mount c C:\disketes\msdos\ultor\ULTOR
c:
cd subdir
GO.BAT
"@ | Out-File -FilePath $conf -Encoding ascii

if (Test-Path $capture) { Remove-Item "$capture\*.wav" -ErrorAction SilentlyContinue }

$p = Start-Process $dosbox -ArgumentList "-conf", $conf
Start-Sleep -Seconds 18   # arranque + créditos (jerrylee) + ultor.prg

Add-Type -AssemblyName System.Windows.Forms
[Microsoft.VisualBasic.Interaction]::AppActivate($p.Id)
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")   # PULSA PARA CONTINUAR
Start-Sleep -Seconds 8     # fundido + menú con baserhap sonando

[System.Windows.Forms.SendKeys]::SendWait("^{F6}")     # iniciar grabación
Start-Sleep -Seconds 90    # grabar 90 s de música
[System.Windows.Forms.SendKeys]::SendWait("^{F6}")     # parar grabación
Start-Sleep -Seconds 3

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Get-ChildItem $capture -Filter *.wav | Select-Object Name, Length
