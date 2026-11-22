// Expansion Builder — native macOS shell.
// A single AppKit window hosting the web UI (web/) in a WKWebView, plus a small
// promise bridge that gives the page real file-system powers: open/save panels,
// chunked file writes, zipping, revealing in Finder and pushing to an MPC over SSH.

import AppKit
import WebKit
import UniformTypeIdentifiers

let audioExtensions: Set<String> = ["wav", "wave", "aif", "aiff", "aifc", "mp3", "m4a", "flac", "caf", "ogg"]

// MARK: - lab:// scheme: bundled web files + read-only access to local files

final class LabSchemeHandler: NSObject, WKURLSchemeHandler {
    let webRoot: URL
    init(webRoot: URL) { self.webRoot = webRoot }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let path = url.path  // already percent-decoded
        let fileURL: URL
        if path.hasPrefix("/__file__/") {
            fileURL = URL(fileURLWithPath: String(path.dropFirst("/__file__".count)))
        } else {
            let rel = path == "/" || path.isEmpty ? "index.html" : String(path.dropFirst())
            fileURL = webRoot.appendingPathComponent(rel)
        }
        do {
            let data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
            let mime = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)",
                                                      "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"])!
            task.didReceive(resp)
            task.didReceive(data)
            task.didFinish()
        } catch {
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            task.didReceive(resp)
            task.didReceive(Data())
            task.didFinish()
        }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - Web view whose header strip drags the window
// WKWebView ignores -webkit-app-region, so the page reports its header area and the
// rects of the controls inside it ("holes"); a mouse-down anywhere else in that strip moves the window.

final class DragWebView: WKWebView {
    var dragHeight: CGFloat = 0
    var holes: [CGRect] = []   // page coordinates (top-left origin, CSS px)

