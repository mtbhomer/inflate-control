# MeditationVest control · v7

Mobile Web Bluetooth UI for six independent pump/valve channels and six analog
sensors. Open the HTTPS GitHub Pages site in Bluefy and upload the matching
`dist/hub_ble.zip` yourself. See the firmware README for the exact GPIO table.

The default Test channels mode offers one combined cycle and independent pump/valve switches, one channel at a time. Pump switches expire after 2 seconds, valves after 10 seconds; Stop and disconnection turn test outputs off. Patterns & links preserves repeat controls.

Each channel shows voltage, ADC-range percentage and a collapsible graph, plus
pump/hold times. Link any two boards; run once, set a repeat count, or repeat
until Stop. No fixed cooldown follows the last release. Sensor data is display
only. Firmware capability flags still determine which controls are enabled.
The page has a clearly marked preview that sends no Bluetooth commands.

The hardware plan uses CH1 D23 pump / D22 valve and preserves CH2 GPIOs, uses six distinct ADC1 pins,
and requires USB-only verification of the D16/D17 headers before actuator power.
Six-pump current capacity, pressure calibration and physical six-channel timing
remain unverified. No assistant upload or hardware actuation is performed.

## Checks

`node --test tests/protocol.test.mjs`

`clang++ -std=c++17 -Wall -Wextra -pedantic tests/hub_ble_test.cpp -o /tmp/hub-ble-test`

`arduino-cli compile --fqbn esp32:esp32:esp32 firmware/hub_ble`

Serve this directory locally to use `preview.html` (393 CSS px phone frame).
GitHub Pages Actions publishes only dist/. Canonical firmware lives in the
private research workspace; its package script copies only the intended source,
tests and firmware download into this public repository.

[Espressif GPIO reference](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html)
