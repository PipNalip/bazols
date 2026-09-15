import { describe, expect, it } from 'vitest';

import { decryptBytes, encryptBytes } from './raw-snapshot.crypto.js';

const key = Buffer.alloc(32, 7);
const value = Buffer.from('{"private":"payload-sentinel"}', 'utf8');

describe('raw snapshot authenticated encryption', () => {
  it('round-trips response bytes exactly', () => {
    expect(decryptBytes(encryptBytes(value, key), key)).toEqual(value);
  });

  it('uses a fresh IV and ciphertext for identical input', () => {
    const first = encryptBytes(value, key);
    const second = encryptBytes(value, key);

    expect(first.iv).not.toEqual(second.iv);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
  });

  it('fails authentication with the wrong key', () => {
    const payload = encryptBytes(value, key);

    expect(() => decryptBytes(payload, Buffer.alloc(32, 8))).toThrow();
  });

  it('fails authentication after ciphertext tampering', () => {
    const payload = encryptBytes(value, key);
    const ciphertext = Buffer.from(payload.ciphertext);
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;

    expect(() => decryptBytes({ ...payload, ciphertext }, key)).toThrow();
  });
});
