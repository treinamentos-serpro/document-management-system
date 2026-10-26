import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { MAX_FILE_SIZE } = require('../../backend/src/services/documents.service.js');
const metadata = {
  id: 'document-1',
  originalName: 'document.txt',
  size: 4,
  uploadedAt: '2026-10-26T12:00:00.000Z',
  owner: 'demo-user',
};
let server;
let App;
let UploadComponent;
let DownloadButton;
let dom;
let root;
let container;
let originalGlobals;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, ws: false },
  });
  App = (await server.ssrLoadModule('/src/App.jsx')).default;
  UploadComponent = (await server.ssrLoadModule('/src/components/UploadComponent.jsx')).default;
  DownloadButton = (await server.ssrLoadModule('/src/components/DownloadButton.jsx')).default;
});

after(async () => {
  await server?.close();
});

beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  originalGlobals = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  container = document.getElementById('root');
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

async function render(Component, props) {
  await act(async () => root.render(createElement(Component, props)));
}

async function click(button) {
  await act(async () => button.click());
}

async function submit(file) {
  const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  await act(async () => {
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    container.querySelector('form').dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function json(body, status = 200) {
  return Response.json(body, { status });
}

test('upload mostra progresso, bloqueia controles e comunica sucesso', async (t) => {
  const pending = deferred();
  const fetchMock = t.mock.method(globalThis, 'fetch', () => pending.promise);
  let uploaded = 0;
  await render(UploadComponent, { onUploaded: () => { uploaded += 1; } });
  await submit(new File(['data'], metadata.originalName));
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.equal(fetchMock.mock.calls[0].arguments[1].body.get('file').name, metadata.originalName);
  assert.equal(container.querySelector('input').disabled, true);
  assert.equal(container.querySelector('button').disabled, true);
  assert.match(container.textContent, /Enviando/);
  assert.equal(uploaded, 0);
  await act(async () => pending.resolve(json({ document: metadata }, 201)));
  assert.match(container.querySelector('[role="status"]').textContent, /enviado com sucesso/);
  assert.equal(container.querySelector('button').disabled, false);
  assert.equal(uploaded, 1);
});

test('upload com erro informa a falha e permite nova tentativa', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return calls === 1
      ? json({ error: { message: 'Disco indisponível.' } }, 500)
      : json({ document: metadata }, 201);
  });
  let uploaded = 0;
  await render(UploadComponent, { onUploaded: () => { uploaded += 1; } });
  const file = new File(['data'], metadata.originalName);
  await submit(file);
  assert.match(container.querySelector('[role="alert"]').textContent, /Disco indisponível/);
  assert.equal(container.querySelector('button').disabled, false);
  assert.equal(uploaded, 0);
  await submit(file);
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.equal(uploaded, 1);
});

test('limite do navegador coincide com o backend no byte exato', async (t) => {
  assert.equal(MAX_FILE_SIZE, 10 * 1024 * 1024);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => json({ document: metadata }, 201));
  await render(UploadComponent, { onUploaded() {} });
  await submit();
  assert.match(container.querySelector('[role="alert"]').textContent, /Selecione um arquivo/);
  assert.equal(fetchMock.mock.calls.length, 0);
  await submit(new File([new Uint8Array(MAX_FILE_SIZE + 1)], 'too-large.bin'));
  assert.match(container.querySelector('[role="alert"]').textContent, /no máximo 10 MiB/);
  assert.equal(fetchMock.mock.calls.length, 0);
  await submit(new File([new Uint8Array(MAX_FILE_SIZE)], 'at-limit.bin'));
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.equal(fetchMock.mock.calls[0].arguments[1].body.get('file').size, MAX_FILE_SIZE);
  assert.equal(container.querySelector('[role="alert"]'), null);
});

test('download cria anexo, remove o link e libera a URL após iniciar', async (t) => {
  const pending = deferred();
  t.mock.method(globalThis, 'fetch', () => pending.promise);
  const blob = new Blob(['data']);
  const createUrl = t.mock.method(URL, 'createObjectURL', () => 'blob:test-download');
  const revokeUrl = t.mock.method(URL, 'revokeObjectURL', () => {});
  let attachment;
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () {
    attachment = { href: this.href, download: this.download, connected: this.isConnected };
  });
  let release;
  const setTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    if (delay === 1000) {
      release = callback;
      return 0;
    }
    return setTimeout(callback, delay, ...args);
  });
  await render(DownloadButton, { document: metadata });
  await click(container.querySelector('button'));
  assert.equal(container.querySelector('button').disabled, true);
  assert.match(container.textContent, /Baixando/);
  await act(async () => pending.resolve({ ok: true, blob: async () => blob }));
  assert.equal(createUrl.mock.calls[0].arguments[0], blob);
  assert.deepEqual(attachment, {
    href: 'blob:test-download', download: metadata.originalName, connected: true,
  });
  assert.equal(document.querySelector('a'), null);
  assert.equal(container.querySelector('button').disabled, false);
  assert.equal(revokeUrl.mock.calls.length, 0);
  assert.equal(typeof release, 'function');
  release();
  assert.deepEqual(revokeUrl.mock.calls[0].arguments, ['blob:test-download']);
});

test('download com erro não cria URL e permite retry', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return json({ error: { message: 'Arquivo indisponível.' } }, 500);
  });
  const createUrl = t.mock.method(URL, 'createObjectURL', () => 'blob:unused');
  await render(DownloadButton, { document: metadata });
  await click(container.querySelector('button'));
  assert.match(container.querySelector('[role="alert"]').textContent, /Arquivo indisponível/);
  assert.equal(container.querySelector('button').disabled, false);
  assert.equal(createUrl.mock.calls.length, 0);
  await click(container.querySelector('button'));
  assert.equal(calls, 2);
});

test('App repete listagem com falha e atualiza documentos após upload', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url);
    if (requests.length === 1) return json({ error: { message: 'Falha temporária.' } }, 500);
    if (url === '/api/upload') return json({ document: metadata }, 201);
    return json({ documents: requests.length > 2 ? [metadata] : [] });
  });
  await render(App);
  assert.match(container.querySelector('[role="alert"]').textContent, /Falha temporária/);
  const retry = [...container.querySelectorAll('button')]
    .find((button) => button.textContent === 'Tentar novamente');
  await click(retry);
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.match(container.textContent, /Nenhum documento enviado/);
  await submit(new File(['data'], metadata.originalName));
  assert.deepEqual(requests, ['/api/documents', '/api/documents', '/api/upload', '/api/documents']);
  assert.match(container.querySelector('tbody').textContent, /document\.txt/);
  assert.equal(container.querySelector('button[aria-label="Baixar document.txt"]') !== null, true);
});
