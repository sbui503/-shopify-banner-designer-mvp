import AppKit
import Foundation
import Vision

struct TextHit: Encodable {
  let text: String
  let confidence: Float
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct ImageResult: Encodable {
  let path: String
  let ok: Bool
  let error: String?
  let playerCount: Int
  let texts: [TextHit]
}

func countPlayerOccurrences(_ value: String) -> Int {
  let lower = value.lowercased()
  var count = 0
  let patterns = [
    #"player"#,
    #"p1ayer"#,
    #"piayer"#
  ]

  for pattern in patterns {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
      continue
    }
    let range = NSRange(lower.startIndex..<lower.endIndex, in: lower)
    count += regex.numberOfMatches(in: lower, options: [], range: range)
  }

  return count
}

func runOCR(path: String) -> ImageResult {
  let url = URL(fileURLWithPath: path)
  guard FileManager.default.fileExists(atPath: path) else {
    return ImageResult(path: path, ok: false, error: "file-not-found", playerCount: 0, texts: [])
  }

  var hits: [TextHit] = []
  let request = VNRecognizeTextRequest { request, error in
    if error != nil {
      return
    }
    let observations = request.results as? [VNRecognizedTextObservation] ?? []
    for observation in observations {
      guard let candidate = observation.topCandidates(1).first else {
        continue
      }
      let box = observation.boundingBox
      hits.append(TextHit(
        text: candidate.string,
        confidence: candidate.confidence,
        x: box.origin.x,
        y: box.origin.y,
        width: box.size.width,
        height: box.size.height
      ))
    }
  }

  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  request.recognitionLanguages = ["en-US"]
  request.minimumTextHeight = 0.012

  do {
    let handler = VNImageRequestHandler(url: url, options: [:])
    try handler.perform([request])
  } catch {
    return ImageResult(path: path, ok: false, error: String(describing: error), playerCount: 0, texts: [])
  }

  let count = hits.reduce(0) { total, hit in
    total + countPlayerOccurrences(hit.text)
  }

  return ImageResult(path: path, ok: true, error: nil, playerCount: count, texts: hits)
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]

for path in CommandLine.arguments.dropFirst() {
  let result = runOCR(path: path)
  if let data = try? encoder.encode(result), let line = String(data: data, encoding: .utf8) {
    print(line)
  }
}
