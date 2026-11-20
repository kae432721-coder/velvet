const state = {
  lang: "English",
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  favorites: new Set(),
  heroTracks: [],
  lyrics: [],
  activeLyricIdx: -1,
  fsMode: "lyrics",
  activePreset: localStorage.getItem("velvet_preset") || "dynamic",
  shuffle: false,
  repeat: "off", // off | all | one
  autoplay: true,
  crossfade: parseInt(localStorage.getItem("velvet_crossfade") || "2", 10),
  userVolume: 1,
};

const PRESETS = [
  { id: "dynamic", name: "Dynamic Album", desc: "Adapts to cover art", css: "radial-gradient(in oklch circle at 25% 25%, #3d161b 0%, #12080a 55%, #050505 100%)" },
  { id: "velvet-noir", name: "Velvet Noir", desc: "Deep burgundy → obsidian", css: "radial-gradient(in oklch circle at 25% 20%, #4a1220 0%, #16070c 58%, #050505 100%)" },
  { id: "midnight", name: "Midnight Indigo", desc: "Abyssal blue → violet dusk", css: "linear-gradient(in oklch 135deg, #101b3d 0%, #1b1133 50%, #07070d 100%)" },
  { id: "emerald", name: "Emerald Abyss", desc: "Deep forest → teal shadow", css: "radial-gradient(in oklch circle at 75% 20%, #0c362c 0%, #071917 55%, #040808 100%)" },
  { id: "amber", name: "Amber Ember", desc: "Burnt sienna → espresso", css: "radial-gradient(in oklch circle at 20% 25%, #4a230e 0%, #1a0d07 55%, #070504 100%)" },
  { id: "cyberplum", name: "Cyberplum", desc: "Rich plum → slate navy", css: "linear-gradient(in oklch 145deg, #36133b 0%, #14172b 55%, #06060a 100%)" },
  { id: "aurora", name: "Aurora Borealis", desc: "Northern teal → deep indigo", css: "radial-gradient(in oklch at 20% 20%, #0d3b3e 0%, transparent 55%), radial-gradient(in oklch at 80% 75%, #231545 0%, #05060b 70%)" },
  { id: "crimson", name: "Crimson Dusk", desc: "Smoky scarlet → charcoal", css: "linear-gradient(in oklch 150deg, #420f17 0%, #1c0b14 48%, #070608 100%)" },
  { id: "oceanic", name: "Oceanic Obsidian", desc: "Deep sapphire → abyss black", css: "radial-gradient(in oklch circle at 30% 15%, #0c2742 0%, #071324 55%, #040508 100%)" },
  { id: "rosewood", name: "Rosewood Velvet", desc: "Muted rose → warm mahogany", css: "radial-gradient(in oklch circle at 25% 25%, #471c2b 0%, #1f0e14 55%, #080506 100%)" },
];

const audio = document.getElementById("audioEl");
let audioCtx, analyser, sourceNode, dataArray;

// Navigation
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
function switchView(name) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "library") loadLibrary();
  if (name === "downloads") loadDownloads();
}

// Gradient Engine
function renderPresets() {
  const grid = document.getElementById("presetGrid");
  grid.innerHTML = "";
  PRESETS.forEach(p => {
    const card = document.createElement("div");
    card.className = `preset-card ${state.activePreset === p.id ? "active" : ""}`;
    card.style.background = p.css;
    card.innerHTML = `<div class="preset-name">${p.name}</div><div class="preset-desc">${p.desc}</div>`;
    card.addEventListener("click", () => {
      state.activePreset = p.id;
      localStorage.setItem("velvet_preset", p.id);
      if (p.id === "dynamic" && state.currentTrack) applyDynamicHue(state.currentTrack.title, state.currentTrack.thumbnail);
      else applyGradientCSS(p.css);
      renderPresets();
    });
    grid.appendChild(card);
  });
}
function applyGradientCSS(css) { document.documentElement.style.setProperty("--fs-bg", css); if (typeof syncPipTheme === "function") syncPipTheme(css); }
function applyDynamicHue(seedText, thumbUrl = "") {
  const fallback = () => {
    let hash = 0;
    for (let i = 0; i < seedText.length; i++) hash = seedText.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    applyGradientCSS(`radial-gradient(in oklch circle at 25% 25%, oklch(27% 0.09 ${hue}) 0%, oklch(13% 0.04 ${(hue + 25) % 360}) 58%, #050505 100%)`);
  };

  if (!thumbUrl) { fallback(); return; }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = 16; c.height = 16;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum > 25 && lum < 230) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
        }
      }
      if (!count) { fallback(); return; }
      // Scale down brightness so white lyrics & UI always keep high contrast
      const r1 = Math.round((r / count) * 0.42);
      const g1 = Math.round((g / count) * 0.42);
      const b1 = Math.round((b / count) * 0.42);
      const r2 = Math.round(r1 * 0.35), g2 = Math.round(g1 * 0.35), b2 = Math.round(b1 * 0.35);
      applyGradientCSS(`radial-gradient(in oklch circle at 25% 25%, rgb(${r1}, ${g1}, ${b1}) 0%, rgb(${r2}, ${g2}, ${b2}) 58%, #050505 100%)`);
    } catch { fallback(); }
  };
  img.onerror = fallback;
  img.src = `/api/image-proxy?url=${encodeURIComponent(thumbUrl)}`;
}

document.getElementById("customAngle").addEventListener("input", (e) => document.getElementById("angleVal").textContent = e.target.value);
document.getElementById("applyCustomBtn").addEventListener("click", () => {
  const c1 = document.getElementById("customColor1").value;
  const c2 = document.getElementById("customColor2").value;
  const style = document.getElementById("customStyle").value;
  const angle = document.getElementById("customAngle").value;
  let css = `linear-gradient(in oklch ${angle}deg, ${c1} 0%, ${c2} 100%)`;
  if (style === "radial") css = `radial-gradient(in oklch circle at 25% 25%, ${c1} 0%, ${c2} 75%, #050505 100%)`;
  if (style === "mesh") css = `radial-gradient(in oklch at 20% 20%, ${c1} 0%, transparent 55%), radial-gradient(in oklch at 80% 80%, ${c1} 0%, ${c2} 65%, #050505 100%)`;
  state.activePreset = "custom";
  localStorage.setItem("velvet_preset", "custom");
  localStorage.setItem("velvet_custom_css", css);
  applyGradientCSS(css);
  renderPresets();
});
document.getElementById("grainToggle").addEventListener("change", (e) => document.getElementById("fsGrain").classList.toggle("hidden", !e.target.checked));

