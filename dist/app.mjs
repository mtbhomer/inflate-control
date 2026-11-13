import {HubBLE} from './ble.mjs';
import {PHASES,REPLIES} from './protocol.mjs';
const $=id=>document.getElementById(id);
const setText=(id,value)=>{const el=$(id);if(el.textContent!==value)el.textContent=value;};
const hub=new HubBLE();
const positions=['Upper left','Lower left · sensorless','Bottom left · with sensor','Bottom right','Lower right','Upper right'];
const defaults=()=>Array.from({length:6},()=>({pump:1000,hold:1000}));
let settings=defaults();try{const v=JSON.parse(localStorage.getItem('inflate.times.v1'));if(Array.isArray(v)&&v.length===6)settings=v.map(x=>({pump:Number.isInteger(x.pump)&&x.pump>=50&&x.pump<=2000?x.pump:1000,hold:Number.isInteger(x.hold)&&x.hold>=0&&x.hold<=10000?x.hold:1000}));}catch{}
let online=false,connecting=false,demo=false,pending=false,stopPending=false,info=null,status=null,received=0,baseline=null,history=[],lastHistory=0,cycle=null,ventUntil=0,staleShown=false;
const number=new Intl.NumberFormat('en-US'),signed=new Intl.NumberFormat('en-US',{signDisplay:'always'});
function message(text){setText('message',text);$('message').hidden=!text;}
function cards(){for(let ch=0;ch<6;ch++){
 const wired=ch===1||ch===2;
 const node=document.createElement('article');node.className='channel';node.id=`channel-${ch}`;
 node.innerHTML=`<div class="channel-header"><span class="channel-number">${ch.toString().padStart(2,'0')}</span><div class="channel-title"><h3>Channel ${ch}</h3><p>${positions[ch]}</p></div><span class="phase-label" id="phase-${ch}">${wired?'Ready':'Not wired'}</span></div><div class="timings"><div class="timing"><label for="pump-${ch}">Pump time</label><div class="number-field"><input id="pump-${ch}" type="number" inputmode="decimal" min="0.05" max="2" step="0.05" value="${settings[ch].pump/1000}" ${wired?'':'disabled'} aria-label="Channel ${ch} pump time in seconds"><span>s</span></div><small>0.05–2 seconds</small></div><div class="timing"><label for="hold-${ch}">Hold before release</label><div class="number-field"><input id="hold-${ch}" type="number" inputmode="decimal" min="0" max="10" step="0.1" value="${settings[ch].hold/1000}" ${wired?'':'disabled'} aria-label="Channel ${ch} hold time in seconds"><span>s</span></div><small>0–10 seconds</small></div></div>${`<button class="run" id="run-${ch}" disabled><span aria-hidden="true">▷</span> Run cycle</button><div class="timeline" aria-hidden="true"><span id="progress-${ch}"></span></div>`}`;
 $(wired?'channelCards':'futureCards').append(node);
 $(`run-${ch}`).addEventListener('click',()=>run(ch));for(const key of ['pump','hold'])$(`${key}-${ch}`).addEventListener('change',()=>saveTimes(ch));
}}
function saveTimes(ch){const p=$(`pump-${ch}`),h=$(`hold-${ch}`);if(p.checkValidity()&&h.checkValidity()){settings[ch]={pump:Math.round(Number(p.value)*1000),hold:Math.round(Number(h.value)*1000)};try{localStorage.setItem('inflate.times.v1',JSON.stringify(settings));}catch{}}}
function telemetry(s){status=s;received=performance.now();staleShown=false;
 if(s.fresh&&received-lastHistory>=80){history.push({t:received,y:s.raw});lastHistory=received;}
 history=history.filter(p=>received-p.t<30000);render();}
