export type ActionState = { status: "idle" | "ok" | "error"; message?: string };

export const idle: ActionState = { status: "idle" };
