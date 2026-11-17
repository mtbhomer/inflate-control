import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {RoutineUI} from '../dist/routines-ui.mjs';
function mount(){
 const {document,window}=parseHTML('<html><body><section id="routines"></section><section id="zones"></section><section id="sequences"></section><section id="sensor-setup"></section></body></html>');
 // linkedom has no select.value setter; supply normal browser behavior.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.selected)?.value??this.options[0]?.value??'';},set(v){for(const o of this.options)o.selected=o.value===String(v);}});
 const saved=new Map();globalThis.document=document;globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
 const context={online:false,demo:false,info:null,fresh:false,pending:false,busy:false,routineKind:0,routine:null,routineFresh:false,now:0,analogStates:Array.from({length:6},()=>({sample:null,received:0}))};
 let plan;const ui=new RoutineUI({context:()=>context,start:p=>plan=p,changed:()=>ui.render()});ui.render();
 const click=id=>document.getElementById(id).dispatchEvent(new window.Event('click',{bubbles:true}));
 const input=(id,value)=>{const e=document.getElementById(id);e.value=value;e.dispatchEvent(new window.Event('input',{bubbles:true}));};
 return {ui,context,saved,document,click,input,window,get plan(){return plan;}};
}
test('Front/Back mapping and sequence editing never change the selected exercise',()=>{
 const m=mount();m.click('map-back');assert.equal(m.ui.mapKind,'scan');assert.equal(m.ui.data.selected,'breathing');m.click('assign-2');assert.equal(m.ui.data.scan.zones.upper.mask,4);assert.equal(m.ui.data.breathing.zones.front.mask,0);
 m.document.querySelector('[data-config-kind="scan"]').dispatchEvent(new m.window.Event('click'));m.input('zone-target','35');assert.equal(m.ui.data.scan.zones.upper.target,35);assert.equal(m.ui.data.selected,'breathing');
 m.click('map-front');m.click('assign-0');assert.equal(m.ui.data.breathing.zones.front.mask,1);assert.equal(m.ui.editKind,'scan');m.click('routine-scan');assert.equal(m.ui.data.selected,'scan');assert.equal(m.ui.mapKind,'breathing');
});
test('Start uses the exercise configuration while another map or sequence is being edited',()=>{
 const m=mount();Object.assign(m.context,{online:true,demo:true,fresh:true,info:{mask:63,routines:true,sensorRangeTargets:true}});Object.assign(m.ui.data.breathing.zones.front,{mask:1,target:10});Object.assign(m.ui.data.scan.zones.upper,{mask:4,target:25});
 m.click('map-back');m.document.querySelector('[data-config-kind="scan"]').dispatchEvent(new m.window.Event('click'));m.ui.render();m.click('routine-start');assert.equal(m.plan.kind,1);assert.equal(m.plan.stages[0].mask,1);assert.equal(m.plan.stages[0].target,10);
});
test('full-level capture saves sensor percentage per device without altering scale or real data in preview',()=>{
 const m=mount();Object.assign(m.context,{online:true,demo:true,fresh:true,outputs:[],active:0});const sample=mv=>m.context.analogStates[0]={sample:{fresh:true,flags:3,raw:Math.round(mv/3100*4095),millivolts:mv,age:0},received:0};
 sample(450);m.ui.capture(0);assert.equal(m.ui.refs[0].maximum,10);assert.equal(m.saved.has('inflate.sensor-options.v1'),false);m.context.demo=false;assert.equal(m.ui.refs[0].maximum,null);
 m.ui.setDevice('hub-a');sample(500);m.ui.capture(0);assert.equal(JSON.parse(m.saved.get('inflate.sensor-options.v1')).deviceId,'hub-a');assert.equal(m.ui.refs[0].maximum,12);m.ui.setDevice('hub-b');assert.equal(m.ui.refs[0].maximum,null);m.ui.setDevice('hub-a');assert.equal(m.ui.refs[0].maximum,12);
 m.context.routineKind=1;sample(600);m.ui.capture(0);assert.equal(m.ui.refs[0].maximum,12);m.context.routineKind=0;m.context.outputs[0]={pump:true};m.ui.capture(0);assert.equal(m.ui.refs[0].maximum,12);
});
test('disabled channels disappear from mapping, sensor cards and exercise summaries',()=>{const m=mount();Object.assign(m.context,{demo:true,enabledMask:2});m.ui.data.breathing.zones.front.mask=6;m.ui.render();assert.equal(m.document.getElementById('assign-2').hidden,true);assert.equal(m.document.getElementById('assign-1').hidden,false);assert.equal(m.document.querySelector('#zone-sensor-readings [data-sensor="2"]'),null);assert.ok(m.document.querySelector('#zone-sensor-readings [data-sensor="1"]'));assert.equal(m.document.getElementById('routine-zone-summary').textContent.includes('CH2'),false);m.click('assign-2');assert.equal(m.ui.data.breathing.zones.front.mask,6);m.context.enabledMask=0;m.ui.render();assert.equal(m.document.querySelector('#zone-sensor-readings [data-sensor]'),null);assert.match(m.document.getElementById('routine-validation').textContent,/enabled channels/);});
test('Device setup hides disabled choices and enables increments only while idle or holding calibration',()=>{const m=mount();Object.assign(m.context,{online:true,demo:true,fresh:true,enabledMask:2,info:{calibrationPulses:true},active:0,phases:[],outputs:[]});m.context.analogStates[1]={sample:{fresh:true,flags:3,raw:500,millivolts:400,age:0},received:0};m.ui.render();assert.equal(m.document.getElementById('setup-channel').options.length,1);assert.equal(m.ui.setupChannel,1);assert.equal(m.document.getElementById('calibrate-small').disabled,false);Object.assign(m.context,{active:2,phases:[0,2],busy:true,calibrating:true});m.ui.render();assert.equal(m.document.getElementById('calibrate-small').disabled,true);m.context.phases[1]=3;m.ui.render();assert.equal(m.document.getElementById('calibrate-small').disabled,false);assert.equal(m.document.getElementById('capture-channel-maximum').disabled,false);m.context.calibrating=false;m.ui.render();assert.equal(m.document.getElementById('calibrate-small').disabled,true);m.context.enabledMask=0;m.ui.render();assert.equal(m.document.getElementById('sensor-setup-body').hidden,true);});
