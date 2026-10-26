import { useState } from 'react';
import { downloadDocument } from '../services/api.js';

export default function DownloadButton({ document }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  async function handleDownload() {
    setDownloading(true);
    setError('');
    try {
      const blob = await downloadDocument(document.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.originalName;
      window.document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        // Dá tempo ao navegador para iniciar o download antes de liberar o blob.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      setError(`Não foi possível baixar o documento. ${err.message}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Baixar ${document.originalName}`}
      >
        {downloading ? 'Baixando…' : 'Baixar'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
