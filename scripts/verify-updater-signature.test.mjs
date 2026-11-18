import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { verifyUpdaterSignature } from './verify-updater-signature.mjs';

test('accepts minisign prehashed signatures; rejects tampering and other signing keys', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const key = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const keyId = Buffer.from('0102030405060708', 'hex');
  const encode = (packet) => Buffer.from(`untrusted comment: test\n${packet.toString('base64')}\n`).toString('base64');
  const pubkey = encode(Buffer.concat([Buffer.from('Ed'), keyId, key]));
  const bytes = Buffer.from('installer contents');
  const signature = encode(Buffer.concat([Buffer.from('ED'), keyId, sign(null, createHash('blake2b512').update(bytes).digest(), privateKey)]));
  verifyUpdaterSignature(bytes, signature, pubkey);
  assert.throws(() => verifyUpdaterSignature(Buffer.from('tampered'), signature, pubkey), /verification failed/);
  const wrongKey = encode(Buffer.concat([Buffer.from('Ed'), Buffer.alloc(8), key]));
  assert.throws(() => verifyUpdaterSignature(bytes, signature, wrongKey), /does not match/);
  assert.throws(() => verifyUpdaterSignature(bytes, 'invalid', pubkey));
});
