import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryUsersDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ['REGISTERED', 'VERIFIED', 'ISSUER', 'ADMIN'] })
  @IsOptional()
  @IsString()
  @IsIn(['REGISTERED', 'VERIFIED', 'ISSUER', 'ADMIN'])
  role?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'SUSPENDED', 'DEACTIVATED'])
  status?: string;

  @ApiPropertyOptional({ example: 'john' })
  @IsOptional()
  @IsString()
  search?: string;
}
