// ===== WeChat API Proxy with Fixed IP =====
// Deploy this on a platform with a fixed outbound IP (Railway.app, VPS, etc.)
// Then whitelist that fixed IP in WeChat backend once, and it never changes.

const express = require('express');
const app = express();

// Security: only allow requests from our main app
const ALLOWED_ORIGINS = [
  'https://hongda-new-media-platform.vercel.app',
  'http://localhost:3000',
  process.env.PROXY_API_KEY ? undefined : null,
].filter(Boolean);

// Simple API key auth (recommended: set PROXY_API_KEY env var)
const PROXY_KEY = process.env.PROXY_API_KEY;

// Rate limiting
const requestCounts = new Map();
setInterval(() => requestCounts.clear(), 60000);

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ip: req.ip, timestamp: new Date().toISOString() });
});

// Get the proxy's own public IP
app.get('/detect-ip', async (req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const d = await r.json();
    res.json({ ip: d.ip, note: 'Add this IP to WeChat whitelist' });
  } catch {
    res.json({ ip: 'unknown' });
  }
});

// Proxy WeChat API token request
app.get('/wechat-token', async (req, res) => {
  // Auth check
  const key = req.headers['x-api-key'];
  if (PROXY_KEY && key !== PROXY_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const { appid, secret } = req.query;
  if (!appid || !secret) {
    return res.status(400).json({ error: 'Missing appid or secret' });
  }

  // Rate limit: max 10 requests per minute
  const ip = req.ip;
  requestCounts.set(ip, (requestCounts.get(ip) || 0) + 1);
  if (requestCounts.get(ip) > 10) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
      encodeURIComponent(appid) + '&secret=' + encodeURIComponent(secret);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({
      errcode: -1,
      errmsg: 'Proxy request failed: ' + (err.message || err),
    });
  }
});

// Generic WeChat API proxy (for future: save-draft, publish, etc.)
app.all('/wechat-api/*', async (req, res) => {
  const key = req.headers['x-api-key'];
  if (PROXY_KEY && key !== PROXY_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const path = req.path.replace('/wechat-api/', '');
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const url = 'https://api.weixin.qq.com/' + path + queryString;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const options = {
      method: req.method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = JSON.stringify(req.body);
    }
    const response = await fetch(url, options);
    clearTimeout(timeout);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({
      errcode: -1,
      errmsg: 'Proxy request failed: ' + (err.message || err),
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('WeChat API Proxy running on port', PORT);
});
