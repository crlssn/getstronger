import AppKit
import AVFoundation
import CoreVideo

let canvasWidth = 1080
let canvasHeight = 1920
let framesPerSecond: Int32 = 30
let duration = 19.0

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceDirectory = root.appendingPathComponent("promo/source")
let outputDirectory = root.appendingPathComponent("promo/output")
let videoURL = outputDirectory.appendingPathComponent("one-more-rep-promo-reel.mp4")
let coverURL = outputDirectory.appendingPathComponent("one-more-rep-reel-cover.png")

let homeImage = sourceDirectory.appendingPathComponent("Screenshot 2026-08-13 at 22-34-33 One More Rep.png")
let workoutImage = sourceDirectory.appendingPathComponent("Screenshot 2026-08-13 at 22-40-55 One More Rep.png")
let notificationsImage = sourceDirectory.appendingPathComponent("Screenshot 2026-08-13 at 22-34-51 One More Rep.png")
let progressImage = sourceDirectory.appendingPathComponent("Screenshot 2026-08-13 at 23-45-34 One More Rep.png")

struct Palette {
    static let charcoal = NSColor(hex: 0x23272A)
    static let forest = NSColor(hex: 0x3F5A3C)
    static let gold = NSColor(hex: 0xB58A3A)
    static let sage = NSColor(hex: 0xE8EEE5)
    static let parchment = NSColor(hex: 0xF7F0E2)
    static let canvas = NSColor(hex: 0xF5F7F8)
    static let slate = NSColor(hex: 0x64748B)
    static let white = NSColor.white
}

extension NSColor {
    convenience init(hex: Int, alpha: CGFloat = 1) {
        self.init(
            calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255,
            alpha: alpha
        )
    }
}

extension CGFloat {
    func clamped(to range: ClosedRange<CGFloat>) -> CGFloat {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}

func smoothstep(_ value: CGFloat) -> CGFloat {
    let t = value.clamped(to: 0...1)
    return t * t * (3 - 2 * t)
}

func sceneOpacity(localTime: Double, sceneDuration: Double, fade: Double = 0.32) -> CGFloat {
    let fadeIn = smoothstep(CGFloat(localTime / fade))
    let fadeOut = smoothstep(CGFloat((sceneDuration - localTime) / fade))
    return min(fadeIn, fadeOut)
}

func font(size: CGFloat, weight: NSFont.Weight) -> NSFont {
    NSFont.systemFont(ofSize: size, weight: weight)
}

func drawText(
    _ text: String,
    in rect: CGRect,
    size: CGFloat,
    weight: NSFont.Weight,
    color: NSColor,
    alignment: NSTextAlignment = .left,
    lineHeight: CGFloat? = nil,
    tracking: CGFloat = 0
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.minimumLineHeight = lineHeight ?? size * 1.12
    paragraph.maximumLineHeight = lineHeight ?? size * 1.12
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font(size: size, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: paragraph,
        .kern: tracking,
    ]
    NSAttributedString(string: text, attributes: attributes).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading])
}

func fillRoundedRect(_ rect: CGRect, radius: CGFloat, color: NSColor) {
    color.setFill()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
}

func strokeRoundedRect(_ rect: CGRect, radius: CGFloat, color: NSColor, width: CGFloat) {
    color.setStroke()
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    path.lineWidth = width
    path.stroke()
}

func drawLightBackground() {
    Palette.canvas.setFill()
    NSBezierPath(rect: CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight)).fill()

    NSColor(hex: 0xDDE8DF, alpha: 0.62).setFill()
    NSBezierPath(ovalIn: CGRect(x: -260, y: -170, width: 720, height: 720)).fill()
    NSColor(hex: 0xF3E8D5, alpha: 0.65).setFill()
    NSBezierPath(ovalIn: CGRect(x: 700, y: 1260, width: 660, height: 660)).fill()
}

func drawDarkBackground() {
    Palette.charcoal.setFill()
    NSBezierPath(rect: CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight)).fill()

    NSColor(hex: 0x365443, alpha: 0.72).setFill()
    NSBezierPath(ovalIn: CGRect(x: -360, y: -260, width: 900, height: 900)).fill()
    NSColor(hex: 0x8E6B2D, alpha: 0.28).setFill()
    NSBezierPath(ovalIn: CGRect(x: 710, y: 1310, width: 640, height: 640)).fill()
}

func drawBrandEyebrow(color: NSColor) {
    fillRoundedRect(CGRect(x: 72, y: 70, width: 20, height: 20), radius: 10, color: Palette.gold)
    drawText("ONE MORE REP", in: CGRect(x: 108, y: 62, width: 650, height: 48), size: 25, weight: .bold, color: color, tracking: 3.2)
}

