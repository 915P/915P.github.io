/*
 * ZIP 工具箱的纯逻辑层。
 *
 * 这里不碰 DOM，也不引用 zip.js：输入是从 FileEntry 取出的元数据，
 * 输出是分类结果、路径清洗、限额与可读错误。因此可以直接在 Node 里跑
 * 回归测试（scripts/zip-test.mjs），浏览器端只负责把 zip.js 的对象映射进来。
 */

export const LIMITS = {
	/** 中央目录条目上限，防止恶意压缩包把列表渲染拖死 */
	maxEntries: 10_000,
	/** 一次最多渲染多少行；超过后要求用搜索缩小范围 */
	maxRenderedEntries: 500,
	/** 单个文件解压后的上限（按中央目录声明值；实际写入还会再卡一次） */
	maxExtractEntryBytes: 512 * 1024 * 1024,
	/** 一次解压的总上限 */
	maxExtractTotalBytes: 2 * 1024 * 1024 * 1024,
	/** 一次压缩的文件数 / 总大小上限（BlobWriter 在内存里拼包） */
	maxCompressFiles: 2_000,
	maxCompressBytes: 512 * 1024 * 1024,
	/** 压缩比超过 1000:1 且解压后超过 10MB，视为可疑 */
	highRatio: 1_000,
	highRatioMinBytes: 10 * 1024 * 1024,
} as const;

export type EncodingChoice = 'auto' | 'gbk' | 'big5' | 'shift-jis';

export type UnsafeReason = 'empty' | 'absolute' | 'drive' | 'parent' | 'control';

export type EntryKind = 'folder' | 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'archive' | 'file';

export interface RawEntry {
	name: string;
	directory?: boolean;
	encrypted?: boolean;
	compressedSize?: number;
	uncompressedSize?: number;
	lastModDate?: Date;
	compressionMethod?: number;
}

export interface EntryInfo {
	/** 在原始 entries 数组里的下标，用来区分同名条目 */
	id: number;
	name: string;
	directory: boolean;
	encrypted: boolean;
	compressedSize: number;
	uncompressedSize: number;
	lastModDate?: Date;
	compressionMethod: number;
	/** 清洗后的写入路径；null 表示不安全，永远不写入磁盘 */
	safePath: string | null;
	unsafe?: UnsafeReason;
	duplicate: boolean;
	highRatio: boolean;
	kind: EntryKind;
	/** 压缩后 / 原始大小；0 表示原始大小为 0 */
	ratio: number;
}

export interface Summary {
	total: number;
	files: number;
	dirs: number;
	totalUncompressed: number;
	totalCompressed: number;
	ratio: number;
	encrypted: number;
	unsafe: number;
	duplicates: number;
	highRatio: number;
}

export interface ExtractionPlan {
	entries: EntryInfo[];
	totalBytes: number;
	skippedUnsafe: EntryInfo[];
	skippedOversize: EntryInfo[];
	error: string | null;
}

export const unsafeReasonLabel: Record<UnsafeReason, string> = {
	empty: '空文件名',
	absolute: '绝对路径',
	drive: '盘符路径',
	parent: '包含 .. 路径',
	control: '含控制字符',
};

const KIND_BY_EXT: Record<string, EntryKind> = {
	png: 'image',
	jpg: 'image',
	jpeg: 'image',
	gif: 'image',
	webp: 'image',
	avif: 'image',
	bmp: 'image',
	svg: 'image',
	heic: 'image',
	txt: 'text',
	md: 'text',
	json: 'text',
	js: 'text',
	mjs: 'text',
	ts: 'text',
	css: 'text',
	html: 'text',
	htm: 'text',
	xml: 'text',
	csv: 'text',
	log: 'text',
	yml: 'text',
	yaml: 'text',
	pdf: 'pdf',
	mp3: 'audio',
	wav: 'audio',
	flac: 'audio',
	ogg: 'audio',
	m4a: 'audio',
	aac: 'audio',
	mp4: 'video',
	mkv: 'video',
	webm: 'video',
	mov: 'video',
	avi: 'video',
	zip: 'archive',
	'7z': 'archive',
	rar: 'archive',
	tar: 'archive',
	gz: 'archive',
	bz2: 'archive',
	xz: 'archive',
};

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatPercent(value: number): string {
	if (!Number.isFinite(value) || value < 0) return '—';
	return `${Math.round(value * 100)}%`;
}

