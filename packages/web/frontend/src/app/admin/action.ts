"use server";

import { EmployeeHandler } from "@employee-salary-manager/core";
import type { Employee } from "@employee-salary-manager/core";

async function getEmployees(): Promise<Employee[]> {
    return await EmployeeHandler.GetEmployees();
}

export { getEmployees };