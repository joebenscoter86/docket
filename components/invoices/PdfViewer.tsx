interface PdfViewerProps {
  signedUrl: string;
  fileType: string;
}

export default function PdfViewer({ signedUrl, fileType }: PdfViewerProps) {
  return (
    <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
      <div className="text-center">
        <p className="text-2xl mb-2">📄</p>
        <p>PDF Viewer — DOC-20</p>
        <p className="text-xs mt-1 font-mono truncate max-w-xs">{fileType}</p>
      </div>
    </div>
  );
}
