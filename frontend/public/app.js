const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={user:null,tab:'explore',authMode:'login',meals:[],bookings:[],diet:'any',avoid:[],maxWalk:15,loading:true},busy=false;

async function api(url,body){
  const token=typeof sessionStorage!=='undefined'?sessionStorage.getItem('mealers_session'):null;
  const headers={...(body?{'Content-Type':'application/json'}:{}),...(token?{'Authorization':`Bearer ${token}`,'x-session-token':token}:{})};
  const r=await fetch('/api/'+url,{credentials:'include',...(body?{method:'POST',headers,body:JSON.stringify(body)}:{headers})});
  const d=await r.json();
  if(!r.ok)throw Error(d.message||'Request failed');
  return d;
}

function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
const time=s=>new Date(s).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const active=()=>state.bookings.find(b=>b.status==='confirmed');
const eligible=m=>(state.diet==='any'||m.diet===state.diet||(state.diet==='vegetarian'&&m.diet==='vegan'))&&!state.avoid.some(a=>m.allergens.includes(a))&&m.walk<=state.maxWalk;

async function refresh(){
  state.loading=true;
  try{
    const session=await api('session');
    state.user=session.user;
    state.setupRequired=session.setupRequired;
    state.meals=(await api('meals')).meals;
    state.bookings=state.user?(await api('bookings')).bookings:[];
  }catch(e){
    toast(e.message);
  }
  state.loading=false;
  await render();
}

function shell(content){
  const navLinks=[
    ['explore','Discover'],
    ...(state.user?.role==='diner'?[['bookings','My meals']]:[]),
    ...(state.user?.role==='manager'?[['kitchen','Kitchen'],['report','Insights']]:[]),
    ['about','About us']
  ];
  return `
  <header>
    <a class="brand" href="/">mealers<span>.</span></a>
    <nav aria-label="Main navigation">
      ${navLinks.map(([k,v])=>`<button data-tab="${k}" class="${state.tab===k?'selected':''}">${v}</button>`).join('')}
    </nav>
    <div class="account">
      <span class="campus">Sample campus</span>
      ${state.user ? `
        <div class="user-pill">
          <span class="user-name">${esc(state.user.name)}</span>
          <span class="user-role ${state.user.role==='manager'?'manager':''}">${esc(state.user.role)}</span>
        </div>
        <button class="secondary signout-btn" id="logout-btn">Sign out</button>
      ` : `
        <button class="primary auth-nav-btn ${state.tab==='login'?'selected':''}" data-tab="login">Sign In / Register ↗</button>
      `}
      <select id="account" aria-label="Demo accounts dropdown">
        <option value="" ${!state.user?'selected':''}>${state.user?'Switch demo...':'Quick demo...'}</option>
        <option value="diner" ${state.user?.id==='diner'?'selected':''}>Alex · diner demo</option>
        <option value="new-diner" ${state.user?.id==='new-diner'?'selected':''}>Sam · new diner</option>
        <option value="eco-diner" ${state.user?.id==='eco-diner'?'selected':''}>Jordan · vegetarian diner</option>
        <option value="manager" ${state.user?.id==='manager'?'selected':''}>Kitchen team demo</option>
      </select>
    </div>
  </header>
  <main>
    <div class="workspace-label">
      <span class="status-dot"></span> MEALERS CAMPUS DEMO 
      <span class="demo-note">Synthetic data · No real orders or payments</span>
    </div>
    ${state.setupRequired?'<aside class="setup-notice">Demo database is not connected. Meal booking will become available when database setup is complete.</aside>':''}
    ${content}
    <aside class="security-notice">
      <strong>Security notice</strong> Demo accounts are switchable. Use synthetic data only. Real authentication and operational checks are required before a live pilot.
    </aside>
  </main>
  <footer>
    <span class="brand small">mealers<span>.</span></span>
    <p>Thoughtful meal planning, one campus at a time.</p>
    <span>Concept MVP · Cloud ready for Vercel & Render</span>
  </footer>
  `;
}

