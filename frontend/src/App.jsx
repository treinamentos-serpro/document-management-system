import { useEffect, useState } from 'react';
import UploadComponent from './components/UploadComponent.jsx';
import DocumentList from './components/DocumentList.jsx';
import { listDocuments } from './services/api.js';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    async function loadDocuments() {
      try {
        const documents = await listDocuments(controller.signal);
        if (!controller.signal.aborted) {
          setDocuments(documents);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(`Não foi possível listar os documentos. ${err.message}`);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDocuments();
    return () => controller.abort();
  }, [refreshIndex]);

  function refreshDocuments() {
    setRefreshIndex((index) => index + 1);
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Document Management System</h1>
      <UploadComponent onUploaded={refreshDocuments} />
      <DocumentList
        documents={documents}
        loading={loading}
        error={error}
        onRetry={refreshDocuments}
      />
    </main>
  );
}
