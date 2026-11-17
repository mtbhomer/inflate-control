const reasons={
 1:'Sensor reading missing, stale or at an ADC endpoint (older firmware does not distinguish these).',
 2:'Sensor target was not reached within the requested pump time.',
 3:'No sensor sample was available.',
 4:'Sensor data was at least 500 ms old.',
 5:'ADC FLOOR: the electrical reading reached zero.',
 6:'ADC CEILING: the electrical reading reached its upper limit.',
 7:'ADC FLOOR and CEILING occurred within one sample window.'
};
export function routineFaultText(code,ch){return `CH${ch}: ${reasons[code]??'Unknown routine fault.'} Routine stopped and released.`;}
export class RoutineFaultLog{
 constructor(){this.seen=null;this.preview=null;this.saved=null;try{const s=JSON.parse(localStorage.getItem('inflate.last-routine-stop.v1'));if(typeof s?.deviceId==='string'&&reasons[s.code]&&Number.isInteger(s.channel)&&s.channel>=0&&s.channel<6&&Number.isFinite(Date.parse(s.at)))this.saved=s;}catch{}}
 observe(c,deviceId){
  if(!c.fresh)return;
  if(!c.routineFault){this.seen=null;return;}
  if(!reasons[c.routineFault]||!Number.isInteger(c.routineFaultChannel)||c.routineFaultChannel<0||c.routineFaultChannel>5)return;
  const key=JSON.stringify([c.demo,deviceId,c.info?.session,c.routineFault,c.routineFaultChannel]);
  if(key===this.seen)return;
  this.seen=key;
  const state=c.analogStates?.[c.routineFaultChannel],s=state?.sample;
  const record={deviceId,preview:Boolean(c.demo),at:new Date().toISOString(),firmware:c.info?.firmware??null,code:c.routineFault,channel:c.routineFaultChannel,
   sample:s?{millivolts:s.millivolts,raw:s.raw,flags:s.flags,age:s.age,receivedAgo:Math.max(0,Math.round(c.now-state.received))}:null};
  if(c.demo){this.preview=record;return;}
  if(typeof deviceId!=='string')return;
  this.saved=record;try{localStorage.setItem('inflate.last-routine-stop.v1',JSON.stringify(record));}catch{}
 }
 get(demo,deviceId){return demo?this.preview:this.saved?.deviceId===deviceId?this.saved:null;}
}
export function routineFaultReport(record){
 if(!record)return '';
 const s=record.sample;
 return [`MeditationVest · ${record.preview?'Preview · ':''}last routine stop`,`${record.at} · firmware v${record.firmware??'unknown'}`,routineFaultText(record.code,record.channel),
  'Passing 100% of a saved maximum does not itself stop a routine.',
  s?`Last received sensor sample (may precede the stop): ${s.millivolts} mV · ADC ${s.raw} · flags ${s.flags} · reported age ${s.age} ms · received ${s.receivedAgo} ms before this report.`:'No sensor sample was received by the app.'].join('\n');
}
