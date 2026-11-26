/**
 * 邮件头解析与本地检查（纯逻辑，不依赖 DOM）。
 *
 * 设计边界：
 * - 只分析邮件头，不解析正文、附件与 MIME 结构，因此不需要引入 MIME 库。
 * - Authentication-Results / Received-SPF 是接收方写入的“声明”，本工具不联网、
 *   不做 DNS 查询，也不做 DKIM 签名验算。
 * - 所有判断都是启发式规则，结果只能作为核对线索，不能证明邮件安全。
 */

export const MAX_HEADER_BYTES = 2 * 1024 * 1024;

export type MailParseErrorCode = 'empty' | 'too-large' | 'not-headers';

export class MailParseError extends Error {
	readonly code: MailParseErrorCode;

	constructor(code: MailParseErrorCode, message: string) {
		super(message);
		this.name = 'MailParseError';
		this.code = code;
	}
}

export interface HeaderField {
	name: string;
	key: string;
	value: string;
	decoded: string;
	line: number;
	raw: string;
}

export interface MailAddress {
	name: string;
	address: string;
	raw: string;
}

export interface ParsedDate {
	date: Date | null;
	zone: string;
	zoneKnown: boolean;
	raw: string;
}

export interface HeaderIssue {
	line: number;
	message: string;
}

export interface ParsedHeaders {
	fields: HeaderField[];
	byKey: Record<string, HeaderField[]>;
	from: MailAddress | null;
	fromAll: MailAddress[];
	to: MailAddress[];
	cc: MailAddress[];
	bcc: MailAddress[];
	replyTo: MailAddress[];
	sender: MailAddress | null;
	returnPath: string;
	subject: string;
	date: ParsedDate;
	messageId: string;
	inReplyTo: string;
	references: string[];
	issues: HeaderIssue[];
	headerOnly: boolean;
	bytes: number;
	lines: number;
	duplicateKeys: string[];
}

export type CheckLevel = 'high' | 'warn' | 'info' | 'ok';

export interface CheckItem {
	id: string;
	level: CheckLevel;
	title: string;
	detail: string;
}

export interface AuthRecord {
	method: string;
	result: string;
	detail: string;
	source: 'authentication-results' | 'received-spf';
}

export interface AuthBadge {
	method: 'spf' | 'dkim' | 'dmarc' | 'arc';
	result: string;
	detail: string;
	count: number;
}

export interface DkimSignature {
	domain: string;
	selector: string;
	algorithm: string;
	identity: string;
	raw: string;
}

export type AuthOverall = 'pass' | 'partial' | 'fail' | 'none';

export interface AuthSummary {
	records: AuthRecord[];
	badges: AuthBadge[];
	overall: AuthOverall;
	authServIds: string[];
	dkimSignatures: DkimSignature[];
	arcSeals: number;
}

export interface ReceivedHop {
	/** 原始顺序，1 = 最上面（离收件人最近） */
	index: number;
	/** 按时间排序后的序号，1 = 最早 */
	chronological: number;
	raw: string;
	fromNode: string;
	fromHost: string;
	byNode: string;
	byHost: string;
	protocol: string;
	forNode: string;
	ips: string[];
	date: ParsedDate;
	delayMs: number | null;
}

export interface MailVerdict {
	level: 'high' | 'warn' | 'ok';
	title: string;
	detail: string;
	highCount: number;
	warnCount: number;
	infoCount: number;
	okCount: number;
}

export interface MailAnalysis {
	parsed: ParsedHeaders;
	auth: AuthSummary;
	received: ReceivedHop[];
	checks: CheckItem[];
	verdict: MailVerdict;
	generatedAt: Date;
}

const MONTHS: Record<string, number> = {
	jan: 0,
	feb: 1,
	mar: 2,
	apr: 3,
	may: 4,
	jun: 5,
	jul: 6,
	aug: 7,
	sep: 8,
	oct: 9,
	nov: 10,
	dec: 11,
};

const ZONE_MINUTES: Record<string, number> = {
	ut: 0,
	utc: 0,
	gmt: 0,
	z: 0,
	est: -300,
	edt: -240,
	cst: -360,
	cdt: -300,
	mst: -420,
	mdt: -360,
	pst: -480,
	pdt: -420,
};

const EMAIL_BODY = String.raw`[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)`;
const EMAIL_RE = new RegExp(EMAIL_BODY);
const EMAIL_GLOBAL_RE = new RegExp(EMAIL_BODY, 'g');
const IPV4_GLOBAL_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const BRACKET_IPV6_GLOBAL_RE = /\[[0-9A-Fa-f:]*:[0-9A-Fa-f:.]*\]/g;

const CHARSET_ALIASES: Record<string, string> = {
	utf8: 'utf-8',
	'utf-8': 'utf-8',
	usascii: 'windows-1252',
	'us-ascii': 'windows-1252',
	ascii: 'windows-1252',
	gb2312: 'gbk',
	'gb_2312-80': 'gbk',
	csgb2312: 'gbk',
	gbk: 'gbk',
	gb18030: 'gb18030',
	big5: 'big5',
	'big-5': 'big5',
	cp950: 'big5',
	shiftjis: 'shift_jis',
	'shift_jis': 'shift_jis',
	'shift-jis': 'shift_jis',
	sjis: 'shift_jis',
	'x-sjis': 'shift_jis',
	cp932: 'shift_jis',
	'iso-2022-jp': 'iso-2022-jp',
	'euc-jp': 'euc-jp',
	'euc-kr': 'euc-kr',
	'ks_c_5601-1987': 'euc-kr',
	'ks_c_5601': 'euc-kr',
	cp949: 'euc-kr',
	'iso-8859-1': 'iso-8859-1',
	latin1: 'iso-8859-1',
	'latin-1': 'iso-8859-1',
	'windows-1252': 'windows-1252',
	cp1252: 'windows-1252',
	'windows-1251': 'windows-1251',
	'koi8-r': 'koi8-r',
};

