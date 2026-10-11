import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('shipped browser bundle initializes navigation, live support and processes a batch',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const elements=new Map(),queue=[];
 function register(markup){for(const m of markup.matchAll(/id="([^"]+)"/g))if(!elements.has(m[1]))elements.set(m[1],element());}
 function element(){return {parentElement:{append(){}},value:'',checked:true,disabled:false,hidden:false,children:[],classList:{toggle(){}},dataset:{},setAttribute(){},set innerHTML(markup){this.markup=markup;register(markup)},get innerHTML(){return this.markup??''},append(x){this.children.push(x)},prepend(x){this.children.unshift(x)},get lastElementChild(){const self=this;return {remove(){self.children.pop()}}},querySelector(){return element()},showModal(){this.open=true},close(){this.open=false},click(){this.onclick?.()}};}
 for(const id of [...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]))elements.set(id,element());
 const get=id=>{assert(elements.has(id),'Missing DOM element: '+id);return elements.get(id)};
 for(const [id,value] of Object.entries({count:'1000',seed:'42',baseline:'3',filter:'all',selectedFilter:'all'}))get(id).value=value;
 const nav=['dashboard','live','supervisor','architecture'].map(view=>({...element(),dataset:{view}}));
 const savedStorage=new Map();const localStorage={getItem:key=>savedStorage.get(key)??null,setItem:(key,value)=>savedStorage.set(key,value)};
 const ctx={localStorage,document:{getElementById:get,querySelectorAll:s=>s==='.nav'?nav:[],querySelector:()=>nav[1],createElement:element,addEventListener(){}},fetch(){throw Error("Simulation must not make backend requests")},performance,console,Blob,URL,AbortSignal,setTimeout:f=>(queue.push(f),queue.length),clearTimeout(){},alert(){throw Error('Unexpected validation failure')}};
 vm.runInNewContext(await readFile(new URL('../bundle.js',import.meta.url),'utf8'),ctx);
 assert.equal(typeof get('submitLive').onclick,'function');
 assert.doesNotMatch(get('supervisorControls').innerHTML,/modelFamily0|<input id="tierModel|TL\$\{t\} \?/);
 for(const family of ['openai','anthropic','google','x-ai']){
  get('modelFamily').value=family;get('modelFamily').onchange();
  const option=get('tierModel0').innerHTML.match(new RegExp('<option value="('+family+'/[^\"]+)"'));
  assert(option,'Family should have model dropdown options: '+family);
  for(let tier=0;tier<4;tier++){assert.match(get('tierModel'+tier).innerHTML,/Suggested TL/);get('tierModel'+tier).value=option[1];}
  get('supervisorName').value='Test admin';get('saveModelPreferences').click();
  assert.match(get('modelPreferencesStatus').textContent,/Preferences saved/);
  const history=JSON.parse(savedStorage.get('omnirouter-policy-history'));
  assert.equal(history.at(-1).reason,'Updated tier model preferences');
  assert(history.at(-1).after.tierModels.every(m=>m.family===family&&m.model===option[1]));
 }
 vm.runInNewContext(await readFile(new URL('../bundle.js',import.meta.url),'utf8'),ctx);
 assert(get('tierModel0').value.startsWith('x-ai/'),'Saved model restored on reload');
 for(const button of nav){button.click();assert.doesNotMatch(get('environmentBadge').textContent,/\uFFFD|\s\?\s/);for(const view of nav)assert.equal(get(view.dataset.view).hidden,view!==button);}
 nav[1].click();assert.equal(get('live').hidden,false);assert.equal(get('dashboard').hidden,true);
 nav[0].click();get('simulate').click();assert.equal(get('simulate').disabled,true);
 while(queue.length)queue.shift()();
 assert.equal(get('progress').value,100);assert.equal(get('simulate').disabled,false);assert.match(get('runProgress').textContent,/1,000/);
 assert.match(get('rows').innerHTML,/View audit/);
 get('inspectLatest').click();assert.equal(get('detail').open,true);assert.doesNotMatch(get('detailBody').innerHTML,/compareCase|auditCompareTier|Optional real model comparison/);
 get('responseTierLeft').value='1';get('responseTierRight').value='2';get('simulateResponses').click();assert.match(get('simulatedResponseComparison').innerHTML,/TL1/);assert.match(get('simulatedResponseComparison').innerHTML,/TL2/);
 get('newTier').value='human';get('reason').value='Escalate this case for human review';get('role').value='Technician';get('reassign').click();assert.match(get('detailBody').innerHTML,/Human support/);assert.doesNotMatch(get('detailBody').innerHTML,/<dd>TL[0-3] \u00b7 (Essential|Standard|Advanced|Expert)<\/dd>/);
 assert.equal(get('detail').open,true);get('close').click();assert.equal(get('detail').open,false);
});
