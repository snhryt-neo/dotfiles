export const MCP_NAME = "xai-x-search";
export const MCP_VERSION = "0.1.0";

export const XAI_MODEL = "grok-4.3";
export const XAI_RESPONSES_URL =
  "https://gateway.ai.cloudflare.com/v1/3a98b9299f91095ca897a22cc740c54b/xai-search-mcp/grok/v1/responses";
export const XAI_REASONING_EFFORT = "none";
export const XAI_MAX_TOOL_CALLS = 1;
export const XAI_MAX_OUTPUT_TOKENS = 1_200;
export const XAI_REQUEST_TIMEOUT_MS = 75_000;

export const MAX_QUERY_LENGTH = 2_000;
export const MAX_HANDLES = 20;
export const MAX_DATE_RANGE_DAYS = 366;
export const MAX_RESULT_CHARACTERS = 20_000;
export const MAX_CITATIONS = 50;

export const PER_MINUTE_LIMIT = 5;
export const PER_DAY_LIMIT = 30;

export const OAUTH_SCOPE = "x-search";
export const OAUTH_STATE_TTL_SECONDS = 600;
