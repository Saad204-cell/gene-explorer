// App shell: routing between tabs/screens, 8-bit sounds, the install button,
// offline support (service worker) and the tiny pixel-art icon helper.
// Routes use the URL hash (#toolkit, #toolkit/molarity, #learn, #about) so the
// phone's Back gesture moves between screens instead of leaving the app.

const App = {
  // Draw a pixel sprite from rows of letters. Each letter maps to a colour,
  // "." is transparent. Returned as an inline SVG string.
  pixelIcon(rows) {
    const colours = { w: '#e8ecff', b: '#4da3ff', g: '#4ade80', y: '#ffd43b', r: '#ff5d5d' };
    let rects = '';
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (colours[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colours[ch]}"/>`;
      });
    });
    return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  },

  // Show one screen and highlight its tab. Toolkit and Learn are tabs; About is not.
  route() {
    const [screen, sub] = (location.hash.slice(1) || 'explore').split('/');
    const name = ['explore', 'toolkit', 'learn', 'about'].includes(screen) ? screen : 'explore';
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === 'screen-' + name));
    document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === name));
    if (name === 'toolkit') Toolkit.show(sub);
    if (name === 'explore') Explore.show(sub);
    window.scrollTo(0, 0);
  },

  // ---------- 8-bit sounds ----------
  // Made on the fly with the Web Audio API (square waves, like old game consoles),
  // so there are no sound files to download. Sound is OFF until the user turns it on;
  // the choice is remembered on this device.
  soundOn: false,
  audio: null,
  TUNES: {
    done:  [[660, 0.06], [880, 0.09]],                 // short "ding-ding"
    right: [[523, 0.07], [659, 0.07], [784, 0.12]],    // rising C-E-G
    wrong: [[196, 0.12], [147, 0.18]],                 // falling buzz
    level: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.2]]
  },
  sound(name) {
    if (!App.soundOn) return;
    try {
      App.audio = App.audio || new (window.AudioContext || window.webkitAudioContext)();
      let t = App.audio.currentTime;
      for (const [freq, length] of App.TUNES[name] || []) {
        const osc = App.audio.createOscillator(), gain = App.audio.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.06, t);                  // quiet: square waves are harsh
        gain.gain.exponentialRampToValueAtTime(0.001, t + length);
        osc.connect(gain).connect(App.audio.destination);
        osc.start(t); osc.stop(t + length);
        t += length;
      }
    } catch (e) { /* no audio support: stay silent */ }
  },
  setSound(on, quiet = false) {
    App.soundOn = on;
    try { localStorage.setItem('ge:sound', on ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    const btn = document.getElementById('sound-btn');
    btn.textContent = on ? '♪ ON' : '♪ OFF';
    btn.setAttribute('aria-label', on ? 'Sound is on. Tap to mute.' : 'Sound is off. Tap to turn on.');
    btn.classList.toggle('off', !on);
    if (on && !quiet) App.sound('done');   // a beep so the user hears it worked
  },

  // ---------- installing to the home screen ----------
  // Chrome/Android fire "beforeinstallprompt" when the app can be installed. We keep
  // that event and show our own Install button on the About screen. iPhones never
  // fire it, so the About screen also explains Safari's "Add to Home Screen".
  installEvent: null,

  start() {
    document.getElementById('logo').innerHTML = App.pixelIcon([
      'g......r', '.g....r.', '..g..r..', '...gr...', '..yyyb..', '.y....b.',
      'y......b', '.y....b.', '..y..b..', '...rg...', '..r..g..', '.r....g.'
    ]);
    Learn.init();
    Explore.init();

    let saved = 'off';
    try { saved = localStorage.getItem('ge:sound') || 'off'; } catch (e) { /* storage blocked */ }
    App.soundOn = saved === 'on';
    App.setSound(App.soundOn, true);
    document.getElementById('sound-btn').onclick = () => App.setSound(!App.soundOn);

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      App.installEvent = e;
      document.getElementById('install-btn').hidden = false;
    });
    document.getElementById('install-btn').onclick = async () => {
      if (!App.installEvent) return;
      App.installEvent.prompt();
      await App.installEvent.userChoice;
      App.installEvent = null;
      document.getElementById('install-btn').hidden = true;
    };

    // The service worker (sw.js) saves the app's files so it opens with no signal.
    // Browsers only allow this on https or localhost.
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* app still works online */ });
    }

    window.addEventListener('hashchange', App.route);
    App.route();
  }
};

// Format a number for display: 4 significant digits, no trailing zeros,
// scientific notation for very small/large values.
function fmt(x) {
  if (!isFinite(x)) return String(x);
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs < 0.001 || abs >= 1e7) return x.toExponential(3);
  return String(Number(x.toPrecision(4)));
}
