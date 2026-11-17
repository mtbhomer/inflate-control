#include <cassert>
#include <cstdio>
#include "../firmware/hub_ble/HubController.h"
#include "../firmware/hub_ble/BleProtocol.h"
static unsigned writes=0;static uint8_t stored=63;static bool writeWorks=true;
static bool save(uint8_t mask){++writes;if(!writeWorks)return false;stored=mask;return true;}
int main(){
 HubController c(63);uint16_t seq=0;uint32_t now=100;
 Command cmd;cmd.op=8;cmd.mask=6;cmd.repeats=0;cmd.session=42;cmd.seq=1;cmd.receivedAt=now;
 auto apply=[&](){return applyCommand(c,cmd,42,42,seq,Reply::None,now,save);};
 assert(apply()==Reply::Accepted&&c.enabledMask()==6&&writes==1&&stored==6);
 assert(!c.activeMask());for(unsigned ch=0;ch<6;++ch)assert(!c.pump(ch)&&!c.valve(ch));
 assert(apply()==Reply::None&&writes==1); // Replayed settings never write again.
 ++cmd.seq;assert(apply()==Reply::Accepted&&writes==1); // No flash write for unchanged mask.
 assert(c.start(1,100,0,0,1,now)==Reply::Disabled);
 assert(c.manual(8,1,0,now)==Reply::Disabled);
 assert(c.testCycle(32,100,0,now)==Reply::Disabled);
 assert(c.configureStage(0,16,100,0,500,1000,now)==Reply::Disabled);
 assert(c.manual(2,0,1,now)==Reply::Accepted);
 ++cmd.seq;cmd.mask=0;assert(apply()==Reply::Busy&&c.enabledMask()==6&&writes==1&&c.valve(1));
 c.stop();c.runs[1].group=6;assert(c.configureStage(0,2,100,0,500,1000,now)==Reply::Accepted);
 assert(c.configureTargets(0,2,0,0,now)==Reply::Accepted);
 ++cmd.seq;assert(apply()==Reply::Accepted&&c.enabledMask()==0&&stored==0);assert(c.runs[1].group==0);
 assert(c.beginRoutine(1,1,0,1,now)==Reply::Invalid); // Mask edits invalidate staged routines.
 assert(c.start(2,100,0,0,1,now)==Reply::Disabled);
 HubController rebooted(63);assert(rebooted.setEnabledChannels(stored,0)==Reply::Accepted&&rebooted.enabledMask()==0);
 ++cmd.seq;cmd.mask=6;writeWorks=false;assert(apply()==Reply::StorageFailed&&c.enabledMask()==0&&stored==0);
 ++cmd.seq;writeWorks=true;assert(apply()==Reply::Accepted&&c.enabledMask()==6);
 assert(c.configureStage(0,2,100,0,500,1000,now)==Reply::Accepted);c.configureTargets(0,2,0,0,now);
 assert(c.beginRoutine(1,1,1000,1,now)==Reply::Accepted&&!c.activeMask());
 ++cmd.seq;cmd.mask=0;assert(apply()==Reply::Busy&&c.enabledMask()==6); // Settling also owns controller.
 c.stop();++cmd.seq;cmd.mask=64;assert(apply()==Reply::Invalid&&c.enabledMask()==6);
 ++cmd.seq;cmd.mask=0;now+=251;assert(apply()==Reply::Expired&&c.enabledMask()==6);
 cmd.receivedAt=now;++cmd.seq;cmd.aux=1;assert(apply()==Reply::Invalid);
 cmd.aux=0;cmd.pumpMs=1;++cmd.seq;assert(apply()==Reply::Invalid);
 uint8_t b[20];encodeControlSummary(b,c,42,seq,Reply::Accepted);assert(b[14]==6&&b[15]==0xa9&&!b[3]);
 uint8_t bytes[18]={2,8,0,0,1,0};put32(bytes+10,42);Command decoded;
 assert(decodeCommand(bytes,18,decoded)&&decoded.mask==0);bytes[2]=63;assert(decodeCommand(bytes,18,decoded));
 bytes[2]=64;assert(!decodeCommand(bytes,18,decoded));bytes[2]=6;bytes[3]=1;assert(!decodeCommand(bytes,18,decoded));
 bytes[3]=0;bytes[16]=1;assert(!decodeCommand(bytes,18,decoded));
 puts("PASS: idle-only saved channel mask, all-off/re-enable, command rejection, staged invalidation, save failure rollback, replay/expiry, summary framing and restore.");
}
