import type { UserRole } from '../../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}
