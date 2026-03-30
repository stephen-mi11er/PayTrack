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


    /**
     * Tokenizes a SQL query string by splitting on whitespace, single quotes,
     * and the comment sequence '--'.
     *
     * Based on: L. Ntagwabira and S. L. Kang, "Use of Query tokenization to detect
     * and prevent SQL injection attacks," in Proc. 2010 3rd Int. Conf. Computer
     * Science and Information Technology, vol. 2, pp. 438–440.
     * doi: 10.1109/ICCSIT.2010.5565202
     */
    private static tokenize(query: string): string[] {
        return query
            // Collapse single-quoted string literals (including backslash-escaped quotes)
            // into a single STRING token, e.g. 'bbender@planetexpress.com' → STRING
            // (?:[^'\\]|\\.)* matches any character except ' or \, or a backslash followed
            // by any character (escape sequence), preventing \' from being treated as a closing quote
            .replace(/'(?:[^'\\]|\\.)*'/g, " STRING ")
            // Collapse bare integer literals into a NUMBER token, e.g. 42 → NUMBER
            // \b ensures only standalone numbers are matched, not digits inside words
            .replace(/\b\d+\b/g, " NUMBER ")
            // Pad SQL operators and punctuation with spaces so they split into their own tokens:
            // =  →  comparison / assignment
            // -- →  SQL line comment (key injection signal)
            // ;  →  statement terminator (signals stacked queries)
            // () →  function call or subquery delimiters
            // ,  →  column/value separator
            .replace(/(=|--|;|\(|\)|,)/g, " $1 ")
            // Split on any run of whitespace to produce the token array
            .split(/\s+/)
            // Discard empty strings produced by leading/trailing whitespace
            .filter(Boolean);
    }

    private static isValid(tokenizedQuery: string[], expected: string[]): boolean {
        return tokenizedQuery.join(" ") === expected.join(" ");
    }

    private static isSQLInjection(expectedQuery: string, unsafeQuery: string): boolean {
        const expected = EmployeeHandler.tokenize(expectedQuery);

        const tokenizedQuery = EmployeeHandler.tokenize(unsafeQuery);        

        if(!EmployeeHandler.isValid(tokenizedQuery, expected)) {
            console.error("⚠️ SQL Injection vulnerability detected!");
            return true;
        }  

        return false;
    }

    public static async VerifyUserCredentials(email: string, password: string): Promise<Employee | null> {
        // ⚠️ Directly building the SQL string from untrusted inputs can lead to SQL injection
        // Example: if email is "bbender@planetexpress.com" and password is ' OR email='bbender@planetexpress.com'--
        // This would result in a query that logs in the attacker as the admin user
        const unsafeQuery =
            "SELECT * FROM Employees " +
            "WHERE email = '" + email + "' " +
            "AND password = '" + password + "'";       

        if(process.env.ENABLE_QUERY_TOKENIZATION === "true") {
            const expectedQuery = "SELECT * FROM Employees WHERE email = STRING AND password = STRING";
            const isInjection = EmployeeHandler.isSQLInjection(expectedQuery, unsafeQuery);
            if(isInjection) {
                throw new Error("SQL Injection detected in query: " + unsafeQuery);
            }
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