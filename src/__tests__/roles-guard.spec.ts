import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../common/guards/roles.guard.js';

function mockContext(role: string | null) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: role ? { role } : null,
      }),
    }),
  } as any;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockMeta(isPublic: boolean, roles: string[] | undefined) {
    vi.spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(isPublic)
      .mockReturnValueOnce(undefined) // for exact_roles
      .mockReturnValueOnce(roles);
  }

  function mockExactMeta(isPublic: boolean, exactRoles: string[] | undefined) {
    vi.spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(isPublic)
      .mockReturnValueOnce(exactRoles);
  }

  it('allows public routes regardless of role', () => {
    mockMeta(true, undefined);
    expect(guard.canActivate(mockContext(null))).toBe(true);
  });

  it('allows any authenticated user when no @Roles decorator', () => {
    mockMeta(false, undefined);
    expect(guard.canActivate(mockContext('REGISTERED'))).toBe(true);
  });

  it('allows VERIFIED user on @Roles("VERIFIED") route', () => {
    mockMeta(false, ['VERIFIED']);
    expect(guard.canActivate(mockContext('VERIFIED'))).toBe(true);
  });

  it('rejects REGISTERED user on @Roles("VERIFIED") route', () => {
    mockMeta(false, ['VERIFIED']);
    expect(() => guard.canActivate(mockContext('REGISTERED'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects ISSUER on @Roles("VERIFIED") route (distinct roles at same level)', () => {
    mockMeta(false, ['VERIFIED']);
    expect(() => guard.canActivate(mockContext('ISSUER'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects VERIFIED on @Roles("ISSUER") route', () => {
    mockMeta(false, ['ISSUER']);
    expect(() => guard.canActivate(mockContext('VERIFIED'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects ADMIN on @Roles("VERIFIED") route', () => {
    mockMeta(false, ['VERIFIED']);
    expect(() => guard.canActivate(mockContext('ADMIN'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects ADMIN on @Roles("ISSUER") route', () => {
    mockMeta(false, ['ISSUER']);
    expect(() => guard.canActivate(mockContext('ADMIN'))).toThrow(
      ForbiddenException,
    );
  });

  it('allows ADMIN on @Roles("ADMIN") route', () => {
    mockMeta(false, ['ADMIN']);
    expect(guard.canActivate(mockContext('ADMIN'))).toBe(true);
  });

  it('rejects ADMIN on @Roles("SUPER_ADMIN") route', () => {
    mockMeta(false, ['SUPER_ADMIN']);
    expect(() => guard.canActivate(mockContext('ADMIN'))).toThrow(
      ForbiddenException,
    );
  });

  it('allows SUPER_ADMIN on @Roles("SUPER_ADMIN") route', () => {
    mockMeta(false, ['SUPER_ADMIN']);
    expect(guard.canActivate(mockContext('SUPER_ADMIN'))).toBe(true);
  });

  it('allows SUPER_ADMIN on @Roles("ADMIN") route', () => {
    mockMeta(false, ['ADMIN']);
    expect(guard.canActivate(mockContext('SUPER_ADMIN'))).toBe(true);
  });

  it('rejects SUPER_ADMIN on @Roles("VERIFIED") route', () => {
    mockMeta(false, ['VERIFIED']);
    expect(() => guard.canActivate(mockContext('SUPER_ADMIN'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects VERIFIED on @Roles("ADMIN") route', () => {
    mockMeta(false, ['ADMIN']);
    expect(() => guard.canActivate(mockContext('VERIFIED'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects VERIFIED on @Roles("SUPER_ADMIN") route', () => {
    mockMeta(false, ['SUPER_ADMIN']);
    expect(() => guard.canActivate(mockContext('VERIFIED'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects ISSUER on @Roles("ADMIN") route', () => {
    mockMeta(false, ['ADMIN']);
    expect(() => guard.canActivate(mockContext('ISSUER'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects null user', () => {
    mockMeta(false, ['VERIFIED']);
    expect(() => guard.canActivate(mockContext(null))).toThrow(
      ForbiddenException,
    );
  });

  it('allows only exact role matches when @ExactRoles is used', () => {
    mockExactMeta(false, ['REGISTERED']);
    expect(guard.canActivate(mockContext('REGISTERED'))).toBe(true);
  });

  it('rejects higher privileged roles when @ExactRoles("REGISTERED") is used', () => {
    mockExactMeta(false, ['REGISTERED']);
    expect(() => guard.canActivate(mockContext('SUPER_ADMIN'))).toThrow(
      ForbiddenException,
    );
  });
});
