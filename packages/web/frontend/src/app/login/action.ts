"use server";

import { Utils } from "@/lib/utils";
import { EmployeeHandler } from "@employee-salary-manager/core";
import type { User } from "@employee-salary-manager/core";
import { cookies } from "next/headers";

export async function loginUser(formData: FormData) {
  try {
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();

    if (!email || !password) {
      return { success: false, message: "Email and password are required" };
    }

    const employee = await EmployeeHandler.VerifyUserCredentials(email as string, password as string);

    if (!employee) {
      return { success: false, message: "Invalid email or password" };
    }

    const cookieStore = await cookies();
    cookieStore.set(Utils.USER_SESSION_COOKIE, JSON.stringify(
        {
            name: employee.name,
            email: employee.email,
            role: employee.role,
            eid: employee.eid
        } satisfies User), {
        sameSite: "strict",
    });

    return { success: true, message: "Login successful", employee };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, message: "An error occurred during login" };
  }
}