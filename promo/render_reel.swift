import AppKit
import AVFoundation
import CoreVideo

let canvasWidth = 1080
let canvasHeight = 1920
let framesPerSecond: Int32 = 30
let duration = 21.0

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceDirectory = root.appendingPathComponent("promo/source")
let assetDirectory = root.appendingPathComponent("promo/assets")
let outputDirectory = root.appendingPathComponent("promo/output")
let videoURL = outputDirectory.appendingPathComponent("one-more-rep-promo-reel.mp4")
let coverURL = outputDirectory.appendingPathComponent("one-more-rep-reel-cover.png")

let homeImageURL = sourceDirectory.appendingPathComponent("Screenshot 2026-08-13 at 22-34-33 One More Rep.png")
let workoutImageURL = sourceDirectory.appendingPathComponent("Screenshot 2026-08-13 at 22-40-55 One More Rep.png")
let notificationsImageURL = sourceDirectory.appendingPathComponent("Screenshot 2026-08-13 at 22-34-51 One More Rep.png")
let progressImageURL = sourceDirectory.appendingPathComponent("Screenshot 2026-08-13 at 23-45-34 One More Rep.png")
let squatImageURL = assetDirectory.appendingPathComponent("workout-squat.png")
let deadliftImageURL = assetDirectory.appendingPathComponent("workout-deadlift.png")
let communityImageURL = assetDirectory.appendingPathComponent("workout-community.png")

struct Palette {
    static let charcoal = NSColor(hex: 0x23272A)
    static let forest = NSColor(hex: 0x3F5A3C)
    static let gold = NSColor(hex: 0xB58A3A)
    static let sage = NSColor(hex: 0xE8EEE5)
    static let parchment = NSColor(hex: 0xF7F0E2)
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

func sceneOpacity(localTime: Double, sceneDuration: Double, fade: Double = 0.28) -> CGFloat {
    let fadeIn = smoothstep(CGFloat(localTime / fade))
    let fadeOut = smoothstep(CGFloat((sceneDuration - localTime) / fade))
    return min(fadeIn, fadeOut)
}

func font(size: CGFloat, weight: NSFont.Weight) -> NSFont {
    NSFont.systemFont(ofSize: size, weight: weight)
}

func monoFont(size: CGFloat, weight: NSFont.Weight) -> NSFont {
    NSFont.monospacedSystemFont(ofSize: size, weight: weight)
}

func drawText(
    _ text: String,
    in rect: CGRect,
    size: CGFloat,
    weight: NSFont.Weight,
    color: NSColor,
    alignment: NSTextAlignment = .left,
    lineHeight: CGFloat? = nil,
    tracking: CGFloat = 0,
    monospaced: Bool = false
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.minimumLineHeight = lineHeight ?? size * 1.12
    paragraph.maximumLineHeight = lineHeight ?? size * 1.12
    let attributes: [NSAttributedString.Key: Any] = [
        .font: monospaced ? monoFont(size: size, weight: weight) : font(size: size, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: paragraph,
        .kern: tracking,
    ]
    NSAttributedString(string: text, attributes: attributes)
        .draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading])
}

