// Downloads the Whisper speech-to-text model into resources/models so it can be
// bundled in the installer and run fully offline. Run once on a connected machine
// before packaging:  npm run fetch:model
import { mkdirSync, createWriteStream, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const REPO = 'Xenova/whisper-base.en'
const BASE = `https://huggingface.co/${REPO}/resolve/main`
const OUT = join(process.cwd(), 'resources', 'models', REPO)

// Files transformers.js needs for ASR with dtype 'q8' (quantized — small, fast).
const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
]

let ok = 0
let failed = 0
for (const f of FILES) {
  const dest = join(OUT, f)
  mkdirSync(dirname(dest), { recursive: true })
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log('skip (exists)', f)
    ok++
    continue
  }
  process.stdout.write(`fetch ${f} ... `)
  try {
    const res = await fetch(`${BASE}/${f}`)
    if (!res.ok) {
      console.log(`FAIL ${res.status}`)
      failed++
      continue
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
    console.log('ok', (statSync(dest).size / 1024).toFixed(0) + ' KB')
    ok++
  } catch (e) {
    console.log('ERROR', e.message)
    failed++
  }
}
console.log(`\nDone: ${ok} ok, ${failed} failed -> ${OUT}`)
if (failed) {
  console.log('Some files failed. Voice will fall back to on-demand CDN download at runtime.')
  process.exitCode = 0 // non-fatal: runtime CDN fallback covers it
}
