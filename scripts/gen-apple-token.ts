#!/usr/bin/env node --experimental-strip-types
/**
 * Mint a MusicKit developer token from your .p8 key. Offline, no server.
 *
 *   node --experimental-strip-types scripts/gen-apple-token.ts \
 *     --key ~/keys/AuthKey_ABC123DEFG.p8 --key-id ABC123DEFG --team-id TEAM456789
 *
 * Paste the printed token into Reamp's settings pane (it lands in
 * Keychain via safeStorage). NEVER commit the .p8 or the token.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { MAX_EXPIRY_SECONDS, mintAppleDeveloperToken } from './apple-token.ts';

const { values } = parseArgs({
  options: {
    key: { type: 'string' },
    'key-id': { type: 'string' },
    'team-id': { type: 'string' },
    'expires-days': { type: 'string' },
  },
});

const keyPath = values.key;
const keyId = values['key-id'];
const teamId = values['team-id'];
if (!keyPath || !keyId || !teamId) {
  console.error('usage: gen-apple-token --key <AuthKey.p8> --key-id <KID> --team-id <TID> [--expires-days <n>]');
  process.exit(64);
}

const expiresInSeconds = values['expires-days']
  ? Math.min(Number(values['expires-days']) * 86_400, MAX_EXPIRY_SECONDS)
  : MAX_EXPIRY_SECONDS;

const token = mintAppleDeveloperToken({
  privateKeyP8: readFileSync(keyPath, 'utf8'),
  keyId,
  teamId,
  expiresInSeconds,
});

const expiry = new Date(Date.now() + expiresInSeconds * 1000);
console.error(`MusicKit developer token (expires ${expiry.toISOString().slice(0, 10)}):\n`);
console.log(token);
