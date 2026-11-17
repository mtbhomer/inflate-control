import test from 'node:test';import assert from 'node:assert/strict';
import {decodeInfo,decodeStatus,encodeCommand} from '../dist/protocol.mjs';
import {HubBLE} from '../dist/ble.mjs';
const info={mask:6,minPump:50,maxPump:2000,maxHold:10000,maxRelease:10000,session:0x12345678};
function status(seq=1,session=info.session,reply=1){let v=new DataView(new ArrayBuffer(20));v.setUint8(0,2);v.setUint8(1,0);v.setUint8(2,(reply<<4)|3);v.setUint8(3,0);v.setUint16(4,seq,true);v.setUint32(6,session,true);v.setInt32(10,-123456,true);v.setUint16(14,20,true);return v;}
test('command layout matches firmware golden bytes',()=>{const b=encodeCommand({op:1,mask:6,pumpMs:1000,holdMs:1000,seq:1,session:info.session},info);assert.deepEqual([...new Uint8Array(b)],[2,1,6,0,1,0,232,3,232,3,120,86,52,18,0,0,1,0]);});
test('duration and channel guards reject bad actions',()=>{for(const x of [{mask:8},{pumpMs:2001},{holdMs:10001},{pumpMs:NaN},{seq:0},{session:0},{holdMs:-1},{mask:0},{releaseMs:10001},{repeats:1000},{repeats:-1},{repeats:1.5}])assert.throws(()=>encodeCommand({op:1,mask:6,pumpMs:1000,holdMs:1000,seq:1,session:info.session,...x},info));});
test('signed sensor values, framing, stale status and session are decoded',()=>{let v=status();let s=decodeStatus(v);assert.equal(s.raw,-123456);assert.equal(s.session,info.session);assert.equal(s.fresh,true);v.setUint16(14,500,true);assert.equal(decodeStatus(v).fresh,false);v.setUint8(1,9);assert.throws(()=>decodeStatus(v));assert.throws(()=>decodeStatus(new Uint8Array(19)));});
test('capabilities constrain timing and require nonzero session',()=>{let v=new DataView(new ArrayBuffer(20));v.setUint8(0,2);v.setUint8(1,6);v.setUint8(2,2);v.setUint8(3,2);for(const [p,n]of [[4,50],[6,2000],[8,10000],[10,100],[12,10000]])v.setUint16(p,n,true);v.setUint32(14,info.session,true);v.setUint8(18,15);assert.equal(decodeInfo(v).mask,6);v.setUint16(6,2001,true);assert.throws(()=>decodeInfo(v));});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fake(){let h=new HubBLE();h.info=info;h.device={gatt:{connected:true}};return h;}
test('GATT writes serialize while Stop does not wait for a start acknowledgement',async()=>{const h=fake();let running=0,max=0,ops=[];h.commandChar={async writeValueWithResponse(bytes){running++;max=Math.max(max,running);let v=new DataView(bytes);ops.push(v.getUint8(1));await delay(20);running--;h.status(status(v.getUint16(4,true),info.session,v.getUint8(1)===2?6:1));}};const a=h.command(1,2,1000,1000);await delay(5);const b=h.command(2);assert.equal((await a).reply,1);assert.equal((await b).reply,6);assert.deepEqual(ops,[1,2]);assert.equal(max,1);});
test('Stop cancels an unsent Start and fallback writeValue is supported',async()=>{const h=fake();let ops=[];h.commandChar={async writeValue(bytes){const v=new DataView(bytes);ops.push(v.getUint8(1));h.status(status(v.getUint16(4,true),info.session,6));}};const start=h.command(1,2,1000,1000);const stopped=h.command(2);await assert.rejects(start,/cancelled/);assert.equal((await stopped).reply,6);assert.deepEqual(ops,[2]);});
test('old-session status cannot acknowledge a new command',async()=>{const h=fake();let settled=false;h.commandChar={async writeValueWithResponse(bytes){const seq=new DataView(bytes).getUint16(4,true);h.status(status(seq,info.session+1));await delay(15);assert.equal(settled,false);h.status(status(seq));}};await h.command(1,2,1000,1000).then(()=>settled=true);assert.equal(settled,true);});
test('disconnect rejects a pending command and never resends it',async()=>{const h=fake();h.device.removeEventListener=()=>{};let writes=0;h.commandChar={async writeValueWithResponse(){writes++;}};const p=h.command(1,2,1000,1000);await delay(2);h.clear('Disconnected');await assert.rejects(p,/unknown/);assert.equal(writes,1);});
test('a stalled GATT write cannot leave Stop pending forever or replay it later',async()=>{const h=fake();let finish,writes=0;h.commandChar={async writeValueWithResponse(){writes++;await new Promise(r=>finish=r);}};const a=h.command(1,2,1000,1000);await delay(5);const b=h.command(2);await Promise.all([assert.rejects(a,/No confirmation/),assert.rejects(b,/Stop not confirmed/)]);finish();await delay(5);assert.equal(writes,1);});
test('Stop acknowledgement settles an earlier start even if its acknowledgement was missed',async()=>{const h=fake();h.commandChar={async writeValueWithResponse(bytes){const v=new DataView(bytes);if(v.getUint8(1)===2)h.status(status(v.getUint16(4,true),info.session,6));}};const a=h.command(1,2,1000,1000);await delay(2);const b=h.command(2);assert.equal((await b).reply,6);assert.equal((await a).superseded,true);assert.equal(h.waiters.size,0);});

