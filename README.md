# Finger Gun Tabs 🔫

I don't close tabs. I execute them.

A Chrome extension: point a finger gun at your webcam, aim the red laser at a tab, drop your thumb, and the tab is closed. For real.

Everything runs on your computer. The camera feed never leaves your laptop, and there's no account, server or tracking.

## Install (2 minutes)

It isn't on the Chrome Web Store, so you load it yourself:

1. Download this repo: green **Code** button → **Download ZIP**, then unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped `finger-gun-tabs` folder.
5. Click the red crosshair icon in the toolbar, or press **Alt+G**, and allow the camera.

Works in Chrome and other Chromium browsers (Edge, Brave, Arc).

## How to use

- **Aim:** make a finger gun with your thumb up. The laser follows your index fingertip and snaps to the nearest tab.
- **Fire:** drop your thumb. Pew. The tab is gone.
- **Undo:** press **Z** to bring the last tab back.
- **Leave:** press **Esc**, or lower your hand.

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

## Privacy

Hand tracking runs locally with Google's MediaPipe model. No video, images or tab data are sent anywhere. The extension's permissions are only for listing, closing and restoring your tabs, showing their icons, and remembering your camera choice.

## Credits

Hand tracking: [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 0.10.14 and the hand_landmarker model by Google, Apache License 2.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Made by Rajvi Shah. MIT licensed: see [LICENSE](LICENSE).
