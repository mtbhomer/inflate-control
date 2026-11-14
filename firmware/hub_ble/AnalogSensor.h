#pragma once
#include <stdint.h>
// Four samples per displayed reading. No pressure conversion or sensor-presence claim.
struct AnalogSensor {
  uint32_t rawSum=0,mvSum=0,lastSample=0;
  uint16_t raw=0,millivolts=0;
  uint8_t count=0,windowLimits=0,limits=0;
  bool available=false;
  void add(uint16_t adc,uint16_t mv,uint32_t now){
    rawSum+=adc;mvSum+=mv;
    if(adc==0)windowLimits|=4;
    if(adc==4095)windowLimits|=8;
    if(++count<4)return;
    raw=(rawSum+2)/4;millivolts=(mvSum+2)/4;
    limits=windowLimits;lastSample=now;available=true;
    rawSum=mvSum=0;count=windowLimits=0;
  }
  uint16_t age(uint32_t now)const {
    uint32_t elapsed=now-lastSample;
    return !available||elapsed>65535?65535:uint16_t(elapsed);
  }
  uint8_t flags(uint32_t now)const {
    return available?(1|(age(now)<500?2:0)|limits):0;
  }
};
