import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,message)=>{throw new ApiError(status,message);};
const int=(v,min=0,max=10000)=>{if(!Number.isInteger(v)||v<min||v>max)fail(400,`Enter a whole number between ${min} and ${max}.`);return v;};
const str=(v,max=120)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,'Please complete all required fields.');return v.trim();};
export function createApp({dbPath=':memory:',now=()=>Date.now(),demo=true}={}){
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,role TEXT,operator_id INTEGER);
 CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY,name TEXT,kitchen TEXT,description TEXT,diet TEXT,allergens TEXT,walk INTEGER,price INTEGER,capacity INTEGER,buffer INTEGER,cutoff TEXT,pickup TEXT,operator_id INTEGER,prepared INTEGER,served INTEGER,waste INTEGER);
 CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),service_id INTEGER REFERENCES services(id),status TEXT CHECK(status IN ('confirmed','collected','cancelled','late_cancelled')),token TEXT UNIQUE,created TEXT,previous_id TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking ON bookings(user_id) WHERE status='confirmed';
 CREATE TABLE IF NOT EXISTS requests(user_id TEXT,key TEXT,hash TEXT,response TEXT,PRIMARY KEY(user_id,key));
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT,event TEXT,detail TEXT,at TEXT);`);
 const sessions=new Map();
 const audit=(user,event,detail)=>db.prepare('INSERT INTO audit(actor,event,detail,at) VALUES(?,?,?,?)').run(user.id,event,JSON.stringify(detail),new Date(now()).toISOString());
 if(!db.prepare('SELECT id FROM users LIMIT 1').get()){
  const addUser=db.prepare('INSERT INTO users VALUES(?,?,?,?)');
  addUser.run('diner','Alex · demo diner','diner',1);addUser.run('new-diner','Sam · new diner','diner',1);addUser.run('manager','Kitchen team · demo','manager',1);addUser.run('other-manager','Other operator','manager',2);
  const cutoff=new Date(now()+2*3600000).toISOString(),pickup=new Date(now()+3*3600000).toISOString();
  const addService=db.prepare('INSERT INTO services VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)');
  addService.run(1,'Harvest grain bowl','Garden Kitchen','Roasted vegetables, herbed rice, chickpeas and lemon tahini.','vegan','sesame',4,650,120,20,cutoff,pickup,1);
  addService.run(2,'Coconut curry & rice','Commons Kitchen','A comforting vegetable curry with fragrant steamed rice.','vegan','soy',7,600,100,20,cutoff,pickup,1);
  addService.run(3,'Teriyaki chicken bowl','Commons Kitchen','Glazed chicken, rice, crunchy cabbage and cucumber.','regular','soy,wheat',7,750,70,10,cutoff,pickup,1);
  const addBooking=db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,NULL)');
  for(const [sid,count]of [[1,60],[2,79],[3,24]])for(let i=0;i<count;i++){const id=`sample-${sid}-${i}`;addUser.run(id,'Synthetic diner','diner',1);addBooking.run(randomUUID(),id,sid,'confirmed',randomBytes(5).toString('hex').toUpperCase(),new Date(now()).toISOString());}
  addBooking.run(randomUUID(),'diner',2,'confirmed','MEAL-DEMO',new Date(now()).toISOString());
 }
 const used=sid=>Number(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE service_id=? AND status IN ('confirmed','collected','late_cancelled')").get(sid).n);
 const service=sid=>{const s=db.prepare('SELECT * FROM services WHERE id=?').get(sid);if(!s)fail(404,'Meal service not found.');return s;};
 const serial=s=>({...s,allergens:s.allergens?s.allergens.split(','):[],reserved:used(s.id),available:Math.max(0,s.capacity-s.buffer-used(s.id)),open:Date.parse(s.cutoff)>now(),price:s.price/100});
 const booking=id=>{const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(id);if(!b)fail(404,'Booking not found.');return b;};
 const userFor=req=>{const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('mealers_session='))?.slice(16);const session=sessions.get(token);if(!session||session.expires<now())fail(401,'Choose a demo account to continue.');return db.prepare('SELECT * FROM users WHERE id=?').get(session.id);};
 const manager=req=>{const u=userFor(req);if(u.role!=='manager')fail(403,'Kitchen team access is required.');return u;};
 const owned=(s,u)=>{if(s.operator_id!==u.operator_id)fail(404,'Meal service not found.');};
 const eligibility=(s,body)=>{if(body.diet&&!['any',s.diet].includes(body.diet)&&!(body.diet==='vegetarian'&&s.diet==='vegan'))fail(409,'This meal does not match the selected dietary preference.');const avoid=Array.isArray(body.avoid)?body.avoid:[];if(avoid.some(x=>s.allergens.split(',').includes(x)))fail(409,'This meal contains an allergen you selected.');if(body.maxWalk!==undefined&&s.walk>Number(body.maxWalk))fail(409,'This kitchen is outside your walking limit.');};
 const open=s=>{if(Date.parse(s.cutoff)<=now())fail(409,'The preparation cutoff has passed. Your existing booking stays unchanged.');};
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const idempotent=(u,key,body,fn)=>{str(key,100);const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');return tx(()=>{const old=db.prepare('SELECT * FROM requests WHERE user_id=? AND key=?').get(u.id,key);if(old){if(old.hash!==hash)fail(409,'This request key was used for a different action.');return JSON.parse(old.response);}const result=fn();db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(u.id,key,hash,JSON.stringify(result));return result;});};
 const createBooking=(u,s,previous=null)=>{open(s);if(used(s.id)>=s.capacity-s.buffer)fail(409,'That meal has just filled up. Please choose another option.');const id=randomUUID(),token=randomBytes(5).toString('hex').toUpperCase();db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run(id,u.id,s.id,'confirmed',token,new Date(now()).toISOString(),previous);audit(u,previous?'booking_switched':'booking_created',{id,serviceId:s.id,previous});return {id,token,message:previous?'Your meal has been switched.':'Your meal is booked.'};};
 async function bodyOf(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)fail(413,'Request is too large.');}try{return JSON.parse(raw||'{}');}catch{fail(400,'Invalid request data.');}}
 function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),route=url.pathname,method=req.method;
  if(route.startsWith('/api/')){
   if(method==='POST'){if(!(req.headers['content-type']||'').includes('application/json'))fail(415,'JSON content is required.');if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)fail(403,'This request did not come from Mealers.');}
   const body=method==='POST'?await bodyOf(req):{};
   if(route==='/api/health'&&method==='GET')return send(res,200,{status:'ok',demo});
   if(route==='/api/session'&&method==='GET'){try{return send(res,200,{user:userFor(req),demo});}catch{return send(res,200,{user:null,demo});}}
   if(route==='/api/demo/login'&&method==='POST'){if(!demo)fail(404,'Demo accounts are disabled.');if(!['diner','new-diner','manager'].includes(body.account))fail(400,'Choose a valid demo account.');const token=randomBytes(24).toString('hex');sessions.set(token,{id:body.account,expires:now()+8*3600000});return send(res,200,{user:db.prepare('SELECT * FROM users WHERE id=?').get(body.account)},{'Set-Cookie':`mealers_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});}
   if(route==='/api/logout'&&method==='POST')return send(res,200,{ok:true},{'Set-Cookie':'mealers_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
   if(route==='/api/meals'&&method==='GET'){const all=db.prepare('SELECT * FROM services WHERE operator_id=1 ORDER BY id').all();return send(res,200,{meals:all.map(serial),demo});}
   if(route==='/api/bookings'&&method==='GET'){const u=userFor(req);return send(res,200,{bookings:db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY created DESC,id').all(u.id).map(b=>({...b,meal:serial(service(b.service_id))}))});}
   if(route==='/api/bookings'&&method==='POST'){const u=userFor(req);if(u.role!=='diner')fail(403,'Choose a diner account to book a meal.');const s=service(int(body.serviceId,1));owned(s,u);eligibility(s,body);return send(res,201,idempotent(u,body.requestKey,body,()=>{if(db.prepare("SELECT id FROM bookings WHERE user_id=? AND status='confirmed'").get(u.id))fail(409,'You already have a meal. Use Switch meal instead.');return createBooking(u,s);}));}
   const switchMatch=route.match(/^\/api\/bookings\/([^/]+)\/switch$/);
   if(switchMatch&&method==='POST'){const u=userFor(req);return send(res,200,idempotent(u,body.requestKey,{...body,bookingId:switchMatch[1]},()=>{const old=booking(switchMatch[1]);if(old.user_id!==u.id)fail(404,'Booking not found.');if(old.status!=='confirmed')fail(409,'Only an active booking can be switched.');const source=service(old.service_id),target=service(int(body.serviceId,1));owned(target,u);open(source);open(target);eligibility(target,body);if(source.id===target.id)fail(409,'This is already your meal.');db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(old.id);return createBooking(u,target,old.id);}));}
   const cancelMatch=route.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
   if(cancelMatch&&method==='POST'){const u=userFor(req);return send(res,200,tx(()=>{const b=booking(cancelMatch[1]);if(b.user_id!==u.id)fail(404,'Booking not found.');if(b.status!=='confirmed')fail(409,'This booking is no longer active.');const late=Date.parse(service(b.service_id).cutoff)<=now();db.prepare('UPDATE bookings SET status=? WHERE id=?').run(late?'late_cancelled':'cancelled',b.id);audit(u,'booking_cancelled',{id:b.id,late});return {message:late?'Late cancellation recorded. Preparation may already have started.':'Booking cancelled. The slot is available again.'};}));}
   if(route==='/api/kitchen'&&method==='GET'){const u=manager(req);return send(res,200,{meals:db.prepare('SELECT * FROM services WHERE operator_id=? ORDER BY id').all(u.operator_id).map(serial),events:db.prepare('SELECT event,detail,at FROM audit ORDER BY id DESC LIMIT 12').all()});}
   if(route==='/api/services'&&method==='POST'){const u=manager(req);const name=str(body.name),kitchen=str(body.kitchen),capacity=int(body.capacity,1,1000),buffer=int(body.buffer,0,1000);if(buffer>=capacity)fail(400,'The buffer must be smaller than total capacity.');if(!['vegan','vegetarian','regular'].includes(body.diet))fail(400,'Choose a dietary category.');const cutoff=Date.parse(body.cutoff),pickup=Date.parse(body.pickup);if(!Number.isFinite(cutoff)||!Number.isFinite(pickup)||cutoff<=now()||pickup<=cutoff)fail(400,'Set a future cutoff before the pickup time.');const valid=['sesame','soy','wheat','peanuts','milk','eggs'];if(!Array.isArray(body.allergens)||body.allergens.some(x=>!valid.includes(x)))fail(400,'Select valid allergen declarations.');const r=db.prepare('INSERT INTO services(name,kitchen,description,diet,allergens,walk,price,capacity,buffer,cutoff,pickup,operator_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(name,kitchen,str(body.description,400),body.diet,body.allergens.join(','),int(body.walk,1,30),int(body.price,0,10000),capacity,buffer,new Date(cutoff).toISOString(),new Date(pickup).toISOString(),u.operator_id);audit(u,'service_published',{id:Number(r.lastInsertRowid)});return send(res,201,{message:'Meal service published.'});}
   const planMatch=route.match(/^\/api\/services\/(\d+)\/plan$/);
   if(planMatch&&method==='POST'){const u=manager(req),s=service(Number(planMatch[1]));owned(s,u);return send(res,200,tx(()=>{const prepared=int(body.prepared,used(s.id),s.capacity);db.prepare('UPDATE services SET prepared=? WHERE id=?').run(prepared,s.id);audit(u,'plan_approved',{id:s.id,prepared});return {message:'Preparation plan approved.'};}));}
   const reconcileMatch=route.match(/^\/api\/services\/(\d+)\/reconcile$/);
   if(reconcileMatch&&method==='POST'){const u=manager(req),s=service(Number(reconcileMatch[1]));owned(s,u);const prepared=int(body.prepared,0,s.capacity),served=int(body.served,0,prepared),waste=int(body.waste,0,prepared-served);const collected=Number(db.prepare("SELECT COUNT(*) n FROM bookings WHERE service_id=? AND status='collected'").get(s.id).n);if(served<collected)fail(400,'Servings cannot be fewer than recorded pickups.');db.prepare('UPDATE services SET prepared=?,served=?,waste=? WHERE id=?').run(prepared,served,waste,s.id);audit(u,'service_reconciled',{id:s.id,prepared,served,waste});return send(res,200,{message:'Service totals saved.'});}
   if(route==='/api/pickups'&&method==='POST'){const u=manager(req);return send(res,200,tx(()=>{const b=db.prepare('SELECT * FROM bookings WHERE token=?').get(str(body.token).toUpperCase());if(!b)fail(404,'Pickup code not found.');owned(service(b.service_id),u);if(b.status!=='confirmed')fail(409,'This code was already collected or cancelled.');if(now()>Date.parse(service(b.service_id).pickup)+3600000)fail(409,'The pickup window has expired.');db.prepare("UPDATE bookings SET status='collected' WHERE id=?").run(b.id);audit(u,'pickup_collected',{id:b.id});return {message:'Pickup confirmed. This code cannot be used again.'};}));}
   if(route==='/api/report'&&method==='GET'){const u=manager(req);const meals=db.prepare('SELECT * FROM services WHERE operator_id=?').all(u.operator_id);const counts=db.prepare(`SELECT b.status,COUNT(*) n FROM bookings b JOIN services s ON s.id=b.service_id WHERE s.operator_id=? GROUP BY b.status`).all(u.operator_id);const switched=Number(db.prepare('SELECT COUNT(*) n FROM bookings b JOIN services s ON s.id=b.service_id WHERE s.operator_id=? AND b.previous_id IS NOT NULL').get(u.operator_id).n);return send(res,200,{counts,switched,reportedServices:meals.filter(s=>s.served!==null).length,served:meals.reduce((n,s)=>n+(s.served||0),0),unused:meals.reduce((n,s)=>n+(s.waste||0),0),demo});}
   fail(404,'That action could not be found.');
  }
  if(method!=='GET')fail(405,'Method not allowed.');
  const name=route==='/'?'index.html':decodeURIComponent(route).slice(1),file=path.resolve(ROOT,'public',name);
  if(!file.startsWith(path.join(ROOT,'public')+path.sep)||!existsSync(file))return send(res,404,{message:'Page not found.'});
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(readFileSync(file));
 }catch(e){if(!res.headersSent)send(res,e.status||500,{message:e.status?e.message:'Something went wrong. Please try again.'});else res.end();if(!e.status)console.error(e);}});
 return {server,db};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.NODE_ENV==='production')throw Error('This MVP uses synthetic demo accounts. Add real authentication before production deployment.');
 mkdirSync(path.join(ROOT,'data'),{recursive:true});const {server}=createApp({dbPath:path.join(ROOT,'data','mealers.sqlite')});server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Mealers demo ready at http://localhost:${process.env.PORT||3000}`));
}

