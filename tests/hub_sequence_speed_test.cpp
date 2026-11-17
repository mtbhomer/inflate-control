#include <cassert>
#include <cstdio>
#include <initializer_list>
#include "../firmware/hub_ble/HubController.h"
#include "../firmware/hub_ble/BleProtocol.h"
void stage(HubController&c,unsigned index,unsigned mask,unsigned duty,uint32_t now=0){
 assert(c.configureStage(index,mask,200,100,500,2000,now)==Reply::Accepted);
 assert(c.configureTargets(index,mask,0,0,now)==Reply::Accepted);
 assert(c.configureSpeed(index,mask,duty,now)==Reply::Accepted);
}
void feedback(HubController&c,unsigned ch,uint16_t mv,uint32_t now){c.sensors[ch]={1000,now,0,true,mv};}
int main(){
 // Each scan zone and repeated cue retains its speed; paired outputs share duty.
 {HubController c(63);stage(c,0,3,25);stage(c,1,12,60);stage(c,2,48,80);assert(c.beginRoutine(2,3,0,2,0)==Reply::Accepted);
  for(unsigned t=0;t<=12000;++t){c.update(t);for(unsigned ch=0;ch<6;++ch){unsigned slot=t/2000%3;const uint8_t expected=slot==0?25:slot==1?60:80;assert(c.pumpPercent(ch)==(c.pump(ch)?expected:0));if(c.pump(ch))assert(ch/2==slot);}}
  assert(!c.routine.active&&!c.activeMask());c.start(1,100,0,0,1,13000);c.update(13100);assert(c.pumpPercent(0)==100);c.stop();c.manual(1,1,0,13200);assert(c.pumpPercent(0)==100);c.stop();c.calibrationPulse(1,100,13300);c.update(13400);assert(c.pumpPercent(0)==100);c.stop();
 }
 // Independent target stops at a shared slow speed; no duty on valve-only hold.
 {HubController c(63);c.configureStage(0,3,2000,200,500,5000,0);c.configureTargets(0,3,600,600,0);assert(c.configureSpeed(0,3,40,0)==Reply::Accepted);feedback(c,0,300,0);feedback(c,1,300,0);c.beginRoutine(1,1,0,1,0);c.update(100);assert(c.pumpPercent(0)==40&&c.pumpPercent(1)==40);
  feedback(c,0,650,200);feedback(c,1,500,200);c.update(200);assert(c.pumpPercent(0)==0&&c.valve(0)&&c.pumpPercent(1)==40);
  assert(c.configureSpeed(0,3,100,201)==Reply::Busy);assert(c.pumpPercent(1)==40);
  feedback(c,0,650,300);feedback(c,1,620,300);c.update(300);assert(c.routine.phase==4&&!c.pump(1));c.update(500);assert(!c.activeMask()&&c.routine.phase==5);c.endContinuous();assert(!c.routine.active);
 }
 // Slow speed never extends the selected pump limit; missed sensor target releases.
 {HubController c(63);c.configureStage(0,1,200,0,500,2000,0);c.configureTargets(0,1,1000,0,0);c.configureSpeed(0,1,25,0);feedback(c,0,300,0);c.beginRoutine(1,1,0,1,0);c.update(100);assert(c.pumpPercent(0)==25);feedback(c,0,500,300);c.update(300);assert(c.routineFault==2&&!c.activeMask()&&!c.routine.active);}
 // Validation clears incomplete staging; no speed leaks into a subsequent routine.
 {HubController c(63);for(unsigned duty:{0,24,26,101,65535}){stage(c,0,1,40);assert(c.configureSpeed(0,1,duty,0)==Reply::Invalid);assert(c.beginRoutine(1,1,0,1,0)==Reply::Invalid);}
  c.configureStage(0,1,100,0,500,1000,0);assert(c.configureSpeed(0,1,25,0)==Reply::Invalid); // targets not yet accepted
  stage(c,0,1,40);assert(c.configureSpeed(1,1,25,0)==Reply::Invalid);
  stage(c,0,1,40);assert(c.configureSpeed(0,2,25,0)==Reply::Invalid);
  stage(c,0,1,40);assert(c.configureSpeed(0,1,25,5001)==Reply::Invalid);
  stage(c,0,1,40);c.stop();assert(c.beginRoutine(1,1,0,1,0)==Reply::Invalid);
  stage(c,0,1,40);c.setEnabledChannels(2,0);assert(c.configureSpeed(0,1,25,0)==Reply::Invalid);
  c.setEnabledChannels(63,0);c.configureStage(0,1,100,0,500,1000,0);c.configureTargets(0,1,0,0,0);assert(c.beginRoutine(1,1,0,1,0)==Reply::Accepted);c.update(100);assert(c.pumpPercent(0)==100);c.stop();
 }
 // Staging and duty survive millis wrap and delayed ticks without replaying cues.
 {HubController c(63);uint32_t base=UINT32_MAX-50;stage(c,0,1,25,base);stage(c,1,2,80,base);c.beginRoutine(2,2,0,1,base);c.update(base+100);assert(c.pumpPercent(0)==25);c.update(base+10000);assert(c.routine.step==1&&!c.pump(1));c.update(base+10100);assert(c.pumpPercent(1)==80);c.endContinuous();assert(!c.activeMask());}
 // Wire protocol, nonce, replay, receive expiry and Stop all retain their semantics.
 {uint8_t b[18]={2,11,12,1,7,0,40,0};put32(b+10,42);Command cmd;assert(decodeCommand(b,18,cmd)&&cmd.op==11&&cmd.aux==1&&cmd.pumpMs==40);b[3]=3;assert(!decodeCommand(b,18,cmd));b[3]=1;b[8]=1;assert(!decodeCommand(b,18,cmd));b[8]=0;
  HubController c(63);stage(c,0,3,100);stage(c,1,12,100);assert(decodeCommand(b,18,cmd));uint16_t seq=0;assert(applyCommand(c,cmd,42,42,seq,Reply::None,0)==Reply::Accepted);cmd.pumpMs=80;assert(applyCommand(c,cmd,42,42,seq,Reply::Accepted,0)==Reply::Accepted);c.beginRoutine(2,2,0,1,0);c.update(2000);c.update(2100);assert(c.pumpPercent(2)==40);c.stop();
  stage(c,0,1,100);cmd.aux=0;cmd.mask=1;cmd.seq=8;assert(applyCommand(c,cmd,42,42,seq,Reply::None,251)==Reply::Expired);cmd.seq=9;cmd.session=43;assert(applyCommand(c,cmd,42,42,seq,Reply::None,0)==Reply::None);assert(seq==8);c.stop();
 }
 puts("PASS: per-zone/paired PWM, repeated cues/rounds, independent target stops, unchanged timeouts, transactional configuration, full-duty defaults, Stop/disconnect, wrap/replay/expiry.");
}
