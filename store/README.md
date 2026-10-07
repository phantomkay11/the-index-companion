# App Store screenshots and App Preview

Everything here is rebuilt from the app itself, using the invented sample farms in `mock-backend.mjs` (each one keeps its "Sample" label). Re-run it whenever the app changes, or once real photos are in.

| Output | Size | Apple slot |
| --- | --- | --- |
| `out/screenshots/iphone/*.png` (10) | 1320 × 2868 | iPhone 6.9" display |
| `out/screenshots/ipad/*.png` (6) | 2064 × 2752 | iPad 13" display |
| `out/the-index-app-preview-iphone.mp4` | 886 × 1920, 30 fps, about 29 s | iPhone App Preview |
| `out/the-index-app-preview-ipad.mp4` | 1200 × 1600, 30 fps, about 23 s | iPad App Preview |

App Store Connect scales the 6.9" and 13" sets down for smaller devices, so these two sets cover every iPhone and iPad.

## Run it

You need Playwright (`npm i -D playwright`), Python 3 with Pillow, and ffmpeg.

```bash
npx expo export --platform web       # build the web version the captures are taken from
node store/capture.mjs               # raw screens at iPhone and iPad sizes
node store/screenshots.mjs           # framed screenshots with headlines
node store/preview.mjs iphone              # App Preview: records each shot frame by frame
python3 store/preview_compose.py iphone    # adds the status bar, captions and fades, and encodes the video
node store/preview.mjs ipad                # the same for iPad
python3 store/preview_compose.py ipad
```

- Change headlines in `IPHONE` and `IPAD` in `screenshots.mjs`. Wrap words in `*asterisks*` to colour them.
- Change what happens in the video, and its captions, in `IPHONE_SHOTS` and `IPAD_SHOTS` in `preview.mjs`, and where each caption sits in `CONFIG` in `preview_compose.py`. The video must stay between 15 and 30 seconds; `preview_compose.py` checks.
- Re-record one shot: `node store/preview.mjs ipad farm`, then re-run `preview_compose.py ipad`.
- iPad previews are 1200 × 1600 here. If App Store Connect asks for a different iPad size when you upload, convert with `ffmpeg -i in.mp4 -vf scale=W:H -c:a copy out.mp4`; the 3:4 shape stays the same.

## Before submitting

- **Record from the iPhone build for the final upload.** Apple asks that previews show the app itself. These frames come from the same code running in a browser, so they look the same, but the map in particular differs (Apple Maps on iPhone, a plotted map here). For the final upload, record the same steps in the iOS Simulator (`xcrun simctl io booted recordVideo`) or on a phone with screen recording, and keep these captions.
- The video has a silent stereo track because App Store Connect expects audio. Add music or narration in any editor if you like; keep the frame rate and size.
- Poster frame: App Store Connect uses the 5-second mark by default, which lands on the farm profile.
