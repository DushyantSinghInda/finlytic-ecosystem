import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
	@IsEmail({}, { message: 'A valid email address is required' })
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim().toLowerCase() : value,
	)
	email: string;

	@IsString()
	@MinLength(12, { message: 'Password must be at least 12 characters' })
	@MaxLength(128, { message: 'Password must be at most 128 characters' })
	password: string;
}