function mealCard(m){
  const b=active(),isCurrent=b?.service_id===m.id;
  return `
  <article class="meal-card glass">
    <div class="meal-art art-${(m.id-1)%3}">
      <span class="dish" aria-hidden="true">${m.diet==='regular'?'🍱':m.id%2?'🥗':'🍛'}</span>
      <span class="diet-tag">${esc(m.diet==='regular'?'Chicken':m.diet)}</span>
    </div>
    <div class="meal-body">
      <div class="meal-meta">
        <span>${esc(m.kitchen)}</span>
        <span>↗ ${m.walk} min walk</span>
      </div>
      <h3>${esc(m.name)}</h3>
      <p>${esc(m.description)}</p>
      <div class="meal-details">
        <span>Pickup ${time(m.pickup)}</span>
        <strong>S$${m.price.toFixed(2)}</strong>
      </div>
      <div class="availability">
        <span class="${m.available?'green':'red'}">${!m.open?'Booking closed':m.available?`${m.available} booking slots left`:'Fully booked'}</span>
        <span>Cutoff ${time(m.cutoff)}</span>
      </div>
      <button class="primary full ${isCurrent?'current':''}" data-book="${m.id}" ${!m.open||!m.available||isCurrent?'disabled':''}>
        ${isCurrent?'Your current meal':b?'Switch to this meal':'Choose this meal'} <span>↗</span>
      </button>
      <small>Declared allergens: ${esc(m.allergens.join(', ')||'None declared')}. Check with kitchen staff.</small>
    </div>
  </article>`;
}

function explore(){
  const b=active(),meals=state.meals.filter(eligible);
  return `
  <section class="hero glass">
    <div class="hero-copy">
      <span class="eyebrow">A BETTER LUNCH PLAN</span>
      <h1>Your next meal,<br><em>already planned.</em></h1>
      <p>Find a meal you’ll enjoy at a nearby campus kitchen. Choose your pickup time and let the kitchen plan ahead.</p>
      <a class="primary" href="#meals">Explore the menu <span>↓</span></a>
      <div class="palette"><i></i><i></i><i></i><i></i><span>Good choices. A little less guesswork.</span></div>
    </div>
    <div class="hero-image">
      <img src="/campus.png" alt="Concept illustration of students collecting lunch in a bright campus cafeteria">
      <span class="image-note">Mealers concept illustration</span>
    </div>
  </section>
  ${b?`
  <section class="booking-strip glass">
    <div class="booking-icon">✓</div>
    <div>
      <strong>Your lunch is on the list</strong>
      <p>${esc(b.meal.name)} at ${esc(b.meal.kitchen)} · ${time(b.meal.pickup)}</p>
    </div>
    <button class="text-button" data-tab="bookings">View booking ↗</button>
  </section>`:''}
  <section id="meals" class="menu-section">
    <div class="section-heading">
      <div>
        <span class="eyebrow">NEARBY KITCHENS</span>
        <h2>A meal that fits your day</h2>
      </div>
      <p>${meals.length} options · Manager-approved menus</p>
    </div>
    <div class="filters glass">
      <label>Meal preference
        <select id="diet">
          <option value="any">All meals</option>
          <option value="vegan" ${state.diet==='vegan'?'selected':''}>Vegan</option>
          <option value="vegetarian" ${state.diet==='vegetarian'?'selected':''}>Vegetarian</option>
        </select>
      </label>
      <label>Walking distance
        <select id="walk">
          ${[5,10,15].map(n=>`<option value="${n}" ${state.maxWalk===n?'selected':''}>Up to ${n} minutes</option>`).join('')}
        </select>
      </label>
      <label>Avoid declared allergen
        <select id="avoid">
          <option value="">No filter</option>
          ${['sesame','soy','wheat','peanuts','milk','eggs'].map(a=>`<option value="${a}" ${state.avoid.includes(a)?'selected':''}>${a}</option>`).join('')}
        </select>
      </label>
      <span class="filter-help">Choose what works for you.<br>Always confirm dietary needs with staff.</span>
    </div>
    <div class="meal-grid">
      ${meals.map(mealCard).join('')||'<div class="empty glass"><h3>No matching meals</h3><p>Try a different walking distance or meal preference.</p></div>'}
    </div>
  </section>
  <section class="how">
    <span class="eyebrow">SIMPLE BY DESIGN</span>
    <h2>A small choice helps the kitchen plan</h2>
    <div class="how-grid">
      ${[['01','Choose a suitable meal','See the kitchen, pickup time and declared allergens before you book.'],['02','Confirm your choice','Your place is reserved only after you explicitly confirm.'],['03','Collect at the kitchen','Show your pickup code to staff and enjoy your meal.']].map(([n,h,p])=>`<div><b>${n}</b><h3>${h}</h3><p>${p}</p></div>`).join('')}
    </div>
  </section>`;
}

