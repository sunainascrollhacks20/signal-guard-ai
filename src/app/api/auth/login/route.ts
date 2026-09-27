import { NextRequest } from "next/server";
import { authenticateDemoUser, createSession, setSessionCookie } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return errorResponse("VALIDATION_ERROR", "Email and password are required", 400);
    }

    const user = authenticateDemoUser(email, password);
    if (!user) {
      return errorResponse("UNAUTHORIZED", "Invalid email or password", 401);
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return successResponse({ user });
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse("SERVER_ERROR", "Internal server error", 500);
  }
}