    override func mouseDown(with e: NSEvent) {
        let p = convert(e.locationInWindow, from: nil)
        let pt = CGPoint(x: p.x, y: isFlipped ? p.y : bounds.height - p.y)
        if pt.y < dragHeight && !holes.contains(where: { $0.contains(pt) }) {
            if e.clickCount == 2 {
                let action = UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") ?? "Maximize"
                if action == "Minimize" { window?.performMiniaturize(nil) } else if action != "None" { window?.performZoom(nil) }
            } else {
                window?.performDrag(with: e)
            }
            return
        }
        super.mouseDown(with: e)
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKUIDelegate, NSWindowDelegate {
    var window: NSWindow!
    var web: DragWebView!
    var openHandles: [String: FileHandle] = [:]
    var allowQuit = false

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web")
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(LabSchemeHandler(webRoot: webRoot), forURLScheme: "lab")
        config.userContentController.add(self, name: "bridge")
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []

        let frame = NSRect(x: 0, y: 0, width: 1680, height: 1020)
        window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Expansion Builder"
        window.titlebarAppearsTransparent = true
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(red: 0.07, green: 0.07, blue: 0.08, alpha: 1)
        window.minSize = NSSize(width: 1280, height: 760)
        window.delegate = self
        window.setFrameAutosaveName("ExpansionBuilderMain")
        if !window.setFrameUsingName("ExpansionBuilderMain") { window.center() }

        web = DragWebView(frame: frame, configuration: config)
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        if #available(macOS 13.3, *) { web.isInspectable = true }
        window.contentView = web
        web.load(URLRequest(url: URL(string: "lab://app/index.html")!))
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        snapshotModeIfRequested()
        // Caps Lock = stop all audio. It's a modifier key, so WebKit doesn't reliably send it to
        // the page; catch every toggle (on or off) here instead.
        NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] ev in
            if ev.keyCode == 57 { self?.web.evaluateJavaScript("window.app && app.panic && app.panic()") }
            return ev
        }
    }

    /// Dev aid: `ExpansionBuilder --snapshot out.png [--script setup.js] [--size 1680x1020] [--wait seconds]`
    /// renders the UI (after running the optional script) to a PNG and quits.
    func snapshotModeIfRequested() {
        let args = CommandLine.arguments
        guard let si = args.firstIndex(of: "--snapshot"), si + 1 < args.count else { return }
        let out = args[si + 1]
        var script = ""
        if let ji = args.firstIndex(of: "--script"), ji + 1 < args.count { script = (try? String(contentsOfFile: args[ji + 1], encoding: .utf8)) ?? "" }
        if let zi = args.firstIndex(of: "--size"), zi + 1 < args.count {
            let p = args[zi + 1].split(separator: "x").compactMap { Double($0) }
            if p.count == 2 { window.setContentSize(NSSize(width: p[0], height: p[1])) }
        }
        var wait = 2.0
        if let wi = args.firstIndex(of: "--wait"), wi + 1 < args.count, let w = Double(args[wi + 1]) { wait = w }
        allowQuit = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            self.web.evaluateJavaScript("(async()=>{ \(script) \n})().then(()=>'ok',e=>'ERR '+e.message+' '+e.stack)") { r, err in
                if let r = r { print("script:", r) }
                if let err = err { print("script error:", err) }
                DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
                    let cfg = WKSnapshotConfiguration()
                    self.web.takeSnapshot(with: cfg) { img, e in
                        if let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                           let png = rep.representation(using: .png, properties: [:]) {
                            try? png.write(to: URL(fileURLWithPath: out)); print("snapshot:", out, self.web.title ?? "")
                        } else { print("snapshot failed", e as Any) }
                        NSApp.terminate(nil)
                    }
                }
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if allowQuit { return .terminateNow }
        web.evaluateJavaScript("window.app && app.isDirty ? app.isDirty() : false") { result, _ in
            if (result as? Bool) == true {
                let a = NSAlert()
                a.messageText = "Quit without saving?"
                a.informativeText = "Your expansion project has unsaved changes."
                a.addButton(withTitle: "Quit")
                a.addButton(withTitle: "Cancel")
                let quit = a.runModal() == .alertFirstButtonReturn
                sender.reply(toApplicationShouldTerminate: quit)
            } else {
                sender.reply(toApplicationShouldTerminate: true)
            }
        }
        return .terminateLater
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        NSApp.terminate(nil)
        return false
    }

    // JS alert/confirm support
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message
        a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel()
        p.allowsMultipleSelection = parameters.allowsMultipleSelection
        p.canChooseDirectories = parameters.allowsDirectories
        p.beginSheetModal(for: window) { r in completionHandler(r == .OK ? p.urls : nil) }
    }

    // MARK: Menu

    func buildMenu() {
        let main = NSMenu()
        func item(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.keyEquivalentModifierMask = mods; return i
        }
        let appItem = NSMenuItem(); let appMenu = NSMenu()
        appMenu.addItem(item("About Expansion Builder", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""))
        appMenu.addItem(.separator())
        appMenu.addItem(item("Hide", #selector(NSApplication.hide(_:)), "h"))
        appMenu.addItem(item("Quit Expansion Builder", #selector(NSApplication.terminate(_:)), "q"))
        appItem.submenu = appMenu; main.addItem(appItem)

        let fileItem = NSMenuItem(); let fileMenu = NSMenu(title: "File")
        for (t, cmd, k, m) in [("New Expansion", "new", "n", NSEvent.ModifierFlags.command),
                               ("Open Project…", "open", "o", .command),
                               ("Save Project", "save", "s", .command),
                               ("Save Project As…", "saveAs", "S", .command),
                               ("Add Samples…", "addSamples", "i", .command),
                               ("Export Expansion…", "export", "e", .command)] {
            let i = item(t, #selector(menuCommand(_:)), k, m); i.representedObject = cmd; i.target = self; fileMenu.addItem(i)
        }
        fileItem.submenu = fileMenu; main.addItem(fileItem)

        let editItem = NSMenuItem(); let edit = NSMenu(title: "Edit")
        edit.addItem(item("Undo", Selector(("undo:")), "z"))
        edit.addItem(item("Redo", Selector(("redo:")), "Z"))
        edit.addItem(.separator())
        edit.addItem(item("Cut", #selector(NSText.cut(_:)), "x"))
        edit.addItem(item("Copy", #selector(NSText.copy(_:)), "c"))
        edit.addItem(item("Paste", #selector(NSText.paste(_:)), "v"))
        edit.addItem(item("Select All", #selector(NSText.selectAll(_:)), "a"))
        editItem.submenu = edit; main.addItem(editItem)

        let viewItem = NSMenuItem(); let view = NSMenu(title: "View")
        view.addItem(item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]))
        let r = item("Reload UI", #selector(reloadUI), "r", [.command, .option]); r.target = self; view.addItem(r)
        viewItem.submenu = view; main.addItem(viewItem)
        NSApp.mainMenu = main
    }

    @objc func menuCommand(_ sender: NSMenuItem) {
        guard let cmd = sender.representedObject as? String else { return }
        web.evaluateJavaScript("window.app && app.menu('\(cmd)')")
    }
    @objc func reloadUI() { web.reload() }

    // MARK: Bridge

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let id = body["id"] as? Int, let cmd = body["cmd"] as? String else { return }
        let args = body["args"] as? [String: Any] ?? [:]
        handle(cmd, args) { [weak self] ok, payload in self?.reply(id, ok, payload) }
    }

    func reply(_ id: Int, _ ok: Bool, _ payload: Any?) {
        let wrapped: [String: Any] = ["v": payload ?? NSNull()]
        let data = (try? JSONSerialization.data(withJSONObject: wrapped, options: [.fragmentsAllowed])) ?? Data("{\"v\":null}".utf8)
        let json = String(data: data, encoding: .utf8) ?? "{\"v\":null}"
        DispatchQueue.main.async {
            self.web.evaluateJavaScript("window.__bridgeReply(\(id), \(ok), \(json).v)")
        }
    }

    func handle(_ cmd: String, _ a: [String: Any], _ done: @escaping (Bool, Any?) -> Void) {
        let fm = FileManager.default
        func str(_ k: String) -> String { a[k] as? String ?? "" }
        switch cmd {
        case "pickFolder":
            let p = NSOpenPanel()
            p.canChooseFiles = false; p.canChooseDirectories = true; p.canCreateDirectories = true
            p.message = str("message"); p.prompt = a["prompt"] as? String ?? "Choose"
            p.beginSheetModal(for: window) { r in done(true, r == .OK ? p.url?.path : nil) }

        case "pickSamples":
            let p = NSOpenPanel()
            p.canChooseFiles = true; p.canChooseDirectories = true; p.allowsMultipleSelection = true
            p.message = "Choose sounds or folders of sounds"; p.prompt = "Add"
            p.beginSheetModal(for: window) { r in
                guard r == .OK else { return done(true, []) }
                done(true, self.expandAudio(p.urls))
            }

        case "pickImage":
            let p = NSOpenPanel()
            p.allowedContentTypes = [.image]; p.prompt = "Use Image"
            p.beginSheetModal(for: window) { r in done(true, r == .OK ? p.url?.path : nil) }

        case "pickProjectToOpen":
            let p = NSOpenPanel()
            p.canChooseFiles = true; p.canChooseDirectories = true; p.treatsFilePackagesAsDirectories = false
            p.message = "Choose an Expansion Builder project folder (.ebproj) or its project.json"; p.prompt = "Open"
            p.beginSheetModal(for: window) { r in
                guard r == .OK, var u = p.url else { return done(true, nil) }
                if u.lastPathComponent == "project.json" { u = u.deletingLastPathComponent() }
                done(true, u.path)
            }

        case "pickSaveLocation":
            let p = NSSavePanel()
            p.nameFieldStringValue = str("name"); p.canCreateDirectories = true
            p.message = str("message")
            p.beginSheetModal(for: window) { r in done(true, r == .OK ? p.url?.path : nil) }

        case "exists":
            var isDir: ObjCBool = false
            let e = fm.fileExists(atPath: str("path"), isDirectory: &isDir)
            done(true, e ? (isDir.boolValue ? "dir" : "file") : nil)

        case "mkdir":
            do { try fm.createDirectory(atPath: str("path"), withIntermediateDirectories: true); done(true, nil) }
            catch { done(false, error.localizedDescription) }

        case "remove":
            // Replaces a folder the user chose to overwrite (to the Trash), or clears the Send-to-MPC outbox (permanently).
            let url = URL(fileURLWithPath: str("path"))
            do {
                if fm.fileExists(atPath: url.path) {
                    if (a["permanent"] as? Bool) == true && url.path.hasPrefix(outboxURL().path + "/") { try fm.removeItem(at: url) }
                    else { try fm.trashItem(at: url, resultingItemURL: nil) }
                }
                done(true, nil)
            } catch { done(false, error.localizedDescription) }

        case "stagingDir":
            // Where "Send to MPC" builds the expansion before streaming it over Wi-Fi.
            let u = outboxURL()
            do { try fm.createDirectory(at: u, withIntermediateDirectories: true); done(true, u.path) }
            catch { done(false, error.localizedDescription) }

        case "writeText":
            do {
                let url = URL(fileURLWithPath: str("path"))
                try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try Data(str("text").utf8).write(to: url, options: .atomic); done(true, nil)
            } catch { done(false, error.localizedDescription) }

        case "readText":
            if let s = try? String(contentsOfFile: str("path"), encoding: .utf8) { done(true, s) } else { done(false, "Could not read \(str("path"))") }

        case "writeChunk":
            let path = str("path")
            guard let data = Data(base64Encoded: str("b64")) else { return done(false, "bad base64") }
            do {
                if (a["append"] as? Bool) != true {
                    let url = URL(fileURLWithPath: path)
                    try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try data.write(to: url); done(true, nil)
                } else {
                    let h = try FileHandle(forWritingTo: URL(fileURLWithPath: path))
                    try h.seekToEnd(); try h.write(contentsOf: data); try h.close(); done(true, nil)
                }
            } catch { done(false, error.localizedDescription) }

        case "copyFile":
            do {
                let dst = URL(fileURLWithPath: str("to"))
                try fm.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
                if fm.fileExists(atPath: dst.path) { try fm.removeItem(at: dst) }
                try fm.copyItem(atPath: str("from"), toPath: dst.path); done(true, nil)
            } catch { done(false, error.localizedDescription) }

        case "zip":
            run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", str("src"), str("dest")], env: nil) { code, out in
                done(code == 0, code == 0 ? str("dest") : out)
            }

        case "reveal":
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: str("path"))]); done(true, nil)

        case "setDragRegion":
            web.dragHeight = CGFloat(a["height"] as? Double ?? 0)
            web.holes = (a["holes"] as? [[Double]] ?? []).compactMap { $0.count == 4 ? CGRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) : nil }
            done(true, nil)

        case "scanLibrary":
            scanLibrary(root: (str("root") as NSString).expandingTildeInPath, refresh: (a["refresh"] as? Bool) == true, done: done)

        case "sendToMPC":
            sendToMPC(src: str("src"), host: str("host"), password: str("password"), drive: str("drive"), done: done)

        default:
            done(false, "Unknown command \(cmd)")
        }
    }

    /// Indexes every audio file under root into a cached TSV ("relative/path\tbytes" per line) and returns where it is.
    /// The page fetches the file itself, so 200k+ paths never go through the bridge.
    func scanLibrary(root: String, refresh: Bool, done: @escaping (Bool, Any?) -> Void) {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: root, isDirectory: &isDir), isDir.boolValue else { return done(false, "Folder not found: \(root)") }
        let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Expansion Builder", isDirectory: true)
        try? fm.createDirectory(at: support, withIntermediateDirectories: true)
        let key = root.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? String($0) : "_" }.joined().suffix(80)
        let index = support.appendingPathComponent("library-\(key).tsv")
        func result(_ count: Int?) -> [String: Any] {
            let attrs = try? fm.attributesOfItem(atPath: index.path)
            let date = (attrs?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
            return ["index": index.path, "root": root, "scanned": date * 1000, "count": count ?? -1]
        }
        if !refresh && fm.fileExists(atPath: index.path) { return done(true, result(nil)) }
        DispatchQueue.global(qos: .userInitiated).async {
            let rootURL = URL(fileURLWithPath: root, isDirectory: true).standardizedFileURL
            let prefix = rootURL.path.hasSuffix("/") ? rootURL.path : rootURL.path + "/"
            var rows: [(String, Int)] = []
            if let en = fm.enumerator(at: rootURL, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey],
                                      options: [.skipsHiddenFiles, .skipsPackageDescendants]) {
                for case let f as URL in en where audioExtensions.contains(f.pathExtension.lowercased()) {
                    var path = f.standardizedFileURL.path
                    if path.hasPrefix(prefix) { path = String(path.dropFirst(prefix.count)) }
                    if path.contains("\t") || path.contains("\n") { continue }
                    let size = (try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                    rows.append((path, size))
                }
            }
            rows.sort { $0.0.localizedStandardCompare($1.0) == .orderedAscending }
            let text = rows.map { "\($0.0)\t\($0.1)" }.joined(separator: "\n")
            do { try Data(text.utf8).write(to: index, options: .atomic); done(true, result(rows.count)) }
            catch { done(false, error.localizedDescription) }
        }
    }

    func expandAudio(_ urls: [URL]) -> [String] {
        var out: [String] = []
        let fm = FileManager.default
        for u in urls {
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: u.path, isDirectory: &isDir) else { continue }
            if isDir.boolValue {
                if let en = fm.enumerator(at: u, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
                    for case let f as URL in en where audioExtensions.contains(f.pathExtension.lowercased()) { out.append(f.path) }
                }
            } else if audioExtensions.contains(u.pathExtension.lowercased()) { out.append(u.path) }
        }
        return out.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    func run(_ exe: String, _ args: [String], env: [String: String]?, done: @escaping (Int32, String) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: exe)
            p.arguments = args
            if let env = env { p.environment = ProcessInfo.processInfo.environment.merging(env) { $1 } }
            let pipe = Pipe(); p.standardOutput = pipe; p.standardError = pipe
            do { try p.run() } catch { return done(-1, error.localizedDescription) }
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            p.waitUntilExit()
            done(p.terminationStatus, String(data: data, encoding: .utf8) ?? "")
        }
    }

    /// Streams an exported expansion folder to the MPC over SSH (tar over ssh, like SDK/tools/mpc_remote.py),
    /// replacing any previous copy of the same folder in <drive>/Expansions.
    func sendToMPC(src: String, host: String, password: String, drive: String, done: @escaping (Bool, Any?) -> Void) {
        let srcURL = URL(fileURLWithPath: src)
        let name = srcURL.lastPathComponent
        let parent = srcURL.deletingLastPathComponent().path
        guard !name.isEmpty, !host.isEmpty, !name.contains("'") else { return done(false, "Missing host or folder") }
        // The internal SSD is mounted at /nvme; SD cards / USB drives at /media/<name>. /media itself is a RAM disk,
        // so a wrong path "succeeds" but vanishes — the remote side refuses anything that isn't a real mount.
        let d = drive.trimmingCharacters(in: .whitespaces)
        let root = (d.isEmpty || d == "nvme" || d == "internal") ? "/nvme" : (d.hasPrefix("/") ? d : "/media/\(d)")
        guard !root.contains("'") else { return done(false, "Bad drive name") }
        let dest = "\(root)/Expansions"
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("eb-askpass-\(UUID().uuidString).sh")
        try? "#!/bin/sh\necho \"$EB_MPC_PW\"\n".write(to: tmp, atomically: true, encoding: .utf8)
        chmod(tmp.path, 0o700)
        let remote = "grep -q ' \(root) ' /proc/mounts || { echo \"No drive mounted at \(root) on the MPC (check the Drive field)\"; cat >/dev/null; exit 3; }; "
            + "mkdir -p '\(dest)' && rm -rf '\(dest)/\(name)' && tar -C '\(dest)' -xf - && echo EB_OK"
        let shell = "COPYFILE_DISABLE=1 tar -C \(shq(parent)) -cf - \(shq(name)) | /usr/bin/ssh -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new root@\(shq(host)) \(shq(remote))"
        var env = ["SSH_ASKPASS": tmp.path, "SSH_ASKPASS_REQUIRE": "force", "DISPLAY": ":0", "EB_MPC_PW": password]
        if password.isEmpty { env["SSH_ASKPASS_REQUIRE"] = "never" }
        run("/bin/sh", ["-c", shell], env: env) { code, out in
            try? FileManager.default.removeItem(at: tmp)
            let ok = code == 0 && out.contains("EB_OK")
            let msg = out.split(separator: "\n").filter { !$0.hasPrefix("Warning: Permanently added") }.joined(separator: "\n")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            done(ok, ok ? "\(dest)/\(name)" : (msg.isEmpty ? "Could not reach the MPC at \(host)" : msg))
        }
    }
    func outboxURL() -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Expansion Builder/Outbox", isDirectory: true).standardizedFileURL
    }
    func shq(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'" }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
