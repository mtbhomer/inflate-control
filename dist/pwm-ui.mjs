import {sensorPercent} from './sensor-profile.mjs?v=12';
import {analogReading} from './sensor.mjs?v=12';
import {PWM_RESULTS,pwmMeasurement,pwmAllowed,pwmReportText} from './pwm-test.mjs?v=12';
const $=id=>document.getElementById(id),set=(id,v)=>{if($(id).textContent!==v)$(id).textContent=v;};
const fmt=n=>n===null?'—':n.toFixed(2);
const STORE='inflate.pwm-results.v1';
export class PwmUI{
 constructor({context,start}){
  this.context=context;this.start=start;this.channel=0;this.duty=100;this.duration=1000;this.records={};this.current=null;this.previewRows=[];this.historyKey='';
  try{const stored=JSON.parse(localStorage.getItem(STORE));if(stored&&typeof stored==='object'&&!Array.isArray(stored))for(const [key,rows]of Object.entries(stored)){if(Array.isArray(rows))this.records[key]=rows.filter(r=>Number.isInteger(r.channel)&&r.channel>=0&&r.channel<6&&[250,500,1000].includes(r.duration)&&Number.isFinite(r.duty)).slice(-30).map(r=>({...r,notes:String(r.notes||'').slice(0,1000),observation:String(r.observation||'').slice(0,100)}));}}catch{}
  $('pwm-tests').innerHTML=`<summary><span>Pump speed test</span><span class="quiet">PWM · compare inflation</span></summary><div class="pwm-body"><p class="footnote">Use the same airbag and tubing. Fully release before each run and compare similar starting readings. Begin at 100%, then try 80%, 60%, 40% and 25%.</p><p class="footnote">Check the pump’s flyback diode is fitted before PWM testing. Stop if it stalls or stutters; do not repeat a stalled setting.</p><div class="pwm-fields"><label>Channel<select id="pwm-channel" aria-label="PWM test channel"></select></label><label>Pump duty<select id="pwm-duty">${[100,80,60,40,25].map(d=>`<option value="${d}">${d}%</option>`).join('')}</select></label><label>Pump time<select id="pwm-duration"><option value="1000">1 second</option><option value="500">0.5 seconds</option><option value="250">0.25 seconds</option></select></label></div><div class="pwm-live"><span>Sensor <strong id="pwm-live">—</strong></span><span id="pwm-maximum">Set maximum in Sensor setup</span></div><p id="pwm-hint" class="footnote" role="status"></p><div class="pwm-actions"><button id="pwm-run" class="run" disabled>Test 100% for 1 s</button><button class="stop-control" data-stop disabled>Stop & release</button></div><p id="pwm-state" class="footnote" role="status"></p><p class="footnote">100 Hz · valve selects, pump runs, hold 0.2 s for the final reading, then release. Stops pumping early at the saved maximum. Duty is an electrical setting; the sensor measures inflation rate, not motor RPM.</p><div class="section-top"><h3>Comparison results</h3><button id="pwm-copy" class="text-button" disabled>Copy results</button></div><p id="pwm-empty" class="footnote">Run a test to compare sensor rise and record what you hear and feel.</p><div id="pwm-results"></div><label id="pwm-export-label" class="routine-field" hidden><span id="pwm-copy-status">Results to share</span><textarea id="pwm-export" readonly rows="8" aria-label="PWM comparison report"></textarea></label></div>`;
  for(const [id,key]of [['pwm-channel','channel'],['pwm-duty','duty'],['pwm-duration','duration']])$(id).addEventListener('change',()=>{if(this.current)return;this[key]=Number($(id).value);this.render();});
  $('pwm-run').addEventListener('click',()=>{if(!this.allowed())return;this.start({channel:this.channel,duty:this.duty,duration:this.duration,maximum:this.context().maximums[this.channel]?.maximum});});
  $('pwm-results').addEventListener('input',e=>{const id=e.target.dataset.record,field=e.target.dataset.field;if(!id||!['observation','notes'].includes(field))return;const row=this.rows().find(r=>r.id===id);if(row){row[field]=e.target.value.slice(0,1000);this.save();}});
  $('pwm-copy').addEventListener('click',async()=>{const report=pwmReportText(this.visibleRows());$('pwm-export').value=report;$('pwm-export-label').hidden=false;try{await navigator.clipboard.writeText(report);set('pwm-copy-status','Copied · paste these results into the chat');}catch{set('pwm-copy-status','Select and copy these results');$('pwm-export').focus();$('pwm-export').select();}});
 }
 rows(){const c=this.context();return c.demo?this.previewRows:(this.records[c.deviceId]??[]);}
 visibleRows(){const mask=this.context().enabledMask;return this.rows().filter(r=>mask&(1<<r.channel));}
 reading(){const c=this.context(),a=c.analogStates[this.channel];return c.fresh?analogReading(a?.sample,c.now-(a?.received??0)):null;}
 allowed(){const c=this.context();return !this.current&&pwmAllowed(c,this.channel,c.maximums[this.channel]?.maximum,this.reading());}
 begin(config,seq,session){const c=this.context();this.current={...config,seq,session,preview:c.demo,deviceId:c.deviceId,firmware:c.info.firmware,id:`${Date.now()}-${seq}`,at:new Date().toISOString(),result:1,startMv:65535,endMv:65535,samples:0,actualMs:0,started:c.now};this.historyKey='';this.render();}
 receive(report){const r=this.current;if(!r||report.seq!==r.seq||report.session!==r.session||report.channel!==r.channel||report.duty!==r.duty||report.duration!==r.duration)return;Object.assign(r,report);if(report.result>=4)this.finish();this.render();}
 uncertain(reason){if(!this.current)return;this.current.outcome=reason;this.current.result=0;this.current.actualMs=null;this.finish();this.render();}
 finish(){const r=this.current;if(!r)return;this.current=null;const rows=r.preview?this.previewRows:(this.records[r.deviceId]??=[]);rows.push(r);if(rows.length>30)rows.shift();this.historyKey='';this.save();}
 save(){try{localStorage.setItem(STORE,JSON.stringify(this.records));}catch{set('pwm-state','Browser storage unavailable; copy the results before closing.');}}
 render(){
  const c=this.context(),channels=Array.from({length:6},(_,ch)=>ch).filter(ch=>c.enabledMask&(1<<ch));
  const key=channels.join(',');if(this.channelKey!==key){this.channelKey=key;$('pwm-channel').replaceChildren(...channels.map(ch=>new Option(`CH${ch}`,ch)));if(!channels.includes(this.channel))this.channel=channels[0]??0;$('pwm-channel').value=this.channel;}
  if(this.current&&c.now-this.current.started>6000)this.uncertain('Final report not received; result unconfirmed');
  const busy=c.busy||Boolean(this.current);for(const id of ['pwm-channel','pwm-duty','pwm-duration'])$(id).disabled=busy||!channels.length;
  const reading=this.reading(),a=c.analogStates[this.channel],pct=reading?sensorPercent(a.sample.millivolts):null,maximum=c.maximums[this.channel]?.maximum;
  set('pwm-live',pct===null?'—':`${pct.toFixed(2)}% · ${(a.sample.millivolts/1000).toFixed(3)} V`);
  set('pwm-maximum',Number.isFinite(maximum)?`Maximum ${maximum}%`:'Set maximum in Sensor setup');
  set('pwm-hint',!c.online?'Connect your hub to test.':!c.info?.pwmTests?'Install firmware v11 for PWM testing.':!channels.length?'Enable a channel above.':!c.fresh?'Waiting for live hub status.':!Number.isFinite(maximum)?'Save this channel’s maximum in Sensor setup first.':!reading||reading.low||reading.high?'A fresh sensor reading away from ADC endpoints is required.':c.demo?'Preview only · simulated rates, no hardware.':'Fully vent the airbag before starting the next comparison.');
  set('pwm-run',`Test ${this.duty}% for ${this.duration/1000} s`);$('pwm-run').disabled=!this.allowed();
  set('pwm-state',this.current?`${this.current.preview?'PREVIEW · ':''}CH${this.current.channel} · ${PWM_RESULTS[this.current.result]}${c.fresh?'':' · waiting for status'}`:'');
  const rows=this.visibleRows();$('pwm-copy').disabled=!rows.length;$('pwm-empty').hidden=Boolean(rows.length);
  const historyKey=`${c.demo?'preview':c.deviceId}:${c.enabledMask}:${rows.map(r=>r.id).join(',')}`;
  if(this.historyKey!==historyKey){this.historyKey=historyKey;$('pwm-export-label').hidden=true;$('pwm-results').replaceChildren();for(const r of [...rows].reverse()){
   const m=pwmMeasurement(r),el=document.createElement('article');el.className='pwm-result';
   el.innerHTML='<div class="section-top"><b></b><span class="quiet"></span></div><p class="pwm-outcome"></p><div class="pwm-metrics"><span class="pwm-endpoints"></span><strong></strong></div><p class="footnote pwm-samples"></p><label>Observed start<select><option value="">Not recorded</option><option>Starts smoothly</option><option>Stutters</option><option>Does not start</option><option>Other</option></select></label><label>Sound, airflow or other notes<input type="text" maxlength="1000" placeholder="What did you notice?"></label>';
   el.querySelector('b').textContent=`${r.preview?'Preview · ':''}CH${r.channel} · ${r.duty}% duty`;el.querySelector('.quiet').textContent=`${r.duration/1000} s requested`;
   el.querySelector('.pwm-outcome').textContent=r.outcome||PWM_RESULTS[r.result]||'Unconfirmed';el.querySelector('.pwm-endpoints').textContent=`${fmt(m.start)}% → ${fmt(m.end)}%`;
   el.querySelector('strong').textContent=m.rate===null?'Rate unavailable':`${fmt(m.rate)} pp/s`;
   el.querySelector('.pwm-samples').textContent=`${r.actualMs===null?'Unknown':r.actualMs+' ms'} pump interval · ${r.samples} samples · pp/s = percentage points per second`;
   const select=el.querySelector('select'),notes=el.querySelector('input');select.value=r.observation||'';notes.value=r.notes||'';for(const [node,field]of [[select,'observation'],[notes,'notes']]){node.dataset.record=r.id;node.dataset.field=field;node.setAttribute('aria-label',`CH${r.channel} ${r.duty}% ${field}`);}
   $('pwm-results').append(el);
  }}
 }
}
