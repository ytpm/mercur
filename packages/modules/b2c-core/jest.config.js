/**
 * Jest configuration for b2c-core module tests
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "./src",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@medusajs/framework/workflows-sdk$": "<rootDir>/../node_modules/@medusajs/framework/dist/workflows-sdk/index.js",
    "^@medusajs/framework/utils$": "<rootDir>/../node_modules/@medusajs/framework/dist/utils/index.js",
    "^@medusajs/framework$": "<rootDir>/../node_modules/@medusajs/framework/dist/index.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/../tsconfig.json",
      },
    ],
  },
  collectCoverageFrom: [
    "workflows/seller/steps/*.ts",
    "shared/infra/http/utils/*.ts",
    "shared/infra/http/middlewares/*.ts",
    "!**/__tests__/**",
    "!**/node_modules/**",
  ],
  coverageDirectory: "../coverage",
  verbose: true,
  testTimeout: 10000,
};
