import { Catch, type ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Only capture 5xx errors and unexpected exceptions to Sentry
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        Sentry.captureException(exception);
      }
    } else {
      // Non-HTTP exceptions are always unexpected
      Sentry.captureException(exception);
    }

    super.catch(exception, host);
  }
}
