import { spawn } from 'node:child_process';
import net from 'node:net';

const services = [
  { name: 'server', port: 4000, command: 'server/index.js' },
  { name: 'client', port: 5173, command: 'node_modules/vite/bin/vite.js' },
];
const children = [];

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function stopChildren() {
  for (const child of children) child.kill('SIGTERM');
}

process.once('SIGINT', () => {
  stopChildren();
  process.exit(0);
});
process.once('SIGTERM', () => {
  stopChildren();
  process.exit(0);
});

for (const service of services) {
  if (await isPortOpen(service.port)) {
    console.log(`${service.name} already running on port ${service.port}; reusing it.`);
    continue;
  }
  const child = spawn(process.execPath, [service.command], { stdio: 'inherit', env: process.env });
  children.push(child);
  child.once('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      stopChildren();
      process.exit(code || 1);
    }
  });
}

if (children.length === 0) {
  setInterval(() => {}, 60_000);
}