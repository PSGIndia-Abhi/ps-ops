import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PlusIcon } from '../components/icons';
import { formatINR } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';

/**
 * The quotation's own price table (optional): some clients want the price laid out in their format.
 * { rows }: the first row the headings (bold on the quotation), the last row the total - a label
 * first and, in the last column, the amount, which becomes the quotation's one package price.
 * The same shape as the web builder's (frontend/src/pages/leads/priceTableData.js).
 */
/** `title`: the heading printed above the table on the quotation. */
/** `widths`: the column widths (percent) set by dragging - the PDF and Word file use them as they are. */
export type PriceTable = { rows: string[][]; title?: string; widths?: number[] | null };

export const DEFAULT_TABLE_TITLE = 'Price details';

export const TABLE_LIMITS = { minRows: 3, maxRows: 20, minCols: 2, maxCols: 6 };

export function newPriceTable(rows = 4, cols = 3): PriceTable {
  const head =
    cols === 2
      ? ['Service', 'Amount']
      : ['Service', 'Frequency', ...Array(cols - 3).fill(''), 'Amount'];
  const total = ['Total', ...Array(cols - 1).fill('')];
  return {
    title: DEFAULT_TABLE_TITLE,
    rows: [
      head,
      ...Array.from({ length: rows - 2 }, () => Array(cols).fill('')),
      total,
    ],
  };
}

/** A cell's amount (null when it is not a number). */
function cellAmount(value: string): number | null {
  const raw = String(value || '').replace(/[₹,\s]/g, '');
  return raw && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
}

/** The total: the Amount column (the last one) added up over the rows between headings and total. */
export function priceTableTotal(table: PriceTable | null): number {
  if (!table) return 0;
  const cols = table.rows[0].length;
  const sum = table.rows.slice(1, -1).reduce((t, r) => t + (cellAmount(r[cols - 1]) || 0), 0);
  return Math.round(sum * 100) / 100;
}

/** A saved quotation's table (as the server keeps it) -> the editor's rows, total row last. */
export function priceTableFromContent(t: { title?: string; header: string[]; body?: string[][]; totalLabel?: string; total?: number; widths?: number[] | null } | null | undefined): PriceTable | null {
  if (!t?.header?.length) return null;
  const cols = t.header.length;
  return {
    title: t.title ?? '',
    rows: [t.header, ...(t.body || []), [t.totalLabel || 'Total', ...Array(Math.max(0, cols - 2)).fill(''), String(t.total ?? '')]],
    widths: Array.isArray(t.widths) && t.widths.length === cols ? t.widths : null,
  };
}

/**
 * The columns' widths (percent) before anyone drags them: from the length of their text, so a short
 * column like "Sl No" starts narrow. The same rule as the web builder's.
 */
export function autoWidths(table: PriceTable): number[] {
  const cols = table.rows[0].length;
  const want = Array.from({ length: cols }, (_, c) =>
    Math.max(
      String(table.rows[0][c] || '').length + 4,
      ...table.rows.slice(1).map(r => Math.min(70, Math.max(...String(r[c] || '').split('\n').map(l => l.length)))),
      c === cols - 1 ? 12 : 6,
    ),
  );
  const sum = want.reduce((a, w) => a + w, 0);
  return want.map(w => Math.round((w / sum) * 1000) / 10);
}

/** The table as it is sent: trimmed, with the total row's amount filled in from the sum. */
export function priceTableForSave(table: PriceTable): PriceTable {
  const rows = table.rows.map(r => r.map(c => c.trim()));
  const last = rows[rows.length - 1];
  last[last.length - 1] = String(priceTableTotal(table) || '');
  return { title: (table.title ?? '').trim(), rows, ...(table.widths ? { widths: table.widths } : {}) };
}

/** The table at a new size: cells kept where they still fit; the total row keeps its label and amount. */
function resize(table: PriceTable, rows: number, cols: number): PriceTable {
  const old = table.rows;
  const head = old[0];
  const body = old.slice(1, -1);
  const total = old[old.length - 1];
  const fit = (r: string[]) =>
    r.length >= cols
      ? r.slice(0, cols)
      : [...r, ...Array(cols - r.length).fill('')];
  const bodyRows = rows - 2;
  const nextBody =
    body.length >= bodyRows
      ? body.slice(0, bodyRows)
      : [
          ...body,
          ...Array.from({ length: bodyRows - body.length }, () =>
            Array(cols).fill(''),
          ),
        ];
  return {
    title: table.title,
    rows: [
      fit(head),
      ...nextBody.map(fit),
      [total[0], ...Array(cols - 2).fill(''), total[total.length - 1]],
    ],
    // Another number of columns: the dragged widths no longer fit, so they go back to automatic.
    widths: cols === head.length ? table.widths ?? null : null,
  };
}

