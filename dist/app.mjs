import {Reconnector} from './reconnect.mjs?v=8';
import {HubBLE} from './ble.mjs?v=8';
import {PHASES,REPLIES} from './protocol.mjs?v=8';
import {sensorRange,validZero,analogReading} from './sensor.mjs?v=8';
import {RoutineUI} from './routines-ui.mjs?v=8.1';
import {RoutinePreview} from './routines.mjs?v=8';
const $=id=>document.getElementById(id);
const setText=(id,value)=>{const el=$(id);if(el.textContent!==value)el.textContent=value;};
const hub=new HubBLE();
const positions=['Upper left','Lower left','Bottom left','Bottom right','Lower right','Upper right'];
const CHANNELS=Array.from({length:6},(_,ch)=>ch);
const defaults=()=>({pump:1000,hold:1000,release:1000,count:3,mode:'count'});
let settings=Array.from({length:6},defaults),pair=defaults();
function clean(x){const d=defaults();for(const [k,min,max]of [['pump',50,2000],['hold',0,10000],['release',0,10000],['count',1,999]])if(Number.isInteger(x?.[k])&&x[k]>=min&&x[k]<=max)d[k]=x[k];d.mode=x?.mode==='forever'?'forever':'count';return d;}
try{const v=JSON.parse(localStorage.getItem('inflate.patterns.v2'));if(v?.channels?.length===6){settings=v.channels.map(clean);pair=clean(v.pair);}else{const old=JSON.parse(localStorage.getItem('inflate.times.v1'));if(old?.length===6)settings=old.map(clean);}}catch{}
let online=false,connecting=false,demo=false,pending=false,stopPending=false,info=null,status=null,received=0,baseline=null,history=[],lastHistory=0,staleShown=false;
let testMode=true;
let routineState=null,simRoutine=null,simFault=0,simFaultChannel=0;
let linked=false,pairChannels=[1,2],details=Array(6).fill(null),simRuns=Array(6).fill(null);
const analogStates=Array(6).fill(null);
const number=new Intl.NumberFormat('en-US');
const maskOf=chs=>chs.reduce((m,ch)=>m|(1<<ch),0);
const pairMask=()=>maskOf(pairChannels);
const enabledMask=()=>info?.mask??63;
function message(text){setText('message',text);$('message').hidden=!text;}
function fields(id,t){return `<div class="timings"><div class="timing"><label for="pump-${id}">Pump time</label><div class="number-field"><input id="pump-${id}" type="number" required inputmode="decimal" min="0.05" max="2" step="0.05" value="${t.pump/1000}"><span>s</span></div><small>0.05–2 seconds</small></div><div class="timing"><label for="hold-${id}">Hold before release</label><div class="number-field"><input id="hold-${id}" type="number" required inputmode="decimal" min="0" max="10" step="0.1" value="${t.hold/1000}"><span>s</span></div><small>0–10 seconds</small></div></div><button class="run" id="run-${id}" disabled>Run once</button><button class="stop-control channel-stop" id="stop-${id}" data-stop hidden disabled><span class="stop-icon" aria-hidden="true"></span>Stop all & release</button><details class="pattern-settings" id="pattern-${id}"><summary>Repeat pattern <span aria-hidden="true">＋</span></summary><div class="timings"><div class="timing"><label for="release-${id}">Released between cycles</label><div class="number-field"><input id="release-${id}" type="number" required inputmode="decimal" min="0" max="10" step="0.1" value="${t.release/1000}"><span>s</span></div><small>0–10 seconds · valve off</small></div><div class="timing"><label for="mode-${id}">Repeat</label><select id="mode-${id}"><option value="count" ${t.mode==='count'?'selected':''}>Set count</option><option value="forever" ${t.mode==='forever'?'selected':''}>Until Stop</option></select><div id="count-field-${id}" class="count-field"><label for="count-${id}">Total cycles</label><div class="number-field"><input id="count-${id}" type="number" required inputmode="numeric" min="1" max="999" step="1" value="${t.count}"></div></div></div></div><p class="footnote" id="repeat-note-${id}"></p><button class="run pattern-run" id="repeat-${id}" disabled>Start pattern</button></details>`;}
function bindFields(id){for(const key of ['pump','hold','release','count','mode'])$(`${key}-${id}`).addEventListener('change',()=>{saveTimes(id);render();});$(`run-${id}`).addEventListener('click',()=>run(id,false));$(`repeat-${id}`).addEventListener('click',()=>run(id,true));}
function analogCard(ch){const id=`analog-${ch}`;return `<section id="${id}Panel" class="sensor analog" aria-label="Channel ${ch} sensor"><div class="section-top"><h4>Sensor voltage</h4><span id="${id}State" class="quiet">Waiting for hub</span></div><div class="reading"><strong id="${id}Value">—</strong><span>CH${ch} · analog input</span></div><p id="${id}Upgrade" class="footnote" hidden><a href="hub_ble.zip?v=8" download>Install the six-channel firmware</a> for this input.</p><div id="${id}Meter" class="range-meter" role="meter" aria-label="CH${ch} ADC range used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="${id}Fill"></span></div><div class="range-labels"><span>0% · ADC floor</span><span>100% · ADC ceiling</span></div><details><summary>Voltage graph & details</summary><svg viewBox="0 0 360 112" role="img" aria-label="CH${ch} voltage, last thirty seconds"><path d="M32 8H360M32 56H360M32 104H360" class="gridlines"/><g class="axis-labels"><text x="0" y="12">3.3 V</text><text x="0" y="60">1.65 V</text><text x="10" y="108">0 V</text></g><path id="${id}ChartLine" fill="none" stroke="#32765e" stroke-width="2.5"/><text id="${id}ChartEmpty" x="190" y="61" text-anchor="middle">Live voltage appears here</text></svg><div class="chart-footer"><span>30 seconds</span><span id="${id}Age">CH${ch} · display only</span></div><p id="${id}Raw" class="analog-raw"></p><p class="footnote">ADC range, not calibrated pressure or inflation. A disconnected input can still produce readings.</p></details></section>`;}
function testControls(ch){return `<div class="test-controls" id="test-controls-${ch}"><div class="test-switches">${['pump','valve'].map(role=>`<button type="button" role="switch" aria-checked="false" aria-label="Channel ${ch} ${role}" id="test-${role}-${ch}" class="output-switch"><span>${role==='pump'?'Pump':'Valve'}</span><span class="switch-track" aria-hidden="true"></span><strong id="test-${role}-state-${ch}">Off</strong></button>`).join('')}</div><p class="footnote">Independent switches · pump max 2 s · valve max 10 s.<br>States are commanded outputs; confirm the physical response.</p></div>`;}
function cards(){for(let ch=0;ch<6;ch++){
 const node=document.createElement('article');node.className='channel';node.id=`channel-${ch}`;
 node.innerHTML=`<div class="channel-header"><span class="channel-number">${String(ch).padStart(2,'0')}</span><div class="channel-title"><h3>Channel ${ch}</h3><p>${positions[ch]}</p></div><span class="phase-label" id="phase-${ch}">Ready</span></div><p id="cycle-${ch}" class="cycle-note"></p><div class="channel-body"><div class="channel-controls">${testControls(ch)}<p class="linked-note" id="linked-${ch}" hidden>Linked · use the shared controls above</p><div id="fields-${ch}">${fields(ch,settings[ch])}</div></div>${analogCard(ch)}<div id="calibration-debug-${ch}" class="debug-calibration"></div></div><div class="timeline" aria-hidden="true"><span id="progress-${ch}"></span></div>`;
 $(enabledMask()&(1<<ch)?'channelCards':'futureCards').append(node);bindFields(ch);for(const role of ['pump','valve'])$(`test-${role}-${ch}`).addEventListener('click',()=>toggleOutput(ch,role));
 }
 $('pairFields').innerHTML=fields('pair',pair);bindFields('pair');pairChoices();
}
function pairChoices(){const enabled=Array.from({length:6},(_,ch)=>ch).filter(ch=>enabledMask()&(1<<ch));if(!pairChannels.every(ch=>enabled.includes(ch)))pairChannels=enabled.slice(0,2);
 for(let i=0;i<2;i++){$(`link-${i}`).innerHTML=enabled.map(ch=>`<option value="${ch}">CH${ch}</option>`).join('');$(`link-${i}`).value=pairChannels[i]??'';}
 $('linkPanel').hidden=testMode||enabled.length<2;
}
function saveTimes(id){const t=id==='pair'?pair:settings[id];for(const key of ['pump','hold','release','count']){const el=$(`${key}-${id}`);if(el.value!==''&&el.checkValidity())t[key]=key==='count'?Number(el.value):Math.round(Number(el.value)*1000);}t.mode=$(`mode-${id}`).value;try{localStorage.setItem('inflate.patterns.v2',JSON.stringify({channels:settings,pair}));}catch{}}
function usable(){return online&&status&&performance.now()-received<1000;}
function telemetry(s){status=s;received=performance.now();staleShown=false;
 if(s.fresh&&received-lastHistory>=80){history.push({t:received,y:s.raw});lastHistory=received;}
 history=history.filter(p=>received-p.t<30000);render();
}
function analogTelemetry(s){
 const state=analogStates[s.channel];if(!state)return;
 state.sample=s;state.received=performance.now();
 if(s.fresh&&state.received-state.lastHistory>=60){state.history.push({t:state.received,y:s.millivolts});state.lastHistory=state.received;}
 state.history=state.history.filter(p=>state.received-p.t<30000);render();
}
function resetAnalog(){for(const ch of CHANNELS)analogStates[ch]={sample:null,received:0,history:[],lastHistory:0};}
function renderAnalog(ch,connectionFresh){
 const el=suffix=>$(`analog-${ch}${suffix}`),text=(suffix,value)=>setText(`analog-${ch}${suffix}`,value);
 const supported=info?.analogChannels?.includes(ch),now=performance.now(),state=analogStates[ch];
 const sample=state.sample,reading=connectionFresh&&supported?analogReading(sample,now-state.received):null;
 el('Upgrade').hidden=!online||supported;
 el('Panel').hidden=online&&info?.hxChannel===ch;
 text('Value',reading?`${reading.volts.toFixed(3)} V`:'—');
 text('State',!online?'Waiting for hub':!supported?'Firmware update':!connectionFresh?'Connection stale':!sample||!(sample.flags&1)?'Waiting for data':!reading?'Stale':reading.high?'ADC CEILING':reading.low?'ADC FLOOR':reading.near?'Near ADC ceiling':demo?'Preview signal':'Live ADC');
 el('Panel').classList.toggle('clipped',Boolean(reading&&(reading.high||reading.low)));
 el('Panel').classList.toggle('near',Boolean(reading?.near));
 el('Fill').style.width=reading?`${reading.percent}%`:'0%';
 el('Meter').setAttribute('aria-valuenow',reading?.percent.toFixed(1)??'0');
 el('Meter').setAttribute('aria-valuetext',reading?`${reading.percent.toFixed(1)} percent of ADC range`:'No current reading');
 text('Age',reading?`${Math.round(sample.age+now-state.received)} ms · CH${ch}`:`CH${ch} · display only`);
 text('Raw',reading?`ADC ${sample.raw} / 4095 · ${reading.percent.toFixed(1)}% of ADC range`:'');
 const pts=state.history.filter(p=>now-p.t<=30000);let path='';
 pts.forEach((p,i)=>{const x=32+328*(1-(now-p.t)/30000),y=104-Math.max(0,Math.min(3300,p.y))/3300*96;path+=`${!i||p.t-pts[i-1].t>600?'M':'L'}${x.toFixed(1)},${y.toFixed(1)} `;});
 el('ChartLine').setAttribute('d',path);el('ChartEmpty').style.display=pts.length>1?'none':'';
}
function renderFields(id,locked,canRun){const t=id==='pair'?pair:settings[id];for(const key of ['pump','hold','release','count','mode'])$(`${key}-${id}`).disabled=locked;
 $(`run-${id}`).disabled=!canRun;$(`repeat-${id}`).disabled=!canRun;
 $(`count-field-${id}`).hidden=t.mode==='forever';
 setText(`repeat-note-${id}`,t.mode==='forever'?'Repeats until Stop. If Bluetooth disconnects, finishes the current cycle and releases.':`${t.count} total cycles. After the last hold, releases and is ready immediately.`);
}
function render(){
 const fresh=usable(),active=fresh?status.active:0;
 const routineBusy=Boolean(status?.routineKind);
 document.body.classList.toggle('test-mode',testMode);
 for(const mode of ['test','patterns']){const selected=(mode==='test')===testMode;$(`mode-${mode}`).setAttribute('aria-pressed',String(selected));$(`mode-${mode}`).disabled=Boolean(active)||routineBusy||pending||stopPending||(online&&!fresh);}
 $('modeHint').textContent=testMode?'Test one channel at a time. Switch outputs separately, or run a pump–hold–release cycle.':'Run independent or linked patterns.';
 $('testUpgrade').hidden=!testMode||!online||info?.testControls;
 $('linkPanel').hidden=testMode||Array.from({length:6},(_,ch)=>enabledMask()&(1<<ch)).filter(Boolean).length<2;
 setText('connectionState',demo?'PREVIEW · NO HARDWARE':online?'BLUETOOTH CONNECTED':connecting?'CONNECTING':'NOT CONNECTED');
 const remaining=6-Array.from({length:6},(_,ch)=>Boolean(enabledMask()&(1<<ch))).filter(Boolean).length;
 setText('futureTitle',`${remaining} more channels`);$('futureSection').hidden=remaining===0;
 $('connectionDot').className=`dot ${demo?'demo':online?'online':''}`;
 $('connect').disabled=connecting||demo;setText('connect',online&&!demo?'Disconnect ↗':'Connect hub ↗');setText('preview',demo?'Exit preview':'Try the interface');$('preview').hidden=online&&!demo;
 for(const button of document.querySelectorAll('[data-stop]'))button.disabled=!online||stopPending;
 let runLabel=online?(fresh?(active?Array.from({length:6},(_,ch)=>active&(1<<ch)?`CH${ch} ${PHASES[status.phases[ch]].toLowerCase()}`:null).filter(Boolean).join(' · '):'Ready to run'):'Waiting for live hub status'):'Connect to start';
 if(routineBusy)runLabel='Guided routine running';if(pending)runLabel='Waiting for hub confirmation…';if(stopPending)runLabel='Sending stop…';setText('runState',demo?'PREVIEW · '+runLabel:runLabel);
 const pairBusy=Boolean(active&pairMask())||routineBusy,pairUnknown=online&&!fresh;
 setText('linkToggle',linked?'Unlink boards':'Link boards');$('linkToggle').setAttribute('aria-pressed',String(linked));$('linkToggle').disabled=pairBusy||pairUnknown||pending||pairChannels[0]===pairChannels[1];
 for(let i=0;i<2;i++)$(`link-${i}`).disabled=linked||pairBusy||pairUnknown||pending;
 $('pairControls').hidden=!linked;setText('pairTitle',`CH${pairChannels[0]} + CH${pairChannels[1]}`);
 renderFields('pair',!linked||pairBusy||pending||stopPending,linked&&fresh&&!pairBusy&&!pending&&!stopPending);
 $('stop-pair').hidden=!linked||!online||!Boolean((status?.active??0)&pairMask());
 for(let ch=0;ch<6;ch++){
  const enabled=Boolean(enabledMask()&(1<<ch)),isLinked=!testMode&&linked&&pairChannels.includes(ch),thisActive=Boolean(active&(1<<ch));
  const parent=$(enabled?'channelCards':'futureCards');if($(`channel-${ch}`).parentElement!==parent)parent.append($(`channel-${ch}`));
  $(`fields-${ch}`).hidden=isLinked||!enabled;$(`linked-${ch}`).hidden=!isLinked;
  $(`channel-${ch}`).classList.toggle('active',thisActive);
  $(`stop-${ch}`).hidden=!online||!Boolean((status?.active??0)&(1<<ch));
  setText(`phase-${ch}`,!enabled?'Not enabled':!online?'Disconnected':!fresh?'Unknown':thisActive?PHASES[status.phases[ch]]:'Ready');
  const testReady=!testMode||(info?.testControls&&!active);
  renderFields(ch,!enabled||isLinked||thisActive||routineBusy||pending||stopPending,enabled&&!isLinked&&fresh&&!thisActive&&!routineBusy&&!pending&&!stopPending&&testReady);
  setText(`run-${ch}`,testMode?'Test pump + valve':'Run once');
  $(`test-controls-${ch}`).hidden=!testMode;
  for(const role of ['pump','valve']){const button=$(`test-${role}-${ch}`),on=fresh&&Boolean(status.outputs?.[ch]?.[role]);
   button.disabled=!enabled||!fresh||!info?.testControls||routineBusy||pending||stopPending||Boolean(active&~(1<<ch))||(thisActive&&status.phases[ch]!==5);
   button.setAttribute('aria-checked',String(on));setText(`test-${role}-state-${ch}`,fresh?(on?'On':'Off'):'—');
  }
  const d=details[ch],detailFresh=d&&performance.now()-d.received<1000&&d.phase===status?.phases[ch];
  setText(`cycle-${ch}`,thisActive&&status.phases[ch]===5?'Manual test · tap an active switch to turn it off':thisActive&&detailFresh?`Cycle ${d.cycle}${d.repeats?` of ${d.repeats}`:' · until Stop'}${(d.group&(d.group-1))?' · linked':''}`:'');
  const duration=d?(d.phase===1?100:d.phase===2?d.pump:d.phase===3?d.hold:d.release):1;
  $(`progress-${ch}`).style.width=thisActive&&detailFresh?`${Math.max(0,Math.min(100,(1-d.remaining/Math.max(1,duration))*100))}%`:'0%';
 }
 const sensorFresh=fresh&&status.fresh&&performance.now()-received+status.age<500;
 const range=sensorFresh?sensorRange(status.raw,baseline):null;
 setText('sensorValue',range?.percent!==null&&range?.percent!==undefined?`${range.percent>=99.95&&range.percent<100?'99.9':range.percent.toFixed(1)}%`:'—');
 setText('sensorUnit',baseline===null?'Set a vented zero to see 0–100%':'of the range from vented zero to digital limit');
 setText('sensorState',!online?'Waiting for hub':!fresh?'Connection stale':status.flags&4?'Frame error':!(status.flags&1)?'No data':!sensorFresh?'Stale':range?.clipped?'CLIPPED':range?.near?'Near digital limit':demo?'Preview signal':'Live');
 $('sensorPanel').classList.toggle('clipped',Boolean(range?.clipped));$('sensorPanel').classList.toggle('near',Boolean(range?.near));
 $('rangeFill').style.width=range?.percent!==null&&range?.percent!==undefined?`${range.percent}%`:'0%';
 $('rangeMeter').setAttribute('aria-valuenow',range?.percent?.toFixed(1)??'0');$('rangeMeter').setAttribute('aria-valuetext',range?.percent!==null&&range?.percent!==undefined?`${range.percent.toFixed(1)} percent of sensor range`:'Set vented zero');
 setText('sampleAge',sensorFresh?`${Math.round(status.age)} ms · CH2 only`:'CH2 sensor only');setText('rawValue',sensorFresh?`Raw ${number.format(status.raw)}`:'');
 $('zero').disabled=!sensorFresh||Boolean(active)||!validZero(status?.raw);$('clearZero').hidden=baseline===null;
 $('sensorPanel').hidden=!online||info?.hxChannel!==2;
 for(const ch of CHANNELS)renderAnalog(ch,fresh);drawChart();routines.render();
}
function drawChart(){const now=performance.now(),pts=baseline===null?[]:history.filter(p=>now-p.t<=30000);$('chartEmpty').style.display=pts.length>1?'none':'';setText('chartEmpty',baseline===null?'Set vented zero to start the chart':'Live readings appear here');
 if(pts.length<2){$('chartLine').setAttribute('d','');$('chartArea').setAttribute('d','');return;}
 let path='',area='',segment=[];const finish=()=>{if(!segment.length)return;path+=segment.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');area+=`M${segment[0][0].toFixed(1)},104 `+segment.map(p=>`L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')+` L${segment.at(-1)[0].toFixed(1)},104Z `;segment=[];};
 pts.forEach((p,i)=>{if(i&&p.t-pts[i-1].t>600)finish();segment.push([32+328*(1-(now-p.t)/30000),104-sensorRange(p.y,baseline).percent*.96]);});finish();$('chartLine').setAttribute('d',path);$('chartArea').setAttribute('d',area);
}
async function run(id,repeat){
 const mask=id==='pair'?pairMask():1<<id;
 if(!usable()||pending||stopPending||status.routineKind||(status.active&mask)||(testMode&&(repeat||!info?.testControls||status.active)))return;
 if(id==='pair'&&!linked)return;
 const keys=repeat?['pump','hold','release',...($(`mode-${id}`).value==='count'?['count']:[])]:['pump','hold'];
 for(const key of keys)if(!$(`${key}-${id}`).reportValidity())return;
 saveTimes(id);const t=id==='pair'?pair:settings[id],count=repeat?(t.mode==='forever'?0:t.count):1;
 pending=true;message('');render();
 try{if(demo){const now=performance.now();for(let ch=0;ch<6;ch++)if(mask&(1<<ch))simRuns[ch]={...t,repeats:count,cycle:1,phase:1,start:now,group:mask};tickDemo();message(`Preview: ${repeat?'pattern':'single cycle'} started.`);}
 else{const s=await hub.command(testMode?4:1,mask,t.pump,t.hold,repeat?t.release:0,count);message(REPLIES[s.reply]||'Hub replied.');}}
 catch(e){message(e.message);}finally{pending=false;render();}
}
async function toggleOutput(ch,role){
 if(!testMode||!info?.testControls||!usable()||pending||stopPending||status.routineKind||(status.active&~(1<<ch))||![0,5].includes(status.phases[ch]))return;
 const turnOn=!status.outputs?.[ch]?.[role];pending=true;message('');render();
 try{
  if(demo){const now=performance.now();let r=simRuns[ch];if(!r||r.phase!==5)r={phase:5,group:1<<ch,cycle:1,repeats:1,pump:2000,hold:10000,release:0,pumpOn:false,valveOn:false};
   r[role+'On']=turnOn;if(turnOn)r[role+'Started']=now;simRuns[ch]=r;tickDemo();message(`Preview: CH${ch} ${role} ${turnOn?'on':'off'}.`);
  }else{const result=await hub.command(3,1<<ch,role==='pump'?Number(turnOn):2,role==='valve'?Number(turnOn):2,0,0);message(result.reply===1?`CH${ch} ${role} command confirmed.`:REPLIES[result.reply]||'Hub replied.');}
 }catch(e){message(e.message);}finally{pending=false;render();}
}
for(const mode of ['test','patterns'])$(`mode-${mode}`).addEventListener('click',()=>{if(pending||stopPending||status?.routineKind||(online&&(!usable()||status.active)))return;testMode=mode==='test';message('');render();});
async function stop(){if(!online||stopPending)return;stopPending=true;routines.cancelVoice();render();
 try{if(demo){simRoutine=null;routineState=null;simFault=0;simRuns.fill(null);tickDemo();message('Preview: all outputs stopped and released.');}
 else{const s=await hub.command(2);message(s.reply===6?'All outputs OFF · all patterns stopped.':REPLIES[s.reply]||'Check hub status.');}}
 catch(e){message(e.message);}finally{stopPending=false;render();}
}
$('connect').addEventListener('click',async()=>{if(online){reconnector.suspend();hub.disconnect();return;}if(connecting)return;reconnector.cancel();reconnector.suspended=false;connecting=true;message('');render();try{await hub.connect();}catch(e){message(e.name==='NotFoundError'?'No hub selected. Turn on MeditationVest and try again.':e.message);}finally{connecting=false;render();}});
hub.addEventListener('ready',e=>{reconnector.remember(hub.device);routines.setDevice(e.detail.deviceId);online=true;demo=false;resetAnalog();info=e.detail.info;status=null;routineState=null;routines.cancelVoice();details.fill(null);baseline=null;history=[];pairChoices();setText('deviceName',e.detail.name);setText('connectionHint',`Firmware v${info.firmware} · ${info.routines?'Guided routines ready':'Open Device for existing controls; install v8 for routines'}`);render();});
hub.addEventListener('status',e=>telemetry(e.detail));
hub.addEventListener('analog',e=>analogTelemetry(e.detail));
hub.addEventListener('routine',e=>{routineState={...e.detail,received:performance.now()};render();});
hub.addEventListener('detail',e=>{details[e.detail.channel]={...e.detail,received:performance.now()};render();});
hub.addEventListener('error',e=>message(e.detail));
hub.addEventListener('disconnected',e=>{online=false;info=null;status=null;routineState=null;routines.cancelVoice();baseline=null;resetAnalog();details.fill(null);setText('deviceName','MeditationVest');setText('connectionHint','');message(e.detail);render();reconnector.schedule();});
document.addEventListener('click',e=>{if(e.target.closest('[data-stop]'))stop();});
$('zero').addEventListener('click',()=>{if(!usable()||!status.fresh||status.active||!validZero(status.raw))return;baseline=status.raw;history=[];message('Vented zero set. 100% is the digital clipping limit, not a pressure or inflation target.');render();});
$('clearZero').addEventListener('click',()=>{baseline=null;history=[];render();});
for(let i=0;i<2;i++)$(`link-${i}`).addEventListener('change',()=>{pairChannels[i]=Number($(`link-${i}`).value);render();});
$('linkToggle').addEventListener('click',()=>{if(pending||status?.routineKind||(online&&!usable())||(status?.active&pairMask())||pairChannels[0]===pairChannels[1])return;linked=!linked;message(linked?'Boards linked. Use the shared times below; both start and release together.':'Boards unlinked. Their individual settings are restored.');render();});
$('preview').addEventListener('click',()=>{
 if(demo){demo=false;online=false;resetAnalog();info=null;status=null;routineState=null;simRoutine=null;routines.cancelVoice();history=[];baseline=null;simRuns.fill(null);details.fill(null);message('');setText('deviceName','MeditationVest');setText('connectionHint','');render();return;}
 if(online||connecting)return;
 reconnector.suspend();simFault=0;demo=true;online=true;resetAnalog();info={mask:63,firmware:8,testControls:true,routines:true,analogChannels:CHANNELS,hxChannel:null};routineState=null;simRoutine=null;baseline=null;history=[];details.fill(null);simRuns.fill(null);pairChoices();setText('deviceName','MeditationVest');setText('connectionHint','Preview only. No Bluetooth commands are sent.');message('Preview mode · simulated readings and cycles.');tickDemo();
});
function tickDemo(){if(!demo)return;const now=performance.now(),phases=Array(6).fill(0);let active=0,simAnalog=null;
 if(simRoutine){const snapshot=simRoutine.tick(now);simRuns=snapshot.runs;simAnalog=snapshot.analogRaw;simFault=snapshot.fault;simFaultChannel=snapshot.faultChannel;routineState={...snapshot.routine,received:now};if(snapshot.complete)simRoutine=null;}
 for(let ch=0;ch<6;ch++){let r=simRuns[ch];if(!r)continue;
  if(r.routineOwned){phases[ch]=r.phase;active|=1<<ch;details[ch]={...r,received:now};continue;}
  if(r.phase===5){if(r.pumpOn&&now-r.pumpStarted>=2000)r.pumpOn=false;if(r.valveOn&&now-r.valveStarted>=10000)r.valveOn=false;if(!r.pumpOn&&!r.valveOn){simRuns[ch]=null;continue;}phases[ch]=5;active|=1<<ch;details[ch]={...r,received:now,remaining:0};continue;}
  let elapsed=now-r.start;const total=100+r.pump+r.hold;
  if(r.phase===4){if(elapsed>=r.release&&elapsed>0){r.phase=1;r.start=now;r.cycle++;elapsed=0;}}
  else if(elapsed>=total){if(r.repeats&&r.cycle>=r.repeats){simRuns[ch]=null;continue;}r.phase=4;r.start=now;elapsed=0;}
  else r.phase=elapsed<100?1:elapsed<100+r.pump?2:3;
  phases[ch]=r.phase;active|=1<<ch;const end=r.phase===4?r.release:r.phase===1?100:r.phase===2?100+r.pump:total;
  details[ch]={...r,received:now,remaining:Math.max(0,Math.ceil(end-elapsed))};
 }
 const r=simRuns[2],rise=r&&r.phase!==4?(r.phase===1?0:r.phase===2?Math.min(1,(now-r.start-100)/r.pump):1):0;
 const raw=Math.min(8388607,Math.round(1764600+Math.sin(now/950)*90+rise*6624100));
 const outputs=CHANNELS.map(ch=>({pump:phases[ch]===5?simRuns[ch].pumpOn:phases[ch]===2,valve:phases[ch]===5?simRuns[ch].valveOn:[1,2,3].includes(phases[ch])}));
 telemetry({kind:'summary',outputs,active,phases,flags:3,reply:0,seq:0,raw,age:20,fresh:true,routineKind:routineState?.routineKind??0,routineFault:simFault,routineFaultChannel:simFaultChannel});
 for(const ch of CHANNELS){
  const a=simRuns[ch],level=a?.phase===5?(a.pumpOn ? .5 : a.valveOn ? .2 : 0):a&&a.phase!==4?(a.phase===1?0:a.phase===2?Math.min(1,(now-a.start-100)/a.pump):1):0;
  const mv=simAnalog?Math.round(simAnalog[ch]/4095*3100):Math.round(200+level*2500+Math.sin(now/800+ch)*3);
  analogTelemetry({kind:'analog',channel:ch,flags:3,raw:simAnalog?.[ch]??Math.round(mv/3100*4095),millivolts:mv,age:20,fresh:true});
 }
}
function routineContext(){return {online,demo,info,fresh:usable(),pending,busy:Boolean(status?.active||status?.routineKind||pending||stopPending),routineKind:status?.routineKind??0,routineFault:status?.routineFault??0,routineFaultChannel:status?.routineFaultChannel??0,routine:routineState,routineFresh:Boolean(routineState&&performance.now()-routineState.received<1000&&routineState.routineKind===status?.routineKind),analogStates,now:performance.now()};}
async function startRoutine(plan){
 if(!usable()||!info?.routines||pending||stopPending||status.active||status.routineKind)return;
 pending=true;routines.armVoice();message('');render();
 try{
  if(demo){simFault=0;simRoutine=new RoutinePreview(plan,performance.now());tickDemo();message('Preview routine started · no hardware.');}
  else{const result=await hub.startRoutine(plan);if(result.reply!==1)throw Error(REPLIES[result.reply]||'Routine was not accepted.');message('Routine started.');}
 }catch(e){routines.cancelVoice();message(e.message);}finally{pending=false;render();}
}
const reconnector=new Reconnector({bluetooth:navigator.bluetooth,current:()=>hub.device,canAttempt:()=>!online&&!connecting&&!demo&&!document.hidden,connect:async device=>{connecting=true;render();try{await hub.connect(device);}finally{connecting=false;render();}},notice:hint=>setText('reconnect-hint',hint)});
$('auto-connect').checked=reconnector.enabled;$('auto-connect').addEventListener('change',()=>{reconnector.setEnabled($('auto-connect').checked);setText('reconnect-hint',reconnector.enabled?'Reconnection enabled for your selected hub. First use still needs Connect.':'Automatic reconnection is off.');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)reconnector.cancel();else reconnector.schedule(0);});
const routines=new RoutineUI({context:routineContext,start:startRoutine,changed:render});
resetAnalog();cards();render();
setInterval(()=>{if(demo)tickDemo();else{if(online&&received&&performance.now()-received>1500&&!staleShown){staleShown=true;routines.cancelVoice();message('Live status stopped arriving. New starts are disabled. Stop is still available; check its confirmation.');}render();}},100);

const tabNames=['routines','zones','sequences','device'];let currentTab='routines';const scrollPositions={};
function showTab(name){if(!tabNames.includes(name))return;scrollPositions[currentTab]=window.scrollY;currentTab=name;
 for(const tab of tabNames){const selected=tab===name;$(`page-${tab}`).hidden=!selected;$(`tab-${tab}`).setAttribute('aria-selected',String(selected));$(`tab-${tab}`).tabIndex=selected?0:-1;}
 window.scrollTo({top:scrollPositions[name]||0,behavior:'instant'});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-go-tab]');if(b)showTab(b.dataset.goTab);});
document.addEventListener('navigate',e=>showTab(e.detail));
document.querySelector('.bottom-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();let i=tabNames.indexOf(currentTab);i=e.key==='Home'?0:e.key==='End'?3:(i+(e.key==='ArrowRight'?1:3))%4;showTab(tabNames[i]);$(`tab-${tabNames[i]}`).focus();});
$('device-actions').append($('preview'));

reconnector.schedule(0);
