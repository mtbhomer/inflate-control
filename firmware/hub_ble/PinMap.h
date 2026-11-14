#pragma once
#include <stdint.h>
// Current working wiring, 13 November 2026. -1 means NOT ASSIGNED.
constexpr int8_t PUMP_PINS[6] = {-1, 22, 25, -1, -1, -1};
constexpr int8_t VALVE_PINS[6] = {-1, 23, 26, -1, -1, -1};
constexpr uint8_t ENABLED_MASK = (1 << 1) | (1 << 2);
constexpr uint8_t ANALOG_MASK = (1 << 1) | (1 << 2);
constexpr int8_t ANALOG_PINS[6] = {-1,34,32,-1,-1,-1};
constexpr int UNUSED_CLOCK_PIN = 33; // Old CH2 SCK: input, no pull and no clock pulses.
// CH1 is the user-confirmed D22 pump / D23 valve override.
// CH1: new analog OUT D34. CH2: replacement analog OUT reuses D32.
// CH2 is the bottom-left board. CH3 can share its GPIOs: leave unplugged.
// Future ports require dedicated verified GPIOs before changing ENABLED_MASK.
constexpr bool validPinMap() {
  for (int i=0;i<6;++i) {
    if (!(ENABLED_MASK & (1<<i))) {
      if (PUMP_PINS[i]!=-1 || VALVE_PINS[i]!=-1) return false;
      continue;
    }
    const int pins[2]={PUMP_PINS[i],VALVE_PINS[i]};
    for (int k=0;k<2;++k) {
      int p=pins[k];
      if (p<0 || p>33 || (p>=6 && p<=11) || p==UNUSED_CLOCK_PIN) return false;
      for(int a=0;a<6;++a)if((ANALOG_MASK&(1<<a))&&p==ANALOG_PINS[a])return false;
      if (PUMP_PINS[i]==VALVE_PINS[i]) return false;
      for (int j=0;j<i;++j) if ((ENABLED_MASK&(1<<j)) && (p==PUMP_PINS[j] || p==VALVE_PINS[j])) return false;
    }
  }
  for(int ch=0;ch<6;++ch)if(ANALOG_MASK&(1<<ch)){
    if(!(ENABLED_MASK&(1<<ch))||ANALOG_PINS[ch]<32||ANALOG_PINS[ch]>39||ANALOG_PINS[ch]==UNUSED_CLOCK_PIN)return false;
    for(int j=0;j<ch;++j)if((ANALOG_MASK&(1<<j))&&ANALOG_PINS[j]==ANALOG_PINS[ch])return false;
  }else if(ANALOG_PINS[ch]!=-1)return false;
  return true;
}
static_assert(validPinMap(), "Assign distinct output-capable GPIOs to enabled channels only");
