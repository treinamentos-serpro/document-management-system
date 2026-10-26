import DownloadButton from './DownloadButton.jsx';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});
const sizeFormatter = new Intl.NumberFormat('pt-BR');

export default function DocumentList({ documents, loading, error, onRetry }) {
  return (
    <section aria-labelledby="documents-heading" aria-busy={loading}>
      <h2 id="documents-heading">Meus documentos</h2>
      {loading && <p role="status">Carregando documentos…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>Tentar novamente</button>
        </div>
      )}
      {!loading && !error && documents.length === 0 && (
        <p>Nenhum documento enviado.</p>
      )}
      {documents.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Tamanho</th>
              <th scope="col">Data de envio</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td>{document.originalName}</td>
                <td>{sizeFormatter.format(document.size)} bytes</td>
                <td>
                  <time dateTime={document.uploadedAt}>
                    {dateFormatter.format(new Date(document.uploadedAt))}
                  </time>
                </td>
                <td><DownloadButton document={document} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