function bookings(){
  return `
  <div class="page-heading">
    <span class="eyebrow">YOUR CAMPUS LUNCH</span>
    <h1>My meals</h1>
    <p>Your confirmed plans, pickup codes and booking history.</p>
  </div>
  ${!state.user?`
  <div class="empty glass">
    <h3>Sign in to view your bookings</h3>
    <p>Sign in with your account or choose a demo diner profile.</p>
    <button class="primary" data-tab="login">Sign In / Demo Accounts ↗</button>
  </div>`:state.bookings.length?`
  <div class="booking-list">
    ${state.bookings.map(b=>`
    <article class="booking-card glass">
      <div>
        <span class="pill ${b.status==='confirmed'?'green':''}">${esc(b.status.replace('_',' '))}</span>
        <h2>${esc(b.meal.name)}</h2>
        <p>${esc(b.meal.kitchen)} · Pickup ${time(b.meal.pickup)}</p>
        ${b.previous_id?'<small>Voluntary meal switch recorded</small>':''}
      </div>
      ${b.status==='confirmed'?`
      <div class="pickup-code">
        <small>YOUR PICKUP CODE</small>
        <strong>${esc(b.token)}</strong>
        <span>Show this code to kitchen staff</span>
      </div>
      <div class="booking-actions">
        <button class="primary" data-tab="explore">Find an alternative ↗</button>
        <button class="text-button" data-cancel="${b.id}">Cancel booking</button>
      </div>`:''}
    </article>`).join('')}
  </div>`:`
  <div class="empty glass">
    <h3>Your next meal starts here</h3>
    <p>Choose a suitable meal from a nearby kitchen.</p>
    <button class="primary" data-tab="explore">Explore meals ↗</button>
  </div>`}`;
}

async function kitchen(){
  const d=await api('kitchen');
  return `
  <div class="page-heading split">
    <div>
      <span class="eyebrow">KITCHEN WORKSPACE</span>
      <h1>A clearer preparation plan</h1>
      <p>Confirmed demand stays separate from your walk-in buffer.</p>
    </div>
    <button class="primary" id="publish">Publish a meal ＋</button>
  </div>
  <section class="pickup-panel glass">
    <div>
      <h3>Confirm a pickup</h3>
      <p>Staff can confirm collection once per booking code.</p>
    </div>
    <form id="pickup-form">
      <label class="sr-only" for="pickup">Pickup code</label>
      <input id="pickup" name="token" placeholder="Enter pickup code" required>
      <button class="primary">Confirm pickup</button>
    </form>
  </section>
  <div class="kitchen-grid">
    ${d.meals.map(m=>`
    <article class="kitchen-card glass">
      <div class="meal-meta">
        <span>${esc(m.kitchen)}</span>
        <span class="pill">${m.open?'Booking open':'Cutoff passed'}</span>
      </div>
      <h3>${esc(m.name)}</h3>
      <div class="capacity-line">
        <strong>${m.reserved}<small> committed</small></strong>
        <span>${m.available} bookable slots left</span>
      </div>
      <progress value="${m.reserved}" max="${m.capacity}" aria-label="Committed capacity"></progress>
      <div class="numbers">
        <span>Total capacity <b>${m.capacity}</b></span>
        <span>Walk-in buffer <b>${m.buffer}</b></span>
        <span>Approved preparation <b>${m.prepared??'Not set'}</b></span>
      </div>
      <p class="muted">Booking cutoff ${time(m.cutoff)} · Pickup ${time(m.pickup)}</p>
      <div class="buttons">
        <button class="secondary" data-plan="${m.id}">Approve plan</button>
        <button class="secondary" data-reconcile="${m.id}">Record totals</button>
      </div>
    </article>`).join('')}
  </div>
  <section class="events glass">
    <h3>Recent activity</h3>
    ${d.events.map(e=>`<div><span>${esc(e.event.replaceAll('_',' '))}</span><time>${time(e.at)}</time></div>`).join('')||'<p>No actions recorded yet. Demo seed bookings are not pilot results.</p>'}
  </section>`;
}

