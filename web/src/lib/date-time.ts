import { z } from "zod";

const dateLikeSchema = z.union([z.string().trim().min(1), z.date()]);

export const isoDateTimeSchema = z.string().datetime();

export function toIsoDateTime(value: string | Date, fieldName = "datetime") {
  const parsedValue = dateLikeSchema.safeParse(value);

  if (!parsedValue.success) {
    throw new Error(`${fieldName} 不是合法的日期时间。`);
  }

  const date = parsedValue.data instanceof Date ? parsedValue.data : new Date(parsedValue.data);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} 不是合法的日期时间。`);
  }

  return date.toISOString();
}
