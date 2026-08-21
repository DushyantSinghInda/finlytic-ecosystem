export interface AuthenticatedUser {
	id: string;
	role: string;
}

export interface AccessTokenPayload {
	sub: string;
	role: string;
	iss: string;
	aud: string;
	iat: number;
	exp: number;
}

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
