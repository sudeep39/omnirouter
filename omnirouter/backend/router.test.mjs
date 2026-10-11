import test from 'node:test';
import assert from 'node:assert/strict';
import {route,defaultControls,validateControls} from './router.mjs';
import {createApp} from './server.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('highest matched rule wins, evidence offsets and conservative fallback',()=>{assert.equal(route('Download brochure').tier,0);assert.equal(route('Compare Gold deductible').tier,1);assert.equal(route('My referral expired').tier,2);const r=route('Compare my denied claim');assert.equal(r.tier,3);assert.equal(r.signals[0].evidence[0].offset,11);assert.equal(route('Can you help me?').tier,2)});
test('API authentication, actual adapter request, recorded audit, persistent cap',async()=>{const dir=await mkdtemp(join(tmpdir(),'omnirouter-'));let calls=0;const env={OPENROUTER_API_KEY:'fake',DEMO_ACCESS_TOKEN:'presenter',MODEL_TL0:'demo/basic',MODEL_TL1:'demo/standard',MODEL_TL2:'demo/advanced',MODEL_TL3:'demo/expert',MAX_CALLS_PER_DAY:'1'};const server=createApp({env,auditDir:dir,fetchImpl:async(url,opts)=>{calls++;assert.equal(JSON.parse(opts.body).model,'demo/standard');return {ok:true,json:async()=>({id:'provider-1',model:'demo/standard',choices:[{message:{content:'Fictional answer [HH-2]'}}],usage:{prompt_tokens:40,completion_tokens:10,cost:.001}})}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{const send=(token,body)=>fetch(base+'/api/support',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});assert.equal((await send('wrong',{query:'Compare deductibles',synthetic:true})).status,401);assert.equal((await send('presenter',{query:'Compare deductibles'})).status,400);const response=await send('presenter',{query:'Compare deductibles',synthetic:true});assert.equal(response.status,200);const data=await response.json();assert.equal(data.cost,.001);assert.equal(data.decision.tier,1);assert.equal(data.events.length,3);assert.equal((await send('presenter',{query:'Compare deductibles',synthetic:true})).status,429);assert.equal(calls,1);const audit=await readFile(dir+'/audit.jsonl','utf8');assert(audit.includes('provider-completed'));assert(!audit.includes('Bearer'));}finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true})}});
test('document navigation does not become case-specific coverage',()=>{assert.equal(route('Where is my coverage document?').tier,0);assert.equal(route('Explain my coverage for surgery').tier,3);assert.equal(route('No recognizable intent').humanReview,true);assert.equal(route('Compare benefits').policy.length,4)});
test('null bodies, linked reassignment, baseline comparison and missing usage',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omnirouter-'));
 const env={OPENROUTER_API_KEY:'fake',DEMO_ACCESS_TOKEN:'presenter',MODEL_TL0:'basic',MODEL_TL1:'standard',MODEL_TL2:'advanced',MODEL_TL3:'expert'};
 const app=createApp({env,auditDir:dir,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'Answer'}}]})})});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.address().port;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer presenter','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
 assert.equal((await post('/api/support',null)).status,400);
 const original=await (await post('/api/support',{query:'Compare benefits',synthetic:true})).json();
 assert.equal(original.cost,null);assert.equal(original.costComplete,false);assert.equal(original.configuration.hash.length,64);
 assert.equal((await post('/api/reassign',{parentId:original.id,tier:0,reason:'Unnecessary capability',synthetic:true})).status,403);
 const rerun=await (await post('/api/reassign',{parentId:original.id,tier:2,reason:'Incomplete answer needs detail',synthetic:true})).json();
 assert.equal(rerun.parentId,original.id);assert.equal(rerun.assignedTier,2);assert.equal(rerun.caseId,original.id);
 const compared=await (await post('/api/compare',{parentId:rerun.id,synthetic:true})).json();assert.equal(compared.assignedTier,3);assert.equal(compared.query,original.query);
 }finally{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true})}
});
test('provider failure is classified and has a terminal audit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omnirouter-'));const app=createApp({auditDir:dir,env:{OPENROUTER_API_KEY:'fake',DEMO_ACCESS_TOKEN:'presenter',MODEL_TL0:'a',MODEL_TL1:'b',MODEL_TL2:'c',MODEL_TL3:'d'},fetchImpl:async()=>({ok:false,status:429})});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 try{const response=await fetch('http://127.0.0.1:'+app.address().port+'/api/support',{method:'POST',headers:{Authorization:'Bearer presenter'},body:JSON.stringify({query:'Download brochure',synthetic:true})});assert.equal(response.status,502);const data=await response.json();assert.equal(data.category,'provider-http-429');assert(data.auditId);assert((await readFile(dir+'/audit.jsonl','utf8')).includes('request-failed'));}finally{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true})}
});

