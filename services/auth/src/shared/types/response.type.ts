export type ErrorResponse = {
  success: false;
  code: string;
  message: string;
};
export type SuccessResponse<T> = {
  success: true;
  message: string;
  data: T;
};