const cfSlider = document.getElementById("crossfadeSlider");
cfSlider.value = state.crossfade;
document.getElementById("crossfadeVal").textContent = state.crossfade;
cfSlider.addEventListener("input", (e) => {
  state.crossfade = parseInt(e.target.value, 10);
  document.getElementById("crossfadeVal").textContent = state.crossfade;
  localStorage.setItem("velvet_crossfade", state.crossfade);
});

function initTheme() {
  if (state.activePreset === "custom" && localStorage.getItem("velvet_custom_css")) {
    applyGradientCSS(localStorage.getItem("velvet_custom_css"));
  } else {
    applyGradientCSS((PRESETS.find(p => p.id === state.activePreset) || PRESETS[0]).css);
  }
  renderPresets();
}

// Home & Lists
document.querySelectorAll("#langPills .pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#langPills .pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    state.lang = pill.dataset.lang;
    loadHome(state.lang);
  });
});

async function loadHome(lang) {
  const res = await fetch(`/api/home?lang=${encodeURIComponent(lang)}`);
  const data = await res.json();
  document.getElementById("heroTitle").textContent = data.hero.title;
  document.getElementById("heroSubtitle").textContent = data.hero.subtitle;
  state.heroTracks = data.hero.tracks;
  document.getElementById("heroArtCluster").innerHTML = data.hero.tracks.slice(0, 3).map(t => `<img src="${t.thumbnail}" alt="" />`).join("");

  const recentWrap = document.getElementById("recentShelfWrap");
  if (data.recent && data.recent.length) {
    recentWrap.classList.remove("hidden");
    renderCardRow(document.getElementById("recentRow"), data.recent);
  } else recentWrap.classList.add("hidden");

  const shelvesEl = document.getElementById("dynamicShelves");
  shelvesEl.innerHTML = "";
  data.shelves.forEach(shelf => {
    const div = document.createElement("div");
    div.className = "shelf";
    div.innerHTML = `<div class="shelf-header"><h2>${shelf.title}</h2></div><div class="card-row"></div>`;
    renderCardRow(div.querySelector(".card-row"), shelf.tracks);
    shelvesEl.appendChild(div);
  });
  lucide.createIcons();
}

function renderCardRow(container, tracks) {
  container.innerHTML = "";
  tracks.forEach((t, idx) => {
    const card = document.createElement("div");
    card.className = "track-card";
    card.innerHTML = `
      <div class="card-img-wrap">
        <img src="${t.thumbnail}" alt="" loading="lazy" />
        <div class="card-actions-overlay">
          <button class="card-dl-btn card-next-btn" data-tip="Play Next">
            <i data-lucide="list-start" style="width:14px;height:14px"></i>
          </button>
          <button class="card-dl-btn card-pl-btn" data-tip="Add to Playlist">
            <i data-lucide="plus" style="width:14px;height:14px"></i>
          </button>
          <button class="card-dl-btn ${t.downloaded ? "done" : ""}" data-tip="Download">
            <i data-lucide="${t.downloaded ? "check" : "download"}" style="width:14px;height:14px"></i>
          </button>
        </div>
      </div>
      <div class="card-title">${t.title}</div>
      <div class="card-artist">${t.artist}</div>
    `;
    card.addEventListener("click", (e) => { if (!e.target.closest(".card-dl-btn")) playFromList(tracks, idx); });
    card.querySelector(".card-next-btn").addEventListener("click", (e) => { e.stopPropagation(); playNext(t); });
    card.querySelector(".card-pl-btn").addEventListener("click", (e) => { e.stopPropagation(); openPlaylistModal(t); });
    card.querySelector(".card-actions-overlay .card-dl-btn:last-child").addEventListener("click", (e) => { e.stopPropagation(); downloadTrack(t, e.currentTarget); });
    container.appendChild(card);
  });
}

function renderTrackList(container, tracks) {
  container.innerHTML = "";
  if (!tracks.length) { container.innerHTML = `<p class="muted">No tracks found.</p>`; return; }
  tracks.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.innerHTML = `
      <img src="${t.thumbnail}" alt="" />
      <div class="row-meta"><div class="row-title">${t.title}</div><div class="row-artist">${t.artist}</div></div>
      <div class="row-actions">
        <button class="icon-btn next-row-btn" data-tip="Play Next"><i data-lucide="list-start"></i></button>
        <button class="icon-btn queue-row-btn" data-tip="Add to Queue"><i data-lucide="list-plus"></i></button>
        <button class="icon-btn pl-row-btn" data-tip="Add to Playlist"><i data-lucide="plus"></i></button>
        <button class="icon-btn dl-row-btn" data-tip="Download"><i data-lucide="${t.downloaded ? "check" : "download"}"></i></button>
      </div>
    `;
    row.addEventListener("click", (e) => { if (!e.target.closest(".row-actions")) playFromList(tracks, idx); });
    row.querySelector(".next-row-btn").addEventListener("click", (e) => { e.stopPropagation(); playNext(t); });
    row.querySelector(".queue-row-btn").addEventListener("click", (e) => { e.stopPropagation(); addToQueue(t); });
    row.querySelector(".pl-row-btn").addEventListener("click", (e) => { e.stopPropagation(); openPlaylistModal(t); });
    row.querySelector(".dl-row-btn").addEventListener("click", (e) => { e.stopPropagation(); downloadTrack(t, e.currentTarget); });
    container.appendChild(row);
  });
  lucide.createIcons();
}

// Visualizer
let eqFilters = [], dryGain, wetGain, convolver;
const EQ_FREQS = [60, 230, 910, 3600, 14000];
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bass: [7, 4, 0, 0, 1],
  vocal: [-2, 1, 4, 3, 1],
  latenight: [3, 1, -1, -2, -3],
  punchy: [5, 2, -1, 3, 5],
};

function createReverbImpulse(ctx, seconds = 2.4, decay = 2.5) {
  const rate = ctx.sampleRate, len = rate * seconds;
  const impulse = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}

