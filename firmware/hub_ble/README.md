# MeditationVest BLE v10

BLE name: **MeditationVest**. This firmware adds nominal sensor-range percentages and cumulative
calibration bursts to the existing exercises and controls. The working GPIO map is unchanged.

| Channel | Pump | Valve | Analog sensor OUT |
|---|---|---|---|
| CH0 | D4 | D17 | D35 |
| CH1 | D23 | D22 | D34 |
| CH2 | D25 | D26 | D32 |
| CH3 | D19 | D18 | VP / GPIO36 |
| CH4 | D16 | D27 | VN / GPIO39 |
| CH5 | D13 | D14 | D33 |

All sensors use 3.3 V and separate ADC1 inputs. Every hub connector uses P4 pump,
P5 valve, P6 unused, P7 analog OUT and P8 3V3. The opposite module connector uses
J1 P5 pump and P4 valve. The user has reported successful hub tests with the same
module/cable on each port. This update does not require rewiring.

## Install

Disconnect the actuator battery physically and keep JP5 open. Upload this sketch
using the classic ESP32 target (`esp32:esp32:esp32`). The user uploads; this release
has not been flashed or physically actuated by the assistant. Reconnect in Bluefy
after upload. Channel selection requires v9; sensor-range targets and calibration bursts
require v10. Timed exercises require v8 or newer.
Earlier firmware keeps its supported controls. The current download is v10;
`hub_ble-v9.zip` retains the previous release.

## Enabled channels

Open **Device → Enabled channels**, select the boards in use, then **Apply channels**.
Changes are accepted only when idle. Stop an exercise, test or pattern first.
All six channels are enabled initially; selecting none is allowed and you can
re-enable them from the same settings. Applying a selection never starts outputs.

The ESP32 saves the selection in Preferences/NVS and restores it at startup.
The app reads the hub's selection on connection, including when using another phone.
An unchanged selection does not rewrite flash; a failed save retains the previous
selection. The browser caches the last confirmed selection for offline display only.
Preview settings are separate and never change the hub or its cached selection.

Disabled channels are hidden from zone assignments, sensor displays, channel tests
and linking choices. They remain visible in the Enabled channels picker. Their
outputs stay off, actuator commands are rejected, and analog sampling and per-channel
BLE notifications are skipped. This does not disconnect their wired 3.3 V supply.
Remaining channels keep their normal refresh interval; overall BLE traffic drops.

Saved zone assignments and channel maximums are retained when a channel is disabled.
Only enabled members participate in an exercise; a saved pair can run with one
enabled member. A required zone with no enabled member prevents Start until assigned
an enabled channel. Re-enabling restores saved assignments, unless that zone's
assignment was edited while the channel was disabled.

## Four app screens

- **Exercises:** choose Breathing or Body scan, then Start. No settings to edit.
- **Zones:** independent Front / Back view; select a visual zone and assign one
  or two channels. Back zones have distinct assignments. View live sensor percentages.
- **Sequences:** choose which sequence to configure, select its zone, and edit
  target, pump limit, hold, released interval and zone duration. Choose a round
  count or Until Stop, optional lower back, preparation delay and spoken guidance.
- **Device:** connection options, enabled channels, firmware download, and channel tests,
  individual switches, linked patterns, sensor setup, voltage/ADC readings and charts.

Changing the Zones view or the sequence being edited does not change the exercise
selected on Exercises. Exercise settings are saved locally in the browser;
enabled-channel selection is saved on the hub.

## Sensor-range percentages and channel maximums

