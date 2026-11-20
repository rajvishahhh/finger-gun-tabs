// The shooting range: shows every open tab as a target, aims a laser with your
// index finger, and closes the tab you shoot.
import { createTracker, analyze, GunTrigger, HandFinder, OneEuro, HAND_EDGES, TUNING } from './hand.js';

const ext = typeof chrome !== 'undefined' && !!chrome.tabs; // false when previewed outside Chrome's extension system
const fromStandby = new URLSearchParams(location.search).get('src') === 'standby';
const $ = (id) => document.getElementById(id);
const range = $('range');
const laser = $('laser');
const fxLayer = $('fx');
const flash = $('flash');
const banner = $('banner');
const statusEl = $('status');
const debugEl = $('debug');
const video = $('video');
const skel = $('skeleton');
const skelCtx = skel.getContext('2d');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- tabs ----

const DAY = 86400000;
const MOCK_TABS = [
  ['Inbox (4,201)', 'https://mail.example.com', true],
  ['How to centre a div - 14 answers', 'https://stackoverflow.example.com', false, 12],
  ['Cheap flights to Lisbon', 'https://flights.example.com', false, 31],
  ['Untitled document', 'https://docs.example.com'],
  ['lofi beats to close tabs to', 'https://video.example.com'],
  ['Quarterly planning - Sheet 7', 'https://sheets.example.com'],
  ['Is a hot dog a sandwich? - Wiki', 'https://wiki.example.org', false, 6],
  ['Cart (11 items)', 'https://shop.example.com'],
  ['New Tab', ''],
  ['Pull request #482', 'https://code.example.com'],
  ['Weather this weekend', 'https://weather.example.com'],
  ['Recipe: 3-ingredient pasta', 'https://recipes.example.com'],
  ['Article I will definitely read later', 'https://news.example.com/a'],
  ['Article I will definitely read later', 'https://news.example.com/a'],
].map(([title, url, pinned, idleDays], i) => ({
  id: 1000 + i,
  title,
  url,
  pinned: !!pinned,
  lastAccessed: Date.now() - (idleDays || 0) * DAY,
}));

let selfTabId = null;
let selfWindowId = null;
let windowOnly = false; // "This window only": skip tabs in other windows
const cards = new Map(); // tab id -> card element
const badges = new Map(); // tab id -> { cls, text }
const shotByMe = new Set();
let rects = []; // cached card positions for aim assist

