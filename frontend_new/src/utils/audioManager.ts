'use client';

class AudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const muted = localStorage.getItem('officecraft_muted');
        this.isMuted = muted === 'true';
        const vol = localStorage.getItem('officecraft_volume');
        this.volume = vol ? parseFloat(vol) : 0.5;
      } catch (e) {
        console.warn('LocalStorage not accessible for audio preferences, using defaults.', e);
      }
    }
  }

  /**
   * Initializes the browser AudioContext lazily.
   * Gated for SSR safety and autoplay policy compliance.
   */
  public initContext() {
    if (typeof window === 'undefined') return;
    
    if (!this.ctx) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      } catch (e) {
        console.warn('Web Audio API is not supported in this browser.', e);
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch((err) => {
        console.warn('Failed to resume AudioContext:', err);
      });
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('officecraft_muted', String(muted));
      } catch (e) {
        // Safe ignore in restricted environments
      }
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('officecraft_volume', String(this.volume));
      } catch (e) {
        // Safe ignore in restricted environments
      }
    }
  }

  /**
   * Synthesizes a rapid, low-pitched mechanical character walking footstep.
   */
  public playStep() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'triangle'; // Smooth organic thump
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);

    gainNode.gain.setValueAtTime(0.15 * this.volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * Synthesizes a tiny crisp high-pitched retro dialogue typing chirp.
   */
  public playTypewriter() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sine'; // Clean tiny chirp
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.03);

    // Keep typing subtle so it is satisfying and never fatiguing
    gainNode.gain.setValueAtTime(0.02 * this.volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  /**
   * Synthesizes a tiny crisp retro button click.
   */
  public playClick() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.02);

    gainNode.gain.setValueAtTime(0.03 * this.volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.02);
  }

  /**
   * Synthesizes a high-pitched rising digital chime for panels opening.
   */
  public playOpen() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.12);

    gainNode.gain.setValueAtTime(0.08 * this.volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  /**
   * Synthesizes a low-pitched descending digital sweep for panels closing.
   */
  public playClose() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(850, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.15);

    gainNode.gain.setValueAtTime(0.08 * this.volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Synthesizes a sweeping laser scan sound for RAG database searching.
   */
  public playRagScan() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sawtooth'; // Retro sci-fi sweep
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(1900, now + 0.45);

    gainNode.gain.setValueAtTime(0.04 * this.volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  /**
   * Plays complex synthesized music arpeggios for environment transitions.
   */
  public playThemeTransition(theme: string) {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;

    if (theme === 'quiet-blue') {
      // Quiet Blue: Peaceful Major Seventh Chime (C4 - E4 - G4 - B4)
      const notes = [261.63, 329.63, 392.00, 493.88];
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gainNode = this.ctx!.createGain();
        const startDelay = idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + startDelay);

        gainNode.gain.setValueAtTime(0, now + startDelay);
        gainNode.gain.linearRampToValueAtTime(0.08 * this.volume, now + startDelay + 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + startDelay + 0.45);

        osc.connect(gainNode);
        gainNode.connect(this.ctx!.destination);

        osc.start(now + startDelay);
        osc.stop(now + startDelay + 0.45);
      });
    } else if (theme === 'alert-red') {
      // Alert Red: Alternating Emergency Siren loop (450Hz - 750Hz sweep, 8-bit style)
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.linearRampToValueAtTime(750, now + 0.15);
      osc.frequency.linearRampToValueAtTime(450, now + 0.3);
      osc.frequency.linearRampToValueAtTime(750, now + 0.45);
      osc.frequency.linearRampToValueAtTime(450, now + 0.6);

      gainNode.gain.setValueAtTime(0.05 * this.volume, now);
      gainNode.gain.linearRampToValueAtTime(0.05 * this.volume, now + 0.5);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.6);
    } else if (theme === 'celebrate-gold') {
      // Celebrate Gold: Uplifting major arpeggio fanfare (C5 - E5 - G5 - C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gainNode = this.ctx!.createGain();
        const startDelay = idx * 0.07;
        const dur = idx === 3 ? 0.35 : 0.15;

        osc.type = 'square'; // Classic retro square sound
        osc.frequency.setValueAtTime(freq, now + startDelay);

        gainNode.gain.setValueAtTime(0.04 * this.volume, now + startDelay);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + startDelay + dur);

        osc.connect(gainNode);
        gainNode.connect(this.ctx!.destination);

        osc.start(now + startDelay);
        osc.stop(now + startDelay + dur);
      });
    }
  }

  /**
   * Synthesizes a rapid, delightful dual-tone 8-bit digital chirp for chat messages.
   */
  public playChatChirp() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const notes = [880, 1318.51]; // A5 and E6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();
      const startDelay = idx * 0.05;
      const dur = 0.08;

      osc.type = 'sine'; // Gentle organic sound
      osc.frequency.setValueAtTime(freq, now + startDelay);

      gainNode.gain.setValueAtTime(0.04 * this.volume, now + startDelay);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + startDelay + dur);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(now + startDelay);
      osc.stop(now + startDelay + dur);
    });
  }

  /**
   * Synthesizes a low-to-high sweep pitch-bend siren (8-bit siren: 330Hz -> 660Hz -> 330Hz)
   */
  public playAlarmSiren() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.linearRampToValueAtTime(660, now + 0.4);
    osc.frequency.linearRampToValueAtTime(330, now + 0.8);
    osc.frequency.linearRampToValueAtTime(660, now + 1.2);
    osc.frequency.linearRampToValueAtTime(330, now + 1.6);

    gainNode.gain.setValueAtTime(0.04 * this.volume, now);
    gainNode.gain.linearRampToValueAtTime(0.04 * this.volume, now + 1.4);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 1.6);
  }

  /**
   * Synthesizes a rapid, delightful dual-tone 8-bit digital chirp for peer review alerts.
   */
  public playPeerReviewAlert() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const frequencies = [440, 554.37]; // A4 and C#5
    frequencies.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gainNode.gain.setValueAtTime(0.06 * this.volume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  /**
   * Synthesizes an arpeggio sequence representing successful peer review approval.
   */
  public playPeerReviewApproved() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();
      const startDelay = idx * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startDelay);

      gainNode.gain.setValueAtTime(0.05 * this.volume, now + startDelay);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + startDelay + 0.2);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(now + startDelay);
      osc.stop(now + startDelay + 0.2);
    });
  }

  /**
   * Plays the celebrate gold theme arpeggio.
   */
  public playCelebrateGold() {
    this.playThemeTransition('celebrate-gold');
  }

  /**
   * Synthesizes a native Web Audio 8-bit relay disengage.
   * Generates a sharp mechanical click, followed by a sweeping descending saw wave.
   */
  public playBreakerTrip() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;

    // 1. Sharp mechanical click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(80, now);
    clickGain.gain.setValueAtTime(0.2 * this.volume, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.015);

    // 2. Descending motor hum / relay trip sweep
    const sweepOsc = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(380, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(40, now + 0.80);
    sweepGain.gain.setValueAtTime(0.06 * this.volume, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.80);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(this.ctx.destination);
    sweepOsc.start(now + 0.01);
    sweepOsc.stop(now + 0.81);
  }

  /**
   * Synthesizes a rising triple digital chirp representing power grid restoration.
   */
  public playBreakerRestore() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    const sweeps = [
      { start: 440, end: 880, delay: 0 },
      { start: 554.37, end: 1108.7, delay: 0.15 },
      { start: 659.25, end: 1318.5, delay: 0.30 },
    ];

    sweeps.forEach((sweep) => {
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();
      const startAt = now + sweep.delay;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(sweep.start, startAt);
      osc.frequency.exponentialRampToValueAtTime(sweep.end, startAt + 0.12);

      gainNode.gain.setValueAtTime(0.05 * this.volume, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startAt + 0.12);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(startAt);
      osc.stop(startAt + 0.12);
    });
  }

  /**
   * Synthesizes a rapid, low-fi 8-bit static burst representing network packet loss.
   */
  public playStaticStaticBurst() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    
    // Create a quick noise buffer of 100ms
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;

    // Bandpass filter to create a static/radio scratch effect
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(3.0, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.08 * this.volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    noiseNode.start(now);
    noiseNode.stop(now + 0.1);
  }

  /**
   * Synthesizes a beautiful cascading network restoration chord.
   */
  public playPartitionSuccess() {
    this.initContext();
    if (this.isMuted || !this.ctx || this.volume <= 0) return;

    const now = this.ctx.currentTime;
    // Wind-chime sci-fi ascending arpeggio (C5 - F5 - G5 - C6 - E6)
    const notes = [523.25, 698.46, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();
      const startDelay = idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startDelay);

      gainNode.gain.setValueAtTime(0, now + startDelay);
      gainNode.gain.linearRampToValueAtTime(0.06 * this.volume, now + startDelay + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + startDelay + 0.5);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(now + startDelay);
      osc.stop(now + startDelay + 0.5);
    });
  }
}

export const audioManager = new AudioManager();
