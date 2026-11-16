// Raise-to-draw watcher: runs hidden, looks for a finger gun held for half a
// second, then asks the service worker to open the range.
import { createTracker, analyze, HandFinder } from './hand.js';

const HOLD_MS = 500;
const INTERVAL_MS = 80;

async function main() {
  const video = document.getElementById('video');
  // Offscreen pages cannot read extension storage; the service worker passes the camera in the URL.
  const cameraId = new URLSearchParams(location.search).get('cam');
  const open = (extra) =>
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...extra }, audio: false });
  let stream;
  try {
    stream = await open(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'user' });
  } catch {
    stream = await open({ facingMode: 'user' });
  }
  video.srcObject = stream;
  await video.play();
  const finder = new HandFinder(await createTracker('CPU'), 256);

  let gunSince = null;
  let lastGunAt = -1e9;
  let wasGun = false;
  let sent = false;
  setInterval(() => {
    if (sent || video.readyState < 2) return;
    const now = performance.now();
    const hand = finder.detect(video);
    wasGun = !!hand && analyze(hand.world, wasGun).isGun;
    if (!wasGun) {
      if (now - lastGunAt > 300) gunSince = null; // brief dropouts are forgiven
      return;
    }
    lastGunAt = now;
    if (gunSince === null) gunSince = now;
    if (now - gunSince >= HOLD_MS) {
      sent = true;
      stream.getTracks().forEach((t) => t.stop());
      chrome.runtime.sendMessage({ type: 'draw' });
    }
  }, INTERVAL_MS);
}

main().catch((err) => {
  chrome.runtime.sendMessage({ type: 'standby-error', message: String(err && err.message ? err.message : err) });
});
