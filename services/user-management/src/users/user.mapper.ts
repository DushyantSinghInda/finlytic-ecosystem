import type { User, UserRole } from '../generated/prisma/client';

export interface PublicUser {
	id: string;
	email: string;
	role: UserRole;
	isActive: boolean;
	createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
	return {
		id: user.id,
		email: user.email,
		role: user.role,
		isActive: user.isActive,
		createdAt: user.createdAt,
	};
}
