import('./app.js').catch(()=>{
 const splash=document.getElementById('splash');
 if(!splash)return;
 splash.replaceChildren();
 const title=document.createElement('h1');title.textContent='Mealers could not start';
 const message=document.createElement('p');message.textContent='Check your connection and reload. No booking has been confirmed.';
 const retry=document.createElement('button');retry.className='primary';retry.textContent='Reload Mealers';retry.onclick=()=>location.reload();
 splash.append(title,message,retry);
});
