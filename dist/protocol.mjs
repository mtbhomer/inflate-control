export const UUID = Object.freeze({service:'8d5a0001-4c7b-4f45-9d68-8e0c2c970001',command:'8d5a0002-4c7b-4f45-9d68-8e0c2c970001',status:'8d5a0003-4c7b-4f45-9d68-8e0c2c970001',info:'8d5a0004-4c7b-4f45-9d68-8e0c2c970001'});
export const PHASES=['Ready','Selecting valve','Pumping','Holding'];
export const REPLIES=['','Cycle started','Another cycle is running','Wait for the vent interval','Invalid timing or channel','Channel is not wired','Release requested','Command expired; nothing started','Duplicate command ignored'];
const view=v=>v instanceof DataView?v:new DataView(v.buffer??v,v.byteOffset??0,v.byteLength);
function frame(v,n){v=view(v);if(v.byteLength!==n||v.getUint8(0)!==1)throw Error('This firmware uses an unsupported Bluetooth protocol.');return v;}
export function decodeInfo(input){
 const v=frame(input,20), info={mask:v.getUint8(1),sensorChannel:v.getUint8(2),firmware:v.getUint8(3),minPump:v.getUint16(4,true),maxPump:v.getUint16(6,true),maxHold:v.getUint16(8,true),lead:v.getUint16(10,true),vent:v.getUint16(12,true),session:v.getUint32(14,true),flags:v.getUint8(18)};
 if(!info.session||info.mask>63||info.sensorChannel!==2||info.minPump<1||info.minPump>info.maxPump||info.maxPump>2000||info.maxHold>10000||info.lead!==100||info.vent!==2000||info.flags!==3)throw Error('Firmware settings do not match this control page.');
 return info;
}
export function decodeStatus(input){
 const v=frame(input,20), s={phase:v.getUint8(1),channel:v.getUint8(2),flags:v.getUint8(3)&15,reply:v.getUint8(3)>>4,seq:v.getUint16(4,true),session:v.getUint32(6,true),raw:v.getInt32(10,true),age:v.getUint16(14,true),remaining:v.getUint16(16,true),ventRemaining:v.getUint16(18,true)};
 if(s.phase>3||s.reply>8||(s.channel!==255&&s.channel>5)||((s.phase===0)!==(s.channel===255))||s.raw<-8388608||s.raw>8388607)throw Error('Invalid hub status received.');
 s.fresh=Boolean(s.flags&2)&&Boolean(s.flags&1)&&!(s.flags&4)&&s.age<500;
 return s;
}
export function encodeCommand({op,channel=255,pumpMs=0,holdMs=0,seq,session},info){
 if(!Number.isInteger(seq)||seq<1||seq>65535||!Number.isInteger(session)||session<=0||session>0xffffffff)throw Error('Reconnect to renew the control session.');
 if(op!==1&&op!==2)throw Error('Unknown command.');
 if(op===1&&(!Number.isInteger(channel)||channel<0||channel>5||!(info.mask&(1<<channel))||!Number.isInteger(pumpMs)||pumpMs<info.minPump||pumpMs>info.maxPump||!Number.isInteger(holdMs)||holdMs<0||holdMs>info.maxHold))throw Error('Use pump 0.05–2 s and hold 0–10 s on a wired channel.');
 if(op===2){channel=255;pumpMs=0;holdMs=0;}
 const v=new DataView(new ArrayBuffer(14));v.setUint8(0,1);v.setUint8(1,op);v.setUint8(2,channel);v.setUint16(4,seq,true);v.setUint16(6,pumpMs,true);v.setUint16(8,holdMs,true);v.setUint32(10,session,true);return v.buffer;
}
