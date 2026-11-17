# MeditationVest control · v11

[Open the app](https://mtbhomer.github.io/inflate-control/) in Bluefy on iPhone.
Download the matching firmware from Device and upload it yourself with actuator
battery disconnected and JP5 open. GPIOs are unchanged from the working v7 hub.

Four bottom tabs separate Exercises, Zones, Sequences and Device. Exercises is a
simple choose-and-start view. Zones has independent Front/Back mapping and live sensor
readings. Sequences holds targets, timings, repeats and voice options.
Device contains connection settings and the original per-channel debugging tools.
Under **Enabled channels**, select the boards in use and press **Apply channels**
while idle. Disabled channels disappear from other screens; the hub skips their
sensor sampling and channel notifications and rejects actuator commands for them.
The selection is saved on the hub across restarts. All six default to enabled;
all-off and later re-enabling are supported. This setting requires firmware v9.
Saved zone assignments are retained, but only enabled members run. An empty required
zone blocks Start until an enabled channel is assigned. Preview changes stay local
to the preview and never alter the hub's selection. Sensor power remains connected.
Stop controls sit beside the exercise Start button and within Device controls;
only navigation stays fixed at the bottom.

Device → Sensor setup uses the nominal XGZP6847A 3.3 V profile: 0.2–2.7 V = 0–100%.
Choose a channel, add air in 0.1 s or 1 s increments while watching its reading,
then save the current percentage as its maximum exercise target. Air is held
between increments; Release or disconnect vents it, with a 10 s automatic release
after the last burst. These manual bursts ignore the saved maximum. Maximums are
saved per hub in this browser and do not rescale the sensor percentage. Old manual
reference targets are cleared while mappings/timings are preserved. Above 100%
does not cancel an exercise; ADC/sensor/timeout faults still stop it. This feature
needs firmware v10, which compares measured millivolts rather than raw ADC counts.
Device → **Pump speed test** adds a v11 PWM comparison. Choose a channel, duty and
pump duration (default **1 second**). Each finite test records sensor start/end
percentages and inflation rate in percentage points per second, holds 0.2 s for
the final reading, then releases. A saved channel maximum is required and stops
pumping early; shortened runs are identified. Fully vent the same bag between
comparisons. Start at 100% and decrease duty gradually; stop at stuttering/stall.
The frequency is 100 Hz, with no startup boost. This is a pressure-rise comparison,
not motor RPM or calibrated airflow. Normal controls remain 100% duty and valves
remain on/off. Add observations and Copy results. History is per hub/browser;
Preview data is separate. See the firmware details for diode checks and limits.
Physical PWM behavior has not yet been tested.

The progress panel appears during an exercise, with no redundant selected-zone
panel while idle.

Exercises can inflate to nominal sensor-range percentages or use timed
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
`tests/hub_routine_test.cpp`, `tests/hub_channels_test.cpp` and `tests/hub_calibration_test.cpp`;
`arduino-cli compile --fqbn esp32:esp32:esp32 firmware/hub_ble`.
GitHub Pages publishes only dist/. Canonical firmware is copied by the private
workspace's package script. Software checks are not a powered vest test.

References: [Web Bluetooth permissions](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/getDevices),
[Bluefy connection guide](https://bluefy.app/guide.html),
[OpenRouter TTS](https://openrouter.ai/docs/guides/overview/multimodal/tts),
[ElevenLabs Multilingual v2](https://openrouter.ai/elevenlabs/eleven-multilingual-v2).
