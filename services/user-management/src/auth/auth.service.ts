import {
	ConflictException,
	Injectable,
	Logger,
	OnModuleInit,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Prisma } from '../generated/prisma/client';
import type { User } from '../generated/prisma/client';
import { RefreshTokenService, type ClientMeta } from './refresh-token.service';
import { RefreshDto } from './dto/refresh.dto';
import { type PublicUser, toPublicUser } from '../users/user.mapper';

const ARGON2_OPTIONS: argon2.HashOptions = {
	type: argon2.argon2id,
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1,
};

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
	) {}

	async onModuleInit(): Promise<void> {
		this.decoyHash = await argon2.hash(
			randomBytes(32).toString('hex'),
			ARGON2_OPTIONS,
		);
	}

	async register(dto: RegisterDto): Promise<PublicUser> {
		const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

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

		// Always run one argon2 verification, even when no user exists,
		// so the response time cannot reveal whether the email is registered.
		const passwordMatches = await argon2
			.verify(user?.passwordHash ?? this.decoyHash, dto.password)
			.catch(() => false);

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