function initVisualizer() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    sourceNode = audioCtx.createMediaElementSource(audio);

    // Build 5-band EQ chain
    eqFilters = EQ_FREQS.map((freq, i) => {
      const f = audioCtx.createBiquadFilter();
      f.type = i === 0 ? "lowshelf" : i === EQ_FREQS.length - 1 ? "highshelf" : "peaking";
      f.frequency.value = freq;
      f.Q.value = 1.0;
      f.gain.value = 0;
      return f;
    });

    let node = sourceNode;
    eqFilters.forEach(f => { node.connect(f); node = f; });

    // Dry + Wet Reverb split
    dryGain = audioCtx.createGain();
    wetGain = audioCtx.createGain();
    dryGain.gain.value = 1.0;
    wetGain.gain.value = 0.0;

    convolver = audioCtx.createConvolver();
    convolver.buffer = createReverbImpulse(audioCtx);

    node.connect(dryGain);
    node.connect(convolver);
    convolver.connect(wetGain);

    dryGain.connect(analyser);
    wetGain.connect(analyser);
    analyser.connect(audioCtx.destination);

    dataArray = new Uint8Array(analyser.frequencyBinCount);
    applyEQValues(getSavedEQ());
    if (document.getElementById("slowedReverbToggle")?.checked) setSlowedReverb(true);
    drawVisualizer();
  } catch (e) { console.warn("Audio engine init error:", e); }
}

function getSavedEQ() {
  try { return JSON.parse(localStorage.getItem("velvet_eq") || "[0,0,0,0,0]"); }
  catch { return [0, 0, 0, 0, 0]; }
}

function applyEQValues(vals) {
  localStorage.setItem("velvet_eq", JSON.stringify(vals));
  document.querySelectorAll(".eq-slider").forEach((s, i) => { s.value = vals[i] ?? 0; });
  eqFilters.forEach((f, i) => { f.gain.value = vals[i] ?? 0; });
}

function setSlowedReverb(enabled) {
  audio.preservesPitch = !enabled;
  audio.mozPreservesPitch = !enabled;
  audio.webkitPreservesPitch = !enabled;
  audio.playbackRate = enabled ? 0.85 : 1.0;
  if (wetGain && dryGain) {
    wetGain.gain.value = enabled ? 0.42 : 0.0;
    dryGain.gain.value = enabled ? 0.82 : 1.0;
  }
}
function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  const canvas = document.getElementById("visualizerCanvas");
  if (!analyser || !canvas || document.getElementById("fsFocusMode").classList.contains("hidden")) return;
  const ctx = canvas.getContext("2d");
  analyser.getByteFrequencyData(dataArray);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bars = 28, gap = 5, w = (canvas.width - gap * (bars - 1)) / bars;
  for (let i = 0; i < bars; i++) {
    const val = dataArray[i] / 255;
    const h = Math.max(4, val * canvas.height);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.28 + val * 0.65})`;
    ctx.beginPath();
    ctx.roundRect(i * (w + gap), (canvas.height - h) / 2, w, h, 4);
    ctx.fill();
  }
}

// Media Session API (Hardware Media Keys)
function updateMediaSession(track) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || "Velvet",
    artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: "512x512", type: "image/jpeg" }] : [],
  });
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("previoustrack", prevTrack);
  navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
}

// Playback, Repeat, Shuffle, Autoplay & Crossfade
function playFromList(list, index) {
  state.queue = [...list];
  state.currentIndex = index;
  playTrack(state.queue[state.currentIndex]);
  renderQueue();
}

async function playTrack(track) {
  if (!track) return;
  initVisualizer();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  state.currentTrack = track;
  audio.src = `/api/stream/${encodeURIComponent(track.id)}?t=${Date.now()}`;
  audio.volume = state.crossfade > 0 ? 0.1 : state.userVolume;
  audio.play().catch(console.error);

  document.getElementById("playerTitle").textContent = track.title;
  document.getElementById("playerArtist").textContent = track.artist;
  const thumb = document.getElementById("playerThumb");
  thumb.src = track.thumbnail || "";
  thumb.classList.toggle("hidden", !track.thumbnail);

  ["fsLyricsTitle", "fsFocusTitle"].forEach(id => document.getElementById(id).textContent = track.title);
  ["fsLyricsArtist", "fsFocusArtist"].forEach(id => document.getElementById(id).textContent = track.artist);
  ["fsLyricsArt", "fsFocusArt"].forEach(id => document.getElementById(id).src = track.thumbnail || "");

  if (state.activePreset === "dynamic") applyDynamicHue(track.title, track.thumbnail);
  updateFavIcon();
  updateMediaSession(track);
  loadLyrics(track);
  if (typeof syncPipTrack === "function") syncPipTrack();
  fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(track) });
}

async function fetchAutoplayNext() {
  if (!state.currentTrack) return;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(state.currentTrack.artist + " songs")}&source=ytm&limit=10`);
    const data = await res.json();
    const existing = new Set(state.queue.map(t => t.id));
    const fresh = (data.results || []).filter(t => !existing.has(t.id));
    if (fresh.length) {
      state.queue.push(...fresh.slice(0, 5));
      state.currentIndex++;
      renderQueue();
      playTrack(state.queue[state.currentIndex]);
    }
  } catch (e) { console.warn("Autoplay fetch failed:", e); }
}

function togglePlay() { if (audio.src) audio.paused ? audio.play() : audio.pause(); }
function nextTrack() {
  if (!state.queue.length) return;
  if (state.repeat === "one") { audio.currentTime = 0; audio.play(); return; }
  if (state.shuffle && state.queue.length > 1) {
    let next;
    do { next = Math.floor(Math.random() * state.queue.length); } while (next === state.currentIndex);
    state.currentIndex = next;
    playTrack(state.queue[state.currentIndex]);
    return;
  }
  if (state.currentIndex + 1 < state.queue.length) {
    state.currentIndex++;
    playTrack(state.queue[state.currentIndex]);
  } else if (state.repeat === "all") {
    state.currentIndex = 0;
    playTrack(state.queue[0]);
  } else if (state.autoplay) {
    fetchAutoplayNext();
  }
}
function prevTrack() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (state.currentIndex > 0) { state.currentIndex--; playTrack(state.queue[state.currentIndex]); }
}

// Repeat / Shuffle / Autoplay Toggles
function cycleRepeat() {
  state.repeat = state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off";
  document.querySelectorAll(".repeat-btn").forEach(btn => {
    btn.classList.toggle("active", state.repeat !== "off");
    btn.innerHTML = `<i data-lucide="${state.repeat === "one" ? "repeat-1" : "repeat"}"></i>`;
  });
  lucide.createIcons();
}
function toggleShuffle() {
  state.shuffle = !state.shuffle;
  document.querySelectorAll(".shuffle-btn").forEach(b => b.classList.toggle("active", state.shuffle));
}
function toggleAutoplay() {
  state.autoplay = !state.autoplay;
  document.querySelectorAll(".autoplay-btn").forEach(b => b.classList.toggle("active", state.autoplay));
}
document.querySelectorAll(".repeat-btn").forEach(b => b.addEventListener("click", cycleRepeat));
document.querySelectorAll(".shuffle-btn").forEach(b => b.addEventListener("click", toggleShuffle));
document.querySelectorAll(".autoplay-btn").forEach(b => b.addEventListener("click", toggleAutoplay));

