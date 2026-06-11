export function normalizePhone(phone: string): string {
	let p = phone.trim().replace(/\s+/g, '');
	if (p.startsWith('+88')) p = p.replace('+88', '');
	if (p.startsWith('0')) p = '88' + p.slice(1);
	return p;
}
