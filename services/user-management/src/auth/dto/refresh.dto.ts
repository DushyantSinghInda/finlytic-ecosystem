import { IsString, Length } from 'class-validator';

export class RefreshDto {
	@IsString()
	@Length(20, 200, { message: 'Invalid refresh token' })
	refreshToken: string;
}
