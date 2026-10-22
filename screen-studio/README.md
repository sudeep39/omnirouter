# Screen Studio

A local Loom-style recorder with presenter camera, rolling microphone transcript, editable captions, transcript-driven cuts, AI replacement speech, and MP4 export. Built separately from OmniRouter.

## Run on Windows

Requires Node.js 22 or newer and desktop Chrome or Edge.

```powershell
cd screen-studio
npm.cmd install
Copy-Item .env.example .env
# Set OPENAI_API_KEY in .env to enable AI features.
npm.cmd start
```

Open http://localhost:4310. FFmpeg and FFprobe are bundled through npm; no system installation is needed. Set `FFMPEG_PATH` / `FFPROBE_PATH` to override them. The server binds only to this computer. No publishing or cloud storage is required.

## Teleprompter

Paste a script into the **Teleprompter**, then click **Float over shared screen**. On desktop Chrome/Edge with Document Picture-in-Picture, the reader opens in an always-on-top window. Drag its title bar onto your presentation display and resize its edges. The script and pace, size, mirror, playback, and rewind controls move out of the recorder app into that window. You can work in your presentation without switching back to read. Closing the floating window returns the script and settings to the app and pauses scrolling. Browsers without Document PiP open a regular popup, which cannot guarantee staying on top.

Rehearse with **Start scrolling**, adjust pace from 40–240 words/min and text size from 20–64 px. **Preview in app** and **Focus reader** are optional rehearsal modes. Pace estimates use the rendered script height; natural pauses and line breaks affect reading speed. Script and preferences stay in this browser's local storage. Opening the floating window requires a click; it cannot open automatically after the browser's screen picker.

**Follow recording** starts the reader at the beginning for a new take or restart, pauses with the recorder, resumes from your place, and stops on finish or cancellation. Disable it for independent rehearsal. Mouse wheel, touch, or scrollbar interactions pause automatic scrolling. **Back to start** rewinds; scrolling stops at the end. Mirror text supports physical teleprompter mirrors.

With the reader focused, Space toggles scrolling, Up/Down move through the script, +/− adjust pace, and Esc exits in-app focus. Shortcuts do not intercept typing in inputs. The floating window owns its animation, so scrolling continues while the recorder tab is in the background. The reader is outside the compositing canvas: sharing a specific presentation tab/window keeps the separate reader out of that source, while sharing an entire display may record the visible overlay. The browser controls window placement; this app cannot inject a reader into another application's content or force it onto the display selected in the screen picker.

## Workspace interface

The recorder follows Loom?s capture-to-edit flow: select **Screen + camera**, **Screen only**, or **Camera only** in the recording settings card, choose devices, and start. Finishing automatically opens **Your recording**, with the video on the left and transcript editing on the right. Use **Audio cleanup** for silence/filler suggestions, then apply changes and download. **Record a video** returns to setup without discarding the current video; a new take still asks before replacing it. **Speaker notes** opens the floating teleprompter setup. The sidebar, purple actions, device card, camera bubble, and video/editor layout draw on Loom?s UI while retaining Screen Studio?s name and local storage model.

## Workflow

1. Choose **Screen + camera**, **Screen only**, or **Camera only**, then select your devices, microphone, optional shared audio, and transcript language. Start recording; screen modes prompt for a screen, window, or tab. The presenter appears in a circular bubble in the combined mode. Drag the bubble in the preview, change its size/position, or hide it. Bubble placement is remembered locally.
2. Speak to see an approximate rolling transcript. Browser speech recognition may send microphone audio to the browser vendor and may require network access. It listens to the default microphone independently of the mixed recorded audio; a selected non-default microphone may differ from the live recognizer's microphone. System audio is not transcribed live. Recording continues if recognition fails. English, Spanish, French, German, Portuguese, Hindi, and Japanese are selectable; **Detect after recording** skips live recognition and lets AI detect the recorded language.
3. **Pause/Resume** excludes paused time from the video and transcript clock. **Restart** discards the current take and starts again on the same captured source. **Cancel** discards the take without uploading it. Both ask for confirmation inside the app.
4. **Finish** saves the original WebM locally, automatically transcribes recorded audio with word timestamps if AI is configured and the automatic-transcription checkbox is enabled, and prepares an MP4. AI failure leaves the rolling transcript available and does not prevent a caption-only MP4 export. You can regenerate the transcript afterward; regeneration replaces draft edits and establishes a new baseline transcript. Uploads are limited to 500 MB, and AI transcription audio to 24 MB; long recordings are not chunked.
5. Use **Find / Correct to** to correct one or all whole-word/phrase occurrences in captions. These corrections preserve the original audio. The segment's **Correct captions / segment controls** section allows free text and timing edits. Changing the number of words or manual timestamps discards that segment's word alignment; regenerate or use its segment controls to edit the video.
6. Click a timestamp to preview a segment. Click a timed word and Shift-click the last word of a phrase, then choose **Trim selection** or **Replace speech**. A trim removes precisely the selected time interval from picture and audio. A replacement splits out that phrase and leaves the rest of the segment intact. Cuts include microphone, system audio, and presenter video. Untouched gaps are preserved. Selections crossing existing trims/replacements are rejected; undo or choose an unedited phrase.
7. Use **Undo**, **Redo**, or **Revert to original** to recover edits. Apply changes to generate replacement speech and render the edited MP4 from the original. Draft changes reset playback to the original; the edited result plays after rendering. In-app captions show only one active subtitle track, while the downloaded MP4 contains selectable subtitles. Download the MP4 and/or SRT captions.