func drawScreenshot(
    _ image: NSImage,
    crop: CGRect?,
    localProgress: CGFloat,
    opacity: CGFloat,
    baseY: CGFloat = 450
) {
    let eased = smoothstep(localProgress)
    let width: CGFloat = 908 + 20 * eased
    let sourceRect = crop ?? CGRect(origin: .zero, size: image.size)
    let aspect = sourceRect.width / sourceRect.height
    let height = width / aspect
    let x = (CGFloat(canvasWidth) - width) / 2
    let y = baseY - 20 * eased
    let cardRect = CGRect(x: x, y: y, width: width, height: height)

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.18 * opacity)
    shadow.shadowBlurRadius = 35
    shadow.shadowOffset = NSSize(width: 0, height: -12)
    shadow.set()
    fillRoundedRect(cardRect, radius: 34, color: Palette.white.withAlphaComponent(opacity))
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: cardRect, xRadius: 34, yRadius: 34).addClip()
    image.draw(in: cardRect, from: sourceRect, operation: .sourceOver, fraction: opacity, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    NSGraphicsContext.restoreGraphicsState()

    strokeRoundedRect(cardRect, radius: 34, color: NSColor(hex: 0xD8E0E7, alpha: opacity), width: 2)
}

func drawFeatureScene(
    image: NSImage,
    crop: CGRect? = nil,
    heading: String,
    subheading: String,
    localTime: Double,
    sceneDuration: Double,
    imageY: CGFloat = 450
) {
    drawLightBackground()
    let opacity = sceneOpacity(localTime: localTime, sceneDuration: sceneDuration)
    let progress = CGFloat(localTime / sceneDuration).clamped(to: 0...1)
    let rise = 20 * (1 - smoothstep(CGFloat(localTime / 0.5)))

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current?.cgContext.setAlpha(opacity)
    drawBrandEyebrow(color: Palette.forest)
    drawText(heading, in: CGRect(x: 72, y: 150 + rise, width: 936, height: 160), size: 68, weight: .bold, color: Palette.charcoal, lineHeight: 72)
    drawText(subheading, in: CGRect(x: 74, y: 320 + rise, width: 900, height: 80), size: 30, weight: .medium, color: Palette.slate, lineHeight: 38)
    NSGraphicsContext.restoreGraphicsState()

    drawScreenshot(image, crop: crop, localProgress: progress, opacity: opacity, baseY: imageY)
}

func drawIntro(localTime: Double, sceneDuration: Double) {
    drawDarkBackground()
    let opacity = sceneOpacity(localTime: localTime, sceneDuration: sceneDuration, fade: 0.28)
    let entrance = smoothstep(CGFloat(localTime / 0.7))

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current?.cgContext.setAlpha(opacity)
    drawBrandEyebrow(color: Palette.white)
    drawText("TRAIN\nSMARTER.", in: CGRect(x: 72, y: 470 + 40 * (1 - entrance), width: 936, height: 330), size: 114, weight: .heavy, color: Palette.white, lineHeight: 112)
    drawText("GET STRONGER.", in: CGRect(x: 76, y: 795 + 25 * (1 - entrance), width: 930, height: 140), size: 68, weight: .bold, color: Palette.sage)
    fillRoundedRect(CGRect(x: 76, y: 1030, width: 250 * entrance, height: 10), radius: 5, color: Palette.gold)
    drawText("Routines, progress and community—\nall in one beautifully simple app.", in: CGRect(x: 78, y: 1110, width: 850, height: 160), size: 34, weight: .medium, color: NSColor.white.withAlphaComponent(0.78), lineHeight: 46)
    NSGraphicsContext.restoreGraphicsState()
}

func drawOutro(localTime: Double, sceneDuration: Double) {
    drawDarkBackground()
    let opacity = sceneOpacity(localTime: localTime, sceneDuration: sceneDuration, fade: 0.35)
    let entrance = smoothstep(CGFloat(localTime / 0.8))

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current?.cgContext.setAlpha(opacity)
    drawBrandEyebrow(color: Palette.white)
    drawText("READY FOR\nONE MORE REP?", in: CGRect(x: 72, y: 480 + 36 * (1 - entrance), width: 936, height: 330), size: 92, weight: .heavy, color: Palette.white, lineHeight: 102)
    drawText("Train. Track. Repeat.", in: CGRect(x: 76, y: 865, width: 900, height: 100), size: 42, weight: .semibold, color: Palette.sage)
    fillRoundedRect(CGRect(x: 72, y: 1090, width: 936, height: 126), radius: 38, color: Palette.parchment)
    drawText("getstronger.pro", in: CGRect(x: 72, y: 1120, width: 936, height: 70), size: 38, weight: .bold, color: Palette.charcoal, alignment: .center, tracking: 0.8)
    drawText("Built for consistent progress.", in: CGRect(x: 76, y: 1320, width: 900, height: 70), size: 29, weight: .medium, color: NSColor.white.withAlphaComponent(0.66), alignment: .center)
    NSGraphicsContext.restoreGraphicsState()
}

let images = [homeImage, workoutImage, notificationsImage, progressImage].compactMap { NSImage(contentsOf: $0) }
guard images.count == 4 else {
    fputs("Missing promo source screenshots in promo/source.\n", stderr)
    exit(1)
}

