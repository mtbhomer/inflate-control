#pragma once
#include <stdint.h>
#include <stddef.h>
constexpr char SERVICE_UUID[]="8d5a0001-4c7b-4f45-9d68-8e0c2c970001";
constexpr char COMMAND_UUID[]="8d5a0002-4c7b-4f45-9d68-8e0c2c970001";
constexpr char STATUS_UUID[] ="8d5a0003-4c7b-4f45-9d68-8e0c2c970001";
constexpr char INFO_UUID[]   ="8d5a0004-4c7b-4f45-9d68-8e0c2c970001";
constexpr uint8_t PROTOCOL_VERSION=1;
inline uint16_t read16(const uint8_t*p){return uint16_t(p[0])|(uint16_t(p[1])<<8);}
inline uint32_t read32(const uint8_t*p){return uint32_t(read16(p))|(uint32_t(read16(p+2))<<16);}
inline void put16(uint8_t*p,uint16_t v){p[0]=v;p[1]=v>>8;}
inline void put32(uint8_t*p,uint32_t v){put16(p,v);put16(p+2,v>>16);}
struct Command {uint8_t op=0,channel=0;uint16_t seq=0,pumpMs=0,holdMs=0;uint32_t session=0,receivedAt=0;};
inline bool decodeCommand(const uint8_t*p,size_t n,Command&c){
 if(n!=14 || p[0]!=PROTOCOL_VERSION || p[3]!=0 || (p[1]!=1 && p[1]!=2))return false;
 c.op=p[1];c.channel=p[2];c.seq=read16(p+4);c.pumpMs=read16(p+6);c.holdMs=read16(p+8);c.session=read32(p+10);
 return c.seq!=0 && (c.op!=2 || (c.channel==255 && c.pumpMs==0 && c.holdMs==0));
}

#include "HubController.h"
inline Reply applyCommand(HubController&controller,const Command&c,uint32_t liveSession,uint32_t currentSession,uint16_t&lastSeq,Reply previous,uint32_t now){
 if(!c.session || c.session!=liveSession || c.session!=currentSession || c.seq<=lastSeq)return previous;
 lastSeq=c.seq;
 if(c.op==2){controller.stop(now);return Reply::Stopped;}
 if(now-c.receivedAt>250)return Reply::Expired;
 return controller.start(c.channel,c.pumpMs,c.holdMs,now);
}
