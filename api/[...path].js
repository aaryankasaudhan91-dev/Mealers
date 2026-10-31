import https from 'node:https';
import http from 'node:http';

export default async function handler(req, res) {
  const rawBackend = (process.env.BACKEND_URL || '').trim().replace(/\/api\/?$/, '').replace(/\/+$/, '');
  if (!rawBackend) {
    if (typeof res.status === 'function') {
      res.status(502).json({
        message: 'BACKEND_URL is not configured in Vercel environment variables. Set BACKEND_URL to your Render backend URL (e.g. https://your-backend.onrender.com).'
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

  const client = backend.protocol === 'https:' ? https : http;
  const targetUrl = new URL(req.url, backend);

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

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        if (typeof res.status === 'function') {
          res.status(502).json({
            message: 'The kitchen backend service is unreachable. Please verify that your Render backend is running.'
          });
        } else {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            message: 'The kitchen backend service is unreachable. Please verify that your Render backend is running.'
          }));
        }
      }
      resolve();
    });

    if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.setHeader('Content-Type', req.headers['content-type'] || 'application/json');
      proxyReq.write(bodyData);
      proxyReq.end();
    } else if (typeof req.pipe === 'function') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });
}
