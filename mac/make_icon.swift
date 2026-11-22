// Draws the app icon (a pad-sampler: screen, knob, 4x4 pads) and writes mac/AppIcon.icns.
// Usage: swift mac/make_icon.swift   (run from the ExpansionBuilder folder; build.sh picks it up)
import AppKit

func c(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
}

func draw(_ S: CGFloat) -> NSBitmapImageRep {
  let px = Int(S)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let u = S / 1024 // design on a 1024 grid (macOS icon template: 824 body, 100 margin)
  func R(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> NSRect { NSRect(x: x * u, y: (1024 - y - h) * u, width: w * u, height: h * u) }

  // Body with drop shadow
  let body = R(100, 100, 824, 824)
  NSGraphicsContext.saveGraphicsState()
  let sh = NSShadow(); sh.shadowColor = NSColor(white: 0, alpha: 0.45); sh.shadowBlurRadius = 24 * u; sh.shadowOffset = NSSize(width: 0, height: -10 * u); sh.set()
  let bp = NSBezierPath(roundedRect: body, xRadius: 185 * u, yRadius: 185 * u)
  c(0x1c1c20).setFill(); bp.fill()
  NSGraphicsContext.restoreGraphicsState()
  NSGradient(starting: c(0x34343b), ending: c(0x141417))!.draw(in: bp, angle: -90)
  c(0xffffff, 0.08).setStroke(); bp.lineWidth = 4 * u; bp.stroke()

  // Screen (green LCD) with a little waveform
  let scr = NSBezierPath(roundedRect: R(227, 158, 418, 124), xRadius: 26 * u, yRadius: 26 * u)
  c(0x0b1410).setFill(); scr.fill()
  c(0x7dffb0, 0.25).setStroke(); scr.lineWidth = 4 * u; scr.stroke()
  let wave = NSBezierPath(); wave.lineWidth = 9 * u; wave.lineCapStyle = .round; wave.lineJoinStyle = .round
  for i in 0...60 {
    let t = CGFloat(i) / 60, x = 255 + t * 354
    let y = 220 - sin(t * .pi * 9) * 44 * exp(-t * 3.2)
    let p = NSPoint(x: x * u, y: (1024 - y) * u)
    i == 0 ? wave.move(to: p) : wave.line(to: p)
  }
  c(0x7dffb0).setStroke(); wave.stroke()

  // Data knob
  let kr = R(673, 158, 124, 124)
  NSGraphicsContext.saveGraphicsState()
  let ks = NSShadow(); ks.shadowColor = NSColor(white: 0, alpha: 0.6); ks.shadowBlurRadius = 10 * u; ks.shadowOffset = NSSize(width: 0, height: -5 * u); ks.set()
  c(0x26262b).setFill(); NSBezierPath(ovalIn: kr).fill()
  NSGraphicsContext.restoreGraphicsState()
  NSGradient(starting: c(0x4a4a52), ending: c(0x1e1e22))!.draw(in: NSBezierPath(ovalIn: kr.insetBy(dx: 11 * u, dy: 11 * u)), angle: -90)
  let tick = NSBezierPath(); tick.lineWidth = 12 * u; tick.lineCapStyle = .round
  tick.move(to: NSPoint(x: kr.midX + 15 * u, y: kr.midY + 15 * u)); tick.line(to: NSPoint(x: kr.midX + 36 * u, y: kr.midY + 36 * u))
  c(0xff3b30).setStroke(); tick.stroke()

  // 4x4 pads, a few lit
  let lit: [Int: UInt32] = [0: 0xff3b30, 5: 0xff3b30, 6: 0xffb340, 10: 0xff3b30, 15: 0xff3b30, 3: 0xffb340, 12: 0xffb340]
  let gx: CGFloat = 227, gy: CGFloat = 318, cell: CGFloat = 150, pad: CGFloat = 128
  for r in 0..<4 { for k in 0..<4 {
    let i = r * 4 + k, rect = R(gx + CGFloat(k) * cell, gy + CGFloat(r) * cell, pad, pad)
    let pp = NSBezierPath(roundedRect: rect, xRadius: 22 * u, yRadius: 22 * u)
    if let col = lit[i] {
      NSGraphicsContext.saveGraphicsState()
      let g = NSShadow(); g.shadowColor = c(col, 0.75); g.shadowBlurRadius = 34 * u; g.shadowOffset = .zero; g.set()
      c(col).setFill(); pp.fill()
      NSGraphicsContext.restoreGraphicsState()
      NSGradient(starting: c(0xffffff, 0.35), ending: c(0xffffff, 0))!.draw(in: pp, angle: -90)
    } else {
      NSGradient(starting: c(0x3c3c44), ending: c(0x2a2a30))!.draw(in: pp, angle: -90)
      c(0x000000, 0.35).setStroke(); pp.lineWidth = 3 * u; pp.stroke()
    }
  } }
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

let fm = FileManager.default
let set = fm.temporaryDirectory.appendingPathComponent("AppIcon.iconset")
try? fm.removeItem(at: set); try! fm.createDirectory(at: set, withIntermediateDirectories: true)
for s in [16, 32, 128, 256, 512] {
  for (scale, suffix) in [(1, ""), (2, "@2x")] {
    let png = draw(CGFloat(s * scale)).representation(using: .png, properties: [:])!
    try! png.write(to: set.appendingPathComponent("icon_\(s)x\(s)\(suffix).png"))
  }
}
try! draw(1024).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "mac/AppIcon.png"))
let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
p.arguments = ["-c", "icns", set.path, "-o", "mac/AppIcon.icns"]; try! p.run(); p.waitUntilExit()
print(p.terminationStatus == 0 ? "wrote mac/AppIcon.icns" : "iconutil failed")