async function report(){
  const d=await api('report'),collected=d.counts.find(c=>c.status==='collected')?.n||0;
  return `
  <div class="page-heading">
    <span class="eyebrow">OBSERVE BEFORE YOU CLAIM</span>
    <h1>Campus insights</h1>
    <p>Demo activity and recorded service totals. These are not real-world impact results.</p>
  </div>
  <div class="metric-grid">
    ${[[d.switched,'Confirmed meal switches','blue'],[collected,'Collected bookings','green'],[d.reportedServices,'Services with recorded totals','red'],[d.unused,'Recorded unused portions','yellow']].map(([n,l,c])=>`
    <article class="metric glass ${c}">
      <strong>${n}</strong>
      <span>${l}</span>
    </article>`).join('')}
  </div>
  <section class="report-note glass">
    <h2>Bookings are a signal. Outcomes need evidence.</h2>
    <p>A confirmed switch is not automatically a saved meal. A pilot must measure unused food, unmet requests, incentive cost and staff effort against an agreed baseline.</p>
    <p>Net benefit considers avoided ingredient and variable preparation cost, less incentives, added labour and software fees.</p>
    <button class="secondary" id="export">Download demo report ↓</button>
  </section>`;
}

function about(){
  return `
  <div class="page-heading">
    <span class="eyebrow">OUR STORY & APPROACH</span>
    <h1>About Mealers</h1>
    <p>Rethinking campus dining through advance coordination, portion commitments, and zero guesswork.</p>
  </div>

  <section class="about-hero glass">
    <div class="about-hero-copy">
      <span class="eyebrow">THE MEALERS CONCEPT</span>
      <h2>A small choice before lunch helps campus kitchens plan ahead.</h2>
      <p>Every day, campus cafeterias face an unpredictable gamble: prepare too much food and end up composting good meals, or prepare too little and leave hungry students without options. Mealers bridges that gap through advance portion reservations, giving kitchen staff verified demand before ingredients are prepped.</p>
      <div class="about-stats-row">
        <div>
          <strong>2 hrs</strong>
          <span>Cutoff before cooking begins</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>Portion commitment transparency</span>
        </div>
        <div>
          <strong>Zero</strong>
          <span>Historical guesswork for kitchen staff</span>
        </div>
      </div>
    </div>
  </section>

  <section class="comparison-section">
    <div class="section-heading">
      <div>
        <span class="eyebrow">THE DIFFERENCE</span>
        <h2>Why coordination changes everything</h2>
      </div>
      <p>Moving from blind estimations to real demand signals</p>
    </div>
    <div class="comparison-grid">
      <article class="glass compare-card old">
        <span class="pill red">The Old Way</span>
        <h3>Guesswork & Rush Hours</h3>
        <ul>
          <li>Kitchens cook blind batches based on generic estimates from past weeks.</li>
          <li>Unpredictable turnout causes daily preparation surplus and high costs.</li>
          <li>Popular dishes run out abruptly, causing long, frustrated lines.</li>
          <li>Allergens and ingredients are difficult to verify in a hurried queue.</li>
        </ul>
      </article>
      <article class="glass compare-card new">
        <span class="pill green">The Mealers Way</span>
        <h3>Coordinated & Predictable</h3>
        <ul>
          <li>Diners choose meals and review ingredients hours ahead of time.</li>
          <li>Kitchen managers approve exact portion plans matching real commitments.</li>
          <li>A dedicated walk-in buffer remains safely preserved for spontaneous diners.</li>
          <li>Fast, contactless pickup codes eliminate lunch-hour waiting lines.</li>
        </ul>
      </article>
    </div>
  </section>

  <section class="how">
    <span class="eyebrow">SHARED BENEFITS</span>
    <h2>Built for both sides of the campus counter</h2>
    <div class="how-grid">
      <div>
        <b>01</b>
        <h3>For Diners</h3>
        <p>Explore nearby campus kitchens by walking distance, dietary preference, and declared allergens. Reserve with one tap and collect instantly with your unique code.</p>
      </div>
      <div>
        <b>02</b>
        <h3>For Kitchen Teams</h3>
        <p>Publish daily dishes with total capacity and walk-in buffers. Approve final preparation plans once the booking cutoff passes, then confirm pickups with one click.</p>
      </div>
      <div>
        <b>03</b>
        <h3>For Campus Communities</h3>
        <p>Measure real utilization, switch rates, and unused portions without vanity claims. Create a sustainable, respectful dining environment.</p>
      </div>
    </div>
  </section>

  <section class="cta-banner glass">
    <div>
      <span class="eyebrow">READY TO EXPLORE?</span>
      <h2>Experience campus coordination in action</h2>
      <p>Switch between sample diner profiles and the kitchen team to explore the complete journey.</p>
    </div>
    <div class="cta-buttons">
      <button class="primary" data-tab="explore">Explore Menu <span>↗</span></button>
      <button class="secondary" data-tab="login">Sign In / Demo Accounts</button>
    </div>
  </section>
  `;
}