async function listTabs() {
  if (!ext) return MOCK_TABS.filter((t) => !shotByMe.has(t.id));
  if (selfTabId === null) {
    const self = await chrome.tabs.getCurrent();
    selfTabId = self?.id ?? -1;
    selfWindowId = self?.windowId ?? null;
  }
  const query = windowOnly && selfWindowId != null ? { windowId: selfWindowId } : { windowType: 'normal' };
  const tabs = await chrome.tabs.query(query);
  return tabs.filter((t) => t.id !== selfTabId);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Pinned tabs are bulletproof, the three stalest tabs are "wanted", and
// repeat copies of a page are marked as duplicates.
function computeBadges(tabs) {
  badges.clear();
  const seen = new Set();
  for (const t of tabs) {
    if (t.pinned) {
      badges.set(t.id, { cls: 'pinned', text: 'PINNED · BULLETPROOF' });
    } else if (t.url && seen.has(t.url)) {
      badges.set(t.id, { cls: 'dupe', text: 'DUPLICATE' });
    }
    if (t.url) seen.add(t.url);
  }
  const now = Date.now();
  tabs
    .filter((t) => !badges.has(t.id) && t.lastAccessed && now - t.lastAccessed > 2 * DAY)
    .sort((a, b) => a.lastAccessed - b.lastAccessed)
    .slice(0, 3)
    .forEach((t) => {
      const days = Math.floor((now - t.lastAccessed) / DAY);
      badges.set(t.id, { cls: 'wanted', text: `WANTED · UNTOUCHED ${days} DAYS` });
    });
}

function iconFor(tab) {
  const letter = document.createElement('div');
  letter.className = 'letter';
  letter.textContent = (hostOf(tab.url) || tab.title || '?').trim().charAt(0).toUpperCase() || '?';
  if (!ext || !/^https?:/.test(tab.url || '')) return letter;
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  const src = new URL(chrome.runtime.getURL('/_favicon/'));
  src.searchParams.set('pageUrl', tab.url);
  src.searchParams.set('size', '64');
  img.src = src.toString();
  img.onerror = () => img.replaceWith(letter);
  return img;
}

function fillCard(el, tab) {
  const badge = badges.get(tab.id);
  el.className = 'card' + (badge ? ` ${badge.cls}` : '');
  el.dataset.id = String(tab.id);
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = tab.title || tab.url || 'Untitled';
  const host = document.createElement('div');
  host.className = 'host';
  host.textContent = hostOf(tab.url);
  const parts = [iconFor(tab), title, host];
  if (badge) {
    const b = document.createElement('div');
    b.className = 'badge';
    b.textContent = badge.text;
    parts.unshift(b);
  }
  el.replaceChildren(...parts);
}

async function refresh() {
  const tabs = await listTabs();
  computeBadges(tabs);
  cards.clear();
  range.replaceChildren();
  setLocked(null);
  for (const tab of tabs) {
    const el = document.createElement('div');
    fillCard(el, tab);
    cards.set(tab.id, el);
    range.append(el);
  }
  layout();
  updateStats();
}

function layout() {
  const n = range.children.length;
  if (n) {
    const { clientWidth: w, clientHeight: h } = range;
    const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt((n * (w / h)) / 1.5))));
    range.style.setProperty('--cols', String(cols));
  }
  rects = [...range.children].map((el) => {
    const r = el.getBoundingClientRect();
    return { el, l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
}

let refreshTimer = 0;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 250);
}

if (ext) {
  chrome.tabs.onCreated.addListener(refreshSoon);
  chrome.tabs.onRemoved.addListener((id) => {
    if (shotByMe.delete(id)) return; // our own kill: the scorched slot stays put
    refreshSoon();
  });
  chrome.tabs.onUpdated.addListener((id, change, tab) => {
    const el = cards.get(id);
    if (!el || el.classList.contains('dead')) return;
    if ('title' in change || 'url' in change || 'favIconUrl' in change) {
      const wasLocked = el === locked;
      fillCard(el, tab);
      if (wasLocked) el.classList.add('locked');
    }
    if ('pinned' in change) refreshSoon();
  });
}
addEventListener('resize', layout);

// -------------------------------------------------------------- score ----

const score = { shots: 0, kills: 0, streak: 0, best: 0, lastKillAt: -1e9, firstShotAt: null, lastShotAt: null };
const STREAK_MS = 2500;
const STREAK_NAMES = [
  null,
  null,
  'DOUBLE KILL',
  'TRIPLE KILL',
  'TAB RAMPAGE',
  'UNSTOPPABLE',
  'TAB BANKRUPTCY',
  'INBOX ZERO ENERGY',
];

function updateStats() {
  const alive = range.querySelectorAll('.card:not(.dead)').length;
  $('remaining').textContent = String(alive);
  $('kills').textContent = String(score.kills);
  $('s-accuracy').textContent = score.shots ? `${Math.round((score.kills / score.shots) * 100)}%` : '–';
  $('s-streak').textContent = String(score.best);
  const secs = score.firstShotAt === null ? 0 : (score.lastShotAt - score.firstShotAt) / 1000;
  $('s-time').textContent = score.kills ? `${secs.toFixed(1)}s` : '–';
}

function showBanner(text, sticky = false) {
  banner.textContent = text;
  banner.classList.remove('go', 'stay');
  void banner.offsetWidth;
  banner.classList.add(sticky ? 'stay' : 'go');
}

function checkSweep() {
  if (!score.kills) return;
  const targets = range.querySelectorAll('.card:not(.dead):not(.pinned)').length;
  if (targets === 0) setTimeout(() => showBanner(`CLEAN SWEEP · ${score.kills} TABS`, true), 700);
}

// ------------------------------------------------------------- sounds ----

