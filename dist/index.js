// src/index.ts
import { HindsightClient } from "@vectorize-io/hindsight-client";

// src/config.ts
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var DEFAULT_HINDSIGHT_API_URL = "https://api.hindsight.vectorize.io";
var DEFAULTS = {
  // Recall
  autoRecall: true,
  recallBudget: "mid",
  recallMaxTokens: 1024,
  recallTypes: ["world", "experience"],
  recallContextTurns: 1,
  recallMaxQueryChars: 800,
  recallTags: [],
  recallTagsMatch: "any",
  recallPromptPreamble: "Relevant memories from past conversations (prioritize recent when conflicting). Only use memories that are directly useful to continue this conversation; ignore the rest:",
  // Retain
  autoRetain: true,
  retainMode: "full-session",
  retainEveryNTurns: 3,
  retainOverlapTurns: 2,
  retainContext: "opencode",
  retainTags: [],
  retainMetadata: {},
  // Connection
  hindsightApiUrl: DEFAULT_HINDSIGHT_API_URL,
  hindsightApiToken: null,
  // Bank
  bankId: null,
  bankIdPrefix: "",
  dynamicBankId: false,
  dynamicBankGranularity: ["agent", "project"],
  bankMission: "",
  retainMission: null,
  agentName: "opencode",
  // Misc
  debug: false
};
var ENV_OVERRIDES = {
  HINDSIGHT_API_URL: ["hindsightApiUrl", "string"],
  HINDSIGHT_API_TOKEN: ["hindsightApiToken", "string"],
  HINDSIGHT_BANK_ID: ["bankId", "string"],
  HINDSIGHT_AGENT_NAME: ["agentName", "string"],
  HINDSIGHT_AUTO_RECALL: ["autoRecall", "bool"],
  HINDSIGHT_AUTO_RETAIN: ["autoRetain", "bool"],
  HINDSIGHT_RETAIN_MODE: ["retainMode", "string"],
  HINDSIGHT_RECALL_BUDGET: ["recallBudget", "string"],
  HINDSIGHT_RECALL_MAX_TOKENS: ["recallMaxTokens", "int"],
  HINDSIGHT_RECALL_MAX_QUERY_CHARS: ["recallMaxQueryChars", "int"],
  HINDSIGHT_RECALL_CONTEXT_TURNS: ["recallContextTurns", "int"],
  HINDSIGHT_DYNAMIC_BANK_ID: ["dynamicBankId", "bool"],
  HINDSIGHT_BANK_MISSION: ["bankMission", "string"],
  HINDSIGHT_BANK_ID_PREFIX: ["bankIdPrefix", "string"],
  HINDSIGHT_RETAIN_EVERY_N_TURNS: ["retainEveryNTurns", "int"],
  HINDSIGHT_RETAIN_OVERLAP_TURNS: ["retainOverlapTurns", "int"],
  HINDSIGHT_RECALL_TAGS: ["recallTags", "string"],
  HINDSIGHT_RETAIN_TAGS: ["retainTags", "string"],
  HINDSIGHT_RECALL_TAGS_MATCH: ["recallTagsMatch", "string"],
  HINDSIGHT_RECALL_PROMPT_PREAMBLE: ["recallPromptPreamble", "string"],
  HINDSIGHT_RETAIN_CONTEXT: ["retainContext", "string"]
  // NOTE: `debug` is intentionally NOT an env override. It is a proper config
  // option set via opencode.json plugin options or ~/.hindsight/opencode.json,
  // because env vars are unreliable to set for OpenCode's plugin runtime
  // (notably on Windows).
};
function castEnv(value, typ) {
  if (typ === "bool") return ["true", "1", "yes"].includes(value.toLowerCase());
  if (typ === "int") {
    const n = parseInt(value, 10);
    return isNaN(n) ? null : n;
  }
  return value;
}
function loadSettingsFile(path) {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function loadConfig(pluginOptions) {
  const config = { ...DEFAULTS };
  const userConfigPath = join(homedir(), ".hindsight", "opencode.json");
  const fileConfig = loadSettingsFile(userConfigPath);
  for (const [key, value] of Object.entries(fileConfig)) {
    if (value !== null && value !== void 0) {
      config[key] = value;
    }
  }
  if (pluginOptions) {
    for (const [key, value] of Object.entries(pluginOptions)) {
      if (value !== null && value !== void 0) {
        config[key] = value;
      }
    }
  }
  for (const [envName, [key, typ]] of Object.entries(ENV_OVERRIDES)) {
    const val = process.env[envName];
    if (val !== void 0) {
      const castVal = castEnv(val, typ);
      if (castVal !== null) {
        config[key] = castVal;
      }
    }
  }
  const recallTagsEnv = process.env["HINDSIGHT_RECALL_TAGS"];
  if (recallTagsEnv !== void 0) {
    config["recallTags"] = recallTagsEnv.split(",").map((t) => t.trim()).filter(Boolean);
  }
  const recallTagsMatchEnv = process.env["HINDSIGHT_RECALL_TAGS_MATCH"];
  if (recallTagsMatchEnv !== void 0) {
    config["recallTagsMatch"] = recallTagsMatchEnv;
  }
  const retainTagsEnv = process.env["HINDSIGHT_RETAIN_TAGS"];
  if (retainTagsEnv !== void 0) {
    config["retainTags"] = retainTagsEnv.split(",").map((t) => t.trim()).filter(Boolean);
  }
  const result = config;
  const VALID_RETAIN_MODES = ["full-session", "last-turn"];
  if (!VALID_RETAIN_MODES.includes(result.retainMode)) {
    console.error(
      `[Hindsight] Unknown retainMode "${result.retainMode}" \u2014 valid: ${VALID_RETAIN_MODES.join(", ")}. Falling back to "full-session".`
    );
    result.retainMode = "full-session";
  }
  const VALID_TAGS_MATCH = ["any", "all", "any_strict", "all_strict"];
  if (!VALID_TAGS_MATCH.includes(result.recallTagsMatch)) {
    console.error(
      `[Hindsight] Unknown recallTagsMatch "${result.recallTagsMatch}" \u2014 valid: ${VALID_TAGS_MATCH.join(", ")}. Falling back to "any".`
    );
    result.recallTagsMatch = "any";
  }
  const VALID_BUDGETS = ["low", "mid", "high"];
  if (!VALID_BUDGETS.includes(result.recallBudget)) {
    console.error(
      `[Hindsight] Unknown recallBudget "${result.recallBudget}" \u2014 valid: ${VALID_BUDGETS.join(", ")}. Falling back to "mid".`
    );
    result.recallBudget = "mid";
  }
  return result;
}
function liveConfig(base) {
  const out = { ...base };
  for (const [envName, [key, typ]] of Object.entries(ENV_OVERRIDES)) {
    const v = process.env[envName];
    if (v !== void 0) {
      const cv = castEnv(v, typ);
      if (cv !== null) {
        out[key] = cv;
      }
    }
  }
  const recallTagsEnv = process.env["HINDSIGHT_RECALL_TAGS"];
  if (recallTagsEnv !== void 0) {
    out.recallTags = recallTagsEnv.split(",").map((t) => t.trim()).filter(Boolean);
  }
  const recallTagsMatchEnv = process.env["HINDSIGHT_RECALL_TAGS_MATCH"];
  if (recallTagsMatchEnv !== void 0) {
    out.recallTagsMatch = recallTagsMatchEnv;
  }
  const retainTagsEnv = process.env["HINDSIGHT_RETAIN_TAGS"];
  if (retainTagsEnv !== void 0) {
    out.retainTags = retainTagsEnv.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return out;
}

// src/bank.ts
import { basename, dirname } from "path";
import { execFileSync } from "child_process";

// src/logger.ts
var SERVICE = "hindsight";
var Logger = class {
  client;
  debugEnabled;
  silent;
  constructor(options = {}) {
    this.client = options.client;
    this.debugEnabled = options.debug ?? false;
    this.silent = options.silent ?? false;
  }
  emit(level, message, extra) {
    if (this.silent) return;
    const app = this.client?.app;
    if (app && typeof app.log === "function") {
      try {
        const result = app.log({ body: { service: SERVICE, level, message, extra } });
        if (result && typeof result.then === "function") {
          result.then(void 0, () => {
          });
        }
        return;
      } catch {
      }
    }
    const line = extra ? `[Hindsight] ${message} ${JSON.stringify(extra)}` : `[Hindsight] ${message}`;
    console.error(line);
  }
  error(message, error) {
    this.emit("error", message, error === void 0 ? void 0 : { error: errorToString(error) });
  }
  warn(message, extra) {
    this.emit("warn", message, extra);
  }
  info(message, extra) {
    this.emit("info", message, extra);
  }
  debug(message, extra) {
    if (this.debugEnabled) this.emit("debug", message, extra);
  }
};
function errorToString(error) {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  return String(error);
}

// src/bank.ts
var DEFAULT_BANK_NAME = "opencode";
var VALID_FIELDS = /* @__PURE__ */ new Set(["agent", "project", "gitProject", "channel", "user"]);
function getProjectRootFromGit(directory) {
  if (!directory) return null;
  try {
    const commonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: directory,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1e3
      }
    ).trim();
    if (!commonDir) return null;
    if (basename(commonDir) === ".git") {
      return dirname(commonDir);
    }
    return commonDir;
  } catch {
    return null;
  }
}
function deriveGitProjectName(directory) {
  const projectRoot = getProjectRootFromGit(directory);
  if (projectRoot) return basename(projectRoot);
  return directory ? basename(directory) : "unknown";
}
function deriveBankId(config, directory) {
  const prefix = config.bankIdPrefix;
  if (!config.dynamicBankId) {
    const base = config.bankId || DEFAULT_BANK_NAME;
    return prefix ? `${prefix}-${base}` : base;
  }
  const fields = config.dynamicBankGranularity?.length ? config.dynamicBankGranularity : ["agent", "project"];
  for (const f of fields) {
    if (!VALID_FIELDS.has(f)) {
      console.error(
        `[Hindsight] Unknown dynamicBankGranularity field "${f}" \u2014 valid: ${[...VALID_FIELDS].sort().join(", ")}`
      );
    }
  }
  const channelId = process.env.HINDSIGHT_CHANNEL_ID || "";
  const userId = process.env.HINDSIGHT_USER_ID || "";
  const fieldResolvers = {
    agent: () => config.agentName || "opencode",
    project: () => directory ? basename(directory) : "unknown",
    gitProject: () => deriveGitProjectName(directory),
    channel: () => channelId || "default",
    user: () => userId || "anonymous"
  };
  const segments = fields.map((f) => fieldResolvers[f]?.() || "unknown");
  const baseBankId = segments.join("::");
  return prefix ? `${prefix}-${baseBankId}` : baseBankId;
}
async function ensureBankMission(client, bankId, config, missionsSet, logger = new Logger({ silent: true })) {
  const mission = config.bankMission;
  if (!mission?.trim()) return;
  if (missionsSet.has(bankId)) return;
  try {
    await client.createBank(bankId, {
      reflectMission: mission,
      retainMission: config.retainMission || void 0
    });
    missionsSet.add(bankId);
    if (missionsSet.size > 1e4) {
      const keys = [...missionsSet].sort();
      for (const k of keys.slice(0, keys.length >> 1)) {
        missionsSet.delete(k);
      }
    }
    logger.debug(`Set mission for bank: ${bankId}`);
  } catch (e) {
    logger.debug(`Could not set bank mission for ${bankId}`, { error: String(e) });
  }
}

