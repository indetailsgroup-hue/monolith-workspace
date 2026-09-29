import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const svgNamespace = "http://www.w3.org/2000/svg";
const svgRoot = `<svg xmlns="${svgNamespace}" viewBox="0 0 1200 780" aria-hidden="true">`;

const allowedSvgAttributes = new Map([
  ["svg", new Set(["xmlns", "viewBox", "aria-hidden"])],
  ["rect", new Set([
    "x", "y", "width", "height", "rx", "fill", "stroke", "stroke-width",
    "stroke-dasharray", "transform"
  ])],
  ["path", new Set(["d", "fill", "stroke", "stroke-width", "stroke-linecap"])],
  ["circle", new Set(["cx", "cy", "r", "fill", "opacity", "stroke", "stroke-width"])]
]);

function decodeNumericCharacterReferences(source, label, optionalSemicolon = false) {
  const pattern = optionalSemicolon ? /&#(x[0-9a-f]+|\d+);?/gi : /&#(x[0-9a-f]+|\d+);/gi;
  return source.replace(pattern, (reference, encoded) => {
    const hexadecimal = encoded[0].toLowerCase() === "x";
    const codePoint = Number.parseInt(hexadecimal ? encoded.slice(1) : encoded, hexadecimal ? 16 : 10);
    assert.ok(
      codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff),
      `${label}: invalid numeric XML character reference ${reference}`
    );
    return String.fromCodePoint(codePoint);
  });
}

const decodeNumericXmlReferences = (source, label) =>
  decodeNumericCharacterReferences(source, label);

const decodeNumericHtmlReferences = (source, label) =>
  decodeNumericCharacterReferences(source, label, true);

