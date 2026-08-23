import type { AuthRequest, ClientInfo } from "@cloudflare/workers-oauth-provider";

export function renderConsent(
  client: ClientInfo,
  oauthRequest: AuthRequest,
  flowId: string,
  csrfToken: string,
): string {
  const clientName = escapeHtml(client.clientName ?? "MCP client");
  const clientId = escapeHtml(oauthRequest.clientId);
  const redirectUri = escapeHtml(oauthRequest.redirectUri);
  const scopes = escapeHtml(oauthRequest.scope.join(" ") || "(なし)");
  const commonFields = `
      <input type="hidden" name="flow_id" value="${escapeHtml(flowId)}">
      <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}">`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <meta name="color-scheme" content="light dark">
  <title>MCP接続の承認</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #f5f5f4;
      --card: #ffffff;
      --text: #18181b;
      --muted: #71717a;
      --line: #e4e4e7;
      --soft: #f4f4f5;
      --primary: #18181b;
      --primary-text: #ffffff;
      --danger: #dc2626;
      --shadow: 0 24px 64px rgba(24, 24, 27, .10), 0 2px 8px rgba(24, 24, 27, .05);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      color: var(--text);
      background:
        radial-gradient(circle at 50% 0%, rgba(255, 255, 255, .9), transparent 38%),
        var(--bg);
    }
    main {
      width: min(100%, 480px);
      padding: 36px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: var(--card);
      box-shadow: var(--shadow);
    }
    .mark {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      margin-bottom: 24px;
      border-radius: 14px;
      color: var(--primary-text);
      background: var(--primary);
      font-size: 24px;
      font-weight: 750;
      letter-spacing: -.06em;
    }
    h1 {
      margin: 0;
      font-size: clamp(24px, 5vw, 30px);
      line-height: 1.25;
      letter-spacing: -.035em;
    }
    .lead {
      margin: 12px 0 28px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.7;
    }
    .client { color: var(--text); font-weight: 650; }
    .permission {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 16px;
      margin-bottom: 20px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--soft);
    }
    .permission-icon {
      flex: 0 0 auto;
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      border-radius: 11px;
      background: var(--card);
      font-size: 18px;
    }
    .permission-icon svg { width: 18px; height: 18px; }
    .permission strong, .permission span { display: block; }
    .permission strong { margin-bottom: 3px; font-size: 14px; }
    .permission span { color: var(--muted); font-size: 13px; line-height: 1.45; }
    details { margin-bottom: 24px; color: var(--muted); font-size: 13px; }
    summary { cursor: pointer; user-select: none; }
    dl { margin: 14px 0 0; }
    dt { margin-top: 12px; font-weight: 650; }
    dd { margin: 5px 0 0; }
    code {
      display: block;
      overflow-wrap: anywhere;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
    }
    form { margin: 0; }
    button {
      width: 100%;
      min-height: 48px;
      border-radius: 12px;
      font: inherit;
      font-size: 14px;
      font-weight: 650;
      cursor: pointer;
      transition: transform .12s ease, opacity .12s ease, background .12s ease;
    }
    button:hover { transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    button:focus-visible { outline: 3px solid #60a5fa; outline-offset: 2px; }
    .approve { border: 1px solid var(--primary); color: var(--primary-text); background: var(--primary); }
    .deny { margin-top: 8px; border: 0; color: var(--muted); background: transparent; }
    .deny:hover { color: var(--danger); background: var(--soft); }
    .notice { margin: 18px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; text-align: center; }
    @media (max-width: 520px) {
      body { padding: 0; background: var(--card); }
      main { padding: 28px 22px; border: 0; border-radius: 0; box-shadow: none; }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b;
        --card: #18181b;
        --text: #fafafa;
        --muted: #a1a1aa;
        --line: #3f3f46;
        --soft: #27272a;
        --primary: #fafafa;
        --primary-text: #18181b;
        --danger: #f87171;
        --shadow: 0 24px 64px rgba(0, 0, 0, .35);
      }
      body { background: radial-gradient(circle at 50% 0%, #27272a, transparent 38%), var(--bg); }
    }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">X</div>
    <h1>X検索への接続を承認</h1>
    <p class="lead"><span class="client">${clientName}</span> が、あなたのX検索MCPへのアクセスを求めています。</p>
    <section class="permission" aria-label="要求されている権限">
      <span class="permission-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>
        </svg>
      </span>
      <div>
        <strong>Xの公開情報を検索</strong>
        <span>検索の実行ごとにxAI APIの利用料金が発生します</span>
      </div>
    </section>
    <details>
      <summary>接続の詳細</summary>
      <dl>
        <dt>Client ID</dt><dd><code>${clientId}</code></dd>
        <dt>リダイレクト先</dt><dd><code>${redirectUri}</code></dd>
        <dt>要求scope</dt><dd><code>${scopes}</code></dd>
      </dl>
    </details>
    <form method="post" action="/authorize">${commonFields}
      <input type="hidden" name="decision" value="approve">
      <button class="approve" type="submit">GitHubで本人確認して承認</button>
    </form>
    <form method="post" action="/authorize">${commonFields}
      <input type="hidden" name="decision" value="deny">
      <button class="deny" type="submit">キャンセル</button>
    </form>
    <p class="notice">承認後、GitHubで本人確認を行います。<br>GitHubの権限は要求しません。</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
