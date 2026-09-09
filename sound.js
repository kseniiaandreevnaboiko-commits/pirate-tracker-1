(function () {
  if (window.PirateSound) return;

  const enabledKey = 'pirateTrackerSoundEnabled';
  const volumeKey = 'pirateTrackerVolume';
  const legacyMutedKey = 'pirateSoundMuted';
  const legacyVolumeKey = 'pirateSoundVolume';
  const savedVolume = localStorage.getItem(volumeKey) ?? localStorage.getItem(legacyVolumeKey);
  const parsedVolume = savedVolume === null ? NaN : Number(savedVolume);
  let masterVolume = Number.isFinite(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1 ? parsedVolume : 1;
  const savedEnabled = localStorage.getItem(enabledKey);
  let soundEnabled = savedEnabled === null ? localStorage.getItem(legacyMutedKey) !== '1' : savedEnabled !== '0';
  let context = null;
  let masterGain = null;
  let ambientGain = null;
  let musicGain = null;
  let lastSoundAt = 0;
  let lastHoverAt = 0;

  function persist() {
    localStorage.setItem(enabledKey, soundEnabled ? '1' : '0');
    localStorage.setItem(volumeKey, String(masterVolume));
    localStorage.setItem(legacyMutedKey, soundEnabled ? '0' : '1');
    localStorage.setItem(legacyVolumeKey, String(masterVolume));
  }

  function effectiveVolume() { return soundEnabled && masterVolume > 0 ? masterVolume : 0; }

  function createMusicLoop() {
    if (!context || !masterGain || musicGain) return;
    const seconds = 24;
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(2, sampleRate * seconds, sampleRate);
    const chords = [
      [146.83, 220.00, 293.66],
      [116.54, 174.61, 233.08],
      [130.81, 196.00, 261.63],
      [110.00, 164.81, 220.00],
      [146.83, 220.00, 293.66],
      [130.81, 196.00, 261.63]
    ];
    const melody = [293.66, 349.23, 440.00, 392.00, 349.23, 293.66, 261.63, 293.66,
      349.23, 392.00, 440.00, 523.25, 440.00, 392.00, 349.23, 293.66,
      261.63, 293.66, 349.23, 392.00, 349.23, 293.66, 261.63, 220.00];
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      const phase = channel * .018;
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const chord = chords[Math.floor(t / 4) % chords.length];
        const swell = Math.sin(Math.PI * ((t % 4) / 4));
        const pad = chord.reduce((sum, frequency, noteIndex) => {
          return sum + Math.sin(2 * Math.PI * frequency * (t + phase * noteIndex)) * (.052 / (noteIndex + 1));
        }, 0) * swell;
        const stepTime = t % 1;
        const note = melody[Math.floor(t) % melody.length];
        const noteEnvelope = Math.min(1, stepTime / .09) * Math.max(0, 1 - stepTime / .88);
        const melodyVoice = (Math.sin(2 * Math.PI * note * (t + phase)) +
          .23 * Math.sin(4 * Math.PI * note * (t + phase))) * .12 * noteEnvelope;
        const bassTime = t % 2;
        const bassEnvelope = Math.min(1, bassTime / .12) * Math.max(0, 1 - bassTime / 1.75);
        const bass = Math.sin(2 * Math.PI * (chord[0] / 2) * t) * .095 * bassEnvelope;
        const loopFade = Math.min(1, t / .12, (seconds - t) / .12);
        data[i] = (pad + melodyVoice + bass) * Math.max(0, loopFade);
      }
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    musicGain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    filter.Q.value = .35;
    musicGain.gain.value = .3;
    source.connect(filter).connect(musicGain).connect(masterGain);
    source.start();
  }

  function initAudio() {
    try {
      if (context) {
        if (context.state === 'suspended') context.resume().catch(() => {});
        return;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context = new AudioContext();
      masterGain = context.createGain();
      masterGain.gain.value = effectiveVolume();
      masterGain.connect(context.destination);

      // Мягкий бесшовный прибой: низкочастотный шум получает две
      // медленные огибающие, похожие на набегающие и отходящие волны.
      const seconds = 12;
      const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
      const data = buffer.getChannelData(0);
      let drift = 0;
      for (let i = 0; i < data.length; i++) {
        const position = i / data.length;
        const swellA = .5 - .5 * Math.cos(position * Math.PI * 4);
        const swellB = .5 - .5 * Math.cos(position * Math.PI * 6);
        const envelope = .18 + Math.pow(swellA, 2) * .55 + Math.pow(swellB, 3) * .22;
        const foam = (Math.random() * 2 - 1) * .025;
        drift = drift * .9965 + (Math.random() * 2 - 1) * .0035;
        data[i] = (drift + foam) * envelope;
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      ambientGain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      filter.Q.value = .45;
      ambientGain.gain.value = .075;
      source.connect(filter).connect(ambientGain).connect(masterGain);
      source.start();
      createMusicLoop();
    } catch (error) {
      context = null;
      masterGain = null;
      ambientGain = null;
      musicGain = null;
    }
  }

  function applyGain() {
    if (!masterGain || !context) return;
    try { masterGain.gain.setTargetAtTime(effectiveVolume(), context.currentTime, .045); } catch (error) {}
  }

  function tone(frequency, duration, level, type = 'sine', endRatio = 1.06, delay = 0) {
    if (!soundEnabled || masterVolume <= 0) return;
    initAudio();
    if (!context || !masterGain) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * endRatio), start + duration);
      gain.gain.setValueAtTime(Math.max(.001, level), start);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(gain).connect(masterGain);
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    } catch (error) {}
  }

  function play(kind = 'click') {
    if (!soundEnabled || masterVolume <= 0) return;
    const now = performance.now();
    if (kind === 'hover') {
      if (now - lastHoverAt < 180) return;
      lastHoverAt = now;
      tone(610, .045, .045, 'triangle', 1.04);
      return;
    }
    if (kind === 'click' && now - lastSoundAt < 85) return;
    lastSoundAt = now;
    const patterns = {
      click: () => tone(330, .075, .075, 'triangle', .92),
      modal: () => tone(430, .09, .055, 'sine', 1.12),
      success: () => { tone(520, .12, .07, 'sine', 1.04); tone(720, .16, .055, 'sine', 1.03, .075); },
      coin: () => { tone(820, .09, .085, 'triangle', 1.2); tone(1160, .12, .06, 'sine', 1.08, .055); },
      debit: () => tone(390, .14, .052, 'triangle', .72),
      reward: () => { tone(440, .11, .065, 'sine', 1.06); tone(660, .15, .058, 'sine', 1.05, .07); tone(880, .18, .045, 'sine', 1.03, .14); },
      confirm: () => { tone(500, .1, .06, 'sine', 1.08); tone(690, .15, .05, 'sine', 1.04, .07); },
      reject: () => tone(260, .12, .04, 'triangle', .8),
      achievement: () => { tone(590, .11, .065, 'triangle', 1.08); tone(790, .15, .055, 'sine', 1.04, .08); tone(1040, .2, .045, 'sine', 1.02, .16); },
      season: () => { tone(410, .18, .05, 'sine', .86); tone(620, .2, .045, 'sine', 1.12, .13); }
    };
    (patterns[kind] || patterns.click)();
  }

  function syncControls(root = document) {
    root.querySelectorAll('[data-sound-control]').forEach(control => {
      const muted = !soundEnabled || masterVolume === 0;
      const button = control.querySelector('[data-sound-button]');
      const muteButton = control.querySelector('[data-sound-mute]');
      const input = control.querySelector('[data-sound-volume]');
      const output = control.querySelector('[data-sound-value]');
      const percent = Math.round(masterVolume * 100);
      if (button) {
        button.classList.toggle('muted', muted);
        const inline = control.hasAttribute('data-sound-inline');
        const label = inline ? (muted ? 'Включить звук' : 'Выключить звук') : (muted ? 'Настройки звука, звук выключен' : 'Настройки звука');
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
      }
      if (muteButton) {
        muteButton.textContent = muted ? 'Включить звук' : 'Выключить звук';
        muteButton.classList.toggle('is-muted', muted);
      }
      if (input) {
        input.value = String(percent);
        input.style.setProperty('--sound-level', percent + '%');
      }
      if (output) output.value = percent + '%';
    });
  }

  function setVolume(value) {
    masterVolume = Math.max(0, Math.min(1, Number(value) || 0));
    soundEnabled = masterVolume > 0;
    persist();
    initAudio();
    applyGain();
    syncControls();
  }

  function toggleMute() {
    initAudio();
    if (!soundEnabled || masterVolume === 0) {
      soundEnabled = true;
      if (masterVolume === 0) masterVolume = .5;
    } else {
      soundEnabled = false;
    }
    persist();
    applyGain();
    syncControls();
    if (soundEnabled) play('click');
  }

  function closePopovers(except = null) {
    document.querySelectorAll('[data-sound-control].open').forEach(control => {
      if (control === except) return;
      control.classList.remove('open');
      control.querySelector('[data-sound-button]')?.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('pointerdown', initAudio, { once: true });
  document.addEventListener('keydown', initAudio, { once: true });
  document.addEventListener('input', event => {
    const input = event.target.closest?.('[data-sound-volume]');
    if (input) setVolume(Number(input.value) / 100);
  });
  document.addEventListener('click', event => {
    const soundButton = event.target.closest?.('[data-sound-button]');
    if (soundButton) {
      event.stopPropagation();
      const control = soundButton.closest('[data-sound-control]');
      if (control.hasAttribute('data-sound-inline')) {
        toggleMute();
        return;
      }
      const opened = !control.classList.contains('open');
      closePopovers(control);
      control.classList.toggle('open', opened);
      soundButton.setAttribute('aria-expanded', opened ? 'true' : 'false');
      if (opened) control.querySelector('[data-sound-volume]')?.focus();
      return;
    }
    const muteButton = event.target.closest?.('[data-sound-mute]');
    if (muteButton) { event.stopPropagation(); toggleMute(); return; }
    if (event.target.closest?.('[data-sound-popover]')) { event.stopPropagation(); return; }
    closePopovers();
    const appButton = event.target.closest?.('button');
    const loggedIn = typeof appData !== 'undefined' && Boolean(appData.currentUser);
    const appContext = appButton && (appButton.closest('#teacher-view') || appButton.closest('#student-view') || (appButton.closest('.modal-overlay') && loggedIn));
    if (appContext && !appButton.closest('[data-sound-control]')) play(appButton.dataset.sound || 'click');
  });
  document.addEventListener('mouseover', event => {
    const important = event.target.closest?.('#teacher-view .td-nav-button, #teacher-view .td-add-class, #teacher-view .td-reward-button, #student-view .sd-nav button, #student-view .sd-action-card, #login-view .lr-card, #login-view .lr-enter');
    if (important && !important.contains(event.relatedTarget)) play('hover');
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closePopovers(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && context?.state === 'suspended') context.resume().then(applyGain).catch(() => {});
  });

  window.PirateSound = {
    bindControls: () => syncControls(),
    play,
    setVolume,
    toggleMute,
    getState: () => ({ soundEnabled, masterVolume })
  };
  persist();
  syncControls();
})();
