const { randomUUID } = require('node:crypto');
const repository = require('../repositories/documents.repository');

const DEMO_OWNER = 'demo-user';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function publicMetadata(document) {
  const { id, originalName, size, uploadedAt, owner } = document;
  return { id, originalName, size, uploadedAt, owner };
}

async function registerUpload(file) {
  try {
    if (file.size > MAX_FILE_SIZE) {
      const err = new Error('O arquivo deve ter no máximo 10 MiB.');
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }
    const document = await repository.save({
      id: randomUUID(),
      originalName: file.originalname,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      owner: DEMO_OWNER,
      storageFilename: file.filename
    });
    return publicMetadata(document);
  } catch (err) {
    try {
      await repository.removeFile(file.filename);
    } catch (cleanupError) {
      console.error('Falha ao remover arquivo de upload não registrado:', cleanupError);
    }
    throw err;
  }
}

async function listDocuments() {
  const documents = await repository.findByOwner(DEMO_OWNER);
  return documents
    .sort((first, second) => second.uploadedAt.localeCompare(first.uploadedAt))
    .map(publicMetadata);
}

async function getDownload(id) {
  const document = await repository.findById(id);
  if (!document || document.owner !== DEMO_OWNER) {
    return null;
  }

  return {
    originalName: document.originalName,
    path: repository.getStoragePath(document.storageFilename)
  };
}

module.exports = {
  MAX_FILE_SIZE,
  prepareStorage: repository.prepareStorage,
  registerUpload,
  listDocuments,
  getDownload
};
