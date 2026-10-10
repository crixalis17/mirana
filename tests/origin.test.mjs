import assert from 'node:assert/strict';
import {appOrigin, guard} from '../lib/origin.ts';

const saved = {APP_ORIGIN: process.env.APP_ORIGIN, NODE_ENV: process.env.NODE_ENV};
const request = (url, headers = {}) => new Request(url, {method: 'POST', headers});
try {
  process.env.NODE_ENV = 'development';
  process.env.APP_ORIGIN = 'http://127.0.0.1:5176';
  // Next may reconstruct a different internal hostname; public origin is canonical.
  assert.doesNotThrow(() => guard(request('http://localhost:5176/api/preferences', {
    origin: 'http://127.0.0.1:5176', 'sec-fetch-site': 'same-origin',
  })));
  for (const origin of ['http://localhost:5176', 'http://127.0.0.1:5177', 'https://evil.example', 'null']) {
    assert.throws(() => guard(request('http://localhost:5176/api/preferences', {origin})), /Cross-site/);
  }
  assert.throws(() => guard(request('http://localhost:5176/api/preferences', {
    origin: process.env.APP_ORIGIN, 'sec-fetch-site': 'cross-site',
  })), /Cross-site/);
  assert.throws(() => guard(request('https://evil.example/api/preferences', {
    origin: 'https://evil.example', host: 'evil.example', 'x-forwarded-host': 'evil.example',
  })), /Cross-site/);
  // Non-browser authenticated workers omit Origin; they are still independently authenticated.
  assert.doesNotThrow(() => guard(request('http://localhost:5176/api/automation')));

  process.env.NODE_ENV = 'production';
  process.env.APP_ORIGIN = 'https://mirana.example';
  assert.doesNotThrow(() => guard(request('http://internal:3000/api/preferences', {
    origin: 'https://mirana.example', host: 'internal:3000',
  })));
  assert.throws(() => guard(request('https://spoofed.example/api/preferences', {
    origin: 'https://spoofed.example', 'x-forwarded-host': 'mirana.example',
  })), /Cross-site/);
  delete process.env.APP_ORIGIN;
  assert.throws(() => guard(request('https://spoofed.example/api/preferences', {
    origin: 'https://spoofed.example',
  })), /APP_ORIGIN is required/);
  for (const value of ['http://mirana.example', 'https://mirana.example/path',
    'https://mirana.example?query=yes', 'https://mirana.example#fragment',
    'https://user:pass@mirana.example', 'ftp://mirana.example']) {
    process.env.APP_ORIGIN = value;
    assert.throws(() => appOrigin(request('http://internal:3000')), /APP_ORIGIN must/);
  }
  process.env.NODE_ENV = 'development';
  delete process.env.APP_ORIGIN;
  assert.equal(appOrigin(request('http://127.0.0.1:5176/api/preferences')), 'http://127.0.0.1:5176');
  console.log('PASS: configured public origin, proxy URL mismatch, cross-site/host spoof rejection, production fail-closed');
} finally {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
