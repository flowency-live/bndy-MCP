// Upload Event Poster Tool - MCP Implementation
// Downloads an image from URL and uploads it to BNDY S3 bucket

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export interface UploadEventPosterParams {
  eventId: string;
  imageUrl: string;
}

// S3 configuration
const BUCKET_NAME = 'bndy-images';
const REGION = 'eu-west-2';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Lazy-initialized S3 client (allows mocking in tests)
let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: REGION });
  }
  return s3Client;
}

// Allowed image content types
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

export async function uploadEventPoster(params: UploadEventPosterParams): Promise<string> {
  const { eventId, imageUrl } = params;

  // Validate required fields
  if (!eventId) {
    return JSON.stringify({
      success: false,
      error: 'eventId is required',
      message: 'You must provide an eventId to upload a poster',
    }, null, 2);
  }

  if (!imageUrl) {
    return JSON.stringify({
      success: false,
      error: 'imageUrl is required',
      message: 'You must provide an imageUrl to upload',
    }, null, 2);
  }

  console.error(`[upload_event_poster] Uploading poster for event: ${eventId}`);
  console.error(`[upload_event_poster] Source URL: ${imageUrl.substring(0, 100)}`);

  try {
    // Step 1: Download the image
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return JSON.stringify({
        success: false,
        error: `Failed to download image: ${response.status} ${response.statusText}`,
        message: 'Could not download the image from the provided URL',
      }, null, 2);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Validate content type
    if (!ALLOWED_CONTENT_TYPES.some(type => contentType.startsWith(type.split('/')[0]))) {
      return JSON.stringify({
        success: false,
        error: `Invalid content type: ${contentType}. Only image files are allowed.`,
        message: 'The URL does not point to a valid image file',
        allowedTypes: ALLOWED_CONTENT_TYPES,
      }, null, 2);
    }

    // Download the image data
    const imageBuffer = await response.arrayBuffer();
    const imageData = Buffer.from(imageBuffer);

    console.error(`[upload_event_poster] Downloaded ${(imageData.length / 1024).toFixed(2)}KB`);

    // Validate file size
    if (imageData.length > MAX_FILE_SIZE) {
      return JSON.stringify({
        success: false,
        error: `File too large: ${(imageData.length / 1024 / 1024).toFixed(2)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        message: 'The image file is too large to upload',
      }, null, 2);
    }

    // Step 2: Generate S3 key
    const timestamp = Date.now();
    const fileExtension = getExtensionFromContentType(contentType);
    const s3Key = `event-posters/${eventId}/${timestamp}-poster.${fileExtension}`;

    console.error(`[upload_event_poster] Uploading to S3: ${s3Key}`);

    // Step 3: Upload to S3
    const putCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: imageData,
      ContentType: contentType,
      Metadata: {
        'event-id': eventId,
        'source': 'mcp_upload',
        'original-url': imageUrl.substring(0, 500),
      },
    });

    await getS3Client().send(putCommand);

    const s3Url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${s3Key}`;

    console.error(`[upload_event_poster] Upload successful: ${s3Url}`);

    // Return success response
    return JSON.stringify({
      success: true,
      s3Url,
      s3Key,
      contentType,
      fileSize: imageData.length,
      message: `Event poster uploaded successfully for event ${eventId}`,
      note: 'Remember to update the event with this imageUrl using edit_event tool',
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[upload_event_poster] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to upload event poster',
    }, null, 2);
  }
}

function getExtensionFromContentType(contentType: string): string {
  const mapping: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };

  // Get base content type without parameters
  const baseType = contentType.split(';')[0].trim();
  return mapping[baseType] || 'jpg';
}

// Export for testing purposes
export function resetS3Client(): void {
  s3Client = null;
}
