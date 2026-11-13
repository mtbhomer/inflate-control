# MeditationVest control · v2

Mobile Web Bluetooth control for an ESP32 pneumatic prototype. Static HTML,
CSS and JavaScript; no backend, framework, telemetry service or build step.

Open the HTTPS GitHub Pages link in **Bluefy** on iPhone. Upload the matching
`dist/hub_ble.zip` firmware first. The page offers a clearly marked interactive
preview that never sends Bluetooth commands.

- CH1: pump D22, valve D23; CH2: pump D25, valve D26, HX710 D32/D33.
- Per-channel pump 0.05–2 s, hold 0–10 s; defaults 1 s / 1 s.
- Link/unlink two boards with shared pump/hold/release times. Unlinked channels
  can run independent patterns. One command synchronizes a linked group.
- Run once, 1–999 total cycles, or Until Stop. No fixed cooldown after release.
- Finite patterns finish after BLE disconnect; Until Stop finishes its current
  cycle and cancels repetitions. No automatic start/retry/replay on reconnect.
- Stop & release all channels, live CH2 0–100% sensor range, vented zero,
  raw counts, fixed-scale chart and digital clipping indicator.
- Four additional channels are shown disabled. UI enables them only when
  firmware advertises assigned GPIOs; wiring and power must be planned first.
- Sensor data is display-only and uncalibrated; no kPa or pressure cutoff.
- Timing preferences stay in browser localStorage. Sensor data stays on the
  device/page and is not uploaded. Bluetooth is local; GitHub serves files only.

## Run and test

Serve the `dist/` directory over HTTPS (or localhost for desktop development).
The optional `preview.html` shows the same page in a 393 CSS px phone frame.

```sh
node --test tests/protocol.test.mjs
python3 -m http.server 8766 --bind 127.0.0.1
```

`firmware/hub_ble` contains the matching Arduino source. Native firmware test:

```sh
clang++ -std=c++17 -Wall -Wextra -pedantic tests/hub_ble_test.cpp -o /tmp/hub-ble-test
/tmp/hub-ble-test
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/hub_ble
```

The standalone repository test uses local header paths. The research workspace
retains its canonical firmware under `firmware/hub_ble`; the package script
copies that source into this public repository and firmware download.

## Publish

GitHub Pages Actions uploads only `dist/`. The equivalent Cloudflare Pages
setup is a static Direct Upload of `dist/`; no server or environment variables
are required. Never serve this page in an iframe for actual device control.

## References

- [Bluefy's developer](https://pnnsoft.com/portfolio/detail/bluefy-web-bluetooth-api-solution-for-ios-devices): Web Bluetooth on iOS and HTTPS requirement.
- [Chrome Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth): user gesture, GATT writes, notifications and reconnection.
- [Web Bluetooth specification](https://bluetooth.spec.whatwg.org/): characteristic access and connection behavior.
- [Espressif BLE library](https://github.com/espressif/arduino-esp32/tree/3.2.1/libraries/BLE): firmware's installed API version.

The user reported that v1 worked. V2 linking/repetition and simultaneous
pump current have not been physically verified. Firmware compilation, native
controller tests, JS transport/protocol tests and simulated UI preview are
software evidence only. See the firmware README for protocol v2 and details.
