#pragma once
#include <stdint.h>
enum class Phase:uint8_t { Off=0, Select=1, Pump=2, Hold=3 };
enum class Reply:uint8_t { None=0, Accepted=1, Busy=2, Venting=3, Invalid=4, Disabled=5, Stopped=6, Expired=7, Duplicate=8 };
class HubController {
 public:
  static constexpr uint16_t MIN_PUMP=50, MAX_PUMP=2000, MAX_HOLD=10000, LEAD=100, VENT=2000;
  explicit HubController(uint8_t mask):enabled(mask){}
  void update(uint32_t now) {
    if(channel<0)return;
    const uint32_t elapsed=now-started;
    if(elapsed>=uint32_t(LEAD)+pumpMs+holdMs) stop(now);
    else if(elapsed<LEAD)phase=Phase::Select;
    else if(elapsed<uint32_t(LEAD)+pumpMs)phase=Phase::Pump;
    else phase=Phase::Hold;
  }
  Reply start(uint8_t ch,uint16_t pump,uint16_t hold,uint32_t now) {
    update(now);
    if(ch>=6 || pump<MIN_PUMP || pump>MAX_PUMP || hold>MAX_HOLD)return Reply::Invalid;
    if(!(enabled&(1<<ch)))return Reply::Disabled;
    if(channel>=0)return Reply::Busy;
    if(ventRemaining(now))return Reply::Venting;
    channel=ch;pumpMs=pump;holdMs=hold;started=now;phase=Phase::Select;
    return Reply::Accepted;
  }
  void stop(uint32_t now) {
    if(channel>=0){stopped=now;hasStopped=true;}
    channel=-1;phase=Phase::Off;
  }
  bool pump(uint8_t ch)const{return channel==ch && phase==Phase::Pump;}
  bool valve(uint8_t ch)const{return channel==ch && phase!=Phase::Off;}
  uint16_t remaining(uint32_t now)const {
    if(channel<0)return 0;
    const uint32_t elapsed=now-started;
    uint32_t end=phase==Phase::Select?LEAD:phase==Phase::Pump?uint32_t(LEAD)+pumpMs:uint32_t(LEAD)+pumpMs+holdMs;
    return elapsed<end?end-elapsed:0;
  }
  uint16_t ventRemaining(uint32_t now)const {
    const uint32_t elapsed=now-stopped;
    return hasStopped && elapsed<VENT?VENT-elapsed:0;
  }
  int8_t channel=-1;
  Phase phase=Phase::Off;
 private:
  uint8_t enabled;
  uint16_t pumpMs=1000,holdMs=1000;
  uint32_t started=0,stopped=0;
  bool hasStopped=false;
};
