/* ==========================================================
   Sixty North — app.js
   Timer engine: wall-clock based (Date.now), ticked by a Web
   Worker (not throttled in background tabs) plus a main-thread
   backup. The alarm is pre-scheduled with Web Audio so it sounds
   on time even when the tab is minimized.
   ========================================================== */
(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const mmss = (ms) => { const t = Math.ceil(ms / 1000); const m = Math.floor(t / 60), s = t % 60; if (m < 100) return `${pad(m)}:${pad(s)}`; return `${Math.floor(t / 3600)}:${pad(Math.floor((t % 3600) / 60))}:${pad(s)}`; };
  const hm = (secs) => { const m = Math.round(secs / 60); const h = Math.floor(m / 60); return h ? `${h}h ${pad(m % 60)}m` : `${m}m`; };
  const vt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`; };
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const clock12 = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const KEY = 'sixtyNorth.v1';
  const SOUND_URL = 'assets/audio/anthem-instrumental.mp3';
  const IMG = 'assets/img/provinces/';
  const VIDEO_ID = 'uLEXFZJZUuQ';
  const HADFIELD_ID = 'eGrzo4IvXyg';
  const GOAL_HOURS = 30;
  const DEFAULTS = { focus: 60, short: 10, long: 40, longEvery: 4, autoBreaks: false, autoFocus: false, volume: 70, alarmSecs: 30, notify: false, wake: false, dailyGoal: 4 };
  const LIMITS = { focus: [1, 240], short: [1, 120], long: [1, 180], longEvery: [1, 12], dailyGoal: [0.5, 16] };
  const MODE_NAME = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  const MODE_COLOR = { focus: '#B7372F', short: '#1F7A7C', long: '#27365F' };

  const P = window.PROVINCES || {};
  const ABBR = {}; Object.entries(P).forEach(([slug, p]) => { ABBR[p.abbr] = slug; });

  /* ---------- the trip: video stops ---------- */
  const STOPS = [
    { h: 0, name: 'Intro', start: 0, end: 42 },
    { h: 0, name: 'About Canada', start: 42, end: 488 },
    { h: 1, name: 'Banff National Park', p: 'AB', start: 488, end: 659, img: 'alberta/moraine-lake' },
    { h: 2, name: 'Vancouver', p: 'BC', start: 659, end: 850, img: 'british-columbia/vancouver-skyline' },
    { h: 3, name: 'Niagara Falls', p: 'ON', start: 850, end: 982, img: 'ontario/niagara-falls-aerial' },
    { h: 4, name: 'Quebec City', p: 'QC', start: 982, end: 1121, img: 'quebec/chateau-frontenac' },
    { h: 5, name: 'Toronto', p: 'ON', start: 1121, end: 1258, img: 'ontario/toronto-skyline' },
    { h: 6, name: 'Jasper National Park', p: 'AB', start: 1258, end: 1384 },
    { h: 7, name: 'Gros Morne National Park', p: 'NL', start: 1384, end: 1487, img: 'newfoundland-and-labrador/western-brook-pond' },
    { h: 8, name: 'Montreal', p: 'QC', start: 1487, end: 1625, img: 'quebec/old-montreal' },
    { h: 9, name: 'Tofino', p: 'BC', start: 1625, end: 1756 },
    { h: 10, name: 'Ottawa', p: 'ON', start: 1756, end: 1915 },
    { h: 11, name: 'Whistler', p: 'BC', start: 1915, end: 2050, img: 'british-columbia/whistler-high-note-trail' },
    { h: 12, name: 'Prince Edward Island', p: 'PE', start: 2050, end: 2179, img: 'prince-edward-island/keppoch-beach' },
    { h: 13, name: 'Abraham Lake', p: 'AB', start: 2179, end: 2307 },
    { h: 14, name: 'Halifax', p: 'NS', start: 2307, end: 2406, img: 'nova-scotia/halifax-harbour-sunset' },
    { h: 15, name: 'Yoho National Park', p: 'BC', start: 2406, end: 2540 },
    { h: 16, name: "St. John's", p: 'NL', start: 2540, end: 2627, img: 'newfoundland-and-labrador/st-johns-downtown' },
    { h: 17, name: 'Okanagan Valley', p: 'BC', start: 2627, end: 2757 },
    { h: 18, name: 'Rideau Canal', p: 'ON', start: 2757, end: 2876 },
    { h: 19, name: 'Athabasca River and Falls', p: 'AB', start: 2876, end: 2997 },
    { h: 20, name: 'Algonquin Provincial Park', p: 'ON', start: 2997, end: 3127 },
    { h: 21, name: 'Calgary', p: 'AB', start: 3127, end: 3264, img: 'alberta/calgary-stampede' },
    { h: 22, name: 'Charlevoix', p: 'QC', start: 3264, end: 3393, img: 'quebec/baie-saint-paul' },
    { h: 23, name: 'Alberta Badlands', p: 'AB', start: 3393, end: 3512 },
    { h: 24, name: 'Edmonton', p: 'AB', start: 3512, end: 3641, img: 'alberta/edmonton-conservatory' },
    { h: 25, name: 'Mont-Tremblant', p: 'QC', start: 3641, end: 3761 },
    { h: 26, name: 'Kelowna', p: 'BC', start: 3761, end: 3877 },
    { h: 27, name: 'Shannon Falls', p: 'BC', start: 3877, end: 4002 },
    { h: 28, name: 'Revelstoke', p: 'BC', start: 4002, end: 4126 },
    { h: 29, name: 'Nova Scotia', p: 'NS', start: 4126, end: 4271, img: 'nova-scotia/peggys-cove-lighthouse' },
    { h: 30, name: 'Outro', start: 4271, end: null },
    { h: 30, name: 'Chris Hadfield on how you can achieve your goals', vid: HADFIELD_ID, start: 0, end: null, grand: true },
  ];
  STOPS.forEach((s, i) => { s.i = i; });

  const FOCUS_TIPS = [
    'Paddle steady. Small strokes cross big lakes.',
    'One task, one hour. You can do this.',
    'Phone face down, eh? Your future self says thanks.',
    'Slow and steady, like a canoe on a calm lake.',
    'Every minute you focus is a step north.',
    'Big mountains are climbed one switchback at a time.',
    'Stay with it. The view from the top is worth it.',
    'Quiet mind, strong work. Like a loon on still water.',
  ];
  const BREAK_TIPS = [
    'Stand up and stretch like a moose waking up.',
    'Drink a glass of water. Canada has more lakes than any other country.',
    'Look out a window for 20 seconds. Rest those eyes.',
    'Did you know? Canada has the longest coastline in the world.',
    'Take three slow breaths. In through the nose, out through the mouth.',
    'Did you know? The Bay of Fundy has the highest tides on Earth.',
    'Walk around for a minute. Your brain likes it.',
    'Did you know? Canada\u2019s motto means \u201cfrom sea to sea.\u201d',
    'Did you know? Wood Buffalo National Park is bigger than Switzerland.',
    'Grab a healthy snack. Maybe something with maple syrup?',
  ];

  /* ---------- state ---------- */
  function newTimer(mode, st) { const ms = st[mode] * 60000; return { mode, status: 'idle', endsAt: null, remainingMs: ms, phaseMs: ms, sessionStart: null, sinceLong: 0 }; }
  function fresh() { return { v: 1, settings: { ...DEFAULTS }, tasks: [], activeTask: null, sessions: [], celebrated: 0, timer: newTimer('focus', DEFAULTS) }; }
  function normalize(r) {
    const s = fresh();
    if (!r || r.v !== 1) return s;
    s.settings = { ...DEFAULTS, ...(r.settings || {}) };
    s.tasks = Array.isArray(r.tasks) ? r.tasks : [];
    s.activeTask = r.activeTask ?? null;
    s.sessions = Array.isArray(r.sessions) ? r.sessions.filter((x) => x && x.secs > 0 && x.end) : [];
    s.celebrated = +r.celebrated || 0;
    s.timer = r.timer && r.timer.mode ? { ...newTimer(r.timer.mode, s.settings), ...r.timer } : newTimer('focus', s.settings);
    return s;
  }
  function load() { try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return fresh(); } }
  let S = load();
  let storageWarned = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { if (!storageWarned) { storageWarned = true; toast('Your browser is blocking storage, so progress may not be saved.'); } }
  }
  const T = () => S.timer;
  const totalSecs = () => S.sessions.reduce((a, s) => a + s.secs, 0);
  const hoursDone = () => Math.floor(totalSecs() / 3600);
  const activeTask = () => S.tasks.find((t) => t.id === S.activeTask) || null;

  /* ==========================================================
     AUDIO — Web Audio scheduling with <audio> fallback
     ========================================================== */
  const A = { ctx: null, buf: null, loading: false, sched: null, playing: null, el: null, elTimer: 0 };
  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!A.ctx && AC) A.ctx = new AC();
      if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
      if (A.ctx && !A.buf && !A.loading) {
        A.loading = true;
        fetch(SOUND_URL).then((r) => { if (!r.ok) throw new Error('sound'); return r.arrayBuffer(); })
          .then((ab) => new Promise((res, rej) => A.ctx.decodeAudioData(ab, res, rej)))
          .then((b) => { A.buf = b; if (T().status === 'running') scheduleAlarm(); })
          .catch(() => { A.loading = false; });
      }
    } catch (e) { /* ignore */ }
    if (!A.el) { A.el = new Audio(SOUND_URL); A.el.preload = 'auto'; }
  }
  function alarmDur() { const full = A.buf ? A.buf.duration : 79; const s = +S.settings.alarmSecs; return s > 0 ? Math.min(s, full) : full; }
  function makeNode(at) {
    const src = A.ctx.createBufferSource(); src.buffer = A.buf;
    const g = A.ctx.createGain(); const vol = clamp(S.settings.volume / 100, 0, 1); const dur = alarmDur();
    g.gain.setValueAtTime(vol, at);
    g.gain.setValueAtTime(vol, at + Math.max(0, dur - 1.5));
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    src.connect(g); g.connect(A.ctx.destination);
    src.start(at, 0, dur + 0.05);
    const node = { src, at, dur };
    src.onended = () => { if (A.playing === node) { A.playing = null; renderStopSound(); } };
    return node;
  }
  function scheduleAlarm() {
    cancelAlarm();
    const t = T();
    if (t.status !== 'running' || !A.ctx || !A.buf) return;
    if (A.ctx.state !== 'running') A.ctx.resume();
    const delay = (t.endsAt - Date.now()) / 1000;
    if (delay < 0.3) return;
    const node = makeNode(A.ctx.currentTime + delay);
    node.wallAt = t.endsAt;
    A.sched = node;
  }
  function cancelAlarm() { if (A.sched) { try { A.sched.src.onended = null; A.sched.src.stop(); } catch (e) {} A.sched = null; } }
  function playAlarmNow() {
    stopAlarm();
    if (A.ctx && A.buf) {
      if (A.ctx.state !== 'running') A.ctx.resume();
      A.playing = makeNode(A.ctx.currentTime + 0.05);
    } else {
      if (!A.el) A.el = new Audio(SOUND_URL);
      try {
        A.el.currentTime = 0; A.el.volume = clamp(S.settings.volume / 100, 0, 1);
        const pr = A.el.play(); if (pr && pr.catch) pr.catch(() => {});
        A.playing = { el: true };
        clearTimeout(A.elTimer);
        const d = +S.settings.alarmSecs; if (d > 0) A.elTimer = setTimeout(stopAlarm, d * 1000);
        A.el.onended = () => { A.playing = null; renderStopSound(); };
      } catch (e) {}
    }
    renderStopSound();
  }
  function stopAlarm() {
    const p = A.playing; A.playing = null;
    if (p) { if (p.src) { try { p.src.onended = null; p.src.stop(); } catch (e) {} } if (p.el && A.el) { A.el.pause(); } }
    clearTimeout(A.elTimer);
    renderStopSound();
  }
  function soundForCompletion(endAt) {
    const s = A.sched;
    if (s && s.wallAt === endAt && A.ctx) {
      A.sched = null;
      if (A.ctx.currentTime >= s.at - 0.6) { A.playing = s; renderStopSound(); return; } // already sounding on time
      try { s.src.onended = null; s.src.stop(); } catch (e) {}
    }
    playAlarmNow();
  }

  /* ---------- helpers: notification, wake lock, web lock ---------- */
  function notify(title, body) {
    if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { const n = new Notification(title, { body, tag: 'sixty-north', renotify: true }); n.onclick = () => { window.focus(); n.close(); }; } catch (e) {}
  }
  let wakeLock = null;
  async function acquireWake() {
    if (!S.settings.wake || !('wakeLock' in navigator) || T().status !== 'running' || document.hidden) return;
    try { if (!wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { wakeLock = null; }
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  let lockRelease = null;
  function holdWebLock() {
    if (lockRelease || !navigator.locks) return;
    navigator.locks.request('sixty-north-timer', () => new Promise((res) => { lockRelease = res; })).catch(() => {});
  }
  function dropWebLock() { if (lockRelease) { lockRelease(); lockRelease = null; } }

  /* ==========================================================
     TIMER ENGINE
     ========================================================== */
  function remaining() { const t = T(); return t.status === 'running' ? Math.max(0, t.endsAt - Date.now()) : t.remainingMs; }
  function setPhase(mode) { const t = T(); t.mode = mode; t.phaseMs = S.settings[mode] * 60000; t.remainingMs = t.phaseMs; t.status = 'idle'; t.endsAt = null; t.sessionStart = null; }

  function logFocus(secs, start, end, full) {
    secs = Math.round(secs);
    if (secs < 60) return false;
    const task = activeTask();
    S.sessions.push({ id: uid(), start: start || end - secs * 1000, end, secs, taskId: task ? task.id : null, taskTitle: task ? task.title : '', full: !!full });
    if (task) { task.secs = (task.secs || 0) + secs; if (full) task.pomos = (task.pomos || 0) + 1; }
    return true;
  }
  function bankPartial() {
    const t = T();
    if (t.mode !== 'focus' || t.status === 'idle') return 0;
    const done = (t.phaseMs - remaining()) / 1000;
    if (logFocus(done, t.sessionStart, Date.now(), false)) { afterCredit(); return done; }
    return 0;
  }

  function startTimer() {
    const t = T(); if (t.status === 'running') return;
    unlockAudio(); stopAlarm();
    if (t.remainingMs <= 0) t.remainingMs = t.phaseMs;
    t.endsAt = Date.now() + t.remainingMs;
    if (!t.sessionStart) t.sessionStart = Date.now();
    t.status = 'running';
    lastTick = Date.now();
    save(); scheduleAlarm(); acquireWake(); holdWebLock();
    renderAll();
  }
  function pauseTimer() {
    const t = T(); if (t.status !== 'running') return;
    t.remainingMs = remaining(); t.endsAt = null; t.status = 'paused';
    cancelAlarm(); releaseWake(); dropWebLock(); save(); renderAll();
  }
  function toggleTimer() { T().status === 'running' ? pauseTimer() : startTimer(); }

  function nextAfter(mode) {
    if (mode !== 'focus') return 'focus';
    return T().sinceLong >= S.settings.longEvery ? 'long' : 'short';
  }
  // Natural end of a phase at wall time endAt
  function completePhase(endAt, allowChain) {
    const t = T(), st = S.settings, was = t.mode;
    if (was === 'focus') { logFocus(t.phaseMs / 1000, t.sessionStart || endAt - t.phaseMs, endAt, true); t.sinceLong++; }
    if (was === 'long') t.sinceLong = 0;
    const next = nextAfter(was);
    setPhase(next);
    const auto = next === 'focus' ? st.autoFocus : st.autoBreaks;
    if (auto && allowChain) { t.status = 'running'; t.sessionStart = endAt; t.endsAt = endAt + t.phaseMs; }
    return { was, next, endAt };
  }
  async function skipPhase() {
    const t = T();
    if (t.status === 'idle' && t.mode !== 'focus') { /* skipping an unstarted break is fine */ }
    cancelAlarm();
    const was = t.mode;
    const banked = bankPartial();
    if (was === 'long') t.sinceLong = 0;
    setPhase(nextAfter(was));
    releaseWake(); dropWebLock(); save(); renderAll();
    toast(was !== 'focus' ? 'Break skipped. Ready when you are.' : banked ? `Nice work! ${Math.floor(banked / 60)} min saved. Time for a break.` : 'Moved on to your break.');
  }
  async function resetPhase() {
    const t = T();
    if (t.status === 'idle') return;
    const doneSecs = t.mode === 'focus' ? (t.phaseMs - remaining()) / 1000 : 0;
    const msg = doneSecs >= 60 ? `Restart this session? The ${Math.floor(doneSecs / 60)} min you already focused will still be saved.` : 'Restart this session from the beginning?';
    if (!(await confirmBox(msg, 'Restart'))) return;
    cancelAlarm(); bankPartial(); setPhase(t.mode);
    releaseWake(); dropWebLock(); save(); renderAll();
  }
  async function switchMode(mode) {
    const t = T(); if (mode === t.mode && t.status === 'idle') return;
    if (t.status !== 'idle') {
      const ok = await confirmBox('The timer is still going. Switch anyway? Any focus time you already did will be saved.', 'Switch');
      if (!ok) return;
    }
    cancelAlarm(); bankPartial(); setPhase(mode);
    releaseWake(); dropWebLock(); save(); renderAll();
  }
  function adjustCurrent(deltaMin) {
    const t = T(); if (t.status === 'running') return;
    const cur = t.remainingMs;
    const nr = clamp(cur + deltaMin * 60000, 60000, 240 * 60000);
    t.phaseMs = Math.max(60000, t.phaseMs + (nr - cur)); t.remainingMs = nr;
    save(); renderTimer();
  }
  function setCurrentMinutes(min) {
    const t = T(); if (t.status === 'running') return;
    const ms = clamp(Math.round(min), 1, 240) * 60000;
    const used = t.phaseMs - t.remainingMs; t.phaseMs = ms + used; t.remainingMs = ms;
    save(); renderTimer();
  }

  /* ---------- the tick ---------- */
  let lastTick = Date.now(), firstTick = true;
  function tick() {
    const now = Date.now(), gap = now - lastTick; lastTick = now;
    const t = T();
    if (t.status === 'running' && now >= t.endsAt) {
      // A long gap means the computer slept or the page was closed: finish the
      // session that was running, then wait instead of chaining more sessions.
      const away = firstTick || gap > 180000;
      const events = []; let guard = 0;
      while (t.status === 'running' && Date.now() >= t.endsAt && guard++ < 40) events.push(completePhase(t.endsAt, !away));
      save();
      onPhasesEnded(events, away);
    }
    firstTick = false;
    renderTimer();
  }
  function onPhasesEnded(events, away) {
    if (!events.length) return;
    const first = events[0], last = events[events.length - 1];
    if (!away || Date.now() - first.endAt < 10 * 60000) soundForCompletion(first.endAt); else cancelAlarm();
    if (T().status === 'running') scheduleAlarm(); else { releaseWake(); dropWebLock(); }
    const title = last.was === 'focus' ? 'Focus session done! 🍁' : 'Break is over';
    const body = last.next === 'focus' ? 'Ready for the next focus session?' : `Time for a ${MODE_NAME[last.next].toLowerCase()} of ${S.settings[last.next]} minutes.`;
    notify(title, body);
    if (away) toast('Welcome back! Your session ended while you were away. The timer is waiting for you.');
    afterCredit();
    tipIndex++;
    renderAll();
  }

  function initTicker() {
    const code = 'let i=null;onmessage=e=>{clearInterval(i);if(e.data>0)i=setInterval(()=>postMessage(1),e.data)}';
    try {
      const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
      w.onmessage = tick; w.postMessage(250);
    } catch (e) { /* worker blocked (e.g. file://) — fall back to main thread */ }
    setInterval(tick, 500);
    document.addEventListener('visibilitychange', () => { tick(); if (!document.hidden) { acquireWake(); flushCelebration(); } });
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);
  }

  /* ---------- unlocks & celebration ---------- */
  let pendingCelebration = null;
  function afterCredit() {
    const h = hoursDone();
    if (h < S.celebrated) S.celebrated = h;
    if (h > S.celebrated) {
      const newly = STOPS.filter((s) => s.h > S.celebrated && s.h <= h);
      S.celebrated = h; save();
      pendingCelebration = { h, newly };
      flushCelebration();
    }
    renderJourney();
  }
  function flushCelebration() {
    if (!pendingCelebration || document.hidden) return;
    const { h, newly } = pendingCelebration; pendingCelebration = null;
    $('#celebrateTitle').textContent = h >= GOAL_HOURS ? 'Coast to coast to coast!' : `Hour ${h} complete!`;
    $('#celebrateText').textContent = h >= GOAL_HOURS
      ? 'Thirty hours of focus. You crossed the whole country. Your final rewards are ready.'
      : `You have focused for ${h} ${h === 1 ? 'hour' : 'hours'} in total. A new stop is ready to watch.`;
    $('#celebrateList').innerHTML = newly.map((s) => `<div>${esc(s.name)}</div>`).join('');
    const target = newly[newly.length - 1];
    $('#celebrateWatch').onclick = () => { closeDlg($('#celebrateDlg')); if (target) openVideo(target); };
    openDlg($('#celebrateDlg'));
    leafRain();
  }
  function leafRain() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('#leafRain'); const colors = ['#D52B1E', '#E3A63B', '#B7372F', '#F07F3C', '#C8102E'];
    for (let i = 0; i < 28; i++) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.innerHTML = '<use href="#i-leaf"/>';
      s.style.left = Math.random() * 100 + 'vw';
      s.style.color = colors[i % colors.length];
      s.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      s.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      s.style.animationDuration = (2.8 + Math.random() * 2.4) + 's';
      s.style.animationDelay = (Math.random() * 0.9) + 's';
      const sc = 0.6 + Math.random() * 0.8; s.style.width = 30 * sc + 'px'; s.style.height = 32 * sc + 'px';
      box.appendChild(s);
      setTimeout(() => s.remove(), 6500);
    }
  }

  /* ==========================================================
     RENDER — timer
     ========================================================== */
  let tipIndex = Math.floor(Math.random() * 10);
  let lastClockText = '', lastMode = '';
  function favicon(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1900 -2050 3800 4120"><path fill="${color}" d="${$('#i-leaf path').getAttribute('d')}"/></svg>`;
    $('#favicon').href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  function renderTimer() {
    const t = T(), rem = remaining();
    const txt = mmss(rem);
    if (txt !== lastClockText) {
      lastClockText = txt;
      $('#clock').textContent = txt; $('#miniTime').textContent = txt;
      document.title = `${txt} – ${t.mode === 'focus' ? 'Time to focus' : 'Time for a break'}`;
    }
    const prog = t.phaseMs ? clamp(1 - rem / t.phaseMs, 0, 1) : 0;
    $('#riverFill').style.width = prog * 100 + '%';
    $('#canoe').style.left = `calc(${prog} * (100% - 26px) + 13px)`;
    if (t.mode !== lastMode) { lastMode = t.mode; document.body.dataset.mode = t.mode; favicon(MODE_COLOR[t.mode]); $('meta[name="theme-color"]').content = MODE_COLOR[t.mode]; }
  }
  function renderControls() {
    const t = T(), running = t.status === 'running';
    document.body.classList.toggle('running', running);
    const sb = $('#startBtn'); sb.textContent = running ? 'PAUSE' : (t.status === 'paused' ? 'RESUME' : 'START');
    sb.classList.toggle('is-running', running);
    $('#skipBtn').disabled = false;
    $('#resetBtn').disabled = t.status === 'idle';
    $('#clock').disabled = running;
    $('#clock').title = running ? '' : 'Tap to type a new time';
    $$('.mode-btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === t.mode)));
    $('#miniIcon').setAttribute('href', running ? '#i-pause' : '#i-play');
    // status
    const todayFull = S.sessions.filter((s) => s.full && dayKey(s.end) === dayKey(Date.now())).length;
    $('#roundNo').textContent = `#${todayFull + (t.mode === 'focus' ? 1 : 0) || 1}`;
    const task = activeTask();
    if (t.mode === 'focus') {
      $('#statusMsg').textContent = task ? task.title : 'Time to focus!';
      $('#statusTip').textContent = FOCUS_TIPS[tipIndex % FOCUS_TIPS.length];
    } else {
      $('#statusMsg').textContent = t.mode === 'long' ? 'Long break. You earned it!' : 'Time for a short break!';
      $('#statusTip').textContent = BREAK_TIPS[tipIndex % BREAK_TIPS.length];
    }
    // today strip
    const todaySecs = S.sessions.filter((s) => dayKey(s.end) === dayKey(Date.now())).reduce((a, s) => a + s.secs, 0);
    const goal = S.settings.dailyGoal * 3600;
    $('#todayStrip').innerHTML = `<span>Today ${hm(todaySecs)}</span><span class="today-bar" aria-hidden="true"><i style="width:${clamp(todaySecs / goal, 0, 1) * 100}%"></i></span><span>Goal ${S.settings.dailyGoal} h${todaySecs >= goal ? ' ✓' : ''}</span>`;
    renderStopSound();
  }
  function renderStopSound() { $('#stopSound').hidden = !A.playing; }
  function renderAll() { renderTimer(); renderControls(); renderTasks(); renderJourney(); if (currentTab === 'report') renderReport(); }

  /* ==========================================================
     TASKS
     ========================================================== */
  let editingId = null;
  function renderTasks() {
    const list = $('#taskList');
    const form = $('#taskForm');
    // park the form outside the list before re-rendering
    if (form.parentElement === list) list.after(form);
    list.innerHTML = S.tasks.map((t) => `
      <li class="task${t.done ? ' done' : ''}${t.id === S.activeTask ? ' active' : ''}" data-id="${t.id}" ${editingId === t.id ? 'hidden' : ''}>
        <button type="button" class="check" data-act="done" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}"><svg class="ico"><use href="#i-check"/></svg></button>
        <span class="t-title">${esc(t.title)}</span>
        <span class="t-count"><b>${t.pomos || 0}</b>/${t.est || 1}</span>
        <button type="button" class="t-edit" data-act="edit" aria-label="Edit task"><svg class="ico"><use href="#i-dots"/></svg></button>
        ${t.note ? `<div class="t-note">${esc(t.note)}</div>` : ''}
      </li>`).join('');
    if (editingId) { const li = list.querySelector(`[data-id="${editingId}"]`); if (li) li.after(form); }
    // summary
    const open = S.tasks.filter((t) => !t.done);
    const est = S.tasks.reduce((a, t) => a + (+t.est || 1), 0), act = S.tasks.reduce((a, t) => a + (t.pomos || 0), 0);
    const left = open.reduce((a, t) => a + Math.max(0, (+t.est || 1) - (t.pomos || 0)), 0);
    const sum = $('#tasksSum');
    if (!S.tasks.length || !left) { sum.hidden = !S.tasks.length; sum.innerHTML = S.tasks.length ? `<span>Sessions <b>${act}</b>/${est}</span><span>All planned sessions done. Great job!</span>` : ''; return; }
    const st = S.settings, t = T();
    let mins = left * st.focus + Math.max(0, left - 1) * st.short;
    const longs = Math.floor((t.sinceLong + left - 1) / st.longEvery); mins += longs * (st.long - st.short);
    if (t.mode === 'focus' && t.status !== 'idle') mins -= (t.phaseMs - remaining()) / 60000;
    if (t.mode !== 'focus') mins += remaining() / 60000;
    const finish = Date.now() + mins * 60000;
    sum.hidden = false;
    sum.innerHTML = `<span>Sessions <b>${act}</b>/${est}</span><span>Finish at <b>${clock12(finish)}</b> (${(mins / 60).toFixed(1)}h)</span>`;
  }
  function openTaskForm(id) {
    const form = $('#taskForm');
    editingId = id || null;
    const t = id ? S.tasks.find((x) => x.id === id) : null;
    $('#tfTitle').value = t ? t.title : '';
    $('#tfEst').value = t ? t.est || 1 : 1;
    $('#tfNote').value = t ? t.note || '' : '';
    $('#tfDelete').hidden = !t;
    form.hidden = false; $('#addTaskBtn').hidden = true;
    renderTasks();
    $('#tfTitle').focus();
  }
  function closeTaskForm() { editingId = null; $('#taskForm').hidden = true; $('#addTaskBtn').hidden = false; renderTasks(); }
  function initTasks() {
    $('#addTaskBtn').addEventListener('click', () => openTaskForm(null));
    $('#tfCancel').addEventListener('click', closeTaskForm);
    $('#taskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('#tfTitle').value.trim(); if (!title) { $('#tfTitle').focus(); return; }
      const est = clamp(parseInt($('#tfEst').value, 10) || 1, 1, 50), note = $('#tfNote').value.trim();
      if (editingId) { const t = S.tasks.find((x) => x.id === editingId); if (t) Object.assign(t, { title, est, note }); }
      else { const t = { id: uid(), title, est, note, done: false, pomos: 0, secs: 0 }; S.tasks.push(t); if (!S.activeTask || !activeTask() || activeTask().done) S.activeTask = t.id; }
      save(); closeTaskForm(); renderControls();
    });
    $('#tfDelete').addEventListener('click', async () => {
      if (!(await confirmBox('Delete this task? Your saved focus time stays in the report.', 'Delete'))) return;
      S.tasks = S.tasks.filter((t) => t.id !== editingId); if (S.activeTask === editingId) S.activeTask = null;
      save(); closeTaskForm(); renderControls();
    });
    $('#taskList').addEventListener('click', (e) => {
      const li = e.target.closest('.task'); if (!li) return;
      const t = S.tasks.find((x) => x.id === li.dataset.id); if (!t) return;
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'edit') { openTaskForm(t.id); return; }
      if (act === 'done') { t.done = !t.done; if (t.done && S.activeTask === t.id) { const nx = S.tasks.find((x) => !x.done); S.activeTask = nx ? nx.id : S.activeTask; } }
      else S.activeTask = t.id;
      save(); renderTasks(); renderControls();
    });
    const menuBtn = $('#taskMenuBtn'), menu = $('#taskMenu');
    menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });
    menu.addEventListener('click', async (e) => {
      const act = e.target.dataset.act; menu.hidden = true; if (!act) return;
      if (act === 'clear-done') S.tasks = S.tasks.filter((t) => !t.done);
      if (act === 'clear-counts') S.tasks.forEach((t) => { t.pomos = 0; });
      if (act === 'clear-all') { if (!(await confirmBox('Remove all tasks? Your focus history stays in the report.', 'Remove all'))) return; S.tasks = []; S.activeTask = null; }
      if (!activeTask()) S.activeTask = null;
      save(); renderTasks(); renderControls();
    });
  }

  /* ==========================================================
     JOURNEY
     ========================================================== */
  const stopImg = (s) => (s.img ? `${IMG}${s.img.split('/')[0]}/thumbs/${s.img.split('/')[1]}.jpg` : null);
  const stopFlag = (s) => (s.p ? `${IMG}${ABBR[s.p]}/flag.webp` : null);
  function renderJourney() {
    const secs = totalSecs(), h = Math.floor(secs / 3600), partSecs = secs % 3600;
    $('#hoursBig').textContent = Math.min(h, 999);
    $('#track').innerHTML = Array.from({ length: GOAL_HOURS }, (_, i) => {
      if (i < h) return '<i class="full"></i>';
      if (i === h) return `<i class="part" style="--p:${(partSecs / 3600) * 100}%"></i>`;
      return '<i></i>';
    }).join('');
    const next = STOPS.find((s) => s.h > h);
    const toNext = next ? next.h * 3600 - secs : 0;
    $('#trackNote').textContent = next
      ? `${hm(secs)} of focus banked. ${hm(toNext)} to go until ${next.name}.`
      : `${hm(secs)} of focus banked. Every stop is unlocked. Amazing!`;
    const ns = $('#nextStop');
    if (next) {
      const img = stopImg(next) || stopFlag(next);
      const pct = clamp(1 - toNext / 3600, 0, 1) * 100;
      ns.hidden = false;
      ns.innerHTML = `<div class="ns-img" style="background-image:url('${img || ''}')${!stopImg(next) && img ? ';background-size:70% auto;background-color:#EEF1F5' : ''}${next.grand ? ';background:#1b2447' : ''}"></div>
        <div><p>Next stop at hour ${next.h}</p><h3>${esc(next.name)}${next.p ? ` <span class="tk-prov">${next.p}</span>` : ''}</h3>
        <p>${hm(toNext)} of focus to go.</p><div class="next-bar"><i style="width:${pct}%"></i></div></div>`;
    } else ns.hidden = true;
    $('#tickets').innerHTML = STOPS.map((s) => {
      const open = s.h <= h;
      const img = stopImg(s), flag = stopFlag(s);
      const bg = s.grand ? '' : img ? `style="background-image:url('${img}')"` : flag ? `style="background-image:url('${flag}')"` : '';
      const cls = ['ticket', open ? 'open' : 'locked', s.grand ? 'grand' : '', s.h === 0 ? 'free' : ''].join(' ');
      const time = s.grand ? 'Full talk' : `${vt(s.start)}${s.end ? '–' + vt(s.end) : ' to end'}`;
      const label = s.h === 0 ? 'Free to watch' : `Hour ${s.h}`;
      return `<button type="button" class="${cls}" data-stop="${s.i}" aria-label="${esc(s.name)}, ${open ? 'unlocked, play' : 'locked until hour ' + s.h}">
        <div class="tk-img${!img && flag && !s.grand ? ' flagbg' : ''}" ${bg}>${s.grand ? '<svg aria-hidden="true"><use href="#i-leaf"/></svg>' : ''}${!s.grand && !img && !flag ? '<svg aria-hidden="true" style="width:44px;height:46px;color:#B7372F;position:absolute;inset:0;margin:auto"><use href="#i-leaf"/></svg>' : ''}
          ${open ? '<span class="tk-play"><svg class="ico"><use href="#i-play"/></svg></span>' : '<span class="tk-lock"><svg class="ico"><use href="#i-lock"/></svg></span>'}</div>
        <div class="tk-body"><span class="tk-hour">${label}</span><span class="tk-name">${esc(s.name)}</span><span class="tk-meta">${time}${s.p ? `<span class="tk-prov">${s.p}</span>` : ''}</span></div>
      </button>`;
    }).join('');
  }
  function initJourney() {
    $('#tickets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-stop]'); if (!b) return;
      const s = STOPS[+b.dataset.stop];
      tryOpenStop(s);
    });
  }
  function tryOpenStop(s) {
    const secs = totalSecs();
    if (s.h * 3600 > secs) { toast(`Locked. Focus ${hm(s.h * 3600 - secs)} more to reach hour ${s.h}.`); return; }
    openVideo(s);
  }
  function openVideo(s) {
    const id = s.vid || VIDEO_ID;
    const q = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1', modestbranding: '1' });
    if (s.start) q.set('start', String(s.start));
    if (s.end) q.set('end', String(s.end));
    $('#videoFrame').src = `https://www.youtube-nocookie.com/embed/${id}?${q}`;
    $('#videoTitle').textContent = s.name;
    $('#videoKicker').textContent = s.grand ? 'Your hour 30 reward' : s.h === 0 ? 'Free to watch' : `Unlocked at hour ${s.h}`;
    const prov = s.p ? P[ABBR[s.p]] : null;
    $('#videoFoot').innerHTML = s.grand
      ? 'Chris Hadfield, Canadian astronaut, on reaching big goals. You reached yours.'
      : `Part of a video tour of Canada${s.end ? `, from ${vt(s.start)} to ${vt(s.end)}` : ''}.${prov ? ` Want to learn more? <a href="#map" data-prov="${ABBR[s.p]}">Explore ${esc(prov.name)} on the map</a>.` : ''}`;
    $('#videoNote').hidden = !(T().status === 'running' && T().mode === 'focus');
    openDlg($('#videoDlg'));
  }

  /* ==========================================================
     PAN / ZOOM (shared by photo viewer and map)
     ========================================================== */
  class PanZoom {
    constructor(view, target, opts = {}) {
      this.v = view; this.t = target; this.s = 1; this.x = 0; this.y = 0; this.w = 0; this.h = 0;
      this.min = opts.min || 1; this.max = opts.max || 6; this.onChange = opts.onChange || (() => {});
      this.ptrs = new Map(); this.moved = 0; this.pinch = null; this.last = null;
      view.addEventListener('wheel', (e) => { e.preventDefault(); const r = view.getBoundingClientRect(); this.zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      view.addEventListener('pointerdown', (e) => this.down(e));
      view.addEventListener('pointermove', (e) => this.move(e));
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => view.addEventListener(n, (e) => this.up(e)));
      view.addEventListener('dblclick', (e) => { const r = view.getBoundingClientRect(); if (this.s > this.min * 1.05) this.reset(); else this.zoomAt(2.5, e.clientX - r.left, e.clientY - r.top); });
      // suppress click after a drag
      view.addEventListener('click', (e) => { if (this.moved > 6) { e.stopPropagation(); e.preventDefault(); } }, true);
    }
    setSize(w, h) { this.w = w; this.h = h; this.t.style.width = w + 'px'; this.t.style.height = h + 'px'; }
    reset() { this.s = this.min; this.clampPos(true); this.apply(); }
    clampPos(center) {
      const vw = this.v.clientWidth, vh = this.v.clientHeight, w = this.w * this.s, h = this.h * this.s;
      if (w <= vw || center) this.x = w <= vw ? (vw - w) / 2 : clamp(this.x, vw - w, 0); else this.x = clamp(this.x, vw - w, 0);
      if (h <= vh || center) this.y = h <= vh ? (vh - h) / 2 : clamp(this.y, vh - h, 0); else this.y = clamp(this.y, vh - h, 0);
    }
    apply() { this.t.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.s})`; this.onChange(this.s); }
    zoomAt(f, cx, cy) {
      const ns = clamp(this.s * f, this.min, this.max); const k = ns / this.s;
      this.x = cx - (cx - this.x) * k; this.y = cy - (cy - this.y) * k; this.s = ns;
      this.clampPos(false); this.apply();
    }
    zoomCenter(f) { this.zoomAt(f, this.v.clientWidth / 2, this.v.clientHeight / 2); }
    down(e) {
      if (e.button !== undefined && e.button !== 0) return;
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.ptrs.size === 1) { this.moved = 0; this.last = { x: e.clientX, y: e.clientY }; }
      if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    }
    move(e) {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = this.v.getBoundingClientRect();
      if (this.ptrs.size === 2 && this.pinch) {
        const [a, b] = [...this.ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt(d / this.pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); this.pinch.d = d; this.moved = 99; return;
      }
      if (this.ptrs.size === 1 && this.last) {
        const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y; this.moved += Math.abs(dx) + Math.abs(dy);
        this.last = { x: e.clientX, y: e.clientY };
        if (this.moved > 6) {
          if (!this.v.classList.contains('dragging')) { this.v.classList.add('dragging'); try { this.v.setPointerCapture(e.pointerId); } catch (x) {} }
          this.x += dx; this.y += dy; this.clampPos(false); this.apply();
        }
      }
    }
    up(e) {
      this.ptrs.delete(e.pointerId);
      if (this.ptrs.size < 2) this.pinch = null;
      if (!this.ptrs.size) { this.v.classList.remove('dragging'); this.last = null; setTimeout(() => { this.moved = 0; }, 0); }
      else { const p = [...this.ptrs.values()][0]; this.last = { x: p.x, y: p.y }; }
    }
  }

  /* ==========================================================
     LIGHTBOX
     ========================================================== */
  const LB = { list: [], i: 0, pz: null, nat: { w: 1, h: 1 } };
  function initLightbox() {
    const view = $('#lbView'), img = $('#lbImg');
    LB.pz = new PanZoom(view, img, { onChange: (s) => { $('#lbZoom').textContent = Math.round((s / LB.pz.min) * 100) + '%'; } });
    $('#lbIn').onclick = () => LB.pz.zoomCenter(1.4);
    $('#lbOut').onclick = () => LB.pz.zoomCenter(1 / 1.4);
    $('#lbFit').onclick = () => LB.pz.reset();
    $('#lbClose').onclick = () => closeDlg($('#lightbox'));
    $('#lbPrev').onclick = () => showPhoto(LB.i - 1);
    $('#lbNext').onclick = () => showPhoto(LB.i + 1);
    $('#lightbox').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') showPhoto(LB.i - 1);
      else if (e.key === 'ArrowRight') showPhoto(LB.i + 1);
      else if (e.key === '+' || e.key === '=') LB.pz.zoomCenter(1.4);
      else if (e.key === '-' || e.key === '_') LB.pz.zoomCenter(1 / 1.4);
      else if (e.key === '0') LB.pz.reset();
    });
    $('#lightbox').addEventListener('close', () => { img.removeAttribute('src'); });
    window.addEventListener('resize', () => { if ($('#lightbox').open) fitPhoto(); });
  }
  function fitPhoto() {
    const view = $('#lbView'), vw = view.clientWidth, vh = view.clientHeight;
    const pad = vw < 640 ? 8 : 60;
    const fit = Math.min((vw - pad * 2) / LB.nat.w, (vh - 120) / LB.nat.h);
    // image element is laid out at natural size; "fit" is the minimum zoom
    LB.pz.setSize(LB.nat.w, LB.nat.h);
    LB.pz.min = fit; LB.pz.max = Math.max(fit * 8, 3);
    LB.pz.reset();
  }
  function showPhoto(i) {
    const n = LB.list.length; if (!n) return;
    LB.i = (i + n) % n;
    const ph = LB.list[LB.i], img = $('#lbImg');
    $('#lbCaption').textContent = ph.caption;
    $('#lbCount').textContent = `${ph.prov}, photo ${LB.i + 1} of ${n}`;
    $('#lbPrev').hidden = $('#lbNext').hidden = n < 2;
    LB.nat = { w: ph.w, h: ph.h };
    img.alt = ph.caption;
    img.src = ph.thumb; // quick preview, scaled to full size
    fitPhoto();
    $('#lbLoading').hidden = false;
    const full = new Image();
    full.onload = () => { if (LB.list[LB.i] === ph) { img.src = ph.full; $('#lbLoading').hidden = true; } };
    full.onerror = () => { $('#lbLoading').textContent = 'Could not load the full-size photo.'; };
    full.src = ph.full;
    // preload neighbours
    [1, -1].forEach((d) => { const nb = LB.list[(LB.i + d + n) % n]; if (nb) { const im = new Image(); im.src = nb.thumb; } });
  }
  function openLightbox(list, i) {
    LB.list = list; openDlg($('#lightbox')); $('#lbLoading').textContent = 'Loading full size…';
    requestAnimationFrame(() => showPhoto(i));
  }

  /* ==========================================================
     MAP
     ========================================================== */
  const REGIONS = { west: 'West Coast', prairies: 'Prairies', central: 'Central Canada', atlantic: 'Atlantic Canada', north: 'The North' };
  let selectedProv = null, mapPZ = null;
  const quiz = { on: false, target: null, right: 0, total: 0, order: [] };
  function buildMap() {
    const svg = $('#mapSvg'); const NS = 'http://www.w3.org/2000/svg';
    let html = '<g class="shapes">';
    Object.entries(P).forEach(([slug, p]) => {
      html += `<path class="prov ${p.region}" data-prov="${slug}" d="${p.d}" tabindex="0" role="button" aria-label="${esc(p.name)}"><title>${esc(p.name)}</title></path>`;
    });
    html += '</g><g class="labels">';
    Object.entries(P).forEach(([slug, p]) => {
      if (p.tx) html += `<line class="leader" x1="${p.lx - 4}" y1="${p.ly - 4}" x2="${p.tx}" y2="${p.ty}"/>`;
      html += `<text class="map-label" data-label="${slug}" x="${p.lx}" y="${p.ly}">${p.abbr}</text>`;
    });
    html += '</g>';
    // generous tap targets for the smallest province
    html += '<circle class="hit" data-prov="prince-edward-island" cx="866" cy="609" r="13"/><rect class="hit" data-prov="prince-edward-island" x="895" y="560" width="46" height="26"/>';
    html += '<rect class="hit" data-prov="nova-scotia" x="925" y="650" width="44" height="26"/>';
    svg.innerHTML = html;
    void NS;
    svg.addEventListener('click', (e) => { const el = e.target.closest('[data-prov]'); if (el) pickProvince(el.dataset.prov, true); });
    svg.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.prov) { e.preventDefault(); pickProvince(e.target.dataset.prov, true); } });

    $('#legend').innerHTML = Object.entries(REGIONS).map(([k, v]) => `<span><i style="background:var(--r-${k})"></i>${v}</span>`).join('');
    $('#provChips').innerHTML = Object.entries(P).sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([slug, p]) => `<button type="button" class="chip" data-prov="${slug}" aria-pressed="false">${esc(p.name)}</button>`).join('');
    $('#provChips').addEventListener('click', (e) => { const b = e.target.closest('[data-prov]'); if (b) pickProvince(b.dataset.prov, true); });

    const view = $('#mapView');
    mapPZ = new PanZoom(view, svg, { min: 1, max: 6 });
    const layout = () => { mapPZ.setSize(view.clientWidth, view.clientHeight); mapPZ.reset(); };
    new ResizeObserver(layout).observe(view);
    $('#mapZoomIn').onclick = () => mapPZ.zoomCenter(1.5);
    $('#mapZoomOut').onclick = () => mapPZ.zoomCenter(1 / 1.5);
    $('#mapZoomFit').onclick = () => mapPZ.reset();

    $('#quizBtn').onclick = startQuiz;
    $('#quizStop').onclick = endQuiz;
    renderProvPanel();
  }
  function pickProvince(slug, fromUser) {
    if (quiz.on && fromUser) { answerQuiz(slug); return; }
    selectedProv = slug;
    $$('.prov').forEach((p) => p.classList.toggle('selected', p.dataset.prov === slug));
    $$('.map-label').forEach((l) => l.classList.toggle('on', l.dataset.label === slug && !P[slug].tx));
    $$('#provChips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.prov === slug)));
    renderProvPanel();
    if (fromUser && window.innerWidth <= 900) $('#provPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function provPhotos(slug) {
    const p = P[slug];
    return p.photos.map((ph) => ({ ...ph, prov: p.name, thumb: `${IMG}${slug}/thumbs/${ph.file}.jpg`, full: `${IMG}${slug}/${ph.file}.jpg` }));
  }
  function renderProvPanel() {
    const panel = $('#provPanel');
    if (!selectedProv) {
      panel.innerHTML = `<div class="pp-empty"><svg aria-hidden="true"><use href="#i-leaf"/></svg>
        <h3>Ten provinces, three territories</h3>
        <p>Canada touches three oceans: the Pacific, the Atlantic and the Arctic. Tap any shape on the map to meet that part of the country.</p>
        <p>Look at the northern edge of British Columbia, Alberta, Saskatchewan and Manitoba. That straight line is the 60th parallel, where the territories begin. It is the line this app is named after.</p></div>`;
      return;
    }
    const p = P[selectedProv], photos = provPhotos(selectedProv), h = hoursDone();
    const stops = STOPS.filter((s) => s.p === p.abbr);
    panel.innerHTML = `
      <img class="pp-flag" src="${IMG}${selectedProv}/flag.webp" alt="Flag of ${esc(p.name)}">
      <span class="pp-type">${p.type} in ${REGIONS[p.region]}</span>
      <h2 class="pp-name">${esc(p.name)}</h2>
      <dl class="facts">
        <div><dt>Capital</dt><dd>${esc(p.capital)}</dd></div>
        <div><dt>Largest city</dt><dd>${esc(p.largest)}</dd></div>
        <div><dt>Joined Canada</dt><dd>${p.joined}</dd></div>
        <div><dt>Official flower</dt><dd>${esc(p.flower)}</dd></div>
      </dl>
      <div class="pp-story">${p.story.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
      <h3>Photos</h3>
      <div class="gallery">${photos.map((ph, i) => `<button type="button" class="g-item" data-i="${i}" aria-label="Open photo: ${esc(ph.caption)}"><img src="${ph.thumb}" alt="${esc(ph.caption)}" loading="lazy"><span>${esc(ph.caption)}</span></button>`).join('')}</div>
      ${stops.length ? `<h3>On your trip</h3><div class="pp-stops">${stops.map((s) => `<button type="button" class="pp-stop${s.h > h ? ' locked' : ''}" data-stop="${s.i}"><svg class="ico"><use href="#i-${s.h > h ? 'lock' : 'play'}"/></svg>${esc(s.name)}<small>Hour ${s.h}</small></button>`).join('')}</div>` : ''}`;
    panel.querySelector('.gallery').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) openLightbox(photos, +b.dataset.i); });
    const st = panel.querySelector('.pp-stops');
    if (st) st.addEventListener('click', (e) => { const b = e.target.closest('[data-stop]'); if (b) tryOpenStop(STOPS[+b.dataset.stop]); });
  }
  function startQuiz() {
    quiz.on = true; quiz.right = 0; quiz.total = 0;
    quiz.order = Object.keys(P).sort(() => Math.random() - 0.5);
    $('#quizBar').hidden = false; $('#quizBtn').hidden = true;
    selectedProv = null; $$('.prov').forEach((p) => p.classList.remove('selected'));
    renderProvPanel(); nextQuiz();
  }
  function nextQuiz() {
    if (!quiz.order.length) { toast(`Quiz done! You found ${quiz.right} of ${quiz.total}.`); endQuiz(); return; }
    quiz.target = quiz.order.pop(); $('#quizTarget').textContent = P[quiz.target].name;
    $('#quizScore').textContent = `${quiz.right} / ${quiz.total}`;
  }
  function answerQuiz(slug) {
    const target = quiz.target; quiz.total++;
    const ok = slug === target; if (ok) quiz.right++;
    const el = $(`.prov[data-prov="${target}"]`), wrong = $(`.prov[data-prov="${slug}"]`);
    el.classList.add('q-right'); if (!ok && wrong) wrong.classList.add('q-wrong');
    toast(ok ? `Yes! That's ${P[target].name}.` : `Not quite. That was ${P[slug].name}. ${P[target].name} is shown in green.`);
    $('#quizScore').textContent = `${quiz.right} / ${quiz.total}`;
    setTimeout(() => { el.classList.remove('q-right'); if (wrong) wrong.classList.remove('q-wrong'); if (quiz.on) nextQuiz(); }, ok ? 900 : 1800);
  }
  function endQuiz() { quiz.on = false; $('#quizBar').hidden = true; $('#quizBtn').hidden = false; }

  /* ==========================================================
     REPORT
     ========================================================== */
  let reportRange = 'week';
  function streak() {
    const days = new Set(S.sessions.map((s) => dayKey(s.end)));
    let n = 0; const d = new Date(); if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function buckets() {
    const now = new Date(); const out = [];
    if (reportRange === 'year') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        out.push({ key, label: d.toLocaleDateString([], { month: 'short' }), secs: 0, today: i === 0, match: (ts) => dayKey(ts).slice(0, 7) === key });
      }
    } else {
      const n = reportRange === 'week' ? 7 : 30;
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const key = dayKey(d);
        out.push({ key, label: n === 7 ? d.toLocaleDateString([], { weekday: 'short' }) : (i % 5 === 0 ? `${d.getDate()}/${d.getMonth() + 1}` : ''), secs: 0, today: i === 0, match: (ts) => dayKey(ts) === key });
      }
    }
    S.sessions.forEach((s) => { const b = out.find((x) => x.match(s.end)); if (b) b.secs += s.secs; });
    return out;
  }
  function renderReport() {
    const el = $('#report');
    const tot = totalSecs(), full = S.sessions.filter((s) => s.full).length;
    const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - 6);
    const week = S.sessions.filter((s) => s.end >= weekStart.getTime()).reduce((a, s) => a + s.secs, 0);
    const unlocked = Math.min(hoursDone(), GOAL_HOURS);
    const b = buckets(); const max = Math.max(...b.map((x) => x.secs), reportRange === 'year' ? 3600 : S.settings.dailyGoal * 3600, 3600);
    const goalPct = reportRange !== 'year' ? (S.settings.dailyGoal * 3600 / max) * 100 : null;
    const byTask = {}; S.sessions.forEach((s) => { const k = s.taskTitle || 'No task'; byTask[k] = (byTask[k] || 0) + s.secs; });
    const tasksSorted = Object.entries(byTask).sort((a, b2) => b2[1] - a[1]).slice(0, 8);
    const tmax = tasksSorted.length ? tasksSorted[0][1] : 1;
    const recent = [...S.sessions].sort((a, b2) => b2.end - a.end).slice(0, 80);
    const groups = []; recent.forEach((s) => { const k = dayKey(s.end); let g = groups.find((x) => x.k === k); if (!g) { g = { k, items: [], secs: 0 }; groups.push(g); } g.items.push(s); g.secs += s.secs; });
    const dayLabel = (k) => { const [y, m, d] = k.split('-').map(Number); const dt = new Date(y, m - 1, d); const t = dayKey(Date.now()); const yd = new Date(); yd.setDate(yd.getDate() - 1); return k === t ? 'Today' : k === dayKey(yd) ? 'Yesterday' : dt.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };

    el.innerHTML = `
      <div class="r-head"><div><h2>Study report</h2><p class="lede">${tot ? 'Here is how your focus is adding up. Keep going!' : 'Your focus time will show up here after your first session.'}</p></div></div>
      <div class="tiles">
        <div class="tile"><b>${hm(tot)}</b><span>Total focus</span></div>
        <div class="tile"><b>${hm(week)}</b><span>Last 7 days</span></div>
        <div class="tile"><b>${streak()}</b><span>Day streak</span></div>
        <div class="tile"><b>${unlocked}/${GOAL_HOURS}</b><span>Trip stops unlocked</span></div>
      </div>
      <div class="r-head"><h3>Focus hours</h3>
        <div class="seg" role="group" aria-label="Chart range">
          <button type="button" data-range="week" aria-pressed="${reportRange === 'week'}">Week</button>
          <button type="button" data-range="month" aria-pressed="${reportRange === 'month'}">Month</button>
          <button type="button" data-range="year" aria-pressed="${reportRange === 'year'}">Year</button>
        </div></div>
      <div class="chart-wrap">
        <div class="chart">${goalPct ? `<div class="goal-line" style="bottom:${goalPct}%"><span>Goal ${S.settings.dailyGoal}h</span></div>` : ''}
          ${b.map((x) => { const pct = (x.secs / max) * 100; return `<div class="bar${x.today ? ' today' : ''}" title="${x.key}: ${hm(x.secs)}"><i style="height:${pct}%"></i>${x.secs && (reportRange !== 'month') ? `<em style="bottom:calc(${pct}% + 4px)">${(x.secs / 3600).toFixed(1)}</em>` : ''}</div>`; }).join('')}
        </div>
        <div class="x-labels">${b.map((x) => `<span>${x.label}</span>`).join('')}</div>
      </div>
      <p class="muted" style="margin-top:8px;font-size:.9rem">Bars show hours. ${full} full focus ${full === 1 ? 'session' : 'sessions'} finished in total.</p>
      <div class="r-grid">
        <div><h3>Where your time went</h3>
          ${tasksSorted.length ? `<div class="task-bars">${tasksSorted.map(([k, v]) => `<div class="tb-row"><span>${esc(k)}</span><span>${hm(v)}</span><div class="tb-track"><i style="width:${(v / tmax) * 100}%"></i></div></div>`).join('')}</div>` : '<div class="empty">Pick a task on Home before you start, and your time will be sorted by task here.</div>'}
        </div>
        <div><h3>Session history</h3>
          ${groups.length ? `<div class="history">${groups.map((g) => `<div class="h-day"><span>${dayLabel(g.k)}</span><span>${hm(g.secs)}</span></div>${g.items.map((s) => `<div class="h-row"><span class="h-time">${clock12(s.start)}–${clock12(s.end)}</span><span class="h-task">${esc(s.taskTitle || 'No task')}</span><span class="h-dur">${hm(s.secs)}</span><button type="button" class="h-del" data-del="${s.id}" aria-label="Delete this session"><svg class="ico"><use href="#i-trash"/></svg></button></div>`).join('')}`).join('')}</div>` : '<div class="empty">No sessions yet. Press START on Home and your first minutes will appear here.</div>'}
        </div>
      </div>
      <h3 style="margin-top:30px">Your data</h3>
      <p class="muted">Saved only in this browser. Make a backup file to keep it safe or move it to another computer.</p>
      <div class="data-tools">
        <button type="button" class="pill-btn ghost-dark" id="expCsv">Download history (CSV)</button>
        <button type="button" class="pill-btn ghost-dark" id="expJson">Save backup file</button>
        <label class="pill-btn ghost-dark" style="cursor:pointer">Restore from backup<input type="file" id="impJson" accept="application/json,.json" hidden></label>
      </div>`;
    el.querySelector('.seg').addEventListener('click', (e) => { const r = e.target.dataset.range; if (r) { reportRange = r; renderReport(); } });
    el.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await confirmBox('Delete this session from your history? Its minutes will be removed from your total.', 'Delete'))) return;
      const s = S.sessions.find((x) => x.id === btn.dataset.del);
      if (s) { const t = S.tasks.find((x) => x.id === s.taskId); if (t) { t.secs = Math.max(0, (t.secs || 0) - s.secs); if (s.full) t.pomos = Math.max(0, (t.pomos || 0) - 1); } }
      S.sessions = S.sessions.filter((x) => x.id !== btn.dataset.del);
      afterCredit(); save(); renderAll(); renderReport();
    }));
    $('#expCsv').onclick = exportCsv; $('#expJson').onclick = exportJson;
    $('#impJson').onchange = importJson;
  }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportCsv() {
    const rows = [['date', 'start', 'end', 'minutes', 'task', 'full_session']];
    [...S.sessions].sort((a, b) => a.start - b.start).forEach((s) => rows.push([dayKey(s.end), new Date(s.start).toLocaleTimeString(), new Date(s.end).toLocaleTimeString(), (s.secs / 60).toFixed(1), s.taskTitle || '', s.full ? 'yes' : 'no']));
    download(`sixty-north-history-${dayKey(Date.now())}.csv`, rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  }
  function exportJson() { download(`sixty-north-backup-${dayKey(Date.now())}.json`, JSON.stringify(S, null, 1), 'application/json'); toast('Backup saved to your downloads.'); }
  function importJson(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const data = JSON.parse(r.result); if (!data || data.v !== 1) throw new Error();
        if (!(await confirmBox('Replace everything in this browser with the backup file?', 'Restore'))) return;
        cancelAlarm(); S = normalize(data); if (S.timer.status === 'running') { S.timer.status = 'paused'; S.timer.remainingMs = Math.max(0, S.timer.endsAt - Date.now()) || S.timer.phaseMs; S.timer.endsAt = null; }
        save(); renderAll(); renderReport(); toast('Backup restored.');
      } catch (err) { toast('That file is not a Sixty North backup.'); }
    };
    r.readAsText(f); e.target.value = '';
  }

  /* ==========================================================
     SETTINGS
     ========================================================== */
  function fillSettings() {
    const f = $('#settingsForm'), st = S.settings;
    ['focus', 'short', 'long', 'longEvery', 'dailyGoal'].forEach((k) => { f.elements[k].value = st[k]; });
    ['autoBreaks', 'autoFocus', 'notify', 'wake'].forEach((k) => { f.elements[k].checked = !!st[k]; });
    f.elements.volume.value = st.volume; $('#volOut').textContent = st.volume + '%';
    f.elements.alarmSecs.value = String(st.alarmSecs);
    $('#wakeRow').hidden = !('wakeLock' in navigator);
    $('#settingsNote').textContent = T().status !== 'idle' ? 'New times start with your next session. The current session keeps its time.' : '';
    markPreset();
  }
  function markPreset() {
    const f = $('#settingsForm'); const cur = [f.elements.focus.value, f.elements.short.value, f.elements.long.value].join(',');
    $$('.presets .chip').forEach((c) => c.classList.toggle('on', c.dataset.preset === cur));
  }
  function initSettings() {
    const dlg = $('#settingsDlg'), f = $('#settingsForm');
    $('#openSettings').onclick = () => { fillSettings(); openDlg(dlg); };
    f.addEventListener('input', (e) => { if (e.target.name === 'volume') $('#volOut').textContent = e.target.value + '%'; markPreset(); });
    $$('.presets .chip').forEach((c) => c.addEventListener('click', () => { const [a, b, l] = c.dataset.preset.split(','); f.elements.focus.value = a; f.elements.short.value = b; f.elements.long.value = l; markPreset(); }));
    $('#testSound').onclick = () => {
      unlockAudio();
      if (A.playing) { stopAlarm(); $('#testSound').textContent = 'Test sound'; return; }
      const prevV = S.settings.volume, prevD = S.settings.alarmSecs;
      S.settings.volume = +f.elements.volume.value; S.settings.alarmSecs = 10;
      const go = () => { playAlarmNow(); S.settings.volume = prevV; S.settings.alarmSecs = prevD; $('#testSound').textContent = 'Stop'; setTimeout(() => { $('#testSound').textContent = 'Test sound'; }, 10000); };
      if (A.ctx && !A.buf && A.loading) setTimeout(go, 400); else go();
    };
    f.elements.notify.addEventListener('change', async (e) => {
      if (!e.target.checked) return;
      if (!('Notification' in window)) { toast('This browser does not support notifications.'); e.target.checked = false; return; }
      if (Notification.permission === 'granted') return;
      const p = await Notification.requestPermission();
      if (p !== 'granted') { e.target.checked = false; toast('Notifications are blocked. You can allow them in your browser settings.'); }
    });
    $('#resetSettings').onclick = () => { Object.entries(DEFAULTS).forEach(([k, v]) => { const el = f.elements[k]; if (!el) return; if (el.type === 'checkbox') el.checked = v; else el.value = v; }); $('#volOut').textContent = DEFAULTS.volume + '%'; markPreset(); };
    $('#eraseAll').onclick = async () => {
      if (!(await confirmBox('Erase all tasks, history, unlocked stops and settings in this browser? This cannot be undone. Save a backup first if you are not sure.', 'Erase everything'))) return;
      cancelAlarm(); stopAlarm(); S = fresh(); save(); closeDlg(dlg); renderAll(); if (currentTab === 'map') renderProvPanel(); toast('All data erased. A fresh start!');
    };
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const st = S.settings, t = T(), old = { ...st };
      ['focus', 'short', 'long', 'longEvery', 'dailyGoal'].forEach((k) => {
        let v = parseFloat(f.elements[k].value); if (!isFinite(v)) v = DEFAULTS[k];
        st[k] = k === 'dailyGoal' ? clamp(Math.round(v * 2) / 2, ...LIMITS[k]) : clamp(Math.round(v), ...LIMITS[k]);
      });
      ['autoBreaks', 'autoFocus', 'notify', 'wake'].forEach((k) => { st[k] = f.elements[k].checked; });
      st.volume = clamp(+f.elements.volume.value, 0, 100); st.alarmSecs = +f.elements.alarmSecs.value;
      // apply new length now if the current session has not started
      if (t.status === 'idle' && old[t.mode] !== st[t.mode]) setPhase(t.mode);
      if (t.status === 'running') { scheduleAlarm(); acquireWake(); }
      if (!st.wake) releaseWake();
      save(); closeDlg(dlg); renderAll(); toast('Settings saved.');
    });
  }

  /* ==========================================================
     DIALOG helpers, confirm, toast
     ========================================================== */
  function openDlg(d) { if (d.open) return; try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
  function closeDlg(d) { if (d.open) d.close(); }
  function initDialogs() {
    $$('dialog').forEach((d) => {
      d.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) { closeDlg(d); return; }
        if (e.target === d && d.id !== 'lightbox') closeDlg(d); // backdrop click
      });
    });
    $('#videoDlg').addEventListener('close', () => { $('#videoFrame').src = 'about:blank'; });
    $('#videoPause').onclick = () => { pauseTimer(); $('#videoNote').hidden = true; toast('Timer paused. Enjoy the view!'); };
    $('#videoFoot').addEventListener('click', (e) => { const a = e.target.closest('[data-prov]'); if (!a) return; e.preventDefault(); closeDlg($('#videoDlg')); go('map'); pickProvince(a.dataset.prov, false); });
  }
  function confirmBox(msg, okLabel = 'OK') {
    return new Promise((res) => {
      const d = $('#confirmDlg'); $('#confirmText').textContent = msg; $('#confirmYes').textContent = okLabel;
      const done = (v) => { d.removeEventListener('close', onClose); $('#confirmYes').onclick = $('#confirmNo').onclick = null; if (d.open) d.close(); res(v); };
      const onClose = () => done(false);
      $('#confirmYes').onclick = () => done(true); $('#confirmNo').onclick = () => done(false);
      d.addEventListener('close', onClose);
      openDlg(d); $('#confirmYes').focus();
    });
  }
  let toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3600); }

  /* ==========================================================
     TABS / ROUTING
     ========================================================== */
  let currentTab = 'home', mapBuilt = false;
  function go(tab, push = true) {
    if (!['home', 'map', 'report', 'guide'].includes(tab)) tab = 'home';
    currentTab = tab;
    $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.tab !== tab; });
    $$('.nav .nav-btn').forEach((b) => { if (b.dataset.go === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#miniTimer').hidden = tab === 'home';
    if (tab === 'map' && !mapBuilt) { buildMap(); mapBuilt = true; }
    if (tab === 'map' && mapBuilt) renderProvPanel();
    if (tab === 'report') renderReport();
    if (push && location.hash !== '#' + tab) history.pushState(null, '', '#' + tab);
    window.scrollTo(0, 0);
  }
  function initNav() {
    document.addEventListener('click', (e) => { const a = e.target.closest('[data-go]'); if (!a) return; e.preventDefault(); go(a.dataset.go); });
    window.addEventListener('popstate', () => go(location.hash.slice(1), false));
    $('#miniTimer').onclick = toggleTimer;
  }

  /* ==========================================================
     WIRING
     ========================================================== */
  function initTimerUI() {
    $('#startBtn').addEventListener('click', toggleTimer);
    $('#skipBtn').addEventListener('click', skipPhase);
    $('#resetBtn').addEventListener('click', resetPhase);
    $('#stopSound').addEventListener('click', stopAlarm);
    $$('.mode-btn').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
    $('#minus5').onclick = () => adjustCurrent(-5);
    $('#plus5').onclick = () => adjustCurrent(5);
    $('#clock').addEventListener('click', () => {
      if (T().status === 'running') return;
      $('#clockEdit').hidden = false; const inp = $('#clockEditInput'); inp.value = Math.ceil(remaining() / 60000); inp.focus(); inp.select();
    });
    $('#clockEdit').addEventListener('submit', (e) => { e.preventDefault(); const v = parseFloat($('#clockEditInput').value); if (isFinite(v) && v >= 1) setCurrentMinutes(v); $('#clockEdit').hidden = true; });
    $('#clockEditCancel').onclick = () => { $('#clockEdit').hidden = true; };
    // generic steppers
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.step'); if (!b) return;
      const inp = b.parentElement.querySelector('input'); const st = parseFloat(b.dataset.step);
      const min = parseFloat(inp.min), max = parseFloat(inp.max);
      inp.value = clamp((parseFloat(inp.value) || 0) + st, min, max);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (document.querySelector('dialog[open]')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select', 'button', 'a'].includes(tag) || e.target.isContentEditable || e.target.getAttribute('role') === 'button') return;
      e.preventDefault(); toggleTimer();
    });
    // keep other open tabs in sync
    window.addEventListener('storage', (e) => { if (e.key === KEY) { S = load(); lastMode = ''; renderAll(); if (T().status === 'running') scheduleAlarm(); else cancelAlarm(); } });
    // browsers allow sound only after a click: warm up audio on the first interaction
    const warm = () => { unlockAudio(); document.removeEventListener('pointerdown', warm); document.removeEventListener('keydown', warm); };
    document.addEventListener('pointerdown', warm); document.addEventListener('keydown', warm);
  }

  function init() {
    initDialogs(); initNav(); initTimerUI(); initTasks(); initJourney(); initSettings(); initLightbox();
    if (!S.timer.phaseMs) setPhase('focus');
    renderAll();
    go(location.hash.slice(1) || 'home', false);
    initTicker();
    tick();
    if (S.timer.status === 'running') holdWebLock();
  }
  init();
})();