// src/tools.ts
import { tool } from "@opencode-ai/plugin/tool";

// src/content.ts
function stripMemoryTags(content) {
  content = content.replace(/<hindsight_memories>[\s\S]*?<\/hindsight_memories>/g, "");
  content = content.replace(/<relevant_memories>[\s\S]*?<\/relevant_memories>/g, "");
  return content;
}
function formatMemories(results) {
  if (!results.length) return "";
  return results.map((r) => {
    const typeStr = r.type ? ` [${r.type}]` : "";
    const dateStr = r.mentioned_at ? ` (${r.mentioned_at})` : "";
    return `- ${r.text}${typeStr}${dateStr}`;
  }).join("\n\n");
}
function formatCurrentTime() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}
function composeRecallQuery(latestQuery, messages, recallContextTurns) {
  const latest = latestQuery.trim();
  if (recallContextTurns <= 1 || !messages.length) return latest;
  const contextual = sliceLastTurnsByUserBoundary(messages, recallContextTurns);
  const contextLines = [];
  for (const msg of contextual) {
    const content = stripMemoryTags(msg.content).trim();
    if (!content) continue;
    if (msg.role === "user" && content === latest) continue;
    contextLines.push(`${msg.role}: ${content}`);
  }
  if (!contextLines.length) return latest;
  return ["Prior context:", contextLines.join("\n"), latest].join("\n\n");
}
function truncateRecallQuery(query, latestQuery, maxChars) {
  if (maxChars <= 0 || query.length <= maxChars) return query;
  const latest = latestQuery.trim();
  const latestOnly = latest.length > maxChars ? latest.slice(0, maxChars) : latest;
  if (!query.includes("Prior context:")) return latestOnly;
  const contextMarker = "Prior context:\n\n";
  const markerIndex = query.indexOf(contextMarker);
  if (markerIndex === -1) return latestOnly;
  const suffix = "\n\n" + latest;
  const suffixIndex = query.lastIndexOf(suffix);
  if (suffixIndex === -1) return latestOnly;
  if (suffix.length >= maxChars) return latestOnly;
  const contextBody = query.slice(markerIndex + contextMarker.length, suffixIndex);
  const contextLines = contextBody.split("\n").filter(Boolean);
  const kept = [];
  for (let i = contextLines.length - 1; i >= 0; i--) {
    kept.unshift(contextLines[i]);
    const candidate = `${contextMarker}${kept.join("\n")}${suffix}`;
    if (candidate.length > maxChars) {
      kept.shift();
      break;
    }
  }
  if (kept.length) return `${contextMarker}${kept.join("\n")}${suffix}`;
  return latestOnly;
}
function sliceLastTurnsByUserBoundary(messages, turns) {
  if (!messages.length || turns <= 0) return [];
  let userTurnsSeen = 0;
  let startIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userTurnsSeen++;
      if (userTurnsSeen >= turns) {
        startIndex = i;
        break;
      }
    }
  }
  return startIndex === -1 ? [...messages] : messages.slice(startIndex);
}
function prepareRetentionTranscript(messages, retainFullWindow = false) {
  if (!messages.length) return { transcript: null, messageCount: 0 };
  let targetMessages;
  if (retainFullWindow) {
    targetMessages = messages;
  } else {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return { transcript: null, messageCount: 0 };
    targetMessages = messages.slice(lastUserIdx);
  }
  const parts = [];
  for (const msg of targetMessages) {
    const content = stripMemoryTags(msg.content).trim();
    if (!content) continue;
    parts.push(`[role: ${msg.role}]
${content}
[${msg.role}:end]`);
  }
  if (!parts.length) return { transcript: null, messageCount: 0 };
  const transcript = parts.join("\n\n");
  if (transcript.trim().length < 10) return { transcript: null, messageCount: 0 };
  return { transcript, messageCount: parts.length };
}