test('supervisor urgency promotion retains base reasoning and cannot lower clinical rules',()=>{
 const c=validateControls({...defaultControls,urgencyTier:3});const d=route('Urgent: download my brochure',c);
 assert.equal(d.baseTier,0);assert.equal(d.tier,3);assert.equal(d.rule,'SUPERVISOR-URGENCY');assert.equal(d.supervisorPolicy.urgencyTier,3);
 assert.equal(route('Urgent: my surgery was denied',{...c,urgencyTier:0}).tier,3);
 assert.equal(route('Health emergency: cannot breathe',{...c,emergencyTerms:[]}).emergency,true);
 assert.equal(route('Unrecognized words',{...c,fallbackTier:1}).tier,1);
});
test('supervisor human handoff uses explicit phrases, uncertainty and emergency controls',()=>{
 assert.equal(route('I want to speak to a real person').action,'human-handoff');
 assert.equal(route('Please download the handbook').action,'model');
 assert.equal(route('Something is wrong',{...defaultControls,handoffOnUncertain:true}).action,'human-handoff');
 assert.equal(route('Medical emergency: help me').action,'human-handoff');
 assert.equal(route('I want a real person',{...defaultControls,handoffEnabled:false}).action,'model');
});
test('editable rule promotions and added phrases affect selection and enforce floors',()=>{
 const settings=defaultControls.ruleSettings.map(r=>({...r,extraTerms:[...r.extraTerms]}));
 settings.find(r=>r.id==='LOOKUP-01').tier=2;settings.find(r=>r.id==='LOOKUP-01').extraTerms=['membership card'];
 const c=validateControls({...defaultControls,ruleSettings:settings});
 assert.equal(route('Find my membership card',c).tier,2);
 assert.equal(route('Download Silver brochure',c).tier,2);
 settings.find(r=>r.id==='EXCEPTION-04').enabled=false;
 assert.throws(()=>validateControls({...c,ruleSettings:settings}));
});
test('policy lifecycle persists applied state and comparison preserves provider request',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omnirouter-'));const requests=[];
 const env={OPENROUTER_API_KEY:'fake',DEMO_ACCESS_TOKEN:'presenter',SUPERVISOR_ACCESS_TOKEN:'supervisor',MODEL_TL0:'a',MODEL_TL1:'b',MODEL_TL2:'c',MODEL_TL3:'d'};
 const app=createApp({env,auditDir:dir,fetchImpl:async(url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>({choices:[{message:{content:'Answer'}}],usage:{cost:.001}})}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.address().port;const post=(path,body,token='presenter')=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
 try{const original=await (await post('/api/support',{query:'Compare benefits',synthetic:true})).json();const changed=await post('/api/config',{controls:{...defaultControls,fallbackTier:3,tierModels:defaultControls.tierModels.map(m=>m.tier===3?{...m,family:'x-ai',model:'x-ai/test-model'}:m)},reason:'Increase unknown query review'},'supervisor');assert.equal(changed.status,200);const records=(await readFile(dir+'/audit.jsonl','utf8')).split('\n').filter(Boolean).map(JSON.parse);assert(records.some(e=>e.event==='supervisor-policy-proposed'));assert(records.some(e=>e.event==='supervisor-policy-applied'));assert.equal(JSON.parse(await readFile(dir+'/supervisor.json','utf8')).version,2);const comparison=await post('/api/compare',{parentId:original.id,tier:3,synthetic:true});assert.equal(comparison.status,200);assert.deepEqual({...requests[0],model:'x-ai/test-model'},requests[1]);const result=await (await post('/api/support',{query:'My claim was denied',synthetic:true})).json();assert.equal(result.requestedModel,'x-ai/test-model');assert.equal(result.configuration.models[3],'x-ai/test-model');assert.equal(original.requestedModel,'b');}finally{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true})}
});

test('tier model validation supports all families, defaults and rejects mismatches',()=>{assert.equal(validateControls({}).tierModels.length,4);const families=['openai','anthropic','google','x-ai'];const tierModels=families.map((family,tier)=>({tier,family,model:family+'/test-model'}));assert.deepEqual(validateControls({tierModels}).tierModels,tierModels);assert.throws(()=>validateControls({tierModels:tierModels.map(m=>({...m,tier:0}))}));assert.throws(()=>validateControls({tierModels:tierModels.map(m=>({...m,model:'google/wrong-family'}))}));});
