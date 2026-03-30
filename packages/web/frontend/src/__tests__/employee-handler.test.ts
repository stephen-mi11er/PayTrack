import { EmployeeHandler } from "@handlers/employee-handler";

beforeAll(() => jest.spyOn(console, "error").mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const tokenize = (q: string): string[] =>
    (EmployeeHandler as any).tokenize(q);

const isSQLInjection = (expected: string, query: string): boolean =>
    (EmployeeHandler as any).isSQLInjection(expected, query);

const EXPECTED_QUERY =
    "SELECT * FROM Employees WHERE email = STRING AND password = STRING";

const buildQuery = (email: string, password: string): string =>
    "SELECT * FROM Employees " +
    "WHERE email = '" + email + "' " +
    "AND password = '" + password + "'";

// ---------------------------------------------------------------------------

describe("EmployeeHandler", () => {
    // -----------------------------------------------------------------------
    describe("isSQLInjection", () => {
        describe("returns false — clean inputs", () => {
            test("standard email and strong password", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@example.com", "P@ssw0rd!"))).toBe(false);
            });

            test("both fields empty", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("", ""))).toBe(false);
            });

            test("alphanumeric values", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("alice123", "opensesame99"))).toBe(false);
            });

            test("email with dots, hyphens, and plus sign", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("first.last+tag@sub.example.co.uk", "secret"))).toBe(false);
            });

            test("password with special characters (no quotes)", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "!@#$%^&*()-+=[]{}|:<>?/"))).toBe(false);
            });

            test("SQL keywords inside a quoted value are tokenized as STRING", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("select@example.com", "OR AND WHERE SELECT FROM"))).toBe(false);
            });

            test("password that is literally the word STRING", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "STRING"))).toBe(false);
            });

            test("double-dash inside a quoted value is safe", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "pass--word"))).toBe(false);
            });
        });

        describe("returns true — injections detected", () => {
            test("OR-true: ' OR '1'='1", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' OR '1'='1"))).toBe(true);
            });

            test("OR with numeric comparison and comment: ' OR 1=1--", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' OR 1=1--"))).toBe(true);
            });

            test("stacked DROP TABLE via semicolons and comment", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "'; DROP TABLE Employees;--"))).toBe(true);
            });

            test("injection in the email field", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("a' OR '1'='1", "anypassword"))).toBe(true);
            });

            test("OR bypass matching a known email with comment", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("bbender@planetexpress.com", "' OR email='bbender@planetexpress.com'--"))).toBe(true);
            });

            test("UNION SELECT exfiltration", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' UNION SELECT * FROM Employees--"))).toBe(true);
            });

            test("subquery: AND (SELECT COUNT(*) ...) > 0", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' AND (SELECT COUNT(*) FROM Employees) > 0 AND '1'='1"))).toBe(true);
            });

            test("comment truncation in email field: admin@example.com'--", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("admin@example.com'--", "ignored"))).toBe(true);
            });

            test("numeric OR: ' OR id=1--", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' OR id=1--"))).toBe(true);
            });

            test("stacked INSERT injection", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "'; INSERT INTO Employees VALUES ('x','x','x@x.com','0','1');--"))).toBe(true);
            });

            test("stacked UPDATE injection without comment", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "'; UPDATE Employees SET salary=999999 WHERE '1'='1"))).toBe(true);
            });

            test("extra whitespace around injected operators", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "'   OR   '1'  =  '1"))).toBe(true);
            });

            test("balanced-quote trick: ' OR '1'='1'", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' OR '1'='1'"))).toBe(true);
            });

            test("AND-based redirect: anypass' AND email='user@test.com'--", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "anypass' AND email='user@test.com'--"))).toBe(true);
            });

            test("multi-quote confusion: x'' OR ''='", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "x'' OR ''='"))).toBe(true);
            });

            test("backslash-escape injection: user\\ OR 1=1--", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("user\\", " OR 1=1--"))).toBe(true);
            });

            test("MySQL # comment leaves stray tokens that cause detection", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("u@t.com", "' OR 1=1#"))).toBe(true);
            });

            test("C-style block comment /* */ leaves stray tokens", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("u@t.com", "' OR /*bypass*/ '1'='1"))).toBe(true);
            });
        });
    });

    // -----------------------------------------------------------------------
    describe("VerifyUserCredentials — injection detection (ENABLE_QUERY_TOKENIZATION=true)", () => {
        beforeEach(() => { process.env.ENABLE_QUERY_TOKENIZATION = "true"; });
        afterEach(() => { delete process.env.ENABLE_QUERY_TOKENIZATION; });

        test("OR-true injection throws", async () => {
            await expect(EmployeeHandler.VerifyUserCredentials("alice@example.com", "' OR '1'='1")).rejects.toThrow("SQL Injection detected");
        });

        test("OR 1=1-- injection throws", async () => {
            await expect(EmployeeHandler.VerifyUserCredentials("alice@example.com", "' OR 1=1--")).rejects.toThrow("SQL Injection detected");
        });

        test("OR bypass from code comments throws", async () => {
            await expect(EmployeeHandler.VerifyUserCredentials("bbender@planetexpress.com", "' OR email='bbender@planetexpress.com'--")).rejects.toThrow("SQL Injection detected");
        });

        test("UNION SELECT injection throws", async () => {
            await expect(EmployeeHandler.VerifyUserCredentials("alice@example.com", "' UNION SELECT * FROM Employees--")).rejects.toThrow("SQL Injection detected");
        });

        test("DROP TABLE injection throws", async () => {
            await expect(EmployeeHandler.VerifyUserCredentials("alice@example.com", "'; DROP TABLE Employees;--")).rejects.toThrow("SQL Injection detected");
        });

        test("injection in the email field throws", async () => {
            await expect(EmployeeHandler.VerifyUserCredentials("a' OR '1'='1", "password")).rejects.toThrow("SQL Injection detected");
        });

        test("backslash-escape injection throws", async () => {
            await expect(EmployeeHandler.VerifyUserCredentials("user\\", " OR 1=1--")).rejects.toThrow("SQL Injection detected");
        });

        test("thrown error includes the malicious query", async () => {
            const password = "' OR 1=1--";
            await expect(EmployeeHandler.VerifyUserCredentials("alice@example.com", password)).rejects.toThrow(buildQuery("alice@example.com", password));
        });
    });

    // -----------------------------------------------------------------------
    describe("tokenize", () => {
        test("empty string produces no tokens", () => {
            expect(tokenize("")).toEqual([]);
        });

        test("whitespace-only string produces no tokens", () => {
            expect(tokenize("   \t\n  ")).toEqual([]);
        });

        test("empty string literal '' becomes a single STRING token", () => {
            expect(tokenize("''")).toEqual(["STRING"]);
        });

        test("two adjacent string literals become two STRING tokens", () => {
            expect(tokenize("'' ''")).toEqual(["STRING", "STRING"]);
        });

        test("bare number becomes NUMBER", () => {
            expect(tokenize("42")).toEqual(["NUMBER"]);
        });

        test("number inside a string literal is absorbed into STRING", () => {
            expect(tokenize("'42'")).toEqual(["STRING"]);
        });

        test("operators = ; -- ( ) , are each isolated as tokens", () => {
            expect(tokenize("a=b;c--d(e)f,g")).toEqual([
                "a", "=", "b", ";", "c", "--", "d", "(", "e", ")", "f", ",", "g",
            ]);
        });

        test("clean credential query reduces to the expected template", () => {
            expect(tokenize(buildQuery("alice@example.com", "secret")).join(" ")).toBe(EXPECTED_QUERY);
        });
    });

});
