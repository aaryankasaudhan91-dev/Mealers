import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import {existsSync,statSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url)),publicRoot=path.join(root,'public');
const envPath=path.join(root,'.env');
if(existsSync(envPath)&&typeof process.loadEnvFile==='function'){
  try{process.loadEnvFile(envPath);}catch(err){console.warn('Notice: Could not load .env file:',err.message);}
}

const rawBackend=(process.env.BACKEND_URL||'http://127.0.0.1:3001').trim().replace(/\/api\/?$/,'').replace(/\/+$/,'');
let backend=null;
try{
  backend=new URL(rawBackend);
  if(!['http:','https:'].includes(backend.protocol)||backend.username||backend.password||backend.search||backend.hash){
    console.warn('Warning: BACKEND_URL should be an HTTP(S) origin without credentials or queries:',rawBackend);
  }
}catch(e){
  console.warn('Warning: Invalid BACKEND_URL provided:',rawBackend);
}

const port=Number(process.env.PORT)||3000;
const host=process.env.HOST||'0.0.0.0';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const fail=(res,status,message)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({message}));};

const server=http.createServer((req,res)=>{
  try{
    const route=new URL(req.url,'http://localhost').pathname;
    if(route.startsWith('/api/')){
      if(!backend)return fail(res,503,'BACKEND_URL is not configured. Set BACKEND_URL in environment variables.');
      const reqOrigin=req.headers.origin,hostHeader=req.headers.host,fwdHost=req.headers['x-forwarded-host'];
      const isAllowed=!reqOrigin||(hostHeader&&(reqOrigin===`http://${hostHeader}`||reqOrigin===`https://${hostHeader}`))||(fwdHost&&(reqOrigin===`http://${fwdHost}`||reqOrigin===`https://${fwdHost}`));
      if(!isAllowed)return fail(res,403,'This request did not come from Mealers.');

      const headers={...req.headers,host:backend.host};
      delete headers.connection;
      headers['x-forwarded-host']=hostHeader||'';
      headers['x-forwarded-proto']=req.headers['x-forwarded-proto']||(req.socket?.encrypted?'https':'http');

      const targetPath=route+(new URL(req.url,'http://localhost').search||'');
      const targetUrl=new URL(targetPath,backend);
      const client=backend.protocol==='https:'?https:http;

      const request=client.request(targetUrl,{method:req.method,headers,timeout:15000},response=>{
        res.writeHead(response.statusCode,response.headers);
        response.pipe(res);
      });
      request.on('timeout',()=>request.destroy());
      request.on('error',()=>{
        if(!res.headersSent)fail(res,502,'The kitchen service is unavailable. Please verify the backend is running.');
        else res.end();
      });
      req.pipe(request);
      return;
    }

    if(req.method!=='GET'&&req.method!=='HEAD')return fail(res,405,'Method not allowed.');
    let resolvedRoute=route==='/'?'index.html':decodeURIComponent(route).slice(1);
    if(route==='/favicon.ico'&&!existsSync(path.resolve(publicRoot,'favicon.ico'))){
      resolvedRoute='favicon.svg';
    }
    const file=path.resolve(publicRoot,resolvedRoute);
    if(!file.startsWith(publicRoot+path.sep)||!existsSync(file)||!statSync(file).isFile())return fail(res,404,'Page not found.');

    const backendOrigin=backend?backend.origin:'';
    const csp="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' "+backendOrigin+"; frame-ancestors 'none'";

    res.writeHead(200,{
      'Content-Type':types[path.extname(file)]||'application/octet-stream',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':csp
    });
    res.end(req.method==='HEAD'?undefined:readFileSync(file));
  }catch{
    fail(res,400,'Invalid request.');
  }
});

server.listen(port,host,()=>console.log(`Mealers frontend ready at http://${host}:${port} (proxying to ${backend?.origin||'unconfigured'})`));
