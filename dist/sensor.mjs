export const ADC_MAX=8388607,ADC_MIN=-8388608;
export function validZero(raw){return Number.isInteger(raw)&&raw>ADC_MIN&&raw<ADC_MAX;}
export function sensorRange(raw,baseline){
 if(!Number.isInteger(raw)||raw<ADC_MIN||raw>ADC_MAX)return null;
 const clipped=raw===ADC_MAX||raw===ADC_MIN;
 if(!validZero(baseline))return {percent:null,clipped,near:false};
 const percent=Math.max(0,Math.min(100,(raw-baseline)/(ADC_MAX-baseline)*100));
 return {percent,clipped,near:percent>=95};
}
