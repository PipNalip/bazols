import { HttpException } from '@nestjs/common';

import { ApplicationError } from './application.error.js';

export async function mapApplicationError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw new HttpException({ code: error.code, message: error.code }, error.status);
    }
    throw error;
  }
}