import {sensorRange,validZero,ADC_MIN,ADC_MAX} from '../dist/sensor.mjs';
test('sensor percent anchors vented zero and digital ceiling without implying pressure',()=>{
 assert.equal(sensorRange(1764600,1764600).percent,0);
 assert.equal(sensorRange(ADC_MAX,1764600).percent,100);
 assert.equal(sensorRange(1764600+(ADC_MAX-1764600)/2,1764600),null); // ADC counts are integers.
 assert.ok(Math.abs(sensorRange(5076604,1764600).percent-50)<.001);
 assert.equal(sensorRange(1700000,1764600).percent,0);
 assert.equal(sensorRange(8000000,1764600).clipped,false);
 assert.equal(sensorRange(8388606,1764600).near,true);
 assert.equal(sensorRange(ADC_MAX,1764600).clipped,true);
 assert.equal(sensorRange(ADC_MIN,1764600).clipped,true);
 assert.equal(sensorRange(2000000,null).percent,null);
 assert.equal(validZero(ADC_MAX),false);assert.equal(validZero(ADC_MIN),false);assert.equal(validZero(null),false);
});
test('linked patterns and continuous mode have one atomic command',()=>{
 const b=encodeCommand({op:1,mask:6,pumpMs:2000,holdMs:10000,releaseMs:500,repeats:0,seq:1,session:info.session},info),v=new DataView(b);
 assert.equal(v.byteLength,18);assert.equal(v.getUint8(2),6);assert.equal(v.getUint16(14,true),500);assert.equal(v.getUint16(16,true),0);
});
test('summary decodes six simultaneous phases and rejects inconsistent masks',()=>{
 const v=status();v.setUint8(3,6);v.setUint8(16,144);assert.deepEqual(decodeStatus(v).phases,[0,2,2,0,0,0]);v.setUint8(3,2);assert.throws(()=>decodeStatus(v));
});
test('channel detail cannot acknowledge a command; old firmware requests an upgrade',()=>{
 const v=new DataView(new ArrayBuffer(20));v.setUint8(0,2);v.setUint8(1,0x12);v.setUint8(2,2);v.setUint8(3,6);v.setUint16(4,3,true);v.setUint32(6,info.session,true);v.setUint16(10,1000,true);v.setUint16(12,1000,true);v.setUint16(14,500,true);v.setUint16(16,5,true);v.setUint16(18,400,true);
 const h=fake();let emitted=false,acked=false;h.addEventListener('detail',()=>emitted=true);h.waiters.set(3,{resolve:()=>acked=true});h.status(v);assert.equal(emitted,true);assert.equal(acked,false);assert.equal(decodeStatus(v).cycle,3);
 v.setUint8(0,1);assert.throws(()=>decodeInfo(v),/v10 MeditationVest/);
});

