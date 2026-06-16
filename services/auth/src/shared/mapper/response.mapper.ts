import type { ErrorResponse, SuccessResponse } from "../types/response.type";

export const responseMapper = () => {
  return {
    error: (code: string, message: string): ErrorResponse => ({
      success: false,
      code,
      message,
    }),

    success: <T>(message: string, data: T): SuccessResponse<T> => ({
      success: true,
      message,
      data,
    }),
  };
};