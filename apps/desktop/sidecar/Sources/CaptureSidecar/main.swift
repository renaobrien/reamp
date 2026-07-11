// Reamp capture sidecar (Milestone 1).
//
// Captures system audio output with ScreenCaptureKit (SCStream audio,
// macOS 13+) and streams it to the Electron main process over stdout in
// the Reamp wire protocol: one JSON header line, then raw f32le mono PCM.
// The parser on the Node side (src/main/sidecar/pcm-stream.ts) is already
// tested against this exact format via the mock sidecar.
//
// Hard rules (spec section 1):
//   - PCM goes straight to stdout into the parent's ring buffer. It is
//     NEVER written to disk and never leaves the process pair.
//   - Analysis-only: no recording, no export, ever.
//
// STATUS: DRAFT, written off-device. It follows the documented SCK audio
// capture flow; compile and verify on a Mac (swift build inside sidecar/,
// or let the app spawn it via REAMP_SIDECAR_BIN). The one-time Screen
// Recording permission prompt appears on first capture.

import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

let SAMPLE_RATE = 48_000
let stdoutHandle = FileHandle.standardOutput
let stderrHandle = FileHandle.standardError

func log(_ message: String) {
    stderrHandle.write(Data(("capture-sidecar: " + message + "\n").utf8))
}

func writeHeader(sampleRate: Int) {
    let header = "{\"sampleRate\":\(sampleRate),\"channels\":1,\"format\":\"f32le\"}\n"
    stdoutHandle.write(Data(header.utf8))
}

final class AudioOutput: NSObject, SCStreamOutput, SCStreamDelegate {
    private var headerWritten = false

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio, sampleBuffer.isValid else { return }
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)?.pointee
        else { return }

        if !headerWritten {
            headerWritten = true
            writeHeader(sampleRate: Int(asbd.mSampleRate))
        }

        // Pull the PCM out of the sample buffer.
        var blockBuffer: CMBlockBuffer?
        let listSize = MemoryLayout<AudioBufferList>.size + Int(asbd.mChannelsPerFrame) * MemoryLayout<AudioBuffer>.size
        let ablPointer = UnsafeMutableRawPointer.allocate(byteCount: listSize, alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { ablPointer.deallocate() }
        let abl = ablPointer.assumingMemoryBound(to: AudioBufferList.self)

        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: abl,
            bufferListSize: listSize,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            blockBufferOut: &blockBuffer
        )
        guard status == noErr else { return }

        let buffers = UnsafeMutableAudioBufferListPointer(abl)
        let frameCount = Int(CMSampleBufferGetNumSamples(sampleBuffer))
        guard frameCount > 0, buffers.count > 0 else { return }

        var mono = [Float](repeating: 0, count: frameCount)
        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        guard isFloat else {
            log("unexpected non-float PCM from SCK; dropping buffer")
            return
        }

        if buffers.count == 1, asbd.mChannelsPerFrame > 1,
           (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) == 0 {
            // interleaved stereo (or more): average the channels
            let channels = Int(asbd.mChannelsPerFrame)
            guard let data = buffers[0].mData?.assumingMemoryBound(to: Float.self) else { return }
            for frame in 0..<frameCount {
                var sum: Float = 0
                for ch in 0..<channels { sum += data[frame * channels + ch] }
                mono[frame] = sum / Float(channels)
            }
        } else {
            // planar: one buffer per channel, average them
            let channelCount = buffers.count
            for buffer in buffers {
                guard let data = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
                let samples = min(frameCount, Int(buffer.mDataByteSize) / MemoryLayout<Float>.size)
                for frame in 0..<samples { mono[frame] += data[frame] }
            }
            if channelCount > 1 {
                for frame in 0..<frameCount { mono[frame] /= Float(channelCount) }
            }
        }

        mono.withUnsafeBufferPointer { ptr in
            stdoutHandle.write(Data(buffer: ptr))
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        log("stream stopped: \(error.localizedDescription)")
        exit(1)
    }
}

func run() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let display = content.displays.first else {
        log("no display available for the content filter")
        exit(1)
    }

    // Audio capture requires a content filter; capture the whole display
    // and throw the (tiny) video away.
    let filter = SCContentFilter(display: display, excludingWindows: [])
    let configuration = SCStreamConfiguration()
    configuration.capturesAudio = true
    configuration.excludesCurrentProcessAudio = true
    configuration.sampleRate = SAMPLE_RATE
    configuration.channelCount = 1
    configuration.width = 2
    configuration.height = 2
    configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)

    let output = AudioOutput()
    let stream = SCStream(filter: filter, configuration: configuration, delegate: output)
    try stream.addStreamOutput(output, type: .audio, sampleHandlerQueue: DispatchQueue(label: "reamp.audio"))
    try await stream.startCapture()
    log("capturing system audio at \(SAMPLE_RATE)Hz mono")
}

Task {
    do {
        try await run()
    } catch {
        log("failed to start capture: \(error.localizedDescription)")
        exit(1)
    }
}

dispatchMain()
