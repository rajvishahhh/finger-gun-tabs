# Finger Gun Tabs 🔫

I don't close tabs. I execute them.

A Chrome extension: point a finger gun at your webcam, aim the red laser at a tab, drop your thumb, and the tab is closed. For real.

Everything runs on your computer. The camera feed never leaves your laptop, and there's no account, server or tracking.

## Install (2 minutes)

It isn't on the Chrome Web Store, so you load it yourself:

1. Download this repo: green **Code** button → **Download ZIP**, then unzip it. You'll get a folder called `finger-gun-tabs-main`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `finger-gun-tabs-main` folder (the one with `manifest.json` directly inside it).
5. Pin it: click the puzzle-piece icon in the toolbar, then the pin next to **Finger Gun Tabs**.
6. Click the red crosshair icon, or press **Alt+G**, and click **Allow** when Chrome asks for the camera.

Works in Chrome and other Chromium browsers (Edge, Brave, Arc). Keep the folder where it is: Chrome loads the extension from it, so deleting or moving it removes the extension.

To update later, download the new ZIP, replace the folder, and click the reload arrow on the extension's card in `chrome://extensions`.

## Is it safe?

Yes, and you don't have to take my word for it. All the code is in this repo and it's small enough to read.

- **No internet use.** The extension makes no network requests. There's no server, account, analytics or tracking.
- **The camera stays local.** Video is processed on your computer, frame by frame, and never saved or sent anywhere.
- **No access to your pages.** It can't read or change what's on any website. The `tabs` permission only lets it see tab titles and URLs so it can draw and close them.
- **Nothing to install or run.** There are no .exe or .dmg files. Chrome runs it inside its own sandbox like any other extension.
- **The bundled hand-tracking files are Google's originals, unmodified.** `vendor/` is byte-for-byte MediaPipe Tasks Vision 0.10.14 from npm, and `models/hand_landmarker.task` is Google's official model (SHA-256 `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`).

Only download it from this repo, `github.com/rajvishahhh/finger-gun-tabs`. Copies elsewhere aren't mine.

Chrome may show a "Disable developer mode extensions" notice now and then. That's normal for anything not from the Web Store; click the X to keep it.

## How to use

- **Aim:** make a finger gun with your thumb up. The laser follows your index fingertip and snaps to the nearest tab.
- **Fire:** drop your thumb. Pew. The tab is gone.
- **Undo:** press **Z** to bring the last tab back.
- **Leave:** press **Esc**, or lower your hand.
- **This window only:** tick it in the range's top bar to show only the tabs in the window you opened it from.

## Things you'll find

- Kill streaks: DOUBLE KILL, TRIPLE KILL, TAB RAMPAGE, and a few more if you're fast.
- Your oldest untouched tabs get a **WANTED** poster. Shoot one to claim the bounty.
- Copies of the same page are marked **DUPLICATE**.
- Pinned tabs are **bulletproof**. Sorry.
- Close everything for a **CLEAN SWEEP**.

## Tips

- Sit in decent light with your hand clearly in front of the camera.
- Small hands work: it zooms in and follows your hand.
- If you have more than one camera (say, an iPhone as a webcam), pick the right one in the dropdown under the camera preview.

## Not working?

- **"Manifest file is missing":** you picked the wrong folder. Pick the one that has `manifest.json` directly inside it.
- **Black camera box:** click the camera icon at the right of the address bar and choose **Allow**, then reload the range. On a Mac, also check **System Settings → Privacy & Security → Camera** and make sure Chrome is ticked.
- **Camera already in use:** close Zoom, Meet, FaceTime or anything else using the webcam.
- **Alt+G does nothing:** another app may own that shortcut. Change it at `chrome://extensions/shortcuts`.
- **The laser won't lock on:** add more light, keep your whole hand in frame, and hold the thumb clearly up before dropping it.

## Privacy

Hand tracking runs locally with Google's MediaPipe model. No video, images or tab data are sent anywhere. The extension's permissions are only for listing, closing and restoring your tabs, showing their icons, and remembering your camera choice.

## Credits

Hand tracking: [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 0.10.14 and the hand_landmarker model by Google, Apache License 2.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Made by Rajvi Shah. MIT licensed: see [LICENSE](LICENSE).
