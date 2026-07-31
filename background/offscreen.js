/**
 * === offscreen.js ===
 * Boosta Jira Notifier - Offscreen Audio Synthesizer & Player
 * 
 * Supports:
 * 1. 🌸 'anime': High-pitched cute anime girl voice chime sound effect (Anime Voice / Notice me sound)
 * 2. 🔔 'chime': Classic harmonic two-tone bell chime
 * 3. 🎵 External MP3 file playback (assets/anime_girl.mp3)
 */

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.action === 'PLAY_NOTIFICATION_SOUND') {
    const soundType = message.soundType || 'anime';
    playSound(soundType, message.customAudioDataUrl);
  }
});

async function playSound(type, customAudioDataUrl) {
  let dataUrl = customAudioDataUrl;
  if (!dataUrl && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const stored = await chrome.storage.local.get(['customAudioDataUrl']);
      dataUrl = stored.customAudioDataUrl;
    } catch (_) {}
  }

  if (type === 'anime') {
    playAnimeGirlSound(dataUrl);
  } else if (type === 'custom') {
    playCustomAudio(dataUrl);
  } else {
    playClassicChime();
  }
}

/**
 * Plays anime girl sound from custom data URL, assets/anime_girl.mp3, or synthesized Web Audio fallback.
 */
function playAnimeGirlSound(customDataUrl) {
  try {
    const src = customDataUrl || chrome.runtime.getURL('assets/anime_girl.mp3');
    const audio = new Audio(src);
    audio.volume = 0.85;
    audio.play().catch(() => {
      synthAnimeVoice();
    });
  } catch (_) {
    synthAnimeVoice();
  }
}

function playCustomAudio(customDataUrl) {
  try {
    const src = customDataUrl || chrome.runtime.getURL('assets/notice.mp3');
    const audio = new Audio(src);
    audio.volume = 0.9;
    audio.play().catch(() => {
      const fallbackAudio = new Audio(chrome.runtime.getURL('assets/anime_girl.mp3'));
      fallbackAudio.volume = 0.85;
      fallbackAudio.play().catch(() => synthAnimeVoice());
    });
  } catch (_) {
    synthAnimeVoice();
  }
}

function synthAnimeVoice() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    // Cute Anime Girl Voice 3-part melodic sweep ("A-ra A-ra!" / "Sen-pai!")
    // Frequencies: E5 (659Hz) -> A5 (880Hz) -> C#6 (1108Hz) with formant bandpass filter
    const notes = [
      { freq: 783.99, time: 0, duration: 0.12, endFreq: 987.77 },   // G5 to B5 (Kyaa~!)
      { freq: 1046.50, time: 0.10, duration: 0.14, endFreq: 1318.51 }, // C6 to E6 (Sen-pai~!)
      { freq: 1567.98, time: 0.22, duration: 0.22, endFreq: 1760.00 }  // G6 to A6 (Sparkle finish)
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle'; // Richer harmonics for vocal synth effect
      
      // Pitch Glissando (Cute rising anime inflection)
      osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.time);
      osc.frequency.exponentialRampToValueAtTime(n.endFreq, ctx.currentTime + n.time + n.duration);

      // Formant Filter to simulate vocal resonance (bright cute voice resonance ~2.8kHz)
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2800, ctx.currentTime);
      filter.Q.setValueAtTime(3.5, ctx.currentTime);

      // Envelope (fast attack, cute decay)
      gain.gain.setValueAtTime(0, ctx.currentTime + n.time);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + n.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + n.time);
      osc.stop(ctx.currentTime + n.time + n.duration + 0.05);
    });

    setTimeout(() => ctx.close(), 700);
  } catch (error) {
    console.error('[OffscreenAudio] Error synthesizing anime voice:', error);
  }
}

/**
 * Classic harmonic two-tone chime.
 */
function playClassicChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const tones = [
      { freq: 523.25, time: 0, duration: 0.15 },
      { freq: 659.25, time: 0.12, duration: 0.25 }
    ];

    tones.forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, ctx.currentTime + t.time);
      gain.gain.setValueAtTime(0, ctx.currentTime + t.time);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + t.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t.time + t.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t.time);
      osc.stop(ctx.currentTime + t.time + t.duration + 0.05);
    });

    setTimeout(() => ctx.close(), 600);
  } catch (error) {
    console.error('[OffscreenAudio] Error playing classic chime:', error);
  }
}
