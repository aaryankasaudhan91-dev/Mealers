import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import {existsSync,statSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url)),publicRoot=path.join(root,'public');
const envPath=path.join(root,'.env');
if(existsSync(envPath)&&typeof process.loadEnvFile==='function'){
  try{process.loadEnvFile(envPath);}catch(err){console.warn('Notice: Could not load .env file:',err.message);}
}

const rawBackend=(process.env.BACKEND_URL||'').trim();
if(!rawBackend)throw Error('BACKEND_URL is required in frontend/.env or service environment variables.');
const backend=new URL(rawBackend);
if(!['http:','https:'].includes(backend.protocol)||backend.username||backend.password||backend.pathname!=='/'||backend.search||backend.hash)throw Error('BACKEND_URL must be an HTTP(S) origin without credentials, paths or queries.');

const port=Number(process.env.PORT)||3000;
const host=process.env.HOST||'0.0.0.0';
const types={
  '.mp4':'video/mp4',
  '.vtt':'text/vtt; charset=utf-8',
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.ico':'image/x-icon',
  '.svg':'image/svg+xml',
  '.json':'application/json; charset=utf-8',
  '.xml':'application/xml; charset=utf-8',
  '.txt':'text/plain; charset=utf-8',
  '.webmanifest':'application/manifest+json'
};

const fail=(res,status,message)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({message}));};

const notFoundPage=existsSync(path.join(publicRoot,'404.html'))?readFileSync(path.join(publicRoot,'404.html')):null;

const server=http.createServer((req,res)=>{
  try{
    // Force HTTPS redirect if running in production behind reverse-proxy
    const proto=req.headers['x-forwarded-proto'];
    const isProd=process.env.NODE_ENV==='production';
    if(isProd&&proto==='http'&&req.headers.host){
      res.writeHead(301,{
        'Location':`https://${req.headers.host}${req.url}`,
        'Strict-Transport-Security':'max-age=31536000; includeSubDomains; preload'
      });
      return res.end();
    }

    const route=new URL(req.url,'http://localhost').pathname;

    // API Proxy Handler
    if(route.startsWith('/api/')){
      if(!backend)return fail(res,503,'BACKEND_URL is not configured. Set BACKEND_URL in environment variables.');
      const reqOrigin=req.headers.origin,hostHeader=req.headers.host,fwdHost=req.headers['x-forwarded-host'];
      const isAllowed=!reqOrigin||(hostHeader&&(reqOrigin===`http://${hostHeader}`||reqOrigin===`https://${hostHeader}`))||(fwdHost&&(reqOrigin===`http://${fwdHost}`||reqOrigin===`https://${fwdHost}`));
      if(!isAllowed)return fail(res,403,'This request did not come from an authorized Mealers origin.');

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
    if(!file.startsWith(publicRoot+path.sep)||!existsSync(file)||!statSync(file).isFile()){
      // Serve Custom 404 Page
      if(notFoundPage){
        res.writeHead(404,{
          'Content-Type':'text/html; charset=utf-8',
          'Cache-Control':'no-cache',
          'X-Content-Type-Options':'nosniff'
        });
        return res.end(req.method==='HEAD'?undefined:notFoundPage);
      }
      return fail(res,404,'Page not found.');
    }

    const ext=path.extname(file);
    const contentType=types[ext]||'application/octet-stream';
    const backendOrigin=backend?backend.origin:'';
    const csp="default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' "+backendOrigin+"; frame-ancestors 'none'";

    const isStaticAsset=['.css','.js','.png','.svg','.jpg','.webp','.ico'].includes(ext);
    const cacheControl=isStaticAsset?'public, max-age=86400, stale-while-revalidate=604800':'public, max-age=0, must-revalidate';

    let contentBuffer=readFileSync(file);
    const headers={
      'Content-Type':contentType,
      'X-Content-Type-Options':'nosniff',
      'X-Frame-Options':'DENY',
      'Content-Security-Policy':csp,
      'Cache-Control':cacheControl,
      'Strict-Transport-Security':'max-age=31536000; includeSubDomains'
    };

    // GZIP compression for text/code assets
    const acceptEncoding=req.headers['accept-encoding']||'';
    const compressible=['.html','.css','.js','.json','.svg','.xml','.txt'].includes(ext);
    if(compressible&&acceptEncoding.includes('gzip')&&contentBuffer.length>256){
      contentBuffer=zlib.gzipSync(contentBuffer);
      headers['Content-Encoding']='gzip';
    }

    res.writeHead(200,headers);
    res.end(req.method==='HEAD'?undefined:contentBuffer);
  }catch(err){
    console.error('Server error:',err);
    fail(res,400,'Invalid request.');
  }
});

server.listen(port,host,()=>console.log(`Mealers frontend ready at http://${host}:${port} (proxying to ${backend?.origin||'unconfigured'})`));
