import fs from 'fs';
import { HDR_DIR } from '../config/paths.js';

export function listHdrs(_req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const files = fs.readdirSync(HDR_DIR, { withFileTypes: true });
    const hdrs = files
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.hdr'))
      .map((d) => {
        const name = d.name.replace(/\.hdr$/i, '');
        const label = name
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return { id: name, label, path: `/hdr/${d.name}` };
      });
    res.json(hdrs);
  } catch (e) {
    console.error('Failed to read HDR directory', e);
    res.json([]);
  }
}
