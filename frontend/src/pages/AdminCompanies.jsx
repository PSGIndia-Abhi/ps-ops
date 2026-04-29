import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import "./AdminCompanies.css";

const defaultGroupForm = { name: "" };
const defaultCompanyForm = {
  group_id: "",
  name: "",
  gst_number: "",
  type: "CORPORATE",
};
const defaultSiteForm = {
  company_id: "",
  name: "",
  address: "",
  city: "",
  state: "",
};

export default function AdminCompanies() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingSite, setSavingSite] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [groupForm, setGroupForm] = useState(defaultGroupForm);
  const [companyForm, setCompanyForm] = useState(defaultCompanyForm);
  const [siteForm, setSiteForm] = useState(defaultSiteForm);
  const [companyLogoFile, setCompanyLogoFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(Date.now());

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [gRes, cRes, sRes] = await Promise.all([
        apiFetch("/api/groups"),
        apiFetch("/api/companies"),
        apiFetch("/api/sites"),
      ]);

      if (!gRes?.ok || !cRes?.ok || !sRes?.ok) {
        throw new Error("Failed to load company data");
      }

      const [gData, cData, sData] = await Promise.all([
        gRes.json(),
        cRes.json(),
        sRes.json(),
      ]);

      setGroups(Array.isArray(gData) ? gData : []);
      setCompanies(Array.isArray(cData) ? cData : []);
      setSites(Array.isArray(sData) ? sData : []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load company data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredSites = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sites;
    return sites.filter((site) => {
      const values = [
        site.group_name,
        site.company_name,
        site.name,
        site.address,
        site.city,
        site.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return values.includes(query);
    });
  }, [sites, search]);

  const updateGroup = (key, value) => {
    setGroupForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCompany = (key, value) => {
    setCompanyForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSite = (key, value) => {
    setSiteForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateGroup = async () => {
    if (!groupForm.name.trim()) {
      setError("Group name is required.");
      return;
    }

    try {
      setSavingGroup(true);
      const res = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: groupForm.name.trim() }),
      });
      const data = await res?.json();
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to create group");
      }
      setGroups((prev) => [data, ...prev]);
      setGroupForm(defaultGroupForm);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create group");
    } finally {
      setSavingGroup(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!companyForm.name.trim()) {
      setError("Company name is required.");
      return;
    }

    try {
      setSavingCompany(true);
      const payload = {
        group_id: companyForm.group_id || null,
        name: companyForm.name.trim(),
        gst_number: companyForm.gst_number.trim() || null,
        type: companyForm.type,
      };

      const res = await apiFetch("/api/companies", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res?.json();
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to create company");
      }
      if (companyLogoFile) {
        const formData = new FormData();
        formData.append("file", companyLogoFile);
        const uploadRes = await apiFetch(`/api/companies/${data.id}/logo`, {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes?.json();
        if (!uploadRes?.ok) {
          throw new Error(uploadData?.error || "Failed to upload logo");
        }
        data.logo_url = uploadData?.logo_url || data.logo_url || null;
      }
      setCompanies((prev) => [data, ...prev]);
      setCompanyForm(defaultCompanyForm);
      setCompanyLogoFile(null);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create company");
    } finally {
      setSavingCompany(false);
    }
    setFileInputKey(Date.now()); 
  };

  const handleCreateSite = async () => {
    if (!siteForm.company_id) {
      setError("Company is required for a site.");
      return;
    }
    if (!siteForm.name.trim()) {
      setError("Site name is required.");
      return;
    }
    if (!siteForm.address.trim()) {
      setError("Address is required.");
      return;
    }

    try {
      setSavingSite(true);
      const payload = {
        company_id: siteForm.company_id,
        name: siteForm.name.trim(),
        address: siteForm.address.trim(),
        city: siteForm.city.trim() || null,
        state: siteForm.state.trim() || null,
      };

      const res = await apiFetch("/api/sites", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res?.json();
      if (!res?.ok) {
        throw new Error(data?.error || "Failed to create site");
      }
      setSites((prev) => [data, ...prev]);
      setSiteForm(defaultSiteForm);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create site");
    } finally {
      setSavingSite(false);
    }
  };

  return (
    <div className="companies-page">
      <div className="companies-header">
        <div>
          <h2>Groups, Companies & Sites</h2>
          <p>Define groups, legal companies, and their physical sites.</p>
        </div>
      </div>

      <div className="companies-card">
        <div className="companies-card-header">
          <div>
            <h3>Add Group</h3>
            <p>Group = parent organization.</p>
          </div>

        </div>

        {error && <div className="companies-error">{error}</div>}

        <div className="company-form">
          <div className="company-field">
            <label>Group Name *</label>
            <input
              value={groupForm.name}
              onChange={(e) => updateGroup("name", e.target.value)}
              placeholder="e.g. Manipal Education & Medical Group"
            />
          </div>
          <button className="primary" onClick={handleCreateGroup} disabled={savingGroup}>
            {savingGroup ? "Saving..." : "Add Group"}
          </button>
        </div>
      </div>

      <div className="companies-card">
        <div className="companies-card-header">
          <div>
            <h3>Add Company (Legal Entity)</h3>
            <p>Company = legal company name under a group.</p>
          </div>

        </div>

        {error && <div className="companies-error">{error}</div>}

        <div className="company-form">
          <div className="company-field">
            <label>Group</label>
            <select
              value={companyForm.group_id}
              onChange={(e) => updateCompany("group_id", e.target.value)}
            >
              <option value="">Select Group (optional)</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div className="company-field">
            <label>Company Legal Name *</label>
            <input
              value={companyForm.name}
              onChange={(e) => updateCompany("name", e.target.value)}
              placeholder="e.g. Manipal Health Enterprises Pvt Ltd"
            />
          </div>

          <div className="company-field">

          </div>

          <div className="company-field">
            <label>GST Number</label>
            <input
              value={companyForm.gst_number}
              onChange={(e) => updateCompany("gst_number", e.target.value)}
              placeholder="GST Number"
            />
          </div>

          <div className="company-field">
            <label>Company Logo</label>
            <input
              key={fileInputKey}
              type="file"
              accept="image/*"
              onChange={(e) => setCompanyLogoFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="company-field">
            <label>Type</label>
            <select
              value={companyForm.type}
              onChange={(e) => updateCompany("type", e.target.value)}
            >
              <option value="CORPORATE">CORPORATE</option>
              <option value="INDIVIDUAL">INDIVIDUAL</option>
              <option value="RWA">RWA</option>
            </select>
          </div>
          <button className="primary" onClick={handleCreateCompany} disabled={savingCompany}>
            {savingCompany ? "Saving..." : "Add Company"}
          </button>
        </div>
      </div>

      <div className="companies-card">
        <div className="companies-card-header">
          <div>
            <h3>Add Site</h3>
            <p>Site = physical location under a company.</p>
          </div>

        </div>

        {error && <div className="companies-error">{error}</div>}

        <div className="company-form">
          <div className="company-field">
            <label>Company *</label>
            <select
              value={siteForm.company_id}
              onChange={(e) => updateSite("company_id", e.target.value)}
            >
              <option value="">Select Company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="company-field">
            <label>Site Name *</label>
            <input
              value={siteForm.name}
              onChange={(e) => updateSite("name", e.target.value)}
              placeholder="e.g. Hebbal"
            />
          </div>

          <div className="company-field">
            <label>Address *</label>
            <input
              value={siteForm.address}
              onChange={(e) => updateSite("address", e.target.value)}
              placeholder="Street, building, area"
            />
          </div>

          <div className="company-field">
            <label>City</label>
            <input
              value={siteForm.city}
              onChange={(e) => updateSite("city", e.target.value)}
              placeholder="City"
            />
          </div>

          <div className="company-field">
            <label>State</label>
            <input
              value={siteForm.state}
              onChange={(e) => updateSite("state", e.target.value)}
              placeholder="State"
            />
          </div>
          <button className="primary" onClick={handleCreateSite} disabled={savingSite}>
            {savingSite ? "Saving..." : "Add Site"}
          </button>
        </div>
      </div>

      <div className="companies-card">
        <div className="companies-card-header">
          <div>
            <h3>Sites</h3>
            <p>{filteredSites.length} total</p>
          </div>
          <input
            className="company-search"
            placeholder="Search by group, company, site, or city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="companies-loading">Loading sites...</div>
        ) : (
          <div className="companies-table">
            {filteredSites.map((site) => {
              const addressParts = [site.address, site.city, site.state].filter(Boolean);
              return (
                <div key={site.id} className="companies-row">
                  <div className="company-mobile-card">
                    <div className="company-row">
                      <span className="label">Group</span>
                      <span className="value">{site.group_name || "-"}</span>
                    </div>

                    <div className="company-row">
                      <span className="label">Company</span>
                      <span className="value">{site.company_name || "-"}</span>
                    </div>

                    <div className="company-row">
                      <span className="label">Site</span>
                      <span className="value">{site.name || "-"}</span>
                    </div>

                    <div className="company-row">
                      <span className="label">Address</span>
                      <span className="value">{addressParts.join(", ") || "-"}</span>
                    </div>
                  </div>

                  <div className="status-cell">
                    <button
                      onClick={() =>
                        navigate(`/admin/sites/${site.id}/contacts`)
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
