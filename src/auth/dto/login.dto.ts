import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'investor@openreal.io' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Investor123!' })
  @IsString()
  password: string;
}
