Option Explicit

Dim shell, fso, scriptDir, repoRoot, pwshPath, runner, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(scriptDir)
pwshPath = "C:\Program Files\PowerShell\7\pwsh.exe"

If fso.FileExists(pwshPath) Then
  runner = pwshPath
Else
  runner = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
End If

command = """" & runner & """ -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & repoRoot & "\scripts\start-uvb-background.ps1"""
shell.Run command, 0, False
