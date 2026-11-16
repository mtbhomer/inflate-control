// Reuse only explicit permission for the exact previously selected hub.
// Device names alone are never used to select a new device without the chooser.
export async function rememberedDevice(bluetooth,id,current){
 if(!id)return null;
 if(current?.id===id)return current;
 if(typeof bluetooth?.getDevices!=='function')return null;
 const devices=await bluetooth.getDevices();return devices.find(d=>d.id===id)||null;
}
export class Reconnector{
 constructor({bluetooth,current,connect,canAttempt,notice,storage=globalThis.localStorage}){
  this.bluetooth=bluetooth;this.current=current;this.connect=connect;this.canAttempt=canAttempt;this.notice=notice;this.storage=storage;this.epoch=0;this.delay=1500;this.suspended=false;this.inFlight=false;
  try{this.enabled=storage.getItem('inflate.reconnect')!=='off';this.id=storage.getItem('inflate.deviceId')||null;}catch{this.enabled=true;this.id=null;}
 }
 remember(device){if(!device?.id)return;this.id=device.id;try{this.storage.setItem('inflate.deviceId',device.id);}catch{}this.suspended=false;this.delay=1500;}
 setEnabled(enabled){this.enabled=enabled;try{this.storage.setItem('inflate.reconnect',enabled?'on':'off');}catch{}this.cancel();if(enabled){this.suspended=false;this.schedule(0);}}
 cancel(){++this.epoch;clearTimeout(this.timer);}
 suspend(){this.suspended=true;this.cancel();}
 resume(){this.suspended=false;this.schedule(0);}
 schedule(delay=this.delay){clearTimeout(this.timer);if(!this.enabled||this.suspended||!this.id)return;this.timer=setTimeout(()=>this.attempt(),delay);}
 async attempt(){
  if(this.inFlight||!this.enabled||this.suspended||!this.id||!this.canAttempt())return;
  this.inFlight=true;const epoch=this.epoch;
  try{
   const device=await rememberedDevice(this.bluetooth,this.id,this.current());
   if(epoch!==this.epoch||!this.enabled||this.suspended||!this.canAttempt())return;
   if(!device){this.notice('This browser cannot restore the selected device here. Tap Connect to choose MeditationVest.');return;}
   this.notice('Looking for your previously selected hub…');await this.connect(device);this.delay=1500;
  }catch{this.notice('Hub not available yet. Reconnection will retry while this page is visible.');this.delay=Math.min(30000,this.delay*2);}
  finally{this.inFlight=false;if(epoch===this.epoch)this.schedule();}
 }
}
