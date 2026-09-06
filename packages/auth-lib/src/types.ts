import type { AuthenticatedUser } from '@finlytic/shared-types';

// Re-exported so both services keep importing these from '@finlytic/auth-lib'
// exactly as they do today. A future consumer that only needs the token SHAPE
// can depend on @finlytic/shared-types directly and skip Nest and Express.
export * from '@finlytic/shared-types';

export interface AuthLibOptions {
	/** PEM-encoded RSA public key. This library never signs, so it never sees a private key. */
	publicKey: string;
	issuer: string;
	audience: string;
}

declare global {
	// Express augments its own types via namespace merging; there is no
	// ES module equivalent for extending the Request interface.
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			user?: AuthenticatedUser;
		}
	}
}
