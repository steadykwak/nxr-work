import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { required } from './config';
function key() {
  const value = Buffer.from(required('GOOGLE_TOKEN_ENCRYPTION_KEY'), 'base64');
  if (value.length !== 32)
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY는 32바이트 base64 값이어야 합니다.',
    );
  return value;
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    'base64',
  );
}
export function decrypt(value: string) {
  const data = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}
