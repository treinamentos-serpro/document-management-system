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

export async function listDocuments(signal) {
  const response = await request('/documents', { signal });
  const { documents } = await response.json();
  return documents;
}

export async function uploadDocument(file) {
  const body = new FormData();
  body.append('file', file);
  const response = await request('/upload', { method: 'POST', body });
  const { document } = await response.json();
  return document;
}

export async function downloadDocument(id) {
  const response = await request(`/documents/${encodeURIComponent(id)}/download`);
  return response.blob();
}
