<!--
PayTrack: Open-source employee salary exploit simulation platform for web application security, penetration testing, and vulnerability remediation. Hands-on challenges for learning OWASP, SQL injection, and secure coding best practices. Demo, docs, and MIT license.
-->
# PayTrack | Employee Salary Exploit Software

PayTrack is an open-source platform designed to help developers discover, understand, and remediate security exploits in real world web stacks. By simulating vulnerabilities and providing hands-on exploit challenges, PayTrack empowers you to sharpen your security skills and build more resilient applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) 

## Table of Contents

* [Features](#features)
* [Architecture](#architecture)
* [Project Structure](#project-structure)
* [Prerequisites](#prerequisites)
* [Getting Started](#getting-started)
  * [Clone the Repository](#clone-the-repository)
  * [Configure Environment Variables](#configure-environment-variables)
  * [Start with Docker Compose](#start-with-docker-compose)
* [Modifying Seed Data](#modifying-seed-data)
* [Exploit Challenges](#exploit-challenges)
   * [SQL Injection in Credential Verification](#sql-injection-in-credential-verification)
   * [Query Tokenization Detection Bypass](#query-tokenization-detection-bypass)
* [Contributing](#contributing)
* [License](#license)

---

## Features

* **Modular Monorepo**: Separate packages for core logic, database, and frontend.
* **Secure Data Management**: Prisma ORM with automated migrations.
* **Developer Tooling**: Pre-configured Docker Compose for rapid local setup.
* **Next.js Frontend**: Server‑side rendering, API routes, and modern React.

## Architecture

PayTrack is organized into three packages:

1. **Core**: Business logic, domain models, and request handlers.
2. **Database**: Prisma schema, migration scripts, and `init.sql` seed data.
3. **Frontend**: Next.js application with pages, components, and middleware.

Services are orchestrated via `docker-compose.yml` to ensure consistent development environments.

## Project Structure

```
PayTrack/
├── packages/
│   ├── core/       # Business logic, models, and handlers
│   ├── database/   # Prisma schema, migrations, and seed data
│   └── frontend/   # Next.js application
├── docker-compose.yml
├── .env.example
└── README.md
```

## Prerequisites

* **Node.js** (v16 or later)
* **Docker** & **Docker Compose**

## Getting Started

Follow these steps to run PayTrack locally.

### Clone the Repository

```bash
git clone https://github.com/stephen-mi11er/PayTrack
cd PayTrack
```

### Configure Environment Variables

Duplicate the example file and update values:

```bash
cp .env.example .env
# Edit .env as needed
```

Key variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | see `.env.example` |
| `ENABLE_QUERY_TOKENIZATION` | Enable SQL query tokenization-based injection detection in `VerifyUserCredentials` | `false` |

### Start with Docker Compose

```bash
docker-compose up --build --watch
```

This command will:

* Spin up a PostgreSQL database
* Apply Prisma migrations
* Seed initial data from `init.sql`
* Launch the Next.js frontend (default port: 4321)

Visit `http://localhost:4321` in your browser to access the app.

## Modifying Seed Data

If you need to adjust the SQL seed data in `init.sql`:

1. Tear down containers and volumes:

   ```bash
   docker-compose down --volumes
   ```

2. Edit the seed file:

   ```bash
   vim packages/database/init.sql
   ```

3. Restart the stack:

   ```bash
   docker-compose up --build
   ```

## Exploit Challenges 

### SQL Injection in Credential Verification

Can you spot the vulnerability in the following authentication logic?

```typescript
public static async VerifyUserCredentials(email: string, password: string): Promise<Employee | undefined> {
    // ...existing code...
    const unsafeQuery =
        "SELECT * FROM Employees " +
        "WHERE email = '" + email + "' " +
        "AND password = '" + password + "'";

    // ...existing code...
    const employeeArray: any[] = await prisma.$queryRawUnsafe(unsafeQuery);
    // ...existing code...
}
```

**Challenge:**
- What is the security flaw in this code?
- How could an attacker exploit it to gain unauthorized access?
- Can you gain access via the login screen?
- How would you fix it?

<details>
<summary><strong>Reveal Answer</strong></summary>

### Vulnerability: SQL Injection

This code is vulnerable to SQL injection because it directly interpolates untrusted user input (`email` and `password`) into a raw SQL query string. An attacker can craft input that alters the query logic, bypassing authentication.

**Example Attack:**
- Email: `bbender@planetexpress.com`
- Password: `' OR email='bbender@planetexpress.com'--`

This input transforms the query into:

```sql
SELECT * FROM Employees WHERE email = 'bbender@planetexpress.com' AND password = '' OR email='bbender@planetexpress.com'--'
```

The `--` comments out the rest of the query, so the password check is bypassed, and the attacker logs in as the target user.

### How to Fix
- **Never** interpolate user input directly into SQL queries.
- Use parameterized queries or Prisma's query builder:

```typescript
const employee = await prisma.employees.findFirst({
  where: { email, password }
});
```

Or, if using raw SQL, use `$queryRaw` with parameters:

```typescript
const employeeArray = await prisma.$queryRaw`SELECT * FROM Employees WHERE email = ${email} AND password = ${password}`;
```

</details>

### Query Tokenization Detection Bypass

The `VerifyUserCredentials` adds optional SQL injection detection logic, when `ENABLE_QUERY_TOKENIZATION=true`, every credential query is tokenized and compared against an expected token sequence before execution. If SQL injection is detected, code execution haulted by throwing an exception which prevents a users from logging into PayTrack. 

**How it works:**

The private `tokenize()` method normalizes a raw SQL string into a canonical sequence of tokens:

1. Collapses single-quoted string literals (including backslash-escaped quotes) into a `STRING` token — e.g. `'bbender@planetexpress.com'` → `STRING`
2. Collapses bare integer literals into a `NUMBER` token — e.g. `42` → `NUMBER`
3. Pads SQL operators and punctuation (`=`, `--`, `;`, `(`, `)`, `,`) with spaces so they become discrete tokens
4. Splits on whitespace to produce the final token array

An expected token template is defined at the call site:

```
SELECT * FROM Employees WHERE email = STRING AND password = STRING
```

If the token count of the actual (user-supplied) query differs from the template, the request is blocked and an error is thrown.

**Enabling detection:**

```bash
ENABLE_QUERY_TOKENIZATION=true
```

## Contributing

We welcome contributions that help improve PayTrack! Whether you’re submitting a new exploit, bug fix, or enhancing existing functionality, here’s how to get started:

Fork the repository and create a exploit branch:

```bash
git checkout -b exploit/your-exploit-name
```

Implement your changes:

New exploits: Add or extend detection modules in packages/core, update database seed data under packages/database/init.sql to simulate the exploit, and create any necessary fixtures. Use the `exploit/your-exploit-name` branch naming convention.

Bug fixes: Describe the issue, include steps to reproduce, and explain how your patch resolves it. Use the `bug/your-bug-name` branch naming convention.

Write a detailed description: Write a detailed description on how to exploit the vulnerability you are submitting.

Commit and push:

```bash
git add .
git commit -m 'feat: add detection for <exploit-name>'
git push origin exploit/your-exploit-name
```

Open a Pull Request: Provide a clear title and description, link to any related issues, and request reviews from the core team.

## License

This project is licensed under the [MIT License](LICENSE).