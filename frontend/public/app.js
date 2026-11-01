import {initOnboarding,startOnboarding} from './onboarding.js';
import {createApi} from './api.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={user:null,tab:'login',authMode:'login',meals:[],bookings:[],diet:'any',avoid:[],maxWalk:15,loading:true},busy=false;
let scrollyAnimId=null;


const api = createApi();

function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
const time=s=>new Date(s).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const active=()=>state.bookings.find(b=>b.status==='confirmed');
const eligible=m=>(state.diet==='any'||m.diet===state.diet||(state.diet==='vegetarian'&&m.diet==='vegan'))&&!state.avoid.some(a=>m.allergens.includes(a))&&m.walk<=state.maxWalk;

function trackEvent(name, data={}){
  const consent = typeof localStorage !== 'undefined' ? localStorage.getItem('mealers_cookie_consent') : null;
  if(consent !== 'all') return;
  try{
    const payload = JSON.stringify({
      event: name,
      data,
      tab: state.tab,
      url: window.location.pathname,
      ts: new Date().toISOString()
    });
    if(typeof navigator !== 'undefined' && navigator.sendBeacon){
      navigator.sendBeacon('/api/analytics', new Blob([payload], {type: 'application/json'}));
    } else {
      fetch('/api/analytics', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: payload,
        keepalive: true
      }).catch(()=>{});
    }
  }catch{}
}

function initCookieBanner(){
  const banner = $('#cookie-banner');
  if(!banner) return;
  const consent = typeof localStorage !== 'undefined' ? localStorage.getItem('mealers_cookie_consent') : null;
  if(!consent){
    banner.innerHTML = `
      <div class="cookie-copy">
        <h3><span>🍪</span> Campus Dining Privacy & Cookies</h3>
        <p>Mealers uses essential local session tokens to remember your reserved meals, plus anonymous zero-cookie telemetry to reduce cafeteria food waste. We never track you across sites.</p>
      </div>
      <div class="cookie-actions">
        <button class="cookie-btn-secondary" id="cookie-essential-btn">Essential Only</button>
        <button class="cookie-btn-primary" id="cookie-accept-btn">Accept All</button>
      </div>
    `;
    banner.classList.remove('hidden');
    const accept = $('#cookie-accept-btn'), essential = $('#cookie-essential-btn');
    if(accept) accept.onclick = () => {
      localStorage.setItem('mealers_cookie_consent', 'all');
      banner.classList.add('hidden');
      trackEvent('cookie_consent', {choice: 'all'});
      toast('Cookie preferences saved: All enabled.');
    };
    if(essential) essential.onclick = () => {
      localStorage.setItem('mealers_cookie_consent', 'essential');
      banner.classList.add('hidden');
      toast('Cookie preferences saved: Essential only.');
    };
  } else {
    banner.classList.add('hidden');
  }
}

