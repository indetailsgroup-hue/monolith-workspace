export function deepFreeze(value) {
  const seen = new WeakSet();

  function freeze(current) {
    if (!current || typeof current !== "object" || seen.has(current)) return current;
    seen.add(current);
    for (const child of Object.values(current)) freeze(child);
    if (!Object.isFrozen(current)) Object.freeze(current);
    return current;
  }

  return freeze(value);
}

export function cloneDraft(value) {
  return structuredClone(value);
}

export function createDraft(preset, language) {
  if (!preset?.copy?.[language]) throw new Error("unsupported_language");
  return cloneDraft({
    ...preset.base,
    language,
    presetId: preset.id,
    ...preset.copy[language]
  });
}

export function updateDraftAtPath(draft, path, value) {
  const forbiddenSegments = new Set(["__proto__", "prototype", "constructor"]);
  if (!Array.isArray(path) || path.length === 0 ||
      path.some((segment) => forbiddenSegments.has(String(segment)))) {
    throw new Error("invalid_path");
  }

  const next = cloneDraft(draft);
  let cursor = next;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (!cursor || typeof cursor !== "object" || !Object.hasOwn(cursor, segment)) {
      throw new Error("invalid_path");
    }
    if (index === path.length - 1) {
      cursor[segment] = value;
      return next;
    }
    cursor = cursor[segment];
  }
}

export function canonicalize(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((key) =>
      JSON.stringify(key) + ":" + canonicalize(value[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}
