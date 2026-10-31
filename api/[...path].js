import https from 'node:https';
import http from 'node:http';

export default async function handler(req, res) {
  const rawBackend = (process.env.BACKEND_URL || '').trim().replace(/\/api\/?$/, '').replace(/\/+$/, '');
  if (!rawBackend) {
    if (typeof res.status === 'function') {
      res.status(502).json({
        message: 'BACKEND_URL is not configured in Vercel environment variables. Set BACKEND_URL to your Render backend URL (e.g. https://mealers-backend.onrender.com).'
      });
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'BACKEND_URL is not configured in Vercel environment variables. Set BACKEND_URL to your Render backend URL.'
      }));
    }
    return;
  }

  let backend;
  try {
    backend = new URL(rawBackend);
  } catch (err) {
    const errorMsg = `Invalid BACKEND_URL configured in Vercel: ${rawBackend}`;
    if (typeof res.status === 'function') {
      res.status(502).json({ message: errorMsg });
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: errorMsg }));
    }
    return;
  }

  // Resolve true target path
  let apiPath = '';
  if (Array.isArray(req.query?.path)) {
    apiPath = '/api/' + req.query.path.join('/');
  } else if (typeof req.query?.path === 'string' && req.query.path) {
    apiPath = '/api/' + req.query.path.replace(/^\/+/, '');
  } else {
    const u = new URL(req.url, 'http://localhost');
    let p = u.pathname;
    if (p.includes('[...path]') || p.includes('%5B...path%5D')) {
      const qp = u.searchParams.get('path');
      p = qp ? ('/api/' + qp.replace(/^\/+/, '')) : '/api';
    }
    apiPath = p.startsWith('/api') ? p : ('/api' + p);
  }

  const u = new URL(req.url, 'http://localhost');
  u.searchParams.delete('path');
  const queryStr = u.search;
  const fullTargetPath = apiPath + queryStr;
  const targetUrl = new URL(fullTargetPath, backend);

  const client = backend.protocol === 'https:' ? https : http;

  const headers = { ...req.headers, host: backend.host };
  delete headers.connection;
  delete headers['content-length'];
  headers['x-forwarded-host'] = req.headers?.host || '';
  headers['x-forwarded-proto'] = 'https';

  return new Promise((resolve) => {
    const proxyReq = client.request(targetUrl, {
      method: req.method || 'GET',
      headers,
      timeout: 15000
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on('end', resolve);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        if (typeof res.status === 'function') {
          res.status(504).json({ message: 'Gateway timeout contacting backend on Render.' });
        } else {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Gateway timeout contacting backend on Render.' }));
        }
      }
      resolve();
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        if (typeof res.status === 'function') {
          res.status(502).json({
            message: 'Mealers backend on Render is starting or temporarily unavailable.',
            details: err.message
          });
        } else {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            message: 'Mealers backend on Render is starting or temporarily unavailable.',
            details: err.message
          }));
        }
      }
      resolve();
    });

    if (typeof req.pipe === 'function') {
      req.pipe(proxyReq);
    } else if (req.body) {
      const data = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      proxyReq.write(data);
      proxyReq.end();
    } else {
      proxyReq.end();
    }
  });
}
