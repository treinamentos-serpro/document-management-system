const fs = require('node:fs/promises');
const path = require('node:path');

const storageDirectory = path.resolve(__dirname, '../../storage');
const documents = new Map();

async function prepareStorage() {
  await fs.mkdir(storageDirectory, { recursive: true });
  return storageDirectory;
}

function getStoragePath(storageFilename) {
  return path.join(storageDirectory, storageFilename);
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
