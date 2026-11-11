export class Wialon {
  constructor({ host, token, timeZone }) {
    this.url = `${host.replace(/\/+$/, '')}/wialon/ajax.html`;
    this.token = token;
    this.timeZone = timeZone;
    this.sid = null;
  }

  async call(svc, params = {}) {
    if (!this.sid) await this.login();
    let data = await this.post(svc, params);
    if (data?.error === 1) {
      await this.login();
      data = await this.post(svc, params);
    }
    if (data?.error) throw new Error(`Wialon ${svc} error ${data.error}${data.reason ? `: ${data.reason}` : ''}`);
    return data;
  }

  async post(svc, params) {
    const body = new URLSearchParams({ params: JSON.stringify(params), sid: this.sid ?? '' });
    const res = await fetch(`${this.url}?svc=${svc}`, { method: 'POST', body, signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`Wialon HTTP ${res.status}`);
    return res.json();
  }

  async login() {
    this.sid = null;
    const data = await this.post('token/login', { token: this.token, fl: 1 });
    if (!data.eid) throw new Error(`Wialon login failed (error ${data.error}). Check host and token.`);
    this.sid = data.eid;
    const utc = Math.floor(Date.now() / 1000);
    await this.post('render/set_locale', { tzOffset: Date.parse(this.time(utc).replace(' ', 'T') + 'Z') / 1000 - utc, language: 'en', formatDate: '%Y-%m-%E %H:%M:%S' });
  }

  async search(type, flags, mask = '*') {
    const data = await this.call('core/search_items', {
      spec: { itemsType: type, propName: 'sys_name', propValueMask: mask, sortType: 'sys_name' },
      force: 1, flags, from: 0, to: 0,
    });
    return data.items ?? [];
  }

  async unit(name) {
    const units = await this.search('avl_unit', 1, `*${name}*`);
    const unit = units.find(u => u.nm.toLowerCase() === name.toLowerCase()) ?? units[0];
    if (!unit) throw new Error(`Unit "${name}" not found`);
    return unit;
  }

  async messages(itemId, from, to, type, limit = 0xFFFFFFFF) {
    const data = await this.call('messages/load_interval', { itemId, timeFrom: from, timeTo: to, flags: type, flagsMask: 0xFF00, loadCount: limit });
    return data.messages ?? [];
  }

  time(seconds) {
    return seconds ? new Date(seconds * 1000).toLocaleString('sv-SE', { timeZone: this.timeZone }) : null;
  }

  parse(value, fallback) {
    const text = value || fallback;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(text);
    if (!match) throw new Error(`Bad date "${text}", use YYYY-MM-DD or YYYY-MM-DD HH:MM`);
    const [, y, m, d, h = '00', i = '00'] = match;
    const utc = Date.UTC(+y, m - 1, +d, +h, +i) / 1000;
    const local = Date.parse(new Date(utc * 1000).toLocaleString('sv-SE', { timeZone: this.timeZone }).replace(' ', 'T') + 'Z') / 1000;
    return utc - (local - utc);
  }

  today() {
    return new Date().toLocaleString('sv-SE', { timeZone: this.timeZone }).slice(0, 10);
  }
}
