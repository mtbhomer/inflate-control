export const UUID = Object.freeze({service:'8d5a0001-4c7b-4f45-9d68-8e0c2c970001',command:'8d5a0002-4c7b-4f45-9d68-8e0c2c970001',status:'8d5a0003-4c7b-4f45-9d68-8e0c2c970001',info:'8d5a0004-4c7b-4f45-9d68-8e0c2c970001'});
export const PHASES=['Ready','Selecting valve','Pumping','Holding','Released','Manual test'];
export const REPLIES=['','Started','A selected channel is already running','','Invalid timing or channel','Channel is not wired','Release requested','Command expired; nothing started'];
const view=v=>v instanceof DataView?v:new DataView(v.buffer??v,v.byteOffset??0,v.byteLength);
function frame(v,n){v=view(v);if(v.byteLength!==n||v.getUint8(0)!==2)throw Error('Please install the v7 MeditationVest firmware from Connection & setup, then reconnect.');return v;}
export function decodeInfo(input){
 const v=frame(input,20), info={mask:v.getUint8(1),sensorChannel:v.getUint8(2),firmware:v.getUint8(3),minPump:v.getUint16(4,true),maxPump:v.getUint16(6,true),maxHold:v.getUint16(8,true),lead:v.getUint16(10,true),maxRelease:v.getUint16(12,true),session:v.getUint32(14,true),flags:v.getUint8(18)};
 const legacy=info.firmware===2&&info.flags===15&&info.sensorChannel===2&&v.getUint8(19)===0;
 const mixed=info.firmware===3&&info.flags===31&&info.sensorChannel===2&&v.getUint8(19)===1;
 const dual=info.firmware===4&&info.flags===31&&info.sensorChannel===255&&v.getUint8(19)===6;
 const six=[5,6].includes(info.firmware)&&info.flags===31&&info.sensorChannel===255&&v.getUint8(19)===63&&info.mask===63;
 const bench=info.firmware===7&&info.flags===63&&info.sensorChannel===255&&v.getUint8(19)===63&&info.mask===63;
 info.testControls=bench;
 if(!info.session||!info.mask||info.mask>63||(!legacy&&!mixed&&!dual&&!six&&!bench)||info.minPump<1||info.minPump>info.maxPump||info.maxPump>2000||info.maxHold>10000||info.lead!==100||info.maxRelease>10000)throw Error('Firmware settings do not match this control page.');
 info.analogChannels=six||bench?[0,1,2,3,4,5]:dual?[1,2]:mixed?[1]:[];
 info.hxChannel=dual||six||bench?null:2;
 return info;
}
export function decodeStatus(input){
 const v=frame(input,20),kind=v.getUint8(1),session=v.getUint32(6,true);
 if(kind===0x20){
  const s={kind:'analog',session,channel:v.getUint8(2),flags:v.getUint8(3),raw:v.getUint16(4,true),millivolts:v.getUint16(10,true),age:v.getUint16(12,true)};
  if(s.channel>5||s.flags>15||s.raw>4095||s.millivolts>5000||Array.from({length:6},(_,i)=>v.getUint8(14+i)).some(Boolean)||((s.flags&2)&&!(s.flags&1)))throw Error('Invalid analog sensor status received.');
  s.fresh=Boolean(s.flags&1)&&Boolean(s.flags&2)&&s.age<500;
  return s;
 }
 if((kind&0xf0)===0x10){
  const s={kind:'detail',session,phase:kind&15,channel:v.getUint8(2),group:v.getUint8(3),cycle:v.getUint16(4,true),pump:v.getUint16(10,true),hold:v.getUint16(12,true),release:v.getUint16(14,true),repeats:v.getUint16(16,true),remaining:v.getUint16(18,true)};
  if(s.phase>5||s.channel>5||s.group>63||s.pump<50||s.pump>2000||s.hold>10000||s.release>10000||s.remaining>10000||(s.phase&&(!(s.group&(1<<s.channel))||!s.cycle)))throw Error('Invalid channel status received.');
  return s;
 }
 if(kind!==0)throw Error('Invalid hub status received.');
 const packed=v.getUint8(16)|(v.getUint8(17)<<8)|(v.getUint8(18)<<16);
 const s={kind:'summary',session,flags:v.getUint8(2)&15,reply:v.getUint8(2)>>4,active:v.getUint8(3),seq:v.getUint16(4,true),raw:v.getInt32(10,true),age:v.getUint16(14,true),phases:Array.from({length:6},(_,ch)=>(packed>>(3*ch))&7)};
 if(s.reply>7||s.reply===3||s.active>63||s.phases.some((p,ch)=>p>5||Boolean(p)!==Boolean(s.active&(1<<ch)))||packed>>18||v.getUint8(19)||s.raw<-8388608||s.raw>8388607)throw Error('Invalid hub status received.');
 s.outputs=Array.from({length:6},(_,ch)=>({pump:Boolean(s.raw&(1<<(2*ch))),valve:Boolean(s.raw&(2<<(2*ch)))}));
 s.fresh=Boolean(s.flags&2)&&Boolean(s.flags&1)&&!(s.flags&4)&&s.age<500;
 return s;
}
export function encodeCommand({op,mask=0,pumpMs=0,holdMs=0,releaseMs=0,repeats=1,seq,session},info){
 if(!Number.isInteger(seq)||seq<1||seq>65535||!Number.isInteger(session)||session<=0||session>0xffffffff)throw Error('Reconnect to renew the control session.');
 if(![1,2,3,4].includes(op))throw Error('Unknown command.');
 if((op===3||op===4)&&(!info.testControls||!Number.isInteger(mask)||mask<1||mask>63||(mask&(mask-1))||(mask&~info.mask)))throw Error('Install v7 and select one enabled channel for testing.');
 if(op===3&&(![0,1,2].includes(pumpMs)||![0,1,2].includes(holdMs)||releaseMs!==0||repeats!==0))throw Error('Invalid test switch request.');
 if(op===4&&(releaseMs!==0||repeats!==1))throw Error('A channel test runs exactly one cycle.');
 if((op===1||op===4)&&(!Number.isInteger(mask)||mask<1||mask>63||(mask&~info.mask)||!Number.isInteger(pumpMs)||pumpMs<info.minPump||pumpMs>info.maxPump||!Number.isInteger(holdMs)||holdMs<0||holdMs>info.maxHold||!Number.isInteger(releaseMs)||releaseMs<0||releaseMs>info.maxRelease||!Number.isInteger(repeats)||repeats<0||repeats>999))throw Error('Use wired channels, pump 0.05–2 s, hold/release 0–10 s, and 1–999 cycles or Until Stop.');
 if(op===2){mask=0;pumpMs=0;holdMs=0;releaseMs=0;repeats=0;}
 const v=new DataView(new ArrayBuffer(18));v.setUint8(0,2);v.setUint8(1,op);v.setUint8(2,mask);v.setUint16(4,seq,true);v.setUint16(6,pumpMs,true);v.setUint16(8,holdMs,true);v.setUint32(10,session,true);v.setUint16(14,releaseMs,true);v.setUint16(16,repeats,true);return v.buffer;
}
