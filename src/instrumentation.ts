export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGraphMailScheduler } = await import("./lib/graph-mail-scheduler");
    startGraphMailScheduler();
  }
}
