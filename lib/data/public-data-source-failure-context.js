import { AsyncLocalStorage } from "node:async_hooks";

const failureContext = new AsyncLocalStorage();

export async function runWithPublicDataSourceFailureTracking(callback) {
  const state = { failed: false };
  const response = await failureContext.run(state, callback);
  return { response, failed: state.failed };
}

export function markPublicDataSourceFailure() {
  const state = failureContext.getStore();
  if (state) state.failed = true;
}