// Synced Lyrics
function parseLRC(lrc) {
  const lines = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (m && m[3].trim()) lines.push({ time: parseInt(m[1], 10) * 60 + parseFloat(m[2]), text: m[3].trim() });
  }
  return lines;
}
async function loadLyrics(track) {
  const container = document.getElementById("lyricsContainer");
  container.innerHTML = `<p class="lyric-line active">Loading lyrics...</p>`;
  state.lyrics = []; state.activeLyricIdx = -1;
  try {
    const res = await fetch(`/api/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`);
    const data = await res.json();
    if (data.synced && data.lyrics) {
      state.lyrics = parseLRC(data.lyrics);
      container.innerHTML = "";
      state.lyrics.forEach((line, i) => {
        const p = document.createElement("p");
        p.className = "lyric-line"; p.textContent = line.text;
        p.addEventListener("click", () => { audio.currentTime = line.time; });
        container.appendChild(p);
      });
    } else if (data.plain) {
      container.innerHTML = data.plain.split("\n").map(l => `<p class="lyric-line active" style="opacity:0.85;font-size:1.5rem">${l}</p>`).join("");
    } else container.innerHTML = `<p class="lyric-line active">No lyrics found for this track.</p>`;
  } catch { container.innerHTML = `<p class="lyric-line active">Could not load lyrics.</p>`; }
  if (typeof syncPipLyrics === "function") syncPipLyrics();
}
function updateActiveLyric(t) {
  if (!state.lyrics.length) return;
  let idx = -1;
  for (let i = 0; i < state.lyrics.length; i++) { if (t >= state.lyrics[i].time) idx = i; else break; }
  if (idx !== state.activeLyricIdx) {
    state.activeLyricIdx = idx;
    const nodes = document.querySelectorAll("#lyricsContainer .lyric-line");
    nodes.forEach((n, i) => n.classList.toggle("active", i === idx));
    if (idx >= 0 && nodes[idx]) nodes[idx].scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Player Events & Crossfade Ramp
document.getElementById("heroPlayBtn").addEventListener("click", () => { if (state.heroTracks.length) playFromList(state.heroTracks, 0); });
document.getElementById("playPauseBtn").addEventListener("click", togglePlay);
document.getElementById("nextBtn").addEventListener("click", nextTrack);
document.getElementById("prevBtn").addEventListener("click", prevTrack);
document.querySelectorAll(".fs-play").forEach(b => b.addEventListener("click", togglePlay));
document.querySelectorAll(".fs-next").forEach(b => b.addEventListener("click", nextTrack));
document.querySelectorAll(".fs-prev").forEach(b => b.addEventListener("click", prevTrack));

function setPlayIcons(playing) {
  const icon = `<i data-lucide="${playing ? "pause" : "play"}"></i>`;
  document.getElementById("playPauseBtn").innerHTML = icon;
  document.querySelectorAll(".fs-play").forEach(b => b.innerHTML = icon);
  lucide.createIcons();
}
audio.addEventListener("play", () => setPlayIcons(true));
audio.addEventListener("pause", () => setPlayIcons(false));
audio.addEventListener("ended", nextTrack);

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  document.getElementById("progressFill").style.width = `${pct}%`;
  document.getElementById("fsFill1").style.width = `${pct}%`;
  document.getElementById("fsFill2").style.width = `${pct}%`;
  document.getElementById("timeDisplay").textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  ["fsCur1", "fsCur2"].forEach(id => document.getElementById(id).textContent = fmt(audio.currentTime));
  ["fsDur1", "fsDur2"].forEach(id => document.getElementById(id).textContent = fmt(audio.duration));
  updateActiveLyric(audio.currentTime);

  // Smooth Crossfade fade-in / fade-out
  if (state.crossfade > 0 && !audio.muted) {
    const rem = audio.duration - audio.currentTime;
    if (audio.currentTime < state.crossfade) {
      audio.volume = Math.min(state.userVolume, (audio.currentTime / state.crossfade) * state.userVolume);
    } else if (rem < state.crossfade) {
      audio.volume = Math.max(0.05, (rem / state.crossfade) * state.userVolume);
    } else {
      audio.volume = state.userVolume;
    }
  }
});

