// Service worker: opens and closes the range tab, and runs the optional
// raise-to-draw watcher in an offscreen document.
const RANGE_URL = chrome.runtime.getURL('gallery.html');

async function getRangeTab() {
  const { rangeTabId } = await chrome.storage.session.get('rangeTabId');
  if (rangeTabId == null) return null;
  try {
    return await chrome.tabs.get(rangeTabId);
  } catch {
    await chrome.storage.session.remove('rangeTabId');
    return null;
  }
}

async function openRange(source) {
  const existing = await getRangeTab();
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await stopWatcher(); // the range page takes over the camera
  const tab = await chrome.tabs.create({
    url: `${RANGE_URL}?src=${source}`,
    index: active ? active.index + 1 : undefined,
    windowId: active ? active.windowId : undefined,
  });
  await chrome.storage.session.set({ rangeTabId: tab.id, returnTabId: active ? active.id : null });
}

async function holster() {
  const range = await getRangeTab();
  const { returnTabId } = await chrome.storage.session.get('returnTabId');
  if (returnTabId != null) {
    try {
      await chrome.tabs.update(returnTabId, { active: true });
    } catch {
      // the tab we came from was shot; Chrome will pick a neighbour
    }
  }
  if (range) await chrome.tabs.remove(range.id);
}

// ---- raise-to-draw watcher -------------------------------------------------

async function standbyOn() {
  const { standby } = await chrome.storage.local.get('standby');
  return !!standby;
}

async function startWatcher() {
  if (await chrome.offscreen.hasDocument()) return;
  const { cameraId } = await chrome.storage.local.get('cameraId');
  await chrome.offscreen.createDocument({
    url: cameraId ? `offscreen.html?cam=${encodeURIComponent(cameraId)}` : 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Watch the webcam for a finger-gun gesture to open the tab range.',
  });
}

async function stopWatcher() {
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
}

async function syncWatcher() {
  const range = await getRangeTab();
  if ((await standbyOn()) && !range) await startWatcher();
  else await stopWatcher();
}

// ---- events ----------------------------------------------------------------

chrome.action.onClicked.addListener(() => openRange('manual'));
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-range') openRange('manual');
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'holster') await holster();
    else if (msg.type === 'draw') await openRange('standby');
    else if (msg.type === 'standby-set') {
      await chrome.storage.local.set({ standby: !!msg.on });
      // while the range is open the watcher stays off; it starts on holster
    } else if (msg.type === 'standby-error') {
      await chrome.storage.local.set({ standby: false, standbyError: msg.message });
      await stopWatcher();
    }
    sendResponse({ ok: true });
  })();
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { rangeTabId } = await chrome.storage.session.get('rangeTabId');
  if (tabId !== rangeTabId) return;
  await chrome.storage.session.remove(['rangeTabId', 'returnTabId']);
  await syncWatcher();
});

chrome.runtime.onStartup.addListener(syncWatcher);
chrome.runtime.onInstalled.addListener(syncWatcher);
