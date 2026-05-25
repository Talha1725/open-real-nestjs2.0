import { describe, it, expect } from 'vitest';

// Password regex used by RegisterDto, ResetPasswordDto, ChangePasswordDto
const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/;

describe('Password validation regex', () => {
  it('should accept a strong password', () => {
    expect(PASSWORD_REGEX.test('Admin123!')).toBe(true);
    expect(PASSWORD_REGEX.test('Investor123!')).toBe(true);
    expect(PASSWORD_REGEX.test('P@ssw0rd')).toBe(true);
  });

  it('should reject a password without uppercase', () => {
    expect(PASSWORD_REGEX.test('admin123!')).toBe(false);
  });

  it('should reject a password without a number', () => {
    expect(PASSWORD_REGEX.test('AdminPass!')).toBe(false);
  });

  it('should reject a password without a special character', () => {
    expect(PASSWORD_REGEX.test('Admin1234')).toBe(false);
  });

  it('should reject a weak password', () => {
    expect(PASSWORD_REGEX.test('weak')).toBe(false);
    expect(PASSWORD_REGEX.test('12345678')).toBe(false);
    expect(PASSWORD_REGEX.test('')).toBe(false);
  });
});
