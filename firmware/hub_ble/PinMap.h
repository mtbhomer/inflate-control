#pragma once
#include <stdint.h>
// Six-channel hub plan, 16 November 2026 · CH1 aligned GPIOs. Confirm D16/D17 in USB-only checks.
constexpr int8_t PUMP_PINS[6] = {4, 23, 25, 19, 16, 13};
constexpr int8_t VALVE_PINS[6] = {17, 22, 26, 18, 27, 14};
constexpr int8_t ANALOG_PINS[6] = {35, 34, 32, 36, 39, 33};
constexpr uint8_t ENABLED_MASK = 63;
constexpr uint8_t ANALOG_MASK = 63;
constexpr bool validPinMap() {
 int8_t assigned[18]={};unsigned count=0;
 for(unsigned ch=0;ch<6;++ch){
  const int values[3]={PUMP_PINS[ch],VALVE_PINS[ch],ANALOG_PINS[ch]};
  for(unsigned role=0;role<3;++role){
   const int pin=values[role];
   if(role==2){if(pin!=32&&pin!=33&&pin!=34&&pin!=35&&pin!=36&&pin!=39)return false;}
   else if(pin<4||pin>27||(pin>=5&&pin<=12)||pin==15||pin==20||pin==24)return false;
   for(unsigned i=0;i<count;++i)if(assigned[i]==pin)return false;
   assigned[count++]=pin;
  }
 }
 return ENABLED_MASK==63&&ANALOG_MASK==63&&count==18;
}
static_assert(validPinMap(), "Six channels require distinct output GPIOs and ADC1 inputs");
