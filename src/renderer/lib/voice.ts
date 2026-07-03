// Voice dictation, Wispr-Flow style. Records the mic, transcribes fully on-device
// with Whisper (Transformers.js WASM — no extra API key, nothing leaves the Mac),
// then the raw text is tidied by a cheap model (main process) into a clean prompt.

let transcriberPromise: Promise<any> | null = null

const MODEL = 'Xenova/whisper-base.en'

// Load the Whisper pipeline once. Prefers the model bundled inside the app (served
// over the emodel:// protocol — fully offline, no download). If the bundled files
// are missing (e.g. skipped at packaging), transparently falls back to the HF CDN.
async function getTranscriber(onProgress?: (p: any) => void): Promise<any> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')

      // First attempt: bundled/offline model.
      try {
        env.allowLocalModels = true
        env.allowRemoteModels = false
        ;(env as any).localModelPath = 'emodel:///'
        return await pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8', progress_callback: onProgress })
      } catch {
        // Fallback: download from the CDN and let the browser cache it.
        env.allowLocalModels = false
        env.allowRemoteModels = true
        return await pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8', progress_callback: onProgress })
      }
    })().catch((e) => {
      transcriberPromise = null
      throw e
    })
  }
  return transcriberPromise
}

export class VoiceRecorder {
  private recorder?: MediaRecorder
  private chunks: Blob[] = []
  private stream?: MediaStream
  private silenceCtx?: AudioContext

  // onSilence: when provided, auto-stops after the user finishes a phrase (for
  // hands-free conversational voice mode). Without it, recording is manual.
  async start(onSilence?: () => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream)
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data)
    }
    this.recorder.start()
    if (onSilence) this.detectSilence(onSilence)
  }

  private detectSilence(onSilence: () => void) {
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
      const ctx = new AC()
      this.silenceCtx = ctx
      const source = ctx.createMediaStreamSource(this.stream!)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      let spoke = false
      let silentSince = 0
      const tick = () => {
        if (!this.recorder || this.recorder.state === 'inactive') return
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        const now = performance.now()
        if (rms > 0.045) {
          spoke = true
          silentSince = 0
        } else if (spoke) {
          if (!silentSince) silentSince = now
          else if (now - silentSince > 1300) {
            onSilence()
            return
          }
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } catch {
      /* silence detection unavailable — user taps to stop */
    }
  }

  stop(): Promise<Blob> {
    return new Promise((res) => {
      this.silenceCtx?.close().catch(() => {})
      if (!this.recorder || this.recorder.state === 'inactive') return res(new Blob(this.chunks, { type: 'audio/webm' }))
      this.recorder.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop())
        res(new Blob(this.chunks, { type: this.recorder!.mimeType || 'audio/webm' }))
      }
      this.recorder.stop()
    })
  }

  cancel(): void {
    try {
      this.silenceCtx?.close().catch(() => {})
      this.stream?.getTracks().forEach((t) => t.stop())
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      /* ignore */
    }
  }
}

// ---- Text-to-speech (conversational voice mode) ----
// Uses the browser's built-in speechSynthesis — offline, no extra key.

function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>|]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis
      synth.cancel()
      const clean = stripForSpeech(text).slice(0, 4000)
      if (!clean) return resolve()
      const u = new SpeechSynthesisUtterance(clean)
      u.rate = 1.03
      u.pitch = 1
      u.onend = () => resolve()
      u.onerror = () => resolve()
      synth.speak(u)
    } catch {
      resolve()
    }
  })
}

export function cancelSpeech(): void {
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
}

// Decode compressed mic audio to mono 16 kHz PCM (what Whisper expects).
async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer()
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
  const ctx = new AC()
  const decoded = await ctx.decodeAudioData(buf)
  await ctx.close()
  const frames = Math.ceil(decoded.duration * 16000)
  const off = new OfflineAudioContext(1, frames, 16000)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return rendered.getChannelData(0)
}

export async function transcribe(blob: Blob, onProgress?: (p: any) => void): Promise<string> {
  const pcm = await toPcm16k(blob)
  if (!pcm.length) return ''
  const transcriber = await getTranscriber(onProgress)
  const out = await transcriber(pcm, { chunk_length_s: 30, stride_length_s: 5 })
  const text = Array.isArray(out) ? out.map((o: any) => o.text).join(' ') : out?.text
  return (text || '').trim()
}