["progressTrack", "fsProgress1", "fsProgress2"].forEach(id => {
  document.getElementById(id).addEventListener("click", (e) => {
    if (!audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });
});
document.getElementById("fsVolume").addEventListener("input", (e) => {
  state.userVolume = parseFloat(e.target.value);
  audio.volume = state.userVolume;
});
function fmt(s) { return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`; }

// Fullscreen Toggle & Mode Switch
const fsOverlay = document.getElementById("fullscreenOverlay");
function enterTrueFullscreen() {
  fsOverlay.classList.remove("hidden");
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
function exitTrueFullscreen() {
  fsOverlay.classList.add("hidden");
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}
function toggleTrueFullscreen() {
  fsOverlay.classList.contains("hidden") ? enterTrueFullscreen() : exitTrueFullscreen();
}
document.getElementById("fullscreenBtn").addEventListener("click", enterTrueFullscreen);
document.getElementById("fsCloseBtn").addEventListener("click", exitTrueFullscreen);
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) fsOverlay.classList.add("hidden");
});
function setFsMode(mode) {
  state.fsMode = mode;
  document.querySelectorAll(".fs-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.fsmode === mode));
  document.getElementById("fsLyricsMode").classList.toggle("hidden", mode !== "lyrics");
  document.getElementById("fsFocusMode").classList.toggle("hidden", mode !== "focus");
}
document.querySelectorAll(".fs-mode-btn").forEach(btn => btn.addEventListener("click", () => setFsMode(btn.dataset.fsmode)));

// Downloads, Favorites, Queue, Search
async function downloadTrack(track, btnEl) {
  if (btnEl) btnEl.style.opacity = "0.4";
  const params = new URLSearchParams({ title: track.title, artist: track.artist, album: track.album || "", duration: track.duration || 0, thumbnail: track.thumbnail || "" });
  try {
    const res = await fetch(`/api/download/${encodeURIComponent(track.id)}?${params}`, { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    if (btnEl) {
      btnEl.style.opacity = "1"; btnEl.classList.add("done");
      btnEl.innerHTML = `<i data-lucide="check" style="width:15px;height:15px"></i>`;
      lucide.createIcons();
    }
    // Also trigger browser download so it saves to Windows Downloads
    const a = document.createElement("a");
    a.href = `/api/download-file/${encodeURIComponent(track.id)}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    if (btnEl) btnEl.style.opacity = "1";
    alert("Download failed: " + err.message);
  }
}
document.getElementById("barDownloadBtn").addEventListener("click", () => { if (state.currentTrack) downloadTrack(state.currentTrack, document.getElementById("barDownloadBtn")); });
async function loadDownloads() {
  const res = await fetch("/api/downloads");
  const data = await res.json();
  const container = document.getElementById("downloadsList");
  const tracks = data.downloads.map(d => ({ ...d, downloaded: true }));
  container.innerHTML = "";
  if (!tracks.length) { container.innerHTML = `<p class="muted">No downloaded tracks yet.</p>`; return; }
  tracks.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.innerHTML = `
      <img src="${t.thumbnail}" alt="" />
      <div class="row-meta"><div class="row-title">${t.title}</div><div class="row-artist">${t.artist}</div></div>
      <div class="row-actions">
        <button class="icon-btn del-dl-btn" data-tip="Delete Offline File" style="color:#f87171"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    row.addEventListener("click", (e) => { if (!e.target.closest(".del-dl-btn")) playFromList(tracks, idx); });
    row.querySelector(".del-dl-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(`/api/downloads/${encodeURIComponent(t.id)}`, { method: "DELETE" });
      loadDownloads();
    });
    container.appendChild(row);
  });
  lucide.createIcons();
}
document.getElementById("shuffleDownloadsBtn").addEventListener("click", async () => {
  const res = await fetch("/api/downloads");
  const data = await res.json();
  if (data.downloads.length) playFromList(data.downloads.sort(() => Math.random() - 0.5), 0);
});
async function loadLibrary() {
  const res = await fetch("/api/favorites");
  const data = await res.json();
  state.favorites = new Set(data.favorites.map(f => f.id));
  renderTrackList(document.getElementById("libraryList"), data.favorites);
  updateFavIcon();
}
function updateFavIcon() {
  const active = state.currentTrack && state.favorites.has(state.currentTrack.id);
  document.querySelectorAll(".fav-btn").forEach(b => b.classList.toggle("active", !!active));
}
async function toggleFavorite() {
  if (!state.currentTrack) return;
  const res = await fetch("/api/favorites/toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.currentTrack) });
  const data = await res.json();
  data.favorited ? state.favorites.add(state.currentTrack.id) : state.favorites.delete(state.currentTrack.id);
  updateFavIcon();
}
document.querySelectorAll(".fav-btn").forEach(b => b.addEventListener("click", toggleFavorite));

document.getElementById("queueToggleBtn").addEventListener("click", () => document.getElementById("queueDrawer").classList.toggle("hidden"));
document.getElementById("closeQueueBtn").addEventListener("click", () => document.getElementById("queueDrawer").classList.add("hidden"));
function renderQueue() { renderTrackList(document.getElementById("queueList"), state.queue); }

let searchTimer;
async function doSearch(q, container, source = "ytm") {
  if (!q.trim()) { container.innerHTML = ""; return; }
  container.innerHTML = `<p class="muted" style="padding:12px">Searching "${q}"...</p>`;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&source=${source}&limit=15`);
    const data = await res.json();
    renderTrackList(container, data.results || []);
  } catch (err) { container.innerHTML = `<p class="muted" style="padding:12px">Search failed: ${err.message}</p>`; }
}
const searchInput = document.getElementById("searchInput");
const sourceSelect = document.getElementById("sourceSelect");
searchInput.addEventListener("input", (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(e.target.value, document.getElementById("searchResults"), sourceSelect.value), 350); });
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(searchTimer); doSearch(searchInput.value, document.getElementById("searchResults"), sourceSelect.value); } });
sourceSelect.addEventListener("change", () => { if (searchInput.value.trim()) doSearch(searchInput.value, document.getElementById("searchResults"), sourceSelect.value); });

const cmdModal = document.getElementById("cmdModal");
const cmdInput = document.getElementById("cmdInput");
document.getElementById("openSearchBtn").addEventListener("click", () => { cmdModal.classList.remove("hidden"); cmdInput.focus(); });
cmdModal.addEventListener("click", (e) => { if (e.target === cmdModal) cmdModal.classList.add("hidden"); });
cmdInput.addEventListener("input", (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(e.target.value, document.getElementById("cmdResults"), "ytm"), 300); });
cmdInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(searchTimer); doSearch(cmdInput.value, document.getElementById("cmdResults"), "ytm"); } });

// Global Keyboard Shortcuts
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault(); cmdModal.classList.toggle("hidden"); if (!cmdModal.classList.contains("hidden")) cmdInput.focus(); return;
  }
  if (e.key === "Escape") { cmdModal.classList.add("hidden"); exitTrueFullscreen(); return; }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); togglePlay(); }
  else if (e.key === "ArrowRight") { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); }
  else if (e.key === "ArrowLeft") { audio.currentTime = Math.max(0, audio.currentTime - 5); }
  else if (k === "f") { toggleTrueFullscreen(); }
  else if (k === "l") { fsOverlay.classList.remove("hidden"); setFsMode(state.fsMode === "lyrics" ? "focus" : "lyrics"); }
  else if (k === "m") { audio.muted = !audio.muted; }
  else if (k === "r") { cycleRepeat(); }
  else if (k === "s") { toggleShuffle(); }
  else if (k === "p") { togglePiP(); }
});

// Init
lucide.createIcons();
initTheme();
loadLibrary();
loadHome(state.lang);


// Auto-upgrade all button titles into instant custom tooltips
function initTooltips() {
  const defaultTips = {
    openSearchBtn: "Quick Search (Ctrl+K)",
    queueToggleBtn: "Toggle Up Next Queue",
    closeQueueBtn: "Close Queue",
    fullscreenBtn: "Enter Fullscreen (F)",
    fsCloseBtn: "Exit Fullscreen (Esc)",
    barDownloadBtn: "Download Track",
    favBtn: "Add / Remove Liked Songs",
  };
  Object.entries(defaultTips).forEach(([id, tip]) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.tip) el.setAttribute("data-tip", tip);
  });
  document.querySelectorAll("button[title]").forEach(btn => {
    btn.setAttribute("data-tip", btn.getAttribute("title"));
    btn.removeAttribute("title");
  });
}
initTooltips();


