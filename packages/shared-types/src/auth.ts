/**
 * The access-token contract.
 *
 * Verbatim what `user-management` signs and every other service reads. It lives
 * here rather than in auth-lib because knowing the SHAPE of a token must not
 * require the machinery that VERIFIES one — auth-lib peer-depends on Nest, and
 * its types file augments Express's global Request.
 */

/** What a verified token resolves to. Never contains anything secret (rule 4). */
export interface AuthenticatedUser {
	id: string;
	role: string;
}

/** The decoded JWT body, including the registered claims we pin on verify. */
export interface AccessTokenPayload {
	sub: string;
	role: string;
	iss: string;
	aud: string;
	iat: number;
	exp: number;
}
