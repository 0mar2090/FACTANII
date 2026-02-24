import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongPassword123!',
    description: 'Min 8 chars, must include uppercase, lowercase, number, and special character',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Z]/, { message: 'password must contain at least one uppercase letter' })
  @Matches(/[a-z]/, { message: 'password must contain at least one lowercase letter' })
  @Matches(/[0-9]/, { message: 'password must contain at least one number' })
  @Matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, { message: 'password must contain at least one special character' })
  password!: string;

  @ApiProperty({ example: 'Juan Perez' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}
