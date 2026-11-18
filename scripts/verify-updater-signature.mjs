import { createHash, createPublicKey, verify } from 'node:crypto';

// Tauri stores the complete minisign text as base64, whose second line is the binary packet.
export function verifyUpdaterSignature(bytes, signature, pubkey) {
  const decodePacket = (encoded) => Buffer.from(Buffer.from(encoded, 'base64').toString('utf8').trim().split(/\r?\n/)[1] ?? '', 'base64');
  const keyPacket = decodePacket(pubkey);
  const sigPacket = decodePacket(signature);
  if (keyPacket.length !== 42 || sigPacket.length !== 74 || !keyPacket.subarray(2, 10).equals(sigPacket.subarray(2, 10))) {
    throw new Error('Installer signing key does not match the public key embedded in the app');
  }
  const algorithm = sigPacket.subarray(0, 2).toString();
  if (!['ED', 'Ed'].includes(algorithm)) throw new Error('Unsupported minisign signature');
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), keyPacket.subarray(10)]),
    format: 'der', type: 'spki',
  });
  const message = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
  if (!verify(null, message, publicKey, sigPacket.subarray(10))) {
    throw new Error('Installer signature verification failed');
  }
}
