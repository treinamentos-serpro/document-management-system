import assert from 'node:assert/strict';
import { test } from 'node:test';
import { downloadDocument, listDocuments, uploadDocument } from '../src/services/api.js';

const document = {
  id: 'document-1',
  originalName: 'relatório.txt',
  size: 3,
  uploadedAt: '2026-10-26T12:00:00.000Z',
  owner: 'demo-user',
};

test('lista documentos usando /api e encaminha o sinal de cancelamento', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/documents');
    assert.equal(options.signal, controller.signal);
    return Response.json({ documents: [document] });
  });

  assert.deepEqual(await listDocuments(controller.signal), [document]);
});

test('preserva uma lista vazia', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ documents: [] }));
  assert.deepEqual(await listDocuments(), []);
});

test('envia um arquivo no campo multipart file sem definir Content-Type manualmente', async (t) => {
  const file = new File(['abc'], document.originalName);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/upload');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers, undefined);
    assert.deepEqual([...options.body.keys()], ['file']);
    assert.equal(options.body.get('file').name, file.name);
    assert.equal(await options.body.get('file').text(), 'abc');
    return Response.json({ document }, { status: 201 });
  });

  assert.deepEqual(await uploadDocument(file), document);
});

test('baixa o conteúdo binário e codifica o identificador no caminho', async (t) => {
  const bytes = new Uint8Array([0, 255, 128, 10]);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/documents/id%2F%3F%23/download');
    return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } });
  });

  const blob = await downloadDocument('id/?#');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test('propaga as mensagens de erro JSON de todos os endpoints', async (t) => {
  const cases = [
    [() => listDocuments(), 500, 'Não foi possível listar os documentos.'],
    [() => uploadDocument(new File(['abc'], 'file.txt')), 413, 'O arquivo deve ter no máximo 10 MiB.'],
    [() => downloadDocument('missing'), 404, 'Documento não encontrado.'],
  ];
  for (const [request, status, message] of cases) {
    await t.test(`HTTP ${status}`, async (t) => {
      t.mock.method(globalThis, 'fetch', async () => Response.json({
        error: { code: 'TEST_ERROR', message },
      }, { status }));
      await assert.rejects(request, { message });
    });
  }
});

test('informa o status HTTP quando o proxy não retorna JSON', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Bad Gateway', { status: 502 }));
  await assert.rejects(listDocuments(), /HTTP 502/);
});

test('propaga falhas de rede e cancelamento para o chamador', async (t) => {
  const error = new TypeError('Failed to fetch');
  t.mock.method(globalThis, 'fetch', async () => { throw error; });
  await assert.rejects(listDocuments(), (err) => err === error);
});
