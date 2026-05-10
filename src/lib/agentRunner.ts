import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentJob } from "@/lib/agentJobs";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_CHARS = 4_000;

interface RunnerOutput {
  result: string;
  artifacts: AgentJob["artifacts"];
}

function safeSlice(value: string, maxChars = MAX_OUTPUT_CHARS) {
  const clean = value.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars).trim()}\n\n[...output trimmed...]`;
}

function splitList(values: string[]) {
  return values
    .flatMap((value) => value.split(/[\n,]/))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function extractUrls(prompt: string) {
  return [...prompt.matchAll(/https?:\/\/[^\s<>"')]+/gi)]
    .map((match) => match[0].replace(/[.,;:!?]+$/, ""))
    .slice(0, 5);
}

function hostnameMatches(hostname: string, allowedDomain: string) {
  const cleanHost = hostname.toLowerCase();
  const cleanDomain = allowedDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  return cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`);
}

function assertAllowedUrl(url: string, allowedDomains: string[]) {
  const parsed = new URL(url);
  const allowed = splitList(allowedDomains);
  if (!allowed.length) return;
  if (allowed.some((domain) => hostnameMatches(parsed.hostname, domain))) return;
  throw new Error(`${parsed.hostname} is outside the approved domain scope.`);
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] ? decodeHtml(match[1].replace(/<[^>]*>/g, " ")) : "";
}

function allMatches(html: string, pattern: RegExp, limit: number) {
  return [...html.matchAll(pattern)]
    .map((match) => (match[1] ? decodeHtml(match[1].replace(/<[^>]*>/g, " ")) : ""))
    .filter(Boolean)
    .slice(0, limit);
}

async function fetchPageSummary(url: string, allowedDomains: string[]) {
  assertAllowedUrl(url, allowedDomains);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "UVB-Agent-Runner/0.1 (+local-supervised)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      cache: "no-store",
    });
    const html = await response.text();
    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || response.url;
    const description = firstMatch(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
    const headings = allMatches(html, /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi, 8);
    return {
      label: new URL(response.url).hostname,
      value: safeSlice(
        [
          `${response.status} ${response.statusText} ${response.url}`,
          `Title: ${title}`,
          description ? `Description: ${description}` : "",
          headings.length ? `Headings: ${headings.join(" | ")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runResearchOrBrowserJob(job: AgentJob): Promise<RunnerOutput> {
  const urls = extractUrls(job.prompt);
  if (!urls.length) {
    return {
      result:
        "No URL was found in the job prompt. Add a target URL or route future deep-research jobs through a search provider adapter.",
      artifacts: [
        { label: "Runner", value: "Network/page inspection is live for approved URLs." },
        { label: "Next input needed", value: "Provide one or more http/https URLs in the job prompt." },
      ],
    };
  }

  const artifacts = [];
  for (const url of urls) {
    artifacts.push(await fetchPageSummary(url, job.allowedDomains));
  }

  return {
    result: `Inspected ${artifacts.length} approved page${artifacts.length === 1 ? "" : "s"} and captured title, description, headings, status, and final URL.`,
    artifacts,
  };
}

async function runCommand(command: string, args: string[], cwd: string) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return safeSlice([stdout, stderr].filter(Boolean).join("\n"));
}

async function workspaceExists(workspaceRoot: string) {
  const resolved = path.resolve(workspaceRoot);
  await access(resolved);
  return resolved;
}

async function runCodingJob(job: AgentJob): Promise<RunnerOutput> {
  const workspaceRoot = await workspaceExists(job.workspaceRoot || process.cwd());
  const artifacts: AgentJob["artifacts"] = [
    { label: "Workspace", value: workspaceRoot },
  ];

  try {
    artifacts.push({ label: "Git branch", value: await runCommand("git", ["branch", "--show-current"], workspaceRoot) });
    artifacts.push({ label: "Git status", value: await runCommand("git", ["status", "--short"], workspaceRoot) || "clean" });
    artifacts.push({ label: "Diff stat", value: await runCommand("git", ["diff", "--stat"], workspaceRoot) || "no unstaged diff" });
  } catch (error) {
    artifacts.push({
      label: "Git",
      value: error instanceof Error ? error.message : "Git inspection failed.",
    });
  }

  try {
    const pkg = JSON.parse(await readFile(path.join(workspaceRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = Object.entries(pkg.scripts ?? {})
      .map(([name, script]) => `${name}: ${script}`)
      .join("\n");
    artifacts.push({ label: "Package scripts", value: scripts || "No package scripts found." });
  } catch {
    artifacts.push({ label: "Package scripts", value: "No package.json found at workspace root." });
  }

  return {
    result:
      "Completed a read-only local coding preflight. File edits, terminal commands beyond inspection, git staging, commits, and pushes still require the enabled permissions and a narrower approved job.",
    artifacts,
  };
}

async function runComputerUseJob(): Promise<RunnerOutput> {
  return {
    result:
      "Computer-use jobs are gated until a supervised Windows UI bridge is connected. Browser/research jobs and read-only coding preflights are executable now.",
    artifacts: [
      { label: "Safety gate", value: "OS-level clicks, typing, and file movement remain blocked by default." },
      { label: "Available now", value: "Use Browser Use, Deep Research with URLs, or Local Coding preflight jobs." },
    ],
  };
}

export async function runAgentJob(job: AgentJob): Promise<RunnerOutput> {
  if (job.kind === "deep-research" || job.kind === "browser-use") {
    return runResearchOrBrowserJob(job);
  }
  if (job.kind === "coding") {
    return runCodingJob(job);
  }
  return runComputerUseJob();
}
