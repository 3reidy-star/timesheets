export const runtime = "nodejs";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

const VALID_ROLES = new Set(["ENGINEER", "ACCOUNTS", "ADMIN"]);
const VALID_LANGUAGES = new Set(["ENGLISH", "RUSSIAN"]);

export async function PATCH(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const body = await req.json();
    const userId = String(body?.userId || "");
    const hasRole = Object.prototype.hasOwnProperty.call(body, "role");
    const hasActive = Object.prototype.hasOwnProperty.call(body, "active");
    const hasLanguage = Object.prototype.hasOwnProperty.call(body, "language");
    const role = hasRole ? String(body.role) : undefined;
    const active = hasActive ? body.active : undefined;
    const language = hasLanguage ? String(body.language) : undefined;

    if (!userId) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    if (!hasRole && !hasActive && !hasLanguage) {
      return NextResponse.json(
        { error: "No changes supplied" },
        { status: 400 },
      );
    }

    if (hasRole && (!role || !VALID_ROLES.has(role))) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (hasActive && typeof active !== "boolean") {
      return NextResponse.json(
        { error: "Invalid active status" },
        { status: 400 },
      );
    }

    if (hasLanguage && (!language || !VALID_LANGUAGES.has(language))) {
      return NextResponse.json({ error: "Invalid language" }, { status: 400 });
    }

    if (userId === currentUser.id && active === false) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account" },
        { status: 400 },
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(hasRole ? { role: role as any } : {}),
        ...(hasActive ? { active } : {}),
        ...(hasLanguage ? { language: language as any } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        language: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update user" },
      { status: 500 },
    );
  }
}
