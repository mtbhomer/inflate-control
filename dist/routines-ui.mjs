import {GuidancePlayer,GUIDANCE} from './guidance.mjs?v=9';
import {ZONES,ROUTINE_PHASES,defaultRoutines,cleanRoutines,zoneIds,channels,buildRoutine,validCalibration,cleanCalibration,percentReading} from './routines.mjs?v=9';
import {analogReading} from './sensor.mjs?v=9';
const $=id=>document.getElementById(id);
const text=(id,v)=>{if($(id).textContent!==v)$(id).textContent=v;};
const seconds=ms=>(ms/1000).toFixed(1).replace(/\.0$/,'');
const input=(id,label,value,min,max,step=1)=>`<label class="routine-field" for="${id}"><span>${label}</span><div class="number-field"><input id="${id}" type="number" inputmode="decimal" required min="${min}" max="${max}" step="${step}" value="${value}"><span>s</span></div></label>`;
export class RoutineUI{
 constructor({context,start,changed}){
  this.context=context;this.start=start;this.changed=changed;this.data=defaultRoutines();this.calibration=cleanCalibration(null);this.demoCalibration=Array.from({length:6},()=>({zero:264,reference:3000}));
  try{this.savedCalibration=JSON.parse(localStorage.getItem('inflate.calibration.v1'));}catch{}
  try{this.data=cleanRoutines(JSON.parse(localStorage.getItem('inflate.routines.v1')));}catch{}
  this.mapKind='breathing';this.zone='front';this.editKind=this.data.selected;this.editZone=this.editKind==='scan'?'upper':'front';this.lastCue='';this.armed=false;this.wasActive=false;
  this.speechAvailable=Boolean(globalThis.speechSynthesis&&globalThis.SpeechSynthesisUtterance);this.player=new GuidancePlayer();
  $('routines').innerHTML=`<div class="routine-tabs" role="group" aria-label="Vest routine"><button id="routine-breathing" aria-pressed="true"><b>Breathing</b><span>Front · natural awareness</span></button><button id="routine-scan" aria-pressed="false"><b>Body scan</b><span>Back · one zone at a time</span></button></div>
   <p id="routine-description" class="routine-description"></p>
   <div id="zone-workspace" class="routine-workspace"><div class="vest-panel"><div class="section-top"><h3 id="vest-title">Front of vest</h3><span class="quiet">Tap a zone</span></div>
    <div class="vest-diagram"><svg viewBox="0 0 320 350" aria-hidden="true"><path class="body-outline" d="M130 22V48L79 67Q51 77 38 126L63 140L83 110L88 188L76 325Q160 346 244 325L232 188L237 110L257 140L282 126Q269 77 241 67L190 48V22Z"/><path class="vest-outline" d="M105 55L86 80L100 150L91 307Q160 325 229 307L220 150L234 80L215 55L190 72Q160 95 130 72Z"/><path class="vest-seam" d="M160 90V319M97 162H223M94 241H226"/></svg>
     ${Object.entries(ZONES).map(([id,z])=>`<button id="zone-${id}" class="vest-zone zone-${id}" aria-pressed="false"><b>${z.name}</b><span id="zone-channels-${id}">Assign channels</span><small>${z.code}</small></button>`).join('')}
    </div><label class="lower-option"><input id="include-lower" type="checkbox"> Include lower back <span>optional</span></label>
    <div class="routine-live" aria-live="polite"><span id="routine-live-label">Ready to begin</span><strong id="routine-live-phase">Map your channels</strong><p id="routine-cue">Select a zone to get started.</p><div class="routine-progress"><span id="routine-progress-fill"></span></div></div>
   </div><div class="zone-editor"><div class="section-top"><h3 id="zone-editor-title">Front</h3><span id="zone-editor-code" class="quiet">D</span></div><p class="mapping-hint">Assign the connected channel. Select two to inflate a pair together.</p><div id="channel-mapper" class="channel-mapper" role="group" aria-label="Channels for selected zone">${Array.from({length:6},(_,ch)=>`<button id="assign-${ch}" aria-pressed="false">CH${ch}<small id="assign-note-${ch}">Available</small></button>`).join('')}</div><p id="mapping-message" class="mapping-message" role="status"></p>
    <label class="routine-field" for="zone-mode"><span>Inflation control</span><select id="zone-mode"><option value="sensor">Sensor target</option><option value="timed">Timed inflation</option></select></label>
    <label id="target-field" class="routine-field target-field" for="zone-target"><span>Target level</span><div class="number-field"><input id="zone-target" type="number" inputmode="decimal" min="1" max="100" step="1" placeholder="Set target"><span>%</span></div></label>
    <div class="routine-timing-grid">${input('zone-pump','Pump limit / time',2,.05,2,.05)}${input('zone-hold','Hold before release',1,0,10,.1)}${input('zone-release','Release between cues',2,.5,10,.1)}${input('zone-window','Time in this zone',30,1,60,.1)}</div><p id="zone-timing-note" class="footnote"></p>
    <section class="zone-sensors" aria-label="Selected zone sensors"><div class="section-top"><h4>Reference levels</h4><span id="calibration-mode" class="quiet">Per channel</span></div><div id="zone-sensor-readings"></div><p class="footnote">0% = vented. 100% = your recorded reference inflation. This is a relative sensor level, not air volume or pressure. Use the controls in Device to inflate and hold a reference, then record it beside that channel. Recalibrate if you move or replace a sensor.</p><p id="calibration-message" class="mapping-message" role="status"></p></section>
   </div></div>
   <section class="routine-session"><div class="section-top"><h3>Session</h3><button id="routine-short" class="text-button">Short test timings</button></div><div class="session-grid">${input('routine-settle','Start delay',5,0,60)}<label class="routine-field" for="routine-repeat"><span>Repeat</span><select id="routine-repeat"><option value="once">Once</option><option value="count">Set rounds</option><option value="forever">Until Stop</option></select></label><label id="routine-count-label" class="routine-field" for="routine-count"><span>Total rounds</span><div class="number-field"><input id="routine-count" type="number" inputmode="numeric" min="1" max="999" step="1" value="3"></div></label></div>
    <div class="voice-option"><label><input id="routine-voice" type="checkbox"> Spoken guidance</label><button id="voice-preview" class="text-button">Preview voice</button></div><div class="session-grid"><label class="routine-field" for="voice-choice"><span>Guidance voice</span><select id="voice-choice"><option value="sarah">Sarah · prepared audio</option><option value="lily">Lily · prepared audio</option><option value="device">Device voice</option></select></label><label class="routine-field" for="voice-rate"><span>Speaking speed</span><select id="voice-rate"><option value="0.85">Slower · 0.85×</option><option value="1">Natural · 1×</option><option value="1.15">Faster · 1.15×</option></select></label></div><label id="device-voice-label" class="routine-field" for="device-voice" hidden><span>Voice on this device</span><select id="device-voice"></select></label><p id="voice-note" class="footnote"></p>
    <div id="routine-zone-summary" class="routine-zone-summary"></div><div id="routine-timeline" class="routine-timeline" aria-label="Routine order"></div><p id="routine-estimate" class="footnote"></p>
    <p id="routine-validation" class="routine-validation" role="status"></p><p id="routine-upgrade" class="message" hidden>Guided routines need firmware v8 or newer. <a href="hub_ble.zip?v=9" download>Download v9</a>. Your existing controls are under Device → Channel tests.</p>
    <button id="routine-start" class="routine-start" disabled>Start breathing routine <span aria-hidden="true">→</span></button><p class="footnote">Keep Bluefy open for live guidance. Stop or Bluetooth disconnection releases the routine. Sensor targets stop each pump; the 2 s limit stops and releases the routine if a target is not reached.</p>
   </section>`;
  $('zones').innerHTML='<div class="routine-intro"><p class="eyebrow">MAP & ADJUST</p><h2>Zone mapping</h2><p id="zone-routine-title"></p><div class="sequence-picker" role="group" aria-label="Vest side"><button id="map-front" aria-pressed="true">Front</button><button id="map-back" aria-pressed="false">Back</button></div></div>';
  const live=document.querySelector('.routine-live');$('routines').insertBefore(live,document.querySelector('.routine-session'));
  $('zones').append($('zone-workspace'));
  $('sequences').innerHTML='<div class="routine-intro"><p class="eyebrow">SEQUENCE CONFIGURATION</p><h2>Adjust the experience.</h2><p>Settings are saved here. Exercises uses your saved configuration.</p></div><div class="sequence-picker" role="group" aria-label="Sequence to configure"><button data-config-kind="breathing">Breathing</button><button data-config-kind="scan">Body scan</button></div><div id="sequence-zone-picker" class="sequence-zone-picker" role="group" aria-label="Zone settings"></div><div id="sequence-zone-settings" class="zone-editor"></div>';
  const seqEditor=$('sequence-zone-settings');$('sequences').insertBefore($('include-lower').parentElement,$('sequence-zone-picker'));
  for(const side of ['front','back'])$(`map-${side}`).addEventListener('click',()=>{this.mapKind=side==='front'?'breathing':'scan';this.zone=side==='front'?'front':'upper';this.changed();});
  for(const id of ['zone-mode','target-field'])seqEditor.append(id==='zone-mode'?$(id).parentElement:$(id));
  seqEditor.append(document.querySelector('.routine-timing-grid'),$('zone-timing-note'));
  const session=document.querySelector('.routine-session'),summary=$('routine-zone-summary'),validation=$('routine-validation'),upgrade=$('routine-upgrade'),startButton=$('routine-start');
  $('sequences').append(session);$('routines').append(summary,validation,upgrade);
  const actions=document.createElement('div');actions.className='routine-actions';actions.append(startButton);actions.insertAdjacentHTML('beforeend','<button class="stop-control" data-stop disabled><span class="stop-icon" aria-hidden="true"></span>Stop & release</button>');$('routines').append(actions);

  for(const button of document.querySelectorAll('[data-config-kind]'))button.addEventListener('click',()=>{if(this.locked())return;this.editKind=button.dataset.configKind;this.editZone=this.editKind==='scan'?'upper':'front';this.fill();this.changed();});
  $('sequence-zone-picker').addEventListener('click',e=>{const b=e.target.closest('[data-config-zone]');if(!b||this.locked())return;this.editZone=b.dataset.configZone;this.fill();this.changed();});

  document.addEventListener('click',e=>{const b=e.target.closest('[data-capture]');if(b)this.capture(Number(b.dataset.channel),b.dataset.capture);});
  $('zone-mode').addEventListener('change',()=>{this.editCfg.zones[this.editZone].mode=$('zone-mode').value;this.save();this.changed();});
  $('zone-target').addEventListener('input',()=>{this.editCfg.zones[this.editZone].target=$('zone-target').value===''?null:Number($('zone-target').value);this.save();this.changed();});
  for(const kind of ['breathing','scan'])$(`routine-${kind}`).addEventListener('click',()=>{if(this.locked())return;this.data.selected=kind;this.save();this.changed();});
  for(const id of Object.keys(ZONES))$(`zone-${id}`).addEventListener('click',()=>{this.zone=id;this.changed();});
  for(let ch=0;ch<6;ch++)$(`assign-${ch}`).addEventListener('click',()=>{if(this.locked())return;const z=this.cfg.zones[this.zone],bit=1<<ch;if(!(this.enabledMask&bit))return;z.mask&=this.enabledMask;if(!(z.mask&bit)&&channels(z.mask).length>=2){text('mapping-message','A zone can use up to two channels. Unselect one first.');return;}z.mask^=bit;this.save();this.changed();});
  for(const [id,key] of [['zone-pump','pump'],['zone-hold','hold'],['zone-release','release'],['zone-window','window']])$(id).addEventListener('input',()=>{this.editCfg.zones[this.editZone][key]=this.ms(id);this.save();this.changed();});
  $('include-lower').addEventListener('change',()=>{this.editCfg.lower=$('include-lower').checked;if(!this.editCfg.lower&&this.editZone==='lower')this.editZone='upper';this.save();this.fill();this.changed();});
  $('routine-settle').addEventListener('input',()=>{this.editCfg.settle=this.ms('routine-settle');this.save();this.changed();});
  const repeat=()=>{this.editCfg.repeats=$('routine-repeat').value==='forever'?0:$('routine-repeat').value==='once'?1:$('routine-count').value===''?NaN:Number($('routine-count').value);this.save();this.changed();};
  $('routine-repeat').addEventListener('change',repeat);$('routine-count').addEventListener('input',repeat);
  $('routine-short').addEventListener('click',()=>{if(this.locked())return;this.editCfg.settle=2000;this.editCfg.repeats=1;for(const z of Object.values(this.editCfg.zones))Object.assign(z,{pump:2000,hold:500,release:1000,window:10000});this.save();this.fill();this.changed();});
  $('routine-voice').addEventListener('change',()=>{this.data.spoken=$('routine-voice').checked;if(!this.data.spoken)this.cancelVoice();else{this.player.unlock().catch(()=>{});if(this.context().routineKind){this.armed=true;this.lastCue='';}}this.save();this.changed();});
  $('voice-preview').addEventListener('click',()=>this.speak('preview',true));
  $('voice-choice').value=this.data.voice;$('voice-rate').value=this.data.rate;
  $('voice-choice').addEventListener('change',()=>{this.cancelVoice();this.data.voice=$('voice-choice').value;this.save();this.changed();});
  $('voice-rate').addEventListener('change',()=>{this.data.rate=Number($('voice-rate').value);this.save();});
  $('device-voice').addEventListener('change',()=>{this.data.browserVoice=$('device-voice').value;this.save();});
  const refreshVoices=()=>{if(!this.speechAvailable)return;const voices=speechSynthesis.getVoices().filter(v=>/^en\b/.test(v.lang));$('device-voice').replaceChildren(new Option('Automatic English voice',''),...voices.map(v=>new Option(v.name+' · '+v.lang,v.voiceURI)));$('device-voice').value=this.data.browserVoice;};
  refreshVoices();if(this.speechAvailable)speechSynthesis.addEventListener('voiceschanged',refreshVoices);
  $('routine-start').addEventListener('click',()=>{try{const plan=buildRoutine(this.data.selected,this.runCfg,this.enabledMask,this.refs);this.start(plan);}catch(e){text('routine-validation',e.message);}});

  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelVoice();else if(this.context().routineKind&&this.data.spoken){this.armed=true;this.lastCue='';}});
  this.fill();
 }
 get refs(){return this.context().demo?this.demoCalibration:this.calibration;}
 reading(ch){const c=this.context(),a=c.analogStates[ch];return c.fresh?analogReading(a?.sample,c.now-(a?.received??0)):null;}
 capture(ch,key){
  const c=this.context(),r=this.reading(ch);if(!Number.isInteger(ch)||ch<0||ch>5||!['zero','reference'].includes(key)||!(this.enabledMask&(1<<ch))||c.routineKind||c.pending||!r||r.low||r.high)return;
  const raw=c.analogStates[ch].sample.raw,ref=this.refs[ch];
  if(key==='zero'){ref.zero=raw;ref.reference=null;}
  else if(!Number.isInteger(ref.zero)||raw-ref.zero<32){this.calibrationMessage=`CH${ch}: set vented 0% first, then inflate to a higher reference level.`;this.changed();return;}
  else ref.reference=raw;
  if(!c.demo)try{this.savedCalibration={deviceId:this.deviceId,channels:this.calibration};localStorage.setItem('inflate.calibration.v1',JSON.stringify({deviceId:this.deviceId,channels:this.calibration}));}catch{}
  this.calibrationMessage=`${c.demo?'Preview · ':''}CH${ch} ${key==='zero'?'vented 0% recorded; now record 100%':'reference 100% recorded'}.`;this.changed();
 }
 setDevice(id){this.deviceId=id;this.calibration=this.savedCalibration?.deviceId===id?cleanCalibration(this.savedCalibration.channels):cleanCalibration(null);this.calibrationMessage='';}
 renderSensors(node,chs){
  const signature=chs.join(',');
  if(node.dataset.channels!==signature){node.dataset.channels=signature;node.innerHTML=chs.map(ch=>`<div class="calibration-card" data-sensor="${ch}"><div class="zone-sensor"><span>CH${ch}</span><strong data-level>—</strong><span data-state>Waiting</span><meter min="0" max="100" value="0" aria-label="CH${ch} reference level"></meter></div><div class="capture-buttons"><button class="subtle" data-channel="${ch}" data-capture="zero">Record 0%</button><button class="subtle" data-channel="${ch}" data-capture="reference">Record 100%</button></div><small data-note></small></div>`).join('')||'<p class="footnote">Assign channels to record their reference levels.</p>';}
  const c=this.context();
  for(const ch of chs){const n=node.querySelector(`[data-sensor="${ch}"]`),r=this.reading(ch),cal=this.refs[ch],pct=r?percentReading(c.analogStates[ch].sample.raw,cal):null;
   n.querySelector('[data-level]').textContent=pct===null?'—':pct.toFixed(1)+'%';
   n.querySelector('[data-state]').textContent=!r?'Waiting for reading':r.high?'ADC ceiling':r.low?'ADC floor':!validCalibration(cal)?'Record two reference points':pct>100?'Above reference':'of recorded reference';
   n.querySelector('meter').value=Math.max(0,Math.min(100,pct??0));
   const disabled=Boolean(c.routineKind||c.pending||!r||r.high||r.low);
   n.querySelector('[data-capture="zero"]').disabled=disabled;n.querySelector('[data-capture="reference"]').disabled=disabled||!cal?.zero;
   n.querySelector('[data-note]').textContent=`${cal?.zero?'0% saved':'Vent fully, then record 0%'} · ${validCalibration(cal)?'100% saved':'Reference needed'}`;
  }
 }
 get enabledMask(){const c=this.context();return c.enabledMask??c.info?.mask??63;}
 get cfg(){return this.data[this.mapKind];}
 get editCfg(){return this.data[this.editKind];}
 get runCfg(){return this.data[this.data.selected];}
 ms(id){return $(id).value===''?NaN:Math.round(Number($(id).value)*1000);}
 locked(){const c=this.context();return Boolean(c.busy||(c.online&&!c.fresh));}
 save(){try{localStorage.setItem('inflate.routines.v1',JSON.stringify(this.data));}catch{}}
 fill(){const z=this.editCfg.zones[this.editZone];$('zone-mode').value=z.mode;$('zone-target').value=z.target??'';for(const key of ['pump','hold','release','window'])$(`zone-${key}`).value=seconds(z[key]);$('routine-settle').value=seconds(this.editCfg.settle);$('routine-repeat').value=this.editCfg.repeats===0?'forever':this.editCfg.repeats===1?'once':'count';$('routine-count').value=this.editCfg.repeats>1?this.editCfg.repeats:3;$('include-lower').checked=this.editCfg.lower;$('routine-voice').checked=this.data.spoken;}

 armVoice(){this.armed=true;this.lastCue='';this.wasActive=false;if(this.data.spoken&&this.data.voice!=='device')this.player.unlock().catch(()=>{});}
 cancelVoice(){this.player.cancel();this.armed=false;this.wasActive=false;this.lastCue='';if(this.speechAvailable)speechSynthesis.cancel();}
 speak(id,force=false){
  if((!force&&!this.data.spoken)||document.hidden)return;
  if(this.speechAvailable)speechSynthesis.cancel();
  if(this.data.voice!=='device'){
   this.player.play(id,this.data.voice,this.data.rate).catch(error=>{console.warn('Guidance audio:',error);text('voice-note','Audio could not play. Tap Preview voice to enable it; on-screen cues remain available.');});return;
  }
  this.player.cancel();if(!this.speechAvailable)return;
  try{speechSynthesis.resume();const u=new SpeechSynthesisUtterance(GUIDANCE[id]);u.lang='en-US';u.rate=this.data.rate;const voices=speechSynthesis.getVoices();u.voice=voices.find(v=>v.voiceURI===this.data.browserVoice)||voices.find(v=>v.localService&&/^en\b/.test(v.lang))||null;u.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))text('voice-note','Device voice unavailable. Try prepared audio.');};this.utterance=u;speechSynthesis.speak(u);}catch{text('voice-note','Device voice unavailable. Try prepared audio.');}
 }
 render(){
  const c=this.context(),running=c.fresh&&c.routineKind>0,live=running&&c.routineFresh?c.routine:null,locked=this.locked();
  document.querySelector('.routine-live').hidden=!c.routineKind;
  if(live)this.data.selected=live.routineKind===1?'breathing':'scan';
  const activeIds=this.mapKind==='breathing'?['front']:['upper','middle','lower'],z={...this.cfg.zones[this.zone],mask:this.cfg.zones[this.zone].mask&this.enabledMask},editIds=zoneIds(this.editKind,this.editCfg),editZ=this.editCfg.zones[this.editZone];
  const runCfg=this.runCfg,runIds=zoneIds(this.data.selected,runCfg),liveZone=live?zoneIds(this.data.selected,{lower:live.count===3})[live.step]:runIds[0];
  for(const mode of ['breathing','scan']){$(`routine-${mode}`).setAttribute('aria-pressed',String(mode===this.data.selected));$(`routine-${mode}`).disabled=locked;}
  text('routine-description',this.data.selected==='breathing'?'Gentle front cues invite awareness of natural breathing. Follow your own breathing rhythm.':'Repeated cues in each back area, moving from upper to middle to optional lower back.');
  text('zone-routine-title',this.mapKind==='breathing'?'Front airbag':'Upper, middle and lower back');$('map-front').setAttribute('aria-pressed',String(this.mapKind==='breathing'));$('map-back').setAttribute('aria-pressed',String(this.mapKind==='scan'));
  text('vest-title',this.mapKind==='breathing'?'Front of vest':'Back of vest');
  for(const [id,spec] of Object.entries(ZONES)){const show=this.mapKind==='breathing'?id==='front':id!=='front';const button=$(`zone-${id}`);button.hidden=!show;button.disabled=false;button.setAttribute('aria-pressed',String(this.zone===id));button.classList.toggle('zone-live',Boolean(live&&live.phase!==1&&id===liveZone));const mapping=(this.cfg.zones[id]?.mask??0)&this.enabledMask;text(`zone-channels-${id}`,channels(mapping).map(ch=>'CH'+ch).join(' + ')||'Assign channels');}
  $('include-lower').parentElement.hidden=this.editKind!=='scan';$('include-lower').checked=this.editCfg.lower;$('include-lower').disabled=locked;
  for(const button of document.querySelectorAll('[data-config-kind]')){button.setAttribute('aria-pressed',String(button.dataset.configKind===this.editKind));button.disabled=locked;}
  const zoneButtons=editIds.map(id=>`<button data-config-zone="${id}" aria-pressed="${id===this.editZone}" ${locked?'disabled':''}>${ZONES[id].name}</button>`).join('');if($('sequence-zone-picker').innerHTML!==zoneButtons)$('sequence-zone-picker').innerHTML=zoneButtons;
  text('zone-editor-title',ZONES[this.zone].name);text('zone-editor-code',ZONES[this.zone].code);
  const occupied=activeIds.filter(id=>id!==this.zone).reduce((m,id)=>m|(this.cfg.zones[id].mask&this.enabledMask),0);
  for(let ch=0;ch<6;ch++){const selected=Boolean(z.mask&(1<<ch)),elsewhere=Boolean(occupied&(1<<ch)),unavailable=!(this.enabledMask&(1<<ch)),full=!selected&&channels(z.mask).length>=2;$(`assign-${ch}`).hidden=unavailable;$(`assign-${ch}`).disabled=locked||elsewhere||unavailable||full;$(`assign-${ch}`).setAttribute('aria-pressed',String(selected));text(`assign-note-${ch}`,selected?'Assigned':elsewhere?'Other zone':unavailable?'Unavailable':full?'Pair selected':'Available');}
  text('mapping-message',channels(z.mask).length===2?'Both start together. Each pump stops at its own target; both release together.':'Assignments are saved for each routine.');
  for(const id of ['zone-mode','zone-target','zone-pump','zone-hold','zone-release','zone-window','routine-settle','routine-repeat','routine-count','routine-short'])$(id).disabled=locked;
  $('routine-count-label').hidden=$('routine-repeat').value!=='count';
  $('target-field').hidden=editZ.mode==='timed';
  text('zone-timing-note',`Repeat inflate → hold → release throughout this ${seconds(editZ.window)} s zone. A new cue starts only when a full cycle fits. ${editZ.mode==='sensor'?'Each pump stops at its target, with a '+seconds(editZ.pump)+' s maximum.':'Timed pumping does not use sensor feedback.'}`);
  this.renderSensors($('zone-sensor-readings'),channels(z.mask));
  text('calibration-mode',c.demo?'Preview references':'Saved for this hub');text('calibration-message',this.calibrationMessage||'');
  for(let ch=0;ch<6;ch++){const node=$(`calibration-debug-${ch}`);if(node)this.renderSensors(node,this.enabledMask&(1<<ch)?[ch]:[]);}
  const canSpeak=this.data.voice!=='device'?Boolean(globalThis.AudioContext||globalThis.webkitAudioContext):this.speechAvailable;
  $('routine-voice').disabled=!canSpeak;$('voice-preview').disabled=!canSpeak||running||c.pending;$('voice-choice').disabled=running;$('voice-rate').disabled=running;$('device-voice').disabled=running;
  $('device-voice-label').hidden=this.data.voice!=='device';
  const voiceNote=this.data.voice==='device'?'Uses an English voice exposed by your browser. Available voices vary by device.':'AI-generated ElevenLabs narration, prepared in advance. No TTS API calls during exercises.';
  if(this.voiceNoteKey!==this.data.voice){text('voice-note',voiceNote);this.voiceNoteKey=this.data.voice;}
  const cfg=this.editCfg,order=editIds.map(id=>`${ZONES[id].name} · ${seconds(cfg.zones[id].window)} s`);text('routine-timeline',[`${seconds(cfg.settle)} s settle`,...order].join(' → '));
  const perRound=editIds.reduce((n,id)=>n+cfg.zones[id].window,0),total=cfg.settle+perRound*(cfg.repeats||1);text('routine-estimate',cfg.repeats?`${cfg.repeats} ${cfg.repeats===1?'round':'rounds'} · about ${seconds(total)} seconds total.`:`Repeats until Stop · ${seconds(perRound)} seconds per round after settling.`);
  const overview=runIds.map(id=>{const a=runCfg.zones[id];return `<div class="zone-overview"><span><b>${ZONES[id].name}</b><small>${channels(a.mask&this.enabledMask).map(ch=>'CH'+ch).join(' + ')||'Assign channels'}</small></span><span><b>${a.mode==='timed'?seconds(a.pump)+' s':a.target===null?'Set target':a.target+'%'}</b><small>${seconds(a.window)} s · repeated cues</small></span></div>`;}).join('');if($('routine-zone-summary').innerHTML!==overview)$('routine-zone-summary').innerHTML=overview;
  let error='';try{buildRoutine(this.data.selected,runCfg,this.enabledMask,this.refs);}catch(e){error=e.message;}
  const fault=c.routineFault?`CH${c.routineFaultChannel}: ${c.routineFault===2?'target was not reached within the pump limit':'sensor reading is missing, stale or at an ADC endpoint'}. Routine stopped and released. Check the channel before restarting.`:'';
  text('routine-validation',fault||error||(!c.online?'Connect your hub or try the interface to start.':!c.fresh?'Waiting for fresh hub status.':running?'Routine running. Settings stay locked until it finishes or you press Stop.':c.busy?'Stop the active channel test or pattern first.':'Ready with your saved settings.'));
  $('routine-upgrade').hidden=!c.online||c.info?.routines;
  $('routine-start').disabled=Boolean(error)||!c.fresh||!c.info?.routines||locked;
  text('routine-start',c.pending?'Sending routine…':running?'Routine running':this.data.selected==='breathing'?'Start breathing →':'Start body scan →');
  const phase=live?.phase??0;let cue=live?(phase===1?'Settle into a comfortable position. Notice your natural breathing.':live.routineKind===1&&phase>=5?'After release, continue noticing your body and natural breathing.':ZONES[liveZone].cue):running?'Waiting for the routine’s current phase…':ZONES[liveZone].cue;
  text('routine-live-label',live?`Round ${live.cycle}${live.repeats?' of '+live.repeats:' · until Stop'} · ${phase===1?'Preparation':ZONES[liveZone].name+' · cue '+live.pulse}`:c.routineKind?'Waiting for current progress':'Ready');
  const remaining=live?Math.max(0,live.remaining-(c.now-live.received)):0;text('routine-live-phase',live?`${phase===3&&runCfg.zones[liveZone].mode==='timed'?'Inflating':ROUTINE_PHASES[phase]} · ${Math.ceil(remaining/1000)} s`:running?'Syncing…':ZONES[liveZone].name);text('routine-cue',cue);
  const duration=phase===1?runCfg.settle:runCfg.zones[liveZone].window;$('routine-progress-fill').style.width=live?Math.min(100,Math.max(0,(live.elapsed+c.now-live.received)/Math.max(1,duration)*100))+'%':'0%';
  if(this.armed&&live){const speechPhase=phase===1?'settle':'zone',key=`${live.cycle}:${live.step}:${speechPhase}`;if(key!==this.lastCue){this.lastCue=key;this.speak(phase===1?'settle':liveZone);}this.wasActive=true;}
  if(this.armed&&this.wasActive&&c.fresh&&!running){this.speak(c.routineFault?'fault':'complete');this.armed=false;this.wasActive=false;}
 }
}
