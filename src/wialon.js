import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const tokensFile = join(homedir(), '.wialon-mcp', 'tokens.json');

function savedTokens() {
  try {
    return JSON.parse(readFileSync(tokensFile, 'utf8'));
  } catch {
    return {};
  }
}

export class Wialon {
  constructor({ host, token, timeZone }) {
    this.host = host.replace(/\/+$/, '');
    this.url = `${this.host}/wialon/ajax.html`;
    this.configured = Boolean(token);
    this.token = token || savedTokens()[this.host];
    this.timeZone = timeZone;
    this.sid = null;
  }

  save(token) {
    this.token = token;
    mkdirSync(dirname(tokensFile), { recursive: true });
    writeFileSync(tokensFile, JSON.stringify({ ...savedTokens(), [this.host]: token }));
  }

  async signIn() {
    if (!this.server) {
      this.server = createServer((req, res) => {
        const token = new URL(req.url, 'http://localhost').searchParams.get('access_token');
        res.setHeader('content-type', 'text/html; charset=utf-8');
        if (req.url.startsWith('/done')) {
          if (token) {
            this.save(token);
            this.server.close();
            this.server = null;
          }
          return res.end(token ? 'ok' : 'fail');
        }
        res.end(`<body style="font:18px sans-serif;text-align:center;padding:60px"><script>fetch('/done?'+(location.search.slice(1)||location.hash.slice(1))).then(r=>r.text()).then(t=>document.body.textContent=t==='ok'?'Wialon connected. Close this tab and return to Claude.':'Sign-in failed. Ask Claude again to retry.')</script>`);
      });
      await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve));
    }
    const link = `${this.host}/login.html?client_id=wialon-mcp&access_type=-1&activation_time=0&duration=0&flags=0x1&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${this.server.address().port}/`)}`;
    exec(process.platform === 'win32' ? `start "" "${link}"` : `${process.platform === 'darwin' ? 'open' : 'xdg-open'} "${link}"`);
    throw new Error(`Wialon sign-in needed. A browser tab with the Wialon login page was opened: ask the user to sign in there and press Authorize, then retry. If no tab opened, give the user this link: ${link}`);
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
    if (!this.token) return this.signIn();
    const data = await this.post('token/login', { token: this.token, fl: 1 });
    if (!data.eid && !this.configured) return this.signIn();
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
