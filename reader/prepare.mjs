import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(__dirname, '../fiction/lost-poem');
const CONTENT_DIR = path.join(__dirname, 'content');

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

async function prepare() {
	const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
	const chapterFiles = entries
		.filter((e) => e.isFile() && e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md')
		.map((e) => e.name)
		.sort(naturalCompare);

	await fs.rm(CONTENT_DIR, { recursive: true, force: true });
	await fs.mkdir(CONTENT_DIR, { recursive: true });

	const summaryLines = ['# Summary', ''];
	const chapters = [];

	for (const fileName of chapterFiles) {
		const id = path.basename(fileName, '.md');
		const raw = await fs.readFile(path.join(SOURCE_DIR, fileName), 'utf8');
		const { title, body } = extractTitleAndBody(raw, id);
		const charCount = body.replace(/\s+/g, '').length;

		const contentWithFrontmatter = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ncharCount: ${charCount}\n---\n\n${body}\n`;
		await fs.writeFile(path.join(CONTENT_DIR, fileName), contentWithFrontmatter, 'utf8');

		summaryLines.push(`- [${title}](./${fileName})`);
		chapters.push({ id, title, fileName, charCount });
	}

	await fs.writeFile(path.join(CONTENT_DIR, 'SUMMARY.md'), summaryLines.join('\n') + '\n', 'utf8');

	const firstTarget = chapters[0] ? `${chapters[0].id}.html` : '';
	const indexMd = `---\ntitle: "Lost Poem"\n---\n\n正在进入阅读…\n\n${firstTarget ? `[开始阅读：${chapters[0].title}](./${chapters[0].fileName})` : ''}\n`;
	await fs.writeFile(path.join(CONTENT_DIR, 'index.md'), indexMd, 'utf8');

	for (const assetDir of ['styles', 'scripts']) {
		const srcAsset = path.join(__dirname, assetDir);
		const destAsset = path.join(CONTENT_DIR, assetDir);
		await fs.cp(srcAsset, destAsset, { recursive: true });
	}

	console.log(`Prepared ${chapters.length} chapters in ${CONTENT_DIR}`);
}

await prepare();