async function refresh(){
  state.loading=true;
  state.error='';
  try{
    const session=await api('session');
    state.user=session.user;
    state.setupRequired=session.setupRequired;
    state.meals=(await api('meals')).meals;
    state.bookings=state.user?(await api('bookings')).bookings:[];
    if(!state.user && state.tab!=='about') state.tab='login';
  }catch(e){
    state.error=e.message;
    if(e.status===401){state.user=null;state.bookings=[];state.tab='login';}
    toast(e.message);
  }
  state.loading=false;
  await render();
  document.getElementById('splash')?.remove();
  if(!state.error)initOnboarding();
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
    <a class="brand" href="/" title="Mealers campus dining"><img src="/logo.svg" alt="Mealers logo" class="brand-logo" width="38" height="38"> mealers<span>.</span></a>
    <nav aria-label="Main navigation">
      ${navLinks.map(([k,v])=>`<button data-tab="${k}" class="${state.tab===k?'selected':''}">${v}</button>`).join('')}
    </nav>
    <div class="account">
      <span class="campus">Sample campus</span><button class="text-button" id="show-tour">Quick tour</button>
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
    ${state.error?`<aside class="connection-error" role="alert"><strong>We could not refresh your information</strong><p>${esc(state.error)}</p><button class="secondary" id="retry-load">Try again</button></aside>`:''}
    ${content}
    <aside class="security-notice">
      <strong>Security notice</strong> Demo accounts are switchable. Use synthetic data only. Real authentication and operational checks are required before a live pilot.
    </aside>
  </main>
  ${state.user?.role !== 'manager' ? `
  <aside class="mobile-cta-bar" aria-label="Quick meal action">
    <a class="primary mobile-cta-btn" href="#meals" data-scroll-cta>Plan Tomorrow's Lunch <span>↓</span></a>
  </aside>` : ''}
  <footer>
    <span class="brand small"><img src="/logo.svg" alt="Mealers logo" class="brand-logo small" width="24" height="24"> mealers<span>.</span></span>
    <p>Thoughtful meal planning, one campus at a time.</p>
    <span>Concept MVP · Cloud ready for Vercel & Render</span>
  </footer>
  `;
}

function mealCard(m){
  const b=active(),isCurrent=b?.service_id===m.id;
  const bookableTotal=m.capacity-m.buffer;
  const percent=Math.min(100,Math.round(((bookableTotal-m.available)/bookableTotal)*100));
  const fillClass=m.available<=5?'full':m.available<=15?'low':'';
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
      <div class="card-progress" title="${m.reserved} portions committed">
        <div class="progress-fill ${fillClass}" style="width: ${percent}%"></div>
      </div>
      <div class="meal-details">
        <span>Pickup ${time(m.pickup)}</span>
        <strong>₹${m.price.toFixed(2)}</strong>
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
      <div class="hero-cta">
        <a class="primary hero-cta-btn" href="#meals" data-scroll-cta>Plan Tomorrow's Lunch <span>↓</span></a>
        <button class="hero-secondary-btn" data-tab="about">How It Works ↗</button>
      </div>
      <div class="palette"><i></i><i></i><i></i><i></i><span>Good choices. A little less guesswork.</span></div>
    </div>
    <div class="hero-image">
      <picture>
        <source srcset="/campus.jpg" type="image/jpeg">
        <img src="/campus.jpg" alt="Concept illustration of students and staff collecting planned lunches in a bright, sustainable campus cafeteria" width="1672" height="941" loading="eager" fetchpriority="high">
      </picture>
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
      <p>${meals.length} ${meals.length===1?'option':'options'} · Manager-approved menus</p>
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
    ${state.meals.length&&!state.meals.some(m=>m.open)?`<aside class="service-notice"><strong>Booking has closed for these services</strong><p>Your existing booking is still listed under My meals. New reservations open when the kitchen publishes its next service.</p></aside>`:''}
    <div class="meal-grid">
      ${meals.map(mealCard).join('')||'<div class="empty glass"><h3>No matching meals</h3><p>Try a different walking distance or meal preference.</p></div>'}
    </div>
  </section>
  <section class="explainer glass" aria-label="Mealers explained">
    <span class="eyebrow">WATCH THE WORKFLOW</span><h2>A clearer lunch plan in 20 seconds</h2>
    <p>See how diners choose, confirm and collect while kitchen teams keep control of preparation.</p>
    <video controls playsinline preload="none" poster="/media/mealers-explainer.jpg" aria-label="Mealers workflow explainer">
      <source src="/media/mealers-explainer.mp4" type="video/mp4">
      <track kind="captions" src="/media/mealers-explainer.vtt" srclang="en" label="English" default>
      Your browser cannot play this video.
    </video>
    <p class="field-hint">Concept illustration and synthetic demonstration. No measured savings are claimed. <a href="/media/mealers-explainer.mp4">Open the video</a></p>
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
        <button type="button" class="copy-btn" data-copy="${esc(b.token)}">
          <span>📋</span> Copy code
        </button>
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
    <span class="eyebrow">CONFIRMED DEMAND, BEFORE COOKING</span>
    <h1>About Mealers</h1>
    <p>Help nearby kitchens plan around the meals diners actually choose.</p>
  </div>

  <section class="business-story glass" aria-label="The Mealers business advantage">
    <h2>One caterer. Nearby kitchens. A clearer lunch plan.</h2>
    <p>A caterer may have spare capacity at one cafeteria and excess requests at another. Mealers lets diners voluntarily choose a suitable alternative before preparation closes.</p>
    <div class="business-points">
      <article><h3>For the operator</h3><p>See committed demand across participating kitchens. Managers retain control of preparation and walk-in buffers.</p></article>
      <article><h3>For the diner</h3><p>Choose a meal by location, declared dietary information and pickup time. Confirm explicitly; a failed switch keeps the original booking.</p></article>
      <article><h3>The business test</h3><p>A subscription per participating kitchen is the proposed model. A pilot must show avoided preparation costs exceed software cost and extra staff effort, without worse shortages.</p></article>
    </div>
    <p class="business-caveat">Forecasting and pre-order tools already exist. Cross-kitchen coordination is our focus to validate, not a proven unique advantage. No customers, revenue or measured savings are claimed. The story below is illustrative.</p>
  </section>
  <div class="scrolly-wrapper">
    <!-- Sticky 3D Interactive Stage -->
    <div class="scrolly-stage glass" id="scrolly-stage">
      <canvas id="scrolly-canvas"></canvas>
      
      <div class="stage-overlay">
        <div class="perspective-box" id="perspective-box">
          <!-- Stage 1 3D Visual -->
          <div class="stage-content" id="stage-1">
            <span class="stage-tag red">Chapter 01 · The Friction</span>
            <h3>The Unpredictable Cafeteria Gamble</h3>
            <div class="dilemma-cards">
              <div class="dilemma-box">
                <span class="dish">🗑️</span>
                <strong>Over-Prep Waste</strong>
                <span>Preparing without reliable demand can leave surplus portions; the scale needs measurement in a pilot.</span>
              </div>
              <div class="vs-divider">VS</div>
              <div class="dilemma-box">
                <span class="dish">⏳</span>
                <strong>Rush-Hour Queue</strong>
                <span>Students wait 20-40 minutes only to find popular meals sold out.</span>
              </div>
            </div>
          </div>

          <!-- Stage 2 3D Visual -->
          <div class="stage-content hidden" id="stage-2">
            <span class="stage-tag blue">Chapter 02 · Synchronization</span>
            <h3>The 2-Hour Advance Cutoff Window</h3>
            <div class="clock-stage">
              <div class="clock-3d">
                <div class="clock-face">
                  <span class="clock-hand"></span>
                  <span class="clock-center"></span>
                  <div class="clock-badge">2h CUTOFF</div>
                </div>
              </div>
              <div class="clock-details">
                <div class="detail-row">
                  <b>10:30 AM · Diners Choose</b>
                  <span>Browse ingredients, check allergens, and lock your pickup spot.</span>
                </div>
                <div class="detail-row highlight">
                  <b>11:00 AM · Cutoff Passes</b>
                  <span>Kitchen manager approves prep matching real requests.</span>
                </div>
                <div class="detail-row">
                  <b>1:00 PM · Instant Pickup</b>
                  <span>Show your token code for contactless collection in seconds.</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Stage 3 3D Visual -->
          <div class="stage-content hidden" id="stage-3">
            <span class="stage-tag green">Chapter 03 · Balance</span>
            <h3>Committed Demand + Walk-in Buffer</h3>
            <div class="matrix-stage">
              <div class="matrix-layer committed">
                <div class="layer-header">
                  <span class="dot green"></span>
                  <strong>Committed Reservations (80%)</strong>
                </div>
                <p>Guaranteed portions pre-ordered by diners before cooking begins.</p>
              </div>
              <div class="matrix-layer buffer">
                <div class="layer-header">
                  <span class="dot yellow"></span>
                  <strong>Protected Walk-In Buffer (20%)</strong>
                </div>
                <p>A calculated reserve for spontaneous diners. No over-cooking, no unexpected stockouts.</p>
              </div>
            </div>
          </div>

          <!-- Stage 4 3D Visual -->
          <div class="stage-content hidden" id="stage-4">
            <span class="stage-tag yellow">Chapter 04 · Simulation</span>
            <h3>Simulate Your Campus Savings</h3>
            <div class="impact-simulator">
              <div class="slider-control">
                <label for="campus-size">Daily Campus Diners: <strong id="diner-val">500</strong></label>
                <input type="range" id="campus-size" min="100" max="2500" step="50" value="500">
              </div>
              <div class="sim-results">
                <div class="sim-metric">
                  <strong id="meals-saved">Not measured</strong>
                  <span>Meals Saved / Day</span>
                </div>
                <div class="sim-metric">
                  <strong id="co2-avoided">338 kg</strong>
                  <span>CO₂ Avoided / Day</span>
                </div>
                <div class="sim-metric">
                  <strong id="dollars-saved">Not measured</strong>
                  <span>Ingredient Value Kept</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Stage Navigation Indicators -->
        <div class="stage-indicators">
          <button class="step-dot active" data-step="1" title="Chapter 1: The Problem"></button>
          <button class="step-dot" data-step="2" title="Chapter 2: The Cutoff"></button>
          <button class="step-dot" data-step="3" title="Chapter 3: The Buffer Matrix"></button>
          <button class="step-dot" data-step="4" title="Chapter 4: Live Simulation"></button>
        </div>
      </div>
    </div>

    <!-- Narrative Step Cards (Scroll Triggers) -->
    <div class="scrolly-narrative">
      <article class="narrative-step glass active" data-step-id="1">
        <span class="eyebrow">CHAPTER 01</span>
        <h2>The Unpredictable Kitchen Dilemma</h2>
        <p>Every morning, campus cafeterias face an impossible choice: cook too much and risk throwing away pristine ingredients, or cook too conservatively and turn away students.</p>
        <p>This structural blind spot results in high operating costs, discarded food, and long rush-hour queues.</p>
        <div class="stat-callout">
          <strong>1 in 3</strong>
          <span>Portions risk over-preparation when kitchens cook without advance commitments.</span>
        </div>
      </article>

      <article class="narrative-step glass" data-step-id="2">
        <span class="eyebrow">CHAPTER 02</span>
        <h2>The 2-Hour Synchronization Window</h2>
        <p>Mealers introduces a calm rhythm: meals are reserved before an advance cutoff window, usually two hours before lunch service begins.</p>
        <p>This gives kitchen staff the exact headcount they need to approve an accurate preparation plan. Instead of cooking blindly, chefs prep exactly what has been requested.</p>
        <div class="stat-callout">
          <strong>15 sec</strong>
          <span>Average pickup time with digital token vs 15-minute rush hour queues.</span>
        </div>
      </article>

      <article class="narrative-step glass" data-step-id="3">
        <span class="eyebrow">CHAPTER 03</span>
        <h2>The Protected Walk-In Buffer</h2>
        <p>Advance booking does not mean shutting out spontaneous eaters. Every published meal service calculates and preserves a dedicated walk-in buffer.</p>
        <p>This dual-capacity model protects walk-in diners from finding empty counters, while keeping committed meals safely isolated from accidental overselling.</p>
        <div class="stat-callout">
          <strong>Zero</strong>
          <span>Overselling through MongoDB atomic reservation transactions.</span>
        </div>
      </article>

      <article class="narrative-step glass" data-step-id="4">
        <span class="eyebrow">CHAPTER 04</span>
        <h2>Real Outcomes, Not Empty Claims</h2>
        <p>In line with the Mealers philosophy, we observe before claiming. A booking is not automatically an avoided waste portion until verified at daily reconciliation.</p>
        <p>Campus managers record actual served portions and unused counts daily, creating an auditable track record of ingredient efficiency and student satisfaction.</p>
        <div class="cta-mini">
          <button class="primary" data-tab="explore">Explore Today's Menu <span>↗</span></button>
          <button class="secondary" data-tab="login">Try a Demo Profile</button>
        </div>
      </article>
    </div>
  </div>
  `;
}

