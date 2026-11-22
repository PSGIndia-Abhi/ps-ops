// Loading states for the billing pages: shimmer skeletons shaped like what is loading, and a
// centred spinner for the first load of the billing area. Never a bare "Loading…" text.

/** One shimmer block. */
export function Bone({ w = "100%", h = 14, r = 8, style }) {
  return <span className="sk-bone" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

/** Centred spinner (whole area waiting). */
export function CenterSpinner({ label = "Loading" }) {
  return (
    <div className="sk-center" role="status" aria-label={label}>
      <span className="sk-spin" aria-hidden="true" />
      <span className="sk-center-txt">{label}…</span>
    </div>
  );
}

/** List rows (dashboard lists, small tables). */
export function RowsSkeleton({ rows = 4, avatar = false }) {
  return (
    <div className="sk-rows" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">
          {avatar && <Bone w={34} h={34} r={10} />}
          <div className="sk-row-txt">
            <Bone w={`${55 - (i % 3) * 10}%`} h={13} />
            <Bone w={`${35 - (i % 2) * 8}%`} h={11} />
          </div>
          <Bone w={80} h={16} />
        </div>
      ))}
    </div>
  );
}

/** An invoice (issued invoice page, draft invoice): header, parties, lines and totals. */
export function InvoiceSkeleton() {
  return (
    <div className="ac-page" role="status" aria-label="Loading the invoice">
      <div className="sk-head">
        <div style={{ flex: 1 }}>
          <Bone w={140} h={12} />
          <Bone w={260} h={26} style={{ marginTop: 10 }} />
          <Bone w={340} h={12} style={{ marginTop: 10 }} />
        </div>
        <div className="sk-head-actions"><Bone w={110} h={38} r={10} /><Bone w={110} h={38} r={10} /></div>
      </div>
      <div className="sk-split">
        <div className="ac-card sk-card">
          <div className="sk-parties">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sk-party">
                <Bone w={70} h={11} />
                <Bone w="80%" h={14} style={{ marginTop: 10 }} />
                <Bone w="95%" h={11} style={{ marginTop: 8 }} />
                <Bone w="60%" h={11} style={{ marginTop: 6 }} />
              </div>
            ))}
          </div>
          <div className="sk-table">
            <div className="sk-tr sk-th"><Bone w="30%" h={11} /><Bone w="12%" h={11} /><Bone w="10%" h={11} /><Bone w="14%" h={11} /></div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sk-tr"><Bone w={`${45 - i * 5}%`} h={13} /><Bone w="12%" h={13} /><Bone w="8%" h={13} /><Bone w="14%" h={13} /></div>
            ))}
          </div>
        </div>
        <div className="ac-card sk-card">
          <Bone w={90} h={14} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sk-kv"><Bone w="40%" h={12} /><Bone w="28%" h={12} /></div>
          ))}
          <div className="sk-total"><Bone w="30%" h={18} /><Bone w="40%" h={22} /></div>
        </div>
      </div>
    </div>
  );
}

/** A form page (contract, SOS entry): header, a card of fields, a table. */
export function PageSkeleton({ rows = 5 }) {
  return (
    <div className="ac-page" role="status" aria-label="Loading">
      <div className="sk-head">
        <div style={{ flex: 1 }}>
          <Bone w={160} h={12} />
          <Bone w={280} h={26} style={{ marginTop: 10 }} />
          <Bone w={360} h={12} style={{ marginTop: 10 }} />
        </div>
      </div>
      <div className="ac-card sk-card">
        <div className="sk-fields">
          {[0, 1, 2, 3].map((i) => <div key={i}><Bone w={90} h={11} /><Bone h={40} r={10} style={{ marginTop: 8 }} /></div>)}
        </div>
      </div>
      <div className="ac-card sk-card">
        <div className="sk-table">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="sk-tr"><Bone w={`${42 - (i % 3) * 6}%`} h={13} /><Bone w="14%" h={13} /><Bone w="10%" h={13} /><Bone w="12%" h={13} /></div>
          ))}
        </div>
      </div>
    </div>
  );
}
