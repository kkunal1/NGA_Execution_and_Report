export type ConditionExpectation = {
  entity: string;
  field: string;
  operator: string;
  value: string;
};

export type ConditionActual = {
  /** Displayed text of the row's dropdowns, in order. */
  controls: string[];
  /** Text held by the row's free-text inputs. */
  inputs: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");

// Widget chrome that leaks into a dropdown's text content.
const CHROME = /\b(arrow_drop_down|expand_more|close|cancel|clear|×|▼)\b/gi;

const clean = (s: string) => s.replace(CHROME, " ").replace(/\s+/g, " ").trim();

/** Whole-label match after stripping widget chrome; substrings never count. */
export function matchesExactly(actual: string, expected: string): boolean {
  const a = clean(actual);
  return a.length > 0 && norm(a) === norm(expected);
}

/**
 * Confirms the built filter row really reads "<entity> / <field> / <operator> / <value>".
 * Guards against substring picks such as "GoalName" being chosen instead of "Name".
 */
export function checkCondition(
  expected: ConditionExpectation,
  actual: ConditionActual,
): string[] {
  const problems: string[] = [];
  const boxes: [string, string][] = [
    ["entity", expected.entity],
    ["field", expected.field],
    ["operator", expected.operator],
  ];

  boxes.forEach(([name, want], i) => {
    const got = actual.controls[i] ?? "";
    if (!matchesExactly(got, want)) {
      problems.push(`${name} box should be "${want}" but shows "${clean(got) || "(empty)"}"`);
    }
  });

  const valueOk = actual.inputs.some((v) => norm(v).includes(norm(expected.value)));
  if (!valueOk) {
    problems.push(
      `value box should contain "${expected.value}" but shows "${
        actual.inputs.map(clean).filter(Boolean).join(" | ") || "(empty)"
      }"`,
    );
  }

  return problems;
}
