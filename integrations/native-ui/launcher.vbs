Option Explicit
Dim shell, fs, folder, quote, command, nodePath, reader, marker
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
quote = Chr(34)
marker = folder & "\node-path.txt"
If fs.FileExists(marker) Then
  Set reader = fs.OpenTextFile(marker, 1, False, -1)
  nodePath = Trim(reader.ReadAll)
  reader.Close
Else
  nodePath = folder & "\node.exe"
End If
If Not fs.FileExists(nodePath) Then
  MsgBox "ClaudeBridge Node runtime is missing. Repair ClaudeBridge.", 16, "ClaudeBridge"
  WScript.Quit 2
End If
command = quote & nodePath & quote & " " & quote & folder & "\companion.js" & quote
shell.CurrentDirectory = folder
shell.Run command, 0, False
