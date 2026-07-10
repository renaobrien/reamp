/**
 * MusicKit developer token minting (spec §4).
 *
 * Apple Music needs an ES256 JWT signed with the developer's .p8 private
 * key (Apple Developer Program). Max validity is 6 months. This runs
 * entirely offline, no server, and the .p8 is never committed (gitignored).
 */
import { createPrivateKey, sign } from 'node:crypto';

/** Apple caps MusicKit developer tokens at ~6 months. */
export const MAX_EXPIRY_SECONDS = 15_777_000;

export interface AppleTokenOptions {
  /** PEM contents of the AuthKey_XXXXXXXXXX.p8 file. */
  privateKeyP8: string;
  /** 10-character key ID from developer.apple.com. */
  keyId: string;
  /** 10-character Apple Developer Team ID. */
  teamId: string;
  /** Override issued-at (seconds since epoch); defaults to now. */
  issuedAt?: number;
  /** Token lifetime; defaults to (and is capped at) Apple's 6-month max. */
  expiresInSeconds?: number;
}

export function mintAppleDeveloperToken(opts: AppleTokenOptions): string {
  const expiresIn = opts.expiresInSeconds ?? MAX_EXPIRY_SECONDS;
  if (expiresIn <= 0 || expiresIn > MAX_EXPIRY_SECONDS) {
    throw new Error(`expiresInSeconds must be in (0, ${MAX_EXPIRY_SECONDS}], Apple caps tokens at 6 months`);
  }

  const key = createPrivateKey(opts.privateKeyP8);
  if (key.asymmetricKeyType !== 'ec') {
    throw new Error(`expected an EC key for ES256, got ${key.asymmetricKeyType ?? 'unknown'}`);
  }

  const iat = opts.issuedAt ?? Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: opts.keyId };
  const payload = { iss: opts.teamId, iat, exp: iat + expiresIn };
  const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(payload)}`;

  // JWT ES256 wants the raw R||S signature, not ASN.1/DER.
  const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${signature.toString('base64url')}`;
}
