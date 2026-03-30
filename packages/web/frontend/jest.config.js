/** @type {import('jest').Config} */
const config = {
    testEnvironment: "node",
    testPathIgnorePatterns: ["/node_modules/", "/__mocks__/"],
    moduleNameMapper: {
        "^@employee-salary-manager/database/prisma$":
            "<rootDir>/src/__tests__/__mocks__/prisma.ts",
        "^@handlers/(.*)$": "<rootDir>/src/handlers/$1",
        "^@models/(.*)$": "<rootDir>/src/models/$1",
        "^@/components/(.*)$": "<rootDir>/src/components/$1",
        "^@/lib/(.*)$": "<rootDir>/src/lib/$1",
        "^@src/(.*)$": "<rootDir>/src/$1",
    },
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                tsconfig: {
                    module: "CommonJS",
                    moduleResolution: "node",
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                },
            },
        ],
    },
};

module.exports = config;