function normalizeCharset(charset: string): string {
	const base = charset.toLowerCase().split('*')[0].trim();
	return CHARSET_ALIASES[base] ?? base;
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
	try {
		return new TextDecoder(normalizeCharset(charset), { fatal: false }).decode(bytes);
	} catch {
		try {
			return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			return new TextDecoder('windows-1252').decode(bytes);
		}
	}
}

function base64Bytes(input: string): Uint8Array | null {
	const compact = input.replace(/\s+/g, '');
	if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
	try {
		const binary = atob(compact);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

function qBytes(input: string): Uint8Array {
	const bytes: number[] = [];
	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (char === '_') {
			bytes.push(0x20);
			continue;
		}
		if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(input.slice(i + 1, i + 3))) {
			bytes.push(parseInt(input.slice(i + 1, i + 3), 16));
			i += 2;
			continue;
		}
		const code = char.charCodeAt(0);
		if (code < 0x80) {
			bytes.push(code);
		} else {
			bytes.push(...new TextEncoder().encode(char));
		}
	}
	return Uint8Array.from(bytes);
}

function decodeWord(charset: string, encoding: string, payload: string): string {
	const bytes = encoding.toLowerCase() === 'b' ? base64Bytes(payload) : qBytes(payload);
	if (!bytes) return `=?${charset}?${encoding}?${payload}?=`;
	return decodeBytes(bytes, charset);
}

/**
 * 解码 RFC 2047 编码字。两个相邻编码字之间的空白按标准丢弃。
 */
export function decodeEncodedWords(value: string): string {
	const re = /=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g;
	let result = '';
	let last = 0;
	let previousWasWord = false;
	for (const match of value.matchAll(re)) {
		const index = match.index ?? 0;
		const gap = value.slice(last, index);
		if (!(previousWasWord && /^\s*$/.test(gap))) result += gap;
		result += decodeWord(match[1], match[2], match[3]);
		previousWasWord = true;
		last = index + match[0].length;
	}
	result += value.slice(last);
	return result;
}

