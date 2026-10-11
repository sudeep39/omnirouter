import test from 'node:test';
import assert from 'node:assert/strict';
import {generateScenario,scenarios} from '../workload.mjs';
import {route} from '../routing.mjs';
test('all sixteen scenarios expand, retain independent labels and source metadata',()=>{
 assert.equal(scenarios.length,16);
 for(let tier=0;tier<4;tier++)for(let i=0;i<4;i++){
 let first=true;const random=()=>{if(first){first=false;return(i+.1)/4}return .3};
 const s=generateScenario(tier,random);
 assert.equal(s.tier,tier);assert(s.text.length>250);assert(!/\{\w+\}/.test(s.text));assert.equal(s.provenance.kind,'synthetic-domain-informed');
 assert(route(s.text).tier>=0);
 }
});
test('scenario selection and variables are reproducible with an identical random stream',()=>{
 assert.deepEqual(generateScenario(2,()=>.2),generateScenario(2,()=>.2));
 assert.notEqual(generateScenario(2,()=>.2).text,generateScenario(2,()=>.8).text);
});
import {workloadKinds,chooseCase} from '../case-scenarios.mjs';
test('case-based share is exactly 45 percent for a thousand tickets',()=>{
 const kinds=workloadKinds(1000,()=>.37);assert.equal(kinds.filter(Boolean).length,450);
 const c=chooseCase(()=>.3);assert.equal(c.provenance.kind,'adapted-public-case');assert(c.provenance.caseId);assert(!c.text.includes('overturned'));
});
