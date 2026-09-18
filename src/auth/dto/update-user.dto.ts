import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: 'Name must be at least 2 characters',
  })
  @MaxLength(100, {
    message: 'Name must not exceed 100 characters',
  })
  @Matches(/^[\p{L}]+(?:[ '-][\p{L}]+)*$/u, {
    message:
      'Name can contain only letters, spaces, apostrophes, and hyphens',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64, {
    message: 'Timezone must not exceed 64 characters',
  })
  timezone?: string;
}