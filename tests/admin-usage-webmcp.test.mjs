import assert from 'node:assert/strict';
import {createAdminUsageTools} from '../lib/admin/usage-webmcp.ts';

const calls = [];
const tools = createAdminUsageTools(async refresh => {
  calls.push(refresh);
  return {providers: [{id: 'serpapi', metrics: [{label: 'Remaining', value: 0, unit: 'searches'}]}]};
});
assert.deepEqual(tools.map(tool => tool.name), ['mirana_admin_usage', 'mirana_admin_usage_refresh']);
assert.equal(tools[0].annotations.readOnlyHint, true);
assert.equal(tools[1].annotations.readOnlyHint, false);
for (const tool of tools) {
  assert.equal(tool.inputSchema.additionalProperties, false);
  for (const input of [null, undefined, [], 'owner', {path: '/api/workspace'}, {apiKey: 'SECRET-CANARY'}]) {
    const result = await tool.execute(input);
    assert.equal(result.kind, 'validation');
    assert.equal(JSON.stringify(result).includes('SECRET-CANARY'), false);
  }
}
assert.equal(calls.length, 0);
assert.equal((await tools[0].execute({})).providers[0].metrics[0].value, 0);
await tools[1].execute({});
assert.deepEqual(calls, [false, true]);
const denied = createAdminUsageTools(async () => {throw new Error('Authorization: SECRET-CANARY');});
for (const tool of denied) {
  const result = await tool.execute({});
  assert.equal(result.kind, 'request');
  assert.equal(JSON.stringify(result).includes('SECRET-CANARY'), false);
}
console.log('Admin usage WebMCP validation and error redaction passed.');
