import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { auth } from "./auth";
import { ActionResult, ok, fail, UNEXPECTED_ERROR_MESSAGE } from "./action-result";
import { AppError, ForbiddenError, NotAuthenticatedError, ValidationError } from "./errors";
import type { Role } from "./registration-policy";

type ActionConfig<TSchema extends z.ZodTypeAny, TResult> = {
  schema?: TSchema;
  // Rolle wird aus derselben Sitzungsabfrage geprüft – Handler brauchen kein zweites auth().
  role?: Role;
  handler: (input: z.infer<TSchema>, userId: string) => Promise<TResult>;
};

export function createAction<TSchema extends z.ZodTypeAny, TResult>(
  config: ActionConfig<TSchema, TResult>
) {
  return async (input: z.infer<TSchema>): Promise<ActionResult<TResult>> => {
    try {
      // 1. Auth check (genau eine Sitzungsabfrage pro Aufruf)
      const session = await auth();
      if (!session?.user?.id) {
        throw new NotAuthenticatedError();
      }
      if (config.role && session.user.role !== config.role) {
        throw new ForbiddenError();
      }

      // 2. Validation
      if (config.schema) {
        const parsed = config.schema.safeParse(input);
        if (!parsed.success) {
          const fieldErrors: Record<string, string[]> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path.join(".");
            if (!fieldErrors[key]) fieldErrors[key] = [];
            fieldErrors[key].push(issue.message);
          }
          throw new ValidationError("Ungültige Eingabe", fieldErrors);
        }
        input = parsed.data;
      }

      // 3. Execute handler
      const result = await config.handler(input, session.user.id);
      return ok(result);
    } catch (error) {
      // redirect()/notFound() u. Ä. sind Steuerfehler von Next – durchreichen, sonst navigiert der Router nicht (#57).
      unstable_rethrow(error);
      // 4. Error mapping
      if (error instanceof ValidationError) {
        return fail(error.message, error.fieldErrors);
      }
      if (error instanceof AppError) {
        return fail(error.message);
      }
      console.error("Unexpected action error:", error);
      return fail(UNEXPECTED_ERROR_MESSAGE);
    }
  };
}
