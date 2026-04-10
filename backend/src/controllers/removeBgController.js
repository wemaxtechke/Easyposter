/**
 * POST /api/remove-bg — proxy image to remove.bg API and return the result as PNG.
 * Env: REMOVE_BG_API_KEY
 */

export async function removeBg(req, res) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Background removal is not configured. Set REMOVE_BG_API_KEY in backend/.env.' });
  }

  const file = req.file;
  if (!file?.buffer) {
    return res.status(400).json({ error: 'Missing image file (field name: image).' });
  }

  const mime = file.mimetype || '';
  if (!mime.startsWith('image/')) {
    return res.status(400).json({ error: 'File must be an image (JPEG, PNG, WebP, etc.).' });
  }

  try {
    const formData = new FormData();
    formData.append('image_file', new Blob([file.buffer], { type: file.mimetype || 'image/png' }), file.originalname || 'image.png');
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      let msg = `remove.bg API error (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.errors?.[0]?.title) msg = parsed.errors[0].title;
      } catch { /* use default */ }
      console.error('[remove-bg]', response.status, errBody.slice(0, 300));
      return res.status(502).json({ error: msg });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.set('Content-Type', 'image/png');
    res.set('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('[remove-bg]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Background removal failed' });
  }
}
