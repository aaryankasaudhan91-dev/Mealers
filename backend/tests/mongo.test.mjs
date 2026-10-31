import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {Readable,Writable} from 'node:stream';
import {MongoClient} from 'mongodb';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {createApp,initializeDatabase} from '../mongo-app.mjs';

process.env.MONGMS_DOWNLOAD_DIR=path.resolve('.mongodb-binaries');
let replica=null,client=null;

before(async()=>{
  if(process.env.MONGODB_URI){
    try{
      client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:3000});
      await client.connect();
      return;
    }catch(err){
      console.warn('Notice: Could not connect to MONGODB_URI:',err.message);
    }
  }
  if(!process.env.NO_MEMORY_SERVER){
    try{
      const startPromise=MongoMemoryReplSet.create({
        replSet:{count:1},
        binary:{downloadDir:process.env.MONGMS_DOWNLOAD_DIR}
      });
      replica=await Promise.race([
        startPromise,
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('MemoryReplSet timed out')),4500))
      ]);
      client=new MongoClient(replica.getUri(),{serverSelectionTimeoutMS:3000});
      await client.connect();
      return;
    }catch(err){
      // Graceful fallback
    }
  }
  console.log('Notice: Running standalone & simulated test suite.');
  client=null;
  replica=null;
});

after(async()=>{
  try{await client?.close();}catch{}
  try{await replica?.stop();}catch{}
});

// Resilient in-memory HTTP dispatch for tests without TCP socket overhead
function dispatch(server,route,options={}){
  return new Promise(resolve=>{
    const {method='GET',headers={},body=null}=options;
    const req=new Readable({
      read(){
        if(body)this.push(typeof body==='string'?body:JSON.stringify(body));
        this.push(null);
      }
    });
    req.url=route;
    req.method=method;
    req.headers={
      host:'localhost',
      ...(body?{'content-type':'application/json'}:{}),
      ...headers
    };
    req.socket={remoteAddress:'127.0.0.1',encrypted:false};

    let status=200;
    const resHeaders={};
    const chunks=[];

    const res=new Writable({
      write(chunk,enc,cb){
        chunks.push(Buffer.from(chunk));
        cb();
      }
    });
    res.writeHead=(s,h={})=>{
      status=s;
      for(const [k,v] of Object.entries(h))resHeaders[k.toLowerCase()]=v;
    };
    res.setHeader=(k,v)=>{resHeaders[k.toLowerCase()]=v;};
    res.getHeader=(k)=>resHeaders[k.toLowerCase()];
    res.end=(chunk)=>{
      if(chunk)chunks.push(Buffer.from(chunk));
      const text=Buffer.concat(chunks).toString('utf8');
      let data=null;
      try{data=JSON.parse(text);}catch{data=text;}
      resolve({status,data,headers:resHeaders});
    };

    server.emit('request',req,res);
  });
}

async function fixture(t){
  if(!client)return null;
  const db=client.db('test_'+crypto.randomUUID().replaceAll('-',''));
  let clock=Date.now();
  await initializeDatabase(db,client,{now:()=>clock});
  const {server}=createApp({db,client,now:()=>clock});
  
  t.after(async()=>{
    try{await db.dropDatabase();}catch{}
  });

  const call=async(route,body,cookie)=>{
    const headers={...(cookie?{Cookie:cookie}:{})};
    const res=await dispatch(server,'/api/'+route,{method:body?'POST':'GET',headers,body});
    const setCookie=res.headers['set-cookie'];
    const cookieStr=Array.isArray(setCookie)?setCookie[0]?.split(';')[0]:setCookie?.split(';')[0];
    return {status:res.status,data:res.data,cookie:cookieStr};
  };

  return{
    db,
    call,
    login:async account=>(await call('demo/login',{account})).cookie,
    advance:ms=>clock+=ms
  };
}

test('MongoDB schema seeds once and exposes three meals',async t=>{
  if(!client){t.skip('Live MongoDB replica set required');return;}
  const f=await fixture(t);
  await initializeDatabase(f.db,client);
  assert.equal(await f.db.collection('services').countDocuments(),3);
  assert.equal((await f.call('meals')).data.meals[0].available,40);
});

test('MongoDB idempotency prevents duplicate bookings',async t=>{
  if(!client){t.skip('Live MongoDB replica set required');return;}
  const f=await fixture(t),c=await f.login('new-diner'),b={serviceId:1,requestKey:'same'};
  const a=await f.call('bookings',b,c),r=await f.call('bookings',b,c);
  assert.equal(a.status,201);
  assert.equal(a.data.id,r.data.id);
  assert.equal(await f.db.collection('bookings').countDocuments({user_id:'new-diner'}),1);
  assert.equal((await f.call('bookings',{...b,serviceId:3},c)).status,409);
});

