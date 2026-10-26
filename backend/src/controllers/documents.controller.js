const { randomUUID } = require('node:crypto');
const multer = require('multer');
const service = require('../services/documents.service');

const receiveFile = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      service.prepareStorage().then(
        (directory) => callback(null, directory),
        (err) => callback(err)
      );
    },
    filename(req, file, callback) {
      callback(null, randomUUID());
    }
  }),
  // Busboy sinaliza o limite ao atingi-lo; o byte extra permite exatamente 10 MiB.
  limits: { fileSize: service.MAX_FILE_SIZE + 1 }
}).single('file');

function sendError(res, status, code, message, err) {
  if (err) {
    console.error(message, err);
  }
  return res.status(status).json({ error: { code, message } });
}

function upload(req, res) {
  receiveFile(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 413, 'FILE_TOO_LARGE', 'O arquivo deve ter no máximo 10 MiB.', err);
      }
      if (err instanceof multer.MulterError ||
          /^(Multipart:|Unexpected end of (form|file)|Malformed part header)/.test(err.message)) {
        return sendError(res, 400, 'INVALID_UPLOAD', 'Envie um único arquivo no campo file.', err);
      }
      return sendError(res, 500, 'UPLOAD_FAILED', 'Não foi possível armazenar o documento.', err);
    }

    if (!req.file) {
      return sendError(res, 400, 'FILE_REQUIRED', 'Envie um arquivo no campo file.');
    }

    try {
      const document = await service.registerUpload(req.file);
      res.status(201).json({ document });
    } catch (registrationError) {
      if (registrationError.code === 'FILE_TOO_LARGE') {
        return sendError(res, 413, 'FILE_TOO_LARGE', 'O arquivo deve ter no máximo 10 MiB.', registrationError);
      }
      sendError(res, 500, 'UPLOAD_FAILED', 'Não foi possível registrar o documento.', registrationError);
    }
  });
}

async function list(req, res) {
  try {
    res.json({ documents: await service.listDocuments() });
  } catch (err) {
    sendError(res, 500, 'DOCUMENT_LIST_FAILED', 'Não foi possível listar os documentos.', err);
  }
}

async function download(req, res, next) {
  try {
    const document = await service.getDownload(req.params.id);
    if (!document) {
      return sendError(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
    }

    res.download(document.path, document.originalName, {
      headers: { 'Content-Type': 'application/octet-stream' }
    }, (err) => {
      if (!err) {
        return;
      }
      if (res.headersSent) {
        return next(err);
      }
      sendError(res, 500, 'DOWNLOAD_FAILED', 'Não foi possível baixar o documento.', err);
    });
  } catch (err) {
    sendError(res, 500, 'DOWNLOAD_FAILED', 'Não foi possível baixar o documento.', err);
  }
}

module.exports = { upload, list, download };
