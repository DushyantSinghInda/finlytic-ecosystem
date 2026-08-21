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
	namespace Express {
		interface Request {
			user?: AuthenticatedUser;
		}
	}
}