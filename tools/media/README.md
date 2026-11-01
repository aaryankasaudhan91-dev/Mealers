# Narrated Mealers explainer

Build with `python tools/media/build_explainer.py` from the repository root.
Requires Python with Pillow, FFmpeg/FFprobe on PATH, and Windows Segoe UI fonts.
The checked render and matching poster, transcript and VTT are written to
`work/voiceover/render/`. After review, copy those files to
`frontend/public/media/mealers-explainer.{mp4,jpg,txt,vtt}` (poster.jpg becomes
mealers-explainer.jpg).

Sources are kept unchanged in `assets/`: speech.mp3 is the user's supplied
recording; campus.jpg and music.wav are reused from the prepared Mealers film.
The previous 20-second film is retained locally at
`work/voiceover/original-explainer.mp4` and remains available in Git history.
The longer graphic sequence matches the 70.608-second supplied speech at 1x;
it does not stretch or loop the old film. Picture length rounds up to a frame.
The original instrumental plays quietly under the opening with sidechain
ducking and a fade to speech alone. All pricing references use INR/rupees.

`timeline.json` stores speech-timed scene and card cues. `alignment.json`
retains local faster-whisper tiny.en recognition word times. Recognition
corrections (Priced, needs, Forecasting) follow the existing narration brief.
`transcript.txt` preserves the narration. Captions are a selectable native
English VTT track, not burned into the picture.

Verification includes complete FFmpeg decode, codec/duration checks,
speech-to-picture duration consistency, nonoverlapping caption intervals,
encoded-frame inspection and encoded-audio loudness measurements. Audible
listening review and browser playback were not performed. Scene graphics
are conceptual; customer, pricing and savings claims remain unvalidated.
