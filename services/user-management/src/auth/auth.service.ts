import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Prisma } from '../generated/prisma/client';
import type { User, UserRole } from '../generated/prisma/client';

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

export interface LoginResponse {
  accessToken: string;
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
      return this.toPublicUser(user);
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

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    // Always run one argon2 verification, even when no user exists,
    // so the response time cannot reveal whether the email is registered.
    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? this.decoyHash,
      dto.password,
    );

    if (!user || !passwordMatches || !user.isActive) {
      this.logger.warn(`Failed login attempt for ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.tokenService.issueAccessToken(user);
    this.logger.log(`User ${user.id} logged in`);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<number>(
        'JWT_ACCESS_TOKEN_TTL_SECONDS',
      )!,
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