function loginView(){
  const isReg=state.authMode==='register';
  return `
  <div class="page-heading">
    <span class="eyebrow">ACCOUNT ACCESS & DEMO PROFILES</span>
    <h1>${isReg?'Create an Account':'Sign in to Mealers'}</h1>
    <p>${isReg?'Register as a campus diner or kitchen manager to start planning.':'Log in with your credentials or select a 1-click demo profile below.'}</p>
  </div>

  <div class="auth-layout">
    <!-- 1-Click Demo Profiles -->
    <section class="demo-acc-section glass">
      <div class="demo-acc-header">
        <span class="eyebrow">ONE-CLICK DEMO ACCOUNTS</span>
        <h2>Choose a Demo Profile</h2>
        <p>Experience different campus roles instantly with synthetic demo data.</p>
      </div>

      <div class="demo-acc-grid">
        <article class="demo-card glass" data-demo-login="diner">
          <div class="demo-card-top">
            <span class="dish">🥗</span>
            <div>
              <h3>Alex · Diner</h3>
              <span class="pill green">Existing Diner</span>
            </div>
          </div>
          <p>Has an active booking at Commons Kitchen. Test meal switching, cancellation, and pickup code <code>MEAL-DEMO</code>.</p>
          <button class="secondary full" data-demo-login="diner">Log in as Alex <span>→</span></button>
        </article>

        <article class="demo-card glass" data-demo-login="new-diner">
          <div class="demo-card-top">
            <span class="dish">🍱</span>
            <div>
              <h3>Sam · New Diner</h3>
              <span class="pill blue">Fresh Diner</span>
            </div>
          </div>
          <p>Starts with zero bookings. Test searching nearby kitchens, filtering by walk time and booking a fresh meal.</p>
          <button class="secondary full" data-demo-login="new-diner">Log in as Sam <span>→</span></button>
        </article>

        <article class="demo-card glass" data-demo-login="eco-diner">
          <div class="demo-card-top">
            <span class="dish">🍛</span>
            <div>
              <h3>Jordan · Eco Diner</h3>
              <span class="pill green">Vegetarian</span>
            </div>
          </div>
          <p>Pre-configured with vegetarian preferences. Great for testing dietary matching and allergen alerts.</p>
          <button class="secondary full" data-demo-login="eco-diner">Log in as Jordan <span>→</span></button>
        </article>

        <article class="demo-card glass" data-demo-login="manager">
          <div class="demo-card-top">
            <span class="dish">⌘</span>
            <div>
              <h3>Kitchen Team</h3>
              <span class="pill red">Kitchen Manager</span>
            </div>
          </div>
          <p>Full kitchen workspace: approve preparation plans, confirm student pickups with codes, and view metrics.</p>
          <button class="primary full" data-demo-login="manager">Log in as Kitchen Team <span>→</span></button>
        </article>
      </div>
    </section>

    <!-- Sign In / Register Form -->
    <section class="auth-card glass">
      <div class="auth-segmented">
        <button type="button" class="${!isReg?'active':''}" id="tab-login-btn">Sign In</button>
        <button type="button" class="${isReg?'active':''}" id="tab-register-btn">Create Account</button>
      </div>

      ${!isReg ? `
      <form id="auth-login-form">
        <div class="form-group">
          <label for="login-account">Username, Email, or Demo Account</label>
          <input id="login-account" name="account" placeholder="e.g. diner, new-diner, or your username" required autocomplete="username">
        </div>
        <div class="form-group">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password" placeholder="Password (optional for demo accounts)" autocomplete="current-password">
        </div>
        <p id="auth-error" class="error-msg" role="alert"></p>
        <button type="submit" class="primary full" id="auth-submit-btn">Sign In <span>→</span></button>
        <div class="auth-footer-note">
          <span>Need a new account?</span>
          <button type="button" class="text-button" id="switch-to-register">Register here</button>
        </div>
      </form>
      ` : `
      <form id="auth-register-form">
        <div class="form-group">
          <label for="reg-name">Full Name</label>
          <input id="reg-name" name="name" placeholder="e.g. Maya Chen" required autocomplete="name">
        </div>
        <div class="form-group">
          <label for="reg-username">Username</label>
          <input id="reg-username" name="username" placeholder="e.g. mayachen" required autocomplete="username">
        </div>
        <div class="form-group">
          <label for="reg-email">Campus Email</label>
          <input id="reg-email" name="email" type="email" placeholder="e.g. maya@campus.edu" autocomplete="email">
        </div>
        <div class="form-group">
          <label for="reg-role">Role on Campus</label>
          <select id="reg-role" name="role">
            <option value="diner">Diner (Student / Staff eating on campus)</option>
            <option value="manager">Kitchen Team (Menu publishing & pickups)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="reg-diet">Dietary Preference</label>
          <select id="reg-diet" name="diet">
            <option value="any">No specific preference (All meals)</option>
            <option value="vegan">Vegan</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="regular">Regular</option>
          </select>
        </div>
        <div class="form-group">
          <label for="reg-password">Password</label>
          <input id="reg-password" name="password" type="password" placeholder="At least 4 characters" minlength="4" autocomplete="new-password">
        </div>
        <p id="auth-error" class="error-msg" role="alert"></p>
        <button type="submit" class="primary full" id="auth-submit-btn">Create Account <span>→</span></button>
        <div class="auth-footer-note">
          <span>Already have an account?</span>
          <button type="button" class="text-button" id="switch-to-login">Sign in here</button>
        </div>
      </form>
      `}
    </section>
  </div>
  `;
}

