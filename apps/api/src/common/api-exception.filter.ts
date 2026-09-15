import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { correlationId } from './correlation.js';

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'INPUT_INVALID',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'AUTH_FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'RESOURCE_CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'AUTH_RATE_LIMITED',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestCorrelationId = correlationId(request);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionBody = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body =
      typeof exceptionBody === 'object' && exceptionBody !== null
        ? (exceptionBody as Record<string, unknown>)
        : {};
    const code =
      typeof body.code === 'string'
        ? body.code
        : (STATUS_CODES[status] ?? 'INTERNAL_ERROR');
    const message =
      typeof body.message === 'string'
        ? body.message
        : typeof exceptionBody === 'string'
          ? exceptionBody
          : code;

    response.setHeader('X-Correlation-ID', requestCorrelationId);
    response.status(status).json({ code, message, correlationId: requestCorrelationId });
  }
}
