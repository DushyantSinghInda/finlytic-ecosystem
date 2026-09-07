/**
 * Mirrors the database enum deliberately rather than importing it: adding a
 * role in the schema should be a conscious change to the wire contract too,
 * and this package must not depend on Prisma.
 */
export type UserRole = 'USER' | 'ADMIN';

/** What the auth endpoints and /users/me return. */
export interface PublicUser {
	id: string;
	email: string;
	role: UserRole;
	isActive: boolean;
	/** ISO 8601. JSON has no Date type. */
	createdAt: string;
}
