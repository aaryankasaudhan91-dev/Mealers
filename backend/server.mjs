import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MongoClient} from 'mongodb';
import {createApp,initializeDatabase} from './mongo-app.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
if(path.resolve(process.cwd())!==root)throw Error('Start the backend from its own backend folder.');
if(process.env.NODE_ENV==='production')throw Error('Security notice: this is a demo with switchable identities, not production authentication.');
const port=Number(process.env.PORT);if(!Number.isInteger(port)||port<1||port>65535||!process.env.HOST||!process.env.FRONTEND_ORIGIN)throw Error('Configure PORT, HOST and FRONTEND_ORIGIN in backend/.env.');
const name=process.env.MONGODB_DATABASE;if(!name||!/^[A-Za-z0-9_-]+$/.test(name))throw Error('Set a valid MONGODB_DATABASE in backend/.env.');
let client=null,db=null,message='Add MONGODB_URI to backend/.env and restart the backend.';
if(process.env.MONGODB_URI?.trim())try{client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});await client.connect();const hello=await client.db('admin').command({hello:1});if(!hello.setName&&hello.msg!=='isdbgrid')throw Error('replica_set_required');db=client.db(name);await initializeDatabase(db,client,{demo:process.env.DEMO_MODE==='true'});console.log('MongoDB connected; schema and indexes ready.');}catch(e){db=null;await client?.close();client=null;message=e.message==='replica_set_required'?'MongoDB transactions require Atlas or a local replica set. Update MONGODB_URI and restart.':'MongoDB could not connect. Check backend/.env, database-user permissions and network access, then restart.';console.error(message);}
const {server}=createApp({db,client,demo:process.env.DEMO_MODE==='true',allowedOrigin:process.env.FRONTEND_ORIGIN,connectionMessage:message});
server.listen(port,process.env.HOST,()=>console.log(`Mealers backend ready on port ${port}${db?'':' (database setup required)'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await client?.close();process.exit(0);}));
