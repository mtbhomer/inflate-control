#include <initializer_list>

#include <cassert>
#include <climits>
#include <cstdio>
#include "../firmware/hub_ble/PinMap.h"
#include "../firmware/hub_ble/HubController.h"
#include "../firmware/hub_ble/BleProtocol.h"
int main(){
 assert(ENABLED_MASK==6 && PUMP_PINS[1]==22 && VALVE_PINS[1]==23 && PUMP_PINS[2]==25 && VALVE_PINS[2]==26 && DATA_PIN==32 && CLOCK_PIN==33);
 for(auto ch:{1,2})for(auto pump:{50,1000,2000})for(auto hold:{0,1000,10000}){
  HubController c(6);assert(c.start(ch,pump,hold,20)==Reply::Accepted);
  assert(!c.pump(ch)&&c.valve(ch));c.update(119);assert(!c.pump(ch));c.update(120);assert(c.pump(ch)&&c.valve(ch));
  c.update(119+pump);assert(c.pump(ch));c.update(120+pump);assert(!c.pump(ch));assert(c.valve(ch)==(hold>0));
  assert(c.start(ch==1?2:1,1000,1000,120+pump)==(hold>0?Reply::Busy:Reply::Venting));
  c.update(120+pump+hold);assert(c.channel==-1&&!c.pump(ch)&&!c.valve(ch));
  assert(c.start(ch,50,0,2119+pump+hold)==Reply::Venting);
  assert(c.start(ch,50,0,2120+pump+hold)==Reply::Accepted);
 }
 HubController c(6);for(auto ch:{0,3,4,5})assert(c.start(ch,1000,1000,0)==Reply::Disabled);
 assert(c.start(6,1000,1000,0)==Reply::Invalid);assert(c.start(1,49,0,0)==Reply::Invalid);assert(c.start(1,2001,0,0)==Reply::Invalid);assert(c.start(1,50,10001,0)==Reply::Invalid);
 assert(c.start(1,2000,10000,UINT32_MAX-50)==Reply::Accepted);c.update(49);assert(c.pump(1));c.update(12049);assert(c.channel==-1);
 HubController delayed(6);delayed.start(1,50,0,0);delayed.update(5000);assert(!delayed.pump(1)&&!delayed.valve(1));
 uint8_t bytes[14]={1,1,1,0,1,0,0xe8,3,0xe8,3,0x78,0x56,0x34,0x12};Command command;
 assert(decodeCommand(bytes,14,command)&&command.session==0x12345678&&command.pumpMs==1000&&command.holdMs==1000);
 assert(!decodeCommand(bytes,13,command));bytes[3]=1;assert(!decodeCommand(bytes,14,command));bytes[3]=0;
 HubController sessionController(6);uint16_t seq=0;Reply r=Reply::None;const uint32_t nonce=0x12345678;
 decodeCommand(bytes,14,command);command.receivedAt=0;
 assert(applyCommand(sessionController,command,nonce+1,nonce,seq,r,0)==Reply::None&&seq==0);
 r=applyCommand(sessionController,command,nonce,nonce,seq,r,0);assert(r==Reply::Accepted&&seq==1);
 Command stop=command;stop.op=2;stop.seq=3;
 r=applyCommand(sessionController,stop,nonce,nonce,seq,r,1);assert(r==Reply::Stopped&&sessionController.channel==-1);
 command.seq=2;r=applyCommand(sessionController,command,nonce,nonce,seq,r,5000);assert(r==Reply::Stopped&&sessionController.channel==-1);
 command.seq=4;command.receivedAt=5000;r=applyCommand(sessionController,command,nonce,nonce,seq,r,5251);assert(r==Reply::Expired&&sessionController.channel==-1);
 command.seq=5;command.receivedAt=6000;r=applyCommand(sessionController,command,nonce,nonce,seq,r,6000);assert(r==Reply::Accepted);
 // Loss of BLE or sensor updates does not change an accepted cycle's timers.
 sessionController.update(7100);assert(!sessionController.pump(1)&&sessionController.valve(1));sessionController.update(8100);assert(sessionController.channel==-1);
 puts("PASS: BLE pin map, all enabled channel/duration boundaries, zero hold, invalid/disabled inputs, rollover, stale/replayed commands, stop precedence, autonomous deadlines.");
}
