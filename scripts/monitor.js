require("dotenv").config();

const BASE_URL = "https://jsonplaceholder.typicode.com/posts";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;


function log(level, message, data = null) {
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });
  const prefix = { info: "🔹", success: "✅", error: "❌", warn: "⚠️" }[level] || "•";

  if (data) {
    console.log(`[${timestamp} NPT] ${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp} NPT] ${prefix} ${message}`);
  }
}


async function sendSlackAlert({ endpoint, error, responseTime, attemptCount }) {
  if (!SLACK_WEBHOOK_URL) {
    log("warn", "SLACK_WEBHOOK_URL not set — skipping Slack alert");
    return;
  }

  const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });

  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚨 Production is Down", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Endpoint:* \`${endpoint}\`\n*Error:* \`${error}\`\n*Response Time:* \`${responseTime || "N/A"}ms\`\n*Attempt:* ${attemptCount}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `🕐 Time (NPT): ${timestamp}` },
          { type: "mrkdwn", text: `👤 Monitored by: API Reliability Monitor` },
        ],
      },
    ],
  };

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) log("success", "Slack alert sent");
    else log("warn", `Slack alert failed with status ${res.status}`);
  } catch (err) {
    log("warn", `Slack alert error: ${err.message}`);
  }
}

async function checkEndpoint(endpoint, responseTimes) {
  log("info", `Checking ${endpoint}...`);
  const start = Date.now();

  const res = await fetch(`${BASE_URL}${endpoint}`);
  const duration = Date.now() - start;
  responseTimes[endpoint] = duration;

  if (!res.ok) throw new Error(`${endpoint} failed with status ${res.status}`);

  const data = await res.json();
  if (!data) throw new Error(`${endpoint} returned empty data`);

  log("success", `${endpoint} OK (${duration}ms)`);
}


async function runCheck() {
  const responseTimes = {};
  const endpoints = ["/posts", "/users"]; 

  for (const endpoint of endpoints) {
    await checkEndpoint(endpoint, responseTimes);
  }

  return responseTimes;
}

async function monitor() {
  log("info", "Starting API Reliability Monitor...");

  let attempt = 1;
  let responseTimes = {};

  try {
    responseTimes = await runCheck();
    log("success", "System healthy ✓", responseTimes);
  } catch (err) {
    log("warn", `Attempt ${attempt} failed: ${err.message}`);
    attempt++;

    await new Promise((r) => setTimeout(r, 5000)); 

    try {
      responseTimes = await runCheck();
      log("success", `Recovered on retry ✓`, responseTimes);
    } catch (err2) {
      log("error", `System FAILED after 2 attempts: ${err2.message}`);

      await sendSlackAlert({
        endpoint: err2.message.split(" ")[0],
        error: err2.message,
        responseTime: null,
        attemptCount: attempt,
      });

      process.exit(1);
    }
  }
}
monitor();