func fillRect(_ rect: CGRect, color: NSColor) {
    color.setFill()
    NSBezierPath(rect: rect).fill()
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

func drawBrandMark(
    in rect: CGRect,
    ringColor: NSColor,
    oneColor: NSColor,
    accentColor: NSColor,
    opacity: CGFloat = 1
) {
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current?.cgContext.setAlpha(opacity)

    let lineScale = rect.width / 128
    let ringRect = CGRect(
        x: rect.minX + 19 * lineScale,
        y: rect.minY + 19 * lineScale,
        width: 90 * lineScale,
        height: 90 * lineScale
    )
    ringColor.setStroke()
    let ring = NSBezierPath(ovalIn: ringRect)
    ring.lineWidth = 14 * lineScale
    ring.stroke()

    oneColor.setStroke()
    let one = NSBezierPath()
    one.move(to: CGPoint(x: rect.minX + 48 * lineScale, y: rect.minY + 49 * lineScale))
    one.line(to: CGPoint(x: rect.minX + 64 * lineScale, y: rect.minY + 36 * lineScale))
    one.line(to: CGPoint(x: rect.minX + 64 * lineScale, y: rect.minY + 91 * lineScale))
    one.lineWidth = 13 * lineScale
    one.lineCapStyle = .round
    one.lineJoinStyle = .round
    one.stroke()

    accentColor.setStroke()
    let base = NSBezierPath()
    base.move(to: CGPoint(x: rect.minX + 48 * lineScale, y: rect.minY + 94 * lineScale))
    base.line(to: CGPoint(x: rect.minX + 80 * lineScale, y: rect.minY + 94 * lineScale))
    base.lineWidth = 8 * lineScale
    base.lineCapStyle = .round
    base.stroke()

    let extraRep = NSBezierPath()
    extraRep.move(to: CGPoint(x: rect.minX + 90 * lineScale, y: rect.minY + 27 * lineScale))
    extraRep.curve(
        to: CGPoint(x: rect.minX + 100 * lineScale, y: rect.minY + 40 * lineScale),
        controlPoint1: CGPoint(x: rect.minX + 94 * lineScale, y: rect.minY + 30 * lineScale),
        controlPoint2: CGPoint(x: rect.minX + 98 * lineScale, y: rect.minY + 35 * lineScale)
    )
    extraRep.lineWidth = 14 * lineScale
    extraRep.lineCapStyle = .round
    extraRep.stroke()

    NSGraphicsContext.restoreGraphicsState()
}

func drawWatermark(opacity: CGFloat) {
    let pill = CGRect(x: 70, y: 62, width: 390, height: 78)
    fillRoundedRect(pill, radius: 39, color: NSColor.black.withAlphaComponent(0.26 * opacity))
    strokeRoundedRect(pill, radius: 39, color: NSColor.white.withAlphaComponent(0.14 * opacity), width: 1)
    drawBrandMark(
        in: CGRect(x: 84, y: 69, width: 64, height: 64),
        ringColor: Palette.white,
        oneColor: Palette.white,
        accentColor: Palette.gold,
        opacity: 0.92 * opacity
    )
    drawText(
        "ONE MORE REP",
        in: CGRect(x: 154, y: 86, width: 275, height: 34),
        size: 22,
        weight: .bold,
        color: Palette.white.withAlphaComponent(0.92 * opacity),
        tracking: 2.5,
        monospaced: true
    )
}

func drawPhotoBackground(
    _ image: NSImage,
    progress: CGFloat,
    darkness: CGFloat,
    panX: CGFloat = 0,
    panY: CGFloat = 0
) {
    fillRect(CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight), color: Palette.charcoal)
    let zoom = 1.03 + 0.055 * smoothstep(progress)
    let width = CGFloat(canvasWidth) * zoom
    let height = CGFloat(canvasHeight) * zoom
    let rect = CGRect(
        x: (CGFloat(canvasWidth) - width) / 2 + panX * progress,
        y: (CGFloat(canvasHeight) - height) / 2 + panY * progress,
        width: width,
        height: height
    )
    image.draw(
        in: rect,
        from: CGRect(origin: .zero, size: image.size),
        operation: .sourceOver,
        fraction: 1,
        respectFlipped: true,
        hints: [.interpolation: NSImageInterpolation.high]
    )

    fillRect(
        CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight),
        color: NSColor.black.withAlphaComponent(darkness)
    )

    let topShade = NSGradient(colors: [NSColor.black.withAlphaComponent(0.64), .clear])!
    topShade.draw(in: CGRect(x: 0, y: 0, width: canvasWidth, height: 650), angle: -90)
    let bottomShade = NSGradient(colors: [.clear, NSColor.black.withAlphaComponent(0.88)])!
    bottomShade.draw(in: CGRect(x: 0, y: 900, width: canvasWidth, height: 1020), angle: -90)
}

func drawTransitionVeil(opacity: CGFloat) {
    fillRect(
        CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight),
        color: Palette.charcoal.withAlphaComponent(1 - opacity)
    )
}

