import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(__dirname, "../fiction/lost-poem");
const CONTENT_DIR = path.join(__dirname, "content");

function naturalCompare(a, b) {
	return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

function extractTitleAndBody(rawMarkdown, fallbackId) {
	const normalized = rawMarkdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
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

	const body = lines.slice(bodyStart).join("\n").trim();
	return { title, body };
}

async function prepare() {
	const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
	const chapterFiles = entries
		.filter(
			(e) =>
				e.isFile() &&
				e.name.endsWith(".md") &&
				e.name.toLowerCase() !== "readme.md",
		)
		.map((e) => e.name)
		.sort(naturalCompare);

	await fs.rm(CONTENT_DIR, { recursive: true, force: true });
	await fs.mkdir(CONTENT_DIR, { recursive: true });

	const summaryLines = ["# Summary", ""];
	const chapters = [];

	for (const fileName of chapterFiles) {
		const id = path.basename(fileName, ".md");
		const raw = await fs.readFile(path.join(SOURCE_DIR, fileName), "utf8");
		const { title, body } = extractTitleAndBody(raw, id);
		const charCount = body.replace(/\s+/g, "").length;

		const contentWithFrontmatter = `---\ntitle: ${title}\ncharCount: ${charCount}\n---\n\n${body
			.split(/\n+/)
			.map((line) => line.trimEnd())
			.filter(Boolean)
			.join("\n\n")}\n`;
		await fs.writeFile(
			path.join(CONTENT_DIR, fileName),
			contentWithFrontmatter,
			"utf8",
		);

		summaryLines.push(`- [${title}](./${fileName})`);
		chapters.push({ id, title, fileName, charCount });
	}

	await fs.writeFile(
		path.join(CONTENT_DIR, "SUMMARY.md"),
		`${summaryLines.join("\n")}\n`,
		"utf8",
	);

	const totalChars = chapters.reduce((sum, c) => sum + c.charCount, 0);
	const firstTarget = chapters[0] ? `${chapters[0].id}.html` : "#";
	const chapterCardsHtml = chapters
		.map(
			(c, idx) =>
				`<a class="cover-chap-item" href="${c.id}.html"><span class="cover-chap-idx">${String(idx + 1).padStart(2, "0")}</span><span class="cover-chap-title">${c.title}</span><span class="cover-chap-chars">${c.charCount} 字</span></a>`,
		)
		.join("\n\t\t\t\t");

	const indexHtml = `<!DOCTYPE html>
<html lang="zh">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Lost Poem · 电子书阅读器</title>
	<link rel="stylesheet" href="styles/reader.css" />
	<style>
		html, body {
			height: auto;
			min-height: 100%;
			overflow-y: auto;
		}
		.cover-page {
			min-height: 100vh;
			max-width: 760px;
			margin: 0 auto;
			padding: 64px 28px 72px;
			display: flex;
			flex-direction: column;
			justify-content: center;
			font-family: var(--font-serif);
		}
		.cover-hero {
			padding: 40px 36px;
			border: 1px solid var(--border);
			border-radius: 16px;
			background: var(--bg-elevated);
			box-shadow: 0 12px 36px rgba(0, 0, 0, 0.05);
		}
		.cover-kicker {
			font-family: var(--font-sans);
			font-size: 12px;
			letter-spacing: 0.18em;
			text-transform: uppercase;
			color: var(--accent);
			margin: 0 0 14px;
		}
		.cover-title {
			font-size: clamp(2.2rem, 5vw, 3.2rem);
			font-weight: 600;
			line-height: 1.2;
			margin: 0 0 12px;
			letter-spacing: 0.03em;
		}
		.cover-sub {
			margin: 0 0 24px;
			font-size: 15px;
			color: var(--text-muted);
			line-height: 1.8;
		}
		.cover-stats {
			display: flex;
			gap: 20px;
			flex-wrap: wrap;
			font-family: var(--font-sans);
			font-size: 13px;
			color: var(--text-muted);
			margin-bottom: 28px;
			padding-bottom: 24px;
			border-bottom: 1px solid var(--border);
		}
		.cover-actions {
			display: flex;
			gap: 12px;
			flex-wrap: wrap;
		}
		.cover-btn {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 10px 20px;
			border-radius: 8px;
			font-family: var(--font-sans);
			font-size: 14px;
			text-decoration: none;
			border: 1px solid var(--border);
			color: var(--text);
			background: transparent;
			transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
		}
		.cover-btn:hover {
			color: var(--hover-text);
			background: var(--hover-bg);
			border-color: var(--accent);
		}
		.cover-btn-primary {
			background: var(--accent);
			border-color: var(--accent);
			color: #fff;
		}
		.cover-btn-primary:hover {
			color: #fff;
			background: var(--hover-text);
		}
		.cover-toc {
			margin-top: 32px;
		}
		.cover-toc-title {
			font-family: var(--font-sans);
			font-size: 13px;
			color: var(--text-muted);
			letter-spacing: 0.08em;
			margin: 0 0 12px 4px;
		}
		.cover-chap-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
			gap: 10px;
		}
		.cover-chap-item {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 11px 14px;
			border: 1px solid var(--border);
			border-radius: 10px;
			background: var(--bg-elevated);
			color: var(--text);
			text-decoration: none;
			font-family: var(--font-sans);
			font-size: 14px;
			transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
		}
		.cover-chap-item:hover {
			color: var(--hover-text);
			background: var(--hover-bg);
			border-color: var(--accent);
		}
		.cover-chap-idx {
			font-size: 12px;
			color: var(--text-muted);
			font-variant-numeric: tabular-nums;
		}
		.cover-chap-title {
			flex: 1;
			font-weight: 500;
		}
		.cover-chap-chars {
			font-size: 12px;
			color: var(--text-muted);
		}
	</style>
</head>
<body data-theme="paper">
	<main class="cover-page">
		<section class="cover-hero">
			<p class="cover-kicker">Quiet Pages · Fiction</p>
			<h1 class="cover-title">Lost Poem</h1>
			<p class="cover-sub">在静谧的雨声与诗行之间阅读。支持翻页排版、划线批注与本地笔记导出。</p>
			<div class="cover-stats">
				<span>共 ${chapters.length} 章</span>
				<span>约 ${totalChars.toLocaleString("en-US")} 字</span>
			</div>
			<div class="cover-actions">
				<a class="cover-btn cover-btn-primary" href="${firstTarget}">开始阅读</a>
				<a id="btn-resume" class="cover-btn hidden" href="#">继续上次阅读</a>
			</div>
		</section>

		<section class="cover-toc">
			<h2 class="cover-toc-title">章节目录</h2>
			<div class="cover-chap-grid">
				${chapterCardsHtml}
			</div>
		</section>
	</main>
	<script>
		try {
			const saved = JSON.parse(localStorage.getItem('lost-poem-reader:v1') || '{}');
			if (saved.settings && saved.settings.theme) {
				document.body.dataset.theme = saved.settings.theme;
			}
			const params = new URLSearchParams(location.search);
			const wantCover = params.get('cover') === '1';
			if (saved.progress && saved.progress.chapterUrl && saved.progress.chapterId !== 'index') {
				if (!wantCover) {
					location.replace(saved.progress.chapterUrl);
				} else {
					const btn = document.getElementById('btn-resume');
					btn.href = saved.progress.chapterUrl;
					btn.textContent = '继续阅读 · ' + (saved.progress.chapterId || '');
					btn.classList.remove('hidden');
				}
			}
		} catch {}
	</script>
</body>
</html>
`;
	await fs.writeFile(path.join(CONTENT_DIR, "index.html"), indexHtml, "utf8");

	for (const assetDir of ["styles", "scripts"])
		await fs.cp(
			path.join(__dirname, path.join(CONTENT_DIR, assetDir)),
			destAsset,
			{ recursive: true },
		);

	await fs.copyFile(
		path.join(__dirname, "404.html"),
		path.join(CONTENT_DIR, "404.html"),
	);

	console.log(`Prepared ${chapters.length} chapters in ${CONTENT_DIR}`);
}

await prepare();