// A line that is a numbered point: "1. text" or "2) text" ("1.5 kg" is not one).
const POINT_RE = /^(\s*)(\d{1,3})([.)])(?!\d)\s*(.*)$/;

/**
 * Word-style numbering as you type: when a new line is started after a numbered point ("1. ..."),
 * it starts with the next number ("2. "); a new line after an empty point removes that number.
 */
export function continuePoints(prev: string, next: string): string {
  if (next.length <= prev.length) return next; // something was deleted
  // What was typed: the part between what stayed the same at the start and at the end. A phone
  // keyboard often sends the end of a word and the Enter together ("ii\n"), so it can be more than one
  // character - it counts when it ends with the only new line break.
  let start = 0;
  while (start < prev.length && prev[start] === next[start]) start++;
  let end = 0;
  while (end < prev.length - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;
  const typed = next.slice(start, next.length - end);
  if (!typed.endsWith('\n') || typed.indexOf('\n') !== typed.length - 1) return next;
  const i = start + typed.length - 1; // the new line break
  const before = next.slice(0, i);
  const after = next.slice(i + 1);
  const lineStart = before.lastIndexOf('\n') + 1;
  const point = POINT_RE.exec(before.slice(lineStart));
  if (!point) return next;
  if (!point[4].trim() && !after.split('\n')[0].trim()) return before.slice(0, lineStart) + after;
  return `${before}\n${point[1]}${Number(point[2]) + 1}${point[3]} ${after}`;
}

const MIN_CELL = 104; // narrower than this (on average) and the table scrolls sideways instead
const MIN_PCT = 8; // a column can be dragged down to this share of the table...
const MIN_AMOUNT_PCT = 26; // ...and the Amount column (the last) to this, so the amounts stay readable

const factory = (t: CrmTheme) => ({
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: t.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.bodyMedium, color: t.textPrimary },
  emptyText: { ...typography.caption, color: t.textMuted },
  addBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.primary,
  },
  addText: { ...typography.captionMedium, color: t.primary },
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stepper: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 4,
    paddingLeft: spacing.md,
    paddingRight: 4,
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
  },
  stepControls: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  stepLabel: { ...typography.caption, color: t.textMuted },
  stepValue: {
    ...typography.bodyMedium,
    color: t.textPrimary,
    minWidth: 18,
    textAlign: 'center' as const,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepBtnText: {
    ...typography.bodyMedium,
    color: t.textPrimary,
    lineHeight: 20,
  },
  disabled: { opacity: 0.35 },
  titleLabel: { ...typography.captionMedium, color: t.textSecondary, marginBottom: 4 },
  titleInput: {
    ...typography.bodyMedium,
    color: t.textPrimary,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
    marginBottom: spacing.sm,
  },
  // The total cell: a small AUTO tag above the amount, so the amount keeps the full width.
  autoCell: { alignItems: 'flex-end' as const, justifyContent: 'center' as const, gap: 1, paddingHorizontal: spacing.sm, paddingVertical: 4, minHeight: 44 },
  autoTag: { ...typography.caption, fontSize: 9, fontWeight: '700' as const, color: t.primary, backgroundColor: t.surface, paddingHorizontal: 5, borderRadius: 6, overflow: 'hidden' as const },
  autoValue: { ...typography.body, color: t.textPrimary, flexShrink: 1 },
  footRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  remove: {
    paddingLeft: spacing.sm,
    minHeight: 32,
    justifyContent: 'center' as const,
  },
  removeText: { ...typography.captionMedium, color: t.danger },
  grid: {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.md,
    overflow: 'hidden' as const,
  },
  row: {
    flexDirection: 'row' as const,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  rowFirst: { borderTopWidth: 0 },
  head: { backgroundColor: '#e4e9f1' },
  total: { backgroundColor: t.primarySoftBg },
  cell: { borderLeftWidth: 1, borderLeftColor: t.border },
  cellFirst: { borderLeftWidth: 0 },
  input: {
    ...typography.body,
    color: t.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    minHeight: 44,
  },
  bold: { fontWeight: '700' as const },
  right: { textAlign: 'right' as const },
  foot: { ...typography.caption, color: t.textSecondary, flex: 1 },
  footStrong: { color: t.textPrimary, fontWeight: '700' as const },
  hint: { ...typography.caption, color: t.textMuted, flex: 1 },
  dragHint: { ...typography.caption, color: t.textMuted, marginBottom: spacing.sm },
  multi: { textAlignVertical: 'top' as const, paddingTop: 10 },
  // The grip at a heading's right edge: drag it sideways to change the column widths.
  grip: { position: 'absolute' as const, top: 0, bottom: 0, right: 0, width: 18, alignItems: 'flex-end' as const, justifyContent: 'center' as const, zIndex: 2 },
  gripBar: { width: 3, height: '60%' as const, borderRadius: 2, backgroundColor: '#94a3b8', marginRight: 1 },
  gripBarActive: { backgroundColor: t.primary },
  reset: { paddingLeft: spacing.sm, minHeight: 32, justifyContent: 'center' as const },
  resetText: { ...typography.captionMedium, color: t.primary },
});

