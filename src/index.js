#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Wialon } from './wialon.js';

const { WIALON_HOST, WIALON_TOKEN, WIALON_TIMEZONE = 'Asia/Baku' } = process.env;
if (!WIALON_HOST) {
  console.error('Set WIALON_HOST, e.g. https://go.gps.az');
  process.exit(1);
}

const wialon = new Wialon({ host: WIALON_HOST, token: WIALON_TOKEN, timeZone: WIALON_TIMEZONE });
const server = new McpServer(
  { name: 'wialon-mcp', version: '1.1.0' },
  { instructions: `Read-only access to one Wialon GPS account: units (vehicles), groups, positions, tracks, events, sensors, geofences, drivers and the account's own report templates (mileage, trips, stops, fuel, engine hours and more). Times are ${WIALON_TIMEZONE}. For mileage, fuel, trips or stops prefer list_reports then run_report.` },
);

const unit = z.string().describe('Unit (vehicle) name or part of it, e.g. a plate number');
const from = z.string().optional().describe('YYYY-MM-DD or YYYY-MM-DD HH:MM, default today 00:00');
const to = z.string().optional().describe('YYYY-MM-DD or YYYY-MM-DD HH:MM, default now');
const map = (y, x) => (y ? `https://maps.google.com/?q=${y},${x}` : null);
const now = () => Math.floor(Date.now() / 1000);

function range(args, maxDays) {
  const start = wialon.parse(args.from, wialon.today());
  const end = Math.min(args.to ? wialon.parse(args.to) + (args.to.length === 10 ? 86399 : 0) : now(), now());
  if (start >= end) throw new Error('Period start must be before its end');
  if (maxDays && end - start > maxDays * 86400) throw new Error(`Period must be at most ${maxDays} days`);
  return [start, end];
}

function tool(name, description, inputSchema, run) {
  server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: true } }, async args => ({
    content: [{ type: 'text', text: JSON.stringify(await run(args)) }],
  }));
}

async function unitNames() {
  return Object.fromEntries((await wialon.search('avl_unit', 1)).map(u => [u.id, u.nm]));
}

async function group(name) {
  const groups = await wialon.search('avl_unit_group', 1);
  const found = groups.find(g => g.nm.toLowerCase() === name.toLowerCase()) ?? groups.find(g => g.nm.toLowerCase().includes(name.toLowerCase()));
  if (!found) throw new Error(`Group "${name}" not found`);
  return found;
}

tool('list_units', 'Live state of units: speed km/h, last position time and place, last signal time, with totals (units, moving now, no signal for 1 hour).', {
  search: z.string().optional().describe('Unit name or part of it'),
  group: z.string().optional().describe('Unit group name'),
  moving_only: z.boolean().optional().describe('Only units moving now'),
}, async args => {
  let units = await wialon.search('avl_unit', 1 | 1024, args.search ? `*${args.search}*` : '*');
  if (args.group) {
    const ids = new Set((await group(args.group)).u);
    units = units.filter(u => ids.has(u.id));
  }
  const moving = u => u.pos?.s > 0 && u.pos.t >= now() - 600;
  if (args.moving_only) units = units.filter(moving);
  return {
    units: units.length,
    moving: units.filter(moving).length,
    no_signal_1h: units.filter(u => (u.lmsg?.t ?? 0) < now() - 3600).length,
    rows: units.map(u => ({ unit: u.nm, speed: u.pos?.s ?? null, position_at: wialon.time(u.pos?.t), signal_at: wialon.time(u.lmsg?.t), map: map(u.pos?.y, u.pos?.x) })),
  };
});

tool('list_groups', 'Unit groups with their units.', {}, async () => {
  const names = await unitNames();
  return (await wialon.search('avl_unit_group', 1)).map(g => ({ group: g.nm, units: g.u.length, unit_names: g.u.map(id => names[id]).filter(Boolean) }));
});

tool('unit_track', 'GPS history of one unit for up to 7 days: approximate mileage km, max speed, first/last position and positions sampled every N minutes.', {
  unit, from, to,
  interval_minutes: z.number().int().min(1).optional().describe('Sampling interval, default 30'),
}, async args => {
  const [start, end] = range(args, 7);
  const found = await wialon.unit(args.unit);
  const points = (await wialon.messages(found.id, start, end, 0)).filter(m => m.pos?.y);
  const step = (args.interval_minutes ?? 30) * 60;
  let km = 0;
  let last = -Infinity;
  const rows = [];
  points.forEach((m, i) => {
    if (i) km += distance(points[i - 1].pos, m.pos);
    if (m.t - last >= step) {
      last = m.t;
      rows.push({ at: wialon.time(m.t), speed: m.pos.s, map: map(m.pos.y, m.pos.x) });
    }
  });
  const edge = m => m && { at: wialon.time(m.t), map: map(m.pos.y, m.pos.x) };
  return {
    unit: found.nm,
    mileage_km: Math.round(km * 10) / 10,
    max_speed: points.reduce((max, m) => Math.max(max, m.pos.s), 0),
    first: edge(points[0]),
    last: edge(points.at(-1)),
    rows,
  };
});

