interface PdfViewerProps {
  signedUrl: string;
  fileType: string;
}

// Full PDF renderer will be implemented in DOC-20
export default function PdfViewer({ signedUrl, fileType }: PdfViewerProps) {
  return (
    <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
      <div className="text-center">
        <p className="text-2xl mb-2">📄</p>
        <p>PDF Viewer — DOC-20</p>
        <p className="text-xs mt-1 font-mono truncate max-w-xs">{fileType}</p>
        {/* Render signedUrl as a link so users can view the document before DOC-20 */}
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-blue-500 hover:text-blue-600"
        >
          Open document in new tab
        </a>
      </div>
    </div>
  );
}
