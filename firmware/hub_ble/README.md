# MeditationVest BLE v12

BLE name: **MeditationVest**. This firmware adds per-zone pump speed to breathing and body-scan sequences,
using the existing 100 Hz PWM output driver. The working GPIO map is unchanged.

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
require v10. Timed exercises require v8 or newer; sequence speed requires v12.
Earlier firmware keeps its supported controls. The current download is v12;
`hub_ble-v11.zip` retains the previous release.

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
  target, pump speed, pump limit, hold, released interval and zone duration. Choose a round
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
They constrain sensor-target exercises and PWM comparisons, not manual calibration bursts, timed channel tests or patterns.

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

## Pump speed in sequences (v12)

Open **Sequences → Breathing or Body scan → zone → Pump speed**. Each zone has
its own saved value from **25–100% in steps of 5%**. Existing and new sequences
start at 100%; targets, channel mapping, timing, repeats and voices are retained.
The Exercises screen shows the saved speed beside each zone's target and duration.
Settings stay locked while any exercise, channel test or pattern is active.

The percentage sets electrical PWM duty, not measured motor RPM or pressure. It
applies throughout every pumping phase, including repeated cues and rounds. Both
channels assigned to a zone use that zone's speed. In sensor mode, each pump still
stops independently at its own target; both valves hold and release together.
In timed mode, pumping lasts for the configured time at the chosen duty.

Lower duty may require more time to reach the same target. The existing pump limit
remains at most 2 s; it is not automatically extended. If a sensor target is not
reached within the selected limit, the routine stops and releases as before.
Adjust target and pump limit in Sequences after checking the actual bag response.
Preview demonstrates slower inflation and timeout behavior with synthetic feedback;
it is not a fitted model of the CH0 measurements or a prediction for another pump.

Speed is stored with the sequence in this browser and sent transactionally before
each Start. Every enabled zone's speed must be acknowledged before the app commits
the exercise. Old firmware can still run 100% sequences; reduced-speed sequences
are blocked until firmware v12 is installed, with no silent full-power fallback.
Manual switches, calibration increments, timed channel tests and debug patterns
continue at 100%. The separate PWM bench test keeps its own chosen test duty.
Valve outputs, GPIO mapping, channel selection and sensor targets are unchanged.
The output driver remains 100 Hz / 10 bit with no startup boost. User-reported v11 CH0
bench trials demonstrated slower pressure rise at lower duty and smooth starts at
25%; this is not a guarantee for every motor or simultaneous paired operation.
No v12 routine has been physically actuated by the assistant.

## PWM comparison test (v11 and later)

Open **Device → Pump speed test**. Choose an enabled channel with a working sensor
and a maximum saved in Sensor setup. Use the same airbag and tubing and fully vent
between runs; compare similar starting pressures. Check the pump's flyback diode is
fitted before PWM testing. Start at 100%, then try 80%, 60%, 40% and 25% one at a time.
Stop if the pump stalls or stutters; do not repeat a stalled setting.

**1 second is the default pump duration**, with 0.5 s and 0.25 s alternatives.
Each click selects the valve for 100 ms, drives the pump at the chosen duty for up
to the requested time, holds 200 ms for a final sensor sample, then releases. There
is no cooldown or automatic repeat. The selected duty is applied from startup with
no full-power kick-start, so the test can reveal poor starting at lower duties.
Calibration increments and channel tests continue at 100% duty; valves remain
on/off. This bench-test setting is separate from the per-zone sequence speed.

The ESP32 records the averaged millivolt reading just before pumping, the actual
commanded pump interval, sample count, and the final held reading before release.
The app converts these to nominal sensor-span percentages and computes:
`inflation rate = (end percentage - start percentage) / pump interval in seconds`.
The unit is **percentage points per second (pp/s)**. This is a comparison of pressure
rise in the same setup, not motor RPM, calibrated airflow or bag-volume percentage.
The endpoint includes 200 ms settling; this is an effective rise per pump-on second,
not an instantaneous derivative. Sensor averaging (~80 ms), elasticity, starting
pressure, leakage, battery voltage and pump coast-down affect the result.

