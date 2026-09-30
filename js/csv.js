/** RFC 4180-style CSV. Quoted fields may contain commas, newlines, and "". */

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < src.length; index += 1) {
    const char = src[index];
    if (inQuotes) {
      if (char === '"') {
        if (src[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && src[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (inQuotes) field += "";
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
}

export function rowsToRecords(rows) {
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map((cell) => cell.trim());
  const records = rows.slice(1).map((row) => {
    const record = {};
    header.forEach((name, index) => {
      if (!name) return;
      record[name] = row[index] == null ? "" : String(row[index]).trim();
    });
    return record;
  });
  return { header, records };
}
