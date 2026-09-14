const baseUrl = process.env.CHUNESIDE_SMOKE_BASE_URL ?? "http://localhost:5176";

const mobileHeaders = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "sec-ch-ua-mobile": "?1",
  "viewport-width": "390",
  "width": "390",
};

const checks = [
  {
    path: "/",
    name: "mobile home",
    mustInclude: ["ChuneSide", "Open menu", "now-playing", "Find your next chune", "All regions", "Curated order"],
  },
  {
    path: "/stage",
    name: "mobile Stage",
    mustInclude: ["ChuneSide Stage", "Performance directory"],
    anyInclude: ["stage-filter-bar", "Stage is in Admin Test.", "No Stage performances are public yet."],
  },
  {
    path: "/stage/demo-stage-performance",
    name: "mobile Stage detail fallback",
    mustInclude: ["Back to Stage", "Performance not found"],
  },
  {
    path: "/artists/nia-vale",
    name: "mobile artist profile",
    mustInclude: ["Nia Vale", "soul", "ChuneSide"],
  },
  {
    path: "/auth/sign-in",
    name: "mobile Supabase sign-in fallback",
    mustInclude: ["Welcome back.", "ChuneSide", "Production authentication is not configured yet."],
  },
  {
    path: "/auth/sign-up",
    name: "mobile Supabase sign-up fallback",
    mustInclude: ["Make it count.", "ChuneSide", "Production authentication is not configured yet."],
  },
  {
    path: "/auth/reset-password",
    name: "mobile password recovery fallback",
    mustInclude: ["Reset password.", "Account recovery", "Production authentication is not configured yet."],
  },
  {
    path: "/auth/update-password",
    name: "mobile password update gate",
    expectedRedirectPath: "/auth/sign-in",
  },
  {
    path: "/artist/dashboard",
    name: "mobile artist dashboard gate",
    expectedRedirectPath: "/signin-with-chatgpt",
  },
  {
    path: "/admin/stage",
    name: "mobile Admin Stage gate",
    expectedRedirectPath: "/signin-with-chatgpt",
  },
  {
    path: "/admin/ai-controls",
    name: "mobile Admin AI controls gate",
    expectedRedirectPath: "/signin-with-chatgpt",
  },
  {
    path: "/admin/audit",
    name: "mobile Admin Audit Log gate",
    expectedRedirectPath: "/signin-with-chatgpt",
  },
];

const forbiddenFragments = [
  "Cannot read properties",
  "__nextjs_original-stack-frame",
  "Application error",
  "Internal Server Error",
];

async function main() {
  const summary = [];
  for (const check of checks) {
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: mobileHeaders,
      redirect: "manual",
    });

    if (check.expectedRedirectPath) {
      const location = response.headers.get("location") ?? "";
      assert(
        response.status >= 300 && response.status < 400 && location.includes(check.expectedRedirectPath),
        `${check.name} expected redirect to ${check.expectedRedirectPath}, got ${response.status} ${location}`,
      );
      summary.push(`${check.name} redirect`);
      continue;
    }

    const html = await response.text();
    assert(response.ok, `${check.name} expected 2xx, got ${response.status}: ${html.slice(0, 200)}`);
    for (const fragment of check.mustInclude) {
      assert(html.includes(fragment), `${check.name} did not include "${fragment}".`);
    }
    if (check.anyInclude) {
      assert(
        check.anyInclude.some((fragment) => html.includes(fragment)),
        `${check.name} did not include any expected state: ${check.anyInclude.join(", ")}.`,
      );
    }
    for (const fragment of forbiddenFragments) {
      assert(!html.includes(fragment), `${check.name} included runtime error fragment "${fragment}".`);
    }
    summary.push(check.name);
  }

  console.log("Mobile smoke passed:");
  for (const item of summary) console.log(`- ${item}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