async function render(){
  let content;
  try{
    content=state.tab==='explore'?explore()
           :state.tab==='bookings'?bookings()
           :state.tab==='kitchen'?await kitchen()
           :state.tab==='report'?await report()
           :state.tab==='about'?about()
           :state.tab==='login'?loginView()
           :explore();
  }catch(e){
    content=`<div class="empty glass"><h2>${esc(e.message)}</h2><button class="primary" data-tab="explore">Back to meals</button></div>`;
  }
  $('#app').innerHTML=shell(content);
  bind();
}

function modal(title,html,submit){
  const d=$('#dialog');
  d.innerHTML=`
  <form id="modal-form">
    <div class="modal-head">
      <h2>${title}</h2>
      <button type="button" class="close" aria-label="Close dialog">×</button>
    </div>
    ${html}
    <p id="modal-error" role="alert"></p>
    <div class="modal-foot">
      <button type="button" class="secondary close">Go back</button>
      <button class="primary" id="modal-submit">Confirm</button>
    </div>
  </form>`;
  d.querySelectorAll('.close').forEach(x=>x.onclick=()=>d.close());
  d.querySelector('form').onsubmit=async e=>{
    e.preventDefault();
    if(busy)return;
    busy=true;
    $('#modal-submit').disabled=true;
    try{
      const message=await submit(new FormData(e.target));
      d.close();
      toast(message);
      await refresh();
    }catch(err){
      $('#modal-error').textContent=err.message;
    }finally{
      busy=false;
      $('#modal-submit').disabled=false;
    }
  };
  d.showModal();
}

