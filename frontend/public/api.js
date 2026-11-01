export function createApi(fetcher = globalThis.fetch) {
  return async function api(path, body) {
    let response;
    try {
      response = await fetcher('/api/' + path, {
        credentials: 'same-origin', signal: AbortSignal.timeout(15000),
        ...(body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
      });
    } catch {
      throw new Error('Unable to reach Mealers. Check your connection and retry. No confirmation was received.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || 'The request could not complete. Please retry.');
      error.status = response.status;
      throw error;
    }
    if (!data || typeof data !== 'object') throw new Error('Mealers returned an unexpected response. Please retry.');
    return data;
  };
}
