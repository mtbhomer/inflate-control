# MeditationVest BLE v6 · six analog channels

Use this package with the six-channel hub pin table. BLE device: **MeditationVest**.

| Channel | Pump | Valve | Analog sensor OUT |
|---|---|---|---|
| CH0 | D4 | D17 | D35 |
| CH1 | D23 | D22 | D34 |
| CH2 | D25 | D26 | D32 |
| CH3 | D19 | D18 | VP / GPIO36 |
| CH4 | D16 | D27 | VN / GPIO39 |
| CH5 | D13 | D14 | D33 |

All sensors use 3.3 V and a separate ADC1 input. Every hub connector uses
**P4 pump / P5 valve**, with P6 unused. Firmware v6 changes only CH1's actuator
GPIO assignment from v5: **pump D23, valve D22**. Other channel pins are unchanged.

## CH1 wiring and firmware must agree

- Keep the original hub conductors: **D23 / C16 → P4 / A15 pump** and
  **D22 / C15 → P5 / A14 valve**. If you applied the preceding hub-swap proposal,
  restore these endpoints with all power disconnected.
- On the previously working CH1 module, check **L3 / J1 P5 → actual pump-driver
  input**, **M3 / J1 P4 → actual valve-driver input**. If opposite, exchange only
  the M3/L3 command-wire ends; if already correct, do not swap again.
- Keep driver ends, power wiring and the working pump in V1 / valve in P1.
  Standard modules already use J1 P5 for pump and P4 for valve.
- Upload **v6** yourself with battery physically disconnected and JP5 open.
  v5 assigns CH1 D22/D23 oppositely. Verify the complete signal paths and v6
  output timing with actuator power disconnected before a powered test.

This update changes no sensor pin, cycle timing, repeat/link behavior or BLE name.
Module correction and hardware verification are not recorded as completed.

Module printed coordinates are A–X on the solder side; hub coordinates remain
A–X on the component side, USB up.

## Upload and verify

1. Physically disconnect the actuator battery and leave JP5 open.
2. Check every signal lead against the six-channel hub manual, including unused
   P6 contacts. Remove any GPIO connections that conflict with this map.
3. Upload this sketch yourself to the classic ESP32. It compiles for
   `esp32:esp32:esp32`; no assistant upload or actuation has occurred.
4. Open the HTTPS control page in Bluefy, connect to MeditationVest, and compare
   each sensor voltage with a meter. The app supports all six independent inputs.
5. Keep actuator power disconnected for output checks. Run one channel with
   2 seconds pump and 10 seconds hold: its pump GPIO should be high only while
   pumping, its valve through pumping and hold, both low after release.
   Explicitly verify D16/D17 on the received board; their labels are reported,
   but the ESP-32 shield marking does not establish whether they are internally
   reserved. If they fail to switch or the board restarts, do not apply actuator
   power. Resolve the module's pin availability first.
6. Verify local 6 V supplies and test one unworn, vented module at a time.
   Six-channel controls do not establish six-pump battery, fuse or wire capacity.

## Controls

- Pump 0.05–2 seconds; hold and release interval 0–10 seconds.
- Valve lead 100 ms. Pump stops before hold; valve releases after hold.
- One cycle, 1–999 total cycles, or repeat until Stop.
- No fixed delay after the final release. A zero repeat interval does not
  establish physical deflation between cycles.
- Link any two channels with one shared timing command. Unlink restores each
  channel's saved timings. Independent channels have separate state.
- Finite patterns finish after BLE disconnection. Continuous patterns finish
  their current cycle and release; reconnect never starts a pattern.
- Stop & release, or serial `x`, turns all outputs off when received.

## Sensor display

All six ADC1 pins use 12-bit acquisition and ADC_11db attenuation. Four raw/
millivolt sample pairs are averaged; Arduino performs separate conversions for
these APIs. Output is volts, a 30-second chart, ADC range percentage and limit
indicators. It is not calibrated pressure or inflation. A floating input can
still produce a reading. Sensor data is display-only; no pressure cutoff.

The control task owns GPIO and runs separately from BLE and sensor acquisition.
Three notifications are sent per 50 ms: summary, one channel detail, one analog
packet. Each channel refreshes nominally every 300 ms; physical BLE performance
and six-channel hardware timing remain to be checked. Stale values are blanked.

## Protocol

Service `8d5a0001-4c7b-4f45-9d68-8e0c2c970001`; command/status/info use 0002,
0003/0004 respectively. Protocol version 2, firmware revision 5, enabled mask63,
analog mask63, sensor selector255. Fixed 20-byte summary/detail/analog packets
retain channel identity and session nonce. Commands are 18 bytes, sequenced,
serialized and session-checked. Stop bypasses the normal command queue.

## Checks

`clang++ -std=c++17 -Wall -Wextra -pedantic firmware/tests/hub_ble_test.cpp -o /tmp/hub-ble-test`
then `/tmp/hub-ble-test`; compile with Arduino-ESP32 core3.2.1.
Software checks do not establish physical pin, pressure or power validation.

[Espressif GPIO reference](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html)
