$path = "c:\Dev\private\files\All-Product master-Wadhwan.XML"
$reader = [System.IO.File]::OpenText($path)
$buffer = New-Object char[] 4000
$count = $reader.Read($buffer, 0, 4000)
$reader.Close()
$text = new-object string($buffer, 0, $count)
$text | Out-File "c:\Dev\private\files\snippet.txt" -Encoding UTF8
