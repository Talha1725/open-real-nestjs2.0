import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateArticleDto {
  @ApiProperty({ example: 'what-is-real-world-asset-investing' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens only',
  })
  slug!: string;

  @ApiProperty({ example: 'What is Real World Asset Investing?' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title!: string;

  @ApiProperty({ example: '<p>Article body HTML...</p>' })
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiProperty({ enum: ['EDUCATION', 'NEWS', 'FAQ'], example: 'EDUCATION' })
  @IsString()
  @IsIn(['EDUCATION', 'NEWS', 'FAQ'])
  category!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