func drawPhotoScene(
    image: NSImage,
    headline: String,
    subheading: String,
    localTime: Double,
    sceneDuration: Double,
    textY: CGFloat,
    darkness: CGFloat = 0.12,
    panX: CGFloat = 0,
    panY: CGFloat = -14
) {
    let opacity = sceneOpacity(localTime: localTime, sceneDuration: sceneDuration)
    let progress = CGFloat(localTime / sceneDuration).clamped(to: 0...1)
    drawPhotoBackground(image, progress: progress, darkness: darkness, panX: panX, panY: panY)
    drawTransitionVeil(opacity: opacity)

    let entrance = smoothstep(CGFloat(localTime / 0.65))
    let rise = 34 * (1 - entrance)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current?.cgContext.setAlpha(opacity)
    drawWatermark(opacity: 1)
    fillRoundedRect(CGRect(x: 72, y: textY - 36 + rise, width: 112, height: 8), radius: 4, color: Palette.gold)
    drawText(
        headline,
        in: CGRect(x: 70, y: textY + rise, width: 940, height: 270),
        size: 82,
        weight: .heavy,
        color: Palette.white,
        lineHeight: 86,
        tracking: -1.5
    )
    drawText(
        subheading,
        in: CGRect(x: 74, y: textY + 250 + rise, width: 890, height: 120),
        size: 31,
        weight: .medium,
        color: Palette.white.withAlphaComponent(0.78),
        lineHeight: 40
    )
    NSGraphicsContext.restoreGraphicsState()
}

func drawScreenshot(
    _ image: NSImage,
    crop: CGRect?,
    localProgress: CGFloat,
    opacity: CGFloat,
    y: CGFloat = 405
) {
    let eased = smoothstep(localProgress)
    let width: CGFloat = 904 + 18 * eased
    let sourceRect = crop ?? CGRect(origin: .zero, size: image.size)
    let height = width / (sourceRect.width / sourceRect.height)
    let x = (CGFloat(canvasWidth) - width) / 2
    let cardRect = CGRect(x: x, y: y + 24 * (1 - eased), width: width, height: height)

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.42 * opacity)
    shadow.shadowBlurRadius = 48
    shadow.shadowOffset = NSSize(width: 0, height: -14)
    shadow.set()
    fillRoundedRect(cardRect, radius: 34, color: Palette.white.withAlphaComponent(opacity))
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: cardRect, xRadius: 34, yRadius: 34).addClip()
    image.draw(
        in: cardRect,
        from: sourceRect,
        operation: .sourceOver,
        fraction: opacity,
        respectFlipped: true,
        hints: [.interpolation: NSImageInterpolation.high]
    )
    NSGraphicsContext.restoreGraphicsState()

    strokeRoundedRect(cardRect, radius: 34, color: NSColor.white.withAlphaComponent(0.34 * opacity), width: 2)
}

func drawProductScene(
    photo: NSImage,
    screenshot: NSImage,
    crop: CGRect? = nil,
    eyebrow: String,
    heading: String,
    localTime: Double,
    sceneDuration: Double,
    screenshotY: CGFloat = 405
) {
    let opacity = sceneOpacity(localTime: localTime, sceneDuration: sceneDuration)
    let progress = CGFloat(localTime / sceneDuration).clamped(to: 0...1)
    drawPhotoBackground(photo, progress: progress, darkness: 0.48, panY: -10)
    drawTransitionVeil(opacity: opacity)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current?.cgContext.setAlpha(opacity)
    drawWatermark(opacity: 1)
    drawText(
        eyebrow.uppercased(),
        in: CGRect(x: 72, y: 174, width: 900, height: 40),
        size: 22,
        weight: .bold,
        color: Palette.gold,
        tracking: 3.2,
        monospaced: true
    )
    drawText(
        heading,
        in: CGRect(x: 70, y: 218, width: 930, height: 120),
        size: 57,
        weight: .bold,
        color: Palette.white,
        lineHeight: 62,
        tracking: -0.8
    )
    NSGraphicsContext.restoreGraphicsState()

    drawScreenshot(
        screenshot,
        crop: crop,
        localProgress: progress,
        opacity: opacity,
        y: screenshotY
    )
}

