import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {RoutineUI} from '../dist/routines-ui.mjs';
function mount(){
 const {document,window}=parseHTML('<html><body><section id="routines"></section><section id="zones"></section><section id="sequences"></section></body></html>');
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
 const m=mount();Object.assign(m.context,{online:true,demo:true,fresh:true,info:{mask:63,routines:true}});Object.assign(m.ui.data.breathing.zones.front,{mask:1,target:50});Object.assign(m.ui.data.scan.zones.upper,{mask:4,target:25});
 m.click('map-back');m.document.querySelector('[data-config-kind="scan"]').dispatchEvent(new m.window.Event('click'));m.ui.render();m.click('routine-start');assert.equal(m.plan.kind,1);assert.equal(m.plan.stages[0].mask,1);assert.equal(m.plan.stages[0].target,50);
});
test('preview reference capture never persists real calibration; real references are device-bound',()=>{
 const m=mount();Object.assign(m.context,{online:true,demo:true,fresh:true});const sample=raw=>m.context.analogStates[0]={sample:{fresh:true,flags:3,raw,millivolts:200,age:0},received:0};
 sample(200);m.ui.capture(0,'zero');sample(2000);m.ui.capture(0,'reference');assert.equal(m.saved.has('inflate.calibration.v1'),false);m.context.demo=false;assert.equal(m.ui.refs[0].reference,null);
 m.ui.setDevice('hub-a');sample(250);m.ui.capture(0,'zero');sample(2250);m.ui.capture(0,'reference');assert.equal(JSON.parse(m.saved.get('inflate.calibration.v1')).deviceId,'hub-a');m.ui.setDevice('hub-b');assert.equal(m.ui.refs[0].reference,null);m.ui.setDevice('hub-a');assert.equal(m.ui.refs[0].reference,2250);
 m.context.routineKind=1;sample(300);m.ui.capture(0,'zero');assert.equal(m.ui.refs[0].zero,250);
});