function parseQuotedAttributes(source, label) {
  const attributes = new Map();
  const pattern = /\s*([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;
  let offset = 0;

  while (offset < source.length) {
    if (/^\s*$/.test(source.slice(offset))) break;
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    assert.ok(match, `${label}: malformed or unquoted attribute near ${source.slice(offset)}`);
    const [, name, doubleQuoted, singleQuoted] = match;
    assert.ok(!attributes.has(name), `${label}: duplicate attribute ${name}`);
    attributes.set(name, doubleQuoted ?? singleQuoted);
    offset = pattern.lastIndex;
  }

  assert.match(source.slice(offset), /^\s*$/, `${label}: unparsed attribute content`);
  return attributes;
}

function parseHtmlAttributes(source, label) {
  const attributes = new Map();
  const pattern = /\s*([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/gy;
  let offset = 0;

  while (offset < source.length) {
    if (/^\s*$/.test(source.slice(offset))) break;
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    assert.ok(match, `${label}: malformed, unquoted, or unparsed attribute near ${source.slice(offset)}`);
    const [, rawName, doubleQuoted, singleQuoted] = match;
    const name = rawName.toLowerCase();
    assert.ok(!attributes.has(name), `${label}: duplicate attribute ${name}`);
    const rawValue = doubleQuoted ?? singleQuoted;
    const value = rawValue === undefined ? null : decodeNumericHtmlReferences(rawValue, `${label} ${name}`);
    if (value !== null) {
      assert.doesNotMatch(value, /&#/i, `${label}: malformed numeric HTML character reference in ${name}`);
    }
    attributes.set(name, value);
    offset = pattern.lastIndex;
  }

  assert.match(source.slice(offset), /^\s*$/, `${label}: unparsed attribute content`);
  return attributes;
}

function scanHtmlOpeningTags(html) {
  const tags = [];
  const pattern = /<([A-Za-z][A-Za-z0-9:-]*)([^>]*)>/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const name = match[1].toLowerCase();
    tags.push({
      name,
      attributes: parseHtmlAttributes(match[2], `<${name}>`)
    });
  }

  return tags;
}

function getTagById(html, id) {
  return scanHtmlOpeningTags(html).find(({ attributes }) => attributes.get("id") === id);
}

function getDialogMarkup(html, id) {
  const start = html.indexOf(`<dialog id="${id}"`);
  assert.notEqual(start, -1, `${id}: dialog opening must exist`);
  const end = html.indexOf("</dialog>", start);
  assert.notEqual(end, -1, `${id}: dialog closing must exist`);
  return html.slice(start, end + "</dialog>".length);
}

function getCssRule(css, requiredSelectors) {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((selector) => selector.trim());
    if (requiredSelectors.every((selector) => selectors.includes(selector))) return match[2];
  }
  assert.fail(`missing CSS rule for selectors: ${requiredSelectors.join(", ")}`);
}

function getHexToken(css, name) {
  const match = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `--${name} must be a six-digit hex color token`);
  return match[1];
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function assertContrastAtLeast(first, second, minimum, label) {
  const ratio = contrastRatio(first, second);
  assert.ok(ratio >= minimum, `${label} must be >= ${minimum}:1; got ${ratio.toFixed(2)}:1`);
}

function assertDialogReferences(html, id) {
  const dialog = getTagById(html, id);
  assert.ok(dialog, `${id}: dialog must exist`);
  assert.equal(dialog.name, "dialog", `${id}: referenced element must be a dialog`);

  for (const attribute of ["aria-labelledby", "aria-describedby"]) {
    const references = dialog.attributes.get(attribute)?.trim().split(/\s+/).filter(Boolean) ?? [];
    assert.ok(references.length > 0, `${id}: ${attribute} must reference visible copy`);
    for (const reference of references) {
      assert.ok(getTagById(html, reference), `${id}: ${attribute} reference #${reference} must exist`);
    }
  }
}

function assertSafeSvg(source, label) {
  assert.ok(source.startsWith(svgRoot), `${label}: SVG root must use the canonical namespace and exact contract`);
  assert.ok(source.trimEnd().endsWith("</svg>"), `${label}: SVG root must close the document`);

  const decoded = decodeNumericXmlReferences(source, label);
  assert.doesNotMatch(decoded, /&/, `${label}: named or malformed entity references are forbidden`);
  assert.doesNotMatch(decoded, /<\?|<!/, `${label}: processing instructions and declarations are forbidden`);
  assert.doesNotMatch(decoded, /\burl\s*\(/i, `${label}: CSS url() references are forbidden`);
  assert.doesNotMatch(decoded, /\bdata\s*:/i, `${label}: embedded data URIs are forbidden`);
  assert.doesNotMatch(
    decoded.replace(`xmlns="${svgNamespace}"`, ""),
    /(?:https?|ftp):\/\//i,
    `${label}: external URL content is forbidden`
  );

  const tags = /<(\/)?([A-Za-z][A-Za-z0-9:-]*)([^>]*)>/g;
  const stack = [];
  let cursor = 0;
  let match;

  while ((match = tags.exec(decoded)) !== null) {
    assert.match(decoded.slice(cursor, match.index), /^\s*$/, `${label}: text content is forbidden`);
    const [, closing, name, rawAttributes] = match;
    assert.ok(allowedSvgAttributes.has(name), `${label}: forbidden SVG element <${name}>`);

    if (closing) {
      assert.match(rawAttributes, /^\s*$/, `${label}: closing tags cannot have attributes`);
      assert.equal(stack.pop(), name, `${label}: mismatched closing tag </${name}>`);
    } else {
      const selfClosing = /\/\s*$/.test(rawAttributes);
      const attributeSource = selfClosing ? rawAttributes.replace(/\/\s*$/, "") : rawAttributes;
      const attributes = parseQuotedAttributes(attributeSource, `${label} <${name}>`);
      const allowedAttributes = allowedSvgAttributes.get(name);

      for (const [attribute, value] of attributes) {
        assert.ok(allowedAttributes.has(attribute), `${label}: forbidden attribute ${attribute} on <${name}>`);
        assert.doesNotMatch(value, /[<>]/, `${label}: markup is forbidden inside attributes`);
        if (attribute !== "xmlns") {
          assert.doesNotMatch(value, /(?:https?|ftp):\/\/|\bdata\s*:|\burl\s*\(/i,
            `${label}: external reference in ${attribute}`);
        }
      }

      if (!selfClosing) stack.push(name);
    }

    cursor = tags.lastIndex;
  }

  assert.match(decoded.slice(cursor), /^\s*$/, `${label}: unparsed or text content is forbidden`);
  assert.deepEqual(stack, [], `${label}: unclosed SVG elements`);
}

function assertAllowedHtmlResources(html, css) {
  const tags = scanHtmlOpeningTags(html);
  const forbiddenLoaderElements = new Set([
    "style", "img", "iframe", "frame", "object", "embed", "video", "audio",
    "source", "track", "base", "portal", "svg"
  ]);
  const resourceAttributes = new Set([
    "href", "src", "srcset", "poster", "data", "ping", "action", "formaction", "style"
  ]);

  for (const { name, attributes } of tags) {
    assert.ok(!forbiddenLoaderElements.has(name), `extra resource-loading or inline style element <${name}>`);
    for (const [attribute, value] of attributes) {
      assert.doesNotMatch(attribute, /^on/i, `inline event-handler attribute ${attribute} is forbidden`);
      if (!resourceAttributes.has(attribute)) continue;

      const allowed =
        (name === "link" && attribute === "href" && value === "./line-flex-studio.css") ||
        (name === "script" && attribute === "src" && value === "./line-flex-studio.mjs") ||
        (name === "a" && attribute === "href" && /^#[A-Za-z][A-Za-z0-9_.:-]*$/.test(value));
      assert.ok(allowed, `unapproved resource attribute ${attribute} on <${name}>`);
    }
  }

  const metas = tags.filter(({ name }) => name === "meta");
  assert.deepEqual(
    metas.map(({ attributes }) => Object.fromEntries(attributes)),
    [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width,initial-scale=1" },
      { name: "color-scheme", content: "light" }
    ],
    "meta declarations must match the exact allowlist"
  );

  const links = tags.filter(({ name }) => name === "link");
  assert.equal(links.length, 1, "shell must load exactly one linked resource");
  assert.deepEqual(Object.fromEntries(links[0].attributes),
    { rel: "stylesheet", href: "./line-flex-studio.css" });

  const scriptOpenings = [...html.matchAll(/<script\b/gi)];
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scriptOpenings.length, 1, "shell must contain exactly one script opening tag");
  assert.equal(scripts.length, 1, "shell must load exactly one external module script");
  const scriptTags = tags.filter(({ name }) => name === "script");
  assert.equal(scriptTags.length, 1, "shell must contain exactly one parsed script tag");
  assert.deepEqual(Object.fromEntries(scriptTags[0].attributes),
    { type: "module", src: "./line-flex-studio.mjs" });
  assert.equal(scripts[0][2].trim(), "", "inline script content is forbidden");

  assert.doesNotMatch(css, /@import|url\s*\(/i, "CSS imports and URL resource loads are forbidden");
}

test("Studio shell exposes semantic controls and dialogs", async () => {
  const html = await read("line-flex-studio.html");
  for (const id of [
    "language-toggle", "tenant-context", "preset-list", "block-tabs", "field-panel",
    "phone-preview", "json-output", "validation-list", "payload-count",
    "copy-json", "download-json", "reset-draft", "run-journey",
    "liff-dialog", "receipt-dialog", "toast-live"
  ]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /<main/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<dialog[^>]+id="liff-dialog"/);
  assert.match(html, /<script type="module" src="\.\/line-flex-studio\.mjs"/);
});

test("Trust Concierge shell exposes truthful sandbox review and record semantics", async () => {
  const html = await read("line-flex-studio.html");
  assertDialogReferences(html, "liff-dialog");
  assertDialogReferences(html, "receipt-dialog");

  assert.equal(
    (html.match(/SANDBOX — NO BUSINESS EFFECT/g) ?? []).length,
    2,
    "both consequential dialogs must repeat the exact sandbox warning"
  );
  assert.match(html, /<h2 id="receipt-title">Sandbox Verification Record — Demo · No Business Effect<\/h2>/);
  assert.match(html, /Workflow and approval status did not change\./);
  assert.match(html, /The digest is not a signature\./);
  assert.match(html, /<dd data-review-mode>\s*sandbox\s*<\/dd>/);
  assert.match(html, /<dd data-business-effect>\s*none\s*<\/dd>/);

  for (const hook of [
    "data-review-expiry", "data-artifact-manifest-sha256", "data-liff-review",
    "data-review-outcome", "data-receipt"
  ]) assert.match(html, new RegExp(`\\b${hook}(?:[\\s=>])`), `${hook} must remain textContent-ready`);

  const outcome = scanHtmlOpeningTags(html)
    .find(({ attributes }) => attributes.has("data-review-outcome"));
  assert.ok(outcome, "bounded review outcome region must exist");
  assert.equal(outcome.attributes.get("role"), "status");
  assert.equal(outcome.attributes.get("aria-live"), "polite");
  assert.equal(outcome.attributes.get("aria-atomic"), "true");

  for (const hook of [
    "data-review-mode", "data-business-effect", "data-review-expiry",
    "data-artifact-manifest-sha256", "data-review-outcome"
  ]) {
    const element = scanHtmlOpeningTags(html).find(({ attributes }) => attributes.has(hook));
    assert.ok(!["input", "textarea", "select", "button"].includes(element.name),
      `${hook} must not be an editable control`);
  }
});

test("each consequential dialog uniquely owns and describes its exact visible sandbox warning", async () => {
  const html = await read("line-flex-studio.html");
  const tags = scanHtmlOpeningTags(html);
  const ids = tags.flatMap(({ attributes }) => attributes.has("id") ? [attributes.get("id")] : []);
  assert.equal(new Set(ids).size, ids.length, "every shell id must be globally unique");

  for (const [dialogId, warningId] of [
    ["liff-dialog", "liff-sandbox-warning"],
    ["receipt-dialog", "receipt-sandbox-warning"]
  ]) {
    const dialog = getTagById(html, dialogId);
    const describedBy = dialog.attributes.get("aria-describedby").trim().split(/\s+/);
    assert.ok(describedBy.includes(warningId), `${dialogId}: aria-describedby must include ${warningId}`);

    const warningTags = tags.filter(({ attributes }) => attributes.get("id") === warningId);
    assert.equal(warningTags.length, 1, `${warningId} must identify exactly one element`);
    assert.equal(warningTags[0].name, "p", `${warningId} must identify visible warning copy`);
    assert.equal(warningTags[0].attributes.get("class"), "sandbox-warning");
    assert.equal(warningTags[0].attributes.get("role"), "note");
    assert.ok(!warningTags[0].attributes.has("hidden"), `${warningId} must not be hidden`);
    assert.notEqual(warningTags[0].attributes.get("aria-hidden"), "true", `${warningId} must remain exposed`);

    const dialogMarkup = getDialogMarkup(html, dialogId);
    assert.equal(
      (dialogMarkup.match(/SANDBOX — NO BUSINESS EFFECT/g) ?? []).length,
      1,
      `${dialogId} must contain exactly one exact sandbox warning`
    );
    assert.match(
      dialogMarkup,
      new RegExp(`<p\\b(?=[^>]*\\bid="${warningId}")[^>]*>\\s*SANDBOX — NO BUSINESS EFFECT\\s*</p>`),
      `${warningId} must label the visible exact warning text`
    );
  }
});

test("Trust Concierge styles preserve warning, digest, focus, scroll, mobile, and reduced-motion access", async () => {
  const css = await read("line-flex-studio.css");
  assert.match(css, /\.sandbox-warning\{[^}]*position:sticky[^}]*background:var\(--sandbox-warning-bg\)[^}]*color:var\(--sandbox-warning-ink\)/);
  assert.match(css, /\.sandbox-dialog-body\{[^}]*overflow-y:auto/);
  assert.match(css, /\.sandbox-digest\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.sandbox-outcome\{[^}]*border-left:/);
  assert.match(css, /\.sandbox-dialog-actions button:focus-visible\{/);
  assert.match(css, /@media\(max-width:480px\)\{[^}]*\.sandbox-dialog-actions\{[^}]*flex-direction:column/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{/);
});

test("sandbox height tokens keep ordered vh fallbacks before dvh overrides", async () => {
  const css = await read("line-flex-studio.css");
  const root = css.match(/:root\{([^}]*)\}/)?.[1] ?? "";
  assert.match(
    root,
    /--sandbox-dialog-max-height:calc\(100vh - 28px\);\s*--sandbox-dialog-max-height:calc\(100dvh - 28px\);/,
    "base dialog height must declare vh before the dvh enhancement"
  );

  const mobileStart = css.indexOf("@media(max-width:480px)");
  const mobileEnd = css.indexOf("@media print", mobileStart);
  assert.ok(mobileStart >= 0 && mobileEnd > mobileStart, "mobile sandbox block must remain bounded");
  const mobile = css.slice(mobileStart, mobileEnd);
  assert.match(
    mobile,
    /--sandbox-dialog-max-height:calc\(100vh - 16px\);\s*--sandbox-dialog-max-height:calc\(100dvh - 16px\);/,
    "mobile dialog height must declare vh before the dvh enhancement"
  );
});

test("global and sandbox focus indicators use measured contrasting dual rings", async () => {
  const css = await read("line-flex-studio.css");
  const focusRing = getHexToken(css, "focus-ring");
  const focusHalo = getHexToken(css, "focus-halo");
  const surface = getHexToken(css, "surface");
  const platform = getHexToken(css, "platform");
  const sandboxWarning = getHexToken(css, "sandbox-warning-bg");

  assertContrastAtLeast(focusRing, surface, 3, "focus ring contrast on white");
  assertContrastAtLeast(focusHalo, platform, 3, "focus halo contrast on platform");
  assertContrastAtLeast(focusHalo, sandboxWarning, 3, "focus halo contrast on warning");

  const focusRule = getCssRule(css, [
    "button:focus-visible", "input:focus-visible", "textarea:focus-visible",
    "select:focus-visible", "[role=tab]:focus-visible",
    ".sandbox-dialog-actions button:focus-visible"
  ]);
  assert.match(focusRule, /outline:3px solid var\(--focus-ring\)/);
  assert.match(focusRule, /outline-offset:2px/);
  assert.match(focusRule, /box-shadow:0 0 0 6px var\(--focus-halo\)/);
});

test("runtime shell uses only the approved local stylesheet and module", async () => {
  const html = await read("line-flex-studio.html");
  const css = await read("line-flex-studio.css");
  assertAllowedHtmlResources(html, css);
  assert.doesNotMatch(html, /analytics|segment|pixel|gtag/i);
  assert.doesNotMatch(html, /(?:https?|ftp):\/\//i);
});

test("runtime allowlist rejects extra loaders, inline styles, remote resources, and CSS URLs", async () => {
  const html = await read("line-flex-studio.html");
  const css = await read("line-flex-studio.css");
  const fixtures = [
    html.replace("</body>", '<script src="./extra.mjs"></script></body>'),
    html.replace("</body>", '<img src="./tracking.png" alt=""></body>'),
    html.replace("<body>", '<body style="display:none">'),
    html.replace("</head>", '<link rel="preload" href="https://attacker.invalid/font.woff2"></head>')
  ];

  for (const malicious of fixtures) {
    assert.throws(() => assertAllowedHtmlResources(malicious, css));
  }
  assert.throws(
    () => assertAllowedHtmlResources(html, `${css}\n.sandbox-warning{background:url(https://attacker.invalid/x)}`),
    /CSS imports and URL resource loads are forbidden/
  );
});

test("runtime shell rejects inline event-handler attributes", async () => {
  const html = await read("line-flex-studio.html");
  const css = await read("line-flex-studio.css");
  const malicious = html.replace("<body>", `<body onload="location='https://attacker.invalid/'">`);
  assert.throws(
    () => assertAllowedHtmlResources(malicious, css),
    /inline event-handler attribute/i
  );
});

test("runtime shell rejects entity-encoded meta refresh directives", async () => {
  const html = await read("line-flex-studio.html");
  const css = await read("line-flex-studio.css");
  const maliciousMeta = '<meta http-equiv="ref&#x72;esh" content="0;url=&#x68;ttps://attacker.invalid/">';
  const malicious = html.replace("</head>", `  ${maliciousMeta}\n</head>`);
  assert.throws(
    () => assertAllowedHtmlResources(malicious, css),
    /meta declaration/i
  );
});

test("responsive grid keeps 1440 three-column and makes 1024 a two-row layout", async () => {
  const css = await read("line-flex-studio.css");
  const desktopGrid = css.match(/\.studio-grid\{[^}]*grid-template-columns:([^;}]+)/);
  assert.ok(desktopGrid, "base Studio grid declaration must exist");
  assert.equal(
    (desktopGrid[1].match(/minmax\(/g) ?? []).length,
    3,
    "the layout above the tablet breakpoint must retain three columns"
  );

  const tabletGrid = css.match(
    /@media\(max-width:(\d+)px\)\{\.studio-grid\{grid-template-columns:1fr 1fr\}\.code-pane\{grid-column:1\/-1\}\}/
  );
  assert.ok(tabletGrid, "tablet rule must make two columns with the code pane on a second row");
  const tabletMaxWidth = Number(tabletGrid[1]);
  assert.equal(tabletMaxWidth, 1024, "1024px must enter the approved two-row layout");
  assert.ok(1440 > tabletMaxWidth, "1440px must remain outside the two-row tablet rule");
});

test("all five local SVG assets are self-contained", async () => {
  for (const name of [
    "design-approval-hero.svg", "quote-order-hero.svg", "sla-escalation-hero.svg",
    "site-update-hero.svg", "issue-evidence-hero.svg"
  ]) {
    const svg = await read("assets/line-flex-studio/" + name);
    assertSafeSvg(svg, name);
  }
});

test("encoded numeric references cannot hide remote SVG resources", () => {
  const malicious = `${svgRoot}
<path d="M0 0h20v20z" fill="&#x75;&#114;&#108;(&#104;&#116;&#116;&#112;&#58;//attacker.invalid/paint.svg#x)"/>
</svg>`;
  assert.doesNotMatch(
    malicious.replace(`xmlns="${svgNamespace}"`, ""),
    /https?:\/\//i,
    "fixture demonstrates the old raw-regex bypass outside the legitimate namespace"
  );
  assert.throws(
    () => assertSafeSvg(malicious, "encoded remote fixture"),
    /CSS url\(\) references are forbidden/
  );
});
