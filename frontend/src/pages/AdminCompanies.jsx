import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import "./AdminCompanies.css";

const defaultForm = {
  name: "",
  code: "",
  site: "",
  address: "",
  city: "",
  state: "",
  gst_number: "",
  type: "CORPORATE",
};

export default function AdminCompanies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(defaultForm);
  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/companies");
      if (!res?.ok) throw new Error("Failed to load companies");
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const codeOptions = useMemo(() => {
    const codes = companies.map(c => c.code).filter(Boolean);
    return Array.from(new Set(codes)).sort();
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter(c => {
      const values = [
        c.name,
        c.code,
        c.site,
        c.address,
        c.city,
        c.state,
        c.gst_number,
        c.type
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return values.includes(query);
    });
  }, [companies, search]);

  const update = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.site.trim() || !form.address.trim()) {
      setError("Name, code, site, and address are required.");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        site: form.site.trim(),
        address: form.address.trim(),
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        gst_number: form.gst_number.trim() || null,
        type: form.type,
      };

      const res = await apiFetch("/api/companies", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const data = await res?.json();

      if (!res?.ok) {
        throw new Error(data?.error || "Failed to create company");
      }

      setCompanies(prev => [data, ...prev]);
      setForm(defaultForm);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create company");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="companies-page">
      <div className="companies-header">
        <div>
          <h2>Companies</h2>
          <p>Manage company sites and create new entries.</p>
        </div>
      </div>

      <div className="companies-card">
        <div className="companies-card-header">
          <div>
            <h3>Add Company Site</h3>
            <p>Codes can repeat across sites, but each site must be unique for a code.</p>
          </div>
          <button className="primary" onClick={handleCreate} disabled={saving}>
            {saving ? "Saving..." : "Add Company"}
          </button>
        </div>

        {error && <div className="companies-error">{error}</div>}

        <div className="company-form">
          <div className="company-field">
            <label>Company Name *</label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. PS Group"
            />
          </div>

          <div className="company-field">
            <label>Company Code *</label>
            <input
              list="company-code-list"
              value={form.code}
              onChange={(e) => update("code", e.target.value.toUpperCase())}
              placeholder="e.g. PSG"
            />
            <datalist id="company-code-list">
              {codeOptions.map(code => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </div>

          <div className="company-field">
            <label>Site *</label>
            <input
              value={form.site}
              onChange={(e) => update("site", e.target.value)}
              placeholder="e.g. Jayanagar"
            />
          </div>

          <div className="company-field">
            <label>Address *</label>
            <input
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Street, building, area"
            />
          </div>

          <div className="company-field">
            <label>City</label>
            <input
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="City"
            />
          </div>

          <div className="company-field">
            <label>State</label>
            <input
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
              placeholder="State"
            />
          </div>

          <div className="company-field">
            <label>GST Number</label>
            <input
              value={form.gst_number}
              onChange={(e) => update("gst_number", e.target.value)}
              placeholder="GST Number"
            />
          </div>

          <div className="company-field">
            <label>Type</label>
            <select
              value={form.type}
              onChange={(e) => update("type", e.target.value)}
            >
              <option value="CORPORATE">CORPORATE</option>
              <option value="INDIVIDUAL">INDIVIDUAL</option>
              <option value="RWA">RWA</option>
            </select>
          </div>
        </div>
      </div>

      <div className="companies-card">
        <div className="companies-card-header">
          <div>
            <h3>Company Sites</h3>
            <p>{filteredCompanies.length} total</p>
          </div>
          <input
            className="company-search"
            placeholder="Search by name, code, site, or city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="companies-loading">Loading companies...</div>
        ) : (
          <div className="companies-table">
      

            {filteredCompanies.map(company => {
              const addressParts = [company.address, company.city, company.state].filter(Boolean);
              return (
                <div className="companies-row">

                  <div className="company-mobile-card">

                    <div className="company-row">
                      <span className="label">Code</span>
                      <span className="value">{company.code}</span>
                    </div>

                    <div className="company-row">
                      <span className="label">Name</span>
                      <span className="value">{company.name}</span>
                    </div>

                    <div className="company-row">
                      <span className="label">Site</span>
                      <span className="value">{company.site || "-"}</span>
                    </div>

                    <div className="company-row">
                      <span className="label">Address</span>
                      <span className="value">{company.address || "-"}</span>
                    </div>

                    <div className="company-row">
                      <span className="label">Type</span>
                      <span className="value">{company.type}</span>
                    </div>

                  </div>

                  <div className="status-cell">
                    <div>{company.status}</div>

                    <button
                      onClick={() =>
                        navigate(`/admin/sites/${company.id}/contacts`)
                      }
                    >
                      Show Contacts
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
