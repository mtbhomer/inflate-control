#include <cassert>
#include <cstdio>
#include <initializer_list>
#include "../firmware/hub_ble/HubController.h"
#include "../firmware/hub_ble/BleProtocol.h"

static Reply timed(HubController&c,unsigned index,unsigned mask,unsigned pump,unsigned hold,unsigned window,uint32_t now){
 auto reply=c.configureStage(index,mask,pump,hold,500,window,now);if(reply!=Reply::Accepted)return reply;return c.configureTargets(index,mask,0,0,now);
}
static void feedback(HubController&c,unsigned ch,uint16_t raw,uint32_t now){c.sensors[ch]={raw,now,0,true,raw};}
static void configure(HubController& c,unsigned count,uint32_t now=0){
 for(unsigned i=0;i<count;++i)assert(timed(c,i,3<<(i*2),100,200,1000,now)==Reply::Accepted);
 assert(!c.activeMask()&&!c.routine.active);
}
int main(){
 for(unsigned count:{2u,3u})for(unsigned repeats:{1u,2u}){
  HubController c(63);configure(c,count);
  assert(c.beginRoutine(2,count,500,repeats,0)==Reply::Accepted);
  const unsigned end=500+count*1000*repeats;
  for(unsigned t=0;t<=end;++t){
   c.update(t);
   for(unsigned ch=0;ch<6;++ch){
    const bool inStage=t>=500&&t<end;
    const unsigned slot=inStage?((t-500)/1000)%count:0,elapsed=inStage?(t-500)%1000:0;
    const bool member=inStage&&ch/2==slot;
    assert(c.pump(ch)==(member&&elapsed>=100&&elapsed<200));
    assert(c.valve(ch)==(member&&elapsed<400));
   }
   if(t<end)assert(c.routine.active);
  }
  assert(!c.routine.active&&!c.activeMask());
 }
 // Initial settling and released observation windows still own the controller.
 {HubController c(63);configure(c,2);c.beginRoutine(2,2,500,1,0);
  for(auto t:{0u,1000u}){
   if(t==1000){c.update(500);c.update(600);c.update(700);c.update(900);}
   c.update(t);assert(!c.activeMask());
   assert(c.start(32,100,0,0,1,t)==Reply::Busy);
   assert(c.manual(32,1,0,t)==Reply::Busy);
   assert(c.testCycle(32,100,0,t)==Reply::Busy);
  }
  c.endContinuous();assert(!c.routine.active&&!c.activeMask());c.update(99999);assert(!c.activeMask());
 }
 // Timers are based on actual transitions; delayed ticks never replay missed cues.
 {HubController c(63);configure(c,3);c.beginRoutine(2,3,0,1,0);c.update(50000);
  assert(c.routine.step==1&&c.routine.cycle==1&&c.routine.stepStarted==50000);
  assert(!c.pump(2)&&c.valve(2)&&!c.valve(0));c.update(50100);assert(c.pump(2));c.stop();
 }
 // Repeated breathing cues, timed fallback supports repeating cue windows.
 {HubController c(63);assert(timed(c,0,8,50,0,1000,0)==Reply::Accepted);
  assert(c.beginRoutine(1,1,0,0,0)==Reply::Accepted);
  for(unsigned t=0;t<5000;++t)c.update(t);
  assert(c.routine.cycle==5&&c.routine.active);c.stop();assert(!c.routine.active&&!c.activeMask());
 }
 // Configuration validation is transactional: missing, duplicate or excessive masks fail.
 {HubController c(63);
  assert(c.beginRoutine(1,1,0,1,0)==Reply::Invalid);
  assert(timed(c,1,1,50,0,1000,0)==Reply::Invalid);
  for(auto mask:{0,7,64})assert(timed(c,0,mask,50,0,1000,0)==Reply::Invalid);
  assert(timed(c,0,1,60001,0,3000,0)==Reply::Invalid);
  assert(timed(c,0,1,50,10001,30000,0)==Reply::Invalid);
  assert(timed(c,0,1,50,0,649,0)==Reply::Invalid);
  assert(timed(c,0,1,50,0,60001,0)==Reply::Invalid);
  assert(timed(c,0,1,50,0,1000,0)==Reply::Accepted);
  assert(timed(c,1,1,50,0,1000,0)==Reply::Invalid);
  assert(c.beginRoutine(1,1,0,1,0)==Reply::Invalid);
  configure(c,2);assert(c.beginRoutine(1,2,0,1,0)==Reply::Invalid);
  configure(c,2);assert(c.beginRoutine(2,2,0,1,5001)==Reply::Invalid);
  configure(c,2,10000);c.stop();assert(c.beginRoutine(2,2,0,1,10000)==Reply::Invalid);
  configure(c,2,10000);c.clearStagedRoutine();assert(c.beginRoutine(2,2,0,1,10000)==Reply::Invalid);
  HubController limited(1);assert(timed(limited,0,2,50,0,1000,0)==Reply::Disabled);
 }
 // Wrap-safe settling and sequencing.
 {HubController c(63);const uint32_t t=UINT32_MAX-199;configure(c,2,t);c.beginRoutine(2,2,300,1,t);
  c.update(t+300);assert(c.routine.step==0&&c.valve(0));c.update(t+400);assert(c.pump(0));
  c.update(t+1300);assert(c.routine.step==1&&!c.valve(0)&&c.valve(2));c.update(t+2300);assert(!c.routine.active);
 }
 // Protocol configuration/commit frames and summary's active-routine marker.
 {HubController c(63);uint16_t seq=0;Command cmd;uint8_t bytes[18]={2,5,1,0,1,0};
  put16(bytes+6,100);put16(bytes+8,200);put32(bytes+10,42);put16(bytes+14,500);put16(bytes+16,30000);
  assert(decodeCommand(bytes,18,cmd));assert(applyCommand(c,cmd,42,42,seq,Reply::None,0)==Reply::Accepted);
  assert(!c.activeMask());bytes[1]=7;put16(bytes+4,2);put16(bytes+6,0);put16(bytes+8,0);put16(bytes+14,0);put16(bytes+16,0);
  assert(decodeCommand(bytes,18,cmd));assert(applyCommand(c,cmd,42,42,seq,Reply::None,0)==Reply::Accepted);
  bytes[1]=6;bytes[2]=1;bytes[3]=1;put16(bytes+4,3);put16(bytes+6,500);put16(bytes+8,0);put16(bytes+14,0);put16(bytes+16,2);
  assert(decodeCommand(bytes,18,cmd));assert(applyCommand(c,cmd,42,42,seq,Reply::None,0)==Reply::Accepted);
  uint8_t b[20];encodeControlSummary(b,c,42,2,Reply::Accepted);assert(b[19]==1&&b[3]==0);
  encodeRoutine(b,c,42,0);assert(b[1]==0x30&&b[2]==1&&b[3]==1&&b[5]==1&&read16(b+14)==500);
  c.update(500);c.update(600);encodeRoutine(b,c,42,600);assert(b[3]==3&&read16(b+14)==100);
  // Replay cannot restart or extend a routine.
  assert(applyCommand(c,cmd,42,42,seq,Reply::Accepted,600)==Reply::Accepted&&c.routine.stepStarted==500);
  c.endContinuous();encodeRoutine(b,c,0,700);assert(b[2]==0&&b[3]==0&&!c.activeMask());
 }
 // Repeated cues within one zone, preserving each released interval.
 {HubController c(63);assert(timed(c,0,1,100,200,3000,0)==Reply::Accepted);c.beginRoutine(1,1,0,1,0);
  for(unsigned t=0;t<=3000;++t){c.update(t);if(t==900)assert(c.routine.pulse==2&&c.valve(0));if(t==1800)assert(c.routine.pulse==3);if(t==2700)assert(c.routine.phase==6&&!c.activeMask());}
  assert(!c.routine.active);
 }
 // Paired targets stop independently; no pump restarts on a dip during hold.
 {HubController c(63);assert(c.configureStage(0,3,1000,200,500,3000,0)==Reply::Accepted);assert(c.configureTargets(0,3,1000,2000,0)==Reply::Accepted);
  feedback(c,0,200,0);feedback(c,1,200,0);assert(c.beginRoutine(1,1,0,1,0)==Reply::Accepted);
  c.update(100);assert(c.pump(0)&&c.pump(1));feedback(c,0,1000,200);feedback(c,1,1500,200);c.update(200);assert(!c.pump(0)&&c.pump(1)&&c.valve(0));
  feedback(c,0,900,300);feedback(c,1,2000,300);c.update(300);assert(!c.pump(0)&&!c.pump(1)&&c.routine.phase==4);c.update(500);assert(!c.activeMask()&&c.routine.phase==5);
  feedback(c,0,200,1000);feedback(c,1,200,1000);c.update(1000);assert(c.routine.pulse==2&&c.valve(0));
  c.endContinuous();c.update(9999);assert(!c.activeMask()&&!c.routine.active);
 }
 // Target timeout, stale data and ADC endpoints release and identify the channel.
 for(unsigned scenario=0;scenario<4;++scenario){HubController c(63);c.configureStage(0,4,200,100,500,3000,0);c.configureTargets(0,4,1000,0,0);feedback(c,2,200,0);c.beginRoutine(1,1,0,1,0);c.update(100);
  if(scenario==0){feedback(c,2,900,300);c.update(300);assert(c.routineFault==2);}
  if(scenario==1){c.update(500);assert(c.routineFault==1);}
  if(scenario==2){feedback(c,2,4095,150);c.update(150);assert(c.routineFault==1);}
  if(scenario==3){c.sensors[2].available=false;c.update(150);assert(c.routineFault==1);}
  assert(c.routineFaultChannel==2&&!c.activeMask()&&!c.routine.active);uint8_t b[20];encodeControlSummary(b,c,42,1,Reply::Accepted);assert((b[19]&128)&&((b[19]>>3)&15)==c.routineFault);c.stop();assert(!c.routineFault);
 }
 // Targets are mandatory as a separate transaction; no valid sample means no start.
 {HubController c(63);c.configureStage(0,1,100,0,500,1000,0);assert(c.beginRoutine(1,1,0,1,0)==Reply::Invalid);
  c.configureStage(0,1,100,0,500,1000,0);assert(c.configureTargets(0,1,1000,1,0)==Reply::Invalid);
  c.configureStage(0,3,100,0,500,1000,0);assert(c.configureTargets(0,3,1000,0,0)==Reply::Invalid);
  c.configureStage(0,1,100,0,500,1000,0);c.configureTargets(0,1,1000,0,0);assert(c.beginRoutine(1,1,0,1,0)==Reply::Invalid&&c.routineFault==1&&!c.activeMask());
 }
 puts("PASS: routines, paired zones, finite/continuous repeats, timing, exclusivity, release windows, transactional configuration, disconnect/Stop, wrap, replay and telemetry.");
}