let actx = null;
function audio() {
  actx ??= new AudioContext();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function noise(a, seconds) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}
function pew(pitch = 1) {
  const a = audio();
  const t = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1900 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(170 * pitch, t + 0.2);
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.25);
  const n = noise(a, 0.07);
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.18, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  n.connect(ng).connect(a.destination);
  n.start(t);
}
function crash() {
  const a = audio();
  const t = a.currentTime + 0.03;
  const n = noise(a, 0.35);
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 2200;
  const g = a.createGain();
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  n.connect(f).connect(g).connect(a.destination);
  n.start(t);
}
function ting() {
  const a = audio();
  const t = a.currentTime + 0.02;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(2600, t);
  osc.frequency.exponentialRampToValueAtTime(3400, t + 0.18);
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.32);
}
function fanfare(level) {
  const a = audio();
  const t = a.currentTime + 0.08;
  [0, 4, 7].forEach((semi, i) => {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = 'square';
    osc.frequency.value = 440 * 2 ** ((semi + level * 2) / 12);
    g.gain.setValueAtTime(0.0001, t + i * 0.06);
    g.gain.exponentialRampToValueAtTime(0.09, t + i * 0.06 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.16);
    osc.connect(g).connect(a.destination);
    osc.start(t + i * 0.06);
    osc.stop(t + i * 0.06 + 0.18);
  });
}

// ------------------------------------------------------------ effects ----

function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function muzzle(x, y) {
  flash.style.setProperty('--fx', `${x}px`);
  flash.style.setProperty('--fy', `${y}px`);
  restart(flash, 'go');
  restart(document.body, 'recoil');
  // tracer from the bottom of the screen to the impact point
  const sx = innerWidth / 2;
  const sy = innerHeight + 10;
  const len = Math.hypot(x - sx, y - sy);
  const el = document.createElement('div');
  el.className = 'tracer';
  el.style.cssText = `left:${sx}px;top:${sy}px;width:${len}px;transform:rotate(${Math.atan2(y - sy, x - sx)}rad);`;
  fxLayer.append(el);
  el.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 160, easing: 'ease-out' }).onfinish = () => el.remove();
}

function hole(x, y) {
  const el = document.createElement('div');
  el.className = 'hole';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxLayer.append(el);
  el.addEventListener('animationend', () => el.remove());
}

function pop(x, y, text) {
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxLayer.append(el);
  el.animate(
    [{ transform: 'translate(-50%, -50%)', opacity: 1 }, { transform: 'translate(-50%, -190%)', opacity: 0 }],
    { duration: 900, easing: 'ease-out' },
  ).onfinish = () => el.remove();
}

