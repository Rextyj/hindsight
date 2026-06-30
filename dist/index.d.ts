import { Plugin } from '@opencode-ai/plugin';

interface HindsightConfig {
    autoRecall: boolean;
    recallBudget: string;
    recallMaxTokens: number;
    recallTypes: string[];
    recallContextTurns: number;
    recallMaxQueryChars: number;
    recallPromptPreamble: string;
    recallTags: string[];
    recallTagsMatch: "any" | "all" | "any_strict" | "all_strict";
    autoRetain: boolean;
    retainMode: string;
    retainEveryNTurns: number;
    retainOverlapTurns: number;
    retainContext: string;
    retainTags: string[];
    retainMetadata: Record<string, string>;
    hindsightApiUrl: string | null;
    hindsightApiToken: string | null;
    bankId: string | null;
    bankIdPrefix: string;
    dynamicBankId: boolean;
    dynamicBankGranularity: string[];
    bankMission: string;
    retainMission: string | null;
    agentName: string;
    debug: boolean;
}

/**
 * Hook implementations for the Hindsight OpenCode plugin.
 *
 * Hooks:
 *   - experimental.chat.system.transform → recall memories once per session and
 *     inject them into the system prompt (order-independent; see #1758)
 *   - event (session.idle) → auto-retain conversation transcript
 *   - experimental.session.compacting → inject memories into compaction context
 */

interface PluginState {
    turnCount: number;
    missionsSet: Set<string>;
    /** Track sessions we've already injected recall into */
    recalledSessions: Set<string>;
    /** Track last retained turn count per session to avoid duplicates */
    lastRetainedTurn: Map<string, number>;
}

/**
 * Hindsight OpenCode Plugin — persistent long-term memory for OpenCode agents.
 *
 * Provides:
 *   - Custom tools: hindsight_retain, hindsight_recall, hindsight_reflect
 *   - Auto-retain on session.idle
 *   - Memory injection on session.created via system transform
 *   - Memory preservation during context compaction
 *
 * @example
 * ```json
 * // opencode.json
 * { "plugin": ["@vectorize-io/opencode-hindsight"] }
 *
 * // With options:
 * { "plugin": [["@vectorize-io/opencode-hindsight", { "bankId": "my-bank" }]] }
 * ```
 */

declare const HindsightPlugin: Plugin;

export { type HindsightConfig, HindsightPlugin, type PluginState, HindsightPlugin as default };
