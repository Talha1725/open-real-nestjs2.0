import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class CreateTenantAdminDto {
  @ApiProperty({ example: 'newadmin@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'New Admin' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({ example: 'AdminPass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message:
      'Password must contain at least 1 uppercase letter, 1 number, and 1 special character',
  })
  password: string;
}
