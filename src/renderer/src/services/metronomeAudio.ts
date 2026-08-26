export type MetronomeSound = 'woodblock' | 'digital' | 'mechanical'

export interface MetronomeState {
  bpm: number
  beatsPerMeasure: number
  beatUnit: number
  accentFirstBeat: boolean
  sound: MetronomeSound
  volume: number
}

class MetronomeAudioEngine {
  private ctx: AudioContext | null = null
  private isRunning = false
  private timerId: number | null = null
  private nextNoteTime = 0.0
  private currentBeatInMeasure = 0
  private getState: () => MetronomeState
  private onBeatCallback?: (beatIndex: number) => void

  constructor(getState: () => MetronomeState) {
    this.getState = getState
  }

  private getAudioContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch((e) => console.warn('AudioContext resume failed:', e))
    }
    return this.ctx
  }

  public setOnBeat(cb: (beatIndex: number) => void): void {
    this.onBeatCallback = cb
  }

  public async start(): Promise<void> {
    if (this.isRunning) return

    const ctx = this.getAudioContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    this.isRunning = true
    this.currentBeatInMeasure = 0
    this.nextNoteTime = ctx.currentTime + 0.05

    const scheduler = (): void => {
      if (!this.isRunning) return

      const currentCtx = this.getAudioContext()
      const scheduleAheadTime = 0.1 // 100ms lookahead

      while (this.nextNoteTime < currentCtx.currentTime + scheduleAheadTime) {
        const state = this.getState()
        const beatToPlay = this.currentBeatInMeasure
        const timeToPlay = this.nextNoteTime
        const isAccent = beatToPlay === 0 && state.accentFirstBeat

        this.playClick(currentCtx, timeToPlay, isAccent, state.sound, state.volume)

        // Schedule visual beat update synced with audio
        const delayMs = Math.max(0, (timeToPlay - currentCtx.currentTime) * 1000)
        window.setTimeout(() => {
          if (this.isRunning && this.onBeatCallback) {
            this.onBeatCallback(beatToPlay)
          }
        }, delayMs)

        // Calculate interval for next beat
        // Standard metronome: BPM specifies beats (clicks) per minute
        const secondsPerBeat = 60.0 / Math.max(30, Math.min(300, state.bpm))
        this.nextNoteTime += secondsPerBeat
        this.currentBeatInMeasure =
          (this.currentBeatInMeasure + 1) % Math.max(1, state.beatsPerMeasure)
      }

      this.timerId = window.setTimeout(scheduler, 25)
    }

    scheduler()
  }

  public stop(): void {
    this.isRunning = false
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
    this.currentBeatInMeasure = 0
  }

  public playSingleClick(isAccent = false): void {
    try {
      const ctx = this.getAudioContext()
      const state = this.getState()
      this.playClick(ctx, ctx.currentTime, isAccent, state.sound, state.volume)
    } catch (e) {
      console.warn('Single click error:', e)
    }
  }

  private playClick(
    ctx: AudioContext,
    time: number,
    isAccent: boolean,
    sound: MetronomeSound,
    volume: number
  ): void {
    if (volume <= 0) return

    const masterGain = ctx.createGain()
    const safeVolume = Math.max(0.01, Math.min(1.0, volume))
    masterGain.gain.setValueAtTime(safeVolume, time)
    masterGain.connect(ctx.destination)

    if (sound === 'digital') {
      // Crisp synthetic digital beep
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const freq = isAccent ? 1400 : 880
      const duration = isAccent ? 0.05 : 0.035

      osc.frequency.setValueAtTime(freq, time)
      gain.gain.setValueAtTime(isAccent ? 1.0 : 0.7, time)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)

      osc.connect(gain)
      gain.connect(masterGain)

      osc.start(time)
      osc.stop(time + duration + 0.01)
    } else if (sound === 'mechanical') {
      // Mechanical pendulum tick/clack with fast downward sweep
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      const baseFreq = isAccent ? 1200 : 720
      const duration = isAccent ? 0.03 : 0.022

      osc.frequency.setValueAtTime(baseFreq, time)
      osc.frequency.exponentialRampToValueAtTime(Math.max(100, baseFreq * 0.4), time + duration)

      gain.gain.setValueAtTime(isAccent ? 1.0 : 0.75, time)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)

      osc.connect(gain)
      gain.connect(masterGain)

      osc.start(time)
      osc.stop(time + duration + 0.01)
    } else {
      // Woodblock (Default): rich woody tone with primary + secondary resonance
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc2.type = 'triangle'

      const baseFreq = isAccent ? 1180 : 760
      const duration = isAccent ? 0.045 : 0.035

      osc1.frequency.setValueAtTime(baseFreq, time)
      osc1.frequency.exponentialRampToValueAtTime(Math.max(100, baseFreq * 0.7), time + duration)

      osc2.frequency.setValueAtTime(baseFreq * 2.1, time)
      osc2.frequency.exponentialRampToValueAtTime(
        Math.max(100, baseFreq * 1.3),
        time + duration * 0.6
      )

      gain.gain.setValueAtTime(isAccent ? 1.0 : 0.7, time)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(masterGain)

      osc1.start(time)
      osc2.start(time)
      osc1.stop(time + duration + 0.01)
      osc2.stop(time + duration + 0.01)
    }
  }
}

export const createMetronomeEngine = (getState: () => MetronomeState): MetronomeAudioEngine => {
  return new MetronomeAudioEngine(getState)
}
