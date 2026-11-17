import {percentMillivolts,validMaximum} from './sensor-profile.mjs?v=11';
export const ZONES={front:{name:'Front',code:'D',cue:'Notice gentle contact at the front of your body. Let your breathing stay natural.'},upper:{name:'Upper back',code:'B1 / C1',cue:'Bring attention to your upper back. Notice contact around your shoulders.'},middle:{name:'Middle back',code:'B2 / C2',cue:'Move attention to your middle back. Notice support and sensation.'},lower:{name:'Lower back',code:'LB',cue:'Continue to your lower back. Notice contact and relaxation in this area.'}};
export const ROUTINE_PHASES=['Ready','Settle in','Selecting zone','Inflating to target','Notice contact','Release','Released · observe'];
const zone=()=>({mask:0,mode:'sensor',target:null,pump:2000,hold:1000,release:2000,window:30000});
export function defaultRoutines(){return {targetScale:'sensor-range-v1',selected:'breathing',spoken:false,voice:'sarah',browserVoice:'',rate:1,breathing:{settle:5000,repeats:1,lower:false,zones:{front:zone()}},scan:{settle:30000,repeats:1,lower:true,zones:{upper:zone(),middle:zone(),lower:zone()}}};}
export function zoneIds(kind,cfg){return kind==='breathing'?['front']:cfg.lower?['upper','middle','lower']:['upper','middle'];}
export function channels(mask){return Array.from({length:6},(_,ch)=>ch).filter(ch=>mask&(1<<ch));}
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
export function cleanRoutines(saved){
 const d=defaultRoutines();d.selected=saved?.selected==='scan'?'scan':'breathing';d.spoken=saved?.spoken===true;d.voice=['sarah','lily','device'].includes(saved?.voice)?saved.voice:'sarah';d.browserVoice=typeof saved?.browserVoice==='string'?saved.browserVoice:'';d.rate=Number.isFinite(saved?.rate)&&saved.rate>=.75&&saved.rate<=1.25?saved.rate:1;
 for(const kind of ['breathing','scan']){const c=saved?.[kind],t=d[kind];if(!c)continue;
  if(integer(c.settle,0,60000))t.settle=c.settle;if(integer(c.repeats,0,999))t.repeats=c.repeats;if(kind==='scan')t.lower=c.lower!==false;
  for(const id of Object.keys(t.zones)){const z=c.zones?.[id];if(!z)continue;
   for(const [key,min,max] of [['mask',0,63],['pump',50,2000],['hold',0,10000],['release',500,10000],['window',1000,60000]])if(integer(z[key],min,max))t.zones[id][key]=z[key];
   if(saved.targetScale==='sensor-range-v1'&&Number.isFinite(z.target)&&z.target>=0.1&&z.target<=100)t.zones[id].target=z.target;t.zones[id].mode=z.mode==='timed'?'timed':'sensor';
  }
 }return d;
}
export function buildRoutine(kind,cfg,enabled=63,options=[]){
 if(!['breathing','scan'].includes(kind)||!integer(cfg?.settle,0,60000)||!integer(cfg?.repeats,0,999))throw Error('Use a start delay of 0–60 seconds and 1–999 rounds, or Until Stop.');
 let used=0;
 const stages=zoneIds(kind,cfg).map(id=>{
  const saved=cfg.zones[id],z=saved?{...saved,mask:saved.mask&enabled}:null,label=ZONES[id].name;
  if(!saved||!integer(saved.mask,1,63)||!integer(z.mask,1,63)||channels(z.mask).length>2)throw Error(`Assign one or two enabled channels to ${label.toLowerCase()} in Zones.`);
  if(used&z.mask)throw Error('A channel can belong to only one zone in a routine.');used|=z.mask;
  if(!integer(z.pump,50,2000)||!integer(z.hold,0,10000)||!integer(z.release,500,10000)||!integer(z.window,1000,60000)||z.window<100+z.pump+z.hold+z.release)throw Error(`${label}: the zone duration must fit a full pump, hold and release cycle (including 0.1 s valve lead).`);
  if(!['sensor','timed'].includes(z.mode))throw Error('Choose sensor target or timed inflation.');
  if(z.mode==='sensor'&&(!Number.isFinite(z.target)||z.target<0.1||z.target>100))throw Error(`Set ${label.toLowerCase()}'s target from 0.1–100% of the sensor range in Sequences.`);
  const targets=channels(z.mask).map(ch=>{if(z.mode==='timed')return 0;const max=options[ch]?.maximum;if(!validMaximum(max))throw Error(`CH${ch}: set a channel maximum in Device → Sensor setup.`);if(z.target>max)throw Error(`${label}: target exceeds CH${ch}’s ${max}% maximum. Adjust the target or channel maximum.`);return percentMillivolts(z.target);});
  return {...z,id,targets};
 });return {targetUnit:'millivolts',kind:kind==='breathing'?1:2,settle:cfg.settle,repeats:cfg.repeats,stages};
}
// A deterministic demonstration of the device state machine, with synthetic sensor feedback.
export class RoutinePreview{
 constructor(plan,now){this.plan=structuredClone(plan);this.stepStart=this.phaseStart=now;this.phase=plan.settle?1:2;this.step=0;this.cycle=1;this.pulse=plan.settle?0:1;this.active=true;this.pumpMask=0;this.fault=0;this.faultChannel=0;this.peak=Array(6).fill(264);}
 change(phase,now){this.phase=phase;this.phaseStart=now;}
 pulseStart(now){this.pulse++;this.change(2,now);}
 tick(now){
  const p=this.plan;let s=p.stages[this.step],elapsed=now-this.phaseStart;
  if(this.active){
   if(this.phase===1){if(elapsed>=p.settle){this.stepStart=now;this.pulseStart(now);}}
   else if(now-this.stepStart>=s.window){if(++this.step>=p.stages.length){if(p.repeats&&this.cycle>=p.repeats)this.active=false;else{this.step=0;this.cycle=Math.min(65535,this.cycle+1);}}if(this.active){this.stepStart=now;this.pulse=0;this.pulseStart(now);}}
   else if(this.phase===2&&elapsed>=100){this.pumpMask=s.mask;this.change(3,now);}
   else if(this.phase===3){
    channels(s.mask).forEach((ch,i)=>{if(s.targets[i]&&elapsed>=400+ch*60)this.pumpMask&=~(1<<ch);});
    if(!this.pumpMask)this.change(4,now);
    else if(elapsed>=s.pump){const missed=channels(this.pumpMask).find(ch=>s.targets[channels(s.mask).indexOf(ch)]);if(missed!==undefined){this.fault=2;this.faultChannel=missed;this.active=false;}else{this.pumpMask=0;this.change(4,now);}}
   }else if(this.phase===4&&elapsed>=s.hold)this.change(5,now);
   else if(this.phase===5&&elapsed>=s.release){if(s.window-(now-this.stepStart)>=100+s.pump+s.hold+s.release)this.pulseStart(now);else this.change(6,now);}
  }
  s=p.stages[this.step]??s;elapsed=now-this.phaseStart;
  const runs=Array(6).fill(null),analogRaw=Array(6).fill(264);
  let routine={kind:'routine',routineKind:0,phase:0,step:0,count:0,cycle:0,repeats:0,remaining:0,elapsed:0,pulse:0};
  if(this.active){
   const duration=this.phase===1?p.settle:this.phase===2?100:this.phase===3?s.pump:this.phase===4?s.hold:this.phase===5?s.release:s.window;
   routine={...routine,routineKind:p.kind,phase:this.phase,step:this.step,count:p.stages.length,cycle:this.cycle,repeats:p.repeats,remaining:Math.max(0,Math.ceil(duration-(this.phase===6?now-this.stepStart:elapsed))),elapsed:now-this.stepStart,pulse:this.pulse};
   channels(s.mask).forEach((ch,i)=>{
    const target=s.targets[i]?Math.round(s.targets[i]/3100*4095):2200,rise=this.phase===3?Math.min(1,elapsed/(s.targets[i]?400+ch*60:s.pump)):this.phase===4?1:this.phase===5?Math.max(0,1-elapsed/s.release):0;
    analogRaw[ch]=Math.round(264+(target-264)*rise);
    if(this.phase>=2&&this.phase<=4)runs[ch]={routineOwned:true,pump:s.pump,hold:s.hold,release:s.release,repeats:1,cycle:this.pulse,phase:this.phase===2?1:this.phase===3&&(this.pumpMask&(1<<ch))?2:3,group:s.mask,remaining:routine.remaining};
   });
  }
  return {runs,routine,analogRaw,fault:this.fault,faultChannel:this.faultChannel,complete:!this.active};
 }
}
