"use server";

import { EmployeeHandler } from "@handlers/employee-handler";
import type { Employee } from "@models/employee";

async function getEmployees(): Promise<Employee[]> {
    return await EmployeeHandler.GetEmployees();
}

export { getEmployees };