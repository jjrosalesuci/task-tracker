import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { userSearchSchema } from "../schemas/tasks";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get("/search", validate(userSearchSchema, "query"), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: req.query.email as string },
      select: { id: true, email: true },
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});