The user selected **100% = the sensor's full theoretical range**, not a captured
full airbag. The app uses the nominal positive-pressure XGZP6847A 3.3 V profile:
**0.2 V = 0%, 2.7 V = 100%**. Percentage = `(millivolts - 200) / 25`.
This profile is based on the discussed manufacturer/seller specification; the exact
received part suffix has not been independently established. See the
[manufacturer product page](https://cfsensor.com/product/xgzp6847a/).

No manual zero/ceiling capture is needed. Values below 0% or above 100% remain
visible numerically; the meter graphic is bounded. These are nominal sensor-span
percentages, not air volume or a verified pressure/safety calibration. Voltage,
ADC conversion, sensor offset and supply errors still affect accuracy.

In **Device → Sensor setup**, choose an enabled channel. Enter its **Maximum
exercise target**, or use the calibration buttons below to find a suitable level
and **Save current level as maximum**. For example, a full airbag reading of 8%
saves an 8% maximum; it does not relabel that reading as 100%. Maximums start blank,
are saved per hub in this browser, and remain separate from Preview settings.
They constrain sensor-target exercises, not manual bursts, timed tests or patterns.

Sequence targets use the same sensor percentage, from 0.1–100%. A target must be
at or below every assigned channel's maximum. Paired channels share a percentage
target; each pump stops independently at its measured target, followed by shared
hold and release. Targets convert to **millivolts**, not guessed raw ADC counts:
`targetMv = round(200 + 25 × percent)`. Firmware compares its averaged calibrated
millivolt reading. A raw-ADC/voltage ratio is used only for synthetic Preview data.

Passing a target, channel maximum or nominal 100% **does not cancel an exercise**.
If already above target, the pump remains off and the valve enters hold, then
releases normally. No top-up occurs during hold. An exercise normally ends when
its configured zone duration and round count finish; the completion voice reflects
that. Round count and per-round duration appear before Start when ready.

Missing/stale (500 ms) samples, actual ADC endpoints and target timeout still stop
and release sensor-target exercises. A floating analog input can look plausible;
this is not reliable sensor-presence detection. Four-sample averaging introduces
response delay. Physical overshoot has not been validated by software tests.

Old reference-based percentage targets are cleared on migration, while channel
mappings, timing, repeat and voice choices remain. They cannot safely be reinterpreted
as percentages of the sensor's full span. Old reference storage is left intact.
Older firmware supports its existing manual/timed controls, but the app does not
send millivolt targets to firmware expecting raw ADC targets.

## Calibrating the airbag's full level

Device → Sensor setup puts a live reading beside **Add air · 0.1 s**, **Add air · 1 s**,
**Release**, and **Save current level as maximum**. Only one channel can calibrate
at a time. Each click selects the valve for 100 ms, pumps for the requested interval,
then keeps the valve on. Another increment can start once holding, retaining the
existing air. The firmware owns every timer; browser delay cannot extend a burst.

Release/Stop or disconnect ends calibration immediately when handled. Otherwise
it releases automatically 10 s after the last burst. Increment buttons are blocked
while pumping, while another channel/test/pattern is active, or during an exercise.
These manual bursts intentionally do not stop at the saved maximum, allowing it
to be re-established. Save the current level after the pump stops; capture rounds
down to 0.1% and rejects stale data/ADC endpoints. It changes an exercise setting,
not a rated pressure limit. No automatic repeated calibration bursts are sent.

Pump outputs remain on/off at the existing power level. PWM speed control is
technically possible with ESP32 LEDC, but driver switching frequency, pump starting
behavior and usable duty range have not been tested; no PWM control is added here.

## Exercise sequencing

Breathing uses front zone D as a cue for natural breathing awareness, not fixed
inhale/exhale pacing. Body scan uses upper → middle → optional lower back.
Default back durations are 30 s per zone, with 30 s preparation; front defaults
to 5 s preparation and a 30 s window. These are editable testing defaults.

Within each zone, inflate → hold → release repeats. A new pulse starts only if its
complete worst-case duration fits in the remaining zone window. Any final remainder
stays released. At most two channels are assigned to one zone; one zone operates
at a time. These limits do not establish battery/wire current capacity.

The ESP32 owns the sequence and feedback decisions; BLE/UI timing does not control
pump shutdown. Stop, serial `x`, and Bluetooth disconnect end exercises immediately
when handled. No exercise resumes automatically. Delayed controller ticks never
replay missed zones or bursts. Settings commit atomically after every zone has
been validated, and expire if incomplete. Tests/patterns cannot start while an
exercise is settling or released between pulses.

## Channel tests and legacy patterns

Device contains the previous controls, with sensor readings beside each channel.
Manual pump ON expires at 2 s and valve ON at 10 s. Changing one switch does not
renew the other's timer. One test channel at a time; combined tests run one cycle.
States describe commanded outputs, not measured actuator feedback.

Legacy patterns retain independent/paired operation, 1–999 cycles or Until Stop,
pump 0.05–2 s, hold/release 0–10 s, and no cooldown after the final release.
Finite patterns finish after BLE disconnect; continuous patterns finish their
current cycle then release. Tests stop on disconnect. Reconnection never sends
an actuator command. Sensors remain display-only for these legacy controls.

## Connection and audio

First connection requires choosing the device. Automatic reconnection reuses only
the exact previously permitted device ID. Restoration across page reloads depends
on browser support for getDevices; same-page reconnect can reuse its device object.
There is no unrestricted proximity scan or selection by name alone. Explicit
Disconnect, Preview mode, disabled reconnect, and hidden pages suppress retries.
The Connect button remains the fallback for Bluefy. Fresh session validation runs
on each connection and no command or exercise is replayed.

Optional narration uses prepared **ElevenLabs Multilingual v2** clips (Sarah/Lily)
generated once through OpenRouter, with a device-voice fallback and speed selector.
The public app contains audio files, not API credentials or live TTS requests.
Voice prompts run once per zone/round, not every inflation. Stop, disconnect and
page hiding cancel audio, including clips still loading. Background/Bluefy audio
behavior remains device-dependent; text guidance stays visible. Short configured
windows may interrupt a longer prompt at the next zone. Voice quality is subjective.

## Firmware protocol and checks

Protocol2, firmware10, flags255, enabled/analog mask0–63, sensor selector255.
18-byte commands and 20-byte telemetry retain session nonce, sequence, replay and
receive-expiry checks. Opcodes1–4 preserve pattern/stop/manual/exclusive test.
New staged commands: op5 = zone timing (aux index, mask channels, pump max, hold,
release gap, repeats field = zone window); op7 = target millivolts (pump/hold fields =
first/second channel in ascending order, 201–2700 mV, 0/0 timed mode); op6 = commit (aux kind1/2,
mask stage count, pump field preparation, repeats round count, zero means forever).
Invalid/incomplete configuration never starts outputs. Stop invalidates staging.

Op8 sets the enabled-channel mask (0–63). Aux, pump, hold, release and repeats must
all be zero. It uses the same session, replay and 250 ms receive-expiry checks.
It is rejected during any active output or routine, including preparation and
released intervals. Accepted changes clear staged routines and stale channel/sensor
state; GPIOs are committed off before the flash write. Reply8 means storage failed.
The authoritative mask and command acknowledgement arrive in one summary packet:
byte14 is the mask and byte15 is `0xa9`, replacing the retired digital-sensor age.
Firmware v9 also supports channel selection. Earlier versions are decoded separately.

Op9 requests one calibration increment: single enabled-channel mask, pump field
100 or 1000 ms; aux, hold, release and repeats zero. Replay/expiry checks apply.
The summary low flags bit0 marks calibration activity in v10; it must accompany
one active channel in Select/Pump/Hold, never a routine. GPIO pin assignments and
all existing Stop, disconnect and enabled-channel protections are unchanged.

Summary byte19 is active exercise kind1/2, 0 idle, or fault marker
`0x80 | (fault << 3) | channel` (fault1 sensor invalid, fault2 target timeout).
0x30 packets contain kind/phase/step/count, session, round/repeats, phase remaining,
16-bit zone elapsed and 16-bit pulse count. Phases1–6: preparation, valve lead,
inflate, hold, release gap, released remainder. Analog data stays in 0x20 packets.
At most three notifications per 50 ms: summary, alternating exercise/detail, analog.
Disabled channels' detail/analog slots are skipped, not reassigned.
Nominal refresh: exercise100ms, analog channel300ms, debug detail channel600ms.

Native controller/protocol/channel-selection/calibration tests and Node model/transport/audio
tests cover these behaviors. The classic ESP32 target compiles with core3.2.1.
Persistence is tested with a storage callback; a real power-cycle restore and
on-device notification reduction have not been physically verified for v10.
Software/simulated checks do not establish physical pressure response or simultaneous
paired-module performance. No assistant upload, BLE hardware connection or actuation.
