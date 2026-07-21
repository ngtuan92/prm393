import { UserRole } from '../enums/user-role.enum';

export class AuthProfileResponse {
  id!: number;

  code!: string;

  fullName!: string;

  email!: string;

  phone!: string | null;

  gender!: string | null;

  dateOfBirth!: string | null;

  department?: string | null;

  homeroomClass?: string | null;

  teacherCapabilities?: string[];
}

export class AuthUserResponse {
  id!: number;

  email!: string;

  phone!: string | null;

  role!: UserRole;

  profile!: AuthProfileResponse;
}

export class LoginResponse {
  accessToken!: string;

  tokenType!: string;

  expiresIn!: string;

  user!: AuthUserResponse;
}

export class MessageResponse {
  message!: string;
}
