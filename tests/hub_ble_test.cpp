#include <initializer_list>
#include <cassert>
#include <climits>
#include <cstdio>
#include "../firmware/hub_ble/PinMap.h"
#include "../firmware/hub_ble/HubController.h"
#include "../firmware/hub_ble/BleProtocol.h"
#include "../firmware/hub_ble/AnalogSensor.h"
int main(){
 assert(ANALOG_PIN==34&&ANALOG_CHANNEL==1);
 AnalogSensor sensor;assert(sensor.flags(0)==0&&sensor.age(0)==65535);
 for(int i=0;i<3;++i)sensor.add(400+i,200+i,20*i);
 assert(!sensor.available);sensor.add(403,203,60);
 assert(sensor.available&&sensor.raw==402&&sensor.millivolts==202&&sensor.flags(60)==3);
 assert(sensor.flags(559)==3&&sensor.flags(560)==1&&sensor.age(70000)==65535);
 sensor.add(4095,3100,100);sensor.add(100,200,120);sensor.add(100,200,140);sensor.add(100,200,160);
 assert(sensor.raw==1099&&(sensor.flags(160)&8)); // A clipped constituent is not hidden by averaging.
 for(int i=0;i<4;++i)sensor.add(0,0,UINT32_MAX-20+i);
 assert(sensor.raw==0&&sensor.flags(10)==7&&sensor.age(10)==28); // millis wrap.
 uint8_t analogBytes[20];encodeAnalog(analogBytes,1,0x12345678,3,402,202,20);
 const uint8_t expectedAnalog[20]={2,32,1,3,146,1,120,86,52,18,202,0,20,0,0,0,0,0,0,0};
 for(int i=0;i<20;++i)assert(analogBytes[i]==expectedAnalog[i]);
 assert(ENABLED_MASK==6&&PUMP_PINS[1]==22&&VALVE_PINS[1]==23&&PUMP_PINS[2]==25&&VALVE_PINS[2]==26&&DATA_PIN==32&&CLOCK_PIN==33);
 for(auto mask:{2,4,6})for(auto pump:{50,1000,2000})for(auto hold:{0,1000,10000}){
  HubController c(6);assert(c.start(mask,pump,hold,0,1,20)==Reply::Accepted);
  for(uint32_t t=20;t<=uint32_t(120+pump+hold);++t){
   c.update(t);for(unsigned ch=1;ch<=2;++ch){bool member=mask&(1<<ch);assert(c.pump(ch)==(member&&t>=120&&t<uint32_t(120+pump)));assert(c.valve(ch)==(member&&t<uint32_t(120+pump+hold)));}
   if(mask==6)assert(c.runs[1].phase==c.runs[2].phase);
  }
  assert(!c.activeMask()); // No fixed lockout at the final release.
  assert(c.start(mask,50,0,0,1,120+pump+hold)==Reply::Accepted);
  c.stop();assert(!c.activeMask()&&!c.valve(1)&&!c.pump(2));
 }
 HubController c(6);for(auto mask:{1,8,16,32,7})assert(c.start(mask,1000,1000,1000,3,0)==Reply::Disabled);
 assert(c.start(0,1000,1000,0,1,0)==Reply::Invalid);assert(c.start(64,1000,1000,0,1,0)==Reply::Invalid);
 for(auto pump:{0,49,2001})assert(c.start(2,pump,0,0,1,0)==Reply::Invalid);
 assert(c.start(2,50,10001,0,1,0)==Reply::Invalid);assert(c.start(2,50,0,10001,1,0)==Reply::Invalid);assert(c.start(2,50,0,0,1000,0)==Reply::Invalid);
 // Independent channels can overlap; an overlapping group fails atomically.
 assert(c.start(2,100,200,0,1,0)==Reply::Accepted);assert(c.start(6,500,500,0,1,50)==Reply::Busy);assert(c.runs[2].phase==Phase::Off);
 assert(c.start(4,50,0,0,1,50)==Reply::Accepted);c.update(150);assert(c.pump(1)&&c.pump(2));c.update(200);assert(c.valve(1)&&!c.pump(1)&&!c.valve(2));c.update(400);assert(!c.activeMask());
 // Three linked cycles, with an explicit 300 ms release interval between them.
 assert(c.start(6,50,50,300,3,1000)==Reply::Accepted);
 for(uint32_t t=1000;t<=2200;++t){c.update(t);assert(c.runs[1].phase==c.runs[2].phase);assert(c.runs[1].cycle==c.runs[2].cycle);assert(!c.pump(1)||c.valve(1));
  if(t==1200||t==1700){assert(c.runs[1].phase==Phase::Release);assert(!c.valve(1));}
  if(t==1500)assert(c.runs[1].cycle==2&&c.runs[1].phase==Phase::Select);
 }
 assert(!c.activeMask()&&c.runs[1].cycle==3);
 // Zero release still produces an OFF output tick, with no hidden 2 s wait.
 c.start(6,50,0,0,2,3000);c.update(3150);assert(c.runs[1].phase==Phase::Release&&!c.valve(1));c.update(3150);assert(!c.valve(1));c.update(3151);assert(c.runs[1].phase==Phase::Select);c.update(3301);assert(!c.activeMask());
 // Delayed scheduling never catches up by firing unobserved pump cycles.
 c.start(6,50,0,1000,3,4000);c.update(10000);assert(!c.valve(1)&&c.runs[1].cycle==1);c.update(11000);assert(!c.pump(1)&&c.valve(1)&&c.runs[1].cycle==2);c.stop();
 // Until Stop and finite patterns differ on disconnect; no reconnect restart.
 c.start(2,100,100,100,0,0);c.start(4,100,100,100,3,0);c.update(150);c.endContinuous();assert(c.runs[1].repeats==1&&c.runs[2].repeats==3);c.update(300);assert(!c.valve(1)&&c.runs[1].phase==Phase::Off&&c.runs[2].phase==Phase::Release);c.update(400);assert(c.activeMask()==4);c.stop();
 c.start(6,50,0,0,0,1000);c.update(1150);c.endContinuous();assert(!c.activeMask());
 c.start(6,50,0,0,0,2000);for(uint32_t t=2000;t<4000;t++)c.update(t);assert(c.activeMask()==6&&c.runs[1].cycle>10);c.stop();assert(!c.activeMask());
 // millis wrap, including repeat release deadlines.
 c.start(6,50,0,100,2,UINT32_MAX-49);c.update(50);assert(c.pump(1));c.update(100);assert(!c.valve(1));c.update(200);assert(c.runs[1].cycle==2);c.update(350);assert(!c.activeMask());
 uint8_t bytes[18]={2,1,6,0,1,0,0xe8,3,0xe8,3,0x78,0x56,0x34,0x12,0xe8,3,3,0};Command command;
 assert(decodeCommand(bytes,18,command)&&command.session==0x12345678&&command.mask==6&&command.pumpMs==1000&&command.holdMs==1000&&command.releaseMs==1000&&command.repeats==3);
 assert(!decodeCommand(bytes,17,command));bytes[0]=1;assert(!decodeCommand(bytes,18,command));bytes[0]=2;bytes[3]=1;assert(!decodeCommand(bytes,18,command));bytes[3]=0;
 HubController sc(6);uint16_t seq=0;Reply r=Reply::None;const uint32_t nonce=0x12345678;
 decodeCommand(bytes,18,command);command.receivedAt=0;
 assert(applyCommand(sc,command,nonce+1,nonce,seq,r,0)==Reply::None&&seq==0);
 r=applyCommand(sc,command,nonce,nonce,seq,r,0);assert(r==Reply::Accepted&&seq==1);
 Command stop=command;stop.op=2;stop.seq=3;r=applyCommand(sc,stop,nonce,nonce,seq,r,1);assert(r==Reply::Stopped&&!sc.activeMask());
 command.seq=2;r=applyCommand(sc,command,nonce,nonce,seq,r,5000);assert(r==Reply::Stopped&&!sc.activeMask());
 command.seq=4;command.receivedAt=5000;r=applyCommand(sc,command,nonce,nonce,seq,r,5251);assert(r==Reply::Expired&&!sc.activeMask());
 command.seq=5;command.receivedAt=6000;command.repeats=1;r=applyCommand(sc,command,nonce,nonce,seq,r,6000);assert(r==Reply::Accepted);
 uint8_t b[20];sc.update(6100);encodeSummary(b,sc,nonce,5,r,3,-123456,20);assert(b[0]==2&&b[1]==0&&b[2]==19&&b[3]==6&&read16(b+4)==5&&read32(b+6)==nonce&&int32_t(read32(b+10))==-123456&&b[16]==144);
 encodeDetail(b,sc,2,nonce,6100);assert(b[1]==0x12&&b[2]==2&&b[3]==6&&read16(b+4)==1&&read16(b+18)==1000);
 sc.update(8100);assert(!sc.activeMask());
 // Any of the six slots can be enabled later, without sharing controller state.
 HubController six(63);for(unsigned ch=0;ch<6;++ch)assert(six.start(1<<ch,50,0,0,1,ch*10)==Reply::Accepted);six.update(300);assert(!six.activeMask());
 puts("PASS: GPIO map, linked timing, independent overlap, atomic busy, repeat count/continuous/disconnect, immediate restart, zero release, delayed scheduling, millis wrap, protocol framing, session/replay/expiry/Stop, telemetry and six slots.");
}
