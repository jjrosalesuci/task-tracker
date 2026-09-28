import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { HttpError } from "../lib/http-error";
import { prisma } from "../lib/prisma";
import { hashToken } from "../lib/tokens";

export const SESSION_COOKIE = "task_tracker_session";

export const sessionCookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: { select: { id: true, email: true, createdAt: true, updatedAt: true } },
      },
    });
    if (!session || session.expiresAt <= new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      throw new HttpError(401, "Session expired or invalid", "UNAUTHENTICATED");
    }
    req.user = session.user;
    req.sessionId = session.id;
    next();
  } catch (error) {
    next(error);
  }
}
