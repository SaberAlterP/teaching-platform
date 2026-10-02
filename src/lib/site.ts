import "server-only";
import { db, schema } from "@/db";

export type SignupMode = "approval" | "open" | "closed";

export async function getSignupMode(): Promise<SignupMode> {
  const row = await db.query.siteSettings.findFirst();
  const m = row?.teacherSignup;
  return m === "open" || m === "closed" ? m : "approval";
}

export async function setSignupMode(mode: SignupMode) {
  await db
    .insert(schema.siteSettings)
    .values({ id: "global", teacherSignup: mode })
    .onConflictDoUpdate({ target: schema.siteSettings.id, set: { teacherSignup: mode } });
}
