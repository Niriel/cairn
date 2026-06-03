<script lang="ts">
	import Icon from '$lib/basic/components/Icon.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';

	type Props = {
		imageFile: File;
		oncancel: () => void;
		onsave: (blob: Blob | null) => void;
	};

	let { imageFile, oncancel, onsave }: Props = $props();

	const CANVAS_SIZE = 320;
	const EXPORT_SIZE = 256;
	const CIRCLE_R = 140; // 280px diameter circle within 320px stage

	let canvasEl!: HTMLCanvasElement;
	let loadedImg: HTMLImageElement | null = null;
	let ctx: CanvasRenderingContext2D | null = null;
	let panX = 0;
	let panY = 0;
	let scale = 1;
	let isDragging = false;
	let lastX = 0;
	let lastY = 0;
	let previewUrl = $state('');

	$effect(() => {
		ctx = canvasEl.getContext('2d');
		const url = URL.createObjectURL(imageFile);
		const img = new Image();
		img.onload = () => {
			loadedImg = img;
			// Fit the image to fill the circle initially
			const fit = Math.max((CIRCLE_R * 2) / img.width, (CIRCLE_R * 2) / img.height);
			scale = fit;
			draw();
			URL.revokeObjectURL(url);
		};
		img.src = url;

		const el = canvasEl;
		let pinchStart = 0;
		let pinchScaleStart = 1;

		const onTS = (e: TouchEvent) => {
			e.preventDefault();
			if (e.touches.length === 2) {
				pinchStart = Math.hypot(
					e.touches[1].clientX - e.touches[0].clientX,
					e.touches[1].clientY - e.touches[0].clientY
				);
				pinchScaleStart = scale;
			}
		};
		const onTM = (e: TouchEvent) => {
			e.preventDefault();
			if (e.touches.length === 2) {
				const d = Math.hypot(
					e.touches[1].clientX - e.touches[0].clientX,
					e.touches[1].clientY - e.touches[0].clientY
				);
				scale = Math.min(4, Math.max(0.5, pinchScaleStart * (d / pinchStart)));
				draw();
			}
		};
		el.addEventListener('touchstart', onTS, { passive: false });
		el.addEventListener('touchmove', onTM, { passive: false });
		return () => {
			el.removeEventListener('touchstart', onTS);
			el.removeEventListener('touchmove', onTM);
		};
	});

	function draw() {
		if (!ctx || !loadedImg) return;
		ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
		ctx.save();
		ctx.translate(CANVAS_SIZE / 2 + panX, CANVAS_SIZE / 2 + panY);
		ctx.scale(scale, scale);
		ctx.drawImage(loadedImg, -loadedImg.width / 2, -loadedImg.height / 2);
		ctx.restore();
		// Dim outside circle using even-odd fill
		ctx.save();
		ctx.fillStyle = 'rgba(0,0,0,0.55)';
		ctx.beginPath();
		ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
		ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CIRCLE_R, 0, Math.PI * 2, true);
		ctx.fill('evenodd');
		ctx.restore();
		// Circle outline
		ctx.save();
		ctx.strokeStyle = 'rgba(255,255,255,0.85)';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CIRCLE_R, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();

		// Preview reflects the actual saved output: the cropped circle region only,
		// without the dimming overlay or guide ring drawn above.
		const pv = document.createElement('canvas');
		pv.width = EXPORT_SIZE;
		pv.height = EXPORT_SIZE;
		const pvCtx = pv.getContext('2d');
		if (pvCtx) {
			renderCrop(pvCtx);
			previewUrl = pv.toDataURL('image/jpeg', 0.7);
		}
	}

	// Draw only the image, mapping the crop circle's bounding box to fill the
	// whole EXPORT_SIZE×EXPORT_SIZE output — so the saved avatar is the cropped
	// region, not the framed cropping UI (no dim overlay, no guide ring).
	function renderCrop(target: CanvasRenderingContext2D) {
		if (!loadedImg) return;
		const cropOrigin = CANVAS_SIZE / 2 - CIRCLE_R; // top-left of the circle's bbox
		const f = EXPORT_SIZE / (CIRCLE_R * 2); // bbox (280px) → export (256px)
		target.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
		target.save();
		target.translate(
			(CANVAS_SIZE / 2 + panX - cropOrigin) * f,
			(CANVAS_SIZE / 2 + panY - cropOrigin) * f
		);
		target.scale(scale * f, scale * f);
		target.drawImage(loadedImg, -loadedImg.width / 2, -loadedImg.height / 2);
		target.restore();
	}

	function handlePointerDown(e: PointerEvent) {
		isDragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		panX += e.clientX - lastX;
		panY += e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		draw();
	}

	function handlePointerUp() {
		isDragging = false;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		scale = Math.min(4, Math.max(0.5, scale - e.deltaY * 0.001));
		draw();
	}

	function handleSave() {
		const offscreen = document.createElement('canvas');
		offscreen.width = EXPORT_SIZE;
		offscreen.height = EXPORT_SIZE;
		const offCtx = offscreen.getContext('2d');
		if (offCtx) {
			renderCrop(offCtx);
		}
		// offCtx is null in some test environments; fall back to the main canvas
		const exportTarget = offCtx ? offscreen : canvasEl;
		exportTarget.toBlob((blob) => onsave(blob), 'image/jpeg', 0.9);
	}
