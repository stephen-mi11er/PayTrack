import { EmployeeHandler } from "../handlers/employee-handler";
import prisma from "@employee-salary-manager/database/prisma";

/**
 * Exposes the private static isSQLInjection method for direct unit testing.
 */
const isSQLInjection = (expectedQuery: string, unsafeQuery: string): boolean =>
    (EmployeeHandler as any).isSQLInjection(expectedQuery, unsafeQuery);

/**
 * The expected SQL template used by VerifyUserCredentials.
 * Placeholders (STRING) stand in for all single-quoted string literals.
 */
const EXPECTED_QUERY =
    "SELECT * FROM Employees WHERE email = STRING AND password = STRING";

/**
 * Mirrors the exact query construction in VerifyUserCredentials so tests
 * reflect real-world invocation.
 */
const buildQuery = (email: string, password: string): string =>
    "SELECT * FROM Employees " +
    "WHERE email = '" + email + "' " +
    "AND password = '" + password + "'";

// ---------------------------------------------------------------------------

describe("EmployeeHandler", () => {
    // -----------------------------------------------------------------------
    describe("isSQLInjection", () => {
        // -------------------------------------------------------------------
        describe("returns false — legitimate clean inputs", () => {
            test("standard email and strong password", () => {
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user@example.com", "P@ssw0rd!"))
                ).toBe(false);
            });

            test("both fields are empty strings", () => {
                expect(isSQLInjection(EXPECTED_QUERY, buildQuery("", ""))).toBe(false);
            });

            test("alphanumeric values without special characters", () => {
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("alice123", "opensesame99"))
                ).toBe(false);
            });

            test("email with dots, hyphens, and plus sign", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery("first.last+tag@sub.example.co.uk", "secret")
                    )
                ).toBe(false);
            });

            test("password with non-quote special characters", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery("user@test.com", "!@#$%^&*()-+=[]{}|:<>?/")
                    )
                ).toBe(false);
            });

            test("values that contain SQL keywords as part of a legitimate string", () => {
                // SQL keywords inside single-quoted literals are tokenized as STRING, not keywords
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery("select@example.com", "OR AND WHERE SELECT FROM")
                    )
                ).toBe(false);
            });

            test("password that is literally the placeholder word STRING", () => {
                // 'STRING' → tokenized to the STRING placeholder, matching the expected template
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "STRING"))
                ).toBe(false);
            });

            test("password containing double-dash inside the value (safe, not a SQL comment)", () => {
                // '--' is inside the quoted string literal and becomes part of STRING
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "pass--word"))
                ).toBe(false);
            });

            test("password containing digits (digits inside quoted strings are safe)", () => {
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user123@test.com", "p4ssw0rd456"))
                ).toBe(false);
            });
        });

        // -------------------------------------------------------------------
        describe("returns true — SQL injection detected", () => {
            test("classic OR-true injection in password: ' OR '1'='1", () => {
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' OR '1'='1"))
                ).toBe(true);
            });

            test("OR with numeric comparison and comment: ' OR 1=1--", () => {
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' OR 1=1--"))
                ).toBe(true);
            });

            test("stacked-query injection — DROP TABLE via semicolons", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery("user@test.com", "'; DROP TABLE Employees;--")
                    )
                ).toBe(true);
            });

            test("injection in the email field: a' OR '1'='1", () => {
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("a' OR '1'='1", "anypassword"))
                ).toBe(true);
            });

            test("example from code comments — OR bypass matching a known email", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery(
                            "bbender@planetexpress.com",
                            "' OR email='bbender@planetexpress.com'--"
                        )
                    )
                ).toBe(true);
            });

            test("UNION SELECT data exfiltration", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery("user@test.com", "' UNION SELECT * FROM Employees--")
                    )
                ).toBe(true);
            });

            test("subquery injection: AND (SELECT COUNT(*) ...) > 0", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery(
                            "user@test.com",
                            "' AND (SELECT COUNT(*) FROM Employees) > 0 AND '1'='1"
                        )
                    )
                ).toBe(true);
            });

            test("email field with trailing comment — truncates the password clause", () => {
                // The '--' after the email closes the query, skipping the password check entirely
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("admin@example.com'--", "ignored"))
                ).toBe(true);
            });

            test("numeric-based OR injection in password: ' OR id=1--", () => {
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' OR id=1--"))
                ).toBe(true);
            });

            test("stacked INSERT injection", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery(
                            "user@test.com",
                            "'; INSERT INTO Employees VALUES ('x','x','x@x.com','0','1');--"
                        )
                    )
                ).toBe(true);
            });

            test("UPDATE injection via stacked query", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery(
                            "user@test.com",
                            "'; UPDATE Employees SET salary=999999 WHERE '1'='1"
                        )
                    )
                ).toBe(true);
            });
        });

        // -------------------------------------------------------------------
        describe("bypass attempts — tokenizer must still detect the injection", () => {
            test("extra whitespace padding around injected operators", () => {
                // Spacing is normalised by split/filter, so extra spaces do not help the attacker
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery("user@test.com", "'   OR   '1'  =  '1")
                    )
                ).toBe(true);
            });

            test("balanced-quote trick: ' OR '1'='1' — still produces extra STRING tokens", () => {
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "' OR '1'='1'"))
                ).toBe(true);
            });

            test("injection using AND instead of OR to stay under the radar", () => {
                // AND-based attacks still add extra tokens outside the string literals
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery("user@test.com", "anypass' AND email='user@test.com'--")
                    )
                ).toBe(true);
            });

            test("comment-truncation bypass: close email quote early with '--'", () => {
                // Attacker sets email = "admin'--" so the password clause is commented out
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("admin'--", "anything"))
                ).toBe(true);
            });

            test("email-only OR redirect: attacker redirects the WHERE to match by email alone", () => {
                expect(
                    isSQLInjection(
                        EXPECTED_QUERY,
                        buildQuery("user@test.com", "' OR email='user@test.com'--")
                    )
                ).toBe(true);
            });

            test("multi-quote confusion: password with two consecutive single quotes mid-injection", () => {
                // '''' might confuse naïve parsers; regex still picks up the imbalance
                expect(
                    isSQLInjection(EXPECTED_QUERY, buildQuery("user@test.com", "x'' OR ''='"))
                ).toBe(true);
            });
        });
    });

    // -----------------------------------------------------------------------
    describe("VerifyUserCredentials", () => {
        const mockEmployee = {
            eid: "emp-1",
            name: "Alice Smith",
            email: "alice@example.com",
            password: "hashed_password",
            salary: 60000,
            position: "Engineer",
        };

        beforeEach(() => {
            jest.clearAllMocks();
            delete process.env.ENABLE_QUERY_TOKENIZATION;
        });

        test("returns the matching employee on valid credentials", async () => {
            jest.mocked(prisma.$queryRawUnsafe).mockResolvedValue([mockEmployee]);
            const result = await EmployeeHandler.VerifyUserCredentials(
                "alice@example.com",
                "secret"
            );
            expect(result).toEqual(mockEmployee);
        });

        test("returns null when no rows are returned", async () => {
            jest.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);
            const result = await EmployeeHandler.VerifyUserCredentials(
                "alice@example.com",
                "wrong"
            );
            expect(result).toBeNull();
        });

        test("converts a Prisma Decimal salary to a plain JavaScript number", async () => {
            jest.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
                { ...mockEmployee, salary: { toNumber: () => 75000 } },
            ]);
            const result = await EmployeeHandler.VerifyUserCredentials(
                "alice@example.com",
                "secret"
            );
            expect(result?.salary).toBe(75000);
        });

        test("forwards the constructed SQL string to prisma.$queryRawUnsafe", async () => {
            jest.mocked(prisma.$queryRawUnsafe).mockResolvedValue([mockEmployee]);
            await EmployeeHandler.VerifyUserCredentials("alice@example.com", "secret");
            expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
                buildQuery("alice@example.com", "secret")
            );
        });

        // -------------------------------------------------------------------
        describe("with ENABLE_QUERY_TOKENIZATION=true", () => {
            beforeEach(() => {
                process.env.ENABLE_QUERY_TOKENIZATION = "true";
            });

            test("allows a valid query through the tokenization gate", async () => {
                jest.mocked(prisma.$queryRawUnsafe).mockResolvedValue([mockEmployee]);
                const result = await EmployeeHandler.VerifyUserCredentials(
                    "alice@example.com",
                    "valid_password"
                );
                expect(result).toEqual(mockEmployee);
            });

            test("throws when password contains OR-true injection: ' OR '1'='1", async () => {
                await expect(
                    EmployeeHandler.VerifyUserCredentials("alice@example.com", "' OR '1'='1")
                ).rejects.toThrow("SQL Injection detected");
            });

            test("throws on OR 1=1 comment injection", async () => {
                await expect(
                    EmployeeHandler.VerifyUserCredentials("alice@example.com", "' OR 1=1--")
                ).rejects.toThrow("SQL Injection detected");
            });

            test("throws on the exact example from the code comments", async () => {
                await expect(
                    EmployeeHandler.VerifyUserCredentials(
                        "bbender@planetexpress.com",
                        "' OR email='bbender@planetexpress.com'--"
                    )
                ).rejects.toThrow("SQL Injection detected");
            });

            test("throws on UNION SELECT injection", async () => {
                await expect(
                    EmployeeHandler.VerifyUserCredentials(
                        "alice@example.com",
                        "' UNION SELECT * FROM Employees--"
                    )
                ).rejects.toThrow("SQL Injection detected");
            });

            test("throws on stacked DROP TABLE query", async () => {
                await expect(
                    EmployeeHandler.VerifyUserCredentials(
                        "alice@example.com",
                        "'; DROP TABLE Employees;--"
                    )
                ).rejects.toThrow("SQL Injection detected");
            });

            test("throws on injection in the email field", async () => {
                await expect(
                    EmployeeHandler.VerifyUserCredentials("a' OR '1'='1", "password")
                ).rejects.toThrow("SQL Injection detected");
            });

            test("does NOT call prisma when an injection is detected", async () => {
                await expect(
                    EmployeeHandler.VerifyUserCredentials("alice@example.com", "' OR 1=1--")
                ).rejects.toThrow();
                expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
            });

            test("includes the malicious query in the thrown error message", async () => {
                const maliciousPassword = "' OR 1=1--";
                await expect(
                    EmployeeHandler.VerifyUserCredentials("alice@example.com", maliciousPassword)
                ).rejects.toThrow(buildQuery("alice@example.com", maliciousPassword));
            });
        });
    });
});
