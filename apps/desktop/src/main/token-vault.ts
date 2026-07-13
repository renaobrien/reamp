/**
 * Encrypted-at-rest persistence for the Spotify token set and the
 * user's client ID (rule 5: no plaintext tokens on disk, ever). The
 * cipher is Electron's safeStorage, injected so tests can use a fake.
 * When OS-level encryption is unavailable, tokens live only in memory
 * for the session rather than being written unprotected.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TokenSet } from './oauth/token-client.js';

export interface VaultCipher {
  isAvailable(): boolean;
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}

export interface VaultData {
  clientId: string;
  tokens: TokenSet;
}

const VAULT_FILE = 'spotify-auth.bin';

export class TokenVault {
  private readonly path: string;
  private readonly cipher: VaultCipher;
  private memoryOnly: VaultData | null = null;

  constructor(dir: string, cipher: VaultCipher) {
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, VAULT_FILE);
    this.cipher = cipher;
  }

  save(data: VaultData): void {
    if (!this.cipher.isAvailable()) {
      this.memoryOnly = data;
      return;
    }
    writeFileSync(this.path, this.cipher.encrypt(JSON.stringify(data)));
    this.memoryOnly = null;
  }

  load(): VaultData | null {
    if (this.memoryOnly !== null) return this.memoryOnly;
    if (!this.cipher.isAvailable() || !existsSync(this.path)) return null;
    try {
      return JSON.parse(this.cipher.decrypt(readFileSync(this.path))) as VaultData;
    } catch {
      return null; // corrupt or from another machine's keychain: reconnect
    }
  }

  clear(): void {
    this.memoryOnly = null;
    rmSync(this.path, { force: true });
  }
}
