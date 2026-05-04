/**
 * @module type-guards
 * 通用类型守卫与深拷贝工具。提供运行时类型检查函数和
 * 兼容性深拷贝实现，供持久化层和协议层使用。
 */

/**
 * 检查值是否为非空普通对象（排除数组和null）
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 安全的深拷贝函数，优先使用 structuredClone
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}