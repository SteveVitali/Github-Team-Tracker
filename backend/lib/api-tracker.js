import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Initialize tracking for a request
 */
export function initializeTracking() {
  const store = {
    apiCalls: {},
    totalCalls: 0,
  };
  asyncLocalStorage.enterWith(store);
  return store;
}

/**
 * Track an API call
 * @param {string} type - Type of API call (e.g., 'REST:search.issuesAndPullRequests', 'GraphQL:getUserPRs')
 */
export function trackApiCall(type) {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    // No tracking context, likely not in a request
    return;
  }

  if (!store.apiCalls[type]) {
    store.apiCalls[type] = 0;
  }
  store.apiCalls[type]++;
  store.totalCalls++;
}

/**
 * Get the current tracking data
 */
export function getTrackingData() {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    return {
      apiCalls: {},
      totalCalls: 0,
    };
  }

  return {
    apiCalls: { ...store.apiCalls },
    totalCalls: store.totalCalls,
  };
}

/**
 * Wrap a function to track its API call
 */
export function trackCall(type, fn) {
  return async (...args) => {
    trackApiCall(type);
    return fn(...args);
  };
}
