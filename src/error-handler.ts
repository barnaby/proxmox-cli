import { notifyFail } from "./lib/colors";

export function actionWithErrorHandler<Args extends unknown[]>(
  handler: (...args: Args) => void | Promise<void>,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await handler(...args);
    } catch (error) {
      if (error instanceof Error) {
        notifyFail(error.message);
      } else {
        console.error("Unexpected error:", error);
      }
      process.exitCode = 1;
    }
  };
}
