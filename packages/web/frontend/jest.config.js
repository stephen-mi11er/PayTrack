/** @type {import('jest').Config} */
const config = {
    testEnvironment: "node",
    testPathIgnorePatterns: ["/node_modules/", "/__mocks__/"],
    moduleNameMapper: {
        "^@employee-salary-manager/database/prisma$":
            "<rootDir>/src/__tests__/__mocks__/prisma.ts",
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
