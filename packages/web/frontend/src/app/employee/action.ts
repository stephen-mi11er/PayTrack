"use server";

import { EmployeeHandler } from "@handlers/employee-handler";
import type { Employee } from "@models/employee";

async function GetEmployee(eid: string): Promise<Employee | undefined> {
    return await EmployeeHandler.GetEmployee(eid);
}

export { GetEmployee };