</script>

<div class="screen">
	<AppTopBar showBack={false}>
		{#snippet left()}
			<button class="icon-btn" data-test="crop-cancel" onclick={oncancel}>
				<Icon name="chevron-left" size={22} />
			</button>
		{/snippet}
		Crop
		{#snippet right()}
			<button class="save-btn" data-test="crop-save" onclick={handleSave}>Save</button>
		{/snippet}
	</AppTopBar>

	<div class="content">
		<div class="stage">
			<canvas
				bind:this={canvasEl}
				width={CANVAS_SIZE}
				height={CANVAS_SIZE}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerUp}
				onwheel={handleWheel}
			></canvas>
			<!-- Corner hints -->
			<span class="corner top left"></span>
			<span class="corner top right"></span>
			<span class="corner bottom left"></span>
			<span class="corner bottom right"></span>
		</div>

		<p class="explainer">
			Drag to position. Pinch to zoom.<br />
			We'll save it as a 256 × 256 square — small, fast, and easy to back up.
		</p>

		<div class="preview-row">
			<span class="preview-label">Preview</span>
			<div class="preview-avatars">
				{#each [16, 28, 44] as size (size)}
					{#if previewUrl}
						<img src={previewUrl} alt="" width={size} height={size} class="preview-img" />
					{:else}
						<div class="preview-placeholder" style="width: {size}px; height: {size}px;"></div>
					{/if}
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--paper);
		color: var(--ink);
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 24px 18px;
		overflow-y: auto;
	}

	.stage {
		position: relative;
		width: 320px;
		height: 320px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
		touch-action: none;
	}

	canvas:active {
		cursor: grabbing;
	}

	.corner {
		position: absolute;
		width: 18px;
		height: 18px;
		pointer-events: none;
	}

	.corner.top {
		top: 10px;
		border-top: 2px solid rgba(255, 255, 255, 0.7);
	}

	.corner.bottom {
		bottom: 10px;
		border-bottom: 2px solid rgba(255, 255, 255, 0.7);
	}

	.corner.left {
		left: 10px;
		border-left: 2px solid rgba(255, 255, 255, 0.7);
	}

	.corner.right {
		right: 10px;
		border-right: 2px solid rgba(255, 255, 255, 0.7);
	}

	.explainer {
		margin-top: 18px;
		color: var(--ink-soft);
	}

	.preview-row {
		margin-top: 22px;
		padding: 14px 16px;
		background: var(--paper-alt);
		border-radius: 12px;
		border: 1px solid var(--rule);
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
	}

	.preview-label {
		font-size: 11px;
		color: var(--stone);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.preview-avatars {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-left: auto;
	}

	.preview-img {
		border-radius: 50%;
		object-fit: cover;
	}

	.preview-placeholder {
		border-radius: 50%;
		background: var(--stone-lt);
	}

	.icon-btn {
		background: none;
		border: none;
		padding: 4px;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.save-btn {
		padding: 8px 14px;
		border: none;
		border-radius: 10px;
		background: var(--ink);
		color: var(--paper);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
</style>