// --- PART 1: PLAY NEXT, QUEUE REORDER, PLAYLISTS & STATS ---
function playNext(track) {
  if (!state.queue.length || state.currentIndex < 0) {
    playFromList([track], 0);
    return;
  }
  state.queue.splice(state.currentIndex + 1, 0, track);
  renderQueue();
}

function addToQueue(track) {
  if (!state.queue.length) {
    playFromList([track], 0);
    return;
  }
  state.queue.push(track);
  renderQueue();
}

function renderQueue() {
  const container = document.getElementById("queueList");
  container.innerHTML = "";
  if (!state.queue.length) { container.innerHTML = `<p class="muted">Queue is empty.</p>`; return; }
  state.queue.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "track-row";
    if (idx === state.currentIndex) row.style.borderColor = "var(--accent)";
    row.innerHTML = `
      <img src="${t.thumbnail || ""}" alt="" />
      <div class="row-meta"><div class="row-title">${t.title}</div><div class="row-artist">${t.artist}</div></div>
      <div class="row-actions">
        <button class="icon-btn q-up" data-tip="Move Up"><i data-lucide="chevron-up" style="width:15px;height:15px"></i></button>
        <button class="icon-btn q-rm" data-tip="Remove"><i data-lucide="x" style="width:15px;height:15px"></i></button>
      </div>
    `;
    row.addEventListener("click", (e) => {
      if (e.target.closest(".row-actions")) return;
      state.currentIndex = idx;
      playTrack(state.queue[idx]);
      renderQueue();
    });
    row.querySelector(".q-up").addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx <= 0) return;
      [state.queue[idx - 1], state.queue[idx]] = [state.queue[idx], state.queue[idx - 1]];
      if (state.currentIndex === idx) state.currentIndex--;
      else if (state.currentIndex === idx - 1) state.currentIndex++;
      renderQueue();
    });
    row.querySelector(".q-rm").addEventListener("click", (e) => {
      e.stopPropagation();
      state.queue.splice(idx, 1);
      if (idx < state.currentIndex) state.currentIndex--;
      renderQueue();
    });
    container.appendChild(row);
  });
  lucide.createIcons();
}

// Library Sub-tabs
let activePlaylistId = null;
let pendingTrackForPl = null;

document.querySelectorAll("#libSubTabs .pill").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.libtab;
    document.querySelectorAll("#libSubTabs .pill").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".lib-pane").forEach(pane => pane.classList.toggle("hidden", pane.id !== `lib-${tab}`));
    document.getElementById("newPlaylistBtn").classList.toggle("hidden", tab !== "playlists");
    if (tab === "playlists") loadPlaylists();
    if (tab === "stats") loadStats();
  });
});

document.getElementById("newPlaylistBtn").addEventListener("click", async () => {
  const name = prompt("Enter playlist name:");
  if (!name || !name.trim()) return;
  await fetch("/api/playlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
  loadPlaylists();
});

async function loadPlaylists() {
  const res = await fetch("/api/playlists");
  const data = await res.json();
  const grid = document.getElementById("playlistsGrid");
  grid.innerHTML = "";
  if (!data.playlists.length) {
    grid.innerHTML = `<p class="muted">No playlists yet. Click "+ New Playlist" to create one.</p>`;
    document.getElementById("activePlaylistView").classList.add("hidden");
    return;
  }
  data.playlists.forEach(pl => {
    const card = document.createElement("div");
    card.className = `preset-card ${activePlaylistId === pl.id ? "active" : ""}`;
    card.style.background = "linear-gradient(in oklch 135deg, #24192b 0%, #101014 100%)";
    card.innerHTML = `<div class="preset-name">${pl.name}</div><div class="preset-desc">${pl.count} tracks</div>`;
    card.addEventListener("click", () => openPlaylistView(pl));
    grid.appendChild(card);
  });
}

function openPlaylistView(pl) {
  activePlaylistId = pl.id;
  document.getElementById("activePlaylistView").classList.remove("hidden");
  document.getElementById("activePlaylistTitle").textContent = pl.name;
  renderTrackList(document.getElementById("activePlaylistTracks"), pl.tracks);
  document.getElementById("playPlaylistBtn").onclick = () => { if (pl.tracks.length) playFromList(pl.tracks, 0); };
  document.getElementById("deletePlaylistBtn").onclick = async () => {
    await fetch(`/api/playlists/${pl.id}`, { method: "DELETE" });
    activePlaylistId = null;
    document.getElementById("activePlaylistView").classList.add("hidden");
    loadPlaylists();
  };
}

// Add to Playlist Modal
const plModal = document.getElementById("playlistModal");
document.getElementById("closePlModalBtn").addEventListener("click", () => plModal.classList.add("hidden"));
plModal.addEventListener("click", (e) => { if (e.target === plModal) plModal.classList.add("hidden"); });

async function openPlaylistModal(track) {
  pendingTrackForPl = track;
  plModal.classList.remove("hidden");
  const res = await fetch("/api/playlists");
  const data = await res.json();
  const list = document.getElementById("plModalList");
  list.innerHTML = "";
  (data.playlists || []).forEach(pl => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.innerHTML = `<div class="row-meta"><div class="row-title">${pl.name}</div><div class="row-artist">${pl.count} tracks</div></div>`;
    row.addEventListener("click", async () => {
      await fetch(`/api/playlists/${pl.id}/tracks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pendingTrackForPl) });
      plModal.classList.add("hidden");
    });
    list.appendChild(row);
  });
}

document.getElementById("quickPlCreateBtn").addEventListener("click", async () => {
  const input = document.getElementById("quickPlName");
  if (!input.value.trim()) return;
  const res = await fetch("/api/playlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: input.value.trim() }) });
  const pl = await res.json();
  if (pendingTrackForPl) {
    await fetch(`/api/playlists/${pl.id}/tracks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pendingTrackForPl) });
  }
  input.value = "";
  plModal.classList.add("hidden");
});

