import { randomBytes } from 'node:crypto';
import { constants, readFileSync, writeFileSync } from 'node:fs';

const target = '.env';
try {
  readFileSync(target, { flag: constants.O_RDONLY });
  throw new Error('.env already exists; refusing to overwrite it');
} catch (error) {
  if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error;
}

const databasePassword = randomBytes(24).toString('base64url');
const sessionSecret = randomBytes(32).toString('hex');
const encryptionKey = randomBytes(32).toString('base64');
const template = readFileSync('.env.example', 'utf8');
const content = template
  .replaceAll('replace-with-a-local-database-password', databasePassword)
  .replace('postgresql://bazols:***@127.0.0.1:5432/bazols', `postgresql://bazols:${databasePassword}@127.0.0.1:5432/bazols`)
  .replace('replace-with-a-random-session-secret', sessionSecret)
  .replace('replace-with-base64-32-byte-key', encryptionKey);

writeFileSync(target, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
