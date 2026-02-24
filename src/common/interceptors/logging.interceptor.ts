import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] || '-';
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;
        const duration = Date.now() - now;
        const correlationId = this.cls.get('correlationId') || '-';

        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          // Structured log object for production (parsed by log aggregators)
          this.logger.log(
            JSON.stringify({
              correlationId,
              method,
              url,
              statusCode,
              duration,
              ip,
              userAgent,
            }),
          );
        } else {
          this.logger.log(`[${correlationId}] ${method} ${url} ${statusCode} ${duration}ms`);
        }
      }),
    );
  }
}