import {analogReading} from '../dist/sensor.mjs';
const analogPacket=()=>new DataView(Uint8Array.from([2,32,1,3,146,1,120,86,52,18,202,0,20,0,0,0,0,0,0,0]).buffer);
test('v2 remains usable and v3 advertises CH1 analog data explicitly',()=>{
 const v=new DataView(new ArrayBuffer(20));v.setUint8(0,2);v.setUint8(1,6);v.setUint8(2,2);v.setUint8(3,2);
 for(const [p,n]of [[4,50],[6,2000],[8,10000],[10,100],[12,10000]])v.setUint16(p,n,true);
 v.setUint32(14,info.session,true);v.setUint8(18,15);assert.equal(decodeInfo(v).analogChannels.length,0);
 v.setUint8(3,3);v.setUint8(18,31);v.setUint8(19,1);assert.equal(decodeInfo(v).analogChannels[0],1);
 v.setUint8(19,2);assert.throws(()=>decodeInfo(v));
});
test('analog golden packet decodes volts and ADC limits without pressure scaling',()=>{
 const s=decodeStatus(analogPacket());assert.equal(s.channel,1);assert.equal(s.raw,402);assert.equal(s.millivolts,202);assert.equal(s.session,info.session);
 assert.equal(analogReading(s).volts,.202);assert.equal(analogReading(s,479).volts,.202);assert.equal(analogReading(s,480),null);
 assert.equal(analogReading({...s,fresh:false}),null);
 assert.equal(analogReading({...s,raw:4095,flags:11}).percent,100);
 assert.equal(analogReading({...s,raw:1099,flags:11}).high,true);
 assert.equal(analogReading({...s,raw:0,flags:7}).low,true);
});
test('analog packets reject malformed data and cannot acknowledge or refresh control status',()=>{
 for(const [offset,value]of [[2,6],[3,16],[14,1]]){const v=analogPacket();v.setUint8(offset,value);assert.throws(()=>decodeStatus(v));}
 const malformed=analogPacket();malformed.setUint16(4,4096,true);assert.throws(()=>decodeStatus(malformed));
 const h=fake();h.info={...info,analogChannels:[1]};let analog=0,summaries=0,acked=false;
 h.addEventListener('analog',()=>analog++);h.addEventListener('status',()=>summaries++);h.waiters.set(402,{resolve:()=>acked=true});
 h.status(analogPacket());assert.equal(analog,1);assert.equal(summaries,0);assert.equal(acked,false);
 const old=analogPacket();old.setUint32(6,info.session+1,true);h.status(old);assert.equal(analog,1);
});

test('v4 advertises two analog channels and no HX710; legacy capabilities stay distinct',()=>{
 const v=new DataView(new ArrayBuffer(20));v.setUint8(0,2);v.setUint8(1,6);v.setUint8(2,255);v.setUint8(3,4);
 for(const [p,n]of [[4,50],[6,2000],[8,10000],[10,100],[12,10000]])v.setUint16(p,n,true);
 v.setUint32(14,info.session,true);v.setUint8(18,31);v.setUint8(19,6);
 const cap=decodeInfo(v);assert.deepEqual(cap.analogChannels,[1,2]);assert.equal(cap.hxChannel,null);
 v.setUint8(2,2);assert.throws(()=>decodeInfo(v));v.setUint8(2,255);v.setUint8(19,2);assert.throws(()=>decodeInfo(v));
});
test('two analog streams keep channel identity and independent freshness',()=>{
 const h=fake();h.info={...info,analogChannels:[1,2]};const seen=new Map();h.addEventListener('analog',e=>seen.set(e.detail.channel,e.detail));
 h.status(analogPacket());const second=analogPacket();second.setUint8(2,2);second.setUint16(4,2000,true);second.setUint16(10,1500,true);h.status(second);
 assert.equal(seen.size,2);assert.equal(analogReading(seen.get(1)).volts,.202);assert.equal(analogReading(seen.get(2)).volts,1.5);
 const stale=analogPacket();stale.setUint16(12,500,true);h.status(stale);
 assert.equal(analogReading(seen.get(1)),null);assert.equal(analogReading(seen.get(2)).volts,1.5);
});

