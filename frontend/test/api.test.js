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

const metadataRequests = [
  {
    name: 'listagem',
    request: () => listDocuments(),
    wrap: (value) => ({ documents: [value] }),
  },
  {
    name: 'upload',
    request: () => uploadDocument(new File(['abc'], 'file.txt')),
    wrap: (value) => ({ document: value }),
  },
];

test('rejeita envelopes ausentes ou de tipos inválidos nas respostas de sucesso', async (t) => {
  for (const { name, request } of metadataRequests) {
    const bodies = [
      null, [], 'documentos', 1, true, {},
      { documents: null, document: null },
      { documents: {}, document: [] },
      { documents: 'lista', document: 'documento' },
      { documents: false, document: false },
      { documents: 1, document: 1 },
    ];
    for (const [index, body] of bodies.entries()) {
      await t.test(`${name}: envelope ${index}`, async (t) => {
        t.mock.method(globalThis, 'fetch', async () => Response.json(body));
        await assert.rejects(request, {
          name: 'Error',
          message: /Resposta inválida do servidor/,
        });
      });
    }
  }
});

test('valida todos os metadados essenciais em ambos os endpoints', async (t) => {
  const invalidValues = {
    id: [null, 42, false, {}, [], '', '   '],
    originalName: [null, 42, false, {}, [], '', '   '],
    size: [null, '3', false, {}, [], -1, 0.5, Number.MAX_SAFE_INTEGER + 1],
    uploadedAt: [null, 42, false, {}, [], '', '   ', 'data inválida'],
    owner: [null, 42, false, {}, [], '', '   '],
  };

  for (const { name, request, wrap } of metadataRequests) {
    for (const [field, values] of Object.entries(invalidValues)) {
      for (const [index, value] of [undefined, ...values].entries()) {
        await t.test(`${name}: ${field}, caso ${index}`, async (t) => {
          t.mock.method(globalThis, 'fetch', async () => Response.json(wrap({
            ...document,
            [field]: value,
          })));
          await assert.rejects(request, {
            name: 'Error',
            message: /Resposta inválida do servidor/,
          });
        });
      }
    }
    for (const [index, value] of [null, [], 'documento', 1, false].entries()) {
      await t.test(`${name}: documento inválido ${index}`, async (t) => {
        t.mock.method(globalThis, 'fetch', async () => Response.json(wrap(value)));
        await assert.rejects(request, /Resposta inválida do servidor/);
      });
    }
  }
});

test('rejeita a lista inteira quando há documento inválido entre documentos válidos', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    documents: [document, { ...document, uploadedAt: 'inválida' }, document],
  }));
  await assert.rejects(listDocuments(), /Resposta inválida do servidor/);
});

test('rejeita tamanhos não finitos produzidos por números JSON fora do intervalo', async (t) => {
  for (const { name, request, wrap } of metadataRequests) {
    for (const size of ['1e400', '-1e400']) {
      await t.test(`${name}: ${size}`, async (t) => {
        const json = JSON.stringify(wrap(document)).replace('"size":3', `"size":${size}`);
        t.mock.method(globalThis, 'fetch', async () => new Response(json));
        await assert.rejects(request, /Resposta inválida do servidor/);
      });
    }
  }
});

test('aceita identificadores opacos, arquivos vazios e campos adicionais sem alterar os dados', async (t) => {
  for (const { name, request, wrap } of metadataRequests) {
    for (const size of [0, Number.MAX_SAFE_INTEGER]) {
      await t.test(`${name}: tamanho ${size}`, async (t) => {
        const metadata = {
          ...document,
          id: ' id/?:#% não-uuid ',
          size,
          uploadedAt: '2026-10-26T09:00:00-03:00',
          extra: { version: 1 },
        };
        const body = { ...wrap(metadata), extra: true };
        t.mock.method(globalThis, 'fetch', async () => Response.json(body));
        assert.deepEqual(await request(), name === 'listagem' ? [metadata] : metadata);
      });
    }
  }
});

test('converte JSON inválido ou corpo vazio de sucesso em erro compreensível', async (t) => {
  for (const { name, request } of metadataRequests) {
    for (const content of ['{', '<html>Erro no proxy</html>', '']) {
      await t.test(`${name}: conteúdo ${JSON.stringify(content)}`, async (t) => {
        t.mock.method(globalThis, 'fetch', async () => new Response(content));
        await assert.rejects(request, {
          name: 'Error',
          message: 'Resposta inválida do servidor: o conteúdo não é um JSON válido.',
        });
      });
    }
  }
});

test('preserva falhas de rede e cancelamento nos endpoints de metadados', async (t) => {
  for (const { name, request } of metadataRequests) {
    for (const error of [new TypeError('Failed to fetch'), new DOMException('Cancelado', 'AbortError')]) {
      await t.test(`${name}: ${error.name}`, async (t) => {
        t.mock.method(globalThis, 'fetch', async () => { throw error; });
        await assert.rejects(request, (received) => received === error);
      });
      await t.test(`${name}: ${error.name} durante leitura do corpo`, async (t) => {
        t.mock.method(globalThis, 'fetch', async () => ({
          ok: true,
          json: async () => { throw error; },
        }));
        await assert.rejects(request, (received) => received === error);
      });
    }
  }
});
