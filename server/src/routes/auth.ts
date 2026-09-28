import { Router } from "express";
import argon2 from "argon2";
import rateLimit from "express-rate-limit";
import { config } from "../config";
import { HttpError } from "../lib/http-error";
import { prisma } from "../lib/prisma";
import { createOpaqueToken, hashToken } from "../lib/tokens";
import { requireAuth, SESSION_COOKIE, sessionCookieOptions } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../schemas/auth";
import { sendPasswordResetEmail } from "../services/mailer";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

async function establishSession(userId: string): Promise<string> {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return token;
}

authRouter.post("/register", authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const passwordHash = await argon2.hash(req.body.password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email: req.body.email, passwordHash },
      select: { id: true, email: true, createdAt: true, updatedAt: true },
    });
    const token = await establishSession(user.id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions).status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!user || !(await argon2.verify(user.passwordHash, req.body.password))) {
      throw new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }
    const token = await establishSession(user.id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions).json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.session.delete({ where: { id: req.sessionId } });
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined }).status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post(
  "/forgot-password",
  resetLimiter,
  validate(forgotPasswordSchema),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { email: req.body.email } });
      if (user) {
        const token = createOpaqueToken();
        const expiresAt = new Date(
          Date.now() + config.PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
        );
        await prisma.$transaction([
          prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
          prisma.passwordResetToken.create({
            data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
          }),
        ]);
        await sendPasswordResetEmail(user.email, token);
      }
      res.status(202).json({
        message: "If the account exists, a password reset email has been sent",
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/reset-password",
  resetLimiter,
  validate(resetPasswordSchema),
  async (req, res, next) => {
    try {
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(req.body.token) },
      });
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
        throw new HttpError(400, "Reset token is invalid or expired", "INVALID_RESET_TOKEN");
      }
      const passwordHash = await argon2.hash(req.body.password, { type: argon2.argon2id });
      await prisma.$transaction([
        prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        }),
        prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
      ]);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
