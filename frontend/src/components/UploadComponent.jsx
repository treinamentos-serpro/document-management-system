import { useState } from 'react';
import { uploadDocument } from '../services/api.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function UploadComponent({ onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.file.files[0];
    setError('');
    setMessage('');

    if (!file) {
      setError('Selecione um arquivo para enviar.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('O arquivo deve ter no máximo 10 MiB.');
      return;
    }

    setUploading(true);
    try {
      const document = await uploadDocument(file);
      form.reset();
      setMessage(`Documento "${document.originalName}" enviado com sucesso.`);
      onUploaded();
    } catch (err) {
      setError(`Não foi possível enviar o documento. ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-labelledby="upload-heading">
      <h2 id="upload-heading">Enviar documento</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="document-file">Arquivo</label>{' '}
        <input
          id="document-file"
          name="file"
          type="file"
          required
          disabled={uploading}
          aria-describedby="upload-help"
        />{' '}
        <button type="submit" disabled={uploading}>
          {uploading ? 'Enviando…' : 'Enviar'}
        </button>
        <p id="upload-help">Qualquer tipo de arquivo, até 10 MiB.</p>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
