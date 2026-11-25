try {
	const saved = JSON.parse(localStorage.getItem("lost-poem-reader:v1") ?? "{}");
	if (saved.settings?.theme) document.body.dataset.theme = saved.settings.theme;
	const isBackForward =
		performance.getEntriesByType?.("navigation")?.[0]?.type === "back_forward";
	const p = saved.progress;
	if (p?.chapterUrl && p.chapterId !== "index") {
		if (p.isCover === false && !isBackForward) {
			location.replace(p.chapterUrl);
		} else {
			if (isBackForward && p.isCover === false) {
				p.isCover = true;
				localStorage.setItem("lost-poem-reader:v1", JSON.stringify(saved));
			}
			const btn = document.getElementById("btn-resume");
			if (btn) {
				btn.href = p.chapterUrl;
				btn.textContent = `继续阅读 · ${p.chapterId || ""}`;
				btn.classList.remove("hidden");
			}
		}
	}
} catch {
	// Ignore malformed storage
}
