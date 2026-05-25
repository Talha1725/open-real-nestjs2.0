import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:';

/**
 * AES-256-GCM field encryption service for sensitive data at rest.
 *
 * Env var: FIELD_ENCRYPTION_KEY — 64-char hex string (32 bytes).
 * Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer | null;

  constructor(private readonly configService: ConfigService) {
    const hex =
      this.configService.get<string>('ENCRYPTION_KEY') ||
      this.configService.get<string>('FIELD_ENCRYPTION_KEY');

    if (hex && hex.length === 64) {
      this.key = Buffer.from(hex, 'hex');
    } else {
      this.key = null;
      this.logger.warn(
        'FIELD_ENCRYPTION_KEY or ENCRYPTION_KEY not set or invalid — field encryption disabled',
      );
    }
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  /** Encrypt a UTF-8 string. Returns `enc:<base64(iv + ciphertext + authTag)>`. */
  encrypt(plaintext: string): string {
    if (!this.key) return plaintext;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, encrypted, authTag]);
    return ENCRYPTED_PREFIX + combined.toString('base64');
  }

  /** Decrypt a value returned by encrypt(). Gracefully falls back to plaintext. */
  decrypt(value: string): string {
    if (!this.key) return value;
    if (!value.startsWith(ENCRYPTED_PREFIX)) return value; // plaintext fallback
    try {
      const data = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
      const iv = data.subarray(0, IV_LENGTH);
      const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
      const ciphertext = data.subarray(
        IV_LENGTH,
        data.length - AUTH_TAG_LENGTH,
      );
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);
      return (
        decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8')
      );
    } catch {
      // Graceful fallback — assume plaintext (migration path)
      return value;
    }
  }

  /** Encrypt a JSON-serializable object → encrypted string. */
  encryptJson(obj: unknown): string {
    return this.encrypt(JSON.stringify(obj));
  }

  /** Decrypt a string → parsed JSON. Falls back to raw parse if not encrypted. */
  decryptJson<T = unknown>(value: unknown): T {
    if (typeof value === 'string') {
      return JSON.parse(this.decrypt(value)) as T;
    }
    // Already an object (unencrypted legacy data) — return as-is
    return value as T;
  }
}
