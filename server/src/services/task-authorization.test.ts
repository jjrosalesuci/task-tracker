import { describe, expect, it } from "vitest";
import { HttpError } from "../lib/http-error";
import { assertCanReadTask, assertCanUpdateTask, taskAccess } from "./task-authorization";

const task = { ownerId: "owner", assignedToId: "assignee" };

describe("task authorization", () => {
  it("distinguishes owner, assignee and unrelated users", () => {
    expect(taskAccess(task, "owner")).toBe("owner");
    expect(taskAccess(task, "assignee")).toBe("assignee");
    expect(taskAccess(task, "other")).toBeNull();
  });

  it("allows an assignee to change only status", () => {
    expect(() => assertCanUpdateTask(task, "assignee", ["status"])).not.toThrow();
    expect(() => assertCanUpdateTask(task, "assignee", ["title"])).toThrow(HttpError);
  });

  it("hides inaccessible tasks", () => {
    expect(() => assertCanReadTask(task, "other")).toThrowError(
      expect.objectContaining({ status: 404, code: "NOT_FOUND" }),
    );
  });
});
