import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { TRPCError } from "@trpc/server";

export async function withWaitlistErrorMapping<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ErrorWithCode) {
      let code: "FORBIDDEN" | "BAD_REQUEST" | "NOT_FOUND" | null = null;
      if (error.code === ErrorCode.Forbidden) {
        code = "FORBIDDEN";
      } else if (error.code === ErrorCode.BadRequest) {
        code = "BAD_REQUEST";
      } else if (error.code === ErrorCode.NotFound || error.code === ErrorCode.EventTypeNotFound) {
        code = "NOT_FOUND";
      }
      if (code) {
        throw new TRPCError({ code, message: error.message, cause: error });
      }
    }
    throw error;
  }
}