// src/tools.ts
function createTools(client, bankId, config, missionsSet, logger = new Logger({ silent: true })) {
  const hindsight_retain = tool({
    description: "Store information in long-term memory. Use this to remember important facts, user preferences, project context, decisions, and anything worth recalling in future sessions. Be specific \u2014 include who, what, when, and why.",
    args: {
      content: tool.schema.string().describe("The information to remember. Be specific and self-contained."),
      context: tool.schema.string().optional().describe("Optional context about where this information came from."),
      tags: tool.schema.array(tool.schema.string()).optional().describe(
        "Tags to attach to this memory. Overrides config retainTags for this call. Use ['scope:user'] for cross-project user-level memories, ['project:<name>'] for project-scoped memories."
      )
    },
    async execute(args) {
      const cfg = liveConfig(config);
      if (missionsSet) {
        await ensureBankMission(client, bankId, cfg, missionsSet, logger);
      }
      await client.retain(bankId, args.content, {
        context: args.context || cfg.retainContext,
        tags: args.tags !== void 0 ? args.tags : cfg.retainTags.length ? cfg.retainTags : void 0,
        metadata: Object.keys(cfg.retainMetadata).length ? cfg.retainMetadata : void 0
      });
      return "Memory stored successfully.";
    }
  });
  const hindsight_recall = tool({
    description: "Search long-term memory for relevant information. Use this proactively before answering questions about past conversations, user preferences, project history, or any topic where prior context would help. When in doubt, recall first.",
    args: {
      query: tool.schema.string().describe("Natural language search query. Be specific about what you need to know."),
      tags: tool.schema.array(tool.schema.string()).optional().describe(
        "Tags to filter by. Overrides config recallTags for this call. Use ['scope:user'] for user-level memories, ['project:<name>'] for project-scoped."
      ),
      tagsMatch: tool.schema.string().optional().describe(
        "Tag match mode: 'any', 'all', 'any_strict', 'all_strict'. Defaults to 'any_strict' when tags arg is provided. Ignored if tags arg is omitted."
      )
    },
    async execute(args) {
      const cfg = liveConfig(config);
      const recallTags = args.tags !== void 0 ? args.tags : cfg.recallTags.length ? cfg.recallTags : [];
      const recallTagsMatch = args.tags !== void 0 ? args.tagsMatch || "any_strict" : cfg.recallTags.length ? cfg.recallTagsMatch : void 0;
      const response = await client.recall(bankId, args.query, {
        budget: cfg.recallBudget,
        maxTokens: cfg.recallMaxTokens,
        types: cfg.recallTypes,
        tags: recallTags.length ? recallTags : void 0,
        tagsMatch: recallTagsMatch
      });
      const results = response.results || [];
      if (!results.length) return "No relevant memories found.";
      const formatted = formatMemories(results);
      return `Found ${results.length} relevant memories (as of ${formatCurrentTime()} UTC):

${formatted}`;
    }
  });
  const hindsight_reflect = tool({
    description: 'Generate a thoughtful answer using long-term memory. Unlike recall (which returns raw memories), reflect synthesizes memories into a coherent answer. Use for questions like "What do you know about this user?" or "Summarize our project decisions."',
    args: {
      query: tool.schema.string().describe("The question to answer using long-term memory."),
      context: tool.schema.string().optional().describe("Optional additional context to guide the reflection."),
      tags: tool.schema.array(tool.schema.string()).optional().describe(
        "Tags to filter by. Overrides config recallTags for this call. Use ['scope:user'] for user-level memories, ['project:<name>'] for project-scoped."
      ),
      tagsMatch: tool.schema.string().optional().describe(
        "Tag match mode: 'any', 'all', 'any_strict', 'all_strict'. Defaults to 'any_strict' when tags arg is provided. Ignored if tags arg is omitted."
      )
    },
    async execute(args) {
      const cfg = liveConfig(config);
      if (missionsSet) {
        await ensureBankMission(client, bankId, cfg, missionsSet, logger);
      }
      const reflectTags = args.tags !== void 0 ? args.tags : cfg.recallTags.length ? cfg.recallTags : [];
      const reflectTagsMatch = args.tags !== void 0 ? args.tagsMatch || "any_strict" : cfg.recallTags.length ? cfg.recallTagsMatch : void 0;
      const response = await client.reflect(bankId, args.query, {
        context: args.context,
        budget: cfg.recallBudget,
        tags: reflectTags.length ? reflectTags : void 0,
        tagsMatch: reflectTagsMatch
      });
      return response.text || "No relevant information found to reflect on.";
    }
  });
  return { hindsight_retain, hindsight_recall, hindsight_reflect };
}

