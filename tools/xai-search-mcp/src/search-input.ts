import { z } from "zod";

import { MAX_DATE_RANGE_DAYS, MAX_HANDLES, MAX_QUERY_LENGTH } from "./config";

const handleSchema = z
  .string()
  .regex(/^[A-Za-z0-9_]{1,15}$/, "Xハンドルは@なしの英数字または_で指定してください");

const dateSchema = z.string().refine(isIsoCalendarDate, "日付は実在するYYYY-MM-DD形式で指定してください");

export const xSearchInputSchema = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    allowed_x_handles: z.array(handleSchema).max(MAX_HANDLES).optional(),
    excluded_x_handles: z.array(handleSchema).max(MAX_HANDLES).optional(),
    from_date: dateSchema.optional(),
    to_date: dateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allowed_x_handles?.length && value.excluded_x_handles?.length) {
      context.addIssue({
        code: "custom",
        message: "allowed_x_handlesとexcluded_x_handlesは同時に指定できません",
        path: ["excluded_x_handles"],
      });
    }

    if (!value.from_date || !value.to_date) {
      return;
    }

    const from = Date.parse(`${value.from_date}T00:00:00Z`);
    const to = Date.parse(`${value.to_date}T00:00:00Z`);
    if (from > to) {
      context.addIssue({
        code: "custom",
        message: "from_dateはto_date以前にしてください",
        path: ["from_date"],
      });
      return;
    }

    const days = (to - from) / 86_400_000 + 1;
    if (days > MAX_DATE_RANGE_DAYS) {
      context.addIssue({
        code: "custom",
        message: `検索期間は${MAX_DATE_RANGE_DAYS}日以内にしてください`,
        path: ["to_date"],
      });
    }
  });

export type XSearchInput = z.infer<typeof xSearchInputSchema>;

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
