import { auth } from "../auth";
import { ForbiddenError, NotAuthenticatedError } from "../errors";
import type { Role } from "../registration-policy";

export async function getCurrentUser(): Promise<{ id: string; role: Role }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new NotAuthenticatedError();
  }
  return { id: session.user.id, role: session.user.role ?? "pia" };
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}

export async function requireAdmin(): Promise<{ id: string; role: Role }> {
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    throw new ForbiddenError();
  }
  return user;
}
