import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import "./AdminCompanies.css";
import PlaceAutocomplete from "../components/maps/PlaceAutocomplete";
import {
  Map,
  AdvancedMarker,
  useMap
} from "@vis.gl/react-google-maps";
const defaultGroupForm = { name: "" };
const defaultCompanyForm = {
  group_id: "",
  name: "",
  gst_number: "",
  type: "CORPORATE",
};

//Site Form details Var 
const defaultSiteForm = {
  company_id: "",
  name: "",
  address: "",
  city: "",
  state: "",
  location_id: "",
  place_id: "",
  latitude: null,
  longitude: null,
  postal_code: "",
  country: "",
};

export default function AdminCompanies() {
  // State variables
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

  // Effect to handle window resize for responsive design
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    // Add event listener for window resize
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);


  // Function to load all groups, companies, and sites
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

  //mounting effect to load data on component mount
  useEffect(() => {
    loadAll();
  }, []);

  // Memoized filtered sites based on search query - search box
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

  const handlePlaceSelected = (place) => {
    updateSite("address", place.address);
    updateSite("city", place.city);
    updateSite("state", place.state);
    updateSite("postal_code", place.postalCode);
    updateSite("country", place.country);
    updateSite("place_id", place.placeId);
    updateSite("latitude", place.latitude);
    updateSite("longitude", place.longitude);
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
  name: siteForm.name,
  address: siteForm.address,
  city: siteForm.city,
  state: siteForm.state,
  postal_code: siteForm.postal_code,
  country: siteForm.country,
  latitude: siteForm.latitude,
  longitude: siteForm.longitude,
  place_id: siteForm.place_id,
};

console.log("Site payload:", payload);


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



  //map stuff

  const reverseGeocode = (lat, lng) => {
    console.log("Reverse geocode:", lat, lng);

    const geocoder = new google.maps.Geocoder();

    geocoder.geocode(
      { location: { lat, lng } },
      (results, status) => {
        console.log("Status:", status);
        console.log("Results:", results);

        if (status !== "OK" || !results?.length) return;

        const place = results[0];

        console.log("Formatted:", place.formatted_address);
        let city = "";
        let state = "";
        let postalCode = "";
        let country = "";

        place.address_components.forEach((component) => {
          if (component.types.includes("locality"))
            city = component.long_name;

          if (component.types.includes("administrative_area_level_1"))
            state = component.long_name;

          if (component.types.includes("postal_code"))
            postalCode = component.long_name;

          if (component.types.includes("country"))
            country = component.long_name;
        });

        setSiteForm((prev) => ({
          ...prev,
          address: place.formatted_address,
          city,
          state,
          postal_code: postalCode,
          country,
          latitude: lat,
          longitude: lng,
        }));
      }
    );
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

        <div className="site-layout">

          <div className="site-form">
            {/* select company  */}
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

              <PlaceAutocomplete
                value={siteForm.address}
                onPlaceSelected={handlePlaceSelected}
              />

              <button
                className="primary"
                onClick={handleCreateSite}
                disabled={savingSite}
                style={{ marginTop: 16 }}
              >
                {savingSite ? "Saving..." : "Add Site"}
              </button>
            </div>
          </div>

          <div className="site-map">

            <div style={{ width: 400 }}>
              <div
                style={{
                  width: "400px",
                  height: "300px",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <Map
                  mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
                  defaultZoom={15}
                  center={{
                    lat: siteForm.latitude || 12.9716,
                    lng: siteForm.longitude || 77.5946,
                  }}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                >
                  {siteForm.latitude && (
                    <AdvancedMarker
                      draggable
                      position={{
                        lat: siteForm.latitude,
                        lng: siteForm.longitude,
                      }}
                      onDragEnd={(e) => {
                        console.log("Dragged!");
                        console.log(e);

                        const lat = e.latLng?.lat();
                        const lng = e.latLng?.lng();
                        reverseGeocode(lat, lng);

                        console.log(lat, lng);
                      }}
                    />
                  )}
                </Map>
              </div>
            </div>
          </div>

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
