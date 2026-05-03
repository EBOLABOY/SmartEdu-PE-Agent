export type EnhancementSource = "agent" | "baseline";

export type EnhancementResult<T> = {
  fallbackReason?: string;
  source: EnhancementSource;
  value: T;
  warnings: string[];
};

export function formatEnhancementError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function resolvePositiveIntegerEnv(name: string, fallback: number) {
  const configured = Number.parseInt(process.env[name] ?? "", 10);

  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

export async function withEnhancementTimeout<T>(input: {
  operation: Promise<T>;
  timeoutMs: number;
  timeoutMessage: string;
}) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    input.operation,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(input.timeoutMessage)), input.timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export async function runBaselineFirstEnhancement<T>(input: {
  baseline: T;
  enhancement: () => Promise<T>;
  fallbackReason: (error: unknown) => string;
  onEnhancementSkipped?: (error: unknown) => void;
}): Promise<EnhancementResult<T>> {
  try {
    return {
      source: "agent",
      value: await input.enhancement(),
      warnings: [],
    };
  } catch (error) {
    const fallbackReason = input.fallbackReason(error);
    input.onEnhancementSkipped?.(error);

    return {
      fallbackReason,
      source: "baseline",
      value: input.baseline,
      warnings: [fallbackReason],
    };
  }
}