tool('unit_events', 'Event messages registered by Wialon notifications/jobs (e.g. harsh acceleration or braking, speeding, geofence enter/exit, sensor alerts) for one unit or all units.', {
  unit: unit.optional().describe('Unit name, default all units'),
  from, to,
  name: z.string().optional().describe('Event name or text part to filter by'),
}, async args => {
  const [start, end] = range(args, 31);
  const units = args.unit ? [await wialon.unit(args.unit)] : await wialon.search('avl_unit', 1);
  const rows = [];
  for (let i = 0; i < units.length; i += 50) {
    const chunk = units.slice(i, i + 50);
    const results = await wialon.call('core/batch', {
      params: chunk.map(u => ({ svc: 'messages/load_interval', params: { itemId: u.id, timeFrom: start, timeTo: end, flags: 0x600, flagsMask: 0xFF00, loadCount: 0xFFFFFFFF } })),
      flags: 0,
    });
    results.forEach((result, j) => (result.messages ?? []).forEach(m => rows.push({ unit: chunk[j].nm, at: wialon.time(m.t), name: m.p?.evt_name ?? null, text: m.et ?? null, map: map(m.y, m.x) })));
  }
  const needle = args.name?.toLowerCase();
  const filtered = needle ? rows.filter(r => `${r.name} ${r.text}`.toLowerCase().includes(needle)) : rows;
  return { events: filtered.length, rows: filtered.slice(0, 1000), truncated: filtered.length > 1000 };
});

tool('unit_sensors', 'Current values of all sensors of one unit (ignition, fuel level, voltage, temperature, etc.).', { unit }, async args => {
  const found = await wialon.unit(args.unit);
  const [full] = await wialon.search('avl_unit', 1 | 1024 | 4096, found.nm);
  const values = await wialon.call('unit/calc_last_message', { unitId: found.id, sensors: [], flags: 1 });
  return {
    unit: found.nm,
    message_at: wialon.time(full?.lmsg?.t),
    sensors: Object.values(full?.sens ?? {}).map(s => ({ sensor: s.n, type: s.t, value: values[s.id] === -348201.3876 ? null : values[s.id], measure: s.m })),
  };
});

tool('list_reports', 'Report templates configured in the Wialon account, with the object type each runs on (avl_unit = one unit, avl_unit_group = unit group).', {}, async () =>
  (await wialon.search('avl_resource', 1 | 0x2000)).flatMap(r => Object.values(r.rep ?? {}).map(t => ({ resource: r.nm, template_id: t.id, template: t.n, object_type: t.ct }))),
);

tool('run_report', 'Run a Wialon report template (see list_reports) for a unit or unit group and period. Returns summary statistics and tables (trips, stops, mileage, fuel, engine hours, etc. depending on the template).', {
  template: z.string().describe('Template name or id from list_reports'),
  object: z.string().describe('Unit name for avl_unit templates, group name for avl_unit_group templates'),
  from, to,
  max_rows: z.number().int().min(1).max(5000).optional().describe('Rows per table, default 200'),
}, async args => {
  const [start, end] = range(args, 93);
  const resources = await wialon.search('avl_resource', 1 | 0x2000);
  const templates = resources.flatMap(r => Object.values(r.rep ?? {}).map(t => ({ ...t, resource: r.id })));
  const template = templates.find(t => String(t.id) === args.template || t.n.toLowerCase() === args.template.toLowerCase())
    ?? templates.find(t => t.n.toLowerCase().includes(args.template.toLowerCase()));
  if (!template) throw new Error(`Report template "${args.template}" not found`);
  const object = template.ct === 'avl_unit' ? await wialon.unit(args.object)
    : template.ct === 'avl_unit_group' ? await group(args.object)
    : null;
  if (!object) throw new Error(`Templates of type ${template.ct} are not supported`);

  await wialon.call('report/cleanup_result');
  const { reportResult } = await wialon.call('report/exec_report', {
    reportResourceId: template.resource, reportTemplateId: template.id, reportTemplate: null,
    reportObjectId: object.id, reportObjectSecId: 0, interval: { from: start, to: end, flags: 0 },
  });
  const limit = args.max_rows ?? 200;
  const cell = c => (c && typeof c === 'object' ? c.t : c);
  const tables = [];
  for (const [i, table] of reportResult.tables.entries()) {
    const rows = table.rows ? await wialon.call('report/select_result_rows', { tableIndex: i, config: { type: 'range', data: { from: 0, to: Math.min(table.rows, limit) - 1, level: 0 } } }) : [];
    tables.push({ table: table.label, header: table.header, total: table.total.map(cell), rows_total: table.rows, rows: rows.map(r => r.c.map(cell)) });
  }
  await wialon.call('report/cleanup_result');
  return { template: template.n, object: object.nm, from: wialon.time(start), to: wialon.time(end), stats: reportResult.stats, tables };
});

tool('list_geofences', 'Geofences (zones) of the Wialon account.', {}, async () =>
  (await wialon.search('avl_resource', 1 | 0x1000)).flatMap(r => Object.values(r.zl ?? {}).map(z => ({ resource: r.nm, geofence: z.n, description: z.d || null }))),
);

tool('list_drivers', 'Drivers registered in the Wialon account and the unit each is bound to now.', {}, async () => {
  const names = await unitNames();
  return (await wialon.search('avl_resource', 1 | 0x100)).flatMap(r => Object.values(r.drvrs ?? {}).map(d => ({ driver: d.n, phone: d.p || null, unit: names[d.bu] ?? null })));
});

function distance(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.y - a.y) * rad / 2) ** 2 + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin((b.x - a.x) * rad / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

await server.connect(new StdioServerTransport());
