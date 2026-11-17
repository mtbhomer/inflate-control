// Nominal XGZP6847A positive-pressure 3.3 V profile, not a measured pressure calibration.
export const SENSOR_PROFILE=Object.freeze({id:'xgzp6847a-33',name:'XGZP6847A · 3.3 V',zeroMv:200,fullMv:2700});
export function sensorPercent(millivolts){return Number.isFinite(millivolts)?(millivolts-SENSOR_PROFILE.zeroMv)*100/(SENSOR_PROFILE.fullMv-SENSOR_PROFILE.zeroMv):null;}
export function validMaximum(value){return Number.isFinite(value)&&value>=0.1&&value<=100;}
export function percentMillivolts(percent){if(!validMaximum(percent))throw Error('Use 0.1–100% of the sensor range.');return Math.round(SENSOR_PROFILE.zeroMv+(SENSOR_PROFILE.fullMv-SENSOR_PROFILE.zeroMv)*percent/100);}
export function cleanSensorOptions(saved){return Array.from({length:6},(_,ch)=>({maximum:validMaximum(saved?.[ch]?.maximum)?saved[ch].maximum:null}));}
