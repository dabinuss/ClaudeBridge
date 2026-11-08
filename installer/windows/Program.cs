using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

internal static class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);
    private const uint YesNoCancel = 0x00000003;
    private const uint YesNo = 0x00000004;
    private const uint Information = 0x00000040;
    private const uint Error = 0x00000010;
    private const int Yes = 6;
    private const int No = 7;
    private const int Cancel = 2;

    private static int Main(string[] args)
    {
        string? temp = null;
        bool unattended = args.Contains("--quiet") || Environment.GetEnvironmentVariable("CLAUDEBRIDGE_SETUP_TEST_HOME") != null;
        try
        {
            string mode = args.Any(a => a == "--uninstall") ? "uninstall" :
                          args.Any(a => a == "--status") ? "status" : "install";
            string basePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ClaudeBridge", "Installed");
            bool purgeData = args.Contains("--purge-data");
            if (args.Length == 0 && !unattended)
            {
                bool present = File.Exists(Path.Combine(basePath, "installer-owned.json"));
                int choice = MessageBoxW(IntPtr.Zero,
                    present
                    ? "ClaudeBridge is already installed.\n\nYes: Update / Repair\nNo: Uninstall\nCancel: Exit"
                    : "Install ClaudeBridge MCP with the official Claude Code Mod?\n\nYour original Claude installation will remain unchanged.",
                    "ClaudeBridge Setup", present ? YesNoCancel | Information : YesNo | Information);
                if (choice == Cancel || (!present && choice != Yes)) return 0;
                mode = present && choice == No ? "uninstall" : "install";
                if (mode == "uninstall")
                {
                    purgeData = MessageBoxW(IntPtr.Zero,
                        "Also permanently delete ClaudeBridge settings, saved plans and registered project memory?\n\n"
                        + "Yes: Remove all ClaudeBridge data\nNo: Keep project history\n\nYour source code is never deleted.",
                        "ClaudeBridge Data Cleanup", YesNo | Information) == Yes;
                }
            }

            temp = Path.Combine(Path.GetTempPath(), "ClaudeBridgeSetup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(temp);
            using (Stream? payload = Assembly.GetExecutingAssembly()
                         .GetManifestResourceStream("ClaudeBridge.Payload"))
            {
                if (payload == null) throw new InvalidOperationException("The setup payload is missing.");
                using ZipArchive zip = new ZipArchive(payload, ZipArchiveMode.Read);
                long total = 0;
                string extractionRoot = Path.GetFullPath(temp) + Path.DirectorySeparatorChar;
                foreach (ZipArchiveEntry entry in zip.Entries)
                {
                    if (string.IsNullOrEmpty(entry.Name)) continue;
                    if (entry.Length < 0 || entry.Length > 1024L * 1024 * 1024)
                        throw new InvalidDataException("Invalid archive entry size.");
                    total += entry.Length;
                    if (total > 2048L * 1024 * 1024)
                        throw new InvalidDataException("The installer payload is too large.");
                    string destination = Path.GetFullPath(Path.Combine(temp, entry.FullName));
                    if (!destination.StartsWith(extractionRoot, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("Unsafe archive entry path.");
                    Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                    entry.ExtractToFile(destination, overwrite: true);
                }
            }
            string node = Path.Combine(temp, "integrations", "native-ui", "node.exe");
            string script = Path.Combine(temp, "installer", "setup.js");
            if (!File.Exists(node) || !File.Exists(script))
                throw new FileNotFoundException("The installer is missing Node or setup.js.");

            using Process child = new Process();
            child.StartInfo = new ProcessStartInfo(node)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = temp
            };
            child.StartInfo.ArgumentList.Add(script);
            child.StartInfo.ArgumentList.Add(mode);
            if (purgeData && mode == "uninstall") child.StartInfo.ArgumentList.Add("--purge-data");
            if (!child.Start()) throw new InvalidOperationException("Cannot start bundled installer.");

            Task<string> outTask = child.StandardOutput.ReadToEndAsync();
            Task<string> errTask = child.StandardError.ReadToEndAsync();
            if (!child.WaitForExit(120000))
            {
                child.Kill(entireProcessTree: true);
                throw new TimeoutException("ClaudeBridge installation exceeded the time limit.");
            }
            string output = outTask.GetAwaiter().GetResult().Trim();
            string error = errTask.GetAwaiter().GetResult().Trim();
            if (child.ExitCode != 0)
                throw new Exception(string.IsNullOrWhiteSpace(error) ? output : error);
            // After a successful install, activate the official Claude Code Mod
            // with the CLI if available. Failure is non-fatal: MCP still works.
            string modStatus = "Claude Code Mod can be installed via the official plugin manager.";
            if (mode == "install")
            {
                string modScript = Path.Combine(temp, "installer", "mod-install.js");
                if (File.Exists(modScript))
                {
                    using Process mod = new Process();
                    mod.StartInfo = new ProcessStartInfo(node)
                    {
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        WorkingDirectory = temp
                    };
                    mod.StartInfo.ArgumentList.Add(modScript);
                    mod.StartInfo.ArgumentList.Add(basePath);
                    if (mod.Start())
                    {
                        Task<string> modOut = mod.StandardOutput.ReadToEndAsync();
                        Task<string> modErr = mod.StandardError.ReadToEndAsync();
                        if (mod.WaitForExit(60000))
                        {
                            string result = modOut.GetAwaiter().GetResult();
                            string detail = modErr.GetAwaiter().GetResult();
                            modStatus = mod.ExitCode == 0
                                ? result.Trim()
                                : "Mod registration was unavailable: " + detail.Trim();
                        }
                        else
                        {
                            mod.Kill(entireProcessTree: true);
                            modStatus = "Mod registration timed out; MCP setup succeeded.";
                        }
                    }
                }
            }
            bool nativeOk = false;
            if (!string.IsNullOrWhiteSpace(output))
            {
                using JsonDocument parsed = JsonDocument.Parse(output);
                if (parsed.RootElement.TryGetProperty("native", out JsonElement native)
                    && native.ValueKind == JsonValueKind.Object
                    && native.TryGetProperty("installed", out JsonElement installed))
                    nativeOk = installed.ValueKind == JsonValueKind.True;
            }
            string details = mode == "install"
                ? "ClaudeBridge MCP has been registered.\n\n"
                  + "No HTTPS proxy or certificate was installed. No separate Node.js download is required. "
                  + "The private runtime is embedded in this installer.\n\n"
                  + "Restart the normal Claude Desktop application. The Claude Code Mod can be loaded "
                  + "in Code sessions through Claude Code's official plugin manager."
                  + "\n\nMod setup: " + modStatus
                  + "\n\nSign in to Codex once using your ChatGPT account."
                : mode == "uninstall"
                ? "ClaudeBridge's own MCP entry and native launcher have been removed where possible.\n\n"
                  + (purgeData ? "The selected personal ClaudeBridge data cleanup was also requested." :
                     "Your personal project memory has been preserved.")
                : output;
            if (unattended) Console.WriteLine(output);
            else MessageBoxW(IntPtr.Zero, details, "ClaudeBridge Setup", Information);
            return 0;
        }
        catch (Exception ex)
        {
            if (!unattended) MessageBoxW(IntPtr.Zero, ex.Message, "ClaudeBridge Setup Error", Error);
            Console.Error.WriteLine(ex);
            return 1;
        }
        finally
        {
            if (temp != null)
                try { Directory.Delete(temp, recursive: true); } catch { /* Windows may briefly lock the runtime */ }
        }
    }
}
