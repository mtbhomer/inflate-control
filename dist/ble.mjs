import {UUID,decodeInfo,decodeStatus,encodeCommand} from './protocol.mjs?v=3';
export class HubBLE extends EventTarget{
 constructor(){super();this.device=null;this.info=null;this.seq=0;this.generation=0;this.writeTail=Promise.resolve();this.waiters=new Map();this.onNotify=e=>this.status(e.target.value);this.onDisconnect=()=>this.clear('Bluetooth disconnected. Fixed-count patterns finish on the hub. Until Stop ends after the current cycle.');}
 emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
 async connect(){
  if(!globalThis.isSecureContext)throw Error('Open the hosted HTTPS link in Bluefy.');
  if(!navigator.bluetooth)throw Error('On iPhone, open this page in Bluefy to use Bluetooth.');
  // requestDevice is called directly from the button gesture, before any await.
  const request=navigator.bluetooth.requestDevice({filters:[{services:[UUID.service]}]});
  const generation=++this.generation;
  const device=await request;
  if(generation!==this.generation)return;
  this.device=device;device.addEventListener('gattserverdisconnected',this.onDisconnect);
  let timeout;
  const checked=async promise=>{const result=await promise;if(generation!==this.generation)throw Error('Connection cancelled.');return result;};
  try{
   const handshake=async()=>{
    const server=await checked(device.gatt.connect());const service=await checked(server.getPrimaryService(UUID.service));
    const infoChar=await checked(service.getCharacteristic(UUID.info));this.info=decodeInfo(await checked(infoChar.readValue()));
    this.commandChar=await checked(service.getCharacteristic(UUID.command));this.statusChar=await checked(service.getCharacteristic(UUID.status));
    this.seq=0;this.statusChar.addEventListener('characteristicvaluechanged',this.onNotify);
    await checked(this.statusChar.startNotifications());
    const snapshot=await checked(this.statusChar.readValue());
    this.emit('ready',{info:this.info,name:device.name||'MeditationVest'});this.status(snapshot);
   };
   await Promise.race([handshake(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Hub connection timed out. Reconnect and try again.')),15000);})]);
  }catch(error){if(generation===this.generation)this.disconnect();throw error;}finally{clearTimeout(timeout);}
 }

 status(value){try{
  const s=decodeStatus(value);if(!this.info||s.session!==this.info.session)return;
  if(s.kind==='analog'){if(this.info.analogChannel!==s.channel)throw Error('Unexpected analog sensor; reconnect.');this.emit('analog',s);return;}
  if(s.kind==='detail'){if(!(this.info.mask&(1<<s.channel))||(s.group&~this.info.mask))throw Error('Channel configuration changed; reconnect.');this.emit('detail',s);return;}
  if(s.active&~this.info.mask)throw Error('Channel configuration changed; reconnect.');
  this.emit('status',s);
  const waiter=this.waiters.get(s.seq);if(waiter){clearTimeout(waiter.timer);this.waiters.delete(s.seq);waiter.resolve(s);}
  if(s.reply===6)for(const [seq,w] of this.waiters)if(seq<s.seq){clearTimeout(w.timer);this.waiters.delete(seq);w.resolve({...s,superseded:true});}
 }catch(e){this.emit('error',e.message);this.disconnect();}}
 async command(op,mask=0,pumpMs=0,holdMs=0,releaseMs=0,repeats=1){
  if(!this.device?.gatt.connected||!this.commandChar||!this.info)throw Error('Connect to the hub first.');
  const generation=this.generation,seq=++this.seq;
  const bytes=encodeCommand({op,mask,pumpMs,holdMs,releaseMs,repeats,seq,session:this.info.session},this.info);
  // Stop invalidates any START that has not entered a GATT write yet.
  if(op===2)this.cancelStartsThrough=seq;
  let resolve,reject,timer,expired=false;
  const outcome=new Promise((a,b)=>{resolve=a;reject=b;});
  outcome.catch(()=>{}); // It may reject while a slow GATT write is still settling.
  timer=setTimeout(()=>{expired=true;this.waiters.delete(seq);reject(Error(op===2?'Stop not confirmed. Use the battery switch if needed.':'No confirmation. Check the hub; the pattern may have started.'));},2500);
  const write=this.writeTail.catch(()=>{}).then(async()=>{
   if(expired)throw Error('Command expired before it could be sent.');
   if(generation!==this.generation||!this.device?.gatt.connected)throw Error('Connection ended; command was not sent.');
   if(op===1&&seq<(this.cancelStartsThrough||0))throw Error('Start cancelled by Stop.');
   this.waiters.set(seq,{resolve,reject,timer});
   const c=this.commandChar;
   if(c.writeValueWithResponse)await c.writeValueWithResponse(bytes);else await c.writeValue(bytes);
  });
  this.writeTail=write.catch(()=>{});
  write.catch(error=>{clearTimeout(timer);this.waiters.delete(seq);reject(error);});
  return outcome;

 }
 clear(message){
  ++this.generation;
  if(this.statusChar)this.statusChar.removeEventListener('characteristicvaluechanged',this.onNotify);
  if(this.device)this.device.removeEventListener('gattserverdisconnected',this.onDisconnect);
  for(const w of this.waiters.values()){clearTimeout(w.timer);w.reject(Error('Bluetooth disconnected; command outcome is unknown.'));}
  this.waiters.clear();this.commandChar=null;this.statusChar=null;this.info=null;this.seq=0;this.cancelStartsThrough=0;this.writeTail=Promise.resolve();this.emit('disconnected',message);
 }
 disconnect(){const device=this.device;this.clear('Disconnected. Fixed-count patterns finish on the hub. Until Stop ends after the current cycle.');if(device?.gatt.connected)device.gatt.disconnect();this.device=null;}
}
