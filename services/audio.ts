import { SoundType } from '../types';

export class AudioService {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  
  // Music State
  isPlaying = false;
  nextNoteTime = 0;
  baseTempo = 128;
  currentTempo = 128;
  beat = 0;
  intensity = 0; // 0 to 1
  
  // Scales
  scale = [0, 3, 7, 10, 12, 15, 19, 22, 24]; // Minor Pentatonic + extensions
  rootFreq = 55; // A1

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.compressor.connect(this.ctx.destination);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.compressor);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.6;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.8;
      this.sfxGain.connect(this.masterGain);
      
      this.scheduleMusic();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isPlaying = true;
  }

  setIntensity(val: number) {
      this.intensity = this.intensity * 0.95 + val * 0.05;
  }

  setTempoMultiplier(mult: number) {
      this.currentTempo = this.baseTempo * mult;
  }

  scheduleMusic() {
      if(!this.ctx || !this.isPlaying) {
          requestAnimationFrame(() => this.scheduleMusic());
          return;
      }

      const lookahead = 0.1;
      const secondsPerBeat = 60.0 / this.currentTempo;
      const secondsPer16th = secondsPerBeat / 4;

      while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
          this.playStep(this.nextNoteTime, this.beat);
          this.nextNoteTime += secondsPer16th;
          this.beat = (this.beat + 1) % 64; 
      }
      requestAnimationFrame(() => this.scheduleMusic());
  }

  playStep(time: number, step: number) {
      if(!this.ctx || !this.musicGain) return;
      
      const bar = Math.floor(step / 16);
      const beatInBar = Math.floor((step % 16) / 4);
      const sixteenth = step % 4;

      const playKick = 
          (step % 4 === 0 && (step % 16 === 0 || this.intensity > 0.2)) || 
          (this.intensity > 0.8 && step % 16 === 14);

      if (playKick) {
          this.synthKick(time);
      }

      if (step % 16 === 4 || step % 16 === 12) {
          if (this.intensity > 0.3) this.synthSnare(time, 1.0);
      } else if (this.intensity > 0.6 && Math.random() < 0.3 && sixteenth !== 0) {
          this.synthSnare(time, 0.3); 
      }

      let hatVol = 0;
      if (sixteenth === 0 || sixteenth === 2) hatVol = 0.1 + (this.intensity * 0.1); 
      else if (this.intensity > 0.5) hatVol = 0.05 + (this.intensity * 0.05); 

      const openHat = (step % 4 === 2) && this.intensity > 0.4;
      if (hatVol > 0) this.synthHat(time, openHat ? 0.3 : 0.05, openHat);

      if (sixteenth === 2 || (this.intensity > 0.7 && sixteenth === 0)) {
           let noteOffset = 0;
           if (bar === 1) noteOffset = -4; 
           if (bar === 2) noteOffset = 3;  
           if (bar === 3) noteOffset = -2; 
           
           this.synthBass(time, this.rootFreq * Math.pow(2, noteOffset/12));
      }

      if (this.intensity > 0.2 && Math.random() < (this.intensity * 0.8)) {
          const idx = Math.floor(Math.random() * this.scale.length);
          const freq = this.rootFreq * 4 * Math.pow(2, this.scale[idx]/12);
          this.synthArp(time, freq);
      }
  }

  synthKick(t: number) {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.connect(gain);
      gain.connect(this.musicGain!);
      
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
      
      gain.gain.setValueAtTime(1.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      
      osc.start(t);
      osc.stop(t + 0.3);
  }

  synthSnare(t: number, vol: number) {
      const bufferSize = this.ctx!.sampleRate * 0.1;
      const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      
      const noise = this.ctx!.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(vol * 0.8, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      noise.start(t);
      
      const osc = this.ctx!.createOscillator();
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
      const oscGain = this.ctx!.createGain();
      oscGain.gain.setValueAtTime(vol * 0.5, t);
      oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(oscGain);
      oscGain.connect(this.musicGain!);
      osc.start(t);
      osc.stop(t + 0.15);
  }

  synthHat(t: number, vol: number, open: boolean) {
      const bufferSize = this.ctx!.sampleRate * (open ? 0.3 : 0.05);
      const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
      
      const noise = this.ctx!.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(vol * 0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.2 : 0.04));
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      noise.start(t);
  }

  synthBass(t: number, freq: number) {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sawtooth';
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      
      const cutoff = 200 + (this.intensity * 2000);
      filter.frequency.setValueAtTime(cutoff, t);
      filter.frequency.exponentialRampToValueAtTime(200, t + 0.2);
      filter.Q.value = 2 + (this.intensity * 5);

      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      
      osc.frequency.setValueAtTime(freq, t);
      osc.start(t);
      osc.stop(t + 0.3);
  }

  synthArp(t: number, freq: number) {
      const osc = this.ctx!.createOscillator();
      osc.type = 'square';
      
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2000;
      filter.Q.value = 1;

      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      const panner = this.ctx!.createStereoPanner();
      panner.pan.value = Math.random() * 2 - 1;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.musicGain!);

      osc.frequency.setValueAtTime(freq, t);
      osc.start(t);
      osc.stop(t + 0.15);
  }

  play(type: SoundType) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.sfxGain);

    switch (type) {
      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(250, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
        break;

      case 'hit':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(20, t + 0.15);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
        break;
      
      case 'chrono':
        // Slow down effect
        const cOsc = this.ctx.createOscillator();
        cOsc.frequency.setValueAtTime(400, t);
        cOsc.frequency.exponentialRampToValueAtTime(50, t + 1.0);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.linearRampToValueAtTime(0, t + 1.0);
        cOsc.connect(gain);
        cOsc.start(t);
        cOsc.stop(t + 1.0);
        break;
        
      case 'fracture':
        // High pitch shatter
        const fOsc = this.ctx.createOscillator();
        fOsc.type = 'sawtooth';
        fOsc.frequency.setValueAtTime(50, t);
        fOsc.frequency.linearRampToValueAtTime(1200, t + 0.1);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        fOsc.connect(gain);
        fOsc.start(t);
        fOsc.stop(t + 0.4);
        break;
        
      case 'glitch_start':
        const gOsc = this.ctx.createOscillator();
        gOsc.type = 'square';
        gOsc.frequency.setValueAtTime(800, t);
        gOsc.frequency.linearRampToValueAtTime(200, t + 0.2);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        const gLfo = this.ctx.createOscillator();
        gLfo.frequency.value = 50;
        const gLfoGain = this.ctx.createGain();
        gLfoGain.gain.value = 1000;
        gLfo.connect(gLfoGain);
        gLfoGain.connect(gOsc.frequency);
        gLfo.start(t);
        gLfo.stop(t + 0.3);
        gOsc.connect(gain);
        gOsc.start(t);
        gOsc.stop(t + 0.3);
        break;

      case 'evolve':
        const riseOsc = this.ctx.createOscillator();
        riseOsc.type = 'sawtooth';
        riseOsc.frequency.setValueAtTime(100, t);
        riseOsc.frequency.exponentialRampToValueAtTime(800, t + 0.8);
        const riseGain = this.ctx.createGain();
        riseGain.gain.setValueAtTime(0, t);
        riseGain.gain.linearRampToValueAtTime(0.5, t + 0.8);
        riseOsc.connect(riseGain);
        riseGain.connect(this.sfxGain);
        riseOsc.start(t);
        riseOsc.stop(t + 0.8);

        const impactOsc = this.ctx.createOscillator();
        impactOsc.type = 'square';
        impactOsc.frequency.setValueAtTime(200, t + 0.8);
        impactOsc.frequency.exponentialRampToValueAtTime(40, t + 1.5);
        const impactGain = this.ctx.createGain();
        impactGain.gain.setValueAtTime(0.8, t + 0.8);
        impactGain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
        
        const impactFilter = this.ctx.createBiquadFilter();
        impactFilter.type = 'lowpass';
        impactFilter.frequency.setValueAtTime(3000, t + 0.8);
        impactFilter.frequency.exponentialRampToValueAtTime(100, t + 1.3);
        
        impactOsc.connect(impactFilter);
        impactFilter.connect(impactGain);
        impactGain.connect(this.sfxGain);
        impactOsc.start(t + 0.8);
        impactOsc.stop(t + 1.5);
        break;
      
      case 'explosion':
        this.playFallback(type, t, gain);
        break;
      default:
         this.playFallback(type, t, gain);
         break;
    }
  }

  playFallback(type: string, t: number, gain: GainNode) {
      const osc = this.ctx!.createOscillator();
      osc.connect(gain);
      if (type === 'explosion') {
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(10, t+0.5);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t+0.5);
      } else {
        osc.frequency.setValueAtTime(440, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t+0.1);
      }
      osc.start(t);
      osc.stop(t+0.5);
  }
}

export const audio = new AudioService();