import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { rename, writeFile, unlink } from 'node:fs/promises';
import { requireAuth } from '../middleware/auth.js';
import { checkMagicBytes, checkDecodedBounds } from '../lib/validate.js';

const router = Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 8 * 1024 * 1024 }
});

const avatarsDir = process.env.AVATARS_DIR ?? '/srv/cairn/avatars';
const postgrestUrl = process.env.POSTGREST_URL;

// Express can't await these handlers, so fire-and-forget the promise; each
// resolves the response itself and routes failures through next() (see the
// auth-proxy `void handler()` idiom).
router.post(
	'/',
	requireAuth,
	upload.single('file'),
	(req: Request, res: Response, next: NextFunction) => void uploadAvatar(req, res, next)
);

router.delete(
	'/me',
	requireAuth,
	(req: Request, res: Response, next: NextFunction) => void deleteAvatar(req, res, next)
);

async function uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		if (!req.file) {
			res.status(400).json({ error: 'No file uploaded' });
			return;
		}

		const { buffer } = req.file;
		await checkMagicBytes(buffer);
		await checkDecodedBounds(buffer);

		const resized = await sharp(buffer)
			.resize(256, 256, { fit: 'cover' })
			.webp({ quality: 80 })
			.toBuffer();

		const dest = path.join(avatarsDir, `${req.uid}.webp`);
		const tmp = `${dest}.tmp`;
		await writeFile(tmp, resized);
		await rename(tmp, dest);

		const token = req.headers.authorization!.slice(7);
		const pgRes = await fetch(`${postgrestUrl}/rpc/bump_avatar_version`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: '{}'
		});

		if (!pgRes.ok) {
			res.status(502).json({ error: 'version bump failed' });
			return;
		}

		const version = (await pgRes.json()) as number;
		res.status(200).json({ version, url: `/avatars/${req.uid}.webp?v=${version}` });
	} catch (err) {
		next(err);
	}
}

async function deleteAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
	const file = path.join(avatarsDir, `${req.uid}.webp`);
	try {
		await unlink(file);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			next(err);
			return;
		}
	}
	res.status(200).json({ ok: true });
}

// Error handler: multer size limit, magic-byte check, decoded-bounds check
router.use((err: NodeJS.ErrnoException, _req: Request, res: Response, _next: NextFunction) => {
	if (err.code === 'LIMIT_FILE_SIZE') {
		res.status(413).json({ error: 'File too large' });
		return;
	}
	if (err.code === 'INVALID_FORMAT') {
		res.status(415).json({ error: 'Unsupported image format' });
		return;
	}
	if (err.code === 'IMAGE_TOO_LARGE') {
		res.status(422).json({ error: 'Image dimensions too large' });
		return;
	}
	_next(err);
});

export { router as avatarsRouter };
