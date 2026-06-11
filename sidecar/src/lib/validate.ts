import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export async function checkMagicBytes(buffer: Buffer): Promise<void> {
	const result = await fileTypeFromBuffer(buffer);
	if (!result || !ALLOWED_MIMES.includes(result.mime)) {
		throw Object.assign(new Error('Invalid image format'), { code: 'INVALID_FORMAT' as const });
	}
}

export async function checkDecodedBounds(buffer: Buffer): Promise<void> {
	const meta = await sharp(buffer).metadata();
	if ((meta.width ?? 0) > 4096 || (meta.height ?? 0) > 4096) {
		throw Object.assign(new Error('Image dimensions too large'), {
			code: 'IMAGE_TOO_LARGE' as const
		});
	}
}