function initScrollytelling(){
  const canvas=$('#scrolly-canvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  let width=canvas.width=canvas.parentElement.clientWidth||500;
  let height=canvas.height=canvas.parentElement.clientHeight||560;

  window.addEventListener('resize',()=>{
    if(!canvas.parentElement)return;
    width=canvas.width=canvas.parentElement.clientWidth||500;
    height=canvas.height=canvas.parentElement.clientHeight||560;
  });

  let currentStep=1;
  let mouseX=0,mouseY=0;
  let rotX=0,rotY=0;

  const particles=Array.from({length:40},()=>({
    x:(Math.random()-0.5)*500,
    y:(Math.random()-0.5)*500,
    z:Math.random()*600-300,
    size:Math.random()*3+1.5,
    speed:Math.random()*0.4+0.1
  }));

  const colors={
    1:{p:'#c63c36'},
    2:{p:'#2457d6'},
    3:{p:'#16734a'},
    4:{p:'#d49b06'}
  };

  const stage=$('#scrolly-stage');
  const pBox=$('#perspective-box');

  if(stage&&pBox){
    stage.onmousemove=e=>{
      const rect=stage.getBoundingClientRect();
      const x=(e.clientX-rect.left)/rect.width-0.5;
      const y=(e.clientY-rect.top)/rect.height-0.5;
      mouseX=x*18;
      mouseY=-y*18;
    };
    stage.onmouseleave=()=>{mouseX=0;mouseY=0;};
  }

  function setStep(stepNum){
    if(stepNum===currentStep)return;
    currentStep=stepNum;
    trackEvent('scrolly_step',{step:currentStep});
    for(let i=1;i<=4;i++){
      const el=$(`#stage-${i}`);
      if(el){
        if(i===currentStep)el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
    }
    document.querySelectorAll('.step-dot').forEach(dot=>{
      dot.classList.toggle('active',Number(dot.dataset.step)===currentStep);
    });
    document.querySelectorAll('.narrative-step').forEach(step=>{
      step.classList.toggle('active',Number(step.dataset.stepId)===currentStep);
    });
  }

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting&&entry.intersectionRatio>=0.4){
        const step=Number(entry.target.dataset.stepId);
        if(step)setStep(step);
      }
    });
  },{threshold:[0.3,0.5,0.7],rootMargin:'-10% 0px -15% 0px'});

  document.querySelectorAll('.narrative-step').forEach(el=>observer.observe(el));

  document.querySelectorAll('.step-dot').forEach(btn=>{
    btn.onclick=()=>{
      const step=Number(btn.dataset.step);
      const targetEl=document.querySelector(`.narrative-step[data-step-id="${step}"]`);
      if(targetEl)targetEl.scrollIntoView({behavior:'smooth',block:'center'});
      setStep(step);
    };
  });

  const slider=$('#campus-size');
  if(slider){
    const updateSim=()=>{
      const val=Number(slider.value);
      if($('#diner-val'))$('#diner-val').textContent=val;
      if($('#meals-saved'))$('#meals-saved').textContent='Not measured';
      if($('#co2-avoided'))$('#co2-avoided').textContent=Math.round(val*0.27*2.5)+' kg';
      if($('#dollars-saved'))$('#dollars-saved').textContent='Not measured';
    };
    slider.oninput=updateSim;
    updateSim();
  }

  let angle=0;
  function render3D(){
    if(!$('#scrolly-canvas'))return;
    ctx.clearRect(0,0,width,height);

    rotX+=(mouseY-rotX)*0.08;
    rotY+=(mouseX-rotY)*0.08;
    if(pBox){
      pBox.style.transform=`rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
    }

    angle+=0.008;
    const cx=width/2,cy=height/2;
    const stepColor=colors[currentStep]?.p||'#2457d6';

    ctx.save();
    ctx.translate(cx,cy);

    // Orbit Ring
    ctx.beginPath();
    ctx.ellipse(0,35,160,55,angle*0.6,0,Math.PI*2);
    ctx.strokeStyle=stepColor+'26';
    ctx.lineWidth=1.5;
    ctx.stroke();

    // Secondary Dashed Ring
    ctx.beginPath();
    ctx.ellipse(0,35,110,40,-angle*0.8,0,Math.PI*2);
    ctx.strokeStyle=stepColor+'40';
    ctx.lineWidth=2;
    ctx.setLineDash([6,8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3D Particles
    particles.forEach(p=>{
      p.z-=p.speed*1.6;
      if(p.z<-200)p.z=300;
      const fov=380;
      const scale=fov/(fov+p.z);
      const px=p.x*scale;
      const py=p.y*scale+35;

      if(scale>0){
        ctx.beginPath();
        ctx.arc(px,py,p.size*scale,0,Math.PI*2);
        ctx.fillStyle=stepColor;
        ctx.globalAlpha=Math.min(0.7,scale*0.6);
        ctx.fill();
      }
    });
    ctx.restore();

    scrollyAnimId=requestAnimationFrame(render3D);
  }

  if(scrollyAnimId)cancelAnimationFrame(scrollyAnimId);
  render3D();
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
      <form id="auth-login-form" novalidate>
        <input type="text" name="_hp_campus" style="display:none!important;position:absolute;left:-9999px" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="form-group">
          <label for="login-account">Username, Email, or Demo Account</label>
          <input id="login-account" name="account" placeholder="e.g. diner, new-diner, or your username" required autocomplete="username" minlength="2">
          <span class="field-error" id="login-account-error" aria-live="polite"></span>
        </div>
        <div class="form-group">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password" placeholder="Password (optional for demo accounts)" autocomplete="current-password">
          <span class="field-error" id="login-password-error" aria-live="polite"></span>
        </div>
        <p id="auth-error" class="error-msg" role="alert"></p>
        <button type="submit" class="primary full" id="auth-submit-btn">Sign In <span>→</span></button>
        <div class="auth-footer-note">
          <span>Need a new account?</span>
          <button type="button" class="text-button" id="switch-to-register">Register here</button>
        </div>
      </form>
      ` : `
      <form id="auth-register-form" novalidate>
        <input type="text" name="_hp_campus" style="display:none!important;position:absolute;left:-9999px" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="form-group">
          <label for="reg-name">Full Name</label>
          <input id="reg-name" name="name" placeholder="e.g. Maya Chen" required autocomplete="name" minlength="2">
          <span class="field-error" id="reg-name-error" aria-live="polite"></span>
        </div>
        <div class="form-group">
          <label for="reg-username">Username</label>
          <input id="reg-username" name="username" placeholder="e.g. mayachen" required autocomplete="username" minlength="3" maxlength="20" pattern="^[a-zA-Z0-9_-]{3,20}$">
          <span class="field-hint">3-20 characters: letters, numbers, hyphens or underscores.</span>
          <span class="field-error" id="reg-username-error" aria-live="polite"></span>
        </div>
        <div class="form-group">
          <label for="reg-email">Campus Email</label>
          <input id="reg-email" name="email" type="email" placeholder="e.g. maya@campus.edu" autocomplete="email">
          <span class="field-error" id="reg-email-error" aria-live="polite"></span>
        </div>
        <p class="field-hint">New accounts are diners. Kitchen access must be provisioned by your operator.</p>
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
          <input id="reg-password" name="password" type="password" placeholder="At least 12 characters" minlength="12" maxlength="128" required autocomplete="new-password">
          <span class="field-error" id="reg-password-error" aria-live="polite"></span>
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

let renderVersion=0;
async function render(){
  const version=++renderVersion;
  if(scrollyAnimId){
    cancelAnimationFrame(scrollyAnimId);
    scrollyAnimId=null;
  }
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
  if(version!==renderVersion)return;
  $('#app').innerHTML=shell(content);
  bind();
  initCookieBanner();
  if(state.tab==='about'){initScrollytelling();}
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
      const submitButton=$('#modal-submit');if(submitButton)submitButton.disabled=false;
    }
  };
  d.showModal();
}

function bind(){
  if($('#show-tour'))$('#show-tour').onclick=startOnboarding;
  if($('#retry-load'))$('#retry-load').onclick=()=>refresh();
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
    state.tab=b.dataset.tab;
    trackEvent('tab_view',{tab:state.tab});
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  });

  document.querySelectorAll('[data-scroll-cta]').forEach(cta=>{
    cta.onclick=async e=>{
      e.preventDefault();
      trackEvent('cta_click',{action:'plan_tomorrow_lunch'});
      if(state.tab!=='explore'){
        state.tab='explore';
        await render();
      }
      const el=document.getElementById('meals');
      if(el)el.scrollIntoView({behavior:'smooth'});
    };
  });

  document.querySelectorAll('.brand').forEach(brand=>{
    brand.onclick=e=>{
      e.preventDefault();
      if(state.tab!=='explore'){
        state.tab='explore';
        render();
      }
      window.scrollTo({top:0,behavior:'smooth'});
    };
  });

  if($('#logout-btn'))$('#logout-btn').onclick=async()=>{
    try{
      await api('logout',{});
      trackEvent('user_logout');
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
      if(b.disabled)return;
      b.disabled=true;
      const account=b.dataset.demoLogin;
      try{
        const res=await api('demo/login',{account});
        state.user=res.user;
        state.tab=res.user.role==='manager'?'kitchen':'explore';
        trackEvent('demo_login',{account});
        toast(`Signed in as ${res.user.name}`);
        await refresh();
      }catch(err){
        toast(err.message);
      }finally{b.disabled=false;}
    };
  });

  document.querySelectorAll('[data-copy]').forEach(btn=>{
    btn.onclick=async e=>{
      e.stopPropagation();
      try{
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast(`Copied pickup code "${btn.dataset.copy}" to clipboard!`);
      }catch{
        toast(`Pickup Code: ${btn.dataset.copy}`);
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
    if(fd.get('_hp_campus')){
      errEl.textContent='Automated submission blocked.';
      return;
    }
    const account=(fd.get('account')||'').trim();
    if(!account||account.length<2){
      const fieldErr=$('#login-account-error');
      if(fieldErr){fieldErr.textContent='Please enter your username, email, or demo name.';fieldErr.classList.add('show');}
      $('#login-account')?.classList.add('input-invalid');
      $('#login-account')?.focus();
      return;
    }
    const btn=$('#auth-submit-btn');
    btn.disabled=true;
    try{
      const res=await api('login',{account,password:fd.get('password'),_hp_campus:fd.get('_hp_campus')});
      state.user=res.user;
      state.tab=res.user.role==='manager'?'kitchen':'explore';
      trackEvent('user_login',{role:res.user.role});
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
    if(fd.get('_hp_campus')){
      errEl.textContent='Automated submission blocked.';
      return;
    }
    document.querySelectorAll('.field-error').forEach(el=>{el.textContent='';el.classList.remove('show');});
    document.querySelectorAll('.input-invalid').forEach(el=>el.classList.remove('input-invalid'));

    const name=(fd.get('name')||'').trim();
    const username=(fd.get('username')||'').trim();
    const email=(fd.get('email')||'').trim();
    const password=fd.get('password')||'';
    let hasErr=false;

    if(!name||name.length<2){
      const el=$('#reg-name-error');
      if(el){el.textContent='Full name must be at least 2 characters.';el.classList.add('show');}
      $('#reg-name')?.classList.add('input-invalid');
      hasErr=true;
    }
    if(!username||!/^[a-zA-Z0-9_-]{3,20}$/.test(username)){
      const el=$('#reg-username-error');
      if(el){el.textContent='Username must be 3-20 letters, numbers, hyphens or underscores.';el.classList.add('show');}
      $('#reg-username')?.classList.add('input-invalid');
      hasErr=true;
    }
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      const el=$('#reg-email-error');
      if(el){el.textContent='Please enter a valid email address.';el.classList.add('show');}
      $('#reg-email')?.classList.add('input-invalid');
      hasErr=true;
    }
    if(!password||password.length<12||password.length>128){
      const el=$('#reg-password-error');
      if(el){el.textContent='Use 12–128 characters for your password.';el.classList.add('show');}
      $('#reg-password')?.classList.add('input-invalid');
      hasErr=true;
    }

    if(hasErr){
      document.querySelector('.input-invalid')?.focus();
      return;
    }

    const btn=$('#auth-submit-btn');
    btn.disabled=true;
    try{
      const res=await api('register',{
        name,
        username,
        email,
        role:'diner',
        diet:fd.get('diet'),
        password,
        _hp_campus:fd.get('_hp_campus')
      });
      state.user=res.user;
      state.tab=res.user.role==='manager'?'kitchen':'explore';
      trackEvent('user_register',{role:res.user.role,diet:res.user.diet});
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
        state.user=null;
        state.bookings=[];
        state.tab='explore';
      }else{
        const res=await api('demo/login',{account:e.target.value});
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
        <p>Pickup ${time(m.pickup)} · ₹${m.price.toFixed(2)}</p>
        <p>Declared allergens: ${esc(m.allergens.join(', ')||'None declared')}</p>
      </div>
      <label class="consent"><input type="checkbox" required> I have reviewed the meal and pickup details. I will check dietary needs with kitchen staff.</label>
      <small>No payment or incentive is processed in this demo.</small>`,
      async()=>{
        const d=await api(old?`bookings/${old.id}/switch`:'bookings',{serviceId:m.id,requestKey:key,diet:state.diet,avoid:state.avoid,maxWalk:state.maxWalk});
        trackEvent('meal_booked',{serviceId:m.id,name:m.name,kitchen:m.kitchen,isSwitch:Boolean(old)});
        state.tab='bookings';
        return d.message;
      }
    );
  });

  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>modal('Cancel this meal?',`<p>Before the preparation cutoff, your slot becomes available again. After the cutoff, the kitchen may already have started preparation.</p>`,async()=>{
    const d=await api(`bookings/${b.dataset.cancel}/cancel`,{});
    trackEvent('meal_cancelled',{bookingId:b.dataset.cancel});
    return d.message;
  }));

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

  if($('#quick-publish-btn'))$('#quick-publish-btn').onclick=()=>$('#publish')?.click();
  if($('#publish'))$('#publish').onclick=()=>{
    const local=d=>new Date(d-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    modal('Publish a meal',`
      <div class="form-grid">
        <label>Meal name<input name="name" maxlength="120" required></label>
        <label>Kitchen<input name="kitchen" maxlength="120" required></label>
        <label class="wide">Description<textarea name="description" maxlength="400" required></textarea></label>
        <label>Meal category<select name="diet"><option value="vegan">Vegan</option><option value="vegetarian">Vegetarian</option><option value="regular">Regular</option></select></label>
        <label>Price in ₹ (INR)<input name="price" type="number" min="0" max="100" step=".01" required></label>
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
