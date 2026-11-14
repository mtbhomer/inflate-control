# MeditationVest BLE v3

Mobile BLE control with linked boards and repeat patterns. Device name:
**MeditationVest**. Upload this v3 sketch to add CH1 voltage readings. The updated page also supports v2 for controls and CH2, and shows a CH1 upgrade prompt.
The service UUID is unchanged; old v1 firmware receives an upgrade message.

## Existing wiring

| Channel | Pump | Valve | Sensor |
|---|---|---|---|
| CH1, lower left | D22 | D23 | Analog OUT D34 / ADC1_CH6 |
| CH2, bottom left | D25 | D26 | HX710 OUT D32, SCK D33 |

CH1 retains its working software exchange. Actuator wiring is unchanged. The user reports adding the new CH1 sensor to D34; its output voltage and exact variant have not been measured here.
CH0/CH3/CH4/CH5 stay disabled and unplugged; earlier CH3 leads can share CH2
GPIOs. Six software slots exist, but independent GPIO wiring is required
before enabling more. `PinMap.h` validates unique assigned GPIOs.

## Upload and use

1. Physically disconnect the actuator battery and keep JP5 open during upload.
2. Open `hub_ble.ino` with all its `.h` files in the same folder. Select
   classic **ESP32 Dev Module**, the existing serial port and 115200 upload
   speed. Built with Arduino ESP32 **3.2.1**, bundled BLE and default partition.
3. Serial Monitor at 115200 shows **MEDITATION VEST BLE v3** and advertising
   **MeditationVest**. Serial `x` stops all outputs. Old serial `1`/`2`
   commands do not start this sketch.
4. Open the HTTPS control page in **Bluefy**, refresh it, tap **Connect hub**,
   and choose **MeditationVest**. Check status with actuator power off first.
   A connection never starts a cycle.
5. Set pump and hold times on a channel and use **Run once**. Expand
   **Repeat pattern** to choose the released interval and either **Set count**
   (1–999 total cycles) or **Until Stop**. **Stop & release** stops every channel.
6. Choose two channels and tap **Link boards**. Shared settings control both
   boards. One command starts both on the same firmware tick; all phases
   and repeats match. Unlink while idle to restore individual settings.
7. CH1 voltage appears directly, without a display zero. Fully vent the CH2 bag, then tap **Set vented zero** for its separate percentage chart.

The user reported that the previous v1 functions work. The new simultaneous
mode has not been physically tested. Battery output current and shared wire
ratings remain unknown; check the first linked trial on the bench. Output
status reports commands, not measured valve or motor feedback.

## Timing

Every cycle: valve select **100 ms**, pump **50–2000 ms**, hold **0–10000 ms**,
then both outputs OFF to release. Zero hold releases at pump-off. There is
**no fixed cooldown** after Run once, the final repeat, or Stop.

A repeat pattern adds your chosen **0–10000 ms released interval** between
cycles. Zero means no deliberate pause, with at least one output-off tick;
it does not guarantee that the bag has deflated. Final release becomes Ready
immediately, without waiting out that interval. Count means total cycles,
including the first. Defaults: pump 1 s, hold 1 s, release 1 s, 3 cycles.

Independent channels can overlap and use different patterns. Linked boards
use one mask and one shared set of times. An already-running member rejects
an entire linked request; it cannot partially start the pair. Changes to
linking/settings apply only to new runs. The firmware preserves an accepted
run's settings when the browser reloads or reconnects.

A dedicated control task owns GPIO and deadlines; notifications run separately.
A delayed loop releases before another cycle; it does not catch up missed
cycles with bursts. GPIO writes are sequential within the same control tick,
not electrically simultaneous edges.

## Disconnect and Stop

- **Set count:** accepted patterns finish their remaining cycles on the hub
  even if Bluetooth disconnects or the page closes.
- **Until Stop:** repeats while connected. A BLE disconnect finishes the
  current cycle, releases, and cancels further repeats. If already in the
  released interval, it ends immediately. There is no sensor-loss stop.
- Reconnect never restarts any pattern. Live status shows ongoing runs.
- Stop bypasses queued starts and releases all channels when received by the
  ESP32. It needs a working connection. The page reports an unconfirmed Stop;
  use the battery switch if necessary. Serial `x` also stops all channels.
- Closing/backgrounding a page does not necessarily disconnect BLE promptly;
  this is not a phone heartbeat timeout.

Session nonces, sequence ordering and a 250 ms queue expiry prevent stale
starts. Uncertain writes are never retried automatically. New starts are
unavailable when status is stale, but the Stop button remains available.

## CH1 analog voltage display

D34 reads the new CH1 sensor through hub A12 / module J3. Supply the sensor
from 3.3 V (hub A11 / module I3) with control ground (A16 / N3). Do not use
5 V on this direct ESP32 input. The received sensor's exact factory variant,
pressure range and transfer calibration are not confirmed.

The sketch uses 12-bit `analogRead` and `analogReadMilliVolts` with per-pin
`ADC_11db` attenuation. Four pairs of samples, spaced at least 20 ms apart,
are averaged into each displayed reading. These two APIs make separate ADC
conversions. Sampling runs in the telemetry loop, outside the GPIO/timing task.

The UI shows voltage, a fixed 0–3.3 V chart, raw ADC counts and a 0–100% ADC
range bar (`raw / 4095 * 100`). This is not pressure or bag fullness. Any raw
constituent at 0 or 4095 marks ADC FLOOR or ADC CEILING for that averaging
window, even when averaging would hide the endpoint. Near ceiling starts at
95% of raw ADC range. The useful voltage measurement range on classic ESP32
at this attenuation is approximately 0.15–3.1 V; the chart's top is not an
accuracy guarantee. No sensor-pressure endpoint is inferred.

