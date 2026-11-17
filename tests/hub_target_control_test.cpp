#include <cassert>
#include <cstdio>
#include <initializer_list>
#include "../firmware/hub_ble/HubController.h"
#include "../firmware/hub_ble/BleProtocol.h"
static void sample(HubController&c,unsigned ch,uint16_t mv,uint32_t now){c.sensors[ch]={1000,now,0,true,mv};}
static void stage(HubController&c,unsigned i,uint8_t mask,uint16_t window,uint32_t now=0){
 assert(c.configureStage(i,mask,0,200,500,window,now)==Reply::Accepted);
 assert(c.configureTargets(i,mask,1000,(mask&(mask-1))?1000:0,now)==Reply::Accepted);
 assert(c.configureSpeed(i,mask,25,now)==Reply::Accepted);
}
int main(){
 // Real feedback may take more than two seconds. Paired pumps still stop separately.
 {HubController c(63);stage(c,0,3,10000);sample(c,0,300,0);sample(c,1,300,0);assert(c.beginRoutine(1,1,0,1,0)==Reply::Accepted);
  for(unsigned t=100;t<=4000;t+=100){sample(c,0,t>=3500?1000:500,t);sample(c,1,500,t);c.update(t);assert(c.routine.active&&!c.routineFault);assert(c.pumpPercent(1)==25);assert(c.pump(0)==(t<3500));}
  sample(c,0,1000,4100);sample(c,1,1000,4100);c.update(4100);assert(c.routine.phase==4&&!c.pump(0)&&!c.pump(1));c.update(4300);assert(c.routine.phase==5&&!c.activeMask());sample(c,0,300,4800);sample(c,1,300,4800);c.update(4800);assert(c.routine.pulse==2);c.stop();assert(!c.activeMask()&&!c.routine.active);
 }
 // Unreached targets release at the zone boundary without a timeout fault.
 {HubController c(63);stage(c,0,1,5000);sample(c,0,300,0);c.beginRoutine(1,1,0,1,0);
  for(unsigned t=100;t<=4500;t+=100){sample(c,0,300,t);c.update(t);assert(!c.routineFault);assert(c.pump(0)==(t<4500));}
  assert(c.routine.phase==5&&!c.activeMask());c.update(4999);assert(c.routine.active);c.update(5000);assert(!c.routine.active&&!c.activeMask()&&!c.routineFault);
 }
 // A delayed tick must release for the complete interval before the next zone.
 {HubController c(63);const uint32_t base=UINT32_MAX-1000;stage(c,0,1,5000,base);stage(c,1,2,5000,base);sample(c,0,300,base);sample(c,1,300,base);c.beginRoutine(2,2,0,1,base);c.update(base+100);assert(c.pump(0));
  c.update(base+9000);assert(c.routine.step==0&&c.routine.phase==5&&!c.activeMask());c.update(base+9499);assert(c.routine.step==0&&!c.activeMask());sample(c,1,300,base+9500);c.update(base+9500);assert(c.routine.step==1&&c.routine.phase==2&&!c.pump(1));c.endContinuous();assert(!c.activeMask()&&!c.routine.active);
 }
 // Sensor faults and disconnect still release during extended inflation.
 for(unsigned fault:{0,1,2}){HubController c(63);stage(c,0,1,10000);sample(c,0,300,0);c.beginRoutine(1,1,0,1,0);for(unsigned t=100;t<=3000;t+=100){sample(c,0,300,t);c.update(t);}assert(c.pump(0));
  if(fault==0){c.update(3500);assert(c.routineFault==1);}else if(fault==1){sample(c,0,300,3100);c.sensors[0].raw=4095;c.update(3100);assert(c.routineFault==1);}else c.endContinuous();assert(!c.activeMask()&&!c.routine.active);
 }
 // Zero is only valid with sensor targets. Longer timed pumping fits the zone.
 {HubController c(63);assert(c.configureStage(0,1,0,200,500,849,0)==Reply::Invalid);assert(c.configureStage(0,1,0,200,500,850,0)==Reply::Accepted);assert(c.configureTargets(0,1,0,0,0)==Reply::Invalid);assert(c.beginRoutine(1,1,0,1,0)==Reply::Invalid);
  assert(c.configureStage(0,3,0,200,500,5000,0)==Reply::Accepted);assert(c.configureTargets(0,3,1000,0,0)==Reply::Invalid);
  assert(c.configureStage(0,1,60000,0,500,60000,0)==Reply::Invalid);assert(c.configureStage(0,1,59400,0,500,60000,0)==Reply::Accepted);c.stop();
  assert(c.configureStage(0,1,5000,200,500,10000,0)==Reply::Accepted);assert(c.configureTargets(0,1,0,0,0)==Reply::Accepted);c.beginRoutine(1,1,0,1,0);c.update(100);c.update(4000);assert(c.pump(0));c.update(5100);assert(!c.pump(0)&&c.routine.phase==4);c.stop();
  assert(c.start(1,2001,0,0,1,6000)==Reply::Invalid); // Debug behavior is independent.
 }
 // Zero pump and long remaining time survive the wire format; staging is atomic.
 {HubController c(63);uint8_t b[20]={2,5,1,0,1,0};put16(b+8,200);put32(b+10,42);put16(b+14,500);put16(b+16,30000);Command cmd;assert(decodeCommand(b,18,cmd));uint16_t seq=0;assert(applyCommand(c,cmd,42,42,seq,Reply::None,0)==Reply::Accepted);assert(c.beginRoutine(1,1,0,1,0)==Reply::Invalid); // no accepted targets
  stage(c,0,1,30000);sample(c,0,300,0);c.beginRoutine(1,1,0,1,0);c.update(100);assert(c.routineRemaining(100)==29400);encodeDetail(b,c,0,42,100);assert(read16(b+10)==0&&read16(b+18)==29400);encodeRoutine(b,c,42,100);assert(read16(b+14)==29400);c.stop();
 }
 puts("PASS: target-only inflation beyond 2 seconds, independent pair stops, zone-end release, late ticks/wrap, sensor faults, Stop/disconnect, timed bounds and telemetry.");
}
