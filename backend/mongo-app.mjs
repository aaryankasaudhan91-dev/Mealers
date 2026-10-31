import http from 'node:http';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new ApiError(status,message);};
const integer=(n,min=0,max=10000)=>{if(!Number.isInteger(n)||n<min||n>max)fail(400,`Enter a whole number between ${min} and ${max}.`);return n;};
const text=(s,max=120)=>{if(typeof s!=='string'||!s.trim()||s.length>max)fail(400,'Complete the required fields.');return s.trim();};
const bookingView=b=>({...b,id:b._id});
export async function initializeDatabase(db,client,{demo=true,now=Date.now}={}){
 const schemas={users:{bsonType:'object',required:['_id','name','role','operator_id'],properties:{role:{enum:['diner','manager']},operator_id:{bsonType:['int','double']}}},services:{bsonType:'object',required:['_id','name','kitchen','capacity','buffer','remaining','cutoff','pickup','operator_id']},bookings:{bsonType:'object',required:['_id','user_id','service_id','status','token','created'],properties:{status:{enum:['confirmed','collected','cancelled','late_cancelled']}}}};
 const existing=new Set((await db.listCollections().toArray()).map(c=>c.name));
 for(const [name,schema]of Object.entries(schemas))if(!existing.has(name))await db.createCollection(name,{validator:{$jsonSchema:schema}});
 await db.collection('bookings').createIndex({user_id:1},{unique:true,partialFilterExpression:{status:'confirmed'},name:'one_active_meal_per_diner'});
 await db.collection('bookings').createIndex({token:1},{unique:true});
 await db.collection('bookings').createIndex({service_id:1,status:1});
 await db.collection('idempotency').createIndex({user_id:1,key:1},{unique:true});
 await db.collection('auditEvents').createIndex({operator_id:1,at:-1});
 if(!demo||await db.collection('users').countDocuments())return;
 const session=client.startSession();try{await session.withTransaction(async()=>{
  if(await db.collection('users').countDocuments({},{session}))return;
  const users=[{_id:'diner',name:'Alex · demo diner',role:'diner',operator_id:1},{_id:'new-diner',name:'Sam · new diner',role:'diner',operator_id:1},{_id:'eco-diner',name:'Jordan · vegetarian diner',role:'diner',operator_id:1,diet:'vegetarian'},{_id:'manager',name:'Kitchen team · demo',role:'manager',operator_id:1}];
  const cutoff=new Date(now()+7200000).toISOString(),pickup=new Date(now()+10800000).toISOString();
  const services=[{_id:1,name:'Harvest grain bowl',kitchen:'Garden Kitchen',description:'Roasted vegetables, herbed rice, chickpeas and lemon tahini.',diet:'vegan',allergens:['sesame'],walk:4,price:650,capacity:120,buffer:20,remaining:40},{_id:2,name:'Coconut curry & rice',kitchen:'Commons Kitchen',description:'A comforting vegetable curry with fragrant steamed rice.',diet:'vegan',allergens:['soy'],walk:7,price:600,capacity:100,buffer:20,remaining:0},{_id:3,name:'Teriyaki chicken bowl',kitchen:'Commons Kitchen',description:'Glazed chicken, rice, crunchy cabbage and cucumber.',diet:'regular',allergens:['soy','wheat'],walk:7,price:750,capacity:70,buffer:10,remaining:36}].map(s=>({...s,cutoff,pickup,operator_id:1,prepared:null,served:null,waste:null}));
  const bookings=[];for(const [sid,count]of [[1,60],[2,79],[3,24]])for(let n=0;n<count;n++){const uid=`sample-${sid}-${n}`;users.push({_id:uid,name:'Synthetic diner',role:'diner',operator_id:1});bookings.push({_id:randomUUID(),user_id:uid,service_id:sid,status:'confirmed',token:randomBytes(8).toString('hex').toUpperCase(),created:new Date(now()).toISOString(),previous_id:null});}
  bookings.push({_id:randomUUID(),user_id:'diner',service_id:2,status:'confirmed',token:'MEAL-DEMO',created:new Date(now()).toISOString(),previous_id:null});
  await db.collection('users').insertMany(users,{session});await db.collection('services').insertMany(services,{session});await db.collection('bookings').insertMany(bookings,{session});
 });}finally{await session.endSession();}
}
export function createApp({db=null,client=null,now=Date.now,demo=true,allowedOrigin='*',connectionMessage='Add MONGODB_URI to backend/.env and restart the backend.'}={}){
 const sessions=new Map();const col=name=>db.collection(name);
 const parseOrigins=val=>{if(!val||val==='*')return ['*'];return val.split(',').map(s=>s.trim().replace(/\/$/,'')).filter(Boolean);};
 const allowedList=parseOrigins(allowedOrigin);
 const own=(s,u)=>{if(s.operator_id!==u.operator_id)fail(404,'Meal service not found.');};
 const service=async(id,session)=>{const s=await col('services').findOne({_id:id},{session});if(!s)fail(404,'Meal service not found.');return s;};
 const serial=s=>({...s,id:s._id,price:s.price/100,reserved:s.capacity-s.buffer-s.remaining,available:s.remaining,open:Date.parse(s.cutoff)>now()});
 const sanitizeUser=u=>{if(!u)return null;const {passwordHash,...clean}=u;return {...clean,id:clean._id};};
 const rateLimits=new Map();
 const checkRateLimit=ip=>{
  const nowMs=now();
  const rec=rateLimits.get(ip)||{count:0,reset:nowMs+60000};
  if(nowMs>rec.reset){rec.count=0;rec.reset=nowMs+60000;}
  rec.count++;
  rateLimits.set(ip,rec);
  if(rec.count>60)fail(429,'Too many requests. Please wait a moment and try again.');
 };
 const user=async req=>{
  const cookieToken=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('mealers_session='))?.slice(16);
  const headerToken=req.headers['authorization']?.startsWith('Bearer ')?req.headers['authorization'].slice(7).trim():req.headers['x-session-token'];
  const token=cookieToken||headerToken;
  if(!token)fail(401,'Choose a demo account to continue.');
  const s=sessions.get(token);
  if(!s||s.expires<=now())fail(401,'Choose a demo account to continue.');
  const u=await col('users').findOne({_id:s.id});
  if(!u)fail(401,'Choose a demo account.');
  return sanitizeUser(u);
 };
 const manager=async req=>{const u=await user(req);if(u.role!=='manager')fail(403,'Kitchen team access is required.');return u;};
 const opened=s=>{if(Date.parse(s.cutoff)<=now())fail(409,'The preparation cutoff has passed. Your existing booking stays unchanged.');};
 const eligibility=(s,b)=>{if(b.diet&&!['any',s.diet].includes(b.diet)&&!(b.diet==='vegetarian'&&s.diet==='vegan'))fail(409,'This meal does not match the selected dietary preference.');if(Array.isArray(b.avoid)&&b.avoid.some(a=>s.allergens.includes(a)))fail(409,'This meal contains an allergen you selected.');if(b.maxWalk!==undefined&&s.walk>Number(b.maxWalk))fail(409,'This kitchen is outside your walking limit.');};
 const audit=(u,event,detail,session)=>col('auditEvents').insertOne({operator_id:u.operator_id,actor:u.id,event,detail,at:new Date(now()).toISOString()},{session});
 async function transact(fn){const s=client.startSession();try{return await s.withTransaction(()=>fn(s));}finally{await s.endSession();}}
 async function once(u,key,body,fn){text(key,100);const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');try{return await transact(async session=>{const old=await col('idempotency').findOne({user_id:u.id,key},{session});if(old){if(old.hash!==hash)fail(409,'This request key was used for a different action.');return old.response;}const result=await fn(session);await col('idempotency').insertOne({user_id:u.id,key,hash,response:result},{session});return result;});}catch(e){if(e.code===11000){const old=await col('idempotency').findOne({user_id:u.id,key});if(old&&old.hash===hash)return old.response;fail(409,'A conflicting booking already exists. Refresh and try again.');}throw e;}}
 async function reserve(u,s,session,previous=null){opened(s);const r=await col('services').updateOne({_id:s._id,remaining:{$gt:0}},{$inc:{remaining:-1}},{session});if(!r.modifiedCount)fail(409,'That meal has just filled up. Please choose another option.');const b={_id:randomUUID(),user_id:u.id,service_id:s._id,status:'confirmed',token:randomBytes(5).toString('hex').toUpperCase(),created:new Date(now()).toISOString(),previous_id:previous};await col('bookings').insertOne(b,{session});await audit(u,previous?'booking_switched':'booking_created',{id:b._id,serviceId:s._id,previous},session);return{id:b._id,token:b.token,message:previous?'Your meal has been switched.':'Your meal is booked.'};}
 const server=http.createServer(async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname,method=req.method;
  const reqOrigin=req.headers.origin;
  const host=req.headers.host;
  const forwardedHost=req.headers['x-forwarded-host'];
  const isOriginAllowed=!reqOrigin||allowedList.includes('*')||allowedList.includes(reqOrigin)||(host&&reqOrigin===`http://${host}`)||(host&&reqOrigin===`https://${host}`)||(forwardedHost&&reqOrigin===`https://${forwardedHost}`);
  const corsHeaders={};
  if(reqOrigin&&isOriginAllowed){
   corsHeaders['Access-Control-Allow-Origin']=reqOrigin;
   corsHeaders['Access-Control-Allow-Credentials']='true';
   corsHeaders['Access-Control-Allow-Methods']='GET, POST, PUT, DELETE, OPTIONS';
   corsHeaders['Access-Control-Allow-Headers']='Content-Type, Authorization, x-session-token, Cookie';
  }
  const send=(targetRes,status,data,headers={})=>{
   targetRes.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...corsHeaders,...headers});
   targetRes.end(JSON.stringify(data));
  };
  try{
   if(method==='OPTIONS'){
    res.writeHead(204,{...corsHeaders,'Content-Length':'0'});
    return res.end();
   }
   if(!route.startsWith('/api/'))fail(404,'The backend serves API endpoints only.');
   if(route==='/api/health'&&method==='GET')return send(res,db?200:503,{status:db?'ok':'setup_required',database:'mongodb',configured:!!db,demo,message:db?'MongoDB connected':connectionMessage});
   if(route==='/api/session'&&method==='GET'){let u=null;if(db)try{u=await user(req);}catch{}return send(res,200,{user:u,demo,setupRequired:!db,message:db?null:connectionMessage});}
   if(!db)fail(503,connectionMessage);
   let b={};if(method==='POST'){
    const clientIp=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'local';
    checkRateLimit(clientIp);
    if(!(req.headers['content-type']||'').includes('application/json'))fail(415,'JSON content is required.');
    if(req.headers.origin&&!isOriginAllowed)fail(403,'This request did not come from an authorized Mealers origin.');
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)fail(413,'Request is too large.');}
    try{b=JSON.parse(raw||'{}');}catch{fail(400,'Invalid request data.');}
    if(b._hp_campus)fail(400,'Automated submission detected.');
   }
   if(route==='/api/analytics'&&method==='POST'){
    return send(res,200,{ok:true});
   }
   if(route==='/api/demo/login'&&method==='POST'){
    if(!demo)fail(404,'Demo accounts are disabled.');
    const validDemos=['diner','new-diner','eco-diner','manager','chef'];
    if(!validDemos.includes(b.account))fail(400,'Choose a valid demo account.');
    let u=await col('users').findOne({_id:b.account});
    if(!u){
     if(b.account==='eco-diner')u={_id:'eco-diner',name:'Jordan · vegetarian diner',role:'diner',operator_id:1,diet:'vegetarian'};
     else if(b.account==='chef')u={_id:'chef',name:'Elena · campus chef demo',role:'manager',operator_id:1};
     else fail(503,'Demo identities have not been provisioned.');
     try{await col('users').insertOne(u);}catch{}
    }
    const token=randomBytes(24).toString('hex');
    sessions.set(token,{id:u._id,expires:now()+28800000});
    const isHttps=req.headers['x-forwarded-proto']==='https'||req.socket?.encrypted;
    return send(res,200,{user:sanitizeUser(u),token},{'Set-Cookie':`mealers_session=${token}; HttpOnly; SameSite=${isHttps?'None':'Lax'}; ${isHttps?'Secure; ':''}Path=/; Max-Age=28800`});
   }
   if(route==='/api/login'&&method==='POST'){
    const rawAccount=(b.account||b.username||b.email||'').trim();
    if(!rawAccount)fail(400,'Please enter your username, email or demo account.');
    const demoAccounts=['diner','new-diner','eco-diner','manager','chef'];
    if(demoAccounts.includes(rawAccount)){
     let u=await col('users').findOne({_id:rawAccount});
     if(!u){
      if(rawAccount==='eco-diner')u={_id:'eco-diner',name:'Jordan · vegetarian diner',role:'diner',operator_id:1,diet:'vegetarian'};
      else if(rawAccount==='chef')u={_id:'chef',name:'Elena · campus chef demo',role:'manager',operator_id:1};
      else fail(404,'Demo account not provisioned.');
      try{await col('users').insertOne(u);}catch{}
     }
     const token=randomBytes(24).toString('hex');
     sessions.set(token,{id:u._id,expires:now()+28800000});
     const isHttps=req.headers['x-forwarded-proto']==='https'||req.socket?.encrypted;
     return send(res,200,{user:sanitizeUser(u),token},{'Set-Cookie':`mealers_session=${token}; HttpOnly; SameSite=${isHttps?'None':'Lax'}; ${isHttps?'Secure; ':''}Path=/; Max-Age=28800`});
    }
    const u=await col('users').findOne({$or:[{_id:rawAccount.toLowerCase()},{email:rawAccount.toLowerCase()}]});
    if(!u)fail(404,'Account not found. Please register or check your username/email.');
    if(u.passwordHash){
     const pass=String(b.password||'');
     const hash=createHash('sha256').update(pass).digest('hex');
     if(hash!==u.passwordHash)fail(401,'Incorrect password. Please try again.');
    }
    const token=randomBytes(24).toString('hex');
    sessions.set(token,{id:u._id,expires:now()+28800000});
    const isHttps=req.headers['x-forwarded-proto']==='https'||req.socket?.encrypted;
    return send(res,200,{user:sanitizeUser(u),token},{'Set-Cookie':`mealers_session=${token}; HttpOnly; SameSite=${isHttps?'None':'Lax'}; ${isHttps?'Secure; ':''}Path=/; Max-Age=28800`});
   }
   if(route==='/api/register'&&method==='POST'){
    const name=text(b.name||'',80);
    const rawId=text(b.username||b.email||'',80);
    const userId=rawId.toLowerCase().replace(/[^a-z0-9_.-]/g,'-');
    if(!userId||userId.length<3)fail(400,'Username must be at least 3 characters.');
    const email=b.email?text(b.email,120).toLowerCase():`${userId}@campus.demo`;
    const role=b.role==='manager'?'manager':'diner';
    const diet=['vegan','vegetarian','regular','any'].includes(b.diet)?b.diet:'any';
    const existing=await col('users').findOne({$or:[{_id:userId},{email}]});
    if(existing)fail(409,'An account with this username or email already exists.');
    const newUser={_id:userId,name,email,role,diet,operator_id:1,created:new Date(now()).toISOString()};
    if(b.password&&String(b.password).length>=4){
     newUser.passwordHash=createHash('sha256').update(String(b.password)).digest('hex');
    }
    await col('users').insertOne(newUser);
    const token=randomBytes(24).toString('hex');
    sessions.set(token,{id:newUser._id,expires:now()+28800000});
    const isHttps=req.headers['x-forwarded-proto']==='https'||req.socket?.encrypted;
    return send(res,201,{user:sanitizeUser(newUser),token},{'Set-Cookie':`mealers_session=${token}; HttpOnly; SameSite=${isHttps?'None':'Lax'}; ${isHttps?'Secure; ':''}Path=/; Max-Age=28800`});
   }
   if(route==='/api/logout'&&method==='POST'){const cookieToken=(req.headers.cookie||'').match(/mealers_session=([^;]+)/)?.[1];const headerToken=req.headers['authorization']?.startsWith('Bearer ')?req.headers['authorization'].slice(7).trim():req.headers['x-session-token'];const token=cookieToken||headerToken;if(token)sessions.delete(token);return send(res,200,{ok:true},{'Set-Cookie':'mealers_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});}
   if(route==='/api/meals'&&method==='GET')return send(res,200,{meals:(await col('services').find({operator_id:1}).sort({_id:1}).toArray()).map(serial),demo});
   if(route==='/api/bookings'&&method==='GET'){const u=await user(req),rows=await col('bookings').find({user_id:u.id}).sort({created:-1}).toArray();return send(res,200,{bookings:await Promise.all(rows.map(async r=>({...bookingView(r),meal:serial(await service(r.service_id))})))});}
   if(route==='/api/bookings'&&method==='POST'){const u=await user(req);if(u.role!=='diner')fail(403,'Choose a diner account to book a meal.');return send(res,201,await once(u,b.requestKey,b,async session=>{const s=await service(integer(b.serviceId,1),session);own(s,u);eligibility(s,b);if(await col('bookings').findOne({user_id:u.id,status:'confirmed'},{session}))fail(409,'You already have a meal. Use Switch meal instead.');return reserve(u,s,session);}));}
   const action=route.match(/^\/api\/bookings\/([^/]+)\/(switch|cancel)$/);
   if(action&&method==='POST'){const u=await user(req);const fn=async session=>{const old=await col('bookings').findOne({_id:action[1],user_id:u.id},{session});if(!old)fail(404,'Booking not found.');if(old.status!=='confirmed')fail(409,'This booking is no longer active.');const source=await service(old.service_id,session);own(source,u);if(action[2]==='switch'){opened(source);const target=await service(integer(b.serviceId,1),session);own(target,u);opened(target);eligibility(target,b);if(target._id===source._id)fail(409,'This is already your meal.');await col('bookings').updateOne({_id:old._id},{$set:{status:'cancelled'}},{session});const result=await reserve(u,target,session,old._id);await col('services').updateOne({_id:source._id},{$inc:{remaining:1}},{session});return result;}const late=Date.parse(source.cutoff)<=now();await col('bookings').updateOne({_id:old._id},{$set:{status:late?'late_cancelled':'cancelled'}},{session});if(!late)await col('services').updateOne({_id:source._id},{$inc:{remaining:1}},{session});await audit(u,'booking_cancelled',{id:old._id,late},session);return{message:late?'Late cancellation recorded. Preparation may already have started.':'Booking cancelled. The slot is available again.'};};return send(res,200,action[2]==='switch'?await once(u,b.requestKey,{...b,id:action[1]},fn):await transact(fn));}
   if(route==='/api/kitchen'&&method==='GET'){const u=await manager(req);return send(res,200,{meals:(await col('services').find({operator_id:u.operator_id}).sort({_id:1}).toArray()).map(serial),events:await col('auditEvents').find({operator_id:u.operator_id}).sort({at:-1}).limit(12).toArray()});}
   if(route==='/api/services'&&method==='POST'){const u=await manager(req),capacity=integer(b.capacity,1,1000),buffer=integer(b.buffer,0,1000);if(buffer>=capacity)fail(400,'The buffer must be smaller than total capacity.');const cutoff=Date.parse(b.cutoff),pickup=Date.parse(b.pickup);if(!Number.isFinite(cutoff)||!Number.isFinite(pickup)||cutoff<=now()||pickup<=cutoff)fail(400,'Set a future cutoff before pickup.');if(!['vegan','vegetarian','regular'].includes(b.diet)||!Array.isArray(b.allergens)||b.allergens.some(a=>!['sesame','soy','wheat','peanuts','milk','eggs'].includes(a)))fail(400,'Check the meal category and allergen declarations.');const row={_id:Date.now()*1000+Math.floor(Math.random()*1000),name:text(b.name),kitchen:text(b.kitchen),description:text(b.description,400),diet:b.diet,allergens:b.allergens,walk:integer(b.walk,1,30),price:integer(b.price,0,10000),capacity,buffer,remaining:capacity-buffer,cutoff:new Date(cutoff).toISOString(),pickup:new Date(pickup).toISOString(),operator_id:u.operator_id,prepared:null,served:null,waste:null};await transact(async session=>{await col('services').insertOne(row,{session});await audit(u,'service_published',{id:row._id},session);});return send(res,201,{message:'Meal service published.'});}
   const plan=route.match(/^\/api\/services\/(\d+)\/(plan|reconcile)$/);
   if(plan&&method==='POST'){const u=await manager(req);return send(res,200,await transact(async session=>{const s=await service(Number(plan[1]),session);own(s,u);if(plan[2]==='plan'){const prepared=integer(b.prepared,s.capacity-s.buffer-s.remaining,s.capacity);await col('services').updateOne({_id:s._id},{$set:{prepared}},{session});await audit(u,'plan_approved',{id:s._id,prepared},session);return{message:'Preparation plan approved.'};}const prepared=integer(b.prepared,0,s.capacity),served=integer(b.served,0,prepared),waste=integer(b.waste,0,prepared-served),collected=await col('bookings').countDocuments({service_id:s._id,status:'collected'},{session});if(served<collected)fail(400,'Servings cannot be fewer than recorded pickups.');await col('services').updateOne({_id:s._id},{$set:{prepared,served,waste}},{session});await audit(u,'service_reconciled',{id:s._id,prepared,served,waste},session);return{message:'Service totals saved.'};}));}
   if(route==='/api/pickups'&&method==='POST'){const u=await manager(req);return send(res,200,await transact(async session=>{const row=await col('bookings').findOne({token:text(b.token).toUpperCase()},{session});if(!row)fail(404,'Pickup code not found.');const s=await service(row.service_id,session);own(s,u);if(row.status!=='confirmed')fail(409,'This code was already collected or cancelled.');if(now()>Date.parse(s.pickup)+3600000)fail(409,'The pickup window has expired.');await col('bookings').updateOne({_id:row._id},{$set:{status:'collected'}},{session});await audit(u,'pickup_collected',{id:row._id},session);return{message:'Pickup confirmed. This code cannot be used again.'};}));}
   if(route==='/api/report'&&method==='GET'){const u=await manager(req),services=await col('services').find({operator_id:u.operator_id}).toArray(),bookings=await col('bookings').find({service_id:{$in:services.map(s=>s._id)}}).toArray(),counts={};for(const row of bookings)counts[row.status]=(counts[row.status]||0)+1;return send(res,200,{counts:Object.entries(counts).map(([status,n])=>({status,n})),switched:bookings.filter(b=>b.previous_id).length,reportedServices:services.filter(s=>s.served!==null).length,served:services.reduce((n,s)=>n+(s.served||0),0),unused:services.reduce((n,s)=>n+(s.waste||0),0),demo});}
   fail(404,'That action could not be found.');
  }catch(e){if(e.status)return send(res,e.status,{message:e.message});if(e.code===11000)return send(res,409,{message:'A conflicting booking already exists. Refresh and try again.'});console.error('Mealers request failed:',e.name||e.message);send(res,503,{message:'The database action could not complete. Your previous booking is preserved; refresh and retry.'});}
 });
 return{server,sessions};
}
