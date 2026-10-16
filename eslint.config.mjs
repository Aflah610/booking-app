import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "dist/**", "drizzle/**"] },
  {
    // Only repositories (and the db module itself) may talk to the database.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/db/**", "src/features/**/*.repository.ts", "src/features/container.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["drizzle-orm", "drizzle-orm/*", "pg"], message: "Database access belongs in a *.repository.ts file." },
            { group: ["@/db", "@/db/*"], message: "Database access belongs in a *.repository.ts file." },
          ],
        },
      ],
    },
  },
];

export default config;
