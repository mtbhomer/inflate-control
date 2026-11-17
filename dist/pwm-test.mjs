import {sensorPercent,validMaximum} from './sensor-profile.mjs?v=13.1';
export const PWM_HZ=100;
export const PWM_RESULTS={1:'Selecting valve',2:'Pumping',3:'Taking final reading',4:'Full run · released',5:'Maximum reached · shortened',6:'Sensor unavailable · released',7:'Stopped · released',8:'Disconnected · released'};
export function pwmMeasurement(report){
 const measured=[4,5].includes(report.result)&&report.samples>=2&&report.startMv<=5000&&report.endMv<=5000;
 const start=report.startMv<=5000?sensorPercent(report.startMv):null,end=report.endMv<=5000?sensorPercent(report.endMv):null;
 return {start,end,rise:measured?end-start:null,rate:measured&&report.actualMs>0?(end-start)*1000/report.actualMs:null};
}
export function pwmAllowed(c,ch,maximum,reading){
 return Boolean(c.online&&c.fresh&&c.info?.pwmTests&&!c.busy&&(c.enabledMask&(1<<ch))&&validMaximum(maximum)&&reading&&!reading.low&&!reading.high);
}
export function pwmReportText(rows){
 return ['MeditationVest PWM comparison · 100 Hz · no kick-start',
 'Inflation rate = sensor percentage-point rise / actual commanded pump seconds. Not motor RPM or calibrated airflow.',
 'Final reading taken after 0.2 s hold. Compare the same bag, tubing and vented starting pressure. Shortened/interrupted runs are not full-duration comparisons.',
 ...rows.map(r=>{const m=pwmMeasurement(r),n=x=>x===null?'unavailable':x.toFixed(2);return `\n${r.preview?'PREVIEW / SIMULATED · ':''}${r.at} · CH${r.channel} · firmware v${r.firmware}\nDuty ${r.duty}% · requested ${r.duration} ms · actual ${r.actualMs??'unknown'} ms · saved maximum ${r.maximum}%\n${r.outcome||PWM_RESULTS[r.result]||'Unconfirmed'} · ${r.samples??0} sensor samples\nStart ${n(m.start)}% (${r.startMv<=5000?r.startMv:'unknown'} mV) · end ${n(m.end)}% (${r.endMv<=5000?r.endMv:'unknown'} mV)\nRise ${n(m.rise)} percentage points · inflation rate ${n(m.rate)} percentage points/s\nObserved: ${r.observation||'Not recorded'}\nNotes: ${r.notes||'—'}`;})].join('\n');
}
// Interface preview only. This linear demonstration is not a pump model.
export class PwmPreview{
 constructor(config,now,seq){Object.assign(this,config);this.started=now;this.seq=seq;this.done=false;}
 tick(now){
  const elapsed=now-this.started,limitMs=Math.max(0,Math.round((this.maximum-.12)/(this.duty/100*9)*1000)),actual=Math.min(this.duration,limitMs),pumpElapsed=Math.max(0,Math.min(actual,elapsed-100));
  let result=elapsed<100?1:elapsed<100+actual?2:elapsed<300+actual?3:limitMs<=this.duration?5:4;
  if(this.stopped)result=7;
  this.done=result>=4;
  return {kind:'pwm',session:1,seq:this.seq,channel:this.channel,duty:this.duty,duration:this.duration,startMv:elapsed<100?65535:203,endMv:elapsed<100?65535:Math.round(203+25*this.duty/100*9*pumpElapsed/1000),actualMs:Math.round(pumpElapsed),samples:elapsed<100?0:Math.min(255,1+Math.floor((elapsed-100)/80)),result};
 }
}