func drawOutro(image: NSImage, localTime: Double, sceneDuration: Double) {
    let opacity = sceneOpacity(localTime: localTime, sceneDuration: sceneDuration, fade: 0.35)
    let progress = CGFloat(localTime / sceneDuration).clamped(to: 0...1)
    let entrance = smoothstep(CGFloat(localTime / 0.8))
    drawPhotoBackground(image, progress: progress, darkness: 0.45, panX: -12, panY: -18)
    drawTransitionVeil(opacity: opacity)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current?.cgContext.setAlpha(opacity)
    drawBrandMark(
        in: CGRect(x: 400, y: 410 + 28 * (1 - entrance), width: 280, height: 280),
        ringColor: Palette.white,
        oneColor: Palette.white,
        accentColor: Palette.gold
    )
    drawText(
        "ONE MORE REP",
        in: CGRect(x: 70, y: 730, width: 940, height: 100),
        size: 54,
        weight: .bold,
        color: Palette.white,
        alignment: .center,
        tracking: 5.5,
        monospaced: true
    )
    drawText(
        "YOUR NEXT REP\nSTARTS HERE.",
        in: CGRect(x: 70, y: 895, width: 940, height: 240),
        size: 72,
        weight: .heavy,
        color: Palette.white,
        alignment: .center,
        lineHeight: 78,
        tracking: -1
    )
    fillRoundedRect(CGRect(x: 162, y: 1240, width: 756, height: 118), radius: 38, color: Palette.parchment)
    drawText(
        "getstronger.studio",
        in: CGRect(x: 162, y: 1271, width: 756, height: 60),
        size: 35,
        weight: .bold,
        color: Palette.charcoal,
        alignment: .center,
        tracking: 0.6
    )
    drawText(
        "Train. Track. Repeat.",
        in: CGRect(x: 80, y: 1425, width: 920, height: 60),
        size: 29,
        weight: .semibold,
        color: Palette.white.withAlphaComponent(0.72),
        alignment: .center
    )
    NSGraphicsContext.restoreGraphicsState()
}

func loadImage(_ url: URL) -> NSImage {
    guard let image = NSImage(contentsOf: url) else {
        fputs("Missing promo source: \(url.path)\n", stderr)
        exit(1)
    }
    return image
}

let homeImage = loadImage(homeImageURL)
let workoutImage = loadImage(workoutImageURL)
let notificationsImage = loadImage(notificationsImageURL)
let progressImage = loadImage(progressImageURL)
let squatImage = loadImage(squatImageURL)
let deadliftImage = loadImage(deadliftImageURL)
let communityImage = loadImage(communityImageURL)

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
    case 0..<2.4:
        drawPhotoScene(
            image: squatImage,
            headline: "BUILD THE HABIT.\nBEAT YOUR LAST.",
            subheading: "Strength is built one honest rep at a time.",
            localTime: time,
            sceneDuration: 2.4,
            textY: 1240,
            darkness: 0.08
        )
    case 2.4..<5.2:
        drawProductScene(
            photo: squatImage,
            screenshot: homeImage,
            eyebrow: "Your training, clearly",
            heading: "Know what’s next.",
            localTime: time - 2.4,
            sceneDuration: 2.8
        )
    case 5.2..<7.5:
        drawPhotoScene(
            image: deadliftImage,
            headline: "LOG THE WORK.",
            subheading: "Every set. Every session. Every new best.",
            localTime: time - 5.2,
            sceneDuration: 2.3,
            textY: 250,
            darkness: 0.08,
            panX: 12
        )
    case 7.5..<10.3:
        drawProductScene(
            photo: deadliftImage,
            screenshot: workoutImage,
            eyebrow: "Nothing gets lost",
            heading: "Track every detail.",
            localTime: time - 7.5,
            sceneDuration: 2.8
        )
    case 10.3..<12.7:
        drawPhotoScene(
            image: communityImage,
            headline: "BETTER\nTOGETHER.",
            subheading: "Share the work. Celebrate the progress.",
            localTime: time - 10.3,
            sceneDuration: 2.4,
            textY: 1270,
            darkness: 0.14,
            panX: -10
        )
    case 12.7..<15.3:
        drawProductScene(
            photo: communityImage,
            screenshot: notificationsImage,
            eyebrow: "Community without noise",
            heading: "The updates that matter.",
            localTime: time - 12.7,
            sceneDuration: 2.6
        )
    case 15.3..<18.1:
        let progressCrop = CGRect(x: 930, y: 0, width: 1500, height: 2088)
        drawProductScene(
            photo: squatImage,
            screenshot: progressImage,
            crop: progressCrop,
            eyebrow: "Proof you’re progressing",
            heading: "See the work add up.",
            localTime: time - 15.3,
            sceneDuration: 2.8,
            screenshotY: 382
        )
    default:
        drawOutro(image: deadliftImage, localTime: time - 18.1, sceneDuration: 2.9)
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
render(at: 1.2, into: coverBuffer)
try CIContext().writePNGRepresentation(
    of: CIImage(cvPixelBuffer: coverBuffer),
    to: coverURL,
    format: .RGBA8,
    colorSpace: CGColorSpaceCreateDeviceRGB()
)

print(videoURL.path)
print(coverURL.path)
