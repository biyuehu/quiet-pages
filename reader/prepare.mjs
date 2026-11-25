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

	return { title, body: lines.slice(bodyStart).join("\n").trim() };
}

/**
 * Strip common Markdown syntax and count visible non-whitespace characters.
 */
function countChars(markdown) {
	const plain = markdown
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/```[\s\S]*?```/g, (m) => m.replace(/```[^\n]*\n?|```/g, ""))
		.replace(/`([^`]*)`/g, "$1")
		.replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm, "")
		.replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/gm, "")
		.replace(/[*_~]+/g, "")
		.replace(/<[^>]+>/g, "");
	return plain.replace(/\s+/g, "").length;
}

async function prepare() {
	const chapterFiles = (await fs.readdir(SOURCE_DIR, { withFileTypes: true }))
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
		const { title, body } = extractTitleAndBody(
			await fs.readFile(path.join(SOURCE_DIR, fileName), "utf8"),
			id,
		);
		const charCount = countChars(body);

		await fs.writeFile(
			path.join(CONTENT_DIR, fileName),
			`---\ntitle: ${title}\ncharCount: ${charCount}\n---\n\n${body
				.split(/\n+/)
				.map((line) => line.trimEnd())
				.filter(Boolean)
				.join("\n\n")}\n`,
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

	const groups = new Map();
	for (const c of chapters) {
		const m = /^([A-Za-z])(\d+)$/.exec(c.id);
		const groupKey = m ? m[1].toUpperCase() : "其他";
		if (!groups.has(groupKey)) groups.set(groupKey, []);
		groups.get(groupKey).push(c);
	}

	const chapterGroupsHtml = Array.from(groups.entries())
		.map(([groupKey, items]) => {
			const cards = items
				.map(
					(c) =>
						/* html */ `<a class="cover-chap-item" href="${c.id}.html"><span class="cover-chap-title">${c.title}</span><span class="cover-chap-chars">${c.charCount} 字</span></a>`,
				)
				.join("\n\t\t\t\t\t");
			return /* html */ `<div class="cover-group">
				<div class="cover-group-head">
					<span class="cover-group-tag">${groupKey}</span>
					<span class="cover-group-count">${items.length} 节</span>
				</div>
				<div class="cover-chap-grid">
					${cards}
				</div>
			</div>`;
		})
		.join("\n\t\t\t");

	const indexHtml = /* html */ `<!DOCTYPE html>
<html lang="zh">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Lost Poem · 电子书阅读器</title>
	<link rel="icon" href="favicon.svg" type="image/svg+xml" />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" />
	<link rel="stylesheet" href="styles/reader.css" />
	<link rel="stylesheet" href="styles/cover.css" />
</head>
<body data-theme="paper">
	<main class="cover-page">
		<section class="cover-hero">
			<div class="cover-top-row">
				<p class="cover-kicker">Quiet Pages · Fiction</p>
				<span class="cover-status"><span class="cover-status-dot"></span>持续更新中</span>
			</div>
			<h1 class="cover-title">Lost Poem</h1>
			<div class="cover-ornament" aria-hidden="true">✦</div>
			<p class="cover-sub">在静谧的雨声与诗行之间阅读。支持翻页排版、划线批注与本地笔记导出。</p>
			<div class="cover-stats">
				<span>共 ${chapters.length} 节</span>
				<span>约 ${totalChars.toLocaleString("en-US")} 字</span>
			</div>
			<div class="cover-actions">
				<a class="cover-btn cover-btn-primary" href="${firstTarget}">开始阅读</a>
				<a id="btn-resume" class="cover-btn hidden" href="#">继续上次阅读</a>
			</div>
		</section>

		<section class="cover-toc">
			<h2 class="cover-toc-title">章节目录</h2>
			${chapterGroupsHtml}
		</section>
	</main>
	<script src="scripts/cover.js"></script>
</body>
</html>
`;
	await fs.writeFile(path.join(CONTENT_DIR, "index.html"), indexHtml, "utf8");

	for (const assetDir of ["styles", "scripts"])
		await fs.cp(
			path.join(__dirname, assetDir),
			path.join(CONTENT_DIR, assetDir),
			{ recursive: true },
		);

	await fs.copyFile(
		path.join(__dirname, "404.html"),
		path.join(CONTENT_DIR, "404.html"),
	);
	await fs.copyFile(
		path.join(__dirname, "favicon.svg"),
		path.join(CONTENT_DIR, "favicon.svg"),
	);

	console.log(`Prepared ${chapters.length} chapters in ${CONTENT_DIR}`);
}

await prepare();
