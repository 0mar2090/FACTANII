import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { RegisterDto, LoginDto, RefreshTokenDto, CreateApiKeyDto, ChangePasswordDto } from './dto/index.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../common/interfaces/index.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() dto: RegisterDto) {
    const data = await this.authService.register(dto);
    return {
      success: true,
      data,
    };
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    const data = await this.authService.login(dto);
    return {
      success: true,
      data,
    };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    const data = await this.authService.refreshTokens(dto.refreshToken);
    return {
      success: true,
      data,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke the current access token' })
  @ApiResponse({ status: 200, description: 'Token revoked successfully' })
  async logout(@Req() req: FastifyRequest) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      await this.authService.logout(authHeader.slice(7));
    }
    return {
      success: true,
      data: { message: 'Logged out successfully' },
    };
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.userId, dto);
    return {
      success: true,
      data: { message: 'Password changed successfully' },
    };
  }

  @Post('api-keys')
  @Roles('owner', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new API key for the current company' })
  @ApiResponse({ status: 201, description: 'API key created. The key is shown only once.' })
  @ApiResponse({ status: 403, description: 'Insufficient role permissions' })
  @ApiResponse({ status: 404, description: 'User is not a member of this company' })
  async createApiKey(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    const data = await this.authService.createApiKey(
      user.userId,
      user.companyId,
      dto,
    );
    return {
      success: true,
      data,
    };
  }

  @Delete('api-keys/:id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete (deactivate) an API key' })
  @ApiResponse({ status: 200, description: 'API key deleted successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async deleteApiKey(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.authService.deleteApiKey(id, user.userId);
    return {
      success: true,
      data: { message: 'API key deleted successfully' },
    };
  }
}