/** A grip a finger drags sideways; reports how far it moved (in points) since the drag began. */
function ColumnGrip({ onStart, onDrag, onEnd, active, label }: { onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void; active: boolean; label: string }) {
  const { styles } = useCrmStyles(factory);
  const handlers = useRef({ onStart, onDrag, onEnd });
  useEffect(() => {
    handlers.current = { onStart, onDrag, onEnd };
  });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => handlers.current.onStart(),
      onPanResponderMove: (_e, g) => handlers.current.onDrag(g.dx),
      onPanResponderRelease: () => handlers.current.onEnd(),
      onPanResponderTerminate: () => handlers.current.onEnd(),
    }),
  ).current;
  return (
    <View {...pan.panHandlers} style={styles.grip} hitSlop={{ left: 10, right: 6 }} accessibilityLabel={label}>
      <View style={[styles.gripBar, active && styles.gripBarActive]} />
    </View>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepControls}>
        <Pressable
          onPress={() => onChange(value - 1)}
          disabled={value <= min}
          style={[styles.stepBtn, value <= min && styles.disabled]}
          accessibilityLabel={`Fewer ${label.toLowerCase()}`}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable
          onPress={() => onChange(value + 1)}
          disabled={value >= max}
          style={[styles.stepBtn, value >= max && styles.disabled]}
          accessibilityLabel={`More ${label.toLowerCase()}`}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Add / edit / remove the price table. Wider tables scroll sideways. */
