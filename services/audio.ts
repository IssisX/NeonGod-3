
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
  baseTempo = 120;
  currentTempo = 120;
  beat = 0;
  intensity = 0; // 0.0 to 1.0 (Danger Level)
  
  // Listener State
  listenerX = 0;
  listenerY = 0;
  
  // Procedural Music Scales (Minor Pentatonic + Blues)
  scale = [0, 3, 5, 6, 7, 10, 12, 15];
  rootFreq = 45; // F1 Deep Bass

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive', sampleRate: 44100 });
      
      // Mastering Chain
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -10;
      this.compressor.knee.value = 40;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.25;
      this.compressor.connect(this.ctx.destination);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5; // Master Volume
      this.masterGain.connect(this.compressor);

      // Mix Bus
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.masterGain);
      
      this.scheduleMusic();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isPlaying = true;
  }

  setIntensity(val: number) {
      // Smooth transition for intensity
      this.intensity = this.intensity * 0.9 + val * 0.1;
  }

  setTempoMultiplier(mult: number) {
      // Smooth tempo changes
      const target = this.baseTempo * mult;
      this.currentTempo = this.currentTempo * 0.95 + target * 0.05;
  }
  
  updateListener(x: number, y: number) {
      if (!this.ctx) return;
      this.listenerX = x;
      this.listenerY = y;
      
      const listener = this.ctx.listener;
      // Standard Web Audio API coordinate system
      // X = Right, Y = Up, Z = Out of screen
      if (listener.positionX) {
          listener.positionX.setTargetAtTime(x, this.ctx.currentTime, 0.1);
          listener.positionY.setTargetAtTime(y, this.ctx.currentTime, 0.1);
          listener.positionZ.setTargetAtTime(300, this.ctx.currentTime, 0.1); // Camera height
      } else {
          listener.setPosition(x, y, 300);
      }
      // Orientation: Looking at (0,0,0), Up is (0,1,0)
      if (listener.forwardX) {
          listener.forwardX.value = 0; listener.forwardY.value = 0; listener.forwardZ.value = -1;
          listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
      }
  }

  // --- MUSIC ENGINE ---

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
          this.beat = (this.beat + 1) % 64; // 4 Bar Loop
      }
      requestAnimationFrame(() => this.scheduleMusic());
  }

  playStep(time: number, step: number) {
      if(!this.ctx || !this.musicGain) return;
      
      // Determine Activity Level
      const highIntensity = this.intensity > 0.6;
      const maxIntensity = this.intensity > 0.8;
      const lowIntensity = this.intensity < 0.3;

      const bar = Math.floor(step / 16);
      const beatInBar = Math.floor((step % 16) / 4);
      const sixteenth = step % 4;

      // 1. KICK DRUM
      let playKick = false;
      if (step % 4 === 0) playKick = true; // 4-on-the-floor base
      if (highIntensity && step % 16 === 14) playKick = true; // Double kick fill
      if (lowIntensity && step % 8 !== 0) playKick = false; // Sparse kick when calm

      if (playKick) this.synthKick(time, maxIntensity);

      // 2. SNARE / CLAP
      if (step % 8 === 4) { // Standard backbeat
          this.synthSnare(time, 0.8 + this.intensity * 0.4);
      }
      // Ghost Notes
      if (highIntensity && Math.random() < 0.3 && sixteenth !== 0) {
          this.synthSnare(time, 0.2);
      }

      // 3. HI-HATS
      if (!lowIntensity) {
          if (sixteenth === 2) { // Off-beat open hat
              this.synthHat(time, 0.3, true);
          } else { // Closed hats
              if (maxIntensity || step % 2 === 0) {
                  this.synthHat(time, 0.1 + (this.intensity * 0.1), false);
              }
          }
      }

      // 4. BASS LINE
      if (sixteenth === 0 || (highIntensity && sixteenth === 2)) {
           // Root note progression
           let note = 0; // F
           if (bar === 1) note = -5; // C (V)
           if (bar === 2) note = 2;  // G (II)
           if (bar === 3) note = -2; // Eb (VII)

           // Octave jump for energy
           const oct = (maxIntensity && Math.random() > 0.5) ? 12 : 0;
           
           const freq = this.rootFreq * Math.pow(2, (note + oct)/12);
           this.synthBass(time, freq, this.intensity);
      }

      // 5. ARPEGGIATOR (High Energy Layer)
      if (this.intensity > 0.4) {
          if (sixteenth % 2 === 0 || maxIntensity) {
              // Procedural Melody
              const seed = (step * 12345 + bar) % this.scale.length;
              const pitch = this.scale[seed];
              const freq = this.rootFreq * 8 * Math.pow(2, pitch/12);
              this.synthArp(time, freq, this.intensity);
          }
      }

      // 6. ATMOSPHERE / PAD (Always running in background, modulated by intensity)
      // (Implemented as separate long running nodes usually, but here per step is expensive.
      //  We skip for efficiency and rely on reverb tail of synths)
  }

  // --- INSTRUMENTS ---

  synthKick(t: number, punchy: boolean) {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.connect(gain);
      gain.connect(this.musicGain!);
      
      osc.frequency.setValueAtTime(punchy ? 200 : 150, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
      
      gain.gain.setValueAtTime(punchy ? 1.0 : 0.8, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + (punchy ? 0.3 : 0.4));
      
      osc.start(t);
      osc.stop(t + 0.4);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); }
  }

  synthSnare(t: number, vol: number) {
      // Noise
      const bufferSize = this.ctx!.sampleRate * 0.1;
      const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      
      const noise = this.ctx!.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1000;
      
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      noise.start(t);
      
      // Body (Tone)
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(250, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
      const oscGain = this.ctx!.createGain();
      oscGain.gain.setValueAtTime(vol * 0.5, t);
      oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.connect(oscGain);
      oscGain.connect(this.musicGain!);
      osc.start(t);
      osc.stop(t + 0.15);
      
      noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); }
      osc.onended = () => { osc.disconnect(); oscGain.disconnect(); }
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
      filter.frequency.value = 8000;
      
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(vol * 0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.2 : 0.05));
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      noise.start(t);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); }
  }

  synthBass(t: number, freq: number, intensity: number) {
      const osc = this.ctx!.createOscillator();
      osc.type = intensity > 0.7 ? 'sawtooth' : 'square'; // Aggressive at high intensity

      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      const cutoff = 200 + (intensity * 1500); // Filter opens up with intensity
      filter.frequency.setValueAtTime(cutoff, t);
      filter.frequency.exponentialRampToValueAtTime(100, t + 0.2);
      filter.Q.value = 2 + (intensity * 8); // Resonance increases

      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      
      osc.frequency.setValueAtTime(freq, t);
      osc.start(t);
      osc.stop(t + 0.35);
      
      osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); }
  }

  synthArp(t: number, freq: number, intensity: number) {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      // Stereo spread for arps
      const panner = this.ctx!.createStereoPanner();
      panner.pan.value = Math.sin(t * 10); // Auto-pan

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.musicGain!);

      osc.frequency.setValueAtTime(freq, t);
      if (intensity > 0.8) {
          // FM modulation at high intensity
          const mod = this.ctx!.createOscillator();
          mod.frequency.value = freq * 2;
          const modGain = this.ctx!.createGain();
          modGain.gain.value = 500;
          mod.connect(modGain);
          modGain.connect(osc.frequency);
          mod.start(t);
          mod.stop(t + 0.1);
      }

      osc.start(t);
      osc.stop(t + 0.15);
      
      osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); }
  }

  // --- PROCEDURAL WEAPON SFX ---

  play(type: SoundType, x?: number, y?: number) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    // Master Node for this sound
    const master = this.ctx.createGain();
    master.gain.value = 1.0;

    // Spatial Panning
    let outputNode: AudioNode = master;
    if (x !== undefined && y !== undefined) {
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 200;
        panner.maxDistance = 2000;
        panner.rolloffFactor = 1.5;
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = 0;
        master.connect(panner);
        outputNode = panner;
    }

    outputNode.connect(this.sfxGain);

    const cleanup = () => {
        // Disconnect after sound is done
        setTimeout(() => {
            master.disconnect();
            if (outputNode instanceof PannerNode) outputNode.disconnect();
        }, 2000);
    };

    switch (type) {
      // 1. PULSE RIFLE (DEFAULT)
      // Fast, sharp square wave pluck. Pew pew.
      case 'shoot_default': {
          const osc = this.ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(400, t);
          osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);

          const env = this.ctx.createGain();
          env.gain.setValueAtTime(0.2, t);
          env.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(3000, t);
          filter.frequency.linearRampToValueAtTime(500, t + 0.1);

          osc.connect(filter);
          filter.connect(env);
          env.connect(master);

          osc.start(t);
          osc.stop(t + 0.15);
          cleanup();
          break;
      }

      // 2. SHOTGUN
      // Noise burst (Boom) + Sub Kick
      case 'shoot_shotgun': {
          // Noise
          const bufferSize = this.ctx.sampleRate * 0.2;
          const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;

          const noiseFilter = this.ctx.createBiquadFilter();
          noiseFilter.type = 'lowpass';
          noiseFilter.frequency.setValueAtTime(800, t);
          noiseFilter.frequency.exponentialRampToValueAtTime(100, t + 0.2);

          const noiseGain = this.ctx.createGain();
          noiseGain.gain.setValueAtTime(0.8, t);
          noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

          noise.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          noiseGain.connect(master);

          // Kick
          const osc = this.ctx.createOscillator();
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
          const oscGain = this.ctx.createGain();
          oscGain.gain.setValueAtTime(0.8, t);
          oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

          osc.connect(oscGain);
          oscGain.connect(master);

          noise.start(t);
          osc.start(t);
          osc.stop(t + 0.3);
          cleanup();
          break;
      }

      // 3. RAILGUN
      // High pitched charging sine + massive crack
      case 'shoot_railgun': {
          // The "Crack"
          const osc = this.ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(2000, t);
          osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

          osc.connect(gain);
          gain.connect(master);

          // The "Beam" hum
          const hum = this.ctx.createOscillator();
          hum.type = 'sine';
          hum.frequency.setValueAtTime(3000, t);
          hum.frequency.linearRampToValueAtTime(500, t + 0.5);

          const humGain = this.ctx.createGain();
          humGain.gain.setValueAtTime(0.3, t);
          humGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

          hum.connect(humGain);
          humGain.connect(master);

          osc.start(t); osc.stop(t + 0.4);
          hum.start(t); hum.stop(t + 0.6);
          cleanup();
          break;
      }

      // 4. VOID RAY
      // Dissonant FM Synth
      case 'shoot_void': {
          const carrier = this.ctx.createOscillator();
          const modulator = this.ctx.createOscillator();
          const modGain = this.ctx.createGain();

          carrier.frequency.setValueAtTime(200, t);
          modulator.frequency.setValueAtTime(300, t); // 1.5 ratio
          modGain.gain.setValueAtTime(1000, t);
          modGain.gain.exponentialRampToValueAtTime(10, t + 0.5);

          modulator.connect(modGain);
          modGain.connect(carrier.frequency);

          const outGain = this.ctx.createGain();
          outGain.gain.setValueAtTime(0.4, t);
          outGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

          carrier.connect(outGain);
          outGain.connect(master);

          carrier.start(t); modulator.start(t);
          carrier.stop(t + 0.5); modulator.stop(t + 0.5);
          cleanup();
          break;
      }
      
      // EXPLOSIONS
      case 'explosion': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
        // Noise source for grit
        const bufSize = this.ctx.sampleRate * 0.5;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for(let i=0; i<bufSize; i++) data[i] = Math.random()*2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;

        // Sub bass
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(10, t+0.5);
        gain.gain.setValueAtTime(1.0, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t+0.8);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, t);
        filter.frequency.exponentialRampToValueAtTime(50, t+0.5);
        
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.8, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t+0.6);
        
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(master);

        osc.connect(gain);
        gain.connect(master);

        osc.start(t); osc.stop(t+0.8);
        noise.start(t);
        cleanup();
        break;
      }

      // UI / GAMEPLAY
      case 'hit':
        const hitOsc = this.ctx.createOscillator();
        const hitGain = this.ctx.createGain();
        hitOsc.frequency.setValueAtTime(150, t);
        hitOsc.frequency.linearRampToValueAtTime(50, t+0.1);
        hitGain.gain.setValueAtTime(0.3, t);
        hitGain.gain.exponentialRampToValueAtTime(0.01, t+0.1);
        hitOsc.connect(hitGain);
        hitGain.connect(master);
        hitOsc.start(t); hitOsc.stop(t+0.2);
        cleanup();
        break;

      case 'spawn':
        const sOsc = this.ctx.createOscillator();
        sOsc.type = 'sine';
        sOsc.frequency.setValueAtTime(50, t);
        sOsc.frequency.exponentialRampToValueAtTime(400, t+0.5);
        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0, t);
        sGain.gain.linearRampToValueAtTime(0.4, t+0.2);
        sGain.gain.linearRampToValueAtTime(0, t+0.6);
        sOsc.connect(sGain);
        sGain.connect(master);
        sOsc.start(t); sOsc.stop(t+0.6);
        cleanup();
        break;

      case 'levelup':
        const lOsc = this.ctx.createOscillator();
        lOsc.type = 'triangle';
        lOsc.frequency.setValueAtTime(440, t);
        lOsc.frequency.setValueAtTime(554, t+0.1); // C#
        lOsc.frequency.setValueAtTime(659, t+0.2); // E
        lOsc.frequency.setValueAtTime(880, t+0.3); // A
        const lGain = this.ctx.createGain();
        lGain.gain.setValueAtTime(0.3, t);
        lGain.gain.exponentialRampToValueAtTime(0.01, t+1.0);
        lOsc.connect(lGain);
        lGain.connect(master);
        lOsc.start(t); lOsc.stop(t+1.0);
        cleanup();
        break;

      // GENERIC FALLBACK
      default:
         const dOsc = this.ctx.createOscillator();
         const dGain = this.ctx.createGain();
         dOsc.frequency.setValueAtTime(220, t);
         dGain.gain.setValueAtTime(0.1, t);
         dGain.gain.exponentialRampToValueAtTime(0.01, t+0.1);
         dOsc.connect(dGain);
         dGain.connect(master);
         dOsc.start(t); dOsc.stop(t+0.2);
         cleanup();
         break;
    }
  }
}

export const audio = new AudioService();
