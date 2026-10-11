import {route} from './router.mjs';
// Independently labeled paraphrases; report classification, not answer quality.
export const cases=[
 ['Where is my coverage document?',0],['Download the handbook please',0],
 ['Tell me the Gold copay',1],['Compare plan benefits',1],
 ['My referral expired before my specialist appointment',2],['Explain out-of-network rules',2],
 ['Will the plan pay for my surgery?',3],['How do I appeal a denied claim?',3],
 ['What do I owe for a doctor visit?',1],['Can you explain this?',2]
];
export const results=cases.map(([query,expected])=>({query,expected,actual:route(query).tier}));
console.log(JSON.stringify({classificationAccuracy:results.filter(r=>r.expected===r.actual).length/results.length,count:results.length,results},null,2));