function bind(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
    state.tab=b.dataset.tab;
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  });

  if($('#logout-btn'))$('#logout-btn').onclick=async()=>{
    try{
      await api('logout',{});
      if(typeof sessionStorage!=='undefined')sessionStorage.removeItem('mealers_session');
      state.user=null;
      state.bookings=[];
      state.tab='explore';
      toast('Signed out successfully.');
      await refresh();
    }catch(err){
      toast(err.message);
    }
  };

  document.querySelectorAll('[data-demo-login]').forEach(b=>{
    b.onclick=async e=>{
      e.stopPropagation();
      const account=b.dataset.demoLogin;
      try{
        const res=await api('demo/login',{account});
        if(res?.token&&typeof sessionStorage!=='undefined')sessionStorage.setItem('mealers_session',res.token);
        state.user=res.user;
        state.tab=res.user.role==='manager'?'kitchen':'explore';
        toast(`Signed in as ${res.user.name}`);
        await refresh();
      }catch(err){
        toast(err.message);
      }
    };
  });

  if($('#tab-login-btn'))$('#tab-login-btn').onclick=()=>{state.authMode='login';render();};
  if($('#tab-register-btn'))$('#tab-register-btn').onclick=()=>{state.authMode='register';render();};
  if($('#switch-to-register'))$('#switch-to-register').onclick=()=>{state.authMode='register';render();};
  if($('#switch-to-login'))$('#switch-to-login').onclick=()=>{state.authMode='login';render();};

  if($('#auth-login-form'))$('#auth-login-form').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const errEl=$('#auth-error');
    errEl.textContent='';
    const btn=$('#auth-submit-btn');
    btn.disabled=true;
    try{
      const res=await api('login',{account:fd.get('account'),password:fd.get('password')});
      if(res?.token&&typeof sessionStorage!=='undefined')sessionStorage.setItem('mealers_session',res.token);
      state.user=res.user;
      state.tab=res.user.role==='manager'?'kitchen':'explore';
      toast(`Welcome back, ${res.user.name}!`);
      await refresh();
    }catch(err){
      errEl.textContent=err.message;
      btn.disabled=false;
    }
  };

  if($('#auth-register-form'))$('#auth-register-form').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const errEl=$('#auth-error');
    errEl.textContent='';
    const btn=$('#auth-submit-btn');
    btn.disabled=true;
    try{
      const res=await api('register',{
        name:fd.get('name'),
        username:fd.get('username'),
        email:fd.get('email'),
        role:fd.get('role'),
        diet:fd.get('diet'),
        password:fd.get('password')
      });
      if(res?.token&&typeof sessionStorage!=='undefined')sessionStorage.setItem('mealers_session',res.token);
      state.user=res.user;
      state.tab=res.user.role==='manager'?'kitchen':'explore';
      toast(`Account created! Welcome, ${res.user.name}.`);
      await refresh();
    }catch(err){
      errEl.textContent=err.message;
      btn.disabled=false;
    }
  };

  $('#account').onchange=async e=>{
    try{
      if(!e.target.value){
        await api('logout',{});
        if(typeof sessionStorage!=='undefined')sessionStorage.removeItem('mealers_session');
        state.user=null;
        state.bookings=[];
        state.tab='explore';
      }else{
        const res=await api('demo/login',{account:e.target.value});
        if(res?.token&&typeof sessionStorage!=='undefined')sessionStorage.setItem('mealers_session',res.token);
        state.user=res.user;
        state.tab=res.user.role==='manager'?'kitchen':'explore';
        toast(`Switched to ${res.user.name}`);
      }
      await refresh();
    }catch(err){
      toast(err.message);
    }
  };

  for(const [id,key]of [['diet','diet'],['walk','maxWalk'],['avoid','avoid']])if($('#'+id))$('#'+id).onchange=e=>{
    state[key]=key==='avoid'?(e.target.value?[e.target.value]:[]):key==='maxWalk'?Number(e.target.value):e.target.value;
    render();
  };

  document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>{
    if(!state.user){
      toast('Please sign in or select a demo diner account to book.');
      state.tab='login';
      render();
      return;
    }
    if(state.user.role!=='diner'){
      toast('Kitchen team accounts cannot book meals. Sign in as a diner to book.');
      return;
    }
    const m=state.meals.find(m=>m.id===Number(b.dataset.book)),old=active(),key=crypto.randomUUID();
    modal(old?'Confirm your meal switch':'Confirm your meal',`
      <p>${old?`Your booking for <b>${esc(old.meal.name)}</b> will change only if the new reservation succeeds.`:'Your reservation is confirmed only after you choose Confirm.'}</p>
      <div class="modal-meal">
        <h3>${esc(m.name)}</h3>
        <p>${esc(m.kitchen)} · ${m.walk} min walk</p>
        <p>Pickup ${time(m.pickup)} · S$${m.price.toFixed(2)}</p>
        <p>Declared allergens: ${esc(m.allergens.join(', ')||'None declared')}</p>
      </div>
      <label class="consent"><input type="checkbox" required> I have reviewed the meal and pickup details. I will check dietary needs with kitchen staff.</label>
      <small>No payment or incentive is processed in this demo.</small>`,
      async()=>{
        const d=await api(old?`bookings/${old.id}/switch`:'bookings',{serviceId:m.id,requestKey:key,diet:state.diet,avoid:state.avoid,maxWalk:state.maxWalk});
        state.tab='bookings';
        return d.message;
      }
    );
  });

  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>modal('Cancel this meal?',`<p>Before the preparation cutoff, your slot becomes available again. After the cutoff, the kitchen may already have started preparation.</p>`,async()=> (await api(`bookings/${b.dataset.cancel}/cancel`,{})).message));

  if($('#pickup-form'))$('#pickup-form').onsubmit=async e=>{
    e.preventDefault();
    const button=e.target.querySelector('button');
    button.disabled=true;
    try{
      toast((await api('pickups',{token:new FormData(e.target).get('token')})).message);
      await refresh();
    }catch(err){
      toast(err.message);
      button.disabled=false;
    }
  };

  document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>{
    const m=state.meals.find(m=>m.id===Number(b.dataset.plan));
    modal('Approve preparation plan',`<p>${esc(m.name)} has ${m.reserved} committed meals and a ${m.buffer}-portion walk-in buffer.</p><label>Planned portions<input name="prepared" type="number" min="${m.reserved}" max="${m.capacity}" value="${Math.min(m.capacity,m.reserved+m.buffer)}" required></label><small>The manager approves the final quantity. This is not a demand forecast.</small>`,async f=>(await api(`services/${m.id}/plan`,{prepared:Number(f.get('prepared'))})).message);
  });

  document.querySelectorAll('[data-reconcile]').forEach(b=>b.onclick=()=>{
    const m=state.meals.find(m=>m.id===Number(b.dataset.reconcile));
    modal('Record service totals',`<p>Enter measured totals for ${esc(m.name)}. Sample data stays in this local demo.</p>${[['prepared','Prepared portions'],['served','Served portions'],['waste','Unused prepared portions']].map(([k,l])=>`<label>${l}<input name="${k}" type="number" min="0" max="${m.capacity}" value="${m[k]??''}" required></label>`).join('')}<small>Unused portions cannot exceed prepared minus served. Plate waste is outside this MVP metric.</small>`,async f=>(await api(`services/${m.id}/reconcile`,Object.fromEntries([...f].map(([k,v])=>[k,Number(v)])))).message);
  });

  if($('#publish'))$('#publish').onclick=()=>{
    const local=d=>new Date(d-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    modal('Publish a meal',`
      <div class="form-grid">
        <label>Meal name<input name="name" maxlength="120" required></label>
        <label>Kitchen<input name="kitchen" maxlength="120" required></label>
        <label class="wide">Description<textarea name="description" maxlength="400" required></textarea></label>
        <label>Meal category<select name="diet"><option value="vegan">Vegan</option><option value="vegetarian">Vegetarian</option><option value="regular">Regular</option></select></label>
        <label>Price in S$<input name="price" type="number" min="0" max="100" step=".01" required></label>
        <label>Total portions<input name="capacity" type="number" min="1" max="1000" value="100" required></label>
        <label>Walk-in buffer<input name="buffer" type="number" min="0" value="15" required></label>
        <label>Walk in minutes<input name="walk" type="number" min="1" max="30" value="5" required></label>
        <label>Booking cutoff<input name="cutoff" type="datetime-local" value="${local(Date.now()+7200000)}" required></label>
        <label>Pickup time<input name="pickup" type="datetime-local" value="${local(Date.now()+10800000)}" required></label>
      </div>
      <fieldset>
        <legend>Declared allergens</legend>
        <div class="allergen-options">
          ${['sesame','soy','wheat','peanuts','milk','eggs'].map(a=>`<label><input name="allergens" type="checkbox" value="${a}">${a}</label>`).join('')}
        </div>
      </fieldset>
      <label class="consent"><input type="checkbox" required>I confirm the menu declarations and capacity.</label>`,
      async f=>{
        const data=Object.fromEntries(f);
        for(const k of ['capacity','buffer','walk'])data[k]=Number(data[k]);
        data.price=Math.round(Number(data.price)*100);
        data.cutoff=new Date(data.cutoff).toISOString();
        data.pickup=new Date(data.pickup).toISOString();
        data.allergens=f.getAll('allergens');
        return(await api('services',data)).message;
      }
    );
  };

  if($('#export'))$('#export').onclick=async()=>{
    try{
      const report=await api('report'),url=URL.createObjectURL(new Blob([JSON.stringify({...report,label:'Synthetic Mealers demo report'},null,2)],{type:'application/json'})),a=document.createElement('a');
      a.href=url;
      a.download='mealers-demo-report.json';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){
      toast(e.message);
    }
  };
}

refresh();