Pumping stops early at the saved channel maximum; these trials are marked
**shortened**, with their actual interval shown. Starting above the maximum skips
pumping and produces no rate. Missing/stale (500 ms) readings and ADC endpoints
release the test. A new held sample is required for a completed result. Stop,
disconnect, output error or missing final report produces no valid comparison rate.
Maximums are experimental settings, not rated pressure protection; analog input
presence and overshoot are not guaranteed by these checks.

Add the observed start and sound/airflow notes to each result, then **Copy results**
to share them. The latest 30 results per hub stay in this browser; disabled channels
are hidden from results and exports. Preview trials are clearly simulated and
separate from stored hardware results. No results are sent to a server.

LEDC drives all six pumps at a fixed **100 Hz, 10-bit resolution**. Full-on is the
core's continuous-high 1023 duty special case. API initialization/write failure
latches pump outputs off (detach and GPIO LOW) and releases valves; new actuation
requires a hub restart. There is no fallback to full power on an error. PWM duty is
not a measured pump speed. Hardware waveform, driver heating and diode performance remain unverified.
The user reported smooth starts at 25% on one CH0 module in v11 trials; usable
frequency/duty ranges across all motors and v12 routines are not established.

Implementation reference: [Espressif Arduino LEDC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html).
Core 3.2.1's local implementation was checked for full-on behavior; seller claims
about driver switching time do not establish a verified PWM rating.

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

Protocol2, firmware12, flags255, enabled/analog mask0–63, sensor selector255.
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

Op11 stages a zone's pump speed after its op5 timing and op7 targets:
aux = stage index 0–2, mask = same enabled zone channels, pump field = duty 25–100
in 5% steps, hold/release/repeats zero. It requires idle state, current staged zone,
accepted targets and unexpired 5 s staging. Invalid speed or order clears staging.
A newly configured stage defaults to 100% for compatibility; the v12 app explicitly
sends and acknowledges every stage's speed. Stop/disconnect clears staging, and
a rejected, expired, unconfirmed or cancelled speed request prevents the app from
sending the final op6 commit. Session/sequence/replay/250ms receive-expiry checks
also apply. Runtime speed changes are rejected while an exercise is active.

Op10 is a single PWM comparison: one enabled-channel mask, pump field250/500/1000ms,
hold field duty 25–100% in 5% steps, release field maximum201–2700mV, repeats1, aux0.
It requires fresh sensor data and exclusive idle outputs. Summary low flags bit1
marks PWM activity; calibration bit0 and PWM bit1 are mutually exclusive. Reply9
means a latched pump-output failure; Stop is still accepted, but the latched fault
remains reported until restart.

PWM report0x40 is20bytes: byte2 channel,3 duty,4–5 requestedms,6–9 session,
10–11 startmV,12–13 endmV,14–15 actualpumpms,16 result,17 samplecount,18–19 commandseq.
Little endian; mV65535 is unavailable. Results1 select/2 pump/3 settle/4 full-duration/
5 maximum/6 sensorfault/7 stopped/8 disconnect. Reports never acknowledge commands.
A final report repeats for2s; the browser matches its own session/sequence and marks
a missing final report unconfirmed. During PWM, the selected sensor uses the50ms
analog notification slots; the native sample average still updates at~80ms. PWM
reports replace routine/detail slots during a test and for2s afterwards. Notification
count remains at most three per50ms; normal telemetry cadence resumes afterwards.

Summary byte19 is active exercise kind1/2, 0 idle, or fault marker
`0x80 | (fault << 3) | channel` (fault1 sensor invalid, fault2 target timeout).
0x30 packets contain kind/phase/step/count, session, round/repeats, phase remaining,
16-bit zone elapsed and 16-bit pulse count. Phases1–6: preparation, valve lead,
inflate, hold, release gap, released remainder. Analog data stays in 0x20 packets.
At most three notifications per 50 ms: summary, alternating exercise/detail, analog.
Disabled channels' detail/analog slots are skipped, not reassigned.
Nominal refresh: exercise100ms, analog channel300ms, debug detail channel600ms.

Native controller/protocol/channel-selection/calibration/PWM/sequence-speed tests and Node model/transport/audio
tests cover these behaviors. The classic ESP32 target compiles with core3.2.1.
Persistence is tested with a storage callback; a real power-cycle restore and
on-device notification reduction have not been physically verified for this release.
Software/simulated checks do not establish physical pressure response or simultaneous
paired-module performance. No assistant upload, BLE hardware connection or actuation.
