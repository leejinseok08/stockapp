export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "*/10 * * * *") {
      ctx.waitUntil(fetch(`${env.API}/health`));
      return;
    }
    // After each market's close: swing scan for that market (runs in the background on the server),
    // then the push check (the backend dedupes per day and message).
    const market = event.cron === "10 22 * * *" ? "US" : "KR";
    const auth = { "X-Cron-Secret": env.CRON_SECRET };
    ctx.waitUntil(
      fetch(`${env.API}/health`)
        .then(() => fetch(`${env.API}/swing/run?market=${market}`, { method: "POST", headers: auth }))
        .then(() => fetch(`${env.API}/push/run`, { method: "POST", headers: auth })),
    );
  },
};
