// Real raw exception/cause input, beyond the event-processor privacy fixture.
const error = new Error("raw-exception-sentinel", { cause: new Error("credential-sentinel") });
if (process.argv[2] === "rejection") void Promise.reject(error);
else
  setImmediate(() => {
    throw error;
  });
