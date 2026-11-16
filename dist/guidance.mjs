export const GUIDANCE={preview:'Notice your body, and let your breathing stay natural.',settle:'Settle in, and let your breathing stay natural.',front:'Notice gentle contact at the front of your body. Let your breathing stay natural.',upper:'Bring attention to your upper back. Notice contact around your shoulders.',middle:'Move attention to your middle back. Notice support and sensation.',lower:'Continue to your lower back. Notice contact and relaxation in this area.',complete:'The exercise is complete. Take a moment to notice how your body feels.',fault:'The exercise has stopped. Check the channel before starting again.'};
// Static files only: generation credentials and TTS requests never reach the browser.
export class GuidancePlayer{
 constructor({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),fetcher=(...args)=>globalThis.fetch(...args),hidden=()=>document.hidden}={}){this.contextFactory=contextFactory;this.fetcher=fetcher;this.hidden=hidden;this.cache=new Map();this.generation=0;}
 async unlock(){this.context??=this.contextFactory();if(this.context.state==='suspended')await this.context.resume();}
 async buffer(voice,id){
  if(!['sarah','lily'].includes(voice)||!Object.hasOwn(GUIDANCE,id))throw Error('Unknown guidance clip.');
  const key=voice+'-'+id;
  if(!this.cache.has(key)){const pending=this.fetcher(new URL(`./audio/${key}.mp3`,import.meta.url)).then(r=>{if(!r.ok)throw Error('Voice clip could not be loaded.');return r.arrayBuffer();}).then(bytes=>this.context.decodeAudioData(bytes));this.cache.set(key,pending);pending.catch(()=>this.cache.delete(key));}
  return this.cache.get(key);
 }
 cancel(){++this.generation;if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}}
 async play(id,voice,rate=1){
  this.cancel();const generation=this.generation;await this.unlock();
  const buffer=await this.buffer(voice,id);if(generation!==this.generation||this.hidden())return false;
  const node=this.context.createBufferSource();node.buffer=buffer;node.playbackRate.value=Math.max(.75,Math.min(1.25,rate));node.connect(this.context.destination);this.source=node;node.onended=()=>{node.disconnect();if(this.source===node)this.source=null;};node.start();return true;
 }
}
