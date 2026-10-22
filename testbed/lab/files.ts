// Lab · Files: uploads (single, multiple, dropzone, image preview) and a download
// whose contents you have to read.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { h } from '../lib/html.ts';
import { get, send } from '../lib/http.ts';
import { lab } from './kit.ts';

lab('files', [
  {
    slug: 'single-upload', title: 'Upload a text file', task: 'Upload any .txt file with the file picker and press Upload.', check: 'auto', needs: ['upload', 'click'], level: 2,
    body: h`<form id="one"><label for="one-file">Notes file (.txt)</label><input type="file" id="one-file" accept=".txt,text/plain"><button type="submit">Upload</button></form><p class="muted" id="one-state"></p>`,
  },
  {
    slug: 'multi-upload', title: 'Exactly two images', task: 'Upload exactly two image files at once, then press Upload photos.', check: 'auto', needs: ['upload', 'click'], level: 2,
    body: h`<form id="multi"><label for="multi-file">Trip photos (images, up to 3)</label><input type="file" id="multi-file" accept="image/*" multiple><ul class="file-list" id="multi-list"></ul><button type="submit">Upload photos</button></form><p class="muted" id="multi-state"></p>`,
  },
  {
    slug: 'dropzone', title: 'Drop zone only', task: 'Drop a file onto the drop zone.', check: 'auto', needs: ['drag', 'upload'], level: 3,
    note: 'There is no file picker button; the input is display:none.',
    body: h`<div class="dropzone big" id="dz"><p>Drop your GPX track here</p><input type="file" id="dz-input" hidden></div><p class="muted" id="dz-state"></p>`,
  },
  {
    slug: 'avatar', title: 'Upload with preview', task: 'Upload an image as the profile picture, check the preview appears, and press Save picture.', check: 'auto', needs: ['upload', 'click'], level: 2,
    body: h`<div class="avatar-row"><div class="avatar big" id="av-preview">?</div><div><label for="av-file">Profile picture</label><input type="file" id="av-file" accept="image/*"></div></div>
      <div class="form-actions"><button type="button" id="av-save" disabled>Save picture</button></div>`,
  },
  {
    slug: 'download-read', title: 'Read a downloaded file', task: 'Download the trail map and submit the summit elevation written in it, in metres, in the Answer box.', check: 'answer', needs: ['download', 'read', 'type'], level: 2,
    answer: 2914, note: 'The file is served as an attachment, so it downloads instead of opening in the tab.',
    body: h`<p>The trail map is available as a text file.</p><p><a class="button secondary" href="/lab/files/trail-map.txt" download>Download trail map (.txt)</a></p>`,
  },
]);

const MAP = readFileSync(fileURLToPath(new URL('../public/files/trail-map.txt', import.meta.url)));
get('/lab/files/trail-map.txt', (req) => send(req, 200, MAP, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="trail-map.txt"' }));
