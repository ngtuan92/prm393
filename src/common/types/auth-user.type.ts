import { UserRole } from '../../models/enums/user-role.enum';

export type AuthUser = {
  id: number;
  role: UserRole | string;
  roles?: Array<UserRole | string>;
};

export type JwtPayload = {
  sub: number;
  role?: UserRole | string;
  roles?: Array<UserRole | string>;
};
