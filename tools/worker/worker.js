export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "*/10 * * * *") {
      ctx.waitUntil(fetch(`${env.API}/health`));
      return;
    }
    // Push check: warm the instance first, then run (the backend dedupes per day and message).
    ctx.waitUntil(
      fetch(`${env.API}/health`).then(() =>
        fetch(`${env.API}/push/run`, { method: "POST", headers: { "X-Cron-Secret": env.CRON_SECRET } }),
      ),
    );
  },
};
