import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(__dirname, '../fiction/lost-poem');
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon'
};

marked.setOptions({
	gfm: true,
	breaks: false
});

function naturalCompare(a, b) {
	return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

function extractTitleAndBody(rawMarkdown, fallbackId) {
	const normalized = rawMarkdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');
	let title = fallbackId;
	let bodyStart = 0;

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed) continue;
		const match = /^#\s+(.+)$/.exec(trimmed);
		if (match) {
			title = match[1].trim();
			bodyStart = i + 1;
		}
		break;
	}

	const body = lines.slice(bodyStart).join('\n').trim();
	return { title, body };
}

function countChars(text) {
	return text.replace(/\s+/g, '').length;
}

async function build() {
	const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
	const chapterFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'readme.md')
		.map((entry) => entry.name)
		.sort(naturalCompare);

	await fs.rm(DIST_DIR, { recursive: true, force: true });
	await fs.mkdir(path.join(DIST_DIR, 'data', 'chapters'), { recursive: true });

	const manifest = {
		bookTitle: 'Lost Poem',
		generatedAt: new Date().toISOString(),
		chapters: []
	};

	for (let index = 0; index < chapterFiles.length; index++) {
		const fileName = chapterFiles[index];
		const id = path.basename(fileName, '.md');
		const raw = await fs.readFile(path.join(SOURCE_DIR, fileName), 'utf8');
		const { title, body } = extractTitleAndBody(raw, id);
		const html = marked.parse(body);
		const charCount = countChars(body);
		const groupMatch = /^([A-Za-z]+)/.exec(id);
		const group = groupMatch ? groupMatch[1].toUpperCase() : 'OTHER';

		manifest.chapters.push({
			id,
			title,
			group,
			index,
			charCount
		});

		await fs.writeFile(
			path.join(DIST_DIR, 'data', 'chapters', `${id}.json`),
			JSON.stringify({ id, title, group, index, charCount, html }),
			'utf8'
		);
	}

	await fs.writeFile(
		path.join(DIST_DIR, 'data', 'manifest.json'),
		JSON.stringify(manifest, null, 2),
		'utf8'
	);

	const staticFiles = await fs.readdir(SRC_DIR);
	for (const file of staticFiles) {
		await fs.copyFile(path.join(SRC_DIR, file), path.join(DIST_DIR, file));
	}

	console.log(`Built ${manifest.chapters.length} chapters into ${DIST_DIR}`);
}

function startServer(port = 4173) {
	const server = http.createServer(async (req, res) => {
		try {
			const reqPath = (req.url || '/').split('?')[0];
			const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
			let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);

			let stat;
			try {
				stat = await fs.stat(filePath);
				if (stat.isDirectory()) {
					filePath = path.join(filePath, 'index.html');
				}
			} catch {
				filePath = path.join(DIST_DIR, 'index.html');
			}

			const ext = path.extname(filePath).toLowerCase();
			const content = await fs.readFile(filePath);
			res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
			res.end(content);
		} catch (err) {
			res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end(`Server error: ${err.message}`);
		}
	});

	server.listen(port, () => {
		console.log(`Lost Poem Reader preview: http://localhost:${port}`);
	});
}

await build();

if (process.argv.includes('--serve')) {
	startServer();
}