Readings older than 500 ms are hidden; both sensors remain display-only.
A disconnected or floating analog input can still produce apparently fresh
values. There is no analog sensor-presence or communication-loss detection,
pressure calibration, clipping stop or automatic sensor-dependent actuation.
First check the displayed voltage against a meter with actuator battery
removed and JP5 open. The assistant did not perform a live measurement.

Reference: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html

## CH2 sensor range display

CH2 HX710 counts are signed 24-bit ADC readings, not pressure units. With
vented zero B, the displayed percentage is:

`100 × (raw − B) / (8,388,607 − B)`, clamped to 0–100%.

The chart has a fixed 0–100% scale. Zero is set deliberately for each connection;
an inflated sensor reading is never automatically treated as vented. Raw
counts remain visible in small text. Baselines at either digital endpoint are
rejected. Stale/invalid data is unavailable, rather than a frozen live number.

**Near digital limit** starts at 95%. **CLIPPED** means the ADC reports exactly
+8,388,607 or −8,388,608; negative clipping can therefore appear at 0% on this
positive-range meter. 100% is a digital ceiling, not fullness, kPa, a safe
pressure, or proof of usable transducer range. The transducer may saturate
or lose accuracy before the ADC endpoint. The display does not stop outputs.

## BLE protocol v2

All integers are little endian. Commands are 18 bytes; each notification is
20 bytes, so MTU 23 is sufficient. The UUIDs remain:

- Service `8d5a0001-4c7b-4f45-9d68-8e0c2c970001`
- Command `8d5a0002-4c7b-4f45-9d68-8e0c2c970001`: WRITE with response
- Status `8d5a0003-4c7b-4f45-9d68-8e0c2c970001`: READ + NOTIFY
- Info `8d5a0004-4c7b-4f45-9d68-8e0c2c970001`: READ

Command (18): version 2 at byte 0; op at 1 (1=start, 2=stop all);
channel bitmask at 2; reserved zero at 3; sequence u16 at 4; pump ms u16
at 6; hold ms u16 at 8; session u32 at 10; release ms u16 at 14; total
cycles u16 at 16 (0=until Stop). Stop requires zero mask and all timing/count
fields zero. Sequence 1–65535 per connection; reconnect to renew. Unknown
versions, malformed packets, old sequences and wrong sessions are ignored.

Summary notification (20): version at 0; type 0 at 1; sensor flags low
nibble and reply high nibble at 2; active mask at 3; acknowledged sequence
u16 at 4; session u32 at 6; raw i32 at 10; age ms u16 at 14 (saturates
65535); six 3-bit phases packed at 16–18; reserved zero at 19.
Phases: 0=off, 1=select, 2=pump, 3=hold, 4=released between repeats.
Flags: 1=has sample, 2=fresh, 4=frame error, 8=digital endpoint.
Replies: 0=none, 1=accepted, 2=busy, 4=invalid, 5=disabled, 6=stopped,
7=expired. A duplicate leaves the previous acknowledgement unchanged.

Channel detail notification (20): version at 0; 0x10 | phase at 1; channel
at 2; run's linked group mask at 3; current cycle u16 at 4; session u32 at
6; pump/hold/release ms u16 at 10/12/14; total cycles u16 at 16; phase
remaining ms u16 at 18. Detail packets cannot acknowledge commands. Continuous
cycle display saturates at 65535; disconnect converts its target to the
current cycle. Retained OFF details describe the last run, not a new one.

The hub emits a summary, one detail per enabled channel, and one CH1 analog packet about every
100 ms. Reads return a summary (an overlapping notification can yield a
detail or analog packet, which the client handles). Detail and summary observations are
approximate UI progress, not atomic measurements of physical outputs.

Info (20): version at 0; enabled mask at 1; sensor channel at 2; firmware
revision 3 at 3; u16 min pump/max pump/max hold/valve lead/max release at
4/6/8/10/12; session u32 at 14; feature flags 31 at 18 (previous 15 plus
bit 16 = analog telemetry); analog channel 1 at 19. Firmware v2 remains flags
15 / byte 19 zero, and the new UI accepts it without showing a false CH1 value.

Analog notification (20): protocol version 2 at 0; type 0x20 at 1; channel 1
at 2; flags at 3 (1=has sample, 2=fresh, 4=raw floor observed, 8=raw ceiling
observed); raw average u16 at 4; session u32 at 6; millivolts u16 at 10; age
ms u16 at 12, saturated at 65535; reserved zero at 14–19. This packet cannot
acknowledge a command or refresh the controls’ summary timestamp. CH2 summary
and all command/detail layouts are unchanged. Old v2 pages reject firmware
revision 3 at handshake; refresh the page to v3.

BLE has no application pairing secret; HTTPS serves the page but does not
authenticate the nearby device. Timing preferences stay in localStorage;
sensor/control data is not uploaded. This is a supervised prototype.

## Validation and rollback

Native tests cover linked phases, all timing boundaries, independent overlap,
atomic busy rejection, counted/continuous repeats, Stop, disconnect, immediate
restart, zero release, delayed updates, millis wrap, replay, expiry and
telemetry. JS tests cover matching packets, transport ordering/timeouts,
version compatibility, separate sensor identities, percentage/clipping arithmetic, analog averaging, saturation flags, stale data and packet validation. The phone-width
Safari preview uses simulated data and sends no Bluetooth commands.

The compiled v3 sketch and preview are software checks. Physical linked
current, radio behavior, phone backgrounding and actual pump/valve timing
still need verification. The assistant did not upload or actuate hardware.
Previous BLE firmware is archived as `hub_ble-v2.zip` and `hub_ble-v1.zip`; the separate serial
v4 program remains unchanged in the research workspace.