// Listening Stats
async function loadStats() {
  const res = await fetch("/api/stats");
  const data = await res.json();
  document.getElementById("statsSummary").innerHTML = `
    <div class="stat-box"><div class="stat-num">${data.total_plays}</div><div class="stat-label">Total Plays</div></div>
    <div class="stat-box"><div class="stat-num">${data.unique_tracks}</div><div class="stat-label">Unique Tracks</div></div>
  `;
  renderTrackList(document.getElementById("statsTopTracks"), data.top_tracks);
  document.getElementById("statsTopArtists").innerHTML = (data.top_artists || [])
    .map(a => `<span class="pill active">${a.artist} (${a.plays})</span>`).join("");
}


// --- PART 2: EQ, SLOWED+REVERB & SLEEP TIMER ---
document.querySelectorAll("#eqPresets .pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#eqPresets .pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    applyEQValues(EQ_PRESETS[btn.dataset.eq] || EQ_PRESETS.flat);
  });
});

document.querySelectorAll(".eq-slider").forEach(slider => {
  slider.addEventListener("input", () => {
    document.querySelectorAll("#eqPresets .pill").forEach(b => b.classList.remove("active"));
    const vals = Array.from(document.querySelectorAll(".eq-slider")).map(s => parseFloat(s.value));
    applyEQValues(vals);
  });
});
applyEQValues(getSavedEQ());

document.getElementById("slowedReverbToggle")?.addEventListener("change", (e) => {
  setSlowedReverb(e.target.checked);
});

// Sleep Timer
let sleepTimerInterval = null;
let sleepAtTrackEnd = false;
const sleepSelect = document.getElementById("sleepTimerSelect");
const sleepCountdown = document.getElementById("sleepCountdown");

sleepSelect?.addEventListener("change", () => {
  clearInterval(sleepTimerInterval);
  sleepAtTrackEnd = false;
  sleepCountdown.textContent = "";
  const val = sleepSelect.value;
  if (val === "0") return;
  if (val === "track") {
    sleepAtTrackEnd = true;
    sleepCountdown.textContent = "(Pauses after track)";
    return;
  }
  let remaining = parseInt(val, 10) * 60;
  sleepTimerInterval = setInterval(() => {
    remaining--;
    const m = Math.floor(remaining / 60);
    const s = (remaining % 60).toString().padStart(2, "0");
    sleepCountdown.textContent = `(${m}:${s})`;
    if (remaining <= 5 && remaining > 0) {
      audio.volume = Math.max(0.05, (remaining / 5) * state.userVolume);
    }
    if (remaining <= 0) {
      clearInterval(sleepTimerInterval);
      audio.pause();
      audio.volume = state.userVolume;
      sleepSelect.value = "0";
      sleepCountdown.textContent = "";
    }
  }, 1000);
});

audio.addEventListener("ended", () => {
  if (sleepAtTrackEnd) {
    sleepAtTrackEnd = false;
    audio.pause();
    if (sleepSelect) sleepSelect.value = "0";
    if (sleepCountdown) sleepCountdown.textContent = "";
  }
});


// --- PART 3: LOCAL FOLDER SCANNER ---
document.getElementById("scanLocalBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("scanLocalBtn");
  const pathVal = document.getElementById("localScanPath").value.trim() || "~/Music";
  btn.textContent = "Scanning...";
  try {
    const res = await fetch("/api/scan-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathVal }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Scan failed");
    btn.textContent = `Indexed ${data.files_indexed}`;
    loadDownloads();
    setTimeout(() => { btn.textContent = "Scan Folder"; }, 2500);
  } catch (err) {
    btn.textContent = "Scan Folder";
    alert("Scan error: " + err.message);
  }
});

// --- PART 4: DOCUMENT PICTURE-IN-PICTURE MINI PLAYER ---
let pipWindow = null;
let pipMode = "art";
let pipLastLyricIdx = -1;

