export const UUID = Object.freeze({service:'8d5a0001-4c7b-4f45-9d68-8e0c2c970001',command:'8d5a0002-4c7b-4f45-9d68-8e0c2c970001',status:'8d5a0003-4c7b-4f45-9d68-8e0c2c970001',info:'8d5a0004-4c7b-4f45-9d68-8e0c2c970001'});
export const PHASES=['Ready','Selecting valve','Pumping','Holding','Released','Manual test'];
export const REPLIES=['','Started','A selected channel is already running','','Invalid timing or channel','Channel is disabled','Release requested','Command expired; nothing started','Could not save channel selection; previous settings retained','Pump output error; outputs released. Restart the hub before testing'];
const view=v=>v instanceof DataView?v:new DataView(v.buffer??v,v.byteOffset??0,v.byteLength);
function frame(v,n){v=view(v);if(v.byteLength!==n||v.getUint8(0)!==2)throw Error('Please install the v14 MeditationVest firmware from Device, then reconnect.');return v;}
export function decodeInfo(input){
 const v=frame(input,20), info={mask:v.getUint8(1),sensorChannel:v.getUint8(2),firmware:v.getUint8(3),minPump:v.getUint16(4,true),maxPump:v.getUint16(6,true),maxHold:v.getUint16(8,true),lead:v.getUint16(10,true),maxRelease:v.getUint16(12,true),session:v.getUint32(14,true),flags:v.getUint8(18)};
 const legacy=info.firmware===2&&info.flags===15&&info.sensorChannel===2&&v.getUint8(19)===0;
 const mixed=info.firmware===3&&info.flags===31&&info.sensorChannel===2&&v.getUint8(19)===1;
 const dual=info.firmware===4&&info.flags===31&&info.sensorChannel===255&&v.getUint8(19)===6;
 const six=[5,6].includes(info.firmware)&&info.flags===31&&info.sensorChannel===255&&v.getUint8(19)===63&&info.mask===63;
 const bench=info.firmware===7&&info.flags===63&&info.sensorChannel===255&&v.getUint8(19)===63&&info.mask===63;
 const guided=info.firmware===8&&info.flags===127&&info.sensorChannel===255&&v.getUint8(19)===63&&info.mask===63;
 const selectable=[9,10,11,12,13,14].includes(info.firmware)&&info.flags===255&&info.sensorChannel===255&&v.getUint8(19)===info.mask&&info.mask<=63;
 info.targetOnlyRoutines=[13,14].includes(info.firmware);info.maxRoutinePump=info.targetOnlyRoutines?60000:2000;info.routineSpeed=[12,13,14].includes(info.firmware);info.pwmTests=[11,12,13,14].includes(info.firmware);info.sensorRangeTargets=info.firmware>=10;info.calibrationPulses=info.firmware>=10;info.channelSelection=selectable;info.availableMask=selectable?63:info.mask;
 info.routines=guided||selectable;info.testControls=bench||guided||selectable;
 if(!info.session||(!info.mask&&!selectable)||info.mask>63||(!legacy&&!mixed&&!dual&&!six&&!bench&&!guided&&!selectable)||info.minPump<1||info.minPump>info.maxPump||info.maxPump>2000||info.maxHold>10000||info.lead!==100||info.maxRelease>10000)throw Error('Firmware settings do not match this control page.');
 info.analogChannels=selectable?Array.from({length:6},(_,ch)=>ch).filter(ch=>info.mask&(1<<ch)):six||bench||guided?[0,1,2,3,4,5]:dual?[1,2]:mixed?[1]:[];
 info.hxChannel=dual||six||bench||guided||selectable?null:2;
 return info;
}
export function decodeStatus(input,info=null){
 const v=frame(input,20),kind=v.getUint8(1),session=v.getUint32(6,true);
 if(kind===0x40){
  const s={kind:'pwm',session,channel:v.getUint8(2),duty:v.getUint8(3),duration:v.getUint16(4,true),startMv:v.getUint16(10,true),endMv:v.getUint16(12,true),actualMs:v.getUint16(14,true),result:v.getUint8(16),samples:v.getUint8(17),seq:v.getUint16(18,true)};
  if(s.channel>5||s.duty<25||s.duty>100||s.duty%5||![250,500,1000].includes(s.duration)||s.result<1||s.result>8||!s.seq||[s.startMv,s.endMv].some(m=>m>5000&&m!==65535)||([4,5].includes(s.result)&&(s.startMv===65535||s.endMv===65535||s.samples<2)))throw Error('Invalid PWM test report.');
  return s;
 }
 if(kind===0x30){
  const s={kind:'routine',session,routineKind:v.getUint8(2),phase:v.getUint8(3),step:v.getUint8(4),count:v.getUint8(5),cycle:v.getUint16(10,true),repeats:v.getUint16(12,true),remaining:v.getUint16(14,true),elapsed:v.getUint16(16,true),pulse:v.getUint16(18,true)};
  if(s.routineKind>2||s.phase>6||s.remaining>60000||s.repeats>999||(!s.routineKind&&(s.phase||s.step||s.count||s.cycle||s.repeats||s.remaining||s.elapsed||s.pulse))||(s.routineKind&&(!s.phase||s.count<1||s.count>3||s.step>=s.count||!s.cycle||(s.routineKind===1&&s.count!==1)||(s.routineKind===2&&s.count<2))))throw Error('Invalid routine status received.');
  return s;
 }
 if(kind===0x20){
  const s={kind:'analog',session,channel:v.getUint8(2),flags:v.getUint8(3),raw:v.getUint16(4,true),millivolts:v.getUint16(10,true),age:v.getUint16(12,true)};
  if(s.channel>5||s.flags>15||s.raw>4095||s.millivolts>5000||Array.from({length:6},(_,i)=>v.getUint8(14+i)).some(Boolean)||((s.flags&2)&&!(s.flags&1)))throw Error('Invalid analog sensor status received.');
  s.fresh=Boolean(s.flags&1)&&Boolean(s.flags&2)&&s.age<500;
  return s;
 }
 if((kind&0xf0)===0x10){
  const s={kind:'detail',session,phase:kind&15,channel:v.getUint8(2),group:v.getUint8(3),cycle:v.getUint16(4,true),pump:v.getUint16(10,true),hold:v.getUint16(12,true),release:v.getUint16(14,true),repeats:v.getUint16(16,true),remaining:v.getUint16(18,true)};
  if(s.phase>5||s.channel>5||s.group>63||(s.pump===0?!info?.targetOnlyRoutines:s.pump<50)||s.pump>(info?.targetOnlyRoutines?60000:2000)||s.hold>10000||s.release>10000||s.remaining>(info?.targetOnlyRoutines?60000:10000)||(s.phase&&(!(s.group&(1<<s.channel))||!s.cycle)))throw Error('Invalid channel status received.');
  return s;
 }
 if(kind!==0)throw Error('Invalid hub status received.');
 const packed=v.getUint8(16)|(v.getUint8(17)<<8)|(v.getUint8(18)<<16);
 const s={kind:'summary',session,flags:v.getUint8(2)&15,reply:v.getUint8(2)>>4,active:v.getUint8(3),seq:v.getUint16(4,true),raw:v.getInt32(10,true),age:v.getUint16(14,true),phases:Array.from({length:6},(_,ch)=>(packed>>(3*ch))&7),routineKind:v.getUint8(19)&128?0:v.getUint8(19),routineFault:v.getUint8(19)&128?(v.getUint8(19)>>3)&15:0,routineFaultChannel:v.getUint8(19)&128?v.getUint8(19)&7:0};
 s.calibration=Boolean(s.flags&1);s.pwmTest=Boolean(s.flags&2);
 s.enabledMask=v.getUint8(15)===0xa9?v.getUint8(14):null;
 if(s.enabledMask!==null&&s.enabledMask>63)throw Error('Invalid enabled channels.');
 if(s.reply>9||s.reply===3||s.active>63||s.phases.some((p,ch)=>p>5||Boolean(p)!==Boolean(s.active&(1<<ch)))||packed>>18||s.routineKind>2||(v.getUint8(19)&128)&&(![1,2,3,4,5,6,7].includes(s.routineFault)||s.routineFaultChannel>5)||s.raw<-8388608||s.raw>8388607)throw Error('Invalid hub status received.');
 s.outputs=Array.from({length:6},(_,ch)=>({pump:Boolean(s.raw&(1<<(2*ch))),valve:Boolean(s.raw&(2<<(2*ch)))}));
 s.fresh=Boolean(s.flags&2)&&Boolean(s.flags&1)&&!(s.flags&4)&&s.age<500;
 return s;
}
export function encodeCommand({op,mask=0,aux=0,pumpMs=0,holdMs=0,releaseMs=0,repeats=1,seq,session},info){
 if(!Number.isInteger(seq)||seq<1||seq>65535||!Number.isInteger(session)||session<=0||session>0xffffffff)throw Error('Reconnect to renew the control session.');
 if(![1,2,3,4,5,6,7,8,9,10,11].includes(op))throw Error('Unknown command.');
 if((op<=4||(op>=8&&op<=10))&&aux!==0)throw Error('Invalid command parameter.');
 if((op>=5&&op<=7)&&!info.routines)throw Error('Install v8 to run guided routines.');
 if(op===8&&(!info.channelSelection||!Number.isInteger(mask)||mask<0||mask>63||(mask&~info.availableMask)||pumpMs!==0||holdMs!==0||releaseMs!==0||repeats!==0))throw Error('Install v9 and choose available channels.');
 if(op===9&&(!info.calibrationPulses||!Number.isInteger(mask)||mask<1||mask>63||(mask&(mask-1))||(mask&~info.mask)||![100,1000].includes(pumpMs)||holdMs!==0||releaseMs!==0||repeats!==0))throw Error('Install v10 and select one enabled channel for a 0.1 s or 1 s increment.');
 if(op===10&&(!info.pwmTests||!Number.isInteger(mask)||mask<1||mask>63||(mask&(mask-1))||(mask&~info.mask)||![250,500,1000].includes(pumpMs)||!Number.isInteger(holdMs)||holdMs<25||holdMs>100||holdMs%5||!Number.isInteger(releaseMs)||releaseMs<=200||releaseMs>2700||repeats!==1))throw Error('Install v11, choose one enabled channel, and save its sensor maximum before a PWM test.');
 const zoneMask=Number.isInteger(mask)&&mask>=1&&mask<=63&&!(mask&~info.mask)&&mask.toString(2).replaceAll('0','').length<=2;
 if(op===11&&(!info.routineSpeed||!zoneMask||!Number.isInteger(aux)||aux<0||aux>2||!Number.isInteger(pumpMs)||pumpMs<25||pumpMs>100||pumpMs%5||holdMs!==0||releaseMs!==0||repeats!==0))throw Error('Install firmware v12 and choose a pump speed from 25–100% in steps of 5%.');
 if(op===5&&(!zoneMask||!Number.isInteger(aux)||aux<0||aux>2||!Number.isInteger(pumpMs)||(pumpMs===0?!info.targetOnlyRoutines:pumpMs<50)||pumpMs>(info.maxRoutinePump??2000)||!Number.isInteger(holdMs)||holdMs<0||holdMs>10000||!Number.isInteger(releaseMs)||releaseMs<500||releaseMs>10000||!Number.isInteger(repeats)||repeats>60000||repeats<100+(pumpMs||50)+holdMs+releaseMs))throw Error('Invalid zone mapping or timing. Fit a complete cycle in each zone duration.');
 if(op===7&&((info.sensorRangeTargets&&((pumpMs>0&&pumpMs<=200)||(holdMs>0&&holdMs<=200)))||!zoneMask||!Number.isInteger(aux)||aux<0||aux>2||!Number.isInteger(pumpMs)||pumpMs<0||pumpMs>(info.sensorRangeTargets?2700:4094)||!Number.isInteger(holdMs)||holdMs<0||holdMs>(info.sensorRangeTargets?2700:4094)||releaseMs!==0||repeats!==0||(!(mask&(mask-1))?holdMs!==0:Boolean(pumpMs)!==Boolean(holdMs))))throw Error('Invalid sensor targets.');
 if(op===6&&(![1,2].includes(aux)||!Number.isInteger(mask)||mask<1||mask>3||(aux===1&&mask!==1)||(aux===2&&mask<2)||!Number.isInteger(pumpMs)||pumpMs<0||pumpMs>60000||holdMs!==0||releaseMs!==0||!Number.isInteger(repeats)||repeats<0||repeats>999))throw Error('Invalid routine settings.');
 if((op===3||op===4)&&(!info.testControls||!Number.isInteger(mask)||mask<1||mask>63||(mask&(mask-1))||(mask&~info.mask)))throw Error('Install v7 and select one enabled channel for testing.');
 if(op===3&&(![0,1,2].includes(pumpMs)||![0,1,2].includes(holdMs)||releaseMs!==0||repeats!==0))throw Error('Invalid test switch request.');
 if(op===4&&(releaseMs!==0||repeats!==1))throw Error('A channel test runs exactly one cycle.');
 if((op===1||op===4)&&(!Number.isInteger(mask)||mask<1||mask>63||(mask&~info.mask)||!Number.isInteger(pumpMs)||pumpMs<info.minPump||pumpMs>info.maxPump||!Number.isInteger(holdMs)||holdMs<0||holdMs>info.maxHold||!Number.isInteger(releaseMs)||releaseMs<0||releaseMs>info.maxRelease||!Number.isInteger(repeats)||repeats<0||repeats>999))throw Error('Use wired channels, pump 0.05–2 s, hold/release 0–10 s, and 1–999 cycles or Until Stop.');
 if(op===2){mask=0;pumpMs=0;holdMs=0;releaseMs=0;repeats=0;}
 const v=new DataView(new ArrayBuffer(18));v.setUint8(0,2);v.setUint8(1,op);v.setUint8(2,mask);v.setUint8(3,aux);v.setUint16(4,seq,true);v.setUint16(6,pumpMs,true);v.setUint16(8,holdMs,true);v.setUint32(10,session,true);v.setUint16(14,releaseMs,true);v.setUint16(16,repeats,true);return v.buffer;
}
