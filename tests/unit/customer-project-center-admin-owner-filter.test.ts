import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildProjectOwnerFilterKeys,
  buildProjectOwnerFilterOptions,
  matchesProjectOwnerFilter,
} from '../../src/lib/customer-projects/project-owner-filter';

console.log('\n=== CPC Admin All-Projects Business Owner Filter ===');

const rows = [
  { ownerProfileId: 'sales-B', ownerName: '吴浚铠' },
  { ownerProfileId: 'sales-A', ownerName: '叶展龙' },
  { ownerProfileId: 'sales-A', ownerName: '叶展龙' },
  { ownerProfileId: 'sales-C', ownerName: '叶展龙' }, // same name, different account
  { ownerProfileId: 'sales-D', ownerName: null },
];
const keys = buildProjectOwnerFilterKeys(rows);
const shuffledKeys = buildProjectOwnerFilterKeys([...rows].reverse());

assert.equal(keys.size, 4, 'four distinct employee IDs generate four separate options');
assert.deepEqual([...keys.entries()], [...shuffledKeys.entries()], 'keys are deterministic regardless of project ordering');
assert.equal(keys.get('sales-A'), 'owner-1', 'keys are stable, opaque and project owner based');
assert.notEqual(keys.get('sales-A'), keys.get('sales-C'), 'two employees sharing a name remain separate');
assert.ok([...keys.values()].every(key => !key.includes('sales-')), 'no raw employee profile ID in filter keys');

const options = buildProjectOwnerFilterOptions(rows.map(row => ({
  ownerFilterKey: keys.get(row.ownerProfileId),
  ownerName: row.ownerName,
})));
assert.equal(options.length, 4, 'one option per actual owner with projects');
assert.deepEqual(options.map(option => option.count).sort(), [1, 1, 1, 2], 'correct per-owner project counts');
assert.equal(options.find(option => option.key === keys.get('sales-A'))?.count, 2, 'count aggregated by owner ID');
assert.ok(options.filter(option => option.name === '叶展龙').every(option => option.label.includes('同名账号')),
  'duplicate display names do not collapse different owners');
assert.equal(options.find(option => option.key === keys.get('sales-D'))?.name, '姓名待确认',
  'missing employee display name still has a distinct selectable option');
assert.ok(options.every(option => option.key !== 'all'), 'all-owner choice stays separate');

const sampleA = { ownerFilterKey: keys.get('sales-A'), ownerName: '叶展龙' };
const sampleB = { ownerFilterKey: keys.get('sales-B'), ownerName: '吴浚铠' };
assert.ok(matchesProjectOwnerFilter(sampleA, 'all'), 'default all includes projects');
assert.ok(matchesProjectOwnerFilter(sampleB, 'all'), 'default all includes other owners');
assert.ok(matchesProjectOwnerFilter(sampleA, keys.get('sales-A')!), 'selected owner includes own project');
assert.ok(!matchesProjectOwnerFilter(sampleB, keys.get('sales-A')!), 'selected owner excludes other projects');
assert.ok(!matchesProjectOwnerFilter({ ownerFilterKey: undefined }, keys.get('sales-A')!),
  'missing owner filter keys never get incorrectly attributed');

const page = fs.readFileSync('src/app/customer-projects/projects/ProjectsClient.tsx', 'utf8');
const server = fs.readFileSync('src/lib/customer-projects/server-reads.ts', 'utf8');
const api = fs.readFileSync('src/app/api/customer-projects/projects/route.ts', 'utf8');

assert.ok(page.includes("filter === 'all' && canFilterByOwner"), 'dropdown only appears in All view to privileged users');
assert.ok(page.includes('按业务负责人筛选项目'), 'filter has accessible label');
assert.ok(page.includes('全部业务员'), 'reset choice is available');
assert.ok(page.includes('option.label'), 'choices use real salesperson names');
assert.ok(page.includes('option.count'), 'choices show project counts');
assert.ok(page.includes("matchesProjectOwnerFilter(project, selectedOwnerKey)"), 'filter is applied before text search');
assert.ok(page.includes('project.ownerName ??'), 'existing name keyword search is retained');
assert.ok(page.includes("if (item.key !== 'all') setSelectedOwnerKey('all')"),
  'switching to other tabs resets owner filter');
for (const label of ['我负责的', '推进中', '等待中', '需要处理', '已结束', '全部']) {
  assert.ok(page.includes(label), 'keeps existing list tab ' + label);
}
for (const source of [server, api]) {
  assert.ok(source.includes("profile.role === 'admin'"), 'only authenticated admin receives filter keys');
  assert.ok(source.includes('buildProjectOwnerFilterKeys(hydrated)'), 'actual project owner ID drives filter');
  assert.ok(source.includes('ownerFilterKey: ownerFilterKeys.get('), 'admin-only key serialized for display');
  assert.ok(!source.includes('ownerProfileId: project.ownerProfileId'), 'raw employee IDs are not returned to browser');
  assert.ok(!source.includes("'service_role'"), 'never bypass existing project RLS');
}

console.log('PASS: admin-only owner filter, duplicate names, counts, empty labels, tab/search and privacy');
