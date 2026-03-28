"use server";

import type { Employee } from "../models/employee";
import prisma from "@employee-salary-manager/database/prisma";

class EmployeeHandler{

    private static decimalToNumber(employee: any): Employee {
        return {
            ...employee,
            salary: employee.salary && typeof employee.salary.toNumber === 'function' ? 
                employee.salary.toNumber() : employee.salary
        };
    }

    public static async GetEmployees(): Promise<Employee[]> {
        const employees = await prisma.$queryRaw`SELECT * FROM Employees`;
        // Convert Decimal fields to number for serialization
        if (!Array.isArray(employees)) return [];
        return employees.map(EmployeeHandler.decimalToNumber);
    }

    public static async GetEmployee(eid: string): Promise<Employee | undefined> {
        const employeeArray = await prisma.$queryRaw`SELECT * FROM Employees WHERE eid = ${eid}`;
        
        if(employeeArray?.length < 1) return undefined;

        return EmployeeHandler.decimalToNumber(employeeArray[0]);
    }

    private static tokenize(query: string): string[] {
        return query
            // Replace string literals with STRING placeholder
            .replace(/'[^']*'/g, " STRING ")
            // Replace numeric literals with NUMBER placeholder
            .replace(/\b\d+\b/g, " NUMBER ")
            // Add spaces around SQL keywords and operators for easier tokenization
            .replace(/(=|--|;|\(|\)|,)/g, " $1 ")
            // Split by whitespace and 
            .split(/\s+/)
            // Remove empty tokens
            .filter(Boolean);
    }

    private static isValid(tokenizedQuery: string[], expected: string[]): boolean {
        return tokenizedQuery.join(" ") === expected.join(" ");
    }

    public static async VerifyUserCredentials(email: string, password: string): Promise<Employee | null> {
        // ⚠️ Directly building the SQL string from untrusted inputs can lead to SQL injection
        // Example: if email is "bbender@planetexpress.com" and password is ' OR email='bbender@planetexpress.com'--
        // This would result in a query that logs in the attacker as the admin user
        const unsafeQuery =
            "SELECT * FROM Employees " +
            "WHERE email = '" + email + "' " +
            "AND password = '" + password + "'";

        const expected = [
            "SELECT", "*", "FROM", "Employees",
            "WHERE", "email", "=", "STRING",
            "AND", "password", "=", "STRING"
        ];

        const tokenizedQuery = EmployeeHandler.tokenize(unsafeQuery);
        if(!EmployeeHandler.isValid(tokenizedQuery, expected)) {
            console.error("⚠️ SQL Injection vulnerability detected!");
            return null;
        }        

        // ⚠️ Using $queryRawUnsafe allows SQL injection
        const employeeArray: any[] = await prisma.$queryRawUnsafe(unsafeQuery);
        

        if (!employeeArray || employeeArray.length === 0) {
            return null;
        }

        return EmployeeHandler.decimalToNumber(employeeArray[0]);
    }
    
}

export {EmployeeHandler}