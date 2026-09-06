import {
	ConflictException,
	Injectable,
	Logger,
	OnModuleInit,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service.js';
import { TokenService } from './token.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import type { User } from '../generated/prisma/client.js';
import {
	RefreshTokenService,
	type ClientMeta,
} from './refresh-token.service.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { type PublicUser, toPublicUser } from '../users/user.mapper.js';
import { PasswordHasher } from './password-hasher.js';

export interface LoginResponse {
	accessToken: string;
	refreshToken: string;
	tokenType: 'Bearer';
	expiresIn: number;
	user: PublicUser;
}

@Injectable()
export class AuthService implements OnModuleInit {
	private readonly logger = new Logger(AuthService.name);
	private decoyHash!: string;

	constructor(
		private readonly usersService: UsersService,
		private readonly tokenService: TokenService,
		private readonly configService: ConfigService,
		private readonly refreshTokenService: RefreshTokenService,
		private readonly passwordHasher: PasswordHasher,
	) {}

	async onModuleInit(): Promise<void> {
		this.decoyHash = await this.passwordHasher.hash(
			randomBytes(32).toString('hex'),
		);
	}

	async register(dto: RegisterDto): Promise<PublicUser> {
		const passwordHash = await this.passwordHasher.hash(dto.password);

		try {
			const user = await this.usersService.create(dto.email, passwordHash);
			this.logger.log(`Registered user ${user.id}`);
			return toPublicUser(user);
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
				throw new ConflictException(
					'An account with this email already exists',
				);
			}
			throw error;
		}
	}

	async login(dto: LoginDto, meta: ClientMeta): Promise<LoginResponse> {
		const user = await this.usersService.findByEmail(dto.email);

		// Always run one verification, even when no user exists, so the response
		// time cannot reveal whether the email is registered.
		const passwordMatches = await this.passwordHasher.verify(
			user?.passwordHash ?? this.decoyHash,
			dto.password,
		);

		if (!user || !passwordMatches || !user.isActive) {
			const emailFingerprint = createHash('sha256')
				.update(dto.email)
				.digest('hex')
				.slice(0, 12);

			this.logger.warn(`Failed login attempt [${emailFingerprint}]`);
			throw new UnauthorizedException('Invalid email or password');
		}

		const { raw: refreshToken } = await this.refreshTokenService.startFamily(
			user.id,
			meta,
		);
		this.logger.log(`User ${user.id} logged in`);

		return this.buildSession(user, refreshToken);
	}

	async refresh(dto: RefreshDto, meta: ClientMeta): Promise<LoginResponse> {
		const spent = await this.refreshTokenService.spend(dto.refreshToken);

		if (!spent) {
			throw new UnauthorizedException('Invalid refresh token');
		}

		const user = await this.usersService.findById(spent.userId);

		if (!user || !user.isActive) {
			await this.refreshTokenService.revokeFamily(spent.familyId);
			throw new UnauthorizedException('Invalid refresh token');
		}

		const issued = await this.refreshTokenService.issue(
			user.id,
			spent.familyId,
			meta,
		);
		await this.refreshTokenService.linkReplacement(spent.id, issued.record.id);

		return this.buildSession(user, issued.raw);
	}

	private async buildSession(
		user: User,
		refreshToken: string,
	): Promise<LoginResponse> {
		return {
			accessToken: await this.tokenService.issueAccessToken(user),
			refreshToken,
			tokenType: 'Bearer',
			expiresIn: this.configService.get<number>(
				'JWT_ACCESS_TOKEN_TTL_SECONDS',
			)!,
			user: toPublicUser(user),
		};
	}

	async logout(dto: RefreshDto): Promise<void> {
		await this.refreshTokenService.revokeFamilyByToken(dto.refreshToken);
	}
}