export function PriceTableEditor({
  table,
  onChange,
}: {
  table: PriceTable | null;
  onChange: (t: PriceTable | null) => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [width, setWidth] = useState(0); // the space the table has, to share between its columns
  const [dragging, setDragging] = useState<number | null>(null); // the grip being dragged
  const startWidths = useRef<number[]>([]);
  if (!table) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>
          Need the price in the client's own format?
        </Text>
        <Text style={styles.emptyText}>
          Lay it out as a table - you choose the rows and columns. The amount in
          the last row becomes the package price.
        </Text>
        <Pressable
          onPress={() => onChange(newPriceTable())}
          style={styles.addBtn}
          accessibilityRole="button"
        >
          <PlusIcon size={14} color={theme.primary} />
          <Text style={styles.addText}>Add a price table</Text>
        </Pressable>
      </View>
    );
  }
  const rows = table.rows.length;
  const cols = table.rows[0].length;
  const set = (r: number, c: number, v: string) =>
    onChange({
      ...table,
      rows: table.rows.map((row, i) =>
        i === r ? row.map((x, j) => (j === c ? v : x)) : row,
      ),
    });
  const total = priceTableTotal(table);
  // Column widths in percent: set by dragging, else automatic from the text. The table is as wide as
  // the screen, or wider (scrolling sideways) when it has many columns.
  const dragged = Array.isArray(table.widths) && table.widths.length === cols;
  const widths = dragged ? (table.widths as number[]) : autoWidths(table);
  const gridW = Math.max(width ? width - 2 : 0, cols * MIN_CELL * 0.8);
  // A cell between the headings and the total, not an amount: it can hold several lines.
  const textCell = (r: number, c: number) => r > 0 && r < rows - 1 && c < cols - 1;
  const startDrag = (c: number) => {
    startWidths.current = [...widths];
    setDragging(c);
  };
  // Moving the grip between column c and c + 1 moves width from one to the other.
  const drag = (c: number) => (dx: number) => {
    const start = startWidths.current;
    if (!start.length || !gridW) return;
    const pair = start[c] + start[c + 1];
    const rightMin = c + 1 === cols - 1 ? MIN_AMOUNT_PCT : MIN_PCT;
    const left = Math.min(Math.max(start[c] + (dx / gridW) * 100, MIN_PCT), pair - rightMin);
    const next = [...start];
    next[c] = Math.round(left * 10) / 10;
    next[c + 1] = Math.round((pair - left) * 10) / 10;
    onChange({ ...table, widths: next });
  };
  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {/* The heading printed above the table on the quotation. */}
      <Text style={styles.titleLabel}>Table heading</Text>
      <TextInput
        value={table.title ?? ''}
        onChangeText={v => onChange({ ...table, title: v })}
        placeholder={DEFAULT_TABLE_TITLE}
        placeholderTextColor={theme.textMuted}
        maxLength={80}
        style={styles.titleInput}
      />
      <View style={styles.bar}>
        <Stepper
          label="Rows"
          value={rows}
          min={TABLE_LIMITS.minRows}
          max={TABLE_LIMITS.maxRows}
          onChange={n => onChange(resize(table, n, cols))}
        />
        <Stepper
          label="Columns"
          value={cols}
          min={TABLE_LIMITS.minCols}
          max={TABLE_LIMITS.maxCols}
          onChange={n => onChange(resize(table, rows, n))}
        />
      </View>
      <Text style={styles.dragHint}>Drag the grey bar at the edge of a heading to set the column widths - the PDF uses the same widths.</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={gridW > width}
        scrollEnabled={dragging === null}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.grid}>
          {table.rows.map((row, r) => {
            const head = r === 0;
            const totalRow = r === rows - 1;
            return (
              <View
                key={r}
                style={[
                  styles.row,
                  r === 0 && styles.rowFirst,
                  head && styles.head,
                  totalRow && styles.total,
                ]}
              >
                {row.map((cell, c) => {
                  const amountCell = totalRow && c === cols - 1;
                  const amountCol = !head && !totalRow && c === cols - 1;
                  const blank = totalRow && c > 0 && !amountCell;
                  return (
                    <View
                      key={c}
                      style={[
                        styles.cell,
                        { width: (widths[c] / 100) * gridW },
                        c === 0 && styles.cellFirst,
                      ]}
                    >
                      {blank ? null : amountCell ? (
                        // The total adds the Amount column up by itself.
                        <View style={styles.autoCell} accessibilityLabel={`Total, added up automatically: ${formatINR(total)}`}>
                          <Text style={styles.autoTag}>AUTO</Text>
                          <Text style={[styles.autoValue, styles.bold]} numberOfLines={1}>
                            {total > 0 ? formatINR(total) : '-'}
                          </Text>
                        </View>
                      ) : (
                        <TextInput
                          value={cell}
                          onChangeText={v =>
                            set(
                              r,
                              c,
                              amountCol
                                ? v.replace(/[^\d.]/g, '')
                                : textCell(r, c)
                                ? continuePoints(cell, v)
                                : v,
                            )
                          }
                          placeholder={
                            head
                              ? `Heading ${c + 1}`
                              : amountCol
                              ? '0'
                              : totalRow
                              ? 'Total'
                              : r === 1 && c === cols - 2
                              ? 'Enter = new line (1. 2. ...)'
                              : ''
                          }
                          placeholderTextColor={theme.textMuted}
                          keyboardType={amountCol ? 'decimal-pad' : 'default'}
                          // The lines between the headings and the total hold several lines (points 1. 2. ...).
                          multiline={textCell(r, c)}
                          maxLength={head ? 300 : textCell(r, c) ? 5000 : 120}
                          style={[
                            styles.input,
                            textCell(r, c) && styles.multi,
                            (head || totalRow) && styles.bold,
                            c === cols - 1 && styles.right,
                          ]}
                        />
                      )}
                      {head && c < cols - 1 && (
                        <ColumnGrip
                          onStart={() => startDrag(c)}
                          onDrag={drag(c)}
                          onEnd={() => setDragging(null)}
                          active={dragging === c}
                          label={`Drag to change the width of column ${c + 1}`}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.footRow}>
        {total > 0 ? (
          <Text style={styles.foot}>
            Total (added up automatically):{' '}
            <Text style={styles.footStrong}>{formatINR(total)}</Text>
          </Text>
        ) : (
          <Text style={styles.hint}>
            Type the amounts in the last column - the total adds up by
            itself.
          </Text>
        )}
        {dragged && (
          <Pressable
            onPress={() => onChange({ ...table, widths: null })}
            style={styles.reset}
            accessibilityRole="button"
            accessibilityLabel="Reset the column widths"
          >
            <Text style={styles.resetText}>Reset widths</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => onChange(null)}
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel="Remove the price table"
        >
          <Text style={styles.removeText}>Remove table</Text>
        </Pressable>
      </View>
    </View>
  );
}
