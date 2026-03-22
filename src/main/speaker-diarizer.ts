// Neural speaker diarization using sherpa-onnx
//
// Uses SpeakerEmbeddingExtractor (3dspeaker ERes2Net, English VoxCeleb-trained) to compute
// 512-dim voice fingerprints and cosine similarity matching against per-speaker centroids.
//
// Audio path: renderer sends Int16 PCM at 24kHz via IPC → downsample to 16kHz → Float32
// → extractor → cosine similarity search → unified spk-N slot assignment
//
// Model download: ~38MB ONNX file from GitHub releases, stored in userData/models/

import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'

const MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'
const MODEL_FILENAME = '3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'
const MAX_SPEAKERS = 30
// Cosine similarity threshold for English VoxCeleb-trained ERes2Net
// Same-speaker scores ~0.96-0.98, different-speaker ~0.74-0.82
const SIMILARITY_THRESHOLD = 0.50
// Minimum audio samples needed for a reliable embedding (16kHz × 0.5s = 8000 samples)
const MIN_SAMPLES_FOR_EMBEDDING = 8000
// Centroid update weights: blend old centroid with new embedding
const CENTROID_OLD_WEIGHT = 0.7
const CENTROID_NEW_WEIGHT = 0.3

// Global diarization state — unified spk-N slots across both channels
// Uses manual cosine similarity over centroid embeddings
interface DiarizationState {
  globalSlotCounter: number
  centroids: Map<string, Float32Array>
}

// Opaque handle types (sherpa-onnx uses JS objects backed by native pointers)
interface SpeakerEmbeddingExtractorHandle { dim: number }
interface OnlineStreamHandle {}

interface SherpaOnnxModule {
  SpeakerEmbeddingExtractor: new (config: { model: string; numThreads: number; debug: boolean }) => SpeakerEmbeddingExtractorHandle & {
    createStream(): OnlineStreamHandle & {
      acceptWaveform(waveform: { sampleRate: number; samples: Float32Array }): void
    }
    compute(stream: OnlineStreamHandle): Float32Array
    dim: number
  }
}

let sherpaModule: SherpaOnnxModule | null = null
let extractor: InstanceType<SherpaOnnxModule['SpeakerEmbeddingExtractor']> | null = null

// Single unified state — both mic and sys channels share the same speaker pool
const diarizationState: DiarizationState = {
  globalSlotCounter: 0,
  centroids: new Map()
}

function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

