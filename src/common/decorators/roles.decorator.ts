import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../models/enums/user-role.enum';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Array<UserRole | string>) =>
  SetMetadata(ROLES_KEY, roles);
