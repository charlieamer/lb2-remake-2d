declare module 'node:assert/strict' {
  interface AssertStrict {
    equal(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  }
  const assert: AssertStrict;
  export default assert;
}

declare module 'node:test' {
  export interface TestContext { readonly name: string; }
  export type TestFn = (context: TestContext) => void | Promise<void>;
  export default function test(name: string, fn: TestFn): void;
}