func render(at time: Double, into pixelBuffer: CVPixelBuffer) {
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
    guard let context = CGContext(
        data: baseAddress,
        width: canvasWidth,
        height: canvasHeight,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: colorSpace,
        bitmapInfo: bitmapInfo
    ) else { return }

    let graphicsContext = NSGraphicsContext(cgContext: context, flipped: true)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphicsContext

    switch time {
    case 0..<2.3:
        drawIntro(localTime: time, sceneDuration: 2.3)
    case 2.3..<5.7:
        drawFeatureScene(
            image: images[0],
            heading: "Everything you need\nto train better.",
            subheading: "Your next workout, streak and community feed.",
            localTime: time - 2.3,
            sceneDuration: 3.4
        )
    case 5.7..<9.2:
        drawFeatureScene(
            image: images[1],
            heading: "Log every set.",
            subheading: "See PRs, session details and encouragement.",
            localTime: time - 5.7,
            sceneDuration: 3.5
        )
    case 9.2..<12.2:
        drawFeatureScene(
            image: images[2],
            heading: "Stay connected.",
            subheading: "Useful updates without all the noise.",
            localTime: time - 9.2,
            sceneDuration: 3.0
        )
    case 12.2..<15.8:
        let progressCrop = CGRect(x: 930, y: 0, width: 1500, height: 2088)
        drawFeatureScene(
            image: images[3],
            crop: progressCrop,
            heading: "See real progress.",
            subheading: "Volume trends, personal bests and history.",
            localTime: time - 12.2,
            sceneDuration: 3.6,
            imageY: 430
        )
    default:
        drawOutro(localTime: time - 15.8, sceneDuration: 3.2)
    }

    NSGraphicsContext.restoreGraphicsState()
    context.flush()
    flipRowsVertically(in: pixelBuffer)
}

func makePixelBuffer() -> CVPixelBuffer {
    var pixelBuffer: CVPixelBuffer?
    let attributes: [CFString: Any] = [
        kCVPixelBufferCGImageCompatibilityKey: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey: true,
    ]
    let status = CVPixelBufferCreate(
        kCFAllocatorDefault,
        canvasWidth,
        canvasHeight,
        kCVPixelFormatType_32BGRA,
        attributes as CFDictionary,
        &pixelBuffer
    )
    guard status == kCVReturnSuccess, let pixelBuffer else {
        fatalError("Could not create a video frame")
    }
    return pixelBuffer
}

func flipRowsVertically(in pixelBuffer: CVPixelBuffer) {
    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let temporaryRow = UnsafeMutableRawPointer.allocate(byteCount: bytesPerRow, alignment: 64)
    defer { temporaryRow.deallocate() }

    for row in 0..<(height / 2) {
        let top = baseAddress.advanced(by: row * bytesPerRow)
        let bottom = baseAddress.advanced(by: (height - row - 1) * bytesPerRow)
        memcpy(temporaryRow, top, bytesPerRow)
        memcpy(top, bottom, bytesPerRow)
        memcpy(bottom, temporaryRow, bytesPerRow)
    }
}

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
try? FileManager.default.removeItem(at: videoURL)

let writer = try AVAssetWriter(outputURL: videoURL, fileType: .mp4)
let compression: [String: Any] = [
    AVVideoAverageBitRateKey: 9_000_000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
]
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: canvasWidth,
    AVVideoHeightKey: canvasHeight,
    AVVideoCompressionPropertiesKey: compression,
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: canvasWidth,
    kCVPixelBufferHeightKey as String: canvasHeight,
])

guard writer.canAdd(input) else { fatalError("Could not configure the video writer") }
writer.add(input)
guard writer.startWriting() else { fatalError(writer.error?.localizedDescription ?? "Could not start the video writer") }
writer.startSession(atSourceTime: .zero)

let totalFrames = Int(duration * Double(framesPerSecond))
for frame in 0..<totalFrames {
    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
    autoreleasepool {
        let buffer = makePixelBuffer()
        let time = Double(frame) / Double(framesPerSecond)
        render(at: time, into: buffer)
        let presentationTime = CMTime(value: CMTimeValue(frame), timescale: framesPerSecond)
        guard adaptor.append(buffer, withPresentationTime: presentationTime) else {
            fatalError(writer.error?.localizedDescription ?? "Could not append video frame")
        }
    }
}

input.markAsFinished()
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting { semaphore.signal() }
semaphore.wait()
guard writer.status == .completed else {
    fatalError(writer.error?.localizedDescription ?? "Could not finish the video")
}

let coverBuffer = makePixelBuffer()
render(at: 1.1, into: coverBuffer)
try CIContext().writePNGRepresentation(
    of: CIImage(cvPixelBuffer: coverBuffer),
    to: coverURL,
    format: .RGBA8,
    colorSpace: CGColorSpaceCreateDeviceRGB()
)

print(videoURL.path)
print(coverURL.path)
