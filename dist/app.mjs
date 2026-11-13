import {HubBLE} from './ble.mjs?v=2';
import {PHASES,REPLIES} from './protocol.mjs?v=2';
import {sensorRange,validZero} from './sensor.mjs?v=2';
const $=id=>document.getElementById(id);
const setText=(id,value)=>{const el=$(id);if(el.textContent!==value)el.textContent=value;};
const hub=new HubBLE();
const positions=['Upper left','Lower left · sensorless','Bottom left · with sensor','Bottom right','Lower right','Upper right'];
const defaults=()=>({pump:1000,hold:1000,release:1000,count:3,mode:'count'});
let settings=Array.from({length:6},defaults),pair=defaults();
function clean(x){const d=defaults();for(const [k,min,max]of [['pump',50,2000],['hold',0,10000],['release',0,10000],['count',1,999]])if(Number.isInteger(x?.[k])&&x[k]>=min&&x[k]<=max)d[k]=x[k];d.mode=x?.mode==='forever'?'forever':'count';return d;}
try{const v=JSON.parse(localStorage.getItem('inflate.patterns.v2'));if(v?.channels?.length===6){settings=v.channels.map(clean);pair=clean(v.pair);}else{const old=JSON.parse(localStorage.getItem('inflate.times.v1'));if(old?.length===6)settings=old.map(clean);}}catch{}
let online=false,connecting=false,demo=false,pending=false,stopPending=false,info=null,status=null,received=0,baseline=null,history=[],lastHistory=0,staleShown=false;
let linked=false,pairChannels=[1,2],details=Array(6).fill(null),simRuns=Array(6).fill(null);
const number=new Intl.NumberFormat('en-US');
const maskOf=chs=>chs.reduce((m,ch)=>m|(1<<ch),0);
const pairMask=()=>maskOf(pairChannels);
const enabledMask=()=>info?.mask??6;
function message(text){setText('message',text);$('message').hidden=!text;}
function fields(id,t){return `<div class="timings"><div class="timing"><label for="pump-${id}">Pump time</label><div class="number-field"><input id="pump-${id}" type="number" required inputmode="decimal" min="0.05" max="2" step="0.05" value="${t.pump/1000}"><span>s</span></div><small>0.05–2 seconds</small></div><div class="timing"><label for="hold-${id}">Hold before release</label><div class="number-field"><input id="hold-${id}" type="number" required inputmode="decimal" min="0" max="10" step="0.1" value="${t.hold/1000}"><span>s</span></div><small>0–10 seconds</small></div></div><button class="run" id="run-${id}" disabled>Run once</button><details class="pattern-settings" id="pattern-${id}"><summary>Repeat pattern <span aria-hidden="true">＋</span></summary><div class="timings"><div class="timing"><label for="release-${id}">Released between cycles</label><div class="number-field"><input id="release-${id}" type="number" required inputmode="decimal" min="0" max="10" step="0.1" value="${t.release/1000}"><span>s</span></div><small>0–10 seconds · valve off</small></div><div class="timing"><label for="mode-${id}">Repeat</label><select id="mode-${id}"><option value="count" ${t.mode==='count'?'selected':''}>Set count</option><option value="forever" ${t.mode==='forever'?'selected':''}>Until Stop</option></select><div id="count-field-${id}" class="count-field"><label for="count-${id}">Total cycles</label><div class="number-field"><input id="count-${id}" type="number" required inputmode="numeric" min="1" max="999" step="1" value="${t.count}"></div></div></div></div><p class="footnote" id="repeat-note-${id}"></p><button class="run pattern-run" id="repeat-${id}" disabled>Start pattern</button></details>`;}
function bindFields(id){for(const key of ['pump','hold','release','count','mode'])$(`${key}-${id}`).addEventListener('change',()=>{saveTimes(id);render();});$(`run-${id}`).addEventListener('click',()=>run(id,false));$(`repeat-${id}`).addEventListener('click',()=>run(id,true));}
function cards(){for(let ch=0;ch<6;ch++){
 const node=document.createElement('article');node.className='channel';node.id=`channel-${ch}`;
 node.innerHTML=`<div class="channel-header"><span class="channel-number">${String(ch).padStart(2,'0')}</span><div class="channel-title"><h3>Channel ${ch}</h3><p>${positions[ch]}</p></div><span class="phase-label" id="phase-${ch}">Ready</span></div><p id="cycle-${ch}" class="cycle-note"></p><p class="linked-note" id="linked-${ch}" hidden>Linked · use the shared controls above</p><div id="fields-${ch}">${fields(ch,settings[ch])}</div><div class="timeline" aria-hidden="true"><span id="progress-${ch}"></span></div>`;
 $(enabledMask()&(1<<ch)?'channelCards':'futureCards').append(node);bindFields(ch);
 }
 $('pairFields').innerHTML=fields('pair',pair);bindFields('pair');pairChoices();
}
function pairChoices(){const enabled=Array.from({length:6},(_,ch)=>ch).filter(ch=>enabledMask()&(1<<ch));if(!pairChannels.every(ch=>enabled.includes(ch)))pairChannels=enabled.slice(0,2);
 for(let i=0;i<2;i++){$(`link-${i}`).innerHTML=enabled.map(ch=>`<option value="${ch}">CH${ch}</option>`).join('');$(`link-${i}`).value=pairChannels[i]??'';}
 $('linkPanel').hidden=enabled.length<2;
}
function saveTimes(id){const t=id==='pair'?pair:settings[id];for(const key of ['pump','hold','release','count']){const el=$(`${key}-${id}`);if(el.value!==''&&el.checkValidity())t[key]=key==='count'?Number(el.value):Math.round(Number(el.value)*1000);}t.mode=$(`mode-${id}`).value;try{localStorage.setItem('inflate.patterns.v2',JSON.stringify({channels:settings,pair}));}catch{}}
function usable(){return online&&status&&performance.now()-received<1000;}
function telemetry(s){status=s;received=performance.now();staleShown=false;
 if(s.fresh&&received-lastHistory>=80){history.push({t:received,y:s.raw});lastHistory=received;}
 history=history.filter(p=>received-p.t<30000);render();
}
function renderFields(id,locked,canRun){const t=id==='pair'?pair:settings[id];for(const key of ['pump','hold','release','count','mode'])$(`${key}-${id}`).disabled=locked;
 $(`run-${id}`).disabled=!canRun;$(`repeat-${id}`).disabled=!canRun;
 $(`count-field-${id}`).hidden=t.mode==='forever';
 setText(`repeat-note-${id}`,t.mode==='forever'?'Repeats until Stop. If Bluetooth disconnects, finishes the current cycle and releases.':`${t.count} total cycles. After the last hold, releases and is ready immediately.`);
}
function render(){
 const fresh=usable(),active=fresh?status.active:0;
 setText('connectionState',demo?'PREVIEW · NO HARDWARE':online?'BLUETOOTH CONNECTED':connecting?'CONNECTING':'NOT CONNECTED');
 const remaining=6-Array.from({length:6},(_,ch)=>Boolean(enabledMask()&(1<<ch))).filter(Boolean).length;
 setText('futureTitle',`${remaining} more channels`);$('futureSection').hidden=remaining===0;
 $('connectionDot').className=`dot ${demo?'demo':online?'online':''}`;
 $('connect').disabled=connecting||demo;setText('connect',online&&!demo?'Disconnect ↗':'Connect hub ↗');setText('preview',demo?'Exit preview':'Try the interface');$('preview').hidden=online&&!demo;
 $('stop').disabled=!online||stopPending;
 let runLabel=online?(fresh?(active?Array.from({length:6},(_,ch)=>active&(1<<ch)?`CH${ch} ${PHASES[status.phases[ch]].toLowerCase()}`:null).filter(Boolean).join(' · '):'Ready to run'):'Waiting for live hub status'):'Connect to start';
 if(pending)runLabel='Waiting for hub confirmation…';if(stopPending)runLabel='Sending stop…';setText('runState',demo?'PREVIEW · '+runLabel:runLabel);
 const pairBusy=Boolean(active&pairMask()),pairUnknown=online&&!fresh;
 setText('linkToggle',linked?'Unlink boards':'Link boards');$('linkToggle').setAttribute('aria-pressed',String(linked));$('linkToggle').disabled=pairBusy||pairUnknown||pending||pairChannels[0]===pairChannels[1];
 for(let i=0;i<2;i++)$(`link-${i}`).disabled=linked||pairBusy||pairUnknown||pending;
 $('pairControls').hidden=!linked;setText('pairTitle',`CH${pairChannels[0]} + CH${pairChannels[1]}`);
 renderFields('pair',!linked||pairBusy||pending||stopPending,linked&&fresh&&!pairBusy&&!pending&&!stopPending);
 for(let ch=0;ch<6;ch++){
  const enabled=Boolean(enabledMask()&(1<<ch)),isLinked=linked&&pairChannels.includes(ch),thisActive=Boolean(active&(1<<ch));
  const parent=$(enabled?'channelCards':'futureCards');if($(`channel-${ch}`).parentElement!==parent)parent.append($(`channel-${ch}`));
  $(`fields-${ch}`).hidden=isLinked||!enabled;$(`linked-${ch}`).hidden=!isLinked;
  $(`channel-${ch}`).classList.toggle('active',thisActive);
  setText(`phase-${ch}`,!enabled?'Not enabled':!online?'Disconnected':!fresh?'Unknown':thisActive?PHASES[status.phases[ch]]:'Ready');
  renderFields(ch,!enabled||isLinked||thisActive||pending||stopPending,enabled&&!isLinked&&fresh&&!thisActive&&!pending&&!stopPending);
  const d=details[ch],detailFresh=d&&performance.now()-d.received<1000&&d.phase===status?.phases[ch];
  setText(`cycle-${ch}`,thisActive&&detailFresh?`Cycle ${d.cycle}${d.repeats?` of ${d.repeats}`:' · until Stop'}${(d.group&(d.group-1))?' · linked':''}`:'');
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
 drawChart();
}
function drawChart(){const now=performance.now(),pts=baseline===null?[]:history.filter(p=>now-p.t<=30000);$('chartEmpty').style.display=pts.length>1?'none':'';setText('chartEmpty',baseline===null?'Set vented zero to start the chart':'Live readings appear here');
 if(pts.length<2){$('chartLine').setAttribute('d','');$('chartArea').setAttribute('d','');return;}
 let path='',area='',segment=[];const finish=()=>{if(!segment.length)return;path+=segment.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');area+=`M${segment[0][0].toFixed(1)},104 `+segment.map(p=>`L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')+` L${segment.at(-1)[0].toFixed(1)},104Z `;segment=[];};
 pts.forEach((p,i)=>{if(i&&p.t-pts[i-1].t>600)finish();segment.push([32+328*(1-(now-p.t)/30000),104-sensorRange(p.y,baseline).percent*.96]);});finish();$('chartLine').setAttribute('d',path);$('chartArea').setAttribute('d',area);
}
async function run(id,repeat){
 const mask=id==='pair'?pairMask():1<<id;
 if(!usable()||pending||stopPending||(status.active&mask))return;
 if(id==='pair'&&!linked)return;
 const keys=repeat?['pump','hold','release',...($(`mode-${id}`).value==='count'?['count']:[])]:['pump','hold'];
 for(const key of keys)if(!$(`${key}-${id}`).reportValidity())return;
 saveTimes(id);const t=id==='pair'?pair:settings[id],count=repeat?(t.mode==='forever'?0:t.count):1;
 pending=true;message('');render();
 try{if(demo){const now=performance.now();for(let ch=0;ch<6;ch++)if(mask&(1<<ch))simRuns[ch]={...t,repeats:count,cycle:1,phase:1,start:now,group:mask};tickDemo();message(`Preview: ${repeat?'pattern':'single cycle'} started.`);}
 else{const s=await hub.command(1,mask,t.pump,t.hold,repeat?t.release:0,count);message(REPLIES[s.reply]||'Hub replied.');}}
 catch(e){message(e.message);}finally{pending=false;render();}
}
async function stop(){if(!online||stopPending)return;stopPending=true;render();
 try{if(demo){simRuns.fill(null);tickDemo();message('Preview: all patterns stopped and released.');}
 else{const s=await hub.command(2);message(s.reply===6?'All outputs OFF · all patterns stopped.':REPLIES[s.reply]||'Check hub status.');}}
 catch(e){message(e.message);}finally{stopPending=false;render();}
}
$('connect').addEventListener('click',async()=>{if(online){hub.disconnect();return;}if(connecting)return;connecting=true;message('');render();try{await hub.connect();}catch(e){message(e.name==='NotFoundError'?'No hub selected. Turn on MeditationVest and try again.':e.message);}finally{connecting=false;render();}});
hub.addEventListener('ready',e=>{online=true;demo=false;info=e.detail.info;status=null;details.fill(null);baseline=null;history=[];pairChoices();setText('deviceName',e.detail.name);setText('connectionHint','Timings and patterns run on the ESP32.');render();});
hub.addEventListener('status',e=>telemetry(e.detail));
hub.addEventListener('detail',e=>{details[e.detail.channel]={...e.detail,received:performance.now()};render();});
hub.addEventListener('error',e=>message(e.detail));
hub.addEventListener('disconnected',e=>{online=false;info=null;status=null;baseline=null;details.fill(null);setText('deviceName','MeditationVest');setText('connectionHint','Open in Bluefy on your iPhone.');message(e.detail);render();});
$('stop').addEventListener('click',stop);
$('zero').addEventListener('click',()=>{if(!usable()||!status.fresh||status.active||!validZero(status.raw))return;baseline=status.raw;history=[];message('Vented zero set. 100% is the digital clipping limit, not a pressure or inflation target.');render();});
$('clearZero').addEventListener('click',()=>{baseline=null;history=[];render();});
for(let i=0;i<2;i++)$(`link-${i}`).addEventListener('change',()=>{pairChannels[i]=Number($(`link-${i}`).value);render();});
$('linkToggle').addEventListener('click',()=>{if(pending||(online&&!usable())||(status?.active&pairMask())||pairChannels[0]===pairChannels[1])return;linked=!linked;message(linked?'Boards linked. Use the shared times below; both start and release together.':'Boards unlinked. Their individual settings are restored.');render();});
$('preview').addEventListener('click',()=>{
 if(demo){demo=false;online=false;info=null;status=null;history=[];baseline=null;simRuns.fill(null);details.fill(null);message('');setText('deviceName','MeditationVest');setText('connectionHint','Open in Bluefy on your iPhone.');render();return;}
 if(online||connecting)return;
 demo=true;online=true;info={mask:6};baseline=null;history=[];details.fill(null);simRuns.fill(null);pairChoices();setText('deviceName','Explore the controls.');setText('connectionHint','Preview only. No Bluetooth commands are sent.');message('Preview mode · simulated readings and cycles.');tickDemo();
});
function tickDemo(){if(!demo)return;const now=performance.now(),phases=Array(6).fill(0);let active=0;
 for(let ch=0;ch<6;ch++){let r=simRuns[ch];if(!r)continue;let elapsed=now-r.start;const total=100+r.pump+r.hold;
  if(r.phase===4){if(elapsed>=r.release&&elapsed>0){r.phase=1;r.start=now;r.cycle++;elapsed=0;}}
  else if(elapsed>=total){if(r.repeats&&r.cycle>=r.repeats){simRuns[ch]=null;continue;}r.phase=4;r.start=now;elapsed=0;}
  else r.phase=elapsed<100?1:elapsed<100+r.pump?2:3;
  phases[ch]=r.phase;active|=1<<ch;const end=r.phase===4?r.release:r.phase===1?100:r.phase===2?100+r.pump:total;
  details[ch]={...r,received:now,remaining:Math.max(0,Math.ceil(end-elapsed))};
 }
 const r=simRuns[2],rise=r&&r.phase!==4?(r.phase===1?0:r.phase===2?Math.min(1,(now-r.start-100)/r.pump):1):0;
 const raw=Math.min(8388607,Math.round(1764600+Math.sin(now/950)*90+rise*6624100));
 telemetry({kind:'summary',active,phases,flags:3,reply:0,seq:0,raw,age:20,fresh:true});
}
cards();render();
setInterval(()=>{if(demo)tickDemo();else{if(online&&received&&performance.now()-received>1500&&!staleShown){staleShown=true;message('Live status stopped arriving. New starts are disabled. Stop is still available; check its confirmation.');}render();}},100);
