import { z } from "zod";
export function manilaInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter a valid date and time in Manila.");
  const stamped = `${value}:00+08:00`;
  if (!z.iso.datetime({ offset: true }).safeParse(stamped).success)
    throw new Error("Enter a valid date and time in Manila.");
  const date = new Date(stamped);
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) !==
      value
  )
    throw new Error("Enter a valid date and time in Manila.");
  return date.toISOString();
}
