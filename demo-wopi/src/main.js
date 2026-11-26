import { loadConfig } from './config.js';
import { buildApp } from './server.js';

const config = loadConfig(process.env);
const app = await buildApp(config);
await app.listen({ host: '0.0.0.0', port: config.port });
