#include <cassert>
#include <cstdio>
#include <initializer_list>
#include "../firmware/hub_ble/HubController.h"
#include "../firmware/hub_ble/BleProtocol.h"
#include "../firmware/hub_ble/PumpOutput.h"
#include "../firmware/hub_ble/PinMap.h"
void sample(HubController&c,uint32_t now,uint16_t mv=300,unsigned ch=1){c.sensors[ch]={uint16_t(mv*4095u/3100),now,0,true,mv};c.update(now);}
struct FakeIO{
 int attachCount=0,writeCount=0,forced=0,failAttach=-1,failWrite=-1;uint16_t lastDuty=0;
 bool attach(uint8_t,uint32_t hz,uint8_t bits){assert(hz==100&&bits==10);return attachCount++!=failAttach;}
 bool write(uint8_t,uint16_t duty){lastDuty=duty;return writeCount++!=failWrite;}
 void forceLow(uint8_t,bool){++forced;}
};
int main(){
 for(int failure=-1;failure<6;++failure){FakeIO io;io.failAttach=failure;PumpOutput<FakeIO> output(io,PUMP_PINS);assert(output.begin()==(failure<0));if(failure>=0){assert(io.forced==6&&!output.ready());assert(!output.writePercent(1,100));continue;}
  assert(io.writeCount==6&&output.writePercent(1,0)&&io.writeCount==6);assert(output.writePercent(1,25)&&io.lastDuty==256);int calls=io.writeCount;assert(output.writePercent(1,25)&&io.writeCount==calls);assert(output.writePercent(1,100)&&io.lastDuty==1023);assert(output.writePercent(1,0)&&io.lastDuty==0);
  io.failWrite=io.writeCount;assert(!output.writePercent(2,80)&&io.forced==6&&!output.ready());assert(!output.writePercent(2,100)&&!output.begin());
 }
 {FakeIO io;io.failWrite=0;PumpOutput<FakeIO> output(io,PUMP_PINS);assert(!output.begin()&&io.forced==6);}
 HubController c(63);sample(c,0);
 for(unsigned duration:{250,500,1000}){assert(c.testPwm(2,duration,60,2000,0)==Reply::Accepted);assert(c.valve(1)&&!c.pump(1)&&c.pwmTesting());sample(c,99);assert(!c.pump(1));sample(c,100);assert(c.pumpPercent(1)==60);
  assert(c.start(1,50,0,0,1,101)==Reply::Busy);assert(c.calibrationPulse(2,100,101)==Reply::Busy);assert(c.manual(2,1,1,101)==Reply::Busy);assert(c.testCycle(1,50,0,101)==Reply::Busy);assert(c.setEnabledChannels(0,101)==Reply::Busy);assert(c.configureStage(0,1,50,0,500,1000,101)==Reply::Busy);
  for(unsigned t=180;t<100+duration;t+=80)sample(c,t,400);sample(c,100+duration,500);assert(!c.pump(1)&&c.valve(1)&&c.pwmTrial.result==3);assert(c.pwmTrial.actualMs==duration);sample(c,299+duration,550);assert(c.valve(1));sample(c,300+duration,550);assert(!c.activeMask()&&c.pwmTrial.result==4&&c.pwmTrial.startMv==300&&c.pwmTrial.endMv==550&&c.pwmTrial.samples>=2);
  uint8_t b[20];c.pwmTrial.sequence=7;encodePwm(b,c,42);assert(b[1]==64&&b[2]==1&&b[3]==60&&read16(b+4)==duration&&read32(b+6)==42&&read16(b+10)==300&&read16(b+12)==550&&read16(b+14)==duration&&b[16]==4&&read16(b+18)==7);
  c.stop();sample(c,0);
 }
 for(unsigned duration:{0,100,1001,2000})assert(c.testPwm(2,duration,100,1000,0)==Reply::Invalid);
 for(unsigned duty:{0,24,26,101})assert(c.testPwm(2,1000,duty,1000,0)==Reply::Invalid);
 for(unsigned limit:{0,200,2701})assert(c.testPwm(2,1000,100,limit,0)==Reply::Invalid);
 assert(c.testPwm(3,1000,100,1000,0)==Reply::Invalid);
 c.setEnabledChannels(1,0);assert(c.testPwm(2,1000,100,1000,0)==Reply::Disabled);c.setEnabledChannels(63,0);
 assert(c.testPwm(2,1000,100,1000,0)==Reply::Invalid);sample(c,0);assert(c.testPwm(2,1000,100,1000,500)==Reply::Invalid);
 sample(c,0);c.sensors[1].limits=8;assert(c.testPwm(2,1000,100,1000,0)==Reply::Invalid);sample(c,0);
 c.testPwm(2,1000,40,600,0);sample(c,100);sample(c,300,610);assert(c.pwmTrial.result==3&&c.pwmTrial.actualMs==200&&!c.pump(1));sample(c,500,620);assert(c.pwmTrial.result==5&&c.pwmTrial.endMv==620);
 c.testPwm(2,1000,40,600,500);sample(c,600,620);assert(!c.pump(1));sample(c,800,620);assert(c.pwmTrial.result==5&&c.pwmTrial.actualMs==0);
 sample(c,1000);c.testPwm(2,1000,100,2700,1000);sample(c,1100);c.update(1600);assert(c.pwmTrial.result==6&&!c.activeMask());
 sample(c,2000);c.testPwm(2,250,100,2700,2000);sample(c,2100);sample(c,2350,500);c.update(2550);assert(c.pwmTrial.result==6&&!c.activeMask()); // no new final sample
 sample(c,3000);c.testPwm(2,1000,25,2700,3000);sample(c,3100);sample(c,3200);c.stop();assert(c.pwmTrial.result==7&&!c.activeMask());
 c.testPwm(2,1000,25,2700,3200);sample(c,3300);c.endContinuous();assert(c.pwmTrial.result==8&&!c.activeMask());
 c.start(2,100,0,0,1,3400);c.update(3500);assert(c.pumpPercent(1)==100);c.stop();c.manual(2,1,0,3600);assert(c.pumpPercent(1)==100);c.stop();
 const uint32_t base=UINT32_MAX-50;sample(c,base);c.testPwm(2,250,60,2700,base);sample(c,49);assert(c.pump(1));sample(c,399,500);assert(c.pwmTrial.actualMs==350);sample(c,599,550);assert(c.pwmTrial.result==4&&!c.activeMask()); // late tick reports actual interval, not requested
 sample(c,0);uint8_t bytes[18]={2,10,2,0,1,0};put16(bytes+6,1000);put16(bytes+8,80);put32(bytes+10,42);put16(bytes+14,1000);put16(bytes+16,1);Command cmd;assert(decodeCommand(bytes,18,cmd));uint16_t seq=0;
 assert(applyCommand(c,cmd,42,42,seq,Reply::None,0)==Reply::Accepted&&c.pwmTrial.sequence==1);c.update(100);assert(c.pump(1));assert(applyCommand(c,cmd,42,42,seq,Reply::Accepted,101)==Reply::Accepted&&c.pwmTrial.pumpAt==100);
 uint8_t summary[20];encodeControlSummary(summary,c,42,1,Reply::Accepted);assert((summary[2]&15)==2);c.stop();cmd.seq=2;assert(applyCommand(c,cmd,42,42,seq,Reply::None,251)==Reply::Expired&&!c.activeMask());
 cmd.seq=3;assert(applyCommand(c,cmd,42,42,seq,Reply::None,0,nullptr,false)==Reply::OutputFailed&&!c.activeMask());cmd.op=2;cmd.seq=4;assert(applyCommand(c,cmd,42,42,seq,Reply::None,0,nullptr,false)==Reply::Stopped);
 puts("PASS: PWM output failures/caching, one-channel guards, measured endpoints, 1 s duration, early maximum, stale sensor/final sample, Stop/disconnect, wrap, late ticks and protocol.");
}
