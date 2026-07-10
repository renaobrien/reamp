// swift-tools-version:5.9
// Capture sidecar — macOS 13+ only. Built with SPM; managed by the
// Electron main process (spawn, restart, kill on quit).
import PackageDescription

let package = Package(
    name: "capture-sidecar",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "CaptureSidecar",
            path: "Sources/CaptureSidecar"
        )
    ]
)
