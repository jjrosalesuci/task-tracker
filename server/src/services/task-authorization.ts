import type { Task } from "@prisma/client";
import { HttpError } from "../lib/http-error";

type TaskIdentity = Pick<Task, "ownerId" | "assignedToId">;

export function taskAccess(task: TaskIdentity, userId: string): "owner" | "assignee" | null {
  if (task.ownerId === userId) return "owner";
  if (task.assignedToId === userId) return "assignee";
  return null;
}

export function assertCanReadTask(task: TaskIdentity, userId: string): void {
  if (!taskAccess(task, userId)) throw new HttpError(404, "Task not found", "NOT_FOUND");
}

export function assertCanUpdateTask(
  task: TaskIdentity,
  userId: string,
  fields: readonly string[],
): void {
  const access = taskAccess(task, userId);
  if (!access) throw new HttpError(404, "Task not found", "NOT_FOUND");
  if (access === "assignee" && (fields.length !== 1 || fields[0] !== "status")) {
    throw new HttpError(
      403,
      "Assigned users may only change task status",
      "INSUFFICIENT_PERMISSION",
    );
  }
}

export function assertOwner(task: TaskIdentity, userId: string): void {
  if (task.ownerId !== userId) {
    throw new HttpError(403, "Only the task owner may perform this action", "INSUFFICIENT_PERMISSION");
  }
}
