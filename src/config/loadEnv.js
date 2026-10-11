const path = require('path');
const dotenv = require('dotenv');

// Same files and order as dotenv-flow in the worker app. The first file that sets a variable
// wins, and variables already set in the shell are never overwritten. .env.local is skipped for
// tests so they do not depend on one machine's settings.
const nodeEnv = process.env.NODE_ENV || 'development';

const files = [
  `.env.${nodeEnv}.local`,
  nodeEnv === 'test' ? null : '.env.local',
  `.env.${nodeEnv}`,
  '.env',
]
  .filter(Boolean)
  .map(file => path.resolve(process.cwd(), file));

dotenv.config({ path: files, quiet: true });
