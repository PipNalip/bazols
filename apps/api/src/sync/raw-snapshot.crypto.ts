import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedPayload = {
  algorithmVersion: 1;
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

const algorithm = 'aes-256-gcm';
const algorithmVersion = 1 as const;
const ivLength = 12;
const keyLength = 32;
const versionAad = Buffer.from([algorithmVersion]);

function assertKey(key: Buffer): void {
  if (key.length !== keyLength) {
    throw new Error('RAW_SNAPSHOT_KEY_INVALID');
  }
}

export function encryptBytes(value: Buffer, key: Buffer): EncryptedPayload {
  assertKey(key);
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, key, iv);
  cipher.setAAD(versionAad);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);

  return {
    algorithmVersion,
    ciphertext,
    iv,
    authTag: cipher.getAuthTag(),
  };
}

export function decryptBytes(payload: EncryptedPayload, key: Buffer): Buffer {
  assertKey(key);
  if (
    payload.algorithmVersion !== algorithmVersion ||
    payload.iv.length !== ivLength ||
    payload.authTag.length !== 16
  ) {
    throw new Error('RAW_SNAPSHOT_PAYLOAD_INVALID');
  }

  const decipher = createDecipheriv(algorithm, key, payload.iv);
  decipher.setAAD(versionAad);
  decipher.setAuthTag(payload.authTag);
  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
}
