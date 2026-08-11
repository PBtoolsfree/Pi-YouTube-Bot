const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:8080');

ws.on('open', function open() {
  ws.send(JSON.stringify({
    'request': 'Subscribe',
    'id': 'test',
    'events': {
      'YouTube': ['Message', 'YouTubeMessage', '*']
    }
  }));
  console.log('Subscribed to YouTube events! Waiting for chat...');
});

ws.on('message', function message(data) {
  const d = data.toString();
  if (d.includes('"status":"ok"')) return;
  if (d.includes('"request":"Hello"')) return;
  
  console.log('Received Payload:', d);
  process.exit(0);
});
