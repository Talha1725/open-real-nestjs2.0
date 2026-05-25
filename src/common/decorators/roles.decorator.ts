import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const EXACT_ROLES_KEY = 'exact_roles';
export const ExactRoles = (...roles: string[]) =>
  SetMetadata(EXACT_ROLES_KEY, roles);
