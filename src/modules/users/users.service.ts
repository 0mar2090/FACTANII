import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by their unique ID.
   *
   * @param id - The user's cuid
   * @returns The user record (without passwordHash) or null
   */
  async findById(id: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  /**
   * Find a user by email address.
   *
   * @param email - The user's email
   * @returns The user record (without passwordHash) or null
   */
  async findByEmail(email: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  /**
   * Update a user's profile (name, email).
   *
   * Validates uniqueness of email if changed.
   *
   * @param id - The user's cuid
   * @param dto - Fields to update
   * @returns The updated user record
   * @throws NotFoundException if the user does not exist
   * @throws ConflictException if the new email is already taken
   */
  async update(id: string, dto: UpdateUserDto) {
    // Verify user exists
    const existing = await this.prisma.client.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    // If email is being changed, check uniqueness
    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.prisma.client.user.findUnique({
        where: { email: dto.email },
      });

      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    const updated = await this.prisma.client.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`User ${id} profile updated`);
    return updated;
  }

  /**
   * Get all companies a user belongs to, including their role in each.
   *
   * @param userId - The user's cuid
   * @returns Array of companies with the user's role
   */
  async getUserCompanies(userId: string) {
    const companyUsers = await this.prisma.client.companyUser.findMany({
      where: { userId },
      select: {
        role: true,
        company: {
          select: {
            id: true,
            ruc: true,
            razonSocial: true,
            nombreComercial: true,
            isBeta: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        company: {
          razonSocial: 'asc',
        },
      },
    });

    return companyUsers.map((cu: { role: string; company: any }) => ({
      ...cu.company,
      role: cu.role,
    }));
  }
}
