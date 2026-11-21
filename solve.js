// A faster drop-in for make.fun's csv-reader 1.0.0: run(input) returns exactly
// csv-reader's answer {columns, rows, errors} for every input {text, header}.
//
// Same broken-row policy as the reference (vendor/csv-reader/index.js):
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote, and each CRLF or lone CR inside it is read as LF;
//     what follows its closing quote, up to the next comma or line break, is
//     appended to it as it stands (quote_junk, when the field ends); a quote
//     that never closes is read as a literal character and the text after it is
//     read again as an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded with "" (short_row) or cut (long_row) to the
//     first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside a quoted field counted), row its
//     record's index in rows (null for the header), in the order met.
//
// Speed comes from never reading one character at a time: unquoted fields are
// cut out with indexOf + slice (the next comma or line break is found by the
// engine, not by a JS loop), quoted fields jump from quote to quote the same
// way, and the only per-character work is the rare stray-CR / multi-line-quote
// path, over a single short field, never over the whole text. Pure: no clock,
// no randomness, no locale, nothing kept from one call to the next.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  let line = 1;

  // Whether the text holds any CR at all: when it holds none, every CR check
  // below is skipped (half the drawn files are pure LF).
  const hasCR = text.indexOf('\r') !== -1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and (for a quoted field's
  // junk tail) how many junk characters were kept.
  const out = { value: '', ended: END, added: 0 };

  // The index of the next LF at or after pos, or n when there is none left;
  // -1 while unknown. Unquoted fields never cross a line break, so one lookup
  // serves every field of a record; a quoted field may cross lines, so the
  // cache is dropped whenever pos moves anywhere but forward.
  let lineEnd = -1;

  // Reads unquoted characters onto `init` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Sets out.
  function readUnquoted(init) {
    if (lineEnd < pos) {
      const ix = text.indexOf('\n', pos);
      lineEnd = ix === -1 ? n : ix;
    }
    const comma = text.indexOf(',', pos);
    let end;
    let ended;
    if (comma === -1 || lineEnd < comma) {
      end = lineEnd;
      ended = lineEnd === n ? END : LINE_BREAK;
    } else {
      end = comma;
      ended = COMMA;
    }
    const seg = text.slice(pos, end);
    let value = init;
    let added = 0;
    const cr = hasCR ? seg.indexOf('\r') : -1;
    if (cr === -1) {
      value += seg;
      added = seg.length;
    } else if (ended === LINE_BREAK && cr === seg.length - 1) {
      // The one CR is the CRLF that ends the line: strip it, silently.
      value += seg.slice(0, -1);
      added = seg.length - 1;
    } else {
      // Stray CRs inside the field: drop each (stray_cr), except a trailing
      // one that is the CRLF ending the line. Rare: one short scan.
      let s = 0;
      for (;;) {
        const i = seg.indexOf('\r', s);
        if (i === -1) {
          value += seg.slice(s);
          added += seg.length - s;
          break;
        }
        value += seg.slice(s, i);
        added += i - s;
        if (i === seg.length - 1 && ended === LINE_BREAK) break;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        s = i + 1;
      }
    }
    if (ended === COMMA) pos = end + 1;
    else if (ended === LINE_BREAK) {
      pos = end + 1;
      line += 1;
    } else pos = n;
    out.value = value;
    out.added = added;
    out.ended = ended;
  }

  // Reads a quoted field whose opening quote is at pos. Sets out.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = pos + 1;
    let value = '';
    for (;;) {
      const q = text.indexOf('"', p);
      if (lineEnd < p) {
        const ix = text.indexOf('\n', p);
        lineEnd = ix === -1 ? n : ix;
      }
      const lf = lineEnd === n ? -1 : lineEnd;
      let bound;
      let isQuote;
      let isLF;
      if (q === -1) {
        if (lf === -1) {
          bound = n;
          isQuote = false;
          isLF = false;
        } else {
          bound = lf;
          isQuote = false;
          isLF = true;
        }
      } else if (lf === -1 || q < lf) {
        bound = q;
        isQuote = true;
        isLF = false;
      } else {
        bound = lf;
        isQuote = false;
        isLF = true;
      }
      if (bound > p) {
        const seg = text.slice(p, bound);
        const cr = hasCR ? seg.indexOf('\r') : -1;
        if (cr === -1) {
          value += seg;
        } else {
          // Every CR inside quotes is one LF in the value; a CR at the very
          // end of the segment, facing the LF at bound, is one CRLF with it.
          let s = 0;
          let consumedLF = false;
          for (;;) {
            const i = seg.indexOf('\r', s);
            if (i === -1) {
              value += seg.slice(s);
              break;
            }
            value += seg.slice(s, i);
            value += '\n';
            line += 1;
            if (i === seg.length - 1 && isLF) {
              consumedLF = true;
              break;
            }
            s = i + 1;
          }
          if (consumedLF) {
            p = bound + 1;
            continue;
          }
        }
      }
      if (isQuote) {
        if (text.charCodeAt(bound + 1) === 34) {
          // A doubled quote: one quote in the value, read on.
          value += '"';
          p = bound + 2;
          continue;
        }
        // Closed. What follows decides how the field ends.
        pos = bound + 1;
        if (pos >= n) {
          out.value = value;
          out.added = 0;
          out.ended = END;
          return;
        }
        const c = text.charCodeAt(pos);
        if (c === 44) {
          pos += 1;
          out.value = value;
          out.added = 0;
          out.ended = COMMA;
          return;
        }
        if (c === 10) {
          pos += 1;
          line += 1;
          out.value = value;
          out.added = 0;
          out.ended = LINE_BREAK;
          return;
        }
        if (c === 13 && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          out.value = value;
          out.added = 0;
          out.ended = LINE_BREAK;
          return;
        }
        // What follows the closing quote is appended as it stands, up to the
        // next comma or line break.
        readUnquoted(value);
        if (out.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        return;
      }
      if (isLF) {
        value += '\n';
        line += 1;
        p = bound + 1;
        continue;
      }
      // The quote never closes: it is a literal character, and the text after
      // it is read again as an unquoted field.
      line = openLine;
      lineEnd = -1;
      pos = open + 1;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text.charCodeAt(pos) === 10) {
        pos += 1;
        line += 1;
      } else if (text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) {
        readQuoted();
        lastQuoted = true;
      } else {
        readUnquoted('');
        lastQuoted = false;
      }
      fields.push(out.value);
      ended = out.ended;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
