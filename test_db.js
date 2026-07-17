const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 8000,
  path: '/api/sales/leads?require_followup=true&limit=1',
  method: 'GET',
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(data));
});
req.on('error', e => console.error(e));
req.end();
