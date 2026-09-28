import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { HttpError } from "../lib/http-error";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createTaskSchema,
  reorderTasksSchema,
  taskFiltersSchema,
  taskIdParamsSchema,
  taskStatusSchema,
  updateTaskSchema,
} from "../schemas/tasks";
import {
  assertCanReadTask,
  assertCanUpdateTask,
  assertOwner,
} from "../services/task-authorization";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const publicTaskInclude = {
  owner: { select: { id: true, email: true } },
  assignedTo: { select: { id: true, email: true } },
} satisfies Prisma.TaskInclude;

async function assertAssigneeExists(assignedToId: string | null | undefined): Promise<void> {
  if (!assignedToId) return;
  const exists = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true },
  });
  if (!exists) throw new HttpError(400, "Assigned user does not exist", "INVALID_ASSIGNEE");
}

tasksRouter.get("/", validate(taskFiltersSchema, "query"), async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { scope, matrix, status, urgent, important, dueBefore, dueAfter } = req.query as unknown as {
      scope: "all" | "owned" | "assigned";
      matrix?: "PERSONAL" | "WORK";
      status?: "PENDING" | "COMPLETED";
      urgent?: boolean;
      important?: boolean;
      dueBefore?: string;
      dueAfter?: string;
    };
    const access =
      scope === "owned"
        ? { ownerId: userId }
        : scope === "assigned"
          ? { assignedToId: userId }
          : { OR: [{ ownerId: userId }, { assignedToId: userId }] };
    const tasks = await prisma.task.findMany({
      where: {
        ...access,
        matrix,
        status,
        urgent,
        important,
        dueDate:
          dueBefore || dueAfter
            ? {
                lte: dueBefore ? new Date(dueBefore) : undefined,
                gte: dueAfter ? new Date(dueAfter) : undefined,
              }
            : undefined,
      },
      include: publicTaskInclude,
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

tasksRouter.post("/", validate(createTaskSchema), async (req, res, next) => {
  try {
    await assertAssigneeExists(req.body.assignedToId);
    const position =
      req.body.position ??
      ((await prisma.task.aggregate({
        where: {
          ownerId: req.user!.id,
          matrix: req.body.matrix,
          urgent: req.body.urgent,
          important: req.body.important,
        },
        _max: { position: true },
      }))._max.position ?? -1) + 1;
    const task = await prisma.task.create({
      data: {
        ...req.body,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : req.body.dueDate,
        completedAt: req.body.status === "COMPLETED" ? new Date() : null,
        position,
        ownerId: req.user!.id,
      },
      include: publicTaskInclude,
    });
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
});

tasksRouter.get("/:id", validate(taskIdParamsSchema, "params"), async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: publicTaskInclude,
    });
    if (!task) throw new HttpError(404, "Task not found", "NOT_FOUND");
    assertCanReadTask(task, req.user!.id);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

tasksRouter.patch(
  "/:id",
  validate(taskIdParamsSchema, "params"),
  validate(updateTaskSchema),
  async (req, res, next) => {
    try {
      const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new HttpError(404, "Task not found", "NOT_FOUND");
      assertCanUpdateTask(existing, req.user!.id, Object.keys(req.body));
      await assertAssigneeExists(req.body.assignedToId);
      const task = await prisma.task.update({
        where: { id: existing.id },
        data: {
          ...req.body,
          dueDate:
            req.body.dueDate === undefined
              ? undefined
              : req.body.dueDate === null
                ? null
                : new Date(req.body.dueDate),
          completedAt:
            req.body.status === undefined
              ? undefined
              : req.body.status === "COMPLETED"
                ? new Date()
                : null,
        },
        include: publicTaskInclude,
      });
      res.json({ task });
    } catch (error) {
      next(error);
    }
  },
);

tasksRouter.patch(
  "/:id/status",
  validate(taskIdParamsSchema, "params"),
  validate(taskStatusSchema),
  async (req, res, next) => {
    try {
      const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new HttpError(404, "Task not found", "NOT_FOUND");
      assertCanUpdateTask(existing, req.user!.id, ["status"]);
      const task = await prisma.task.update({
        where: { id: existing.id },
        data: {
          status: req.body.status,
          completedAt: req.body.status === "COMPLETED" ? new Date() : null,
        },
        include: publicTaskInclude,
      });
      res.json({ task });
    } catch (error) {
      next(error);
    }
  },
);

tasksRouter.delete("/:id", validate(taskIdParamsSchema, "params"), async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw new HttpError(404, "Task not found", "NOT_FOUND");
    assertOwner(task, req.user!.id);
    await prisma.task.delete({ where: { id: task.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

tasksRouter.post("/reorder/batch", validate(reorderTasksSchema), async (req, res, next) => {
  try {
    const ids = req.body.items.map((item: { id: string }) => item.id);
    const tasks = await prisma.task.findMany({ where: { id: { in: ids } } });
    if (tasks.length !== ids.length) throw new HttpError(404, "One or more tasks not found", "NOT_FOUND");
    tasks.forEach((task) => assertOwner(task, req.user!.id));
    await prisma.$transaction(
      req.body.items.map((item: { id: string; position: number }) =>
        prisma.task.update({ where: { id: item.id }, data: { position: item.position } }),
      ),
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

tasksRouter.patch("/reorder", validate(reorderTasksSchema), async (req, res, next) => {
  try {
    const ids = req.body.items.map((item: { id: string }) => item.id);
    const tasks = await prisma.task.findMany({ where: { id: { in: ids } } });
    if (tasks.length !== ids.length) throw new HttpError(404, "One or more tasks not found", "NOT_FOUND");
    tasks.forEach((task) => assertOwner(task, req.user!.id));
    await prisma.$transaction(
      req.body.items.map((item: { id: string; position: number }) =>
        prisma.task.update({ where: { id: item.id }, data: { position: item.position } }),
      ),
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
