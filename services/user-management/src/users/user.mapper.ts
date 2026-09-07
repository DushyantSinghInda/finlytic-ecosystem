import type { User } from '../generated/prisma/client.js';
import type { PublicUser } from '@finlytic/shared-types';

// Re-exported so the eight existing import sites keep working.
export type { PublicUser };

export function toPublicUser(user: User): PublicUser {
	return {
		id: user.id,
		email: user.email,
		role: user.role,
		isActive: user.isActive,
		// The contract says string, so serialise here rather than letting the
		// framework do it invisibly on the way out.
		createdAt: user.createdAt.toISOString(),
	};
}
