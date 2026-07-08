#!/bin/bash
# DigitalOcean droplet startup script - WeChat API Proxy

set -e

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

# Create proxy app
mkdir -p /opt/wechat-proxy
cd /opt/wechat-proxy

# Write proxy.js
cat > proxy.js << 'PROXY'
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const PROXY_KEY = process.env.PROXY_API_KEY || 'hongda-proxy-key';

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/detect-ip', async (req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const d = await r.json();
    res.json({ ip: d.ip, note: 'Fixed IP - add this to WeChat whitelist once' });
  } catch {
    res.json({ ip: 'unknown' });
  }
});

app.get('/wechat-token', async (req, res) => {
  const key = req.headers['x-api-key'];
  if (key !== PROXY_KEY) return res.status(401).json({ error: 'Invalid API key' });
  const { appid, secret } = req.query;
  if (!appid || !secret) return res.status(400).json({ error: 'Missing appid or secret' });
  try {
    const r = await fetch('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + encodeURIComponent(appid) + '&secret=' + encodeURIComponent(secret));
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ errcode: -1, errmsg: 'Proxy error: ' + err.message });
  }
});

app.listen(PORT, () => console.log('WeChat Proxy running on port', PORT));
PROXY

cat > package.json << 'PKG'
{"name":"wechat-proxy","version":"1.0.0","scripts":{"start":"node proxy.js"},"dependencies":{"express":"^4.18.2"}}
PKG

npm install

# Install PM2 and configure as service
npm install -g pm2
pm2 start proxy.js --name wechat-proxy
pm2 save
pm2 startup systemd -u root --hp /root
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

echo ""
echo "=========================================="
echo "WeChat API Proxy deployed successfully!"
echo "Server IP: $(curl -s https://api.ipify.org)"
echo "Proxy URL: http://$(curl -s https://api.ipify.org):3000"
echo "Test: curl http://localhost:3000/health"
echo "Detect IP: curl http://localhost:3000/detect-ip"
echo "=========================================="
