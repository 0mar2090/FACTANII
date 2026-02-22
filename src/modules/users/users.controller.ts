import {
  Controller,
  Get,
  Put,
  Body,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { CurrentUser } from '../../common/decorators/index.js';
import type { RequestUser, ApiResponse } from '../../common/interfaces/index.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   *
   * Returns the authenticated user's profile along with their companies.
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user profile with companies' })
  @ApiOkResponse({ description: 'User profile returned successfully' })
  async getProfile(@CurrentUser() user: RequestUser): Promise<ApiResponse> {
    const profile = await this.usersService.findById(user.userId);

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    const companies = await this.usersService.getUserCompanies(user.userId);

    return {
      success: true,
      data: {
        ...profile,
        companies,
      },
    };
  }

  /**
   * PUT /users/me
   *
   * Update the authenticated user's profile (name, email).
   */
  @Put('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiOkResponse({ description: 'User profile updated successfully' })
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateUserDto,
  ): Promise<ApiResponse> {
    const updated = await this.usersService.update(user.userId, dto);

    return {
      success: true,
      data: updated,
    };
  }

  /**
   * GET /users/me/companies
   *
   * List all companies the authenticated user belongs to, including role.
   */
  @Get('me/companies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List companies the current user belongs to' })
  @ApiOkResponse({ description: 'Companies list returned successfully' })
  async getCompanies(@CurrentUser() user: RequestUser): Promise<ApiResponse> {
    const companies = await this.usersService.getUserCompanies(user.userId);

    return {
      success: true,
      data: companies,
    };
  }
}