function sparks(x, y) {
  for (let i = 0; i < 8; i++) {
    const el = document.createElement('div');
    el.className = 'spark';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    fxLayer.append(el);
    const ang = Math.random() * Math.PI * 2;
    const d = 30 + Math.random() * 60;
    el.animate(
      [
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d + 30}px)`, opacity: 0 },
      ],
      { duration: 350 + Math.random() * 200, easing: 'ease-out' },
    ).onfinish = () => el.remove();
  }
}

// Break the card into triangles that fan out from the bullet's impact point.
function shatter(card, x, y) {
  const r = card.getBoundingClientRect();
  const ix = clamp(x - r.left, 2, r.width - 2);
  const iy = clamp(y - r.top, 2, r.height - 2);
  const rim = [[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]];
  const rays = 9;
  for (let k = 0; k < rays; k++) {
    const ang = ((k + Math.random() * 0.7) / rays) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const tx = dx > 0 ? (r.width - ix) / dx : dx < 0 ? -ix / dx : Infinity;
    const ty = dy > 0 ? (r.height - iy) / dy : dy < 0 ? -iy / dy : Infinity;
    const t = Math.min(tx, ty);
    rim.push([ix + dx * t, iy + dy * t]);
  }
  rim.sort((a, b) => Math.atan2(a[1] - iy, a[0] - ix) - Math.atan2(b[1] - iy, b[0] - ix));
  rim.forEach((p, i) => {
    const q = rim[(i + 1) % rim.length];
    const shard = document.createElement('div');
    shard.className = 'shard';
    shard.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    shard.style.clipPath = `polygon(${ix}px ${iy}px, ${p[0]}px ${p[1]}px, ${q[0]}px ${q[1]}px)`;
    const copy = card.cloneNode(true);
    copy.classList.remove('locked');
    shard.append(copy);
    fxLayer.append(shard);
    const cx = (ix + p[0] + q[0]) / 3 - ix;
    const cy = (iy + p[1] + q[1]) / 3 - iy;
    const len = Math.hypot(cx, cy) || 1;
    const fly = 70 + Math.random() * 170;
    const spin = (Math.random() - 0.5) * 240;
    shard.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${(cx / len) * fly}px, ${(cy / len) * fly + 130}px) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      { duration: 650 + Math.random() * 350, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)' },
    ).onfinish = () => shard.remove();
  });
}

// ------------------------------------------------- aiming and shooting ----

let locked = null;
function setLocked(card) {
  if (card === locked) return;
  if (locked) locked.classList.remove('locked');
  if (card) card.classList.add('locked');
  locked = card;
}

// Aim assist: lock the nearest card, and stay on it until the laser is clearly
// closer to another one. Negative distance means "inside the card".
const LOCK_REACH = 40;
const LOCK_STICKY = 16;
function distToRect(r, x, y) {
  const dx = Math.max(r.l - x, 0, x - r.r);
  const dy = Math.max(r.t - y, 0, y - r.b);
  if (dx || dy) return Math.hypot(dx, dy);
  return -Math.min(x - r.l, r.r - x, y - r.t, r.b - y);
}
function pickTarget(x, y) {
  let best = null;
  let bestD = Infinity;
  let currentD = Infinity;
  for (const r of rects) {
    if (r.el.classList.contains('dead')) continue;
    const d = distToRect(r, x, y);
    if (r.el === locked) currentD = d;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  if (!best || bestD > LOCK_REACH) return null;
  if (locked && best.el !== locked && currentD <= LOCK_REACH && bestD > currentD - LOCK_STICKY) {
    return rects.find((r) => r.el === locked);
  }
  return best;
}

// Moves the laser. With `assist`, the dot is pulled toward the locked card's
// centre, which hides the last bit of hand shake.
function aim(x, y, assist) {
  const target = pickTarget(x, y);
  setLocked(target ? target.el : null);
  let lx = x;
  let ly = y;
  if (assist && target) {
    lx = x + (target.cx - x) * 0.55;
    ly = y + (target.cy - y) * 0.55;
  }
  laser.style.transform = `translate(${lx}px, ${ly}px)`;
  return { x: lx, y: ly, card: target ? target.el : null };
}

function shoot(x, y, card) {
  const now = performance.now();
  if (now - score.lastKillAt > STREAK_MS) score.streak = 0;
  score.shots += 1;
  score.firstShotAt ??= now;
  pew(1 + Math.min(score.streak, 8) * 0.07);
  muzzle(x, y);

  if (card && card.classList.contains('dead')) card = null;
  if (!card) {
    score.streak = 0;
    hole(x, y);
    updateStats();
    return;
  }
  const r = card.getBoundingClientRect();
  x = clamp(x, r.left + 4, r.right - 4);
  y = clamp(y, r.top + 4, r.bottom - 4);

  if (card.classList.contains('pinned')) {
    ting();
    sparks(x, y);
    pop(x, y, 'BULLETPROOF');
    restart(card, 'ricochet');
    updateStats();
    return;
  }

  const id = Number(card.dataset.id);
  const bounty = card.classList.contains('wanted');
  crash();
  shatter(card, x, y);
  card.classList.remove('locked');
  card.classList.add('dead');
  if (locked === card) locked = null;
  shotByMe.add(id);
  if (ext) chrome.tabs.remove(id).catch(() => shotByMe.delete(id));

  score.kills += 1;
  score.streak += 1;
  score.best = Math.max(score.best, score.streak);
  score.lastKillAt = now;
  score.lastShotAt = now;
  if (bounty) pop(x, y, 'BOUNTY CLAIMED');
  const name = STREAK_NAMES[Math.min(score.streak, STREAK_NAMES.length - 1)];
  if (name) {
    showBanner(name);
    fanfare(Math.min(score.streak, 7) - 2);
  }
  updateStats();
  checkSweep();
}

async function undo() {
  if (!score.kills) return;
  if (ext) {
    try {
      await chrome.sessions.restore();
    } catch {
      return;
    }
    // Restoring focuses the revived tab; come straight back to the range.
    if (selfTabId !== null && selfTabId >= 0) chrome.tabs.update(selfTabId, { active: true });
  } else {
    const last = [...shotByMe].pop();
    shotByMe.delete(last);
    refreshSoon();
  }
  score.kills -= 1;
  score.streak = 0;
  banner.classList.remove('stay');
  updateStats();
}

function holster() {
  if (ext) chrome.runtime.sendMessage({ type: 'holster' });
}

// ------------------------------------------------------ hand tracking ----

let finder = null;
let lastVideoTime = -1;
let lastHandAt = -1e9;
let handEverSeen = false;
let mouseAiming = false;
let frames = 0;
let fps = 0;
let fpsMark = performance.now();
const openedAt = performance.now();
const trigger = new GunTrigger();
const filtX = new OneEuro();
const filtY = new OneEuro();
const aimHistory = [];

// The hand controls the laser like a trackpad: wherever the hand first shows
// up becomes the middle of the screen, and a comfortable reach covers all of
// it. Pushing past an edge drags the zone along, so nothing is out of reach.
const zone = { set: false, cx: 0.5, cy: 0.5, hw: 0.2, hh: 0.26 };
function handToScreen(px, py) {
  if (!zone.set) {
    zone.set = true;
    const frameAspect = video.videoWidth / video.videoHeight || 16 / 9;
    zone.hw = clamp((zone.hh * (innerWidth / innerHeight)) / frameAspect, 0.12, 0.42);
    zone.cx = clamp(px, zone.hw, 1 - zone.hw);
    zone.cy = clamp(py, zone.hh, 1 - zone.hh);
  }
  let nx = (px - zone.cx) / (2 * zone.hw) + 0.5;
  let ny = (py - zone.cy) / (2 * zone.hh) + 0.5;
  if (nx < 0) { zone.cx += nx * 2 * zone.hw; nx = 0; }
  if (nx > 1) { zone.cx += (nx - 1) * 2 * zone.hw; nx = 1; }
  if (ny < 0) { zone.cy += ny * 2 * zone.hh; ny = 0; }
  if (ny > 1) { zone.cy += (ny - 1) * 2 * zone.hh; ny = 1; }
  return [nx, ny];
}

let statusKey = '';
function setStatus(key, text, cls = '') {
  if (key === statusKey) return;
  statusKey = key;
  statusEl.textContent = text;
  statusEl.className = cls;
}

function drawSkeleton(hand, isGun) {
  skelCtx.clearRect(0, 0, skel.width, skel.height);
  if (!hand) return;
  const lm = hand.landmarks;
  const px = (p) => [p.x * skel.width, p.y * skel.height];
  skelCtx.lineWidth = Math.max(2, skel.width / 160);
  skelCtx.strokeStyle = isGun ? '#ff2d3d' : 'rgba(255,255,255,0.8)';
  skelCtx.beginPath();
  for (const [a, b] of HAND_EDGES) {
    skelCtx.moveTo(...px(lm[a]));
    skelCtx.lineTo(...px(lm[b]));
  }
  skelCtx.stroke();
  skelCtx.fillStyle = isGun ? '#ff2d3d' : '#fff';
  skelCtx.beginPath();
  skelCtx.arc(...px(lm[8]), skelCtx.lineWidth * 2.2, 0, Math.PI * 2);
  skelCtx.fill();
  if (!debugEl.hidden) {
    const k = skel.width / video.videoWidth;
    skelCtx.strokeStyle = 'rgba(255, 201, 77, 0.8)';
    skelCtx.lineWidth = 1;
    skelCtx.strokeRect(hand.roi.x * k, hand.roi.y * k, hand.roi.s * k, hand.roi.s * k);
  }
}

function aimAt(time) {
  for (let i = aimHistory.length - 1; i >= 0; i--) {
    if (aimHistory[i].t <= time) return aimHistory[i];
  }
  return aimHistory[0];
}

function tick(now) {
  requestAnimationFrame(tick);
  if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let hand;
  try {
    hand = finder.detect(video);
  } catch {
    return;
  }
  frames += 1;
  if (now - fpsMark > 1000) {
    fps = Math.round((frames * 1000) / (now - fpsMark));
    frames = 0;
    fpsMark = now;
  }

  if (!hand) {
    trigger.update(null, now);
    drawSkeleton(null, false);
    const gone = now - lastHandAt;
    if (gone > 500 && !mouseAiming) {
      // short dropouts leave the laser where it was; a real absence hides it
      laser.classList.remove('on', 'aiming');
      setLocked(null);
      filtX.reset();
      filtY.reset();
      aimHistory.length = 0;
    }
    if (gone > 1200) zone.set = false;
    if (gone > 500) setStatus('idle', 'No hand seen. Hold a finger gun up where the camera box can see it.');
    const idleFor = now - (handEverSeen ? lastHandAt : openedAt);
    if (fromStandby && idleFor > (handEverSeen ? 3000 : 8000)) holster();
    return;
  }

  lastHandAt = now;
  handEverSeen = true;
  mouseAiming = false;
  const a = analyze(hand.world, trigger.isGun);
  const fired = trigger.update(a, now);
  drawSkeleton(hand, trigger.isGun);

  // Aim with the whole index finger, not just the tip: steadier, and it
  // barely moves when the thumb drops.
  const lm = hand.landmarks;
  const ax = (lm[5].x + lm[6].x + lm[7].x + lm[8].x) / 4;
  const ay = (lm[5].y + lm[6].y + lm[7].y + lm[8].y) / 4;
  const [nx, ny] = handToScreen(1 - ax, ay); // mirrored
  const x = filtX.filter(nx, now / 1000) * innerWidth;
  const y = filtY.filter(ny, now / 1000) * innerHeight;

  laser.classList.add('on');
  laser.classList.toggle('aiming', trigger.isGun);
  const shown = aim(x, y, true);
  aimHistory.push({ t: now, ...shown });
  while (aimHistory.length > 1 && now - aimHistory[0].t > 500) aimHistory.shift();

  if (fired) {
    const past = aimAt(now - TUNING.aimLagMs);
    shoot(past.x, past.y, past.card);
  }

  if (trigger.isGun) setStatus('aim', 'Aiming. Drop your thumb to fire.', 'live');
  else setStatus('hand', 'Hand found. Point your index finger, curl the others, thumb up.', 'live');

  if (!debugEl.hidden) {
    debugEl.textContent =
      `fps ${fps}  gun ${trigger.isGun ? 'yes' : 'no'}  armed ${trigger.armed ? 'yes' : 'no'}\n` +
      `index ${a.index.toFixed(2)}  others ${a.others.map((v) => v.toFixed(2)).join(' ')}\n` +
      `thumb ${a.thumb.toFixed(2)}  peak ${trigger.peak.toFixed(2)}\n` +
      `hand ${Math.round((hand.extent / video.videoHeight) * 100)}% of frame  zoom ${(Math.min(video.videoWidth, video.videoHeight) / hand.roi.s).toFixed(1)}x`;
  }
}

// -------------------------------------------------------------- camera ----

const cameraEl = $('camera');
let stream = null;

async function savedCameraId() {
  if (!ext) return localStorage.getItem('cameraId');
  return (await chrome.storage.local.get('cameraId')).cameraId || null;
}
function saveCameraId(id) {
  if (ext) chrome.storage.local.set({ cameraId: id });
  else localStorage.setItem('cameraId', id);
}

async function openStream(deviceId) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  skel.width = Math.round(video.videoWidth / 2) || 640;
  skel.height = Math.round(video.videoHeight / 2) || 360;
  $('camwrap').style.aspectRatio = `${video.videoWidth || 16} / ${video.videoHeight || 9}`;
  lastVideoTime = -1;
  zone.set = false;
  return stream.getVideoTracks()[0].getSettings().deviceId;
}

// Pick the laptop's own camera over a phone or virtual camera unless the user chose one.
async function chooseCamera(currentId) {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const saved = await savedCameraId();
  const builtIn = cams.find((c) => /facetime|built-?in|integrated/i.test(c.label));
  const want =
    (saved && cams.some((c) => c.deviceId === saved) && saved) || (builtIn && builtIn.deviceId) || currentId;
  cameraEl.replaceChildren(
    ...cams.map((c, i) => {
      const o = document.createElement('option');
      o.value = c.deviceId;
      o.textContent = c.label || `Camera ${i + 1}`;
      return o;
    }),
  );
  cameraEl.hidden = cams.length < 2;
  let active = currentId;
  if (want && want !== currentId) {
    try {
      active = await openStream(want);
    } catch {
      active = await openStream(null);
    }
  }
  cameraEl.value = active;
}

cameraEl.addEventListener('change', async () => {
  saveCameraId(cameraEl.value);
  try {
    await openStream(cameraEl.value);
  } catch {
    setStatus('camfail' + cameraEl.value, 'That camera would not start. Pick another one.', 'error');
  }
});

async function startCamera() {
  try {
    const current = await openStream(null);
    await chooseCamera(current);
  } catch {
    setStatus(
      'nocam',
      'Camera is blocked. Allow it from the camera icon in the address bar, then reload. Mouse aim and click still work.',
      'error',
    );
    return;
  }
  setStatus('loading2', 'Camera on. Loading hand tracking…');
  try {
    finder = new HandFinder(await createTracker('GPU'));
  } catch (err) {
    setStatus('notracker', `Hand tracking failed to load (${err.message}). Mouse aim and click still work.`, 'error');
    return;
  }
  setStatus('idle', 'No hand seen yet. Hold a finger gun up where the camera box can see it.');
  requestAnimationFrame(tick);
}

// ------------------------------------------------- mouse and keyboard ----

addEventListener('mousemove', (e) => {
  if (performance.now() - lastHandAt < 600) return; // the hand has the laser
  mouseAiming = true;
  laser.classList.add('on', 'aiming');
  aim(e.clientX, e.clientY, false);
});
addEventListener('click', (e) => {
  if (e.target.closest('.ui')) return;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  shoot(e.clientX, e.clientY, under && under.closest ? under.closest('#range .card:not(.dead)') : null);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') holster();
  else if (e.key === 'z' || e.key === 'Z') undo();
  else if (e.key === 'd' || e.key === 'D') debugEl.hidden = !debugEl.hidden;
});
$('undo').addEventListener('click', undo);
$('holster').addEventListener('click', holster);

const standbyEl = $('standby');
if (ext) {
  chrome.storage.local.get(['standby', 'standbyError']).then((v) => {
    standbyEl.checked = !!v.standby;
    if (v.standbyError) {
      pop(innerWidth / 2, 90, `Raise-to-draw stopped: ${v.standbyError}`);
      chrome.storage.local.remove('standbyError');
    }
  });
  standbyEl.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'standby-set', on: standbyEl.checked });
  });
} else {
  standbyEl.closest('label').hidden = true;
}

const windowOnlyEl = $('window-only');
async function loadWindowOnly() {
  windowOnly = ext ? !!(await chrome.storage.local.get('windowOnly')).windowOnly : localStorage.getItem('windowOnly') === '1';
  windowOnlyEl.checked = windowOnly;
}
windowOnlyEl.addEventListener('change', () => {
  windowOnly = windowOnlyEl.checked;
  if (ext) chrome.storage.local.set({ windowOnly });
  else localStorage.setItem('windowOnly', windowOnly ? '1' : '0');
  refresh();
});

// Test hook for automated checks; harmless in normal use.
window.__range = { shoot, aim, undo, refresh, score };

loadWindowOnly().then(refresh).then(startCamera);
