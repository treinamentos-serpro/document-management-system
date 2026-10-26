import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let DocumentList;
let UploadComponent;
let App;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, ws: false },
  });
  DocumentList = (await server.ssrLoadModule('/src/components/DocumentList.jsx')).default;
  UploadComponent = (await server.ssrLoadModule('/src/components/UploadComponent.jsx')).default;
  App = (await server.ssrLoadModule('/src/App.jsx')).default;
});

after(async () => {
  await server?.close();
});

function renderList(props = {}) {
  return renderToStaticMarkup(createElement(DocumentList, {
    documents: [],
    loading: false,
    error: '',
    onRetry() {},
    ...props,
  }));
}

test('distingue lista vazia, carregamento e erro com opção de tentar novamente', () => {
  assert.match(renderList(), /Nenhum documento enviado/);
  const loading = renderList({ loading: true });
  assert.match(loading, /Carregando documentos/);
  assert.doesNotMatch(loading, /Nenhum documento enviado/);
  const error = renderList({ error: 'Falha na API' });
  assert.match(error, /role="alert"/);
  assert.match(error, /Falha na API/);
  assert.match(error, /Tentar novamente/);
  assert.doesNotMatch(error, /Nenhum documento enviado/);
});

test('apresenta metadados públicos e botão de download por documento', () => {
  const markup = renderList({
    documents: [{
      id: 'document-1',
      originalName: 'relatório.txt',
      size: 1024,
      uploadedAt: '2026-10-26T12:00:00.000Z',
    }],
  });
  assert.match(markup, /relatório.txt/);
  assert.match(markup, /1\.024 bytes/);
  assert.match(markup, /dateTime="2026-10-26T12:00:00.000Z"/);
  assert.match(markup, /aria-label="Baixar relatório.txt"/);
});

test('upload aceita qualquer tipo e informa o limite de tamanho', () => {
  const markup = renderToStaticMarkup(createElement(UploadComponent, { onUploaded() {} }));
  assert.match(markup, /type="file"/);
  assert.match(markup, /name="file"/);
  assert.match(markup, /10 MiB/);
  assert.doesNotMatch(markup, /accept=/);
});

test('App monta o upload e a listagem com carregamento inicial', () => {
  const markup = renderToStaticMarkup(createElement(App));
  assert.match(markup, /Enviar documento/);
  assert.match(markup, /Meus documentos/);
  assert.match(markup, /Carregando documentos/);
});
