// Keep in sync with backend/schemas.py (MAX_MESSAGE_CHARS). The history window
// is enforced by the server now, so the frontend no longer needs to know it.
export const MAX_MESSAGE_CHARS = 4000;

// Keep in sync with backend/routers/documents.py (MAX_UPLOAD_BYTES) and
// backend/services/documents.py (ALLOWED_EXTENSIONS). The server enforces both;
// checking here only saves a pointless upload.
export const MAX_UPLOAD_BYTES = 2_000_000;
export const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf'];