## Audio cleanup

Open **Audio cleanup** after recording:

- **Find audio gaps** analyzes actual recorded audio locally using FFmpeg; no AI key or transcript is needed. Defaults detect audio below −35 dB for at least one second, preserving 0.12 seconds at each edge. Change the minimum duration, quiet threshold, and edge padding, then rescan. Louder thresholds detect more quiet portions. The combined recorded audio is analyzed, so system audio or background sound can prevent a gap from being classified as quiet. Known transcript word intervals are protected, as are manual cuts and generated speech replacements.
- **Find filler words** uses existing transcript word timestamps. The default detects `um`, `uh`, `ah`, `uhm`, `umm`, `erm`, `er`, and `hmm`. Optional broader matching includes `you know`, `I mean`, `sort of`, `kind of`, `basically`, `actually`, `literally`, and `like`; a custom comma-separated list and immediately repeated words are also supported. Matching is based on transcript text and word timing, not contextual language understanding. Broader phrases, repetitions, and even hesitations can be intentional, so review them. Fillers omitted by transcription cannot be found or removed automatically. English lists are supplied; use a custom list for other languages.
- The suggestion list shows original timestamps and provides playback previews. Deselect cuts you want to retain. The summary shows the total proposed duration reduction, merging overlapping cuts. **Apply changes** removes the selected intervals from both audio and picture, removes corresponding caption words, retimes subtitles, and exports the cleaned MP4. Cleanup selections are separate from the transcript, so **Undo**, **Redo**, **Clear cleanup cuts**, and **Revert to original** remain available. Regenerating the transcript clears cleanup selections along with other draft edits.

Cleanup is limited to 500 suggestions. Gap detection measures quiet audio rather than recognizing speech; very quiet speech or a noisy room may need different settings. Cut boundaries in the picture are limited by video frame precision. Rendering uses uncompressed intermediate audio and encodes AAC once at the final join to avoid accumulating audio encoder delay across many short cuts.

AI speech uses `gpt-4o-mini-tts` with Coral, Alloy, or Sage, with at most ten replacement intervals per video. This is a synthetic voice, not a clone of the presenter. It replaces all audio in the interval (including background/system audio), adjusts speed to fit that interval, and does not change mouth movements. Large duration differences are rejected; use a similar number of replacement words or adjust segment boundaries. Each render regenerates replacement speech and incurs charges. API usage requires a funded provider account. MP4 metadata and the suggested filename disclose generated speech.

