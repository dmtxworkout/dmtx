import AVFoundation
import ExpoModulesCore

public class HlsDownloadsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HlsDownloads")

    Events("onProgress", "onComplete", "onError")

    Constants([
      "homeDirectory": NSHomeDirectory()
    ])

    OnCreate {
      HlsDownloadEngine.shared.emit = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    AsyncFunction("start") { (id: String, url: String, maxHeight: Int, title: String) in
      try HlsDownloadEngine.shared.start(id: id, url: url, maxHeight: maxHeight, title: title)
    }.runOnQueue(.main)

    AsyncFunction("cancel") { (id: String) in
      HlsDownloadEngine.shared.cancel(id: id)
    }.runOnQueue(.main)

    AsyncFunction("remove") { (location: String) in
      try HlsDownloadEngine.shared.remove(location: location)
    }

    AsyncFunction("restore") { (promise: Promise) in
      HlsDownloadEngine.shared.restore { ids in promise.resolve(ids) }
    }.runOnQueue(.main)
  }
}

/// Hands the background session's completion handler to the engine, so a
/// download that finishes while the app is suspended is reported properly.
public class HlsDownloadsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    guard identifier == HlsDownloadEngine.sessionIdentifier else {
      completionHandler()
      return
    }
    HlsDownloadEngine.shared.backgroundCompletion = completionHandler
  }
}

/// One background `AVAssetDownloadURLSession` for the app. Tasks carry the
/// download id in `taskDescription`, so they can be matched again after a
/// relaunch; the package location iOS picks is kept in UserDefaults until the
/// download completes (the delegate only tells us once).
final class HlsDownloadEngine: NSObject, AVAssetDownloadDelegate {
  static let shared = HlsDownloadEngine()
  static let sessionIdentifier = "com.dmtx.app.hls-downloads"
  private static let locationsKey = "hls-downloads.locations"

  var emit: ((String, [String: Any]) -> Void)?
  var backgroundCompletion: (() -> Void)?

  private var tasks: [String: AVAssetDownloadTask] = [:]
  private lazy var session: AVAssetDownloadURLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
    config.isDiscretionary = false
    config.sessionSendsLaunchEvents = true
    return AVAssetDownloadURLSession(configuration: config, assetDownloadDelegate: self, delegateQueue: .main)
  }()

  private var home: String { NSHomeDirectory() }

  // MARK: locations (id → path relative to the sandbox)

  private var locations: [String: String] {
    get { (UserDefaults.standard.dictionary(forKey: Self.locationsKey) as? [String: String]) ?? [:] }
    set { UserDefaults.standard.set(newValue, forKey: Self.locationsKey) }
  }

  /// The package path relative to the sandbox. The path iOS reports can carry
  /// a `/.nofollow` or `/private` prefix in front of the sandbox, so the
  /// sandbox is looked for anywhere in it; if it is not there, the absolute
  /// path is kept (and `absolute` passes it through).
  private func relative(_ url: URL) -> String {
    let path = url.path
    let marker = home + "/"
    if let range = path.range(of: marker) {
      return String(path[range.upperBound...])
    }
    return path
  }

  private func absolute(_ location: String) -> URL {
    location.hasPrefix("/") ? URL(fileURLWithPath: location) : URL(fileURLWithPath: home).appendingPathComponent(location)
  }

  // MARK: API

  func start(id: String, url: String, maxHeight: Int, title: String) throws {
    guard let remote = URL(string: url) else {
      throw HlsDownloadException("URL inválida")
    }
    if let running = tasks[id], running.state == .running || running.state == .suspended {
      return
    }
    let asset = AVURLAsset(url: remote)
    let configuration = AVAssetDownloadConfiguration(asset: asset, title: title)
    // The best variant that fits: the predicate keeps every rendition at or
    // under the height and iOS picks the highest of those.
    let fits = AVAssetVariantQualifier.predicate(forPresentationHeight: CGFloat(maxHeight), operatorType: .lessThanOrEqualTo)
    configuration.primaryContentConfiguration.variantQualifiers = [AVAssetVariantQualifier(predicate: fits)]
    let task = session.makeAssetDownloadTask(downloadConfiguration: configuration)
    task.taskDescription = id
    tasks[id] = task
    task.resume()
  }

  func cancel(id: String) {
    guard let task = tasks[id] else {
      // Nothing running, but a half-written package may remain from an earlier run.
      if let location = locations[id] {
        try? FileManager.default.removeItem(at: absolute(location))
        forgetLocation(id)
      }
      return
    }
    task.cancel()
  }

  func remove(location: String) throws {
    let url = absolute(location)
    if FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.removeItem(at: url)
    }
  }

  /// Re-attach to the tasks the background session kept alive while the app was gone.
  func restore(_ done: @escaping ([String]) -> Void) {
    session.getAllTasks { all in
      DispatchQueue.main.async {
        var ids: [String] = []
        for task in all {
          guard let download = task as? AVAssetDownloadTask, let id = download.taskDescription else { continue }
          if download.state == .running || download.state == .suspended {
            self.tasks[id] = download
            ids.append(id)
          }
        }
        done(ids)
      }
    }
  }

  private func forgetLocation(_ id: String) {
    var all = locations
    all.removeValue(forKey: id)
    locations = all
  }

  private func packageSize(_ url: URL) -> Int {
    guard let files = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.totalFileAllocatedSizeKey, .fileSizeKey]) else {
      return 0
    }
    var total = 0
    for case let file as URL in files {
      let values = try? file.resourceValues(forKeys: [.totalFileAllocatedSizeKey, .fileSizeKey])
      total += values?.totalFileAllocatedSize ?? values?.fileSize ?? 0
    }
    return total
  }

  // MARK: AVAssetDownloadDelegate

  func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, willDownloadTo location: URL) {
    guard let id = assetDownloadTask.taskDescription else { return }
    var all = locations
    all[id] = relative(location)
    locations = all
  }

  func urlSession(
    _ session: URLSession,
    assetDownloadTask: AVAssetDownloadTask,
    didLoad timeRange: CMTimeRange,
    totalTimeRangesLoaded loadedTimeRanges: [NSValue],
    timeRangeExpectedToLoad: CMTimeRange
  ) {
    guard let id = assetDownloadTask.taskDescription else { return }
    let expected = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
    guard expected > 0 else { return }
    let loaded = loadedTimeRanges.reduce(0.0) { $0 + CMTimeGetSeconds($1.timeRangeValue.duration) }
    let bytes = locations[id].map { packageSize(absolute($0)) } ?? 0
    emit?("onProgress", ["id": id, "fraction": min(1, loaded / expected), "bytes": bytes])
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let id = task.taskDescription else { return }
    tasks.removeValue(forKey: id)
    let location = locations[id]
    forgetLocation(id)
    if let error = error as NSError? {
      // A cancel (ours) or a failure: either way the partial package goes.
      if let location {
        try? FileManager.default.removeItem(at: absolute(location))
      }
      if !(error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) {
        emit?("onError", ["id": id, "message": error.localizedDescription])
      }
      return
    }
    guard let location else {
      emit?("onError", ["id": id, "message": "iOS no indicó dónde guardó el video"])
      return
    }
    emit?("onComplete", ["id": id, "location": location, "bytes": packageSize(absolute(location))])
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    backgroundCompletion?()
    backgroundCompletion = nil
  }
}

final class HlsDownloadException: GenericException<String> {
  override var reason: String { param }
}