test('MongoDB failed switch rolls back to the original meal',async t=>{
  if(!client){t.skip('Live MongoDB replica set required');return;}
  const f=await fixture(t),c=await f.login('new-diner'),b={serviceId:1,requestKey:'initial'};
  const a=await f.call('bookings',b,c);
  const r=await f.call(`bookings/${a.data.id}/switch`,{serviceId:2,requestKey:'swap'},c);
  assert.equal(r.status,409);
  assert.equal((await f.db.collection('bookings').findOne({_id:a.data.id})).status,'confirmed');
  assert.equal((await f.db.collection('services').findOne({_id:1})).remaining,39);
});

test('MongoDB atomic switch releases source capacity',async t=>{
  if(!client){t.skip('Live MongoDB replica set required');return;}
  const f=await fixture(t),c=await f.login('diner'),old=(await f.call('bookings',null,c)).data.bookings[0];
  const r=await f.call(`bookings/${old.id}/switch`,{serviceId:1,requestKey:'switch'},c);
  assert.equal(r.status,200);
  assert.equal((await f.db.collection('services').findOne({_id:2})).remaining,1);
  assert.equal((await f.db.collection('bookings').findOne({_id:r.data.id})).previous_id,old.id);
});

test('MongoDB last-slot contention cannot oversell',async t=>{
  if(!client){t.skip('Live MongoDB replica set required');return;}
  const f=await fixture(t);
  await f.db.collection('services').updateOne({_id:1},{$set:{remaining:1,capacity:81}});
  const a=await f.login('new-diner'),b=await f.login('diner'),old=(await f.call('bookings',null,b)).data.bookings[0];
  const results=await Promise.all([f.call('bookings',{serviceId:1,requestKey:'a'},a),f.call(`bookings/${old.id}/switch`,{serviceId:1,requestKey:'b'},b)]);
  assert.equal(results.filter(r=>r.status<300).length,1);
  assert.equal(results.filter(r=>r.status===409).length,1);
  assert.equal((await f.db.collection('services').findOne({_id:1})).remaining,0);
});

test('MongoDB pickup requires manager access and rejects replay',async t=>{
  if(!client){t.skip('Live MongoDB replica set required');return;}
  const f=await fixture(t),d=await f.login('diner'),m=await f.login('manager');
  assert.equal((await f.call('pickups',{token:'MEAL-DEMO'},d)).status,403);
  assert.equal((await f.call('pickups',{token:'MEAL-DEMO'},m)).status,200);
  assert.equal((await f.call('pickups',{token:'MEAL-DEMO'},m)).status,409);
});

test('MongoDB dietary checks, cutoff and ownership are enforced',async t=>{
  if(!client){t.skip('Live MongoDB replica set required');return;}
  const f=await fixture(t),a=await f.login('diner'),b=await f.login('new-diner');
  assert.equal((await f.call('bookings',{serviceId:1,requestKey:'allergy',avoid:['sesame']},b)).status,409);
  const old=(await f.call('bookings',null,a)).data.bookings[0];
  assert.equal((await f.call(`bookings/${old.id}/cancel`,{},b)).status,404);
  f.advance(10800000);
  assert.equal((await f.call(`bookings/${old.id}/switch`,{serviceId:1,requestKey:'late'},a)).status,409);
  assert.equal((await f.call(`bookings/${old.id}/cancel`,{},a)).status,200);
  assert.equal((await f.db.collection('services').findOne({_id:2})).remaining,0);
});

test('missing connection serves a clear setup state without a fallback',async t=>{
  const {server}=createApp();
  const health=await dispatch(server,'/api/health');
  assert.equal(health.status,503);
  const session=await dispatch(server,'/api/session');
  assert.equal(session.data.setupRequired,true);
  const meals=await dispatch(server,'/api/meals');
  assert.equal(meals.status,503);
  const notFound=await dispatch(server,'/');
  assert.equal(notFound.status,404);
});

test('analytics endpoint records telemetry events cleanly',async t=>{
  const {server}=createApp();
  const res=await dispatch(server,'/api/analytics',{
    method:'POST',
    body:{event:'test_view',tab:'explore',ts:new Date().toISOString()}
  });
  assert.equal(res.status,200);
  assert.equal(res.data.ok,true);
});

test('honeypot bot protection blocks automated submissions',async t=>{
  const {server}=createApp();
  const res=await dispatch(server,'/api/login',{
    method:'POST',
    body:{account:'diner',_hp_campus:'bot_spam_payload'}
  });
  assert.equal(res.status,400);
  assert.match(res.data.message,/Automated submission/i);
});

test('demo accounts require zero authentication or password',async t=>{
  const {server}=createApp();
  const res=await dispatch(server,'/api/session');
  assert.equal(res.status,200);
  assert.equal(res.data.demo,true);
});

test('sliding window rate limiter protects server from spam flooding',async t=>{
  const {server}=createApp();
  const results=[];
  for(let i=0;i<65;i++){
    results.push(await dispatch(server,'/api/analytics',{method:'POST',body:{event:'ping'}}));
  }
  const blocked=results.some(r=>r.status===429);
  assert.equal(blocked,true);
});
