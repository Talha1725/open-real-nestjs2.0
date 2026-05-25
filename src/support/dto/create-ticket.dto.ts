import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ example: 'Question about my investment' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  subject!: string;

  @ApiProperty({
    example:
      'I submitted an investment request last week but have not received confirmation yet...',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}