function splitTopLevel(value: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let quote = false;
	let angle = 0;
	let paren = 0;
	for (let i = 0; i < value.length; i++) {
		const char = value[i];
		if (char === '\\' && quote) {
			i++;
			continue;
		}
		if (char === '"') {
			quote = !quote;
			continue;
		}
		if (quote) continue;
		if (char === '(') paren++;
		else if (char === ')' && paren > 0) paren--;
		else if (char === '<') angle++;
		else if (char === '>' && angle > 0) angle--;
		else if (char === ',' && angle === 0 && paren === 0) {
			parts.push(value.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(value.slice(start));
	return parts;
}

function expandGroup(value: string): string {
	const match = /^\s*[^"<>@,;:]+:\s*([\s\S]*?);\s*$/.exec(value);
	return match ? match[1] : value;
}

function cleanName(value: string): string {
	let name = decodeEncodedWords(value).replace(/\s+/g, ' ').trim();
	const commentOnly = /^\(([^)]*)\)$/.exec(name);
	if (commentOnly) name = commentOnly[1];
	while (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
		name = name.slice(1, -1).trim();
	}
	name = name.replace(/\\(["\\])/g, '$1').trim();
	return name;
}

function normalizeAddress(value: string): string {
	let address = decodeEncodedWords(value).trim();
	address = address.replace(/^mailto:/i, '');
	address = address.replace(/^<|>$/g, '').trim();
	address = address.replace(/[;,]+$/, '').trim();
	return address;
}

function parseOneAddress(part: string): MailAddress | null {
	const raw = part.trim();
	if (!raw) return null;
	const angle = /^(.*?)<([^<>]*)>\s*(?:\([^)]*\))?\s*$/.exec(raw);
	if (angle) {
		const address = normalizeAddress(angle[2]);
		const name = cleanName(angle[1]);
		if (!address && !name) return null;
		return { name, address, raw };
	}
	const found = EMAIL_RE.exec(raw);
	if (found) {
		const address = normalizeAddress(found[0]);
		const remainder = `${raw.slice(0, found.index)} ${raw.slice(found.index + found[0].length)}`;
		let name = cleanName(remainder);
		if (!name) {
			const comment = /\(([^)]*)\)/.exec(raw);
			if (comment) name = cleanName(comment[1]);
		}
		return { name, address, raw };
	}
	const name = cleanName(raw);
	return name ? { name, address: '', raw } : null;
}

export function parseAddressList(value: string): MailAddress[] {
	if (!value.trim()) return [];
	return splitTopLevel(expandGroup(value))
		.map(parseOneAddress)
		.filter((item): item is MailAddress => item !== null);
}

export function extractEmails(value: string): string[] {
	const found: string[] = [];
	for (const match of value.matchAll(EMAIL_GLOBAL_RE)) found.push(normalizeAddress(match[0]));
	return found;
}

export function domainOf(address: string): string {
	const at = address.lastIndexOf('@');
	if (at < 0) return '';
	return address
		.slice(at + 1)
		.trim()
		.toLowerCase()
		.replace(/\.$/, '');
}

/** 完全相同，或一方是另一方的子域。故意不把 example.com 与 example.net 视为同域。 */
export function alignedDomains(a: string, b: string): boolean {
	if (!a || !b) return false;
	const left = a.toLowerCase().replace(/\.$/, '');
	const right = b.toLowerCase().replace(/\.$/, '');
	if (left === right) return true;
	return left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

export function sameAddress(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'mil', 'sch']);

/**
 * 粗略的“组织域”：example.co.uk → example.co.uk，mx.qq.com → qq.com。
 * 只用于比较 Authentication-Results 与 Received 的主机是否大体同源，
 * 不是完整的 Public Suffix List。
 */
function organizationDomain(host: string): string {
	const clean = host
		.trim()
		.toLowerCase()
		.replace(/^[<\[]+|[>\]]+$/g, '')
		.replace(/\.$/, '');
	if (!clean || /^\[.*\]$/.test(clean) || /^\d+(?:\.\d+){3}$/.test(clean)) return clean;
	const labels = clean.split('.').filter(Boolean);
	if (labels.length <= 2) return labels.join('.');
	const last = labels[labels.length - 1];
	const second = labels[labels.length - 2];
	if (last.length === 2 && SECOND_LEVEL_LABELS.has(second)) return labels.slice(-3).join('.');
	return labels.slice(-2).join('.');
}

function validDay(year: number, month: number, day: number): boolean {
	if (day < 1 || day > 31) return false;
	const days = [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return day <= days[month];
}

export function parseMailDate(value: string): ParsedDate {
	const raw = value.trim();
	const clean = raw
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	const match = /(?:^|[,\s])(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[A-Za-z]{1,5})?/.exec(
		clean,
	);
	if (!match) return { date: null, zone: '', zoneKnown: false, raw };
	const day = Number(match[1]);
	const month = MONTHS[match[2].toLowerCase()];
	let year = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = match[6] ? Number(match[6]) : 0;
	if (match[3].length === 2) year += year >= 50 ? 1900 : 2000;
	if (month === undefined || !validDay(year, month, day)) return { date: null, zone: '', zoneKnown: false, raw };
	if (hour > 23 || minute > 59 || second > 60) return { date: null, zone: '', zoneKnown: false, raw };

	let offsetMinutes = 0;
	let zone = '';
	let zoneKnown = false;
	const zoneToken = match[7] ?? '';
	if (/^[+-]\d{4}$/.test(zoneToken)) {
		const sign = zoneToken[0] === '-' ? -1 : 1;
		const zh = Number(zoneToken.slice(1, 3));
		const zm = Number(zoneToken.slice(3, 5));
		if (zh > 23 || zm > 59) return { date: null, zone: zoneToken, zoneKnown: false, raw };
		offsetMinutes = sign * (zh * 60 + zm);
		zone = zoneToken;
		zoneKnown = zoneToken !== '-0000';
	} else if (zoneToken) {
		zone = zoneToken;
		const named = ZONE_MINUTES[zoneToken.toLowerCase()];
		if (named !== undefined) {
			offsetMinutes = named;
			zoneKnown = true;
		}
	}

	const time = Date.UTC(year, month, day, hour, minute, second) - offsetMinutes * 60_000;
	const date = new Date(time);
	if (Number.isNaN(date.getTime())) return { date: null, zone, zoneKnown: false, raw };
	return { date, zone, zoneKnown, raw };
}

export function formatDateTime(date: Date | null, withZone = true): string {
	if (!date) return '—';
	const pad = (n: number) => String(n).padStart(2, '0');
	const offset = -date.getTimezoneOffset();
	const sign = offset >= 0 ? '+' : '-';
	const absolute = Math.abs(offset);
	const zone = withZone ? ` UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}` : '';
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${zone}`;
}

export function formatDelay(ms: number | null): string {
	if (ms === null || !Number.isFinite(ms)) return '—';
	const sign = ms < 0 ? '−' : '';
	const value = Math.abs(ms);
	if (value < 1000) return `${sign}${value} 毫秒`;
	const seconds = value / 1000;
	if (seconds < 60) return `${sign}${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
	const minutes = Math.floor(seconds / 60);
	const rest = Math.round(seconds % 60);
	if (minutes < 60) return `${sign}${minutes} 分 ${rest} 秒`;
	const hours = Math.floor(minutes / 60);
	return `${sign}${hours} 小时 ${minutes % 60} 分`;
}

function maskEmail(email: string): string {
	const at = email.lastIndexOf('@');
	if (at < 0) return email;
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	const localMask = local ? `${local[0]}***` : '***';
	if (/^\[.*\]$/.test(domain)) return `${localMask}@[***]`;
	const labels = domain.split('.');
	if (labels.length <= 1) return `${localMask}@${domain ? `${domain[0]}***` : '***'}`;
	const head = labels[0] ? `${labels[0][0]}***` : '***';
	const tail = labels.length > 2 ? labels.slice(1).join('.') : labels[labels.length - 1];
	return `${localMask}@${head}.${tail}`;
}

function maskIpv4(ip: string): string {
	const parts = ip.split('.');
	if (parts.length !== 4) return ip;
	return `${parts[0]}.${parts[1]}.***.***`;
}

function maskBracketIpv6(ip: string): string {
	const inner = ip.slice(1, -1);
	const first = inner.split(':').find(Boolean) ?? '';
	return `[${first}:***]`;
}

/**
 * 遮罩文本中的邮箱与 IP，供隐私展示和复制报告使用。
 * 域名保留后半段，便于核对来源；本地部分只留首字符。
 */
export function maskText(value: string): string {
	return value
		.replace(EMAIL_GLOBAL_RE, (email) => maskEmail(email))
		.replace(IPV4_GLOBAL_RE, (ip) => maskIpv4(ip))
		.replace(BRACKET_IPV6_GLOBAL_RE, (ip) => maskBracketIpv6(ip));
}

function hostOfNode(node: string): string {
	const first = node.trim().split(/[\s(]+/)[0] ?? '';
	return first
		.replace(/^[<(]+|[>)]+$/g, '')
		.replace(/:\d+$/, '')
		.toLowerCase();
}

function clauseAfter(source: string, keyword: string, stops: string[]): string {
	const stopPattern = stops.length ? `(?=\\s+(?:${stops.join('|')})\\s|;|$)` : '(?=;|$)';
	const re = new RegExp(`\\b${keyword}\\s+([\\s\\S]*?)${stopPattern}`, 'i');
	const match = re.exec(source);
	return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function extractIps(value: string): string[] {
	const ips: string[] = [];
	for (const match of value.matchAll(BRACKET_IPV6_GLOBAL_RE)) {
		if (!ips.includes(match[0])) ips.push(match[0]);
	}
	for (const match of value.matchAll(IPV4_GLOBAL_RE)) {
		if (!ips.includes(match[0])) ips.push(match[0]);
	}
	return ips;
}

export function parseReceived(value: string, index: number): ReceivedHop {
	const semi = value.lastIndexOf(';');
	const head = semi >= 0 ? value.slice(0, semi) : value;
	const dateRaw = semi >= 0 ? value.slice(semi + 1).trim() : '';
	const fromNode = clauseAfter(head, 'from', ['by', 'via', 'with', 'id', 'for']);
	const byNode = clauseAfter(head, 'by', ['via', 'with', 'id', 'for']);
	const protocol = clauseAfter(head, 'with', ['id', 'for']);
	const forNode = clauseAfter(head, 'for', []);
	return {
		index,
		chronological: 0,
		raw: value,
		fromNode,
		fromHost: hostOfNode(fromNode),
		byNode,
		byHost: hostOfNode(byNode),
		protocol,
		forNode,
		ips: extractIps(head),
		date: parseMailDate(dateRaw),
		delayMs: null,
	};
}

export function buildReceivedChain(fields: HeaderField[]): ReceivedHop[] {
	const hops = fields
		.filter((field) => field.key === 'received')
		.map((field, index) => parseReceived(field.value, index + 1))
		.reverse();
	for (let i = 0; i < hops.length; i++) {
		hops[i].chronological = i + 1;
		const previous = i > 0 ? hops[i - 1].date.date : null;
		const current = hops[i].date.date;
		if (previous && current) hops[i].delayMs = current.getTime() - previous.getTime();
	}
	return hops;
}

function dkimTag(value: string, name: string): string {
	const re = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;\\s]+)`, 'i');
	const match = re.exec(value);
	return match ? match[1] : '';
}

export function summarizeAuth(fields: HeaderField[]): AuthSummary {
	const records: AuthRecord[] = [];
	const authServIds: string[] = [];
	for (const field of fields) {
		if (field.key !== 'authentication-results') continue;
		const segments = field.value.split(';');
		if (segments.length && !segments[0].includes('=')) {
			const id = hostOfNode(segments[0]);
			if (id && !authServIds.includes(id)) authServIds.push(id);
			segments.shift();
		}
		for (const segment of segments) {
			const match = /^\s*([A-Za-z][A-Za-z0-9-]*)\s*=\s*([A-Za-z]+)\s*([\s\S]*)$/.exec(segment);
			if (!match) continue;
			const method = match[1].toLowerCase();
			if (!['spf', 'dkim', 'dmarc', 'arc', 'bimi'].includes(method)) continue;
			records.push({
				method,
				result: match[2].toLowerCase(),
				detail: match[3].replace(/\s+/g, ' ').trim(),
				source: 'authentication-results',
			});
		}
	}
	if (!records.some((record) => record.method === 'spf')) {
		for (const field of fields) {
			if (field.key !== 'received-spf') continue;
			const match = /^\s*([A-Za-z]+)/.exec(field.value);
			if (!match) continue;
			records.push({
				method: 'spf',
				result: match[1].toLowerCase(),
				detail: field.value.replace(/\s+/g, ' ').trim(),
				source: 'received-spf',
			});
		}
	}

	const dkimSignatures: DkimSignature[] = fields
		.filter((field) => field.key === 'dkim-signature')
		.map((field) => ({
			domain: dkimTag(field.value, 'd'),
			selector: dkimTag(field.value, 's'),
			algorithm: dkimTag(field.value, 'a'),
			identity: dkimTag(field.value, 'i'),
			raw: field.value,
		}))
		.filter((signature) => signature.domain);

	const badges: AuthBadge[] = (['spf', 'dkim', 'dmarc', 'arc'] as const).map((method) => {
		const list = records.filter((record) => record.method === method);
		if (!list.length) return { method, result: 'none', detail: '', count: 0 };
		const results = list.map((record) => record.result);
		let result = list[0].result;
		if (method === 'dkim') {
			if (results.includes('pass')) result = 'pass';
			else if (results.some((item) => ['fail', 'softfail', 'permerror'].includes(item))) result = 'fail';
		}
		return {
			method,
			result,
			detail: list[0].detail,
			count: list.length,
		};
	});

	const relevant = badges.filter((badge) => ['spf', 'dkim', 'dmarc'].includes(badge.method));
	const present = relevant.filter((badge) => badge.count > 0);
	const failed = present.some((badge) => ['fail', 'softfail', 'permerror'].includes(badge.result));
	let overall: AuthOverall = 'none';
	if (present.length) {
		if (failed) overall = 'fail';
		else if (relevant.every((badge) => badge.result === 'pass')) overall = 'pass';
		else overall = 'partial';
	}

	return {
		records,
		badges,
		overall,
		authServIds,
		dkimSignatures,
		arcSeals: fields.filter((field) => field.key === 'arc-seal').length,
	};
}

function splitReferences(value: string): string[] {
	return Array.from(value.matchAll(/<[^<>]+>/g)).map((match) => match[0]);
}

function makeByKey(fields: HeaderField[]): Record<string, HeaderField[]> {
	const byKey: Record<string, HeaderField[]> = {};
	for (const field of fields) {
		(byKey[field.key] ??= []).push(field);
	}
	return byKey;
}

export function parseMailHeaders(input: string): ParsedHeaders {
	if (!input.trim()) throw new MailParseError('empty', '没有收到任何内容。');
	const bytes = new TextEncoder().encode(input).length;
	if (bytes > MAX_HEADER_BYTES) {
		throw new MailParseError('too-large', `内容超过 ${Math.round(MAX_HEADER_BYTES / 1024)} KB，请只粘贴邮件头部分。`);
	}
	const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const lines = normalized.split('\n');
	let start = 0;
	if (/^From\s+\S+/.test(lines[0]) && !lines[0].includes(':')) start = 1;

	let end = lines.length;
	let headerOnly = false;
	for (let i = start; i < lines.length; i++) {
		if (lines[i].trim() === '') {
			end = i;
			headerOnly = true;
			break;
		}
	}
	if (end - start > 20_000) end = start + 20_000;

	const fields: HeaderField[] = [];
	const issues: HeaderIssue[] = [];
	let current: HeaderField | null = null;
	for (let i = start; i < end; i++) {
		const line = lines[i];
		if (!line.trim()) continue;
		if (/^[ \t]/.test(line)) {
			if (!current) {
				if (issues.length < 20) issues.push({ line: i + 1, message: '续行前面没有对应的头字段，已跳过。' });
				continue;
			}
			current.raw += `\n${line}`;
			current.value += ` ${line.trim()}`;
			current.decoded = decodeEncodedWords(current.value);
			continue;
		}
		const colon = line.indexOf(':');
		if (colon <= 0) {
			if (issues.length < 20) issues.push({ line: i + 1, message: '这一行不是合法的“名称: 值”格式，已跳过。' });
			current = null;
			continue;
		}
		const name = line.slice(0, colon).trim();
		if (!name) {
			if (issues.length < 20) issues.push({ line: i + 1, message: '头字段名称为空，已跳过。' });
			current = null;
			continue;
		}
		const value = line.slice(colon + 1).trim();
		current = {
			name,
			key: name.toLowerCase(),
			value,
			decoded: decodeEncodedWords(value),
			line: i + 1,
			raw: line,
		};
		fields.push(current);
	}
	if (!fields.length) {
		throw new MailParseError(
			'not-headers',
			'没有识别出邮件头。请粘贴形如 “From: name@example.com” 的头字段，或选择 .eml 文件。',
		);
	}

	const byKey = makeByKey(fields);
	const first = (key: string) => byKey[key]?.[0];
	const fromAll = parseAddressList(first('from')?.decoded ?? '');
	const returnPath = extractEmails(first('return-path')?.decoded ?? '')[0] ?? '';
	const dateField = first('date');
	const duplicateKeys = Object.keys(byKey).filter((key) => (byKey[key]?.length ?? 0) > 1);

	return {
		fields,
		byKey,
		from: fromAll[0] ?? null,
		fromAll,
		to: parseAddressList(first('to')?.decoded ?? ''),
		cc: parseAddressList(first('cc')?.decoded ?? ''),
		bcc: parseAddressList(first('bcc')?.decoded ?? ''),
		replyTo: parseAddressList(first('reply-to')?.decoded ?? ''),
		sender: parseAddressList(first('sender')?.decoded ?? '')[0] ?? null,
		returnPath,
		subject: first('subject')?.decoded ?? '',
		date: parseMailDate(dateField?.value ?? ''),
		messageId: first('message-id')?.value.trim() ?? '',
		inReplyTo: first('in-reply-to')?.value.trim() ?? '',
		references: splitReferences(first('references')?.value ?? ''),
		issues,
		headerOnly,
		bytes,
		lines: normalized.split('\n').length,
		duplicateKeys,
	};
}

const SPAM_FLAGS = ['yes', 'true', '1'];

function badgeResult(auth: AuthSummary, method: 'spf' | 'dkim' | 'dmarc' | 'arc'): string {
	return auth.badges.find((badge) => badge.method === method)?.result ?? 'none';
}

function firstValue(parsed: ParsedHeaders, key: string): string {
	return parsed.byKey[key]?.[0]?.decoded ?? '';
}

function addCheck(
	checks: CheckItem[],
	level: CheckLevel,
	id: string,
	title: string,
	detail: string,
): void {
	checks.push({ id, level, title, detail });
}

export function buildChecks(
	parsed: ParsedHeaders,
	auth: AuthSummary,
	received: ReceivedHop[],
	now: Date = new Date(),
): CheckItem[] {
	const checks: CheckItem[] = [];
	const from = parsed.from;
	const fromDomain = from ? domainOf(from.address) : '';
	const reply = parsed.replyTo[0];
	const replyDomain = reply ? domainOf(reply.address) : '';
	const returnDomain = parsed.returnPath ? domainOf(parsed.returnPath) : '';
	const messageDomain = domainOf(parsed.messageId.replace(/^<|>$/g, ''));
	const spf = badgeResult(auth, 'spf');
	const dkim = badgeResult(auth, 'dkim');
	const dmarc = badgeResult(auth, 'dmarc');

	if (!from) {
		addCheck(checks, 'warn', 'missing-from', '缺少 From 头', '无法确认发件人身份，也无法做域名对齐检查。请确认是否只复制了部分邮件头。');
	} else {
		if (parsed.fromAll.length > 1 || parsed.byKey.from.length > 1) {
			addCheck(
				checks,
				'high',
				'multiple-from',
				'存在多个 From 地址',
				'正常邮件通常只有一个 From 头和一个发件地址。多个 From 可能是伪造或转发时被拼接。',
			);
		}
		const nameEmails = extractEmails(from.name).filter((email) => !sameAddress(email, from.address));
		if (nameEmails.length) {
			addCheck(
				checks,
				'high',
				'display-name-spoof',
				'显示名里藏着另一个邮箱',
				`显示名包含 ${nameEmails.join('、')}，但真实发件地址是 ${from.address}。这是常见的伪装手法，请以尖括号里的地址为准。`,
			);
		}
		if (fromDomain.startsWith('xn--') || fromDomain.includes('.xn--')) {
			addCheck(
				checks,
				'warn',
				'punycode-from',
				'发件域名是 Punycode 国际化域名',
				`${fromDomain} 可能显示成与知名品牌相似的字符，请注意核对拼写。Punycode 本身合法，不等于诈骗。`,
			);
		}
		if (/^\[.*\]$/.test(fromDomain)) {
			addCheck(checks, 'warn', 'ip-from', 'From 使用 IP 地址而不是域名', '正常邮件极少直接用 IP 作为发件域名，这通常不利于认证与追溯。');
		}
		if (reply && !alignedDomains(fromDomain, replyDomain)) {
			addCheck(
				checks,
				'warn',
				'reply-to-mismatch',
				'Reply-To 与 From 不属于同一域名',
				`回复会发到 ${reply.address}（${replyDomain}），而发件人是 ${from.address}（${fromDomain}）。公司客服或邮件列表可能这样配置，但也常被用于把回复引到攻击者邮箱。`,
			);
		}
		if (parsed.sender && !sameAddress(parsed.sender.address, from.address)) {
			addCheck(
				checks,
				'info',
				'sender-different',
				'Sender 与 From 不同',
				`Sender 是 ${parsed.sender.address}。代表他人或系统发送时会出现，需结合业务场景判断。`,
			);
		}
	}

	if (parsed.returnPath && fromDomain && !alignedDomains(returnDomain, fromDomain)) {
		addCheck(
			checks,
			'info',
			'return-path-mismatch',
			'Return-Path 与 From 域名不同',
			`退信地址在 ${returnDomain}。邮件列表、代发平台常用独立的退信域（VERP），不一定可疑。`,
		);
	}

	if (!parsed.messageId) {
		addCheck(checks, 'warn', 'missing-message-id', '缺少 Message-ID', '正常邮件通常带有全局唯一的 Message-ID；缺失可能是手工拼接或旧系统生成。');
	} else if (messageDomain && fromDomain && !alignedDomains(messageDomain, fromDomain)) {
		addCheck(
			checks,
			'info',
			'message-id-domain',
			'Message-ID 域名与 From 不同',
			`Message-ID 使用 ${messageDomain}。代发平台与邮件列表常见这种情况，不构成独立风险。`,
		);
	}

	if (!parsed.date.date) {
		addCheck(checks, 'warn', 'missing-date', 'Date 缺失或无法解析', parsed.date.raw ? `原始值：${parsed.date.raw}` : '没有找到 Date 头。');
	} else {
		const skew = parsed.date.date.getTime() - now.getTime();
		if (skew > 24 * 3600_000) {
			addCheck(
				checks,
				'warn',
				'future-date',
				'发件时间在未来',
				`Date 比当前时间晚 ${formatDelay(skew)}。可能是时区写错，也可能是刻意伪造时间。`,
			);
		}
		if (parsed.byKey.date.length > 1) {
			addCheck(checks, 'warn', 'multiple-date', '存在多个 Date 头', '多个日期可能让不同客户端显示不同时间，正常邮件通常只有一个 Date。');
		}
	}

	if (parsed.subject && /^\s*(re|fw|fwd|回复|转发)\s*[:：]/i.test(parsed.subject) && !parsed.inReplyTo && !parsed.references.length) {
		addCheck(
			checks,
			'info',
			'fake-thread',
			'主题像回复，但没有会话线索',
			'主题以 Re:/Fwd: 开头，却缺少 In-Reply-To / References。可能是新邮件伪装成旧会话。',
		);
	}

	if (spf === 'fail' || spf === 'softfail') {
		addCheck(
			checks,
			'warn',
			'spf-fail',
			`SPF ${authLabel(spf)}（接收方声明）`,
			'接收方认为发件 IP 不在发件域授权的服务器列表中。转发的邮件也可能出现软失败，需结合其他结果判断。',
		);
	}
	if (dkim === 'fail') {
		addCheck(checks, 'warn', 'dkim-fail', 'DKIM 验证失败（接收方声明）', '签名没有通过接收方验证，可能是邮件被篡改，也可能是签名过期或转发破坏了签名。');
	}
	if (dmarc === 'fail') {
		addCheck(
			checks,
			'high',
			'dmarc-fail',
			'DMARC 未通过（接收方声明）',
			'按发件域公布的 DMARC 策略，这封邮件没有通过身份对齐。它是判断伪造最有力的头部信号之一，但仍需结合业务背景。',
		);
	}
	if (auth.overall === 'none') {
		addCheck(
			checks,
			'info',
			'no-auth',
			'没有 SPF / DKIM / DMARC 结果',
			'可能只复制了部分邮件头，或邮件没有经过支持认证结果记录的服务。缺少结果不等于邮件是假的。',
		);
	} else if (auth.overall === 'partial') {
		addCheck(
			checks,
			'info',
			'auth-partial',
			'认证结果不完整',
			'至少有一项认证没有给出 pass。可以查看下方各方法的原始结果与详情。',
		);
	}
	if (dkim === 'none' && auth.dkimSignatures.length) {
		addCheck(
			checks,
			'info',
			'unsigned-dkim',
			'有 DKIM 签名，但接收方没有给出验证结果',
			`发现 ${auth.dkimSignatures.length} 个 DKIM-Signature（域：${auth.dkimSignatures.map((item) => item.domain).join('、')}）。是否通过仍需接收方验证。`,
		);
	}
	if (auth.arcSeals && badgeResult(auth, 'arc') === 'none') {
		addCheck(checks, 'info', 'arc-no-result', '有 ARC 封签，但没有 ARC 验证结果', `发现 ${auth.arcSeals} 个 ARC-Seal，常见于经转发链路的邮件。`);
	}

	const spamStatus = firstValue(parsed, 'x-spam-status').toLowerCase();
	const spamFlag = firstValue(parsed, 'x-spam-flag').toLowerCase();
	const spamScoreRaw = firstValue(parsed, 'x-spam-score');
	const spamScore = Number.parseFloat(spamScoreRaw);
	if (SPAM_FLAGS.includes(spamFlag) || /^\s*yes\b/.test(spamStatus)) {
		addCheck(
			checks,
			'high',
			'spam-flagged',
			'收件服务器已标记为垃圾邮件',
			[spamFlag ? `X-Spam-Flag: ${spamFlag}` : '', spamStatus ? `X-Spam-Status: ${spamStatus}` : '']
				.filter(Boolean)
				.join('；'),
		);
	} else if (Number.isFinite(spamScore) && spamScore >= 5) {
		addCheck(checks, 'warn', 'spam-score', '垃圾邮件评分偏高', `X-Spam-Score: ${spamScoreRaw}（不同反垃圾系统的量纲可能不同）。`);
	}

	const precedence = firstValue(parsed, 'precedence').toLowerCase();
	if (precedence === 'junk') {
		addCheck(checks, 'warn', 'precedence-junk', 'Precedence 标记为 junk', '发送方把邮件标记为垃圾邮件类别，通常只用于测试或批量投递。');
	} else if (['bulk', 'list'].includes(precedence)) {
		addCheck(checks, 'info', 'precedence-bulk', '批量 / 列表邮件标记', `Precedence: ${precedence}，常见于群发或邮件列表。`);
	}
	if (firstValue(parsed, 'list-unsubscribe')) {
		addCheck(checks, 'info', 'list-unsubscribe', '包含退订头', 'List-Unsubscribe 说明这很可能是营销或列表邮件，不代表安全或危险。');
	}

	if (!received.length) {
		addCheck(checks, 'warn', 'no-received', '没有 Received 头', '无法还原传输路径。可能只复制了部分头部，或邮件来自本地草稿。');
	} else {
		if (received.length === 1) {
			addCheck(checks, 'info', 'single-hop', '传输路径只有一跳', '可能邮件直接从本地投递，也可能其余 Received 头在复制时被省略。');
		}
		const backwards = received.filter((hop) => hop.delayMs !== null && hop.delayMs < -60_000);
		if (backwards.length) {
			addCheck(
				checks,
				'warn',
				'negative-delay',
				'Received 时间出现倒退',
				`有 ${backwards.length} 处相邻服务器时间差小于 -1 分钟，可能是服务器时钟不准，也可能是头部被手工拼接。`,
			);
		}
	}

	if (auth.authServIds.length) {
		const byHosts = received.map((hop) => hop.byHost).filter(Boolean);
		const known = auth.authServIds.some((id) =>
			byHosts.some((host) => alignedDomains(id, host) || (organizationDomain(id) && organizationDomain(id) === organizationDomain(host))),
		);
		if (byHosts.length && !known) {
			addCheck(
				checks,
				'warn',
				'authserv-mismatch',
				'认证结果来源不在 Received 路径中',
				`Authentication-Results 声称由 ${auth.authServIds.join('、')} 添加，但 Received 的 by 主机里没有同一组织域的记录。可能是复制时漏了 Received，也可能是伪造的认证结果。`,
			);
		}
	}

	if (dmarc === 'pass' && spf === 'pass' && dkim === 'pass') {
		addCheck(
			checks,
			'ok',
			'auth-pass',
			'SPF / DKIM / DMARC 均通过（接收方声明）',
			'这只说明邮件与发件域对齐，不能证明该域名可信——攻击者自己注册的新域名同样可以让三项全绿。还要看域名年龄、业务背景与正文内容。',
		);
	}
	const dmarcDetail = auth.records.find((record) => record.method === 'dmarc')?.detail ?? '';
	const dmarcPolicy = /(?:^|[\s(])p\s*=\s*(none|quarantine|reject)\b/i.exec(dmarcDetail)?.[1]?.toLowerCase();
	if (dmarcPolicy === 'none') {
		addCheck(
			checks,
			'info',
			'dmarc-policy-none',
			'DMARC 策略为 p=none',
			'发件域只要求接收方汇报，不要求隔离或拒绝。即使 dmarc=pass，也只说明“对齐”，不代表这个域名值得信任。',
		);
	}
	const hasProblem = checks.some((check) => check.level === 'high' || check.level === 'warn');
	if (!hasProblem) {
		addCheck(checks, 'ok', 'no-obvious-risk', '未发现常见的伪造或异常特征', '这条结论只基于邮件头，不能证明正文、链接和附件安全。');
	}

	const order: Record<CheckLevel, number> = { high: 0, warn: 1, info: 2, ok: 3 };
	return checks
		.map((check, index) => ({ check, index }))
		.sort((a, b) => order[a.check.level] - order[b.check.level] || a.index - b.index)
		.map((item) => item.check);
}

export function analyzeMail(input: string, now: Date = new Date()): MailAnalysis {
	const parsed = parseMailHeaders(input);
	const auth = summarizeAuth(parsed.fields);
	const received = buildReceivedChain(parsed.fields);
	const checks = buildChecks(parsed, auth, received, now);
	const counts = {
		high: checks.filter((check) => check.level === 'high').length,
		warn: checks.filter((check) => check.level === 'warn').length,
		info: checks.filter((check) => check.level === 'info').length,
		ok: checks.filter((check) => check.level === 'ok').length,
	};
	const level: MailVerdict['level'] = counts.high ? 'high' : counts.warn ? 'warn' : 'ok';
	const verdict: MailVerdict = {
		level,
		title: level === 'high' ? '发现高风险信号' : level === 'warn' ? '需要进一步核对' : '未发现明显异常',
		detail:
			level === 'high'
				? '下面的规则命中了明显的伪造或垃圾邮件特征。不要点击邮件里的链接，也不要按邮件里的电话回拨。'
				: level === 'warn'
					? '有几处值得核对的地方，但不代表邮件一定是假的。请结合发件人、业务背景和链接地址判断。'
					: '头部没有命中常见的伪造特征。这不代表正文、链接或附件安全，仍请保持警惕。',
		highCount: counts.high,
		warnCount: counts.warn,
		infoCount: counts.info,
		okCount: counts.ok,
	};
	return { parsed, auth, received, checks, verdict, generatedAt: now };
}

export function authLabel(result: string): string {
	const labels: Record<string, string> = {
		pass: '通过',
		fail: '失败',
		softfail: '软失败',
		neutral: '中性',
		none: '未声明',
		temperror: '临时错误',
		permerror: '永久错误',
		policy: '策略拒绝',
	};
	return labels[result.toLowerCase()] ?? result;
}

export function filterHeaderFields(fields: HeaderField[], query: string): HeaderField[] {
	const keyword = query.trim().toLowerCase();
	if (!keyword) return fields;
	return fields.filter(
		(field) =>
			field.key.includes(keyword) ||
			field.value.toLowerCase().includes(keyword) ||
			field.decoded.toLowerCase().includes(keyword),
	);
}

function reportLine(label: string, value: string): string {
	return `${label}：${value || '—'}`;
}

/**
 * 生成可复制、可粘贴到工单里的纯文本报告。
 * masked 为 true 时对邮箱与 IP 做遮罩。
 */
export function buildReport(analysis: MailAnalysis, masked = false): string {
	const { parsed, auth, received, checks, verdict } = analysis;
	const show = (value: string) => (masked ? maskText(value) : value);
	const lines: string[] = [];
	lines.push('邮件头分析报告（本地生成）');
	lines.push(`生成时间：${formatDateTime(analysis.generatedAt)}`);
	lines.push(`结论：${verdict.title}（高风险 ${verdict.highCount} · 提醒 ${verdict.warnCount} · 提示 ${verdict.infoCount}）`);
	lines.push('');
	lines.push('== 概要 ==');
	lines.push(reportLine('主题', show(parsed.subject)));
	lines.push(reportLine('发件人', parsed.from ? show(`${parsed.from.name ? `${parsed.from.name} ` : ''}<${parsed.from.address}>`) : ''));
	lines.push(reportLine('收件人', show(parsed.to.map((item) => item.address || item.name).join(', '))));
	lines.push(reportLine('日期', parsed.date.date ? `${formatDateTime(parsed.date.date)}${parsed.date.zone ? `（原始时区 ${parsed.date.zone}）` : ''}` : parsed.date.raw));
	lines.push(reportLine('Message-ID', show(parsed.messageId)));
	lines.push(reportLine('Return-Path', show(parsed.returnPath)));
	if (parsed.replyTo.length) lines.push(reportLine('Reply-To', show(parsed.replyTo.map((item) => item.address || item.name).join(', '))));
	lines.push(reportLine('邮件头数量', String(parsed.fields.length)));
	lines.push(reportLine('Received 跳数', String(received.length)));
	if (masked) lines.push('（邮箱与 IP 已遮罩）');
	lines.push('');
	lines.push('== 认证结果（接收方声明，未做独立验证） ==');
	for (const badge of auth.badges) {
		lines.push(`${badge.method.toUpperCase()}：${authLabel(badge.result)}${badge.detail ? `（${show(badge.detail)}）` : ''}`);
	}
	lines.push('');
	lines.push('== 检查结果 ==');
	for (const check of checks) {
		const tag = check.level === 'high' ? '高风险' : check.level === 'warn' ? '提醒' : check.level === 'info' ? '提示' : '正常';
		lines.push(`[${tag}] ${check.title}`);
		lines.push(`  ${show(check.detail)}`);
	}
	lines.push('');
	lines.push('== 传输路径（按时间从早到晚） ==');
	if (!received.length) {
		lines.push('（没有 Received 头）');
	} else {
		for (const hop of received) {
			const route = `${hop.fromNode || '?'} → ${hop.byNode || '?'}`;
			lines.push(
				`${hop.chronological}. ${show(route)}${hop.protocol ? ` / ${hop.protocol}` : ''}${hop.date.date ? ` / ${formatDateTime(hop.date.date)}` : ''}${hop.delayMs !== null ? ` / 距上一跳 ${formatDelay(hop.delayMs)}` : ''}`,
			);
			if (hop.ips.length) lines.push(`   IP：${show(hop.ips.join(', '))}`);
		}
	}
	lines.push('');
	lines.push('== 全部头字段 ==');
	for (const field of parsed.fields) {
		lines.push(`${field.name}: ${show(field.decoded)}`);
	}
	lines.push('');
	lines.push('说明：本报告由浏览器本地生成，未联网验证 SPF / DKIM / DMARC，也不能检查正文、链接与附件。');
	lines.push('工具：https://915p.bbhc.cn/tools/mail/');
	return lines.join('\n');
}