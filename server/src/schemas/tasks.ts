import { z } from "zod";

export const taskIdParamsSchema = z.object({ id: z.uuid() });

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  matrix: z.enum(["PERSONAL", "WORK"]),
  urgent: z.boolean().default(false),
  important: z.boolean().default(false),
  status: z.enum(["PENDING", "COMPLETED"]).default("PENDING"),
  dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
  assignedToId: z.uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export const updateTaskSchema = createTaskSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const taskFiltersSchema = z.object({
  matrix: z.enum(["PERSONAL", "WORK"]).optional(),
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
  urgent: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  important: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  dueBefore: z.iso.datetime({ offset: true }).optional(),
  dueAfter: z.iso.datetime({ offset: true }).optional(),
  scope: z.enum(["all", "owned", "assigned"]).default("all"),
});

export const reorderTasksSchema = z.object({
  items: z
    .array(z.object({ id: z.uuid(), position: z.number().int().min(0) }))
    .min(1)
    .max(500)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
      message: "Task ids must be unique",
    }),
});

export const taskStatusSchema = z.object({
  status: z.enum(["PENDING", "COMPLETED"]),
});

export const userSearchSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});