export function formatDate(date: Date | undefined): string {
	if (!date || Number.isNaN(date.getTime())) return '—';
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}`
	);
}

/**
 * 清洗 ZIP 内路径。
 *
 * 反斜杠也按分隔符处理：ZIP 规范用 `/`，但 Windows 工具偶尔写 `\`，
 * 而 `..\evil` 在 Windows 上同样能跳出目录。正确解码的 GBK 文件名不会
 * 把尾字节变成反斜杠；这里安全优先。
 */
export function sanitizePath(name: string): { safePath: string | null; reason?: UnsafeReason } {
	if (!name) return { safePath: null, reason: 'empty' };
	if (/[\u0000-\u001f\u007f]/.test(name)) return { safePath: null, reason: 'control' };

	const unified = name.replace(/\\/g, '/');
	if (unified.startsWith('/')) return { safePath: null, reason: 'absolute' };
	if (/^[A-Za-z]:/.test(unified)) return { safePath: null, reason: 'drive' };

	const trailingSlash = unified.endsWith('/');
	const parts = unified.split('/').filter((part) => part !== '' && part !== '.');
	if (parts.length === 0) return { safePath: null, reason: 'empty' };
	if (parts.some((part) => part === '..')) return { safePath: null, reason: 'parent' };

	return { safePath: parts.join('/') + (trailingSlash ? '/' : '') };
}

export function kindOf(name: string): EntryKind {
	const clean = name.replace(/\\/g, '/').replace(/\/+$/, '');
	const base = clean.slice(clean.lastIndexOf('/') + 1);
	const dot = base.lastIndexOf('.');
	const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
	return KIND_BY_EXT[ext] ?? 'file';
}

export function classifyEntries(raw: RawEntry[]): EntryInfo[] {
	const counts = new Map<string, number>();
	const paths = raw.map((entry) => {
		const result = sanitizePath(entry.name);
		const key = (result.safePath ?? entry.name).toLowerCase();
		counts.set(key, (counts.get(key) ?? 0) + 1);
		return result;
	});

	return raw.map((entry, index) => {
		const { safePath, reason } = paths[index];
		const compressedSize = Math.max(0, entry.compressedSize ?? 0);
		const uncompressedSize = Math.max(0, entry.uncompressedSize ?? 0);
		const directory = Boolean(entry.directory) || /[\\/]$/.test(entry.name);
		const ratio = uncompressedSize > 0 ? compressedSize / uncompressedSize : 0;
		const highRatio =
			!directory &&
			uncompressedSize >= LIMITS.highRatioMinBytes &&
			uncompressedSize / Math.max(1, compressedSize) >= LIMITS.highRatio;
		const key = (safePath ?? entry.name).toLowerCase();

		return {
			id: index,
			name: entry.name,
			directory,
			encrypted: Boolean(entry.encrypted),
			compressedSize,
			uncompressedSize,
			lastModDate: entry.lastModDate,
			compressionMethod: entry.compressionMethod ?? 0,
			safePath,
			unsafe: reason,
			duplicate: (counts.get(key) ?? 0) > 1,
			highRatio,
			kind: directory ? 'folder' : kindOf(entry.name),
			ratio,
		};
	});
}

export function summarize(entries: EntryInfo[]): Summary {
	let files = 0;
	let dirs = 0;
	let totalUncompressed = 0;
	let totalCompressed = 0;
	let encrypted = 0;
	let unsafe = 0;
	let duplicates = 0;
	let highRatio = 0;

	for (const entry of entries) {
		if (entry.directory) dirs++;
		else files++;
		totalUncompressed += entry.uncompressedSize;
		totalCompressed += entry.compressedSize;
		if (entry.encrypted) encrypted++;
		if (entry.unsafe) unsafe++;
		if (entry.duplicate) duplicates++;
		if (entry.highRatio) highRatio++;
	}

	return {
		total: entries.length,
		files,
		dirs,
		totalUncompressed,
		totalCompressed,
		ratio: totalUncompressed > 0 ? totalCompressed / totalUncompressed : 0,
		encrypted,
		unsafe,
		duplicates,
		highRatio,
	};
}

export function filterEntries(entries: EntryInfo[], query: string): EntryInfo[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return entries;
	return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
}

export function renderWindow(
	entries: EntryInfo[],
	query: string,
	limit = LIMITS.maxRenderedEntries,
): { items: EntryInfo[]; matched: number; truncated: boolean } {
	const matched = filterEntries(entries, query);
	return {
		items: matched.slice(0, limit),
		matched: matched.length,
		truncated: matched.length > limit,
	};
}

export function validateLoad(raw: RawEntry[]): string | null {
	if (raw.length > LIMITS.maxEntries) {
		return `压缩包条目过多（${raw.length} 项），上限 ${LIMITS.maxEntries} 项`;
	}
	return null;
}

export function validateCompressionInput(files: { name: string; size: number }[]): string | null {
	if (files.length === 0) return '请先选择要压缩的文件';
	if (files.length > LIMITS.maxCompressFiles) {
		return `文件太多（${files.length} 个），最多 ${LIMITS.maxCompressFiles} 个`;
	}
	const total = files.reduce((sum, file) => sum + Math.max(0, file.size), 0);
	if (total > LIMITS.maxCompressBytes) {
		return `文件总大小 ${formatBytes(total)}，超过 ${formatBytes(LIMITS.maxCompressBytes)} 上限`;
	}
	return null;
}

export function makeUniqueName(name: string, used: Set<string>): string {
	const normalized = name.replace(/\/+$/, '');
	const slash = normalized.lastIndexOf('/');
	const dir = slash >= 0 ? normalized.slice(0, slash + 1) : '';
	const base = slash >= 0 ? normalized.slice(slash + 1) : normalized;
	const dot = base.lastIndexOf('.');
	const stem = dot > 0 ? base.slice(0, dot) : base;
	const ext = dot > 0 ? base.slice(dot) : '';

	let candidate = `${dir}${base}`;
	let n = 2;
	while (used.has(candidate.toLowerCase())) {
		candidate = `${dir}${stem} (${n})${ext}`;
		n++;
	}
	used.add(candidate.toLowerCase());
	return candidate;
}

/** 把输入文件名变成可安全写进 ZIP 的路径；异常名字退化成最后一段 */
export function normalizeInputName(name: string): string {
	const result = sanitizePath(name);
	if (result.safePath) return result.safePath;
	const base = name.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'file';
	const safe = base.replace(/\.\./g, '_').replace(/^[A-Za-z]:/, '').trim();
	return safe || 'file';
}

export function assignUniqueNames(names: string[]): string[] {
	const used = new Set<string>();
	return names.map((name) => makeUniqueName(normalizeInputName(name), used));
}

export function normalizeArchiveName(name: string): string {
	const cleaned = name
		.trim()
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
		.replace(/\.zip$/i, '')
		.replace(/[. ]+$/, '')
		.trim()
		.slice(0, 120);
	return `${cleaned || 'archive'}.zip`;
}

export function encodingFor(choice: string): string | undefined {
	if (choice === 'gbk' || choice === 'big5' || choice === 'shift-jis') return choice;
	return undefined;
}

export function planExtraction(
	entries: EntryInfo[],
	selected: Iterable<number>,
	limits = LIMITS,
): ExtractionPlan {
	const ids = new Set(selected);
	const chosen = entries.filter((entry) => ids.has(entry.id));
	const skippedUnsafe = chosen.filter((entry) => !entry.safePath);
	const skippedOversize: EntryInfo[] = [];
	const accepted: EntryInfo[] = [];
	let totalBytes = 0;

	for (const entry of chosen) {
		if (!entry.safePath) continue;
		if (!entry.directory && entry.uncompressedSize > limits.maxExtractEntryBytes) {
			skippedOversize.push(entry);
			continue;
		}
		totalBytes += entry.directory ? 0 : entry.uncompressedSize;
		accepted.push(entry);
	}

	let error: string | null = null;
	if (accepted.length === 0) {
		error = '没有可解压的条目';
	} else if (totalBytes > limits.maxExtractTotalBytes) {
		error = `解压后约 ${formatBytes(totalBytes)}，超过上限 ${formatBytes(limits.maxExtractTotalBytes)}`;
	}

	return { entries: accepted, totalBytes, skippedUnsafe, skippedOversize, error };
}

export function isPasswordError(error: unknown): boolean {
	const value = error as { code?: string; message?: string } | undefined;
	return (
		value?.code === 'ERR_INVALID_PASSWORD' ||
		value?.code === 'ERR_ENCRYPTED' ||
		/password|encrypted entry/i.test(String(value?.message ?? error ?? ''))
	);
}

export function describeError(error: unknown): string {
	const value = error as { code?: string; message?: string } | undefined;
	const code = String(value?.code ?? '');
	const message = String(value?.message ?? error ?? '');

	switch (code) {
		case 'ERR_INVALID_PASSWORD':
			return '密码不正确，请重试';
		case 'ERR_ENCRYPTED':
			return '该条目已加密，需要密码';
		case 'ERR_UNSAFE_FILENAME':
			return '压缩包包含不安全的文件路径';
		case 'ERR_UNSUPPORTED_COMPRESSION':
			return '压缩包使用了当前不支持的压缩算法';
		case 'ERR_ABORTED':
			return '操作已取消';
		case 'ERR_EOCDR_NOT_FOUND':
			return '不是有效的 ZIP 文件';
		case 'ERR_ENCRYPTED_CENTRAL_DIRECTORY':
			return '该压缩包加密了中央目录，暂不支持';
		default:
			break;
	}

	if (/password/i.test(message)) return '密码不正确，请重试';
	if (/encrypted entry/i.test(message)) return '该条目已加密，需要密码';
	if (/unsafe filename/i.test(message)) return '压缩包包含不安全的文件路径';
	if (/end of central directory|not a zip|invalid zip/i.test(message)) return '不是有效的 ZIP 文件';
	if (/compression method|unsupported compression/i.test(message)) {
		return '压缩包使用了当前不支持的压缩算法';
	}
	if (/abort/i.test(message)) return '操作已取消';
	return message || '操作失败';
}