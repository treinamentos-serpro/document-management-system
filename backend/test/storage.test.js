const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const repository = require('../src/repositories/documents.repository');

const storageDirectory = path.resolve(__dirname, '../storage');
const invalidFilenameError = { code: 'INVALID_STORAGE_FILENAME', message: 'Nome de arquivo de armazenamento inválido.' };

test('getStoragePath aceita UUID gerado pelo servidor dentro de backend/storage', () => {
  const filename = randomUUID();
  const storagePath = repository.getStoragePath(filename);

  assert.equal(storagePath, path.join(storageDirectory, filename));
  assert.equal(path.dirname(storagePath), storageDirectory);
});

test('getStoragePath aceita UUID em maiúsculas', () => {
  const filename = randomUUID().toUpperCase();
  assert.equal(repository.getStoragePath(filename), path.join(storageDirectory, filename));
});

test('getStoragePath rejeita nomes inválidos, traversal e caminhos absolutos', () => {
  const uuid = randomUUID();
  const invalidNames = [
    '',
    'arquivo.txt',
    '..',
    '.',
    '../arquivo',
    '../../etc/passwd',
    `../${uuid}`,
    `${uuid}/..`,
    `sub/${uuid}`,
    `sub\\${uuid}`,
    `..\\${uuid}`,
    path.join(storageDirectory, uuid),
    `/${uuid}`,
    'C:\\Windows\\win.ini',
    `${uuid}.txt`,
    ` ${uuid}`,
    `${uuid}\n`,
    `${uuid}\0`,
    '00000000-0000-0000-0000-000000000000',
    uuid.replace(/-/g, ''),
    uuid.slice(0, -1) + 'g'
  ];

  for (const name of invalidNames) {
    assert.throws(() => repository.getStoragePath(name), invalidFilenameError, `deveria rejeitar ${JSON.stringify(name)}`);
  }
});

test('getStoragePath rejeita valores que não são string', () => {
  for (const value of [undefined, null, 123, {}, [randomUUID()], Buffer.from(randomUUID())]) {
    assert.throws(() => repository.getStoragePath(value), invalidFilenameError);
  }
});

test('removeFile rejeita nome inválido sem tocar no filesystem', async () => {
  await assert.rejects(repository.removeFile('../../package.json'), invalidFilenameError);
});

test('removeFile ignora UUID válido inexistente', async () => {
  await repository.removeFile(randomUUID());
});
