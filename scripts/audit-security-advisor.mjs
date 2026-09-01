import fs from 'node:fs';

const schema = fs.readFileSync('schema.sql', 'utf8');

// Parse CREATE TABLE and ALTER TABLE foreign keys
const fkList = [];
const tableIndexes = new Map(); // table -> Set of indexed column expressions

// Parse CREATE INDEX
const indexMatches = [...schema.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s+using\s+[a-z]+)?\s*\(([^)]+)\)/gi)];
for (const match of indexMatches) {
  const [, indexName, tableName, cols] = match;
  const t = tableName.toLowerCase();
  if (!tableIndexes.has(t)) tableIndexes.set(t, new Set());
  // Extract leading column
  const firstCol = cols.split(',')[0].trim().replace(/^["']|["']$/g, '').split(' ')[0].toLowerCase();
  tableIndexes.get(t).add(firstCol);
}

// Parse inline foreign keys in CREATE TABLE: references other_table(id) or references other_table
const tableChunks = schema.split(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(/i);
for (let i = 1; i < tableChunks.length; i += 2) {
  const tableName = tableChunks[i].toLowerCase();
  const body = tableChunks[i + 1].split(');')[0];
  const colLines = body.split('\n');
  for (const line of colLines) {
    const trimmed = line.trim();
    const fkMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+[^,]*\breferences\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s*\(([a-zA-Z0-9_]+)\))?/i);
    if (fkMatch) {
      const [, colName, refTable, refCol] = fkMatch;
      fkList.push({ table: tableName, col: colName.toLowerCase(), refTable: refTable.toLowerCase(), refCol: refCol || 'id' });
    }
    // Also constraint foreign keys: foreign key (col) references table(col)
    const constraintMatch = trimmed.match(/foreign\s+key\s*\(([a-zA-Z0-9_]+)\)\s+references\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s*\(([a-zA-Z0-9_]+)\))?/i);
    if (constraintMatch) {
      const [, colName, refTable, refCol] = constraintMatch;
      fkList.push({ table: tableName, col: colName.toLowerCase(), refTable: refTable.toLowerCase(), refCol: refCol || 'id' });
    }
  }
}

// Parse ALTER TABLE ADD FOREIGN KEY
const alterMatches = [...schema.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+add\s+(?:constraint\s+[a-zA-Z0-9_]+\s+)?foreign\s+key\s*\(([a-zA-Z0-9_]+)\)\s+references\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)];
for (const match of alterMatches) {
  const [, tableName, colName, refTable] = match;
  fkList.push({ table: tableName.toLowerCase(), col: colName.toLowerCase(), refTable: refTable.toLowerCase(), refCol: 'id' });
}

console.log(`Total Foreign Keys found: ${fkList.length}`);
const unindexedFks = [];
for (const fk of fkList) {
  const indexes = tableIndexes.get(fk.table);
  // An index exists if the table has an index starting with that column
  if (!indexes || !indexes.has(fk.col)) {
    unindexedFks.push(fk);
  }
}

console.log(`Unindexed Foreign Keys: ${unindexedFks.length}`);
unindexedFks.forEach(fk => console.log(`  Table: ${fk.table.padEnd(30)} Col: ${fk.col.padEnd(25)} References: ${fk.refTable}`));
