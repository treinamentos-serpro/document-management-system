async function request(path, options) {
  const response = await fetch(`/api${path}`, options);

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : null;
    throw new Error(body?.error?.message || `A requisição falhou (HTTP ${response.status}).`);
  }

  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Resposta inválida do servidor: o conteúdo não é um JSON válido.');
    }
    throw error;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDocument(document) {
  return isObject(document) &&
    isNonEmptyString(document.id) &&
    isNonEmptyString(document.originalName) &&
    Number.isSafeInteger(document.size) && document.size >= 0 &&
    isNonEmptyString(document.uploadedAt) &&
    Number.isFinite(Date.parse(document.uploadedAt)) &&
    isNonEmptyString(document.owner);
}

export async function listDocuments(signal) {
  const response = await request('/documents', { signal });
  const body = await readJson(response);
  if (!isObject(body) || !Array.isArray(body.documents) || !body.documents.every(isDocument)) {
    throw new Error('Resposta inválida do servidor: a lista de documentos contém dados inválidos.');
  }
  return body.documents;
}

export async function uploadDocument(file) {
  const body = new FormData();
  body.append('file', file);
  const response = await request('/upload', { method: 'POST', body });
  const result = await readJson(response);
  if (!isObject(result) || !isDocument(result.document)) {
    throw new Error('Resposta inválida do servidor: os dados do documento são inválidos.');
  }
  return result.document;
}

export async function downloadDocument(id) {
  const response = await request(`/documents/${encodeURIComponent(id)}/download`);
  return response.blob();
}
