import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MongoClient} from 'mongodb';
import {createApp,initializeDatabase} from './mongo-app.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const envPath=path.join(root,'.env');
if(existsSync(envPath)&&typeof process.loadEnvFile==='function'){
  try{process.loadEnvFile(envPath);}catch(err){console.warn('Notice: Could not load .env file:',err.message);}
}

if(process.env.NODE_ENV==='production'){
  console.log('Notice: Running Mealers demo backend in production environment. Switchable demo accounts active.');
}

const port=Number(process.env.PORT)||3001;
const host=process.env.HOST||'0.0.0.0';
const allowedOrigin=process.env.FRONTEND_ORIGIN||'*';
const name=process.env.MONGODB_DATABASE||'mealers_demo';
if(!/^[A-Za-z0-9_-]+$/.test(name))throw Error('MONGODB_DATABASE must be an alphanumeric identifier.');

let client=null,db=null,message='Add MONGODB_URI to environment variables and restart the backend.';
if(process.env.MONGODB_URI?.trim()){
  try{
    client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
    await client.connect();
    const hello=await client.db('admin').command({hello:1});
    if(!hello.setName&&hello.msg!=='isdbgrid'){
      console.warn('Notice: MongoDB instance is not a replica set. Transactions require a replica set (Atlas or local).');
    }
    db=client.db(name);
    await initializeDatabase(db,client,{demo:process.env.DEMO_MODE!=='false'});
    console.log(`MongoDB connected to "${name}"; schema and indexes ready.`);
    message='MongoDB connected';
  }catch(e){
    db=null;
    await client?.close();
    client=null;
    message=e.message==='replica_set_required'
      ?'MongoDB transactions require Atlas or a local replica set. Update MONGODB_URI and restart.'
      :`MongoDB connection could not be established: ${e.message}. Check MONGODB_URI and network access.`;
    console.error(message);
  }
}else{
  console.log('No MONGODB_URI provided. Backend running in setup-required mode.');
}

const {server}=createApp({
  db,
  client,
  demo:process.env.DEMO_MODE!=='false',
  allowedOrigin,
  connectionMessage:message
});

server.listen(port,host,()=>{
  console.log(`Mealers backend ready on http://${host}:${port}${db?'':' (database setup required)'}`);
});

for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,()=>server.close(async()=>{
    await client?.close();
    process.exit(0);
  }));
}