AI transcription uses `whisper-1` for word and segment timestamps. The app offers word editing only where provider text and timestamps align; it never invents per-word timing. See the official [speech-to-text](https://developers.openai.com/api/docs/guides/speech-to-text) and [text-to-speech](https://developers.openai.com/api/docs/guides/text-to-speech) documentation. Browser limitations are documented by [MDN screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) and [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Loom behavior used as reference

Loom's official product and support documentation informed the workflows within the requested recording/transcription/editing/export scope:

| Reference | Implemented behavior |
| --- | --- |
| [Capture modes](https://support.atlassian.com/loom/docs/use-looms-different-capture-modes/) | Screen, camera, combined recording; movable/resizable/hideable camera bubble. |
| [Pause/resume](https://support.atlassian.com/loom/docs/pause-and-resume-while-recording/) and [restart](https://support.atlassian.com/loom/docs/restart-a-recording/) | Pause, resume, discard/restart a take, and cancellation. |
| [Transcript corrections](https://support.atlassian.com/loom/docs/correct-your-transcript/) | Search and correction of one/all occurrences update captions while preserving audio. |
| [Edit by transcript](https://support.atlassian.com/loom/docs/edit-your-loom-video/) | Select timed words/phrases to trim video, plus undo and recoverable edits. |
| [Text-to-speech corrections](https://support.atlassian.com/loom/docs/fix-mistakes-without-re-recording-using-text-to-speech/) | Select a phrase, enter similarly sized replacement text, apply, and listen; maximum ten replacements. |
| [Silence and filler removal](https://support.atlassian.com/loom/docs/remove-filler-words-and-silences-from-your-video/) | Detect gaps and timed fillers, review reversible cuts, and include cleanup in downloaded MP4. |
| [Video download](https://support.atlassian.com/loom/docs/download-your-loom-video/) | Download a standard MP4 after recording or after applying edits. |

This implements the relevant workflow locally, not full Loom feature parity. Loom documents replacement speech in the presenter's voice; this app uses disclosed stock synthetic voices. Native desktop overlays, a waveform editor, cloud sharing, team collaboration, clip stitching, contextual ramble detection, and custom voice generation are outside this version. The rolling live transcript is an explicit requirement here in addition to Loom's post-recording transcript workflow.

## Storage and limits

Media and intermediate renders remain in the ignored `recordings/` folder. The editing session itself lives in the browser tab; download before closing it. Remove unneeded files from `recordings/` when the server is stopped. API keys are read only by the server and never sent to the browser. Original downloads are WebM; final exports are standard MP4. AI operations fail visibly if credentials or network access are unavailable. Screen-only and camera-only modes record native source tracks; the combined mode uses a worker timer for canvas composition instead of background-paused animation frames. Operating-system sleep, browser suspension, device unplugging, or minimized capture sources can still disrupt capture; verify a short test on your machine.

## Verification

```powershell
npm.cmd test
npm.cmd run test:browser
```

Unit/API/media tests cover validation, exact word selections, caption corrections, undo/redo, pause-aware timing, preserved gaps, shifted captions, tempo filters, and real FFmpeg rendering. Cleanup tests verify silence detection against generated audio, filler/phrase/repeat matching, protected word intervals, merged cuts, shifted captions, shorter output, removal of long silences, retained audible audio, and sub-frame intervals. They verify H.264/AAC, subtitles, output duration, and actual audio replacement. The browser test uses installed Edge by default (`BROWSER_CHANNEL=chrome` selects installed Chrome). It verifies real MediaRecorder/compositing/upload/rendering with a fake webcam/mic, fixture screen source and rolling recognizer, and injected AI transcription/speech. It exercises all capture modes, pause/resume, restart/cancel, automatic transcription, word edits, cleanup previews/selections, cleanup undo/redo, combined cleaned MP4, single-track preview captions, and mobile layout. Gap candidates in the browser test are fixtures; actual audio detection is covered by API/media tests. It saves a screenshot to ignored `artifacts/browser-qa.png`. No paid AI calls are made by tests.

Manual acceptance checks (requires interactive screen/camera/microphone permissions and an API key):

| Requirement | Check |
| --- | --- |
| Screen and presenter | Record a moving screen while waving at the camera. Both should appear in original playback. |
| Rolling transcript | Speak several sentences. Final and interim text should appear without interrupting recording. Deny speech access or disconnect network and verify visible failure with continued recording. |
| Recording controls | Verify each capture mode with your actual devices. Pause for five seconds, resume, and confirm those seconds are excluded. Restart/cancel should discard without saving. Move, resize, and hide the camera bubble. |
| Transcript editing | Auto-transcribe; correct one/all occurrences, select a timed phrase with Shift-click, and undo/redo. Revert should recover the baseline transcript. |
| Apply changes | Trim a selected phrase; replace another with AI speech. Apply and verify the exact cut, synthetic audio, unchanged outside audio, and synchronized captions. |
| Audio cleanup | Record several one-second pauses and some “um”/“uh” hesitations. Transcribe, scan gaps/fillers, preview and deselect an intentional pause, then apply. Verify shorter MP4, removal of selected fillers, synchronized captions, and recovery through Undo/Revert. |
| Standard video download | Download MP4 and play in VLC or another H.264/AAC player. Enable its subtitle track. Original WebM remains downloadable. |
| Failure recovery | Cancel capture permissions; confirm controls recover. Try AI without a key; confirm clear feedback. Invalid/overlapping edits should fail without replacing the prior original. |

Real OS capture permissions, physical device behavior, live speech-service availability, and paid provider calls are not certified by fixture tests; run these manual checks on your machine before relying on the app for an important recording.
