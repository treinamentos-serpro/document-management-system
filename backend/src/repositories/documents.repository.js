const fs = require('node:fs/promises');
const path = require('node:path');

const storageDirectory = path.resolve(__dirname, '../../storage');
const documents = new Map();
const STORAGE_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidStorageFilename() {
  const err = new Error('Nome de arquivo de armazenamento inválido.');
  err.code = 'INVALID_STORAGE_FILENAME';
  return err;
}

async function prepareStorage() {
  await fs.mkdir(storageDirectory, { recursive: true });
  return storageDirectory;
}

function getStoragePath(storageFilename) {
  if (typeof storageFilename !== 'string' || !STORAGE_FILENAME_PATTERN.test(storageFilename)) {
    throw invalidStorageFilename();
  }

  const storagePath = path.resolve(storageDirectory, storageFilename);
  // Defesa em profundidade: o caminho final deve ser filho direto de backend/storage.
  if (path.dirname(storagePath) !== storageDirectory) {
    throw invalidStorageFilename();
  }
  return storagePath;
}

async function removeFile(storageFilename) {
  try {
    await fs.unlink(getStoragePath(storageFilename));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

function save(document) {
  documents.set(document.id, { ...document });
  return { ...document };
}

function findByOwner(owner) {
  return [...documents.values()]
    .filter((document) => document.owner === owner)
    .map((document) => ({ ...document }));
}

function findById(id) {
  const document = documents.get(id);
  return document ? { ...document } : undefined;
}

module.exports = { prepareStorage, getStoragePath, removeFile, save, findByOwner, findById };
