import { IsOptional, IsString, Length } from 'class-validator';

export class RefreshDto {
	@IsOptional()
	@IsString()
	@Length(20, 200, { message: 'Invalid refresh token' })
	refreshToken?: string;
}
