#pragma once
#include <stdint.h>
enum class Phase:uint8_t { Off=0, Select=1, Pump=2, Hold=3, Release=4, Manual=5 };
enum class Reply:uint8_t { None=0, Accepted=1, Busy=2, Invalid=4, Disabled=5, Stopped=6, Expired=7 };
struct Run {
 Phase phase=Phase::Off;
 uint8_t group=0;
 uint16_t pumpMs=1000,holdMs=1000,releaseMs=1000,repeats=1,cycle=0;
 uint32_t started=0;
 bool manualPump=false,manualValve=false;
 uint32_t pumpStarted=0,valveStarted=0;
};
class HubController {
 public:
  static constexpr uint16_t MIN_PUMP=50,MAX_PUMP=2000,MAX_HOLD=10000,MAX_RELEASE=10000,MAX_REPEATS=999,LEAD=100;
  explicit HubController(uint8_t mask):enabled(mask){}
  Run runs[6];
  void update(uint32_t now) {
    for(auto&r:runs){
      if(r.phase==Phase::Off)continue;
      if(r.phase==Phase::Manual){
        if(r.manualPump && now-r.pumpStarted>=MAX_PUMP)r.manualPump=false;
        if(r.manualValve && now-r.valveStarted>=MAX_HOLD)r.manualValve=false;
        if(!r.manualPump&&!r.manualValve)r.phase=Phase::Off;
        continue;
      }
      const uint32_t elapsed=now-r.started;
      if(r.phase==Phase::Release){
        // Never catch up missed cycles. Start the next cycle from this tick.
        if(elapsed>=r.releaseMs && elapsed>0){r.started=now;r.phase=Phase::Select;if(r.cycle<65535)++r.cycle;}
      }else if(elapsed>=uint32_t(LEAD)+r.pumpMs+r.holdMs){
        if(r.repeats && r.cycle>=r.repeats)r.phase=Phase::Off;
        else {r.phase=Phase::Release;r.started=now;}
      }else if(elapsed<LEAD)r.phase=Phase::Select;
      else if(elapsed<uint32_t(LEAD)+r.pumpMs)r.phase=Phase::Pump;
      else r.phase=Phase::Hold;
    }
    if(testChannel>=0 && runs[testChannel].phase==Phase::Off)testChannel=-1;
  }
  Reply start(uint8_t mask,uint16_t pump,uint16_t hold,uint16_t release,uint16_t repeats,uint32_t now) {
    update(now);
    if(!mask || mask>63 || pump<MIN_PUMP || pump>MAX_PUMP || hold>MAX_HOLD || release>MAX_RELEASE || repeats>MAX_REPEATS)return Reply::Invalid;
    if(mask&~enabled)return Reply::Disabled;
    if(testChannel>=0)return Reply::Busy;
    // Group start is atomic: a busy member rejects the entire request.
    if(mask&activeMask())return Reply::Busy;
    for(uint8_t ch=0;ch<6;++ch)if(mask&(1<<ch)){
      auto&r=runs[ch];r.phase=Phase::Select;r.group=mask;r.pumpMs=pump;r.holdMs=hold;r.releaseMs=release;r.repeats=repeats;r.cycle=1;r.started=now;
    }
    return Reply::Accepted;
  }
  Reply manual(uint8_t mask,uint8_t pumpState,uint8_t valveState,uint32_t now){
    update(now);
    if(!mask||mask>63||(mask&(mask-1))||pumpState>2||valveState>2)return Reply::Invalid;
    if(mask&~enabled)return Reply::Disabled;
    unsigned ch=0;while(!(mask&(1<<ch)))++ch;
    if((activeMask()&~mask)||(runs[ch].phase!=Phase::Off&&runs[ch].phase!=Phase::Manual))return Reply::Busy;
    auto&r=runs[ch];
    const bool pumpOn=pumpState==2?(r.phase==Phase::Manual&&r.manualPump):pumpState==1;
    const bool valveOn=valveState==2?(r.phase==Phase::Manual&&r.manualValve):valveState==1;
    // An unchanged ON state never renews its timer when the other switch changes.
    if(pumpOn&&!r.manualPump)r.pumpStarted=now;
    if(valveOn&&!r.manualValve)r.valveStarted=now;
    r.manualPump=pumpOn;r.manualValve=valveOn;r.group=mask;r.cycle=1;
    r.pumpMs=MAX_PUMP;r.holdMs=MAX_HOLD;r.releaseMs=0;r.repeats=1;
    r.phase=pumpOn||valveOn?Phase::Manual:Phase::Off;
    testChannel=pumpOn||valveOn?int8_t(ch):-1;
    return Reply::Accepted;
  }
  Reply testCycle(uint8_t mask,uint16_t pump,uint16_t hold,uint32_t now){
    update(now);
    if(!mask||mask>63||(mask&(mask-1)))return Reply::Invalid;
    if(activeMask())return Reply::Busy;
    const auto result=start(mask,pump,hold,0,1,now);
    if(result==Reply::Accepted){testChannel=0;while(!(mask&(1<<testChannel)))++testChannel;}
    return result;
  }
  void stop(){for(auto&r:runs){r.phase=Phase::Off;r.manualPump=false;r.manualValve=false;}testChannel=-1;}
  void endContinuous(){
    if(testChannel>=0){auto&r=runs[testChannel];r.phase=Phase::Off;r.manualPump=false;r.manualValve=false;testChannel=-1;}
    for(auto&r:runs)if(r.phase!=Phase::Off && r.repeats==0){
      if(r.phase==Phase::Release)r.phase=Phase::Off;
      else r.repeats=r.cycle; // Finish this cycle; never restart on reconnection.
    }
  }
  uint8_t activeMask()const {uint8_t mask=0;for(uint8_t ch=0;ch<6;++ch)if(runs[ch].phase!=Phase::Off)mask|=1<<ch;return mask;}
  bool pump(uint8_t ch)const{return runs[ch].phase==Phase::Pump || (runs[ch].phase==Phase::Manual&&runs[ch].manualPump);}
  bool valve(uint8_t ch)const{return (runs[ch].phase==Phase::Manual&&runs[ch].manualValve) || runs[ch].phase==Phase::Select || runs[ch].phase==Phase::Pump || runs[ch].phase==Phase::Hold;}
  uint16_t remaining(uint8_t ch,uint32_t now)const {
    const auto&r=runs[ch];if(r.phase==Phase::Off)return 0;
    if(r.phase==Phase::Manual){const uint32_t pe=now-r.pumpStarted,ve=now-r.valveStarted;const uint16_t p=r.manualPump&&pe<MAX_PUMP?MAX_PUMP-pe:0,v=r.manualValve&&ve<MAX_HOLD?MAX_HOLD-ve:0;return p>v?p:v;}
    const uint32_t elapsed=now-r.started;
    const uint32_t end=r.phase==Phase::Release?r.releaseMs:r.phase==Phase::Select?LEAD:r.phase==Phase::Pump?uint32_t(LEAD)+r.pumpMs:uint32_t(LEAD)+r.pumpMs+r.holdMs;
    return elapsed<end?end-elapsed:0;
  }
 private:
  uint8_t enabled;
  int8_t testChannel=-1;
};
