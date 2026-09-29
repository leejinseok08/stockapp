export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "*/10 * * * *") {
      ctx.waitUntil(fetch(`${env.API}/health`));
      return;
    }
    const auth = { "X-Cron-Secret": env.CRON_SECRET };
    // Right after each open: send the Kiwoom mock account's planned orders. The US cron fires at 13:31 and
    // 14:31 UTC (09:31 New York in summer and in winter); the server acts only while the market is open.
    if (event.cron === "1 0 * * 1-5" || event.cron === "31 13,14 * * 1-5") {
      const market = event.cron === "1 0 * * 1-5" ? "KR" : "US";
      ctx.waitUntil(
        fetch(`${env.API}/health`).then(() =>
          fetch(`${env.API}/kiwoom/mock/execute?market=${market}`, { method: "POST", headers: auth }),
        ),
      );
      return;
    }
    // After each market's close: swing scan for that market (runs in the background on the server),
    // then the push check (the backend dedupes per day and message); after KR, the Kiwoom price probe.
    const market = event.cron === "10 22 * * *" ? "US" : "KR";
    ctx.waitUntil(
      fetch(`${env.API}/health`)
        .then(() => fetch(`${env.API}/swing/run?market=${market}`, { method: "POST", headers: auth }))
        .then(() => fetch(`${env.API}/push/run`, { method: "POST", headers: auth }))
        .then(() => market === "KR" && fetch(`${env.API}/kiwoom/probe/run`, { method: "POST", headers: auth })),
    );
  },
};
