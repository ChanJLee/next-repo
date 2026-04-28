"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loginSchema, registerSchema } from "./schema";
import { loginUser, registerUser } from "./service";
import { maxAgeSeconds, sessionCookieName } from "./session";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    username: getString(formData, "username"),
    password: getString(formData, "password"),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  try {
    const { token } = await loginUser(parsed.data);
    await setSessionCookie(token);
  } catch {
    redirect("/login?error=credentials");
  }

  redirect("/");
}

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    username: getString(formData, "username"),
    password: getString(formData, "password"),
    name: getString(formData, "name"),
  });

  if (!parsed.success) {
    redirect("/register?error=invalid");
  }

  try {
    await registerUser(parsed.data);
    const { token } = await loginUser({
      username: parsed.data.username,
      password: parsed.data.password,
    });
    await setSessionCookie(token);
  } catch {
    redirect("/register?error=duplicate");
  }

  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  redirect("/login");
}
