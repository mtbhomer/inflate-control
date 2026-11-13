#pragma once
#include <stdint.h>
enum class Phase:uint8_t { Off=0, Select=1, Pump=2, Hold=3, Release=4 };
enum class Reply:uint8_t { None=0, Accepted=1, Busy=2, Invalid=4, Disabled=5, Stopped=6, Expired=7 };
struct Run {
 Phase phase=Phase::Off;
 uint8_t group=0;
 uint16_t pumpMs=1000,holdMs=1000,releaseMs=1000,repeats=1,cycle=0;
 uint32_t started=0;
};
class HubController {
 public:
  static constexpr uint16_t MIN_PUMP=50,MAX_PUMP=2000,MAX_HOLD=10000,MAX_RELEASE=10000,MAX_REPEATS=999,LEAD=100;
  explicit HubController(uint8_t mask):enabled(mask){}
  Run runs[6];
  void update(uint32_t now) {
    for(auto&r:runs){
      if(r.phase==Phase::Off)continue;
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
  }
  Reply start(uint8_t mask,uint16_t pump,uint16_t hold,uint16_t release,uint16_t repeats,uint32_t now) {
    update(now);
    if(!mask || mask>63 || pump<MIN_PUMP || pump>MAX_PUMP || hold>MAX_HOLD || release>MAX_RELEASE || repeats>MAX_REPEATS)return Reply::Invalid;
    if(mask&~enabled)return Reply::Disabled;
    // Group start is atomic: a busy member rejects the entire request.
    if(mask&activeMask())return Reply::Busy;
    for(uint8_t ch=0;ch<6;++ch)if(mask&(1<<ch)){
      auto&r=runs[ch];r.phase=Phase::Select;r.group=mask;r.pumpMs=pump;r.holdMs=hold;r.releaseMs=release;r.repeats=repeats;r.cycle=1;r.started=now;
    }
    return Reply::Accepted;
  }
  void stop(){for(auto&r:runs)r.phase=Phase::Off;}
  void endContinuous(){
    for(auto&r:runs)if(r.phase!=Phase::Off && r.repeats==0){
      if(r.phase==Phase::Release)r.phase=Phase::Off;
      else r.repeats=r.cycle; // Finish this cycle; never restart on reconnection.
    }
  }
  uint8_t activeMask()const {uint8_t mask=0;for(uint8_t ch=0;ch<6;++ch)if(runs[ch].phase!=Phase::Off)mask|=1<<ch;return mask;}
  bool pump(uint8_t ch)const{return runs[ch].phase==Phase::Pump;}
  bool valve(uint8_t ch)const{return runs[ch].phase==Phase::Select || runs[ch].phase==Phase::Pump || runs[ch].phase==Phase::Hold;}
  uint16_t remaining(uint8_t ch,uint32_t now)const {
    const auto&r=runs[ch];if(r.phase==Phase::Off)return 0;
    const uint32_t elapsed=now-r.started;
    const uint32_t end=r.phase==Phase::Release?r.releaseMs:r.phase==Phase::Select?LEAD:r.phase==Phase::Pump?uint32_t(LEAD)+r.pumpMs:uint32_t(LEAD)+r.pumpMs+r.holdMs;
    return elapsed<end?end-elapsed:0;
  }
 private:
  uint8_t enabled;
};
