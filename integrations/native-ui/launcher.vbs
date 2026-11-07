Option Explicit
Dim shell, fs, folder, quote, command
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
quote = Chr(34)
command = quote & folder & "\node.exe" & quote & " " & quote & folder & "\companion.js" & quote
shell.CurrentDirectory = folder
shell.Run command, 0, False