// src/hooks.ts
function createHooks(hindsightClient, bankId, config, state2, opencodeClient, logger = new Logger({ silent: true })) {
  async function recallForContext(query) {
    try {
      const cfg = liveConfig(config);
      const response = await hindsightClient.recall(bankId, query, {
        budget: cfg.recallBudget,
        maxTokens: cfg.recallMaxTokens,
        types: cfg.recallTypes,
        tags: cfg.recallTags.length ? cfg.recallTags : void 0,
        tagsMatch: cfg.recallTags.length ? cfg.recallTagsMatch : void 0
      });
      const results = response.results || [];
      if (!results.length) return { context: null, ok: true };
      const formatted = formatMemories(results);
      const context = `<hindsight_memories>
${cfg.recallPromptPreamble}
Current time: ${formatCurrentTime()} UTC

${formatted}
</hindsight_memories>`;
      return { context, ok: true };
    } catch (e) {
      logger.error("Recall failed", e);
      return { context: null, ok: false };
    }
  }
  async function getSessionMessages(sessionId) {
    try {
      logger.debug(`getSessionMessages: fetching messages for session ${sessionId}`);
      const response = await opencodeClient.session.messages({
        path: { id: sessionId }
      });
      if (response.error) {
        logger.warn("getSessionMessages: OpenCode returned an error", {
          error: JSON.stringify(response.error)?.substring(0, 500)
        });
      }
      const rawMessages = response.data || [];
      const messages = [];
      for (const msg of rawMessages) {
        const role = msg.info.role;
        if (role !== "user" && role !== "assistant") continue;
        const textParts = msg.parts.filter((p) => p.type === "text" && p.text).map((p) => p.text);
        if (textParts.length) {
          messages.push({ role, content: textParts.join("\n") });
        }
      }
      logger.debug(`getSessionMessages: raw=${rawMessages.length}, parsed=${messages.length}`);
      return messages;
    } catch (e) {
      logger.error("Failed to get session messages", e);
      return [];
    }
  }
  async function retainSession(sessionId, messages) {
    const retainFullWindow = config.retainMode === "full-session";
    let targetMessages;
    let documentId;
    if (retainFullWindow) {
      targetMessages = messages;
      documentId = sessionId;
    } else {
      const windowTurns = config.retainEveryNTurns + config.retainOverlapTurns;
      targetMessages = sliceLastTurnsByUserBoundary(messages, windowTurns);
      documentId = `${sessionId}-${Date.now()}`;
    }
    const { transcript } = prepareRetentionTranscript(targetMessages, true);
    if (!transcript) return;
    const cfg = liveConfig(config);
    await ensureBankMission(hindsightClient, bankId, cfg, state2.missionsSet, logger);
    await hindsightClient.retain(bankId, transcript, {
      documentId,
      context: cfg.retainContext,
      tags: cfg.retainTags.length ? cfg.retainTags : void 0,
      metadata: Object.keys(cfg.retainMetadata).length ? { ...cfg.retainMetadata, session_id: sessionId } : { session_id: sessionId },
      async: true
    });
  }
  async function handleSessionIdle(sessionId) {
    logger.debug(`handleSessionIdle called for session ${sessionId}`);
    if (!config.autoRetain) return;
    const messages = await getSessionMessages(sessionId);
    if (!messages.length) return;
    const userTurns = messages.filter((m) => m.role === "user").length;
    const lastRetained = state2.lastRetainedTurn.get(sessionId) || 0;
    logger.debug(
      `handleSessionIdle: userTurns=${userTurns}, lastRetained=${lastRetained}, retainEveryNTurns=${config.retainEveryNTurns}`
    );
    if (userTurns - lastRetained < config.retainEveryNTurns) return;
    try {
      await retainSession(sessionId, messages);
      state2.lastRetainedTurn.set(sessionId, userTurns);
      logger.info(`Auto-retained ${messages.length} messages`, {
        session: sessionId,
        bank: bankId
      });
    } catch (e) {
      logger.error("Auto-retain failed", e);
    }
  }
  const event = async (input) => {
    try {
      const { event: evt } = input;
      logger.debug(`event hook fired: type=${evt.type}`);
      if (evt.type === "session.idle") {
        const sessionId = evt.properties.sessionID;
        if (sessionId) {
          await handleSessionIdle(sessionId);
        }
      }
    } catch (e) {
      logger.error("Event hook error", e);
    }
  };
  const compacting = async (input, output) => {
    try {
      const messages = await getSessionMessages(input.sessionID);
      if (messages.length && config.autoRetain) {
        try {
          await retainSession(input.sessionID, messages);
          state2.lastRetainedTurn.delete(input.sessionID);
          logger.debug("Pre-compaction retain completed");
        } catch (e) {
          logger.error("Pre-compaction retain failed", e);
        }
      }
      if (messages.length) {
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        if (lastUserMsg) {
          const query = composeRecallQuery(
            lastUserMsg.content,
            messages,
            config.recallContextTurns
          );
          const truncated = truncateRecallQuery(
            query,
            lastUserMsg.content,
            config.recallMaxQueryChars
          );
          const { context } = await recallForContext(truncated);
          if (context) {
            output.context.push(context);
          }
        }
      }
    } catch (e) {
      logger.error("Compaction hook error", e);
    }
  };
  const systemTransform = async (input, output) => {
    try {
      if (!config.autoRecall) return;
      const sessionId = input.sessionID;
      if (!sessionId) return;
      if (state2.recalledSessions.has(sessionId)) return;
      await ensureBankMission(hindsightClient, bankId, config, state2.missionsSet, logger);
      const query = `project context and recent work`;
      const { context, ok } = await recallForContext(query);
      if (ok) {
        state2.recalledSessions.add(sessionId);
        if (state2.recalledSessions.size > 1e3) {
          const first = state2.recalledSessions.values().next().value;
          if (first) state2.recalledSessions.delete(first);
        }
      }
      if (context) {
        output.system[0] = output.system[0] ? `${output.system[0]}

${context}` : context;
        logger.debug(`Injected recall context for session ${sessionId}`);
      }
    } catch (e) {
      logger.error("System transform hook error", e);
    }
  };
  return {
    event,
    "experimental.session.compacting": compacting,
    "experimental.chat.system.transform": systemTransform
  };
}

// src/index.ts
var state = {
  turnCount: 0,
  missionsSet: /* @__PURE__ */ new Set(),
  recalledSessions: /* @__PURE__ */ new Set(),
  lastRetainedTurn: /* @__PURE__ */ new Map()
};
var HindsightPlugin = async (input, options) => {
  const config = loadConfig(options);
  const logger = new Logger({
    client: input.client,
    debug: config.debug
  });
  const client = new HindsightClient({
    baseUrl: config.hindsightApiUrl,
    apiKey: config.hindsightApiToken || void 0
  });
  const bankId = deriveBankId(config, input.directory);
  logger.info("Hindsight plugin initialized", {
    api: config.hindsightApiUrl,
    bank: bankId,
    authenticated: Boolean(config.hindsightApiToken),
    autoRecall: config.autoRecall,
    autoRetain: config.autoRetain
  });
  const tools = createTools(client, bankId, config, state.missionsSet, logger);
  const hooks = createHooks(
    client,
    bankId,
    config,
    state,
    input.client,
    logger
  );
  return {
    tool: tools,
    ...hooks
  };
};
var index_default = HindsightPlugin;
export {
  HindsightPlugin,
  index_default as default
};
//# sourceMappingURL=index.js.map