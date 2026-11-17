import {UUID,decodeInfo,decodeStatus,encodeCommand} from './protocol.mjs?v=14';
export class HubBLE extends EventTarget{
 constructor(){super();this.device=null;this.info=null;this.seq=0;this.generation=0;this.writeTail=Promise.resolve();this.waiters=new Map();this.onNotify=e=>this.status(e.target.value);this.onDisconnect=()=>this.clear('Bluetooth disconnected. Routines and channel tests switch off. Fixed-count debug patterns finish; Until Stop ends after the current cycle.');}
 emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
 async connect(knownDevice=null){
  if(!globalThis.isSecureContext)throw Error('Open the hosted HTTPS link in Bluefy.');
  if(!navigator.bluetooth)throw Error('On iPhone, open this page in Bluefy to use Bluetooth.');
  // requestDevice is called directly from the button gesture, before any await.
  const request=knownDevice?Promise.resolve(knownDevice):navigator.bluetooth.requestDevice({filters:[{services:[UUID.service]}]});
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
    this.emit('ready',{info:this.info,name:device.name||'MeditationVest',deviceId:device.id});this.status(snapshot);
   };
   await Promise.race([handshake(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Hub connection timed out. Reconnect and try again.')),15000);})]);
  }catch(error){if(generation===this.generation)this.disconnect();throw error;}finally{clearTimeout(timeout);}
 }

 status(value){try{
  const s=decodeStatus(value,this.info);if(!this.info||s.session!==this.info.session)return;
  if(s.kind==='pwm'){if(!this.info.pwmTests)throw Error('Unexpected PWM report; reconnect.');if(this.info.mask&(1<<s.channel))this.emit('pwm',s);return;}
  if(s.kind==='routine'){if(!this.info.routines)throw Error('Unexpected routine status; reconnect.');this.emit('routine',s);return;}
  if(s.kind==='analog'){if(this.info.channelSelection&&!(this.info.mask&(1<<s.channel)))return;if(!this.info.analogChannels?.includes(s.channel))throw Error('Unexpected analog sensor; reconnect.');this.emit('analog',s);return;}
  if(s.kind==='detail'){if(this.info.channelSelection&&!(this.info.mask&(1<<s.channel)))return;if(s.phase===5&&!this.info.testControls)throw Error('Unexpected test status; reconnect.');if(!(this.info.mask&(1<<s.channel))||(s.group&~this.info.mask))throw Error('Channel configuration changed; reconnect.');this.emit('detail',s);return;}
  if(this.info.channelSelection){
   if(s.enabledMask===null||(s.enabledMask&~this.info.availableMask)||(s.active&~s.enabledMask))throw Error('Invalid channel configuration; reconnect.');
  }else if(s.reply===8)throw Error('Unexpected settings response; reconnect.');
  if(this.info.testControls&&((this.info.pwmTests?s.flags>2:this.info.calibrationPulses?s.flags>1:s.flags!==0)||s.raw<0||s.raw>4095))throw Error('Invalid output state; reconnect.');
  if(s.reply===9&&!this.info.pwmTests)throw Error('Unexpected output error; reconnect.');
  if(this.info.pwmTests&&s.pwmTest&&(!s.active||(s.active&(s.active-1))||s.routineKind||s.phases.some(p=>p>3)))throw Error('Invalid PWM test state; reconnect.');
  if(this.info.calibrationPulses&&s.calibration&&(!s.active||(s.active&(s.active-1))||s.routineKind||s.phases.some(p=>p>3)))throw Error('Invalid calibration state; reconnect.');
  if(this.info.testControls&&s.phases.some((phase,ch)=>{const bits=(s.raw>>(2*ch))&3;return phase===5?bits===0:bits!==([0,2,3,2,0][phase]);}))throw Error('Output states disagree with channel phases; reconnect.');
  if(!this.info.testControls&&s.phases.includes(5))throw Error('Unexpected manual test status; reconnect.');
  if((s.routineKind||s.routineFault)&&!this.info.routines)throw Error('Unexpected routine status; reconnect.');
  if(s.active&~(this.info.channelSelection?s.enabledMask:this.info.mask))throw Error('Channel configuration changed; reconnect.');
  if(this.info.channelSelection&&s.enabledMask!==this.info.mask){this.info={...this.info,mask:s.enabledMask,analogChannels:Array.from({length:6},(_,ch)=>ch).filter(ch=>s.enabledMask&(1<<ch))};this.emit('configuration',this.info);}
  this.emit('status',s);
  const waiter=this.waiters.get(s.seq);if(waiter){clearTimeout(waiter.timer);this.waiters.delete(s.seq);waiter.resolve(s);}
  if(s.reply===6)for(const [seq,w] of this.waiters)if(seq<s.seq){clearTimeout(w.timer);this.waiters.delete(seq);w.resolve({...s,superseded:true});}
 }catch(e){this.emit('error',e.message);this.disconnect();}}
 async command(op,mask=0,pumpMs=0,holdMs=0,releaseMs=0,repeats=1,aux=0){
  if(!this.device?.gatt.connected||!this.commandChar||!this.info)throw Error('Connect to the hub first.');
  const generation=this.generation,seq=++this.seq;
  const bytes=encodeCommand({op,mask,aux,pumpMs,holdMs,releaseMs,repeats,seq,session:this.info.session},this.info);
  // Stop invalidates any START that has not entered a GATT write yet.
  if(op===2)this.cancelStartsThrough=seq;
  let resolve,reject,timer,expired=false;
  const outcome=new Promise((a,b)=>{resolve=a;reject=b;});
  outcome.catch(()=>{}); // It may reject while a slow GATT write is still settling.
  timer=setTimeout(()=>{expired=true;this.waiters.delete(seq);reject(Error(op===2?'Stop not confirmed. Use the battery switch if needed.':'No confirmation. Check the hub; the command may have taken effect.'));},2500);
  const write=this.writeTail.catch(()=>{}).then(async()=>{
   if(expired)throw Error('Command expired before it could be sent.');
   if(generation!==this.generation||!this.device?.gatt.connected)throw Error('Connection ended; command was not sent.');
   if(op!==2&&seq<(this.cancelStartsThrough||0))throw Error('Start cancelled by Stop.');
   this.waiters.set(seq,{resolve,reject,timer});
   const c=this.commandChar;
   if(c.writeValueWithResponse)await c.writeValueWithResponse(bytes);else await c.writeValue(bytes);
  });
  this.writeTail=write.catch(()=>{});
  write.catch(error=>{clearTimeout(timer);this.waiters.delete(seq);reject(error);});
  return outcome;

 }
 async startRoutine(plan){
  if(plan.stages.some(s=>s.pump===0||s.pump>2000)&&!this.info?.targetOnlyRoutines)throw Error('Install firmware v13 to run sequences without the 2-second cutoff.');
  if(plan.stages.some(s=>(s.speed??100)!==100)&&!this.info?.routineSpeed)throw Error('Install firmware v12 to use sequence pump speed.');
  if(plan.targetUnit==='millivolts'&&!this.info?.sensorRangeTargets&&plan.stages.some(s=>s.targets.some(Boolean)))throw Error('Install firmware v10 for sensor-range targets.');
  const generation=this.generation,cancel=this.cancelStartsThrough||0;
  const check=()=>{if(generation!==this.generation||cancel!==(this.cancelStartsThrough||0))throw Error('Routine cancelled before start.');};
  for(let i=0;i<plan.stages.length;i++){
   check();const s=plan.stages[i],reply=await this.command(5,s.mask,s.pump,s.hold,s.release,s.window,i);
   check();if(reply.reply!==1)throw Error('The hub did not accept the zone settings. Nothing new was started.');
   const targetReply=await this.command(7,s.mask,s.targets[0],s.targets[1]??0,0,0,i);
   check();if(targetReply.reply!==1)throw Error('The hub did not accept the sensor targets. Nothing new was started.');
   if(this.info?.routineSpeed){const speedReply=await this.command(11,s.mask,s.speed??100,0,0,0,i);check();if(speedReply.reply!==1)throw Error('The hub did not accept the pump speed. Nothing new was started.');}
  }
  check();return this.command(6,plan.stages.length,plan.settle,0,0,plan.repeats,plan.kind);
 }
 clear(message){
  ++this.generation;
  if(this.statusChar)this.statusChar.removeEventListener('characteristicvaluechanged',this.onNotify);
  if(this.device)this.device.removeEventListener('gattserverdisconnected',this.onDisconnect);
  for(const w of this.waiters.values()){clearTimeout(w.timer);w.reject(Error('Bluetooth disconnected; command outcome is unknown.'));}
  this.waiters.clear();this.commandChar=null;this.statusChar=null;this.info=null;this.seq=0;this.cancelStartsThrough=0;this.writeTail=Promise.resolve();this.emit('disconnected',message);
 }
 disconnect(){const device=this.device;this.clear('Disconnected. Routines and channel tests switch off. Fixed-count debug patterns finish; Until Stop ends after the current cycle.');if(device?.gatt.connected)device.gatt.disconnect();this.device=null;}
}
