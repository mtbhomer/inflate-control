#include <cassert>
#include <cstdio>
#include "../firmware/hub_ble/HubController.h"
#include "../firmware/hub_ble/BleProtocol.h"
int main(){
 HubController c(63);
 assert(c.calibrationPulse(2,100,0)==Reply::Accepted&&c.valve(1)&&!c.pump(1)&&c.calibrating());
 c.update(99);assert(!c.pump(1));c.update(100);assert(c.pump(1));
 assert(c.calibrationPulse(2,100,150)==Reply::Busy);assert(c.calibrationPulse(4,100,150)==Reply::Busy);
 c.update(200);assert(!c.pump(1)&&c.valve(1));
 assert(c.calibrationPulse(2,1000,300)==Reply::Accepted);c.update(400);assert(c.pump(1));c.update(1400);assert(!c.pump(1)&&c.valve(1));
 c.update(11399);assert(c.valve(1));c.update(11400);assert(!c.activeMask()&&!c.calibrating());
 assert(c.testCycle(2,100,0,12000)==Reply::Accepted&&!c.calibrating());c.stop();
 c.calibrationPulse(2,100,13000);c.endContinuous();assert(!c.activeMask());
 c.setEnabledChannels(1,14000);assert(c.calibrationPulse(2,100,14000)==Reply::Disabled);
 assert(c.calibrationPulse(1,500,14000)==Reply::Invalid);assert(c.calibrationPulse(3,100,14000)==Reply::Invalid);
 c.calibrationPulse(1,100,UINT32_MAX-50);c.update(49);assert(c.pump(0));c.update(149);assert(c.valve(0)&&!c.pump(0));c.stop();
 Command cmd;cmd.op=9;cmd.mask=1;cmd.pumpMs=100;cmd.repeats=0;cmd.session=42;cmd.seq=1;cmd.receivedAt=100;uint16_t seq=0;
 assert(applyCommand(c,cmd,42,42,seq,Reply::None,351)==Reply::Expired&&!c.activeMask());
 cmd.seq=2;cmd.receivedAt=400;assert(applyCommand(c,cmd,42,42,seq,Reply::None,400)==Reply::Accepted);
 uint8_t b[20];encodeControlSummary(b,c,42,seq,Reply::Accepted);assert((b[2]&15)==1);c.stop();
 uint8_t bytes[18]={2,9,1,0,1,0,100,0};put32(bytes+10,42);Command decoded;assert(decodeCommand(bytes,18,decoded));bytes[16]=1;assert(!decodeCommand(bytes,18,decoded));
 // Sensor range >100% (2800 mV) ends pumping, continues hold and releases normally.
 // Deliberately different raw ADC and millivolts verify which measurement controls the target.
 c.configureStage(0,1,1000,200,500,3000,0);assert(c.configureTargets(0,1,2700,0,0)==Reply::Accepted);
 c.sensors[0]={2000,0,0,true,2800};assert(c.beginRoutine(1,1,0,1,0)==Reply::Accepted);c.update(100);
 assert(!c.pump(0)&&c.valve(0)&&c.routine.active&&!c.routineFault);c.update(300);assert(!c.valve(0)&&c.routine.active&&!c.routineFault);c.stop();
 c.configureStage(0,1,1000,200,500,3000,0);c.configureTargets(0,1,1000,0,0);c.sensors[0]={2500,0,0,true,500};c.beginRoutine(1,1,0,1,0);c.update(100);assert(c.pump(0));
 c.sensors[0]={2500,200,0,true,1100};c.update(200);assert(!c.pump(0)&&c.routine.active&&!c.routineFault);c.stop();
 c.configureStage(0,1,100,0,500,1000,0);assert(c.configureTargets(0,1,2701,0,0)==Reply::Invalid);
 puts("PASS: calibration increments/hold/release, interlocks, expiry, disconnect, wrap, unit-correct targets and >100% continuation.");
}
