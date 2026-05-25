import { describe, expect, it } from 'vitest';
import { EXACT_ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { UsersController } from '../users/users.controller.js';

describe('UsersController KYC role boundary', () => {
  it('requires exact REGISTERED role to initiate KYC', () => {
    const exactRoles = Reflect.getMetadata(
      EXACT_ROLES_KEY,
      UsersController.prototype.initiateVerification,
    );

    expect(exactRoles).toEqual(['REGISTERED']);
  });

  it('requires exact REGISTERED role to refresh a KYC provider session', () => {
    const exactRoles = Reflect.getMetadata(
      EXACT_ROLES_KEY,
      UsersController.prototype.refreshSumsubVerification,
    );

    expect(exactRoles).toEqual(['REGISTERED']);
  });
});
