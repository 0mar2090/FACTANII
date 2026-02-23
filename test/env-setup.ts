/**
 * Vitest setup file for E2E tests.
 * - Loads reflect-metadata (required for NestJS DI decorator metadata)
 * - Loads .env before NestJS modules initialize
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });
