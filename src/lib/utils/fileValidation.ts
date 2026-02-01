/**
 * File validation utilities
 */

import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@/lib/constants";

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate uploaded file
 */
export function validateFile(file: File): FileValidationResult {
  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid file type. Please upload a PDF file.",
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.`,
    };
  }

  return { valid: true };
}

/**
 * Convert File to Buffer for server-side processing
 */
export async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
