import { startFakeSource } from './server.ts';

const port = Number(process.env.FAKE_SOURCE_PORT ?? '9999');
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('FAKE_SOURCE_PORT must be a valid TCP port');
}

const source = await startFakeSource({ port });
console.log(`Fake source ready at ${source.url}`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await source.close();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void close().finally(() => process.exit(0));
  });
}
