export const ADC_MAX=8388607,ADC_MIN=-8388608;
export function validZero(raw){return Number.isInteger(raw)&&raw>ADC_MIN&&raw<ADC_MAX;}
export function sensorRange(raw,baseline){
 if(!Number.isInteger(raw)||raw<ADC_MIN||raw>ADC_MAX)return null;
 const clipped=raw===ADC_MAX||raw===ADC_MIN;
 if(!validZero(baseline))return {percent:null,clipped,near:false};
 const percent=Math.max(0,Math.min(100,(raw-baseline)/(ADC_MAX-baseline)*100));
 return {percent,clipped,near:percent>=95};
}
// ADC voltage display only; a floating/disconnected analog input can still read.
export function analogReading(sample,elapsed=0){
 if(!sample?.fresh||!Number.isFinite(elapsed)||elapsed<0||sample.age+elapsed>=500)return null;
 return {volts:sample.millivolts/1000,percent:sample.raw/4095*100,
  low:Boolean(sample.flags&4),high:Boolean(sample.flags&8),near:sample.raw>=3890};
}
