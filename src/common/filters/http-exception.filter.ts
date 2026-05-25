import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const exceptionPayload =
      typeof exceptionResponse === 'string'
        ? {}
        : ((exceptionResponse as Record<string, unknown>) ?? {});
    const responseBody = Object.fromEntries(
      Object.entries(exceptionPayload).filter(
        ([key]) => key !== 'statusCode' && key !== 'message' && key !== 'error',
      ),
    );

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionPayload.message as string) || exception.message;

    const error =
      typeof exceptionResponse === 'string'
        ? exception.name
        : ((exceptionPayload.error as string | undefined) ?? exception.name);

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      ...responseBody,
    });
  }
}
