import crypto from 'crypto';

function parseKey(raw?: string): Buffer | null {
  if (!raw) return null;
  const isHex = /^[0-9a-fA-F]+$/.test(raw);
  if (isHex && raw.length >= 64) {
    const buf = Buffer.from(raw.slice(0, 64), 'hex');
    return buf.length === 32 ? buf : null;
  }
  try {
    const buf = Buffer.from(raw, 'base64');
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

function getEncKey(): Buffer {
  const raw = process.env.ACCOUNT_ENC_KEY || process.env.ACCOUNT_ENCRYPTION_KEY || '';
  const key = parseKey(raw);
  if (!key) throw new Error('ACCOUNT_ENC_KEY must be 32 bytes (hex or base64)');
  return key;
}

function getFpKey(): Buffer {
  const raw = process.env.ACCOUNT_FP_KEY;
  const key = parseKey(raw || '');
  return key || getEncKey();
}

export function encryptSecret(plaintext: string): {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
} {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    keyVersion: 1,
  };
}

export function fingerprintSecret(plaintext: string): string {
  const key = getFpKey();
  const h = crypto.createHmac('sha256', key);
  h.update(plaintext, 'utf8');
  return h.digest('base64');
}

export function decryptSecret(input: { ciphertext: string; iv: string; tag: string }): string {
  const key = getEncKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(input.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(input.tag, 'base64'));
  const out = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return out.toString('utf8');
}
