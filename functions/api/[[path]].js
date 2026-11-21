// Forwards every API call to the GoalBingoDB Durable Object (worker/), which holds all data.
export async function onRequest({ request, env }) {
  const stub = env.BINGO.get(env.BINGO.idFromName('main'));
  return stub.fetch(request);
}
