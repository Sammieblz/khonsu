Add-Type -AssemblyName System.Speech
$videoRoot = Split-Path -Parent $PSScriptRoot
$scriptData = Get-Content -Raw -LiteralPath (Join-Path $videoRoot 'script.json') | ConvertFrom-Json
$audioRoot = Join-Path $videoRoot 'public/narration'
New-Item -ItemType Directory -Force -Path $audioRoot | Out-Null
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SelectVoice('Microsoft Zira Desktop')
$voice.Rate = 0
foreach ($cut in @('long','short')) {
  foreach ($scene in $scriptData.$cut) {
    $index = 0
    foreach ($line in $scene.lines) {
      $path = Join-Path $audioRoot "$cut-$($scene.id)-$index.wav"
      $voice.SetOutputToWaveFile($path)
      $spoken = $line.Replace('SPHEREx','Sphere X').Replace('Khonsu','Konsoo').Replace('SQLite','S Q Lite').Replace('ByteBoyz','Byte Boys')
      $voice.Speak($spoken)
      $voice.SetOutputToNull()
      $index++
    }
    Write-Output "$cut / $($scene.id) narrated"
  }
}
$voice.Dispose()
