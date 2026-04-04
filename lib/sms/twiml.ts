export function twimlResponse(message: string): string {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${escaped}</Message></Response>`;
}

export function twimlEmpty(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`;
}
