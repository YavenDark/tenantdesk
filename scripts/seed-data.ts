// Fixed IDs keep the seed idempotent and let tests reference fixtures directly.
export const TENANT_A = "00000000-0000-4000-8000-00000000000a";
export const TENANT_B = "00000000-0000-4000-8000-00000000000b";

export const ALICE = "00000000-0000-4000-8000-0000000000a1";
export const BOB = "00000000-0000-4000-8000-0000000000b1";
export const VERA = "00000000-0000-4000-8000-0000000000a2";

export const PROJECT_A = "00000000-0000-4000-8000-000000000a01";
export const PROJECT_B = "00000000-0000-4000-8000-000000000b01";

export const SEED_PROJECT_NAMES = { [PROJECT_A]: "Apollo", [PROJECT_B]: "Borealis" } as const;

// Test-only defaults. Override with SEED_PASSWORD_* for any shared environment.
export const seedUsers = () => [
  { id: ALICE, email: "alice@acme.test", password: process.env.SEED_PASSWORD_ALICE || "alice-test-only" },
  { id: BOB, email: "bob@globex.test", password: process.env.SEED_PASSWORD_BOB || "bob-test-only" },
  { id: VERA, email: "vera@acme.test", password: process.env.SEED_PASSWORD_VERA || "vera-test-only" },
];
