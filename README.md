# MeditationVest control · v8

[Open the app](https://mtbhomer.github.io/inflate-control/) in Bluefy on iPhone.
Download the matching firmware from Device and upload it yourself with actuator
battery disconnected and JP5 open. GPIOs are unchanged from the working v7 hub.

Four bottom tabs separate Exercises, Zones, Sequences and Device. Exercises is a
simple choose-and-start view. Zones has independent Front/Back mapping and sensor
reference capture. Sequences holds targets, timings, repeats and voice options.
Device contains connection settings and the original per-channel debugging tools.

Exercises can inflate to per-channel calibrated sensor percentages or use timed
inflation. Each zone repeats inflate/hold/release cues for its configured duration;
body scan progresses upper/middle/optional lower back. The ESP32 executes timing
and feedback. See [firmware details](firmware/hub_ble/README.md) for limits,
calibration semantics, sensor faults, GPIOs and protocol.

Narration is optional: prepared ElevenLabs Multilingual v2 clips, Sarah and Lily,
with device-voice fallback. All 16 clips are static MP3 files with scripts/hashes
in dist/audio/manifest.json. Generated once using the owner's authorized OpenRouter
account; no credential, source deck or live generation request is published.

Automatic reconnect only reuses a previously selected device; new permission still
requires Connect. Browser support controls restoration after page reload. The
reconnect handler never replays a command. Preview sends no Bluetooth commands
and keeps synthetic calibration separate from real device calibration.

Checks: `npm ci --ignore-scripts` then `node --test tests/*.test.mjs`; native `tests/hub_ble_test.cpp` and
`tests/hub_routine_test.cpp`; `arduino-cli compile --fqbn esp32:esp32:esp32 firmware/hub_ble`.
GitHub Pages publishes only dist/. Canonical firmware is copied by the private
workspace's package script. Software checks are not a powered vest test.

References: [Web Bluetooth permissions](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/getDevices),
[Bluefy connection guide](https://bluefy.app/guide.html),
[OpenRouter TTS](https://openrouter.ai/docs/guides/overview/multimodal/tts),
[ElevenLabs Multilingual v2](https://openrouter.ai/elevenlabs/eleven-multilingual-v2).
