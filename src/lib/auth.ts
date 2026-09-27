import bcrypt from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "signalguard_session";
const SESSION_EXPIRY_HOURS = 24;
const DEMO_EMAIL = "admin@signalguard.local";
const DEMO_PASSWORD = "SignalGuard@2026";

const SESSION_SECRET =
  process.env.SIGNALGUARD_SESSION_SECRET || "signalguard-demo-secret-2026";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

const demoUser: AuthUser = {
  id: 1,
  email: DEMO_EMAIL,
  name: "System Administrator",
  role: "admin",
};

function signPayload(payload: string): string {
  return createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
}

function createToken(userId: number, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`;
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

function verifyToken(token: string): { userId: number; expiresAt: number } | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [userIdText, expiresAtText, signature] = parts;
  const userId = Number(userIdText);
  const expiresAt = Number(expiresAtText);

  if (!Number.isFinite(userId) || !Number.isFinite(expiresAt)) {
    return null;
  }

  if (expiresAt <= Date.now()) {
    return null;
  }

  const payload = `${userId}.${expiresAt}`;
  const expectedSignature = signPayload(payload);

  try {
    const valid = timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );

    if (!valid) {
      return null;
    }
  } catch {
    return null;
  }

  return { userId, expiresAt };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: number): Promise<string> {
  const expiresAt =
    Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000;

  return createToken(userId, expiresAt);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();

  const expiresAt = new Date();
  expiresAt.setHours(
    expiresAt.getHours() + SESSION_EXPIRY_HOURS,
  );

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME);

  return token?.value || null;
}

export async function validateSession(token: string) {
  const session = verifyToken(token);

  if (!session) {
    return null;
  }

  return session.userId === demoUser.id ? demoUser : null;
}

export async function getCurrentUser() {
  const token = await getSessionToken();

  if (!token) {
    return null;
  }

  return validateSession(token);
}

export async function destroySession(_token: string) {
  // Session is stateless; removing the cookie handles logout.
  return;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function initDemoUser() {
  return demoUser;
}

export function authenticateDemoUser(
  email: string,
  password: string,
): AuthUser | null {
  if (
    email.toLowerCase().trim() !== DEMO_EMAIL ||
    password !== DEMO_PASSWORD
  ) {
    return null;
  }

  return demoUser;
}
