import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import {existsSync,statSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),publicRoot=path.join(root,'public');
if(path.resolve(process.cwd())!==root)throw Error('Start the frontend from its own frontend folder.');
if(!process.env.BACKEND_URL)throw Error('BACKEND_URL is required in frontend/.env. No fallback is configured.');
const backend=new URL(process.env.BACKEND_URL),port=Number(process.env.PORT);
if(!['http:','https:'].includes(backend.protocol)||backend.username||backend.password||backend.pathname!=='/'||backend.search||backend.hash)throw Error('BACKEND_URL must be an HTTP(S) origin without a path or credentials.');
if(!Number.isInteger(port)||port<1||port>65535||!process.env.HOST)throw Error('Configure PORT and HOST in frontend/.env.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const fail=(res,status,message)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({message}));};
http.createServer((req,res)=>{try{const route=new URL(req.url,'http://localhost').pathname;
 if(route.startsWith('/api/')){if(req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin))return fail(res,403,'This request did not come from Mealers.');const headers={...req.headers,host:backend.host};delete headers.connection;const request=(backend.protocol==='https:'?https:http).request(new URL(route+new URL(req.url,'http://localhost').search,backend),{method:req.method,headers,timeout:10000},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});request.on('timeout',()=>request.destroy());request.on('error',()=>{if(!res.headersSent)fail(res,502,'The kitchen service is unavailable. Please try again.');else res.end();});req.pipe(request);return;}
 if(req.method!=='GET'&&req.method!=='HEAD')return fail(res,405,'Method not allowed.');const file=path.resolve(publicRoot,route==='/'?'index.html':decodeURIComponent(route).slice(1));if(!file.startsWith(publicRoot+path.sep)||!existsSync(file)||!statSync(file).isFile())return fail(res,404,'Page not found.');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:readFileSync(file));
 }catch{fail(res,400,'Invalid request.');}}).listen(port,process.env.HOST,()=>console.log(`Mealers frontend ready at http://localhost:${port}`));