function getModelPath(): string {
  return path.join(getModelsDir(), MODEL_FILENAME)
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const file = fs.createWriteStream(dest)
    const doRequest = (u: string) => {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // Follow redirect
          doRequest(res.headers.location!)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading model`))
          return
        }
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', err => { fs.unlink(dest, () => {}); reject(err) })
      }).on('error', reject)
    }
    doRequest(url)
  })
}

async function ensureModelDownloaded(): Promise<string> {
  const modelPath = getModelPath()
  if (fs.existsSync(modelPath)) return modelPath
  console.log('[SpeakerDiarizer] Downloading embedding model (~15MB)...')
  await downloadFile(MODEL_URL, modelPath)
  console.log('[SpeakerDiarizer] Model downloaded to', modelPath)
  return modelPath
}

async function initExtractor(): Promise<void> {
  if (extractor) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sherpaModule = require('sherpa-onnx-node') as SherpaOnnxModule
    const modelPath = await ensureModelDownloaded()
    extractor = new sherpaModule.SpeakerEmbeddingExtractor({
      model: modelPath,
      numThreads: 1,
      debug: false
    })
    console.log('[SpeakerDiarizer] Extractor ready, embedding dim:', extractor.dim)
  } catch (err) {
    console.error('[SpeakerDiarizer] Failed to init extractor:', err)
    extractor = null
  }
}

// Cosine similarity between two Float32Array embeddings
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// L2-normalize a Float32Array in-place and return it
function l2Normalize(v: Float32Array): Float32Array {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) v[i] /= norm
  }
  return v
}

// Update a centroid with a new embedding using weighted average, then L2-normalize
function updateCentroid(oldCentroid: Float32Array, newEmbedding: Float32Array): Float32Array {
  const result = new Float32Array(oldCentroid.length)
  for (let i = 0; i < result.length; i++) {
    result[i] = CENTROID_OLD_WEIGHT * oldCentroid[i] + CENTROID_NEW_WEIGHT * newEmbedding[i]
  }
  return l2Normalize(result)
}

// Search all centroids for the best match above threshold
function searchCentroids(
  centroids: Map<string, Float32Array>,
  embedding: Float32Array,
  threshold: number
): { slot: string; similarity: number } | null {
  let bestSlot: string | null = null
  let bestSim = -1
  for (const [slot, centroid] of centroids) {
    const sim = cosineSimilarity(centroid, embedding)
    if (sim > bestSim) {
      bestSim = sim
      bestSlot = slot
    }
  }
  if (bestSlot !== null && bestSim >= threshold) {
    return { slot: bestSlot, similarity: bestSim }
  }
  return null
}

// Downsample Int16 24kHz PCM → Float32 16kHz
// Ratio: keep 2 out of every 3 samples (24000 * 2/3 = 16000)
// Accepts ArrayBuffer or Node.js Buffer (IPC delivers Buffers)
function downsampleToFloat32(int16Buffer: ArrayBuffer | Buffer): Float32Array {
  // Node.js Buffer has byteOffset — must use its own ArrayBuffer slice
  const ab = int16Buffer instanceof Buffer
    ? int16Buffer.buffer.slice(int16Buffer.byteOffset, int16Buffer.byteOffset + int16Buffer.byteLength)
    : int16Buffer
  const int16 = new Int16Array(ab)
  const outputLen = Math.floor(int16.length * 2 / 3)
  const float32 = new Float32Array(outputLen)
  let outIdx = 0
  for (let i = 0; i < int16.length - 2; i += 3) {
    // Keep samples at positions i and i+1, skip i+2
    float32[outIdx++] = int16[i] / 32768.0
    if (outIdx < outputLen) {
      float32[outIdx++] = int16[i + 1] / 32768.0
    }
  }
  return float32.subarray(0, outIdx)
}

// Merge multiple Float32 arrays into one
function mergeFloat32Arrays(arrays: Float32Array[]): Float32Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const result = new Float32Array(total)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

export async function identifySpeaker(
  audioBuffers: Array<ArrayBuffer | Buffer>,
  channel: 'mic' | 'sys'
): Promise<string> {
  // Fallback: if diarizer not ready, return spk-1
  if (!extractor || !sherpaModule) {
    return 'spk-1'
  }

  try {
    // Convert and merge all audio buffers for this segment
    const float32Arrays = audioBuffers.map(b => downsampleToFloat32(b))
    const merged = mergeFloat32Arrays(float32Arrays)

    console.log(`[SpeakerDiarizer] ${channel}: buffers=${audioBuffers.length} samples=${merged.length} minRequired=${MIN_SAMPLES_FOR_EMBEDDING} hasExtractor=${!!extractor}`)

    // Need enough audio for a reliable embedding
    if (merged.length < MIN_SAMPLES_FOR_EMBEDDING) {
      // Not enough audio — use last known slot or spk-1
      const numSlots = diarizationState.globalSlotCounter
      const fallback = numSlots > 0 ? `spk-${numSlots}` : 'spk-1'
      console.log(`[SpeakerDiarizer] ${channel}: FALLBACK (insufficient audio) → ${fallback}`)
      return fallback
    }

    // Extract embedding
    const stream = extractor.createStream()
    stream.acceptWaveform({ sampleRate: 16000, samples: merged })
    const embedding = extractor.compute(stream)
    console.log(`[SpeakerDiarizer] ${channel}: embedding extracted, dim=${embedding.length}, knownSpeakers=${diarizationState.centroids.size}`)

    // Search against all known speaker centroids
    const match = searchCentroids(diarizationState.centroids, embedding, SIMILARITY_THRESHOLD)
    console.log(`[SpeakerDiarizer] ${channel}: search result="${match?.slot ?? ''}" similarity=${match?.similarity?.toFixed(4) ?? 'none'} threshold=${SIMILARITY_THRESHOLD}`)

    if (match) {
      // Known speaker — update centroid with new embedding for continuous learning
      const oldCentroid = diarizationState.centroids.get(match.slot)!
      diarizationState.centroids.set(match.slot, updateCentroid(oldCentroid, embedding))
      console.log(`[SpeakerDiarizer] ${channel}: updated centroid for ${match.slot}`)
      return match.slot
    }

    // New speaker — create a new slot if under limit
    if (diarizationState.globalSlotCounter >= MAX_SPEAKERS) {
      return `spk-${MAX_SPEAKERS}`
    }

    diarizationState.globalSlotCounter++
    const newSlot = `spk-${diarizationState.globalSlotCounter}`
    // Store L2-normalized embedding as initial centroid
    diarizationState.centroids.set(newSlot, l2Normalize(new Float32Array(embedding)))
    console.log(`[SpeakerDiarizer] New speaker: ${newSlot} (${channel} channel)`)
    return newSlot

  } catch (err) {
    console.error('[SpeakerDiarizer] Error identifying speaker:', err)
    return 'spk-1'
  }
}

export function resetDiarizerSession(): void {
  // Clear all speaker state for a new call
  diarizationState.globalSlotCounter = 0
  diarizationState.centroids = new Map()
  console.log('[SpeakerDiarizer] Session reset')
}

export function setupSpeakerDiarizer(): void {
  // Begin loading the model in the background — won't block startup
  initExtractor().catch(err => console.error('[SpeakerDiarizer] Init error:', err))

  ipcMain.removeHandler('speaker:identify')
  ipcMain.handle('speaker:identify', async (
    _e,
    audioBuffers: Array<ArrayBuffer | Buffer>,
    channel: 'mic' | 'sys'
  ) => {
    return identifySpeaker(audioBuffers, channel)
  })

  ipcMain.removeHandler('speaker:reset-session')
  ipcMain.handle('speaker:reset-session', () => {
    resetDiarizerSession()
    return { ok: true }
  })
}
