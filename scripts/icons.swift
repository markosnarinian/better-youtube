import AppKit

// Reproducible toolbar/app icons; no third-party assets.
for size in [64, 128, 256] {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                                  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                  isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let s = CGFloat(size)
    NSColor(srgbRed: 1, green: 0, blue: 0.2, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: s, height: s), xRadius: s * 0.28, yRadius: s * 0.28).fill()
    NSColor.white.setFill()
    let play = NSBezierPath()
    play.move(to: NSPoint(x: s * 0.40, y: s * 0.29))
    play.line(to: NSPoint(x: s * 0.40, y: s * 0.71))
    play.line(to: NSPoint(x: s * 0.73, y: s * 0.50))
    play.close()
    play.fill()
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "extension/icons/icon-\(size).png"))
}
