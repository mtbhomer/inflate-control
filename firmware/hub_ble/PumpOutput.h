#pragma once
#include <stdint.h>
// All pump pins share a fixed frequency; each active run supplies its own duty.
// IO exposes attach(pin,hz,bits), write(pin,duty) and forceLow(pin,attached).
template<class IO> class PumpOutput {
 public:
  static constexpr uint32_t FREQUENCY=100;
  static constexpr uint8_t RESOLUTION=10;
  static constexpr uint16_t MAX_DUTY=1023;
  PumpOutput(IO&driver,const int8_t*pinMap):io(driver),pins(pinMap){}
  bool begin(){
    if(fault)return false;
    for(unsigned ch=0;ch<6;++ch){
      attached[ch]=io.attach(pins[ch],FREQUENCY,RESOLUTION);
      if(!attached[ch]||!io.write(pins[ch],0)){latchOff();return false;}
      cached[ch]=0;
    }
    initialized=true;return true;
  }
  bool ready()const{return initialized&&!fault;}
  bool writePercent(unsigned ch,uint8_t percent){
    if(!ready())return false;
    if(ch>=6||percent>100){latchOff();return false;}
    const uint16_t duty=(uint32_t(MAX_DUTY)*percent+50)/100;
    if(cached[ch]==duty)return true;
    if(!io.write(pins[ch],duty)){latchOff();return false;}
    cached[ch]=duty;return true;
  }
  void latchOff(){
    if(fault)return;
    fault=true;initialized=false;
    for(unsigned ch=0;ch<6;++ch){io.forceLow(pins[ch],attached[ch]);attached[ch]=false;cached[ch]=0;}
  }
 private:
  IO&io;const int8_t*pins;
  uint16_t cached[6]={};bool attached[6]={};bool initialized=false,fault=false;
};
