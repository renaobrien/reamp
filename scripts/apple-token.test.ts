import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_EXPIRY_SECONDS, mintAppleDeveloperToken } from './apple-token.ts';

function makeKeyPair() {
  return generateKeyPairSync('ec', { namedCurve: 'P-256' });
}

describe('mintAppleDeveloperToken', () => {
  it('produces a verifiable ES256 JWT with Apple claims', () => {
    const { privateKey, publicKey } = makeKeyPair();
    const token = mintAppleDeveloperToken({
      privateKeyP8: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      keyId: 'ABC123DEFG',
      teamId: 'TEAM456789',
      issuedAt: 1_750_000_000,
      expiresInSeconds: 86_400,
    });

    const [h, p, s] = token.split('.');
    expect(h && p && s).toBeTruthy();

    const header = JSON.parse(Buffer.from(h!, 'base64url').toString());
    expect(header).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });

    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    expect(payload).toEqual({ iss: 'TEAM456789', iat: 1_750_000_000, exp: 1_750_086_400 });

    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(s!, 'base64url'),
    );
    expect(ok).toBe(true);
  });

  it("rejects lifetimes beyond Apple's 6-month cap", () => {
    const { privateKey } = makeKeyPair();
    expect(() =>
      mintAppleDeveloperToken({
        privateKeyP8: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        keyId: 'ABC123DEFG',
        teamId: 'TEAM456789',
        expiresInSeconds: MAX_EXPIRY_SECONDS + 1,
      }),
    ).toThrow(/6 months/);
  });

  it('rejects non-EC keys', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(() =>
      mintAppleDeveloperToken({
        privateKeyP8: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        keyId: 'ABC123DEFG',
        teamId: 'TEAM456789',
      }),
    ).toThrow(/EC key/);
  });
});
