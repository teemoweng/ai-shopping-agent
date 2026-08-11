import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const START_MARKER = "<!-- EVIDENCE_DOCUMENTS_START -->";
const END_MARKER = "<!-- EVIDENCE_DOCUMENTS_END -->";

export const EVIDENCE_DOCUMENTS = Object.freeze([
  {
    key: "overview",
    source: "README.md",
    kicker: "Project overview",
    title: "产品概览与边界",
    summary: "产品面向谁、从哪里进入、完成什么任务，以及 AI 建议如何衔接到模拟交易。",
  },
  {
    key: "interaction",
    source: "docs/superpowers/specs/2026-08-10-chat-first-lightweight-guide-design.md",
    kicker: "Interaction spec",
    title: "Chat-first 交互规格",
    summary: "轻量开场、单问题澄清、先结论后商品，以及比较与依据按需展开的完整设计。",
  },
  {
    key: "evaluation",
    source: "artifacts/evidence/chat-first-verification.md",
    kicker: "Evaluation",
    title: "原型评测",
    summary: "任务完整性、体验契约、系统边界和仍待真人验证的产品假设。",
  },
  {
    key: "machine",
    source: "artifacts/evidence/chat-first-run-manifest.json",
    kicker: "Machine evidence",
    title: "运行证据",
    summary: "被测提交、测试数量、浏览器环境、输入数据哈希与正式截图哈希。",
  },
  {
    key: "roadmap",
    source: "PLAN.md",
    kicker: "Roadmap",
    title: "阶段计划",
    summary: "当前可运行原型与真实模型、Hybrid Retrieval、用户研究等后续能力的边界。",
  },
  {
    key: "delivery",
    source: "TASKS.md",
    kicker: "Delivery ledger",
    title: "交付状态",
    summary: "每项能力对应的交付证据、当前成熟度、未完成假设与已知限制。",
  },
]);

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function uniqueHeadingId(key, text, counts) {
  const base = `${key}-${slugify(text)}`;
  const count = (counts.get(base) ?? 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function isExternalUrl(url) {
  return /^(https?:|mailto:)/i.test(url);
}

function isUnsafeUrl(url) {
  return /^(javascript:|data:|vbscript:)/i.test(url.trim());
}

export function rewriteLink(url, source) {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("#")) return trimmed;
  if (isUnsafeUrl(trimmed)) return null;
  if (isExternalUrl(trimmed)) return trimmed;
  const [pathname, suffix = ""] = trimmed.split(/(?=[?#])/u, 2);
  const sourceDirectory = path.posix.dirname(source);
  const resolved = path.posix.normalize(path.posix.join(sourceDirectory, pathname));
  return `./${resolved.replace(/^\.\//, "")}${suffix}`;
}

function renderInline(value, context) {
  const tokens = [];
  const token = (html) => {
    const id = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return id;
  };

  let output = String(value);
  output = output.replace(/`([^`]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`));
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) => {
    const href = rewriteLink(url, context.source);
    if (!href) return token(`<span class="unsafe-link">${escapeHtml(alt)}</span>`);
    return token(`<img src="${escapeHtml(href)}" alt="${escapeHtml(alt)}" loading="lazy" />`);
  });
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) => {
    const href = rewriteLink(url, context.source);
    if (!href) return token(`<span class="unsafe-link">${escapeHtml(label)}</span>`);
    const external = isExternalUrl(href) ? ' target="_blank" rel="noreferrer"' : "";
    return token(`<a href="${escapeHtml(href)}"${external}>${escapeHtml(label)}</a>`);
  });

  output = escapeHtml(output)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return output.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
}

function isTableDelimiter(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll("\\|", "|"));
}

function startsBlock(lines, index) {
  const line = lines[index] ?? "";
  const next = lines[index + 1] ?? "";
  return (
    /^\s*$/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*([-*+] |\d+\. )/.test(line) ||
    /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    (line.includes("|") && isTableDelimiter(next))
  );
}

export function renderMarkdown(markdown, context) {
  const lines = String(markdown).replaceAll("\r\n", "\n").split("\n");
  const html = [];
  const toc = [];
  const headingCounts = new Map();
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : "";
      html.push(`<pre><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = uniqueHeadingId(context.key, text, headingCounts);
      html.push(`<h${level} id="${id}">${renderInline(text, context)}</h${level}>`);
      if (level === 2 || level === 3) toc.push({ level, id, text: text.replace(/[`*_~]/g, "") });
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push("<hr />");
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      const callout = quote[0]?.match(/^\[!([A-Z]+)\]\s*(.*)$/);
      if (callout) {
        quote.shift();
        html.push(
          `<aside class="markdown-callout" data-kind="${escapeHtml(callout[1].toLowerCase())}"><strong>${escapeHtml(callout[2] || callout[1])}</strong>${quote.length ? `<p>${renderInline(quote.join("<br />"), context)}</p>` : ""}</aside>`,
        );
      } else {
        html.push(`<blockquote><p>${renderInline(quote.join("<br />"), context)}</p></blockquote>`);
      }
      continue;
    }

    if (line.includes("|") && isTableDelimiter(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      html.push(
        `<div class="table-scroll"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell, context)}</th>`).join("")}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] ?? "", context)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const kind = unordered ? "ul" : "ol";
      const items = [];
      const matcher = unordered ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      while (index < lines.length) {
        const match = lines[index].match(matcher);
        if (!match) break;
        const task = match[1].match(/^\[([ xX])\]\s+(.+)$/);
        if (task) {
          const checked = task[1].toLowerCase() === "x" ? " checked" : "";
          items.push(`<li class="task-item"><input type="checkbox"${checked} disabled /> <span>${renderInline(task[2], context)}</span></li>`);
        } else {
          items.push(`<li>${renderInline(match[1], context)}</li>`);
        }
        index += 1;
      }
      html.push(`<${kind}>${items.join("")}</${kind}>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "), context)}</p>`);
  }

  return { html: html.join("\n"), toc };
}

function renderJsonValue(value, key = null, depth = 0) {
  const keyHtml = key === null ? "" : `<span class="json-key">${escapeHtml(key)}</span>`;
  if (Array.isArray(value)) {
    return `<li class="json-node" data-depth="${depth}">${keyHtml}<ol>${value
      .map((item, index) => renderJsonValue(item, String(index), depth + 1))
      .join("")}</ol></li>`;
  }
  if (value && typeof value === "object") {
    return `<li class="json-node" data-depth="${depth}">${keyHtml}<ul>${Object.entries(value)
      .map(([childKey, item]) => renderJsonValue(item, childKey, depth + 1))
      .join("")}</ul></li>`;
  }
  return `<li class="json-leaf" data-depth="${depth}">${keyHtml}${key === null ? "" : '<span aria-hidden="true">: </span>'}<code>${escapeHtml(JSON.stringify(value))}</code></li>`;
}

export function renderJson(source, context) {
  const parsed = JSON.parse(source);
  const topLevelEntries = Object.entries(parsed);
  const sections = topLevelEntries.map(([key, value]) => {
    const id = `${context.key}-${slugify(key)}`;
    return {
      id,
      text: key,
      html: `<section class="json-section" aria-labelledby="${id}"><h2 id="${id}">${escapeHtml(key)}</h2><ul class="json-tree">${renderJsonValue(value, null, 0)}</ul></section>`,
    };
  });
  return {
    html: `${sections.map((section) => section.html).join("\n")}\n<details class="json-raw"><summary>查看格式化 JSON 原文</summary><pre><code class="language-json">${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre></details>`,
    toc: sections.map(({ id, text }) => ({ level: 2, id, text })),
  };
}

function renderToc(toc) {
  if (!toc.length) return '<p class="evidence-toc-empty">本文没有章节目录。</p>';
  return `<ol>${toc
    .map(
      ({ level, id, text }) =>
        `<li data-level="${level}"><a href="#${escapeHtml(id)}">${escapeHtml(text)}</a></li>`,
    )
    .join("")}</ol>`;
}

function normalizeSearchText(source) {
  return source
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, ""))
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_>#|\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function buildEvidenceRegion(projectRoot) {
  const documents = [];
  for (const config of EVIDENCE_DOCUMENTS) {
    const absoluteSource = path.join(projectRoot, config.source);
    const source = await readFile(absoluteSource, "utf8");
    const sha256 = createHash("sha256").update(source).digest("hex");
    const rendered = config.source.endsWith(".json")
      ? renderJson(source, config)
      : renderMarkdown(source, config);
    documents.push({
      ...config,
      sha256,
      html: rendered.html,
      toc: rendered.toc,
      searchText: normalizeSearchText(source),
    });
  }

  const html = documents
    .map(
      (document) => `    <template id="evidence-document-${document.key}">
      <section class="embedded-evidence" data-evidence-key="${document.key}" data-source="${escapeHtml(document.source)}" data-sha256="${document.sha256}" data-title="${escapeHtml(document.title)}" data-kicker="${escapeHtml(document.kicker)}">
        <p class="evidence-document-summary">${escapeHtml(document.summary)}</p>
        <nav class="evidence-document-toc" aria-label="${escapeHtml(document.title)}目录">${renderToc(document.toc)}</nav>
        <article class="evidence-document-content">${document.html}</article>
      </section>
    </template>`,
    )
    .join("\n");

  return { html, documents };
}

export function replaceGeneratedRegion(page, generatedRegion) {
  const start = page.indexOf(START_MARKER);
  const end = page.indexOf(END_MARKER);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Generated evidence markers are missing or malformed");
  }
  const contentStart = start + START_MARKER.length;
  return `${page.slice(0, contentStart)}\n${generatedRegion.trimEnd()}\n${page.slice(end)}`;
}

export async function synchronizeEvidencePage({ pagePath, generatedRegion, check }) {
  const current = await readFile(pagePath, "utf8");
  const next = replaceGeneratedRegion(current, generatedRegion);
  const changed = current !== next;
  if (changed && !check) await writeFile(pagePath, next);
  return { changed };
}

async function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const pagePath = path.join(projectRoot, "vibe-coding-case-study.html");
  const check = process.argv.includes("--check");
  const result = await buildEvidenceRegion(projectRoot);
  const synchronization = await synchronizeEvidencePage({ pagePath, generatedRegion: result.html, check });
  if (check && synchronization.changed) {
    console.error("Evidence documents are stale. Run: pnpm build:case-study-evidence");
    process.exitCode = 1;
    return;
  }
  console.log(
    check
      ? `Evidence documents are synchronized (${result.documents.length}/6).`
      : `Embedded ${result.documents.length} complete evidence documents into ${path.basename(pagePath)}.`,
  );
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  await main();
}
