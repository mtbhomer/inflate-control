#pragma once
#include <stdint.h>
#include <stddef.h>
constexpr char SERVICE_UUID[]="8d5a0001-4c7b-4f45-9d68-8e0c2c970001";
constexpr char COMMAND_UUID[]="8d5a0002-4c7b-4f45-9d68-8e0c2c970001";
constexpr char STATUS_UUID[] ="8d5a0003-4c7b-4f45-9d68-8e0c2c970001";
constexpr char INFO_UUID[]   ="8d5a0004-4c7b-4f45-9d68-8e0c2c970001";
constexpr uint8_t PROTOCOL_VERSION=2;
inline uint16_t read16(const uint8_t*p){return uint16_t(p[0])|(uint16_t(p[1])<<8);}
inline uint32_t read32(const uint8_t*p){return uint32_t(read16(p))|(uint32_t(read16(p+2))<<16);}
inline void put16(uint8_t*p,uint16_t v){p[0]=v;p[1]=v>>8;}
inline void put32(uint8_t*p,uint32_t v){put16(p,v);put16(p+2,v>>16);}
struct Command {uint8_t op=0,mask=0;uint16_t seq=0,pumpMs=0,holdMs=0,releaseMs=0,repeats=1;uint32_t session=0,receivedAt=0;};
inline bool decodeCommand(const uint8_t*p,size_t n,Command&c){
 if(n!=18 || p[0]!=PROTOCOL_VERSION || p[3]!=0 || p[1]<1 || p[1]>4)return false;
 c.op=p[1];c.mask=p[2];c.seq=read16(p+4);c.pumpMs=read16(p+6);c.holdMs=read16(p+8);c.session=read32(p+10);c.releaseMs=read16(p+14);c.repeats=read16(p+16);
 if(!c.seq)return false;
 if(c.op==2)return c.mask==0&&c.pumpMs==0&&c.holdMs==0&&c.releaseMs==0&&c.repeats==0;
 if(c.op==3)return c.mask>0&&c.mask<=63&&!(c.mask&(c.mask-1))&&c.pumpMs<=2&&c.holdMs<=2&&c.releaseMs==0&&c.repeats==0;
 if(c.op==4)return c.mask>0&&c.mask<=63&&!(c.mask&(c.mask-1))&&c.releaseMs==0&&c.repeats==1;
 return true;
}
#include "HubController.h"
inline Reply applyCommand(HubController&controller,const Command&c,uint32_t liveSession,uint32_t currentSession,uint16_t&lastSeq,Reply previous,uint32_t now){
 if(!c.session || c.session!=liveSession || c.session!=currentSession || c.seq<=lastSeq)return previous;
 lastSeq=c.seq;
 if(c.op==2){controller.stop();return Reply::Stopped;}
 if(now-c.receivedAt>250)return Reply::Expired;
 if(c.op==3){if(c.pumpMs>2||c.holdMs>2||c.releaseMs||c.repeats)return Reply::Invalid;return controller.manual(c.mask,c.pumpMs,c.holdMs,now);}
 if(c.op==4){if(c.releaseMs||c.repeats!=1)return Reply::Invalid;return controller.testCycle(c.mask,c.pumpMs,c.holdMs,now);}
 if(c.op!=1)return Reply::Invalid;
 return controller.start(c.mask,c.pumpMs,c.holdMs,c.releaseMs,c.repeats,now);
}
inline void encodeSummary(uint8_t*b,const HubController&c,uint32_t session,uint16_t seq,Reply reply,uint8_t sensorFlags,int32_t raw,uint16_t age){
 for(unsigned i=0;i<20;++i)b[i]=0;
 b[0]=PROTOCOL_VERSION;b[2]=sensorFlags|(uint8_t(reply)<<4);b[3]=c.activeMask();put16(b+4,seq);put32(b+6,session);put32(b+10,uint32_t(raw));put16(b+14,age);
 uint32_t phases=0;for(uint8_t ch=0;ch<6;++ch)phases|=uint32_t(c.runs[ch].phase)<<(3*ch);
 b[16]=phases;b[17]=phases>>8;b[18]=phases>>16;
}
inline void encodeDetail(uint8_t*b,const HubController&c,uint8_t ch,uint32_t session,uint32_t now){
 const auto&r=c.runs[ch];b[0]=PROTOCOL_VERSION;b[1]=0x10|uint8_t(r.phase);b[2]=ch;b[3]=r.group;put16(b+4,r.cycle);put32(b+6,session);
 put16(b+10,r.pumpMs);put16(b+12,r.holdMs);put16(b+14,r.releaseMs);put16(b+16,r.repeats);put16(b+18,c.remaining(ch,now));
}
// v7 has six analog packets; the unused summary raw field carries output states.
// Two bits per channel: pump, valve. The summary also acknowledges the command.
inline void encodeControlSummary(uint8_t*b,const HubController&c,uint32_t session,uint16_t seq,Reply reply){
 uint16_t outputs=0;for(uint8_t ch=0;ch<6;++ch){if(c.pump(ch))outputs|=1<<(2*ch);if(c.valve(ch))outputs|=2<<(2*ch);}
 encodeSummary(b,c,session,seq,reply,0,outputs,65535);
}
// Additive firmware-v3 telemetry; control packets and protocol version stay v2.
inline void encodeAnalog(uint8_t*b,uint8_t channel,uint32_t session,uint8_t flags,uint16_t raw,uint16_t mv,uint16_t age){
 for(unsigned i=0;i<20;++i)b[i]=0;
 b[0]=PROTOCOL_VERSION;b[1]=0x20;b[2]=channel;b[3]=flags;
 put16(b+4,raw);put32(b+6,session);put16(b+10,mv);put16(b+12,age);
}
