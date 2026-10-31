import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
// Compile route modules with the project's existing TypeScript dependency; no live services are called.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { NextRequest } = require('next/server');
const { POST: quickAction } = require('../src/app/api/interpret-appointment/route.ts');
const { POST: siri } = require('../src/app/api/siri/route.ts');
test('Shortcut and Quick Action retain Saturday even when AI returns Wednesday', async () => {
    const originalFetch = globalThis.fetch, OriginalDate = globalThis.Date;
    const originalEnv = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, groq: process.env.GROQ_API_KEY };
    const inserted = [];
    const prompts = [];
    class FixedDate extends OriginalDate {
        constructor(value) { super(value === undefined ? '2026-10-31T23:19:00Z' : value); }
        static now() { return new OriginalDate('2026-10-31T23:19:00Z').getTime(); }
    }
    globalThis.Date = FixedDate;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
    process.env.GROQ_API_KEY = 'test-groq-key';
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.includes('/auth/v1/user'))
            return Response.json({ id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' });
        if (url === 'https://api.groq.com/openai/v1/chat/completions') {
            const body = JSON.parse(String(init?.body));
            prompts.push(body);
            const result = body.messages[0].content.startsWith('Classify') ? { intent: 'appointment', items: [] } : { title: 'Run test 74', date: '2026-11-04', time: '10:00', endDate: '', endTime: '' };
            return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] });
        }
        if (url.includes('/rest/v1/family_events')) {
            inserted.push(JSON.parse(String(init?.body)));
            return new Response(null, { status: 201 });
        }
        throw Error('Unexpected request: ' + url);
    };
    try {
        const description = decodeURIComponent("Run%20test%2074%20next%20Saturday%2010%20o'clock");
        const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
        const quickResponse = await quickAction(new NextRequest('https://calendar.example/api/interpret-appointment', { method: 'POST', headers, body: JSON.stringify({ description }) }));
        assert.equal(quickResponse.status, 200);
        assert.equal((await quickResponse.json()).date, '2026-11-07');
        const siriResponse = await siri(new NextRequest('https://calendar.example/api/siri', { method: 'POST', headers, body: JSON.stringify({ text: description }) }));
        const result = await siriResponse.json();
        assert.equal(siriResponse.status, 200, JSON.stringify(result));
        assert.match(result.spoken, /Saturday 7 November at 10:00/);
        assert.equal(inserted.length, 1);
        assert.equal(inserted[0].event_date, '2026-11-07');
        assert.equal(inserted[0].start_at, '2026-11-07T10:00:00.000Z');
        assert.equal(inserted[0].end_at, '2026-11-07T11:00:00.000Z');
        for (const prompt of prompts) {
            const messages = prompt.messages;
            assert.equal(messages[1].content, description);
        }
    }
    finally {
        globalThis.fetch = originalFetch;
        globalThis.Date = OriginalDate;
        for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: originalEnv.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: originalEnv.key, GROQ_API_KEY: originalEnv.groq })) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
    }
});