test('v5 exposes six independent analog inputs and rejects mismatched masks',()=>{
 const v=new DataView(new ArrayBuffer(20));v.setUint8(0,2);v.setUint8(1,63);v.setUint8(2,255);v.setUint8(3,5);
 for(const [p,n]of [[4,50],[6,2000],[8,10000],[10,100],[12,10000]])v.setUint16(p,n,true);
 v.setUint32(14,info.session,true);v.setUint8(18,31);v.setUint8(19,63);
 const cap=decodeInfo(v);assert.deepEqual(cap.analogChannels,[0,1,2,3,4,5]);assert.equal(cap.hxChannel,null);
 const h=fake();h.info=cap;const seen=new Map();h.addEventListener('analog',e=>seen.set(e.detail.channel,e.detail));
 for(let ch=0;ch<6;ch++){const b=analogPacket();b.setUint8(2,ch);b.setUint16(10,200+ch*100,true);h.status(b);}
 assert.equal(seen.size,6);for(let ch=0;ch<6;ch++)assert.equal(seen.get(ch).millivolts,200+ch*100);
 v.setUint8(19,6);assert.throws(()=>decodeInfo(v));
});

test('v6 accepts the CH1 GPIO revision while retaining six analog capabilities',()=>{
 const v=new DataView(new ArrayBuffer(20));v.setUint8(0,2);v.setUint8(1,63);v.setUint8(2,255);v.setUint8(3,6);
 for(const [p,n]of [[4,50],[6,2000],[8,10000],[10,100],[12,10000]])v.setUint16(p,n,true);
 v.setUint32(14,info.session,true);v.setUint8(18,31);v.setUint8(19,63);
 assert.equal(decodeInfo(v).firmware,6);assert.deepEqual(decodeInfo(v).analogChannels,[0,1,2,3,4,5]);
 v.setUint8(3,7);assert.throws(()=>decodeInfo(v));
});

const benchInfo={...info,mask:63,firmware:7,testControls:true,analogChannels:[0,1,2,3,4,5]};
test('v7 advertises test controls separately from earlier firmware',()=>{
 const v=new DataView(new ArrayBuffer(20));v.setUint8(0,2);v.setUint8(1,63);v.setUint8(2,255);v.setUint8(3,7);
 for(const [p,n]of [[4,50],[6,2000],[8,10000],[10,100],[12,10000]])v.setUint16(p,n,true);
 v.setUint32(14,info.session,true);v.setUint8(18,63);v.setUint8(19,63);assert.equal(decodeInfo(v).testControls,true);
 v.setUint8(3,6);v.setUint8(18,31);assert.equal(decodeInfo(v).testControls,false);
});
test('test switches encode only the selected output and require one channel plus v7',()=>{
 const args={op:3,mask:2,pumpMs:1,holdMs:2,releaseMs:0,repeats:0,seq:1,session:info.session};
 const b=new Uint8Array(encodeCommand(args,benchInfo));assert.deepEqual([...b],[2,3,2,0,1,0,1,0,2,0,120,86,52,18,0,0,0,0]);
 assert.throws(()=>encodeCommand(args,info));for(const mask of [0,3,64])assert.throws(()=>encodeCommand({...args,mask},benchInfo));
 assert.throws(()=>encodeCommand({...args,pumpMs:3},benchInfo));
 const cycle={...args,op:4,pumpMs:1000,holdMs:1000,repeats:1};assert.equal(new DataView(encodeCommand(cycle,benchInfo)).getUint8(1),4);
 assert.throws(()=>encodeCommand({...cycle,repeats:0},benchInfo));
});
test('manual output summary reports each commanded output without confusing analog voltage',()=>{
 const v=status();v.setUint8(2,16);v.setUint8(3,2);v.setUint8(16,5<<3);v.setInt32(10,4,true);
 const s=decodeStatus(v);assert.equal(s.phases[1],5);assert.deepEqual(s.outputs[1],{pump:true,valve:false});assert.deepEqual(s.outputs[0],{pump:false,valve:false});
});
test('Stop cancels a queued test switch as well as queued cycles',async()=>{
 for(const op of [3,4]){const h=fake();h.info=benchInfo;let writes=0;h.commandChar={async writeValueWithResponse(bytes){writes++;const v=new DataView(bytes);const s=status(v.getUint16(4,true),info.session,6);s.setUint8(2,96);s.setInt32(10,0,true);h.status(s);}};
 const start=h.command(op,2,op===3?1:1000,op===3?2:1000,0,op===3?0:1);const stop=h.command(2);
 await assert.rejects(start,/cancelled/);assert.equal((await stop).reply,6);assert.equal(writes,1);}
});
