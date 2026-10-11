export const responseTierStyles=['Very basic information','Relevant information','Nuanced information','Comprehensive review'];
export function illustratedResponses(ticket,left=0,right=3){
 if(!Number.isInteger(left)||!Number.isInteger(right)||left<0||right<0||left>3||right>3||left===right)throw Error('Choose two different tiers.');
 const category=ticket.required;
 const examples=[
  [
   'Plan brochures are available in the demo member portal. [HH-1]',
   'Find the plan brochure in the demo member portal. Check that the document matches the plan you are asking about. Support can help explain it. [HH-1]',
   'Download the brochure from the demo member portal and confirm its plan name and relevant period before relying on it. If the document is missing or does not match your question, ask support to locate and explain the appropriate document. [HH-1]',
   'Start with the plan brochure in the demo member portal. Confirm the plan and document period, identify the section that relates to your question, and ask support to resolve any missing or conflicting information. The fictional handbook supplies no actual portal URL or phone number, and support cannot verify a real membership. Extra analysis may add little value to a straightforward document lookup. [HH-1]'
  ],
  [
   'Silver and Gold have different deductibles and copays. [HH-2]',
   'Fictional Silver has a $2,000 annual in-network deductible and $30 primary-care copay. Gold has a $1,000 deductible and $20 primary-care copay. [HH-2]',
   'Silver: $2,000 annual in-network deductible and $30 primary-care copay. Gold: $1,000 and $20, respectively. Gold is $1,000 lower on this deductible and $10 lower on this copay. These figures describe only the stated benefits; they do not establish your treatment-specific coverage. [HH-2]',
   'Compare the stated benefits separately: Silver has a $2,000 annual in-network deductible and $30 primary-care copay; Gold has a $1,000 deductible and $20 copay. Gold is lower by $1,000 and $10 on those measures. A deductible and a visit copay are different cost-sharing mechanisms, so these differences are not a prediction of total spending. Premiums, family aggregation, remaining deductible, plan-year changes and treatment-specific charges are not supplied. Ask support for those facts before making a personal cost or coverage conclusion. [HH-2]'
  ],
  [
   'Specialist visits require an active referral. [HH-3]',
   'Both demo plans require an active specialist referral. If yours expired, contact support before the appointment. Out-of-network care requires prior review. [HH-3]',
   'Check referral validity and network status separately. An active referral does not itself settle out-of-network eligibility, which requires prior review. For an expired referral, ask support to review the situation before the appointment and confirm the provider, location and service date. Coverage cannot be assumed. [HH-3]',
   'Review this as several linked checks: referral validity on the service date, the exact clinician and appointment location, network status, and whether required out-of-network review has occurred. A referral does not establish completion of separate review requirements. Gather the referral, appointment details and any authorization correspondence; ask support to reconcile expired or conflicting records before the visit. The handbook does not supply your case facts or an approval decision. If a denial or exception is involved, human review is required. [HH-3, HH-4]'
  ],
  [
   'Contact support about your case. [HH-4]',
   'Denied claims, exclusions and treatment-specific coverage questions require human review. Provide the denial notice and relevant plan provision to support. [HH-4]',
   'Separate the stated denial reason from the plan provision and the facts of the requested service. Collect the denial notice, relevant policy section and supporting documentation for human review. Referral or network issues may need a separate check. These documents do not establish that the denial should be reversed. [HH-3, HH-4]',
   'Structure the review around the requested service, the applicable provision, and disputed case facts. Assemble the denial notice, plan sections, service dates, provider documentation and any referral or authorization records. Identify conflicting explanations and ask a human reviewer to reconcile them, including any separate referral or network requirements. The fictional handbook does not establish medical necessity, personal eligibility, appeal deadlines or an outcome. Support cannot approve coverage or give medical advice; a more detailed answer should clarify evidence and next steps without promising reversal. [HH-3, HH-4]'
  ]
 ];
 const responses=examples[category]??examples[3];
 const criteria=['Gives a short starting point with little explanation.','Adds relevant policy facts and a practical next step.','Separates interacting requirements, missing facts and uncertainty.','Organizes evidence, dependencies, review boundaries and follow-up questions.'];
 const low=Math.min(left,right),high=Math.max(left,right);
 return {responses:[left,right].map(tier=>({tier,style:responseTierStyles[tier],text:responses[tier]})),gaps:[`TL${left}: ${criteria[left]}`,`TL${right}: ${criteria[right]}`,category>=2?`The TL${high} illustration covers more dependencies than TL${low}; inspect whether the selected pair addresses the ticket's interacting provisions and missing evidence.`:'For a straightforward lookup or benefit question, added detail may offer limited value; completeness should be judged against the actual request.'],verdict:category>=2?'A basic reply may leave a complex case unresolved and require follow-up. The more detailed illustration shows how review can support the next step; it does not establish measured model superiority.':'A higher tier is not automatically the better choice. A concise, correct answer may be sufficient for this request.',label:'Authored simulation examples, not actual model outputs. Tier differences illustrate intended response depth; quality, customer satisfaction and follow-up rates are not measured.'};
}
