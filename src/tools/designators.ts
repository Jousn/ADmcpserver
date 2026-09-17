export function parseDesignatorsFromComponentData(result: unknown): string[] {
  let list: unknown[] = [];
  if (typeof result === "string") {
    try {
      list = JSON.parse(result) as unknown[];
    } catch {
      return [];
    }
  } else if (Array.isArray(result)) {
    list = result;
  } else {
    return [];
  }
  const out: string[] = [];
  for (const item of list) {
    if (item && typeof item === "object" && "designator" in item) {
      const d = (item as { designator?: unknown }).designator;
      if (typeof d === "string") out.push(d);
    }
  }
  return out;
}
