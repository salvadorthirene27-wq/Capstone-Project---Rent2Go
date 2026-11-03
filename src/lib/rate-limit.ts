import { db } from "./db";
import { DomainError } from "../modules/partners/workflow";
export async function rateLimit(key: string, limit = 60) {
  const { rows } = await db.query(
    "INSERT INTO app_request_budget(budget_key,hits,window_start) VALUES($1,1,now()) ON CONFLICT(budget_key) DO UPDATE SET hits=CASE WHEN app_request_budget.window_start<now()-interval '1 minute' THEN 1 ELSE app_request_budget.hits+1 END,window_start=CASE WHEN app_request_budget.window_start<now()-interval '1 minute' THEN now() ELSE app_request_budget.window_start END RETURNING hits",
    [key],
  );
  if (rows[0].hits > limit)
    throw new DomainError(
      "Too many requests. Wait one minute and try again.",
      429,
    );
}
