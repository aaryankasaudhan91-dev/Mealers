const key='mealers:onboarding:v1';
let offered=false;
const steps=[
 ['Your lunch, with a plan','Find a suitable campus meal before the kitchen preparation cutoff. This is a synthetic demo, with no real orders or payments.','Discover'],
 ['Choose what fits','Filter by walking distance, meal preference and declared allergens. Always confirm dietary needs with kitchen staff.','Filter'],
 ['Confirm your choice','Review the kitchen and pickup time before confirming. A failed request stays failed; your original booking remains if a switch cannot complete.','Confirm'],
 ['Collect with your code','Open My meals and show your pickup code to staff. Kitchen teams approve preparation and record collection separately.','Collect']
];
export function startOnboarding(){
 if(document.getElementById('mealers-tour'))return;
 const previous=document.activeElement;
 const dialog=document.createElement('dialog');dialog.id='mealers-tour';dialog.className='tour-dialog';dialog.setAttribute('aria-labelledby','tour-title');
 let step=0;
 const close=()=>{try{localStorage.setItem(key,'done');}catch{}dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();};
 const draw=()=>{
  const [title,copy,label]=steps[step];
  dialog.innerHTML=`<div class="tour-top"><span>YOUR FIRST MEALERS VISIT</span><button class="text-button" id="tour-skip">Skip tour</button></div><div class="tour-route" aria-hidden="true">${steps.map((s,i)=>`<span class="${i===step?'current':i<step?'complete':''}">${i<step?'✓':i+1}<small>${s[2]}</small></span>`).join('')}</div><p class="tour-counter" aria-live="polite">Step ${step+1} of ${steps.length}</p><h2 id="tour-title" tabindex="-1">${title}</h2><p class="tour-copy">${copy}</p><div class="tour-actions"><button class="secondary" id="tour-back" ${step===0?'disabled':''}>Back</button><button class="primary" id="tour-next">${step===steps.length-1?'Explore Mealers':'Next step →'}</button></div>`;
  dialog.querySelector('#tour-skip').onclick=close;
  dialog.querySelector('#tour-back').onclick=()=>{step--;draw();};
  dialog.querySelector('#tour-next').onclick=()=>{if(step===steps.length-1)close();else{step++;draw();}};
  if(dialog.open)dialog.querySelector('#tour-title').focus();
 };
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 document.body.append(dialog);draw();dialog.showModal();dialog.querySelector('#tour-title').focus();
}
export function initOnboarding(){
 if(offered)return;offered=true;
 try{if(localStorage.getItem(key)==='done')return;}catch{}
 startOnboarding();
}
