#pragma once
#include <stdint.h>
enum class Phase:uint8_t { Off=0, Select=1, Pump=2, Hold=3, Release=4, Manual=5 };
enum class Reply:uint8_t { None=0, Accepted=1, Busy=2, Invalid=4, Disabled=5, Stopped=6, Expired=7, StorageFailed=8 };
struct Run {
 Phase phase=Phase::Off;
 uint8_t group=0;
 uint16_t pumpMs=1000,holdMs=1000,releaseMs=1000,repeats=1,cycle=0;
 uint32_t started=0;
 bool manualPump=false,manualValve=false;
 uint32_t pumpStarted=0,valveStarted=0;
};
struct SensorFeedback {uint16_t raw=0;uint32_t sampledAt=0;uint8_t limits=0;bool available=false;};
struct RoutineStage {uint8_t mask=0;uint16_t pumpMs=1000,holdMs=1000,releaseMs=2000,windowMs=30000;uint16_t targets[6]={};bool ready=false;};
struct RoutineRun {
 bool active=false,settling=false;
 uint8_t kind=0,count=0,step=0,phase=0,pumpMask=0;
 uint16_t cycle=0,repeats=1,settleMs=0,pulse=0;
 uint32_t started=0,stepStarted=0,phaseStarted=0;
 RoutineStage stages[3];
};
class HubController {
 public:
  static constexpr uint16_t MIN_PUMP=50,MAX_PUMP=2000,MAX_HOLD=10000,MAX_RELEASE=10000,MAX_REPEATS=999,LEAD=100;
  explicit HubController(uint8_t mask):available(mask),enabled(mask){}
  uint8_t enabledMask()const{return enabled;}
  Reply setEnabledChannels(uint8_t mask,uint32_t now){
    update(now);
    if(mask>63 || (mask&~available))return Reply::Invalid;
    if(activeMask()||routine.active)return Reply::Busy;
    stop();for(auto&r:runs)r=Run{};enabled=mask;for(auto&s:sensors)s=SensorFeedback{};
    return Reply::Accepted;
  }
  Run runs[6];
  RoutineRun routine;
  SensorFeedback sensors[6];
  uint8_t routineFault=0,routineFaultChannel=0;
  void update(uint32_t now) {
    advanceRoutine(now);
    if(routine.active)return;
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
    if(testChannel>=0||routine.active)return Reply::Busy;
    // Group start is atomic: a busy member rejects the entire request.
    if(mask&activeMask())return Reply::Busy;
    for(uint8_t ch=0;ch<6;++ch)if(mask&(1<<ch)){
      auto&r=runs[ch];r.phase=Phase::Select;r.group=mask;r.pumpMs=pump;r.holdMs=hold;r.releaseMs=release;r.repeats=repeats;r.cycle=1;r.started=now;
    }
    return Reply::Accepted;
  }
  Reply manual(uint8_t mask,uint8_t pumpState,uint8_t valveState,uint32_t now){
    update(now);
    if(routine.active)return Reply::Busy;
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
    if(activeMask()||routine.active)return Reply::Busy;
    const auto result=start(mask,pump,hold,0,1,now);
    if(result==Reply::Accepted){testChannel=0;while(!(mask&(1<<testChannel)))++testChannel;}
    return result;
  }
  Reply configureStage(uint8_t index,uint8_t mask,uint16_t pump,uint16_t hold,uint16_t release,uint16_t window,uint32_t now){
    update(now);
    if(activeMask()||routine.active){stagedCount=0;return Reply::Busy;}
    unsigned members=0;for(uint8_t bit=mask;bit;bit>>=1)members+=bit&1;
    if(index>2||!mask||mask>63||members>2||pump<MIN_PUMP||pump>MAX_PUMP||hold>MAX_HOLD||release<500||release>10000||window>60000||window<uint32_t(LEAD)+pump+hold+release){stagedCount=0;return Reply::Invalid;}
    if(mask&~enabled){stagedCount=0;return Reply::Disabled;}
    if(index==0)stagedCount=0;
    if(index!=stagedCount||(index&&(now-stagedAt>5000||!staged[index-1].ready))){stagedCount=0;return Reply::Invalid;}
    for(unsigned i=0;i<index;++i)if(staged[i].mask&mask){stagedCount=0;return Reply::Invalid;}
    staged[index]=RoutineStage{};auto&s=staged[index];s.mask=mask;s.pumpMs=pump;s.holdMs=hold;s.releaseMs=release;s.windowMs=window;
    ++stagedCount;stagedAt=now;return Reply::Accepted;
  }
  Reply configureTargets(uint8_t index,uint8_t mask,uint16_t first,uint16_t second,uint32_t now){
    update(now);
    if(activeMask()||routine.active){stagedCount=0;return Reply::Busy;}
    if(index>=stagedCount||index+1!=stagedCount||now-stagedAt>5000||mask!=staged[index].mask||first>4094||second>4094){stagedCount=0;return Reply::Invalid;}
    auto&s=staged[index];unsigned n=0;for(unsigned ch=0;ch<6;++ch)if(mask&(1<<ch))s.targets[ch]=n++==0?first:second;
    if((n==1&&second)||(n==2&&bool(first)!=bool(second))){stagedCount=0;return Reply::Invalid;}
    s.ready=true;stagedAt=now;return Reply::Accepted;
  }
  Reply beginRoutine(uint8_t kind,uint8_t count,uint16_t settle,uint16_t repeats,uint32_t now){
    update(now);
    if(activeMask()||routine.active){stagedCount=0;return Reply::Busy;}
    if((kind!=1&&kind!=2)||count<1||count>3||(kind==1&&count!=1)||(kind==2&&count<2)||count!=stagedCount||settle>60000||repeats>MAX_REPEATS||now-stagedAt>5000){stagedCount=0;return Reply::Invalid;}
    for(unsigned i=0;i<count;++i){
      if(!staged[i].ready){stagedCount=0;return Reply::Invalid;}
      for(unsigned ch=0;ch<6;++ch)if(staged[i].targets[ch]&&!sensorValid(ch,now)){abortRoutine(1,ch);return Reply::Invalid;}
    }
    routineFault=0;routine=RoutineRun{};routine.active=true;routine.settling=settle>0;routine.kind=kind;routine.count=count;
    routine.cycle=1;routine.repeats=repeats;routine.settleMs=settle;routine.started=routine.stepStarted=routine.phaseStarted=now;routine.phase=1;
    for(unsigned i=0;i<count;++i)routine.stages[i]=staged[i];
    stagedCount=0;if(!routine.settling)startRoutineStage(now);
    return routine.active?Reply::Accepted:Reply::Invalid;
  }
  uint8_t routinePhase(uint32_t)const{return routine.active?routine.phase:0;}
  uint16_t routineRemaining(uint32_t now)const{
    if(!routine.active)return 0;
    const auto&s=routine.stages[routine.step];const auto phase=routine.phase;
    const uint32_t duration=phase==1?routine.settleMs:phase==2?LEAD:phase==3?s.pumpMs:phase==4?s.holdMs:phase==5?s.releaseMs:s.windowMs;
    const uint32_t elapsed=now-(phase==6?routine.stepStarted:routine.phaseStarted);return elapsed<duration?duration-elapsed:0;
  }
  void clearStagedRoutine(){stagedCount=0;}
  void stop(){for(auto&r:runs){r.phase=Phase::Off;r.manualPump=false;r.manualValve=false;}testChannel=-1;routine.active=false;routineFault=0;stagedCount=0;}
  void endContinuous(){
    stagedCount=0;
    if(routine.active)stop();
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
    if(routine.active)return routineRemaining(now);
    if(r.phase==Phase::Manual){const uint32_t pe=now-r.pumpStarted,ve=now-r.valveStarted;const uint16_t p=r.manualPump&&pe<MAX_PUMP?MAX_PUMP-pe:0,v=r.manualValve&&ve<MAX_HOLD?MAX_HOLD-ve:0;return p>v?p:v;}
    const uint32_t elapsed=now-r.started;
    const uint32_t end=r.phase==Phase::Release?r.releaseMs:r.phase==Phase::Select?LEAD:r.phase==Phase::Pump?uint32_t(LEAD)+r.pumpMs:uint32_t(LEAD)+r.pumpMs+r.holdMs;
    return elapsed<end?end-elapsed:0;
  }
 private:
  RoutineStage staged[3];uint8_t stagedCount=0;uint32_t stagedAt=0;
  bool sensorValid(unsigned ch,uint32_t now)const{const auto&s=sensors[ch];return s.available&&now-s.sampledAt<500&&s.raw>0&&s.raw<4095&&!(s.limits&12);}
  void clearOutputs(){for(auto&r:runs)r=Run{};}
  void abortRoutine(uint8_t fault,uint8_t ch){stop();routineFault=fault;routineFaultChannel=ch;}
  void setRoutinePhase(uint8_t phase,uint32_t now){routine.phase=phase;routine.phaseStarted=now;}
  void renderRoutineOutputs(){
    const auto&s=routine.stages[routine.step];
    for(unsigned ch=0;ch<6;++ch){
      auto&r=runs[ch];r=Run{};if(!(s.mask&(1<<ch)))continue;
      r.group=s.mask;r.pumpMs=s.pumpMs;r.holdMs=s.holdMs;r.repeats=1;r.cycle=routine.pulse;r.started=routine.phaseStarted;
      r.phase=routine.phase==2?Phase::Select:routine.phase==3?(routine.pumpMask&(1<<ch)?Phase::Pump:Phase::Hold):routine.phase==4?Phase::Hold:Phase::Off;
    }
  }
  void startPulse(uint32_t now){
    const auto&s=routine.stages[routine.step];
    for(unsigned ch=0;ch<6;++ch)if(s.targets[ch]&&!sensorValid(ch,now)){abortRoutine(1,ch);return;}
    ++routine.pulse;routine.pumpMask=0;setRoutinePhase(2,now);renderRoutineOutputs();
  }
  void startRoutineStage(uint32_t now){
    clearOutputs();routine.settling=false;routine.stepStarted=now;routine.pulse=0;startPulse(now);
  }
  void advanceRoutine(uint32_t now){
    if(!routine.active)return;
    if(routine.settling){if(now-routine.stepStarted>=routine.settleMs)startRoutineStage(now);return;}
    auto&s=routine.stages[routine.step];
    if(now-routine.stepStarted>=s.windowMs){
      clearOutputs();
      if(++routine.step>=routine.count){
        if(routine.repeats&&routine.cycle>=routine.repeats){routine.active=false;return;}
        routine.step=0;if(routine.cycle<65535)++routine.cycle;
      }
      startRoutineStage(now);return; // Never catch up missed windows.
    }
    if(routine.phase>=2&&routine.phase<=4)for(unsigned ch=0;ch<6;++ch)if(s.targets[ch]&&!sensorValid(ch,now)){abortRoutine(1,ch);return;}
    const uint32_t elapsed=now-routine.phaseStarted;
    if(routine.phase==2&&elapsed>=LEAD){
      routine.pumpMask=s.mask;
      for(unsigned ch=0;ch<6;++ch)if(s.targets[ch]&&sensors[ch].raw>=s.targets[ch])routine.pumpMask&=~(1<<ch);
      setRoutinePhase(routine.pumpMask?3:4,now);
    }else if(routine.phase==3){
      for(unsigned ch=0;ch<6;++ch)if(s.targets[ch]&&sensors[ch].raw>=s.targets[ch])routine.pumpMask&=~(1<<ch);
      if(!routine.pumpMask)setRoutinePhase(4,now);
      else if(elapsed>=s.pumpMs){
        for(unsigned ch=0;ch<6;++ch)if((routine.pumpMask&(1<<ch))&&s.targets[ch]){abortRoutine(2,ch);return;}
        routine.pumpMask=0;setRoutinePhase(4,now);
      }
    }else if(routine.phase==4&&elapsed>=s.holdMs){routine.pumpMask=0;setRoutinePhase(5,now);}
    else if(routine.phase==5&&elapsed>=s.releaseMs){
      const uint32_t remaining=s.windowMs-(now-routine.stepStarted);
      if(remaining>=uint32_t(LEAD)+s.pumpMs+s.holdMs+s.releaseMs)startPulse(now);
      else setRoutinePhase(6,now); // Finish with a released observation interval.
    }
    if(routine.active)renderRoutineOutputs();
  }
  const uint8_t available;
  uint8_t enabled;
  int8_t testChannel=-1;
};