function usable(){return online&&status&&performance.now()-received<1000;}
function render(){
 const fresh=usable(),active=fresh&&status.phase!==0,vent=fresh&&status.ventRemaining>0;
 setText('connectionState',demo?'PREVIEW · NO HARDWARE':online?'BLUETOOTH CONNECTED':connecting?'CONNECTING':'NOT CONNECTED');
 const remaining=6-Array.from({length:6},(_,ch)=>Boolean((info?.mask??6)&(1<<ch))).filter(Boolean).length;
 setText('futureTitle',`${remaining} more channels`);$('futureSection').hidden=remaining===0;
 $('connectionDot').className=`dot ${demo?'demo':online?'online':''}`;
 $('connect').disabled=connecting||demo;const connectLabel=online&&!demo?'Disconnect <span aria-hidden="true">↗</span>':'Connect hub <span aria-hidden="true">↗</span>';if($('connect').innerHTML!==connectLabel)$('connect').innerHTML=connectLabel;
 setText('preview',demo?'Exit preview':'Try the interface');$('preview').hidden=online&&!demo;
 $('stop').disabled=!online||stopPending;
 let runLabel=online?(fresh?(active?`CH${status.channel} · ${PHASES[status.phase]} · ${(status.remaining/1000).toFixed(1)} s`:vent?`Venting · ${(status.ventRemaining/1000).toFixed(1)} s`:'Ready for a cycle'):'Waiting for live hub status'):'Connect to start';
 if(pending)runLabel='Waiting for hub confirmation…';if(stopPending)runLabel='Sending stop…';
 setText('runState',demo?'PREVIEW · '+runLabel:runLabel);
 for(let ch=0;ch<6;ch++){
  const enabled=Boolean((info?.mask??6)&(1<<ch));
  const parent=$(enabled?'channelCards':'futureCards');if($(`channel-${ch}`).parentElement!==parent)parent.append($(`channel-${ch}`));
  $(`run-${ch}`).hidden=!enabled;
  const thisActive=active&&status.channel===ch;
  $(`channel-${ch}`).classList.toggle('active',thisActive);
  setText(`phase-${ch}`,!enabled?'Not enabled':thisActive?PHASES[status.phase]:!online?'Disconnected':!fresh?'Unknown':active?'Waiting':'Ready');
  $(`run-${ch}`).disabled=!fresh||!enabled||active||vent||pending||stopPending;
  for(const key of ['pump','hold'])$(`${key}-${ch}`).disabled=!enabled||thisActive||pending;
  const duration=thisActive?(status.phase===1?100:status.phase===2?settings[ch].pump:settings[ch].hold):1;
  $(`progress-${ch}`).style.width=thisActive?`${Math.max(0,Math.min(100,(1-status.remaining/Math.max(1,duration))*100))}%`:'0%';
 }
 const sensorFresh=fresh&&status.fresh&&performance.now()-received+status.age<500;
 setText('sensorValue',sensorFresh?(baseline===null?number.format(status.raw):signed.format(status.raw-baseline)):'—');
 setText('sensorUnit',baseline===null?'raw sensor counts':'counts above vented zero');
 setText('sensorState',!online?'Waiting for hub':!fresh?'Connection stale':status.flags&4?'Frame error':!(status.flags&1)?'No data':!sensorFresh?'Stale':status.flags&8?'At sensor limit':demo?'Preview signal':'Live');
 setText('sampleAge',sensorFresh?`${Math.round(status.age)} ms · CH2 only`:'Uncalibrated · sensor only');
 setText('rawValue',baseline!==null&&sensorFresh?`Raw ${number.format(status.raw)}`:'');
 $('zero').disabled=!sensorFresh||active||vent;$('clearZero').hidden=baseline===null;
 drawChart();
}
function drawChart(){const now=performance.now(),pts=history.filter(p=>now-p.t<=30000);$('chartEmpty').style.display=pts.length>1?'none':'';
 if(pts.length<2){$('chartLine').setAttribute('d','');$('chartArea').setAttribute('d','');return;}
 const values=pts.map(p=>p.y-(baseline??0));let min=Math.min(...values),max=Math.max(...values);const pad=Math.max(10,(max-min)*.15);min-=pad;max+=pad;
 let path='',area='',segment=[];const finish=()=>{if(!segment.length)return;path+=segment.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');area+=`M${segment[0][0].toFixed(1)},112 `+segment.map(p=>`L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')+` L${segment.at(-1)[0].toFixed(1)},112Z `;segment=[];};
 pts.forEach((p,i)=>{if(i&&p.t-pts[i-1].t>600)finish();segment.push([360*(1-(now-p.t)/30000),104-(values[i]-min)/(max-min)*96]);});finish();$('chartLine').setAttribute('d',path);$('chartArea').setAttribute('d',area);
}
async function run(ch){
 if(!usable()||pending||status.phase!==0||status.ventRemaining)return;
 if(!$(`pump-${ch}`).reportValidity()||!$(`hold-${ch}`).reportValidity())return;
 saveTimes(ch);const t=settings[ch];pending=true;message('');render();
 try{if(demo){cycle={ch,start:performance.now(),pump:t.pump,hold:t.hold};message(`Preview: CH${ch} cycle started.`);}
 else{const s=await hub.command(1,ch,t.pump,t.hold);message(REPLIES[s.reply]||'Hub replied.');}}
 catch(e){message(e.message);}finally{pending=false;render();}
}
async function stop(){if(!online||stopPending)return;stopPending=true;render();
 try{if(demo){cycle=null;ventUntil=performance.now()+2000;message('Preview: release requested.');}
 else{const s=await hub.command(2);message(s.reply===6?'All outputs OFF · release requested.':REPLIES[s.reply]||'Check hub status.');}}
 catch(e){message(e.message);}finally{stopPending=false;render();}
}
$('connect').addEventListener('click',async()=>{
 if(online){hub.disconnect();return;}if(connecting)return;
 connecting=true;message('');render();
 try{await hub.connect();}catch(e){message(e.name==='NotFoundError'?'No hub selected. Turn on InflateHub and try again.':e.message);}
 finally{connecting=false;render();}
});
hub.addEventListener('ready',e=>{online=true;demo=false;info=e.detail.info;baseline=null;history=[];setText('deviceName',e.detail.name);setText('connectionHint','CH1 + CH2 · timings run on the ESP32');render();});
hub.addEventListener('status',e=>telemetry(e.detail));
hub.addEventListener('error',e=>message(e.detail));
hub.addEventListener('disconnected',e=>{online=false;info=null;status=null;baseline=null;setText('deviceName','Your hub, at hand.');setText('connectionHint','Open in Bluefy on your iPhone.');message(e.detail);render();});
$('stop').addEventListener('click',stop);
$('zero').addEventListener('click',()=>{if(!usable()||!status.fresh||status.phase!==0||status.ventRemaining)return;baseline=status.raw;message('Vented zero set for this connection. Timing is unchanged.');render();});
$('clearZero').addEventListener('click',()=>{baseline=null;render();});
$('preview').addEventListener('click',()=>{
 if(demo){demo=false;online=false;info=null;status=null;history=[];baseline=null;cycle=null;message('');setText('deviceName','Your hub, at hand.');setText('connectionHint','Open in Bluefy on your iPhone.');render();return;}
 if(online||connecting)return;
 demo=true;online=true;info={mask:6};baseline=null;history=[];cycle=null;ventUntil=0;setText('deviceName','Explore the controls.');setText('connectionHint','Preview only. No Bluetooth commands are sent.');message('Preview mode · simulated readings and cycles.');tickDemo();
});
function tickDemo(){if(!demo)return;const now=performance.now();let phase=0,ch=255,remaining=0;
 if(cycle){const elapsed=now-cycle.start,total=100+cycle.pump+cycle.hold;if(elapsed>=total){cycle=null;ventUntil=now+2000;}else{ch=cycle.ch;phase=elapsed<100?1:elapsed<100+cycle.pump?2:3;remaining=Math.ceil((phase===1?100:phase===2?100+cycle.pump:total)-elapsed);}}
 const raw=Math.round(1764600+Math.sin(now/950)*90+(ch===2?Math.min(10000,(now-cycle.start)*7):0));
 telemetry({phase,channel:ch,mask:6,pumpMask:phase===2?1<<ch:0,valveMask:phase?1<<ch:0,flags:3,reply:0,seq:0,raw,age:20,fresh:true,remaining,ventRemaining:Math.max(0,Math.ceil(ventUntil-now))});
}
cards();render();
setInterval(()=>{if(demo)tickDemo();else{if(online&&received&&performance.now()-received>1500&&!staleShown){staleShown=true;message('Live status stopped arriving. New cycles are disabled; accepted cycles still finish on the hub.');}render();}},100);
