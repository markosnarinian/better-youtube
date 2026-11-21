import AVFoundation
import CoreVideo
import Foundation

// A local, silent eight-second H.264 clip for real media playback tests.
let url = URL(fileURLWithPath: "tests/media.mp4")
try? FileManager.default.removeItem(at: url)
let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: 320,
    AVVideoHeightKey: 180
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: 320,
    kCVPixelBufferHeightKey as String: 180
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
for frame in 0..<80 {
    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.01) }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
    let pixel = buffer!
    CVPixelBufferLockBaseAddress(pixel, [])
    let data = CVPixelBufferGetBaseAddress(pixel)!.assumingMemoryBound(to: UInt8.self)
    for y in 0..<180 {
        for x in 0..<320 {
            let offset = y * CVPixelBufferGetBytesPerRow(pixel) + x * 4
            data[offset] = 255
            data[offset + 1] = 35
            data[offset + 2] = UInt8(60 + frame)
            data[offset + 3] = 60
        }
    }
    CVPixelBufferUnlockBaseAddress(pixel, [])
    guard adaptor.append(pixel, withPresentationTime: CMTime(value: Int64(frame), timescale: 10)) else {
        fatalError("Could not append frame: \(String(describing: writer.error))")
    }
}
input.markAsFinished()
await writer.finishWriting()
guard writer.status == .completed else { fatalError("\(String(describing: writer.error))") }
print("Created \(url.path)")
