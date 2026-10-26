const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const app = require('../src/app');
const repository = require('../src/repositories/documents.repository');
const service = require('../src/services/documents.service');

function uploadForm(content, name = 'relatorio.txt') {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return form;
}

test('API de documentos com armazenamento local', async (t) => {
  const storedFiles = new Set();
  const originalSave = repository.save;
  t.mock.method(repository, 'save', (document) => {
    storedFiles.add(document.storageFilename);
    return originalSave(document);
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
    for (const filename of storedFiles) {
      await repository.removeFile(filename);
    }
  });
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options) => fetch(`${baseUrl}${path}`, options);
  let uploadedDocument;

  await t.test('preserva a rota de saúde e retorna lista inicialmente vazia', async () => {
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const response = await request('/documents');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { documents: [] });
  });

  await t.test('grava em disco e retorna somente metadados públicos com dono fixo', async () => {
    const form = uploadForm('conteudo do documento');
    form.append('owner', 'outro-usuario');
    form.append('id', 'id-do-cliente');
    form.append('storageFilename', '../../arquivo');
    const response = await request('/upload', { method: 'POST', body: form });
    assert.equal(response.status, 201);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const { document } = await response.json();
    uploadedDocument = document;
    assert.deepEqual(Object.keys(document).sort(),
      ['id', 'originalName', 'owner', 'size', 'uploadedAt']);
    assert.equal(document.originalName, 'relatorio.txt');
    assert.equal(document.size, Buffer.byteLength('conteudo do documento'));
    assert.equal(document.owner, 'demo-user');
    assert.notEqual(document.id, 'id-do-cliente');
    assert.equal(new Date(document.uploadedAt).toISOString(), document.uploadedAt);
    const stored = repository.findById(document.id);
    assert.notEqual(stored.storageFilename, document.originalName);
    assert.notEqual(stored.storageFilename, document.id);
    assert.equal(await fs.readFile(repository.getStoragePath(stored.storageFilename), 'utf8'),
      'conteudo do documento');
  });

  await t.test('baixa os bytes como anexo com o nome original', async () => {
    const response = await request(`/documents/${uploadedDocument.id}/download`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment; filename="relatorio.txt"/);
    assert.match(response.headers.get('content-type'), /application\/octet-stream/);
    assert.equal(await response.text(), 'conteudo do documento');
  });

  await t.test('aceita qualquer tipo e exatamente 10 MiB', async () => {
    const content = Buffer.alloc(10 * 1024 * 1024, 42);
    const response = await request('/upload', {
      method: 'POST', body: uploadForm(content, 'arquivo.tipo-desconhecido')
    });
    assert.equal(response.status, 201);
    const { document } = await response.json();
    assert.equal(document.size, content.length);
    const download = await request(`/documents/${document.id}/download`);
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), content);
  });

  await t.test('ordena por data decrescente e filtra documentos de outro dono', async () => {
    repository.save({
      id: randomUUID(), originalName: 'privado.txt', size: 0,
      uploadedAt: '2099-01-01T00:00:00.000Z', owner: 'outro-usuario',
      storageFilename: randomUUID()
    });
    const response = await request('/documents');
    const { documents } = await response.json();
    assert.equal(documents.length, 2);
    assert.ok(documents.every((document) => document.owner === 'demo-user'));
    assert.deepEqual(documents.map((document) => document.uploadedAt),
      documents.map((document) => document.uploadedAt).sort().reverse());
    assert.ok(documents.every((document) => !('storageFilename' in document) && !('path' in document)));
  });

  await t.test('retorna 404 para identificador ausente ou documento de outro dono', async () => {
    const foreignId = randomUUID();
    repository.save({
      id: foreignId, owner: 'outro-usuario', storageFilename: randomUUID()
    });
    for (const id of ['inexistente', foreignId]) {
      const response = await request(`/documents/${id}/download`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Documento não encontrado.' }
      });
    }
  });

  await t.test('exige arquivo no campo file', async () => {
    for (const body of [undefined, new FormData()]) {
      const response = await request('/upload', { method: 'POST', body });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: { code: 'FILE_REQUIRED', message: 'Envie um arquivo no campo file.' }
      });
    }
  });

  await t.test('rejeita tamanho de 10 MiB + 1 byte e remove o arquivo parcial', async (t) => {
    t.mock.method(console, 'error', () => {});
    const directory = await repository.prepareStorage();
    const before = (await fs.readdir(directory)).sort();
    const response = await request('/upload', {
      method: 'POST', body: uploadForm(Buffer.alloc(10 * 1024 * 1024 + 1))
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, 'FILE_TOO_LARGE');
    assert.deepEqual((await fs.readdir(directory)).sort(), before);
  });

  await t.test('rejeita campo incorreto, múltiplos arquivos e multipart malformado', async (t) => {
    t.mock.method(console, 'error', () => {});
    const directory = await repository.prepareStorage();
    const before = (await fs.readdir(directory)).sort();
    const wrongField = new FormData();
    wrongField.append('document', new Blob(['teste']), 'teste.txt');
    const multipleFiles = uploadForm('primeiro');
    multipleFiles.append('file', new Blob(['segundo']), 'segundo.txt');
    const options = [
      { body: wrongField },
      { body: multipleFiles },
      { body: 'invalido', headers: { 'Content-Type': 'multipart/form-data' } }
    ];
    for (const option of options) {
      const response = await request('/upload', { method: 'POST', ...option });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'INVALID_UPLOAD');
    }
    assert.deepEqual((await fs.readdir(directory)).sort(), before);
  });

  await t.test('remove arquivo quando o registro de metadados falha', async (t) => {
    t.mock.method(console, 'error', () => {});
    let filename;
    t.mock.method(repository, 'save', (document) => {
      filename = document.storageFilename;
      storedFiles.add(filename);
      throw new Error('detalhe interno de persistencia');
    });
    const response = await request('/upload', { method: 'POST', body: uploadForm('falha') });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: 'UPLOAD_FAILED', message: 'Não foi possível registrar o documento.' }
    });
    await assert.rejects(fs.stat(repository.getStoragePath(filename)), { code: 'ENOENT' });
  });

  await t.test('comunica falha de armazenamento sem expor detalhes internos', async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(service, 'prepareStorage', async () => {
      throw new Error('caminho interno de armazenamento');
    });
    const response = await request('/upload', { method: 'POST', body: uploadForm('falha') });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: 'UPLOAD_FAILED', message: 'Não foi possível armazenar o documento.' }
    });
  });

  await t.test('comunica falha de listagem em JSON', async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(repository, 'findByOwner', () => {
      throw new Error('detalhe interno');
    });
    const response = await request('/documents');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: 'DOCUMENT_LIST_FAILED', message: 'Não foi possível listar os documentos.' }
    });
  });

  await t.test('retorna falha de download se o arquivo registrado sumir do disco', async (t) => {
    t.mock.method(console, 'error', () => {});
    const stored = repository.findById(uploadedDocument.id);
    await repository.removeFile(stored.storageFilename);
    const response = await request(`/documents/${stored.id}/download`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: 'DOWNLOAD_FAILED', message: 'Não foi possível baixar o documento.' }
    });
  });
});