const PIP_ICONS = {
  play: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`,
  pause: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  prev: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>`,
  next: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
  lyrics: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`,
  art: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  heart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
};

async function togglePiP() {
  if (!("documentPictureInPicture" in window)) {
    alert("Mini Player (Document PiP) requires Edge, Chrome, or Brave.");
    return;
  }
  if (pipWindow && !pipWindow.closed) { pipWindow.close(); return; }

  pipWindow = await window.documentPictureInPicture.requestWindow({ width: 310, height: 420 });
  document.getElementById("pipBtn")?.classList.add("active");

  const doc = pipWindow.document;
  doc.title = "Velvet Mini";

  const fontLink = doc.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap";
  doc.head.appendChild(fontLink);

  const style = doc.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    body {
      height: 100vh; overflow: hidden; color: #fff;
      font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', sans-serif;
      background: var(--fs-bg, radial-gradient(circle at 25% 25%, #3d161b 0%, #12080a 55%, #050505 100%));
      display: flex; flex-direction: column; padding: 16px; transition: background 0.5s ease;
    }
    .hidden { display: none !important; }
    .pip-art-view { flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; min-height: 0; }
    .art-wrap { width: 100%; aspect-ratio: 1; max-height: 225px; margin: 0 auto; border-radius: 14px; overflow: hidden; background: rgba(255,255,255,0.06); box-shadow: 0 16px 36px rgba(0,0,0,0.6); }
    .art-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .meta { text-align: center; min-width: 0; }
    .title { font-size: 0.98rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .artist { font-size: 0.78rem; color: rgba(255,255,255,0.68); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pip-lyrics-view { flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 10px; }
    .lyrics-header { display: flex; align-items: center; gap: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .lyrics-header img { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; }
    .lyrics-header .meta { text-align: left; flex: 1; }
    .lyrics-scroll { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 28% 4px; scrollbar-width: none; }
    .lyrics-scroll::-webkit-scrollbar { display: none; }
    .p-lyric { font-size: 1.05rem; font-weight: 700; line-height: 1.4; color: rgba(255,255,255,0.3); cursor: pointer; transition: color 0.2s, transform 0.2s; transform-origin: left center; }
    .p-lyric:hover { color: rgba(255,255,255,0.65); }
    .p-lyric.active { color: #fff; transform: scale(1.03); }
    .scrubber { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
    .bar { height: 4px; background: rgba(255,255,255,0.2); border-radius: 99px; cursor: pointer; overflow: hidden; }
    .fill { height: 100%; width: 0%; background: #fff; border-radius: 99px; }
    .times { display: flex; justify-content: space-between; font-size: 0.68rem; color: rgba(255,255,255,0.6); font-variant-numeric: tabular-nums; }
    .controls { display: flex; align-items: center; justify-content: space-between; padding: 6px 4px 0; }
    .btn { background: transparent; border: none; color: rgba(255,255,255,0.8); cursor: pointer; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: 0.15s; }
    .btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
    .btn.active { color: #ff5722; }
    .btn.mode-on { color: #4ade80; background: rgba(74,222,128,0.12); }
    .play-btn { width: 42px; height: 42px; border-radius: 50%; background: #fff; color: #000; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .play-btn:hover { transform: scale(1.05); }
  `;
  doc.head.appendChild(style);

  doc.body.innerHTML = `
    <div id="pipArtView" class="pip-art-view">
      <div class="art-wrap"><img id="pipArt" src="" alt="" /></div>
      <div class="meta">
        <div id="pipTitle" class="title">No track playing</div>
        <div id="pipArtist" class="artist">Velvet</div>
      </div>
    </div>
    <div id="pipLyricsView" class="pip-lyrics-view hidden">
      <div class="lyrics-header">
        <img id="pipMiniArt" src="" alt="" />
        <div class="meta">
          <div id="pipMiniTitle" class="title">No track playing</div>
          <div id="pipMiniArtist" class="artist">Velvet</div>
        </div>
      </div>
      <div id="pipLyricsBox" class="lyrics-scroll"></div>
    </div>
    <div class="scrubber">
      <div id="pipBar" class="bar"><div id="pipFill" class="fill"></div></div>
      <div class="times"><span id="pipCur">0:00</span><span id="pipDur">0:00</span></div>
    </div>
    <div class="controls">
      <button id="pipFav" class="btn" title="Like">${PIP_ICONS.heart}</button>
      <button id="pipPrev" class="btn" title="Previous">${PIP_ICONS.prev}</button>
      <button id="pipPlay" class="play-btn" title="Play/Pause">${PIP_ICONS.play}</button>
      <button id="pipNext" class="btn" title="Next">${PIP_ICONS.next}</button>
      <button id="pipModeBtn" class="btn" title="Toggle Lyrics">${PIP_ICONS.lyrics}</button>
    </div>
  `;

  doc.getElementById("pipPlay").addEventListener("click", togglePlay);
  doc.getElementById("pipPrev").addEventListener("click", prevTrack);
  doc.getElementById("pipNext").addEventListener("click", nextTrack);
  doc.getElementById("pipFav").addEventListener("click", async () => { await toggleFavorite(); syncPipFav(); });
  doc.getElementById("pipModeBtn").addEventListener("click", () => { pipMode = pipMode === "art" ? "lyrics" : "art"; applyPipMode(); });
  doc.getElementById("pipBar").addEventListener("click", (e) => {
    if (!audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  pipWindow.addEventListener("pagehide", () => {
    pipWindow = null;
    document.getElementById("pipBtn")?.classList.remove("active");
  });

  syncPipTheme(getComputedStyle(document.documentElement).getPropertyValue("--fs-bg"));
  syncPipTrack(); syncPipLyrics(); syncPipPlay(); syncPipFav(); applyPipMode();
}

function applyPipMode() {
  if (!pipWindow || pipWindow.closed) return;
  const doc = pipWindow.document, isLyrics = pipMode === "lyrics";
  doc.getElementById("pipArtView").classList.toggle("hidden", isLyrics);
  doc.getElementById("pipLyricsView").classList.toggle("hidden", !isLyrics);
  const btn = doc.getElementById("pipModeBtn");
  btn.innerHTML = isLyrics ? PIP_ICONS.art : PIP_ICONS.lyrics;
  btn.classList.toggle("mode-on", isLyrics);
}
function syncPipTheme(css) { if (pipWindow && !pipWindow.closed) pipWindow.document.documentElement.style.setProperty("--fs-bg", css); }
function syncPipTrack() {
  if (!pipWindow || pipWindow.closed || !state.currentTrack) return;
  const doc = pipWindow.document, t = state.currentTrack;
  ["pipArt", "pipMiniArt"].forEach(id => doc.getElementById(id).src = t.thumbnail || "");
  ["pipTitle", "pipMiniTitle"].forEach(id => doc.getElementById(id).textContent = t.title);
  ["pipArtist", "pipMiniArtist"].forEach(id => doc.getElementById(id).textContent = t.artist);
  syncPipFav();
}
function syncPipLyrics() {
  if (!pipWindow || pipWindow.closed) return;
  const box = pipWindow.document.getElementById("pipLyricsBox");
  box.innerHTML = ""; pipLastLyricIdx = -1;
  if (state.lyrics.length) {
    state.lyrics.forEach(line => {
      const p = pipWindow.document.createElement("p");
      p.className = "p-lyric"; p.textContent = line.text;
      p.addEventListener("click", () => { audio.currentTime = line.time; });
      box.appendChild(p);
    });
  } else {
    (document.getElementById("lyricsContainer")?.innerText || "No lyrics found.").split("\n").forEach(l => {
      const p = pipWindow.document.createElement("p");
      p.className = "p-lyric active"; p.style.fontSize = "0.92rem"; p.textContent = l;
      box.appendChild(p);
    });
  }
}
function syncPipPlay() { if (pipWindow && !pipWindow.closed) pipWindow.document.getElementById("pipPlay").innerHTML = audio.paused ? PIP_ICONS.play : PIP_ICONS.pause; }
function syncPipFav() { if (pipWindow && !pipWindow.closed) pipWindow.document.getElementById("pipFav").classList.toggle("active", !!(state.currentTrack && state.favorites.has(state.currentTrack.id))); }

document.getElementById("pipBtn")?.addEventListener("click", togglePiP);
audio.addEventListener("play", syncPipPlay);
audio.addEventListener("pause", syncPipPlay);
audio.addEventListener("timeupdate", () => {
  if (!pipWindow || pipWindow.closed || !audio.duration) return;
  const doc = pipWindow.document;
  doc.getElementById("pipFill").style.width = `${(audio.currentTime / audio.duration) * 100}%`;
  doc.getElementById("pipCur").textContent = fmt(audio.currentTime);
  doc.getElementById("pipDur").textContent = fmt(audio.duration);
  if (state.lyrics.length && state.activeLyricIdx !== pipLastLyricIdx) {
    pipLastLyricIdx = state.activeLyricIdx;
    const nodes = doc.querySelectorAll("#pipLyricsBox .p-lyric");
    nodes.forEach((n, i) => n.classList.toggle("active", i === pipLastLyricIdx));
    if (pipLastLyricIdx >= 0 && nodes[pipLastLyricIdx]) nodes[pipLastLyricIdx].scrollIntoView({ behavior: "smooth", block: "center" });
